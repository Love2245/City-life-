import { describe, expect, it } from "vitest";
import { allNpcs } from "../src/game/core/npcs";
import { DIALOGUE_FALLBACK_REPLIES, NPC_DIALOGUE_REMASTER } from "../src/game/data/npcDialogueRemaster";
import { npcConversationExtraChoice } from "../src/game/data/npcDialogueData";
import { greetingScriptTexts } from "../src/game/data/npcGreetings";

/**
 * `addDanglingReplies` 为「问号结尾但源稿没写回答」的选项补的短应答。
 * 只有提问类选项允许落到这里；其余选项必须由源稿结构自行收束或续接。
 */
const FALLBACK_REPLIES = new Set(DIALOGUE_FALLBACK_REPLIES.map((text) => text.trim()));

const STAGES = ["meet", "acquaintance", "friend", "close_friend"] as const;

interface RawOption {
  label: string;
  next?: string;
  nextStage?: string;
  leave?: boolean;
  affinity?: number;
}

interface RawNode {
  id: string;
  text: string;
  options: RawOption[];
  speeches?: Array<{speakerId:string|null;text:string;portraitText?:string}>;
}

interface StageView {
  npcId: string;
  stageKey: string;
  nodes: Record<string, RawNode>;
}

function eachStage(visit: (stage: StageView) => void): void {
  for (const npc of allNpcs()) {
    if (!NPC_DIALOGUE_REMASTER[npc.id]) continue;
    for (const key of STAGES) {
      const stage = npc.talk?.[key];
      if (!stage) continue;
      visit({ npcId: npc.id, stageKey: key, nodes: stage.nodes as Record<string, RawNode> });
    }
  }
}

/** 落到兜底应答节点的选项清单，附带源稿语境分类。 */
function fallbackOrigins(): Array<{ where: string; label: string; affinity: number; question: boolean }> {
  const out: Array<{ where: string; label: string; affinity: number; question: boolean }> = [];
  eachStage(({ npcId, stageKey, nodes }) => {
    const isFallback = (id: string | undefined): boolean =>
      !!id && !!nodes[id] && FALLBACK_REPLIES.has(nodes[id].text.trim());
    for (const node of Object.values(nodes)) {
      for (const option of node.options) {
        if (!isFallback(option.next)) continue;
        out.push({
          where: `${npcId}/${stageKey}/${node.id}`,
          label: option.label,
          affinity: option.affinity ?? 0,
          question: /[?？]\s*$/.test(option.label),
        });
      }
    }
  });
  return out;
}

describe("v1.43 NPC 对话图完整性（M7 构建期校验）", () => {
  it("非提问选项不再落到兜底应答（源稿结构自行收束或续接）", () => {
    const offenders = fallbackOrigins().filter((o) => !o.question);
    const sample = offenders
      .slice(0, 12)
      .map((o) => `${o.where} [${o.affinity}] → 「${o.label}」`)
      .join("\n");
    expect(
      offenders,
      `仍有 ${offenders.length} 处非提问选项落到兜底应答，这些选项应改为「续接兄弟后续」或「自然收束」：\n${sample}`,
    ).toHaveLength(0);
  });

  it("提问类选项一定有可见回应（不出现「问了没人答」）", () => {
    const silent: string[] = [];
    eachStage(({ npcId, stageKey, nodes }) => {
      for (const node of Object.values(nodes)) {
        for (const option of node.options) {
          if (option.leave || !/[?？]\s*$/.test(option.label)) continue;
          if (!option.next && !option.nextStage) silent.push(`${npcId}/${stageKey}/${node.id} → 「${option.label}」`);
        }
      }
    });
    expect(silent, silent.slice(0, 20).join("\n")).toHaveLength(0);
  });

  it("兜底应答只来自策展短应答池，且与旧版空话彻底替换", () => {
    const bad: string[] = [];
    eachStage(({ npcId, stageKey, nodes }) => {
      for (const node of Object.values(nodes)) {
        const text = node.text.trim();
        if (/对方(点了点头|想了想)/.test(text)) bad.push(`${npcId}/${stageKey}/${node.id} 仍是旧版泛化应答`);
        if (!FALLBACK_REPLIES.has(text)) continue;
        if (/\[object|undefined|null|\{/.test(text)) bad.push(`${npcId}/${stageKey}/${node.id} 含占位符`);
      }
    });
    expect(bad, bad.slice(0, 20).join("\n")).toHaveLength(0);
  });

  it("选项指向的后续节点都存在；无后续的选项只允许是「自然收束」，不允许是提问", () => {
    const broken: string[] = [];
    eachStage(({ npcId, stageKey, nodes }) => {
      for (const node of Object.values(nodes)) {
        for (const option of node.options) {
          if (option.next && !nodes[option.next]) broken.push(`${npcId}/${stageKey}/${node.id} → 悬空 next ${option.next}`);
          // 无出口即「玩家说完这句，这段短对话自然结束」，属源稿设定；
          // 但提问类选项必须被回答（见上一条断言），所以这里不允许出现。
          if (!option.leave && !option.next && !option.nextStage && /[?？]\s*$/.test(option.label)) {
            broken.push(`${npcId}/${stageKey}/${node.id} → 提问无出口「${option.label}」`);
          }
        }
      }
    });
    expect(broken, broken.slice(0, 20).join("\n")).toHaveLength(0);
  });

  it("台词不含残留占位符与解析泄漏", () => {
    const dirty: string[] = [];
    eachStage(({ npcId, stageKey, nodes }) => {
      for (const node of Object.values(nodes)) {
        const text = node.text;
        if (/NPC台词：/.test(text)) dirty.push(`${npcId}/${stageKey}/${node.id} 泄漏「NPC台词：」`);
        if (/。。|，，|！！|？？/.test(text)) dirty.push(`${npcId}/${stageKey}/${node.id} 重复标点`);
        if (/\{topic\}|\{npc\}/.test(text)) dirty.push(`${npcId}/${stageKey}/${node.id} 未替换占位符`);
        const npcText = node.speeches ? node.speeches.filter(s => s.speakerId === npcId).map(s => s.portraitText ?? s.text).join('\n') : text;
        if (/（[^）]*你[坐站躺靠蹲][^）]*）/.test(npcText)) dirty.push(`${npcId}/${stageKey}/${node.id} NPC发言混入第二人称旁白`);
        for (const option of node.options) {
          if (/好感|【离开/.test(option.label)) dirty.push(`${npcId}/${stageKey}/${node.id} 选项残留解析标记`);
        }
      }
    });
    expect(dirty, dirty.slice(0, 20).join("\n")).toHaveLength(0);
  });

  it("第三选项模板对任意话题都能读通（T1：不产生介词叠字病句）", () => {
    const bad: string[] = [];
    for (const npc of allNpcs()) {
      for (const stageKey of STAGES) {
        for (let index = 0; index < 5; index++) {
          const text = npcConversationExtraChoice(npc.id, stageKey, index);
          const where = `${npc.id}/${stageKey}/${index}`;
          if (/\{topic\}/.test(text)) bad.push(`${where} 未替换话题：${text}`);
          if (/(把把|让让|给给|跟跟|对对|问向|从从|向向|为为|和和)/.test(text)) bad.push(`${where} 介词叠字：${text}`);
          if (/。。|，，|！！|？？/.test(text)) bad.push(`${where} 重复标点：${text}`);
        }
      }
    }
    expect(bad, bad.slice(0, 12).join("\n")).toHaveLength(0);
  });
});

describe("v1.43 每日首次问候脚本（文本规范）", () => {
  it("问候台词与回应选项符合项目文本规范", () => {
    const bad: string[] = [];
    for (const { key, text, reply } of greetingScriptTexts()) {
      if (/…+|\.{2,}|。{2,}|，，|！！|？？/.test(text)) bad.push(`${key} 停顿号 / 重复标点：「${text}」`);
      if (/（）|（[^）]*你[坐站躺靠蹲][^）]*）/.test(text)) bad.push(`${key} 括号空或含第二人称动作描写：「${text}」`);
      if (/\{topic\}|\{npc\}|NPC台词：|undefined/.test(text)) bad.push(`${key} 含占位符或解析泄漏`);
      if (!reply.trim()) bad.push(`${key} 缺少回应选项文案`);
      if (/…+|\.{2,}/.test(reply)) bad.push(`${key} 选项含停顿号：「${reply}」`);
    }
    expect(bad, bad.slice(0, 10).join("\n")).toHaveLength(0);
  });

  it("每位 NPC 都备了深夜问候，深夜撞见不会无话可说", () => {
    const lateKeys = new Set(greetingScriptTexts().filter((t) => t.key.endsWith("/late")).map((t) => t.key));
    const missing = allNpcs()
      .filter((npc) => !npc.dialoguePlaceholder)
      .map((npc) => npc.id)
      .filter((id) => !lateKeys.has(`${id}/late`));
    expect(missing, `缺少深夜问候：${missing.join(", ")}`).toHaveLength(0);
  });
});
