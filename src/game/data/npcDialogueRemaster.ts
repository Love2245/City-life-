/**
 * NPC 对话重制稿的运行时数据适配层。
 *
 * 正文保存在项目根目录的「npc对话修正.txt」：便于策划直接审阅和迭代；
 * 本文件将初见、日常、独立话题与保留的成长故事转换成节点图。
 * 作者的地点与关系标注只作为元数据，不进入对白。
 */
import sourceText from "../../../npc对话修正.txt?raw";
import type { ConversationEffects, GameState } from "../types";
import { gameDay, weekdayOf } from "../core/calendar";
import itemsData from "./items.json";
import npcData from "./npcs.json";
import {attachLiteraryDialogueBenefits} from './npcDialogueBenefits';
import type {
  NpcTalkNode,
  NpcTalkOption,
  NpcTalkStage,
  NpcTalkStageKey,
} from "../core/npcs";

export type NpcRemasterSceneKind = "meet" | "daily" | "event" | "topic";

export interface NpcRemasterProfile {
  descriptor?: string;
  familiar?: string;
  known?: string;
  desc?: string;
  metText?: string;
}

export interface NpcRemasterScene {
  id: string;
  kind: NpcRemasterSceneKind;
  stageKey: NpcTalkStageKey;
  startNodeId: string;
  title: string;
  conditionText?: string;
  /** Literary reset dialogue is split across the four authored relationship bands. */
  minAffinity?: number;
  maxAffinity?: number;
  /** One-time social scenes still belong to casual chat and consume its daily limit. */
  casualChat?: boolean;
  channel?: "chat" | "formal";
  locationId?: string;
  /** 普通生活片段可在别处作为见闻讲述；不放宽私事、故事或天气条件。 */
  retellable?: boolean;
  /** 已完成旧故事时，这段旧草稿改作回顾，故事状态不回退。 */
  retrospectiveAfter?: string;
  conditions: NpcRemasterCondition[];
  reward?: { itemId: string; text: string };
}

/** 每个特殊场景的明确定义；连续计数只记录已经成功结算的互动或动作。 */
export type NpcRemasterCondition =
  | { type: "streak"; counter: "visits" | "rain" | "quiet" | "passive" | "weekend" | "closing" | "flower" | "sameDish" | "farmHelp"; count: number }
  | { type: "rainNow" }
  | { type: "weekendNow" }
  | { type: "timeRange"; start: number; end: number }
  | { type: "location"; locationId: string }
  | { type: "nonPeak" }
  | { type: "eventAny"; eventIds: string[] }
  | { type: "eventAll"; eventIds: string[] }
  | { type: "eventNotSeen"; eventIds: string[] }
  | { type: "dailySeen"; sceneIds: string[] }
  | { type: "crossEventAll"; events: Array<{ npcId: string; eventId: string }> }
  | { type: "eventDayGap"; eventId: string; days: number }
  | { type: "rainCleared"; minimumRainTalks: number }
  | { type: "flag"; key: string }
  | { type: "foodGifted" };

export interface NpcRemasterEventConditionDefinition {
  stageKey: Exclude<NpcTalkStageKey, "meet">;
  conditions: NpcRemasterCondition[];
}

export interface NpcRemasterData {
  profile: NpcRemasterProfile;
  talk: Partial<Record<NpcTalkStageKey, NpcTalkStage>>;
  scenes: Record<string, NpcRemasterScene>;
  dailySceneIds: Partial<Record<Exclude<NpcTalkStageKey, "meet">, string[]>>;
  meetSceneId?: string;
}

export interface NpcRemasterStart {
  sceneId: string;
  kind: NpcRemasterSceneKind;
  stageKey: NpcTalkStageKey;
  nodeId: string;
  title: string;
}

/**
 * 条件满足的特殊事件直接进入候选池。
 * v1.46 将条件事件改为确定可达：玩家完成条件后不会再被一次随机抽签挡住。
 */
export const NPC_SPECIAL_EVENT_CHANCE = 1;

type NodeDraft = {
  node: NpcTalkNode;
  inlineNotes: Array<string | undefined>;
};

type PendingBranch = {
  parent: NodeDraft;
  condition: string;
};

const STAGE_ORDER: Record<NpcTalkStageKey, number> = {
  meet: 0,
  acquaintance: 1,
  friend: 2,
  close_friend: 3,
};

const DAILY_STAGES: Exclude<NpcTalkStageKey, "meet">[] = [
  "acquaintance",
  "friend",
  "close_friend",
];

/**
 * 37 个特殊剧情全部显式列出好感门槛和行为条件。
 * 场景 ID 沿用源稿的事件字母；赵刚前三个标题是自定义条件场景，故编号为 event_4–6。
 */
export const NPC_REMASTER_EVENT_CONDITION_DEFINITIONS: Record<string, NpcRemasterEventConditionDefinition> = {
  "npc_lin_xiaoyu:event_1": { stageKey: "friend", conditions: [{ type: "location", locationId: "cafe" }, { type: "streak", counter: "visits", count: 3 }] },
  "npc_lin_xiaoyu:event_2": { stageKey: "close_friend", conditions: [{ type: "rainNow" }] },
  "npc_lin_xiaoyu:event_3": { stageKey: "close_friend", conditions: [{ type: "streak", counter: "quiet", count: 5 }] },

  "npc_zhao_gang:event_a": { stageKey: "acquaintance", conditions: [] },
  "npc_zhao_gang:event_b": { stageKey: "friend", conditions: [] },
  "npc_zhao_gang:event_c": {
    stageKey: "friend",
    conditions: [{ type: "eventAny", eventIds: ["event_a", "event_b"] }],
  },
  "npc_zhao_gang:event_4": { stageKey: "friend", conditions: [{ type: "location", locationId: "labor_market" }, { type: "rainNow" }, { type: "streak", counter: "rain", count: 3 }] },
  "npc_zhao_gang:event_5": { stageKey: "close_friend", conditions: [{ type: "foodGifted" }] },
  "npc_zhao_gang:event_6": { stageKey: "close_friend", conditions: [{ type: "streak", counter: "passive", count: 5 }] },
  "npc_zhao_gang:event_c_followup_1": { stageKey: "friend", conditions: [{ type: "eventAll", eventIds: ["event_c"] }] },

  "npc_chen_jie:event_a": { stageKey: "friend", conditions: [] },
  "npc_chen_jie:event_b": { stageKey: "close_friend", conditions: [{ type: "location", locationId: "fast_food" }, { type: "nonPeak" }] },
  "npc_chen_jie:event_c": { stageKey: "friend", conditions: [{ type: "location", locationId: "fast_food" }, { type: "rainNow" }, { type: "nonPeak" }] },

  "npc_wang_lei:event_a": {
    stageKey: "friend",
    conditions: [{ type: "location", locationId: "park" }, { type: "timeRange", start: 6, end: 9 }],
  },
  "npc_wang_lei:event_b": {
    stageKey: "close_friend",
    conditions: [{ type: "location", locationId: "park" }, { type: "weekendNow" }, { type: "streak", counter: "weekend", count: 3 }],
  },
  "npc_wang_lei:event_c": { stageKey: "close_friend", conditions: [{ type: "eventAll", eventIds: ["event_a"] }] },

  "npc_netbar_boss:event_a": { stageKey: "friend", conditions: [] },
  "npc_netbar_boss:event_b": { stageKey: "close_friend", conditions: [] },
  "npc_netbar_boss:event_c": {
    stageKey: "close_friend",
    conditions: [{ type: "location", locationId: "internet_cafe" }, { type: "timeRange", start: 3, end: 4 }],
  },

  "npc_librarian:event_a": { stageKey: "friend", conditions: [] },
  "npc_librarian:event_b": { stageKey: "close_friend", conditions: [] },
  "npc_librarian:event_c": {
    stageKey: "close_friend",
    conditions: [
      { type: "location", locationId: "library" },
      { type: "timeRange", start: 21, end: 22 },
      { type: "streak", counter: "closing", count: 3 },
    ],
  },

  "npc_flower_market_owner:event_a": { stageKey: "friend", conditions: [] },
  "npc_flower_market_owner:event_b": { stageKey: "close_friend", conditions: [] },
  "npc_flower_market_owner:event_c": { stageKey: "close_friend", conditions: [{ type: "streak", counter: "flower", count: 3 }] },

  "npc_snack_street_vendor:event_a": { stageKey: "friend", conditions: [] },
  "npc_snack_street_vendor:event_b": { stageKey: "close_friend", conditions: [] },
  "npc_snack_street_vendor:event_c": { stageKey: "close_friend", conditions: [{ type: "streak", counter: "sameDish", count: 3 }] },

  "npc_suburb_farmer:event_a": { stageKey: "friend", conditions: [{ type: "location", locationId: "farm" }, { type: "rainNow" }] },
  "npc_suburb_farmer:event_b": { stageKey: "close_friend", conditions: [] },
  "npc_suburb_farmer:event_c": { stageKey: "close_friend", conditions: [{ type: "location", locationId: "farm" }, { type: "streak", counter: "farmHelp", count: 3 }] },
};

/** 供成功动作入口复用；调用方只能在操作确认成功后调用。 */
export type NpcRemasterActionRecord =
  | { kind: "food_gift"; npcId: string; itemId: string }
  | { kind: "snack_order"; itemId: string }
  | { kind: "flower_market_purchase"; actionId: string; itemId: string }
  | { kind: "work_completed"; jobId: string; workedMinutes: number };



function trimMarkdown(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\s{2,}$/g, "")
    .trim();
}

/**
 * 整理对白中的占位省略号。
 *
 * 修订稿里「……」既被用作停顿，也被用作段落连接符；全部删除会把
 * 「就是……想问问」拼成不自然的硬切，因此统一换成一个中文逗号，
 * 再清理句首多余标点。
 */
function normalizeDialoguePunctuation(value: string): string {
  return value
    .replace(/(?:\.{2,}|…+|。{2,})/g, "，")
    .replace(/，{2,}/g, "，")
    .replace(/^[，、。！？!?]+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([，。！？、])/g, "$1")
    .replace(/，(?=[。！？])/g, "")
    .replace(/。(?=[，、])/g, "")
    .replace(/）[，、]/g, "）")
    .trim();
}

/**
 * 对白括号只保留短促、可直接演出的动作；长段心理描写、第二人称
 * 视角和“停顿后才开口”之类的导演说明不再挤进对话框。
 */
function normalizeDialogueActions(value: string): string {
  return value.replace(/（([^（）]*)）/g, (_full, raw: string) => {
    const action = normalizeDialoguePunctuation(raw).replace(/[。！？]+$/g, "").trim();
    if (!action) return "";

    // 只保留能直接演出的短动作。原稿中不少动作带有“她看见你，…”
    // 之类的主语和铺垫，直接整段删除会让纯动作节点变成空台词；拆成
    // 短分句后取第一段明确动作，既不暴露上帝视角，也不会吞掉整条对白。
    const basicAction = /^(?:点(?:了点|了下)?头|摇(?:了摇)?头|低头|抬头|起身|坐下|站起|站着|笑|叹气|停(?:下|了一下)?|看了一眼|看着|转身|摆摆手|伸手|递|拿起|放下|喝|合上|打开|收回|拍|耸肩|沉默|愣|想了想|摸|擦|指了指|蹲下|靠回|回头|瞪|哼|哈哈大笑|轻轻|挪|往.{0,8}挪|把|将|翻|戴|画|推|清|揉|敲|收拾|背|写|捡)/;
    const clauses = action.split(/[，,。！？；;]+/).map((part) => part.trim()).filter(Boolean);
    const candidate = clauses
      .map((part) => part.replace(/^(?:她|他|你|对方|阿城|小林|陈姐|王叔|王磊)/, "").trim())
      .find((part) => basicAction.test(part) && part.length <= 18);
    return candidate ? `（${candidate}。）` : "";
  }).replace(/[ \t]{2,}/g, " ").trim();
}

function sceneStageForDaily(index: number): Exclude<NpcTalkStageKey, "meet"> {
  if (index <= 12) return "acquaintance";
  return index <= 19 ? "friend" : "close_friend";
}

function linesOf(value: string): string[] {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function isBoundary(line: string): boolean {
  const value = line.trim();
  return value.startsWith("NPC台词：")
    || value.startsWith("玩家选项：")
    || value.startsWith("→")
    || /^#{2,4}\s/.test(value)
    || /^\*\*D\d+/.test(value)
    || value.startsWith("**相遇结束")
    || value.startsWith("**获得物品")
    || value.startsWith("【系统备注");
}

function readDialogue(lines: string[], start: number): { text: string; next: number } {
  const visiblePart = (line: string): string => {
    const clean = normalizeDialoguePunctuation(normalizeDialogueActions(trimMarkdown(line)));
    if (clean) return clean;
    const raw = trimMarkdown(line);
    // 纯动作（特别是部分 D20 节点）不能因为动作筛选器没认出动词而丢失。
    // 台词仍逐字取自源稿，仅规范标点，并保留原有括号，不补写对白。
    return /^（[\s\S]*）$/.test(raw) ? normalizeDialoguePunctuation(raw) : "";
  };
  const parts = [visiblePart(lines[start].trim().replace(/^NPC台词：/, ""))];
  let next = start + 1;
  while (next < lines.length) {
    const raw = lines[next];
    const value = trimMarkdown(raw);
    if (isBoundary(raw)) break;
    if (value) parts.push(visiblePart(value));
    next += 1;
  }
  return { text: parts.filter(Boolean).join("\n"), next };
}

function parseChoice(raw: string): { option: NpcTalkOption; inlineNote?: string } | null {
  const value = trimMarkdown(raw);
  const numbered = value.match(/^(\d+)\.\s*(.+)$/);
  if (!numbered) return null;
  const body = normalizeDialoguePunctuation(numbered[2]);
  const leave = body.includes("【离开");
  const withoutLeaveNote = body.replace(/【离开[^】]*】/g, "").trim();
  if (leave) return { option: { label: withoutLeaveNote, leave: true } };
  // 修订稿有两种写法：
  //   （好感 +1）
  //   （好感 -1。她先愣了一下，然后笑出来）
  // 第二种把即时反应也写在括号里，因此不能只认逗号分隔。
  const affinity = withoutLeaveNote.match(/\s*（好感\s*([+-]?\d+)(?:[，,。；;]\s*(.*?))?）\s*$/);
  if (!affinity) return { option: { label: withoutLeaveNote, affinity: 0 } };
  const label = withoutLeaveNote.slice(0, affinity.index).trim();
  return {
    // 修订稿中未加【离开】、但明确说「我先走了」的选项，同样按离开处理；
    // 它们保留自身好感变化，能在结算页准确反映这次告别。
    option: {
      label,
      affinity: Number(affinity[1]),
      leave: /(?:^|[，。])(?:那我|我)(?:先|得)?走了/.test(label) || undefined,
    },
    inlineNote: affinity[2]?.trim(),
  };
}

/**
 * 策划稿中的系统备注仍然属于上一条回答，而不是一段要展示给玩家的台词。
 * 目前修订稿使用了「帮助日志｜帮助奖励」这一种写法；在这里转换为既有的
 * help/reward 结构，继续走会话的原子结算与每日限制。
 */
function applySystemNote(option: NpcTalkOption, raw: string): void {
  const note = trimMarkdown(raw)
    .replace(/^【系统备注：?/, "")
    .replace(/】$/, "")
    .trim();
  const log = note.match(/帮助日志：\s*([^｜]+)/)?.[1]?.trim();
  const rewardText = note.match(/帮助奖励：\s*(.+)$/)?.[1]?.trim();
  if (!log && !rewardText) return;

  const reward: ConversationEffects = {};
  for (const key of ["money", "stamina", "health", "mood", "hygiene", "satiety", "intelligence", "charm", "fitness", "fame", "stress"] as const) {
    const match = rewardText?.match(new RegExp(`${key}\\s*=\\s*([+-]?\\d+)`, "i"));
    if (match) (reward as Record<string, unknown>)[key] = Number(match[1]);
  }
  const skillsMatch = rewardText?.match(/skills\s*=\s*(\{[^}]+\})/i);
  if (skillsMatch) {
    try {
      const skills = JSON.parse(skillsMatch[1]) as ConversationEffects["skills"];
      if (skills && typeof skills === "object") reward.skills = skills;
    } catch {
      // 文案中技能对象写错时，宁可忽略该字段，也不能让整个对话数据失效。
    }
  }

  option.help = {
    log: log ?? "你记下了对方提供的帮助。",
    reward: Object.keys(reward).length > 0 ? reward : undefined,
  };
}

function readChoices(lines: string[], start: number): {
  options: NpcTalkOption[];
  inlineNotes: Array<string | undefined>;
  next: number;
} {
  const options: NpcTalkOption[] = [];
  const inlineNotes: Array<string | undefined> = [];
  let next = start + 1;
  while (next < lines.length) {
    const raw = lines[next];
    const value = raw.trim();
    if (!value) {
      next += 1;
      continue;
    }
    if (value.startsWith("【系统备注")) {
      const previous = options[options.length - 1];
      if (previous) applySystemNote(previous, value);
      next += 1;
      continue;
    }
    const parsed = parseChoice(raw);
    if (!parsed) break;
    options.push(parsed.option);
    inlineNotes.push(parsed.inlineNote);
    next += 1;
  }
  return { options, inlineNotes, next };
}

function conditionIndexes(condition: string, options: NpcTalkOption[]): number[] {
  const normalized = trimMarkdown(condition)
    .replace(/^→\s*/, "")
    .replace(/^若\s*/, "")
    .replace(/[：:]+$/, "");
  if (/无论|所有|不管/.test(normalized)) return options.map((_, index) => index);

  const numbers = [...normalized.matchAll(/\d+/g)]
    .map((match) => Number(match[0]) - 1)
    .filter((index) => index >= 0 && index < options.length);
  if (numbers.length > 0) return [...new Set(numbers)];

  // 「若告诉她名字」「若数出来少了二十」这类条件直接复用了选项中的
  // 关键短语。先去掉引号和标点进行整句匹配，避免误把所有回答都接入分支。
  const compact = normalized.replace(/[“”"'‘’（）()，,。！？!?\s]/g, "");
  if (compact.length >= 2) {
    const direct = options
      .map((option, index) => ({
        index,
        value: option.label.replace(/[“”"'‘’（）()，,。！？!?\s]/g, ""),
      }))
      .filter(({ value }) => value.length >= 2 && (value.includes(compact) || compact.includes(value)))
      .map(({ index }) => index);
    if (direct.length > 0) return direct;
  }

  const words = normalized
    .replace(/^选\s*/, "")
    .replace(/或|或者|和|及/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const matches = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => words.some((word) => option.label.includes(word)))
    .map(({ index }) => index);
  return matches;
}

function inlineReply(note: string): string {
  // 选项备注里的引号内容才是 NPC 真正会说的话；其余策划备注不再被
  // 错当成一整句括号旁白显示出来。
  const quote = note.match(/[“\"]([^”\"]+)[”\"]/);
  if (!quote) return "";
  const reply = normalizeDialoguePunctuation(quote[1]);
  if (!reply) return "";
  return /[。！？!?]$/.test(reply) ? reply : `${reply}。`;
}

function addTerminalOption(draft: NodeDraft): void {
  if (draft.node.options.length > 0) return;
  // 结束节点不再伪造主角的「我明白了」；这是界面上的结束操作，不会
  // 进入主角发言阶段。
  draft.node.options.push({ label: "结束交流", affinity: 0, leave: true });
  draft.inlineNotes.push(undefined);
}

function addInlineReplies(drafts: NodeDraft[], sceneId: string): void {
  const extra: NodeDraft[] = [];
  for (const draft of drafts) {
    draft.inlineNotes.forEach((note, index) => {
      const option = draft.node.options[index];
      if (!note || !option || option.next || option.nextStage || option.leave) return;
      const reply = inlineReply(note);
      if (!reply) return;
      const nodeId = `${sceneId}_n${drafts.length + extra.length + 1}`;
      option.next = nodeId;
      extra.push({
        node: {
          id: nodeId,
          text: reply,
          options: [{ label: "结束交流", affinity: 0, leave: true }],
        },
        inlineNotes: [undefined],
      });
    });
  }
  drafts.push(...extra);
}

/**
 * 提问类悬空选项的短应答。
 * 源稿对这些「问号结尾但没写回答」的选项漏了回应，这里用一句简洁、不抢戏的收束式回答兜底，
 * 保证玩家提问后 NPC 一定给出可见回应，而不是「问完空气凝固、对话直接关闭」。
 * 导出供构建期审计与回归测试识别兜底节点。
 */
export const DIALOGUE_FALLBACK_REPLIES: readonly string[] = [
  "（想了想。）这个啊，一两句讲不清，回头细说。",
  "（笑了一下。）你问得比我还细。",
  "（手上的活没停。）嗯，大概就是这么回事。",
  "（抬眼看了你一下。）这问题得想想，别催我。",
  "（把杯子往旁边挪了挪。）先记着，下次接着说。",
  "（皱了皱眉。）不好说，得看情况。",
  "（点了点头。）嗯，你说得也有道理。",
  "（顿了两秒。）真要讲起来，话就长了。",
  "（摇了摇头。）这个我还真答不上来。",
  "（把手里的东西放下。）你倒是提醒我了。",
  "（看了你一眼。）这事没有标准答案。",
  "（想了想。）得看你怎么想。",
  "（笑出声。）你还真敢问。",
  "这话我记下了，回头有空再跟你细讲。",
  "嗯，我想想怎么跟你说比较清楚。",
  "说出来能懂的就那么几句，剩下的你自己也会碰到。",
];

/** 用节点 id 做确定性取模，保证同一份数据每次解析得到同一句应答（读档回放可复现）。 */
function fallbackReplyFor(nodeId: string): string {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) hash = (hash * 31 + nodeId.charCodeAt(i)) >>> 0;
  return DIALOGUE_FALLBACK_REPLIES[hash % DIALOGUE_FALLBACK_REPLIES.length];
}

/**
 * 条件分支没有覆盖到的选项按源稿语境收束（v1.43 修正）。
 *
 * 源稿的日常池设定是「有的很短，一两句就结束」「不强行衔接，不强行展开」，
 * 所以这里区分三种情况，而不是一律塞一个多余回合：
 * - **提问类**（问号结尾）：源稿漏写了回答 → 补一句短应答，避免「问了没人答」；
 * - **同节点已有兄弟选项接到后续**：这些选项沿同一后续推进，别把对话硬生生截断；
 * - **玩家在退缩（负好感）或该节点本就没有后续**：对话自然收束，不再插入
 *   「对方点了点头」这类既多余又机械的空回合。
 */
function addDanglingReplies(drafts: NodeDraft[], sceneId: string): void {
  const extra: NodeDraft[] = [];
  for (const draft of drafts) {
    const siblingNext = draft.node.options.find(
      (option) => !option.leave && !!option.next && !option.nextStage,
    )?.next;
    for (const option of draft.node.options) {
      if (option.leave || option.next || option.nextStage) continue;
      if (/[?？]\s*$/.test(option.label)) {
        const nodeId = `${sceneId}_n${drafts.length + extra.length + 1}`;
        option.next = nodeId;
        extra.push({
          node: {
            id: nodeId,
            text: fallbackReplyFor(nodeId),
            options: [{ label: "结束交流", affinity: 0, leave: true }],
          },
          inlineNotes: [undefined],
        });
        continue;
      }
      if ((option.affinity ?? 0) < 0 || !siblingNext) continue;
      option.next = siblingNext;
    }
  }
  drafts.push(...extra);
}

function parseScene(
  raw: string,
  sceneId: string,
  _kind: NpcRemasterSceneKind,
): { startNodeId?: string; nodes: NpcTalkNode[] } {
  const lines = linesOf(raw);
  const drafts: NodeDraft[] = [];
  let current: NodeDraft | null = null;
  let lastChoiceNode: NodeDraft | null = null;
  let pending: PendingBranch | null = null;

  for (let cursor = 0; cursor < lines.length;) {
    const value = lines[cursor].trim();
    if (value.startsWith("NPC台词：")) {
      const dialogue = readDialogue(lines, cursor);
      if (!dialogue.text) {
        cursor = dialogue.next;
        continue;
      }
      const draft: NodeDraft = {
        node: { id: `${sceneId}_n${drafts.length + 1}`, text: dialogue.text, options: [] },
        inlineNotes: [],
      };
      if (pending) {
        const branch = pending;
        const indexes = conditionIndexes(branch.condition, branch.parent.node.options);
        const targets = indexes.length > 0
          ? indexes
          : branch.parent.node.options.map((_, index) => index).filter((index) => !branch.parent.node.options[index].next);
        for (const index of targets) branch.parent.node.options[index].next = draft.node.id;
        pending = null;
      } else if (lastChoiceNode && drafts.length > 0) {
        const free = lastChoiceNode.node.options.filter((option) => !option.next && !option.nextStage && !option.leave);
        if (free.length === lastChoiceNode.node.options.length) {
          for (const option of free) option.next = draft.node.id;
        }
      }
      drafts.push(draft);
      current = draft;
      cursor = dialogue.next;
      continue;
    }
    if (value.startsWith("玩家选项：")) {
      if (!current) {
        cursor += 1;
        continue;
      }
      const choices = readChoices(lines, cursor);
      current.node.options = choices.options;
      current.inlineNotes = choices.inlineNotes;
      lastChoiceNode = current;
      cursor = choices.next;
      continue;
    }
    if (value.startsWith("→")) {
      const parent = lastChoiceNode ?? current;
      if (parent) pending = { parent, condition: value };
      cursor += 1;
      continue;
    }
    cursor += 1;
  }

  for (const draft of drafts) addTerminalOption(draft);
  addInlineReplies(drafts, sceneId);
  addDanglingReplies(drafts, sceneId);

  return { startNodeId: drafts[0]?.node.id, nodes: drafts.map((draft) => draft.node) };
}

function extractProfile(chunk: string): NpcRemasterProfile {
  const identity = chunk.match(/^初见显示：.*?身份描述：([^｜\n]+)｜相识称呼：([^｜\n]+)｜朋友及以上：([^\n]+)$/m);
  const desc = chunk.match(/^人物资料：\s*([\s\S]*?)(?=^核心性格：|^说话特点：|^关系建立提示：|^##\s)/m)?.[1]
    ?.split("\n")
    .map(trimMarkdown)
    .filter(Boolean)
    .join(" ");
  const metText = chunk.match(/^关系建立提示：\s*([\s\S]*?)(?=^##\s)/m)?.[1]
    ?.split("\n")
    .map(trimMarkdown)
    .filter(Boolean)
    .join(" ");
  return {
    descriptor: identity?.[1]?.trim(),
    familiar: identity?.[2]?.trim(),
    known: identity?.[3]?.trim(),
    desc,
    metText,
  };
}

function between(value: string, heading: RegExp, boundaries: RegExp[]): string {
  const found = heading.exec(value);
  if (!found || found.index === undefined) return "";
  const start = found.index + found[0].length;
  const tail = value.slice(start);
  let end = tail.length;
  for (const boundary of boundaries) {
    const match = boundary.exec(tail);
    if (match?.index !== undefined) end = Math.min(end, match.index);
  }
  return tail.slice(0, end);
}

function eventCondition(title: string, content: string): string {
  const explicit = content.match(/(?:\*\*)?触发条件：(?:\*\*)?\s*([^\n]+)/)?.[1];
  if (explicit) return trimMarkdown(explicit);
  if (title.startsWith("触发条件：")) return title.replace(/^触发条件：/, "").trim();
  return "好感度达到“朋友”后，随机触发";
}

function eventKey(title: string, index: number): string {
  const letter = title.match(/^事件([A-Z])/i)?.[1]?.toLowerCase();
  if (letter) return `event_${letter}`;
  return `event_${index + 1}`;
}

function eventMeta(
  npcId: string,
  id: string,
  title: string,
  conditionText: string,
  startNodeId: string,
  content: string,
): NpcRemasterScene {
  const definition = NPC_REMASTER_EVENT_CONDITION_DEFINITIONS[`${npcId}:${id}`];
  if (!definition) throw new Error(`Missing explicit NPC remaster event condition: ${npcId}:${id}`);
  return {
    id,
    kind: "event",
    stageKey: definition.stageKey,
    startNodeId,
    title,
    conditionText,
    conditions: definition.conditions,
    reward: npcId === "npc_lin_xiaoyu" && content.includes("林小雨的速写本")
      ? { itemId: "lin_xiaoyu_sketchbook", text: "获得了林小雨的速写本" }
      : undefined,
  };
}

function parseLegacyRemasterData(raw: string): Record<string, NpcRemasterData> {
  const markers = [...raw.matchAll(/^#\s+\d+．.+?（([^）]+)）\s*$/gm)];
  const result: Record<string, NpcRemasterData> = {};

  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex];
    const npcId = marker[1];
    if (!npcData.some((npc) => npc.id === npcId)) continue;
    const start = marker.index ?? 0;
    const end = markers[markerIndex + 1]?.index ?? raw.length;
    const chunk = raw.slice(start, end);
    const profile = extractProfile(chunk);
    const stageNodes: Record<NpcTalkStageKey, Record<string, NpcTalkNode>> = {
      meet: {}, acquaintance: {}, friend: {}, close_friend: {},
    };
    const stageStarts: Partial<Record<NpcTalkStageKey, string>> = {};
    const scenes: Record<string, NpcRemasterScene> = {};
    const dailySceneIds: NpcRemasterData["dailySceneIds"] = {};

    const meetContent = between(chunk, /^##\s+初见\s*$/m, [/^##\s+日常/m, /^##\s+特殊/m]);
    const meetId = "meet";
    const meet = parseScene(meetContent, `${npcId}_${meetId}`, "meet");
    if (meet.startNodeId) {
      for (const node of meet.nodes) stageNodes.meet[node.id] = node;
      stageStarts.meet = meet.startNodeId;
      scenes[meetId] = {
        id: meetId,
        kind: "meet",
        stageKey: "meet",
        startNodeId: meet.startNodeId,
        title: "首次相遇",
        conditions: [],
      };
    }

    const dailyContent = between(chunk, /^##\s+日常[^\n]*$/m, [/^##\s+特殊/m]);
    const dailyMarkers = [...dailyContent.matchAll(/^\*\*D(\d+)｜[^\n]*\*\*\s*$/gm)];
    for (let index = 0; index < dailyMarkers.length; index += 1) {
      const marker = dailyMarkers[index];
      const number = Number(marker[1]);
      const stageKey = sceneStageForDaily(number);
      const sceneId = `daily_${stageKey}_d${number}`;
      const entryStart = (marker.index ?? 0) + marker[0].length;
      const entryEnd = dailyMarkers[index + 1]?.index ?? dailyContent.length;
      const scene = parseScene(dailyContent.slice(entryStart, entryEnd), `${npcId}_${sceneId}`, "daily");
      if (!scene.startNodeId) continue;
      for (const node of scene.nodes) stageNodes[stageKey][node.id] = node;
      stageStarts[stageKey] ??= scene.startNodeId;
      dailySceneIds[stageKey] ??= [];
      dailySceneIds[stageKey].push(sceneId);
      scenes[sceneId] = {
        id: sceneId,
        kind: "daily",
        stageKey,
        startNodeId: scene.startNodeId,
        title: `日常对话 D${number}`,
        conditions: [],
      };
    }

    const specialSections = [...chunk.matchAll(/^##\s+特殊(?:事件|对话)?[^\n]*$/gm)];
    let eventIndex = 0;
    for (let specialIndex = 0; specialIndex < specialSections.length; specialIndex += 1) {
      const section = specialSections[specialIndex];
      const sectionStart = (section.index ?? 0) + section[0].length;
      const nextSection = specialSections[specialIndex + 1]?.index ?? chunk.length;
      const specialContent = chunk.slice(sectionStart, nextSection);
      const eventMarkers = [...specialContent.matchAll(/^###\s+(.+?)\s*$/gm)];
      for (let localIndex = 0; localIndex < eventMarkers.length; localIndex += 1) {
        const eventMarker = eventMarkers[localIndex];
        const title = trimMarkdown(eventMarker[1]);
        const contentStart = (eventMarker.index ?? 0) + eventMarker[0].length;
        const contentEnd = eventMarkers[localIndex + 1]?.index ?? specialContent.length;
        const eventContent = specialContent.slice(contentStart, contentEnd);
        const key = eventKey(title, eventIndex);
        const followups = [...eventContent.matchAll(/^####\s+(.+?)\s*$/gm)];
        // #### 是「主事件完成后才可能发生」的独立续篇，不能被主事件的
        // 节点图一起吞掉，否则会出现无条件串场或孤立选项。
        const primaryContent = eventContent.slice(0, followups[0]?.index ?? eventContent.length);
        const parsed = parseScene(primaryContent, `${npcId}_${key}`, "event");
        eventIndex += 1;
        if (!parsed.startNodeId) continue;
        const conditionText = eventCondition(title, primaryContent);
        const meta = eventMeta(npcId, key, title, conditionText, parsed.startNodeId, primaryContent);
        for (const node of parsed.nodes) stageNodes[meta.stageKey][node.id] = node;
        scenes[key] = meta;

        for (let followupIndex = 0; followupIndex < followups.length; followupIndex += 1) {
          const followup = followups[followupIndex];
          const followupStart = (followup.index ?? 0) + followup[0].length;
          const followupEnd = followups[followupIndex + 1]?.index ?? eventContent.length;
          const followupContent = eventContent.slice(followupStart, followupEnd);
          const followupKey = `${key}_followup_${followupIndex + 1}`;
          const followupParsed = parseScene(followupContent, `${npcId}_${followupKey}`, "event");
          if (!followupParsed.startNodeId) continue;
          const followupCondition = `${conditionText}；需先完成${title}`;
          const followupMeta = eventMeta(npcId, followupKey, trimMarkdown(followup[1]), followupCondition, followupParsed.startNodeId, followupContent);
          for (const node of followupParsed.nodes) stageNodes[followupMeta.stageKey][node.id] = node;
          scenes[followupKey] = followupMeta;
        }
      }
    }

    const talk: Partial<Record<NpcTalkStageKey, NpcTalkStage>> = {};
    for (const stageKey of ["meet", ...DAILY_STAGES] as NpcTalkStageKey[]) {
      const nodes = stageNodes[stageKey];
      const startNodeId = stageStarts[stageKey] ?? Object.keys(nodes)[0];
      if (startNodeId) talk[stageKey] = { start: startNodeId, nodes };
    }
    result[npcId] = { profile, talk, scenes, dailySceneIds, meetSceneId: meet.startNodeId ? meetId : undefined };
  }
  return result;
}

type LiteraryNpcAccumulator = {
  profile: NpcRemasterProfile;
  talkNodes: Record<NpcTalkStageKey, Record<string, NpcTalkNode>>;
  stageStarts: Partial<Record<NpcTalkStageKey, string>>;
  scenes: Record<string, NpcRemasterScene>;
  dailySceneIds: NpcRemasterData["dailySceneIds"];
  meetSceneId?: string;
};

const LITERARY_NPC_SPEAKERS: Record<string, string[]> = {
  npc_lin_xiaoyu: ["林小雨"],
  npc_zhao_gang: ["赵刚"],
  npc_chen_jie: ["陈姐"],
  npc_wang_lei: ["王磊", "王叔"],
  npc_netbar_boss: ["老板", "网咖老板"],
  npc_librarian: ["图书馆大姐", "大姐"],
  npc_flower_market_owner: ["苏荷"],
  npc_snack_street_vendor: ["马师傅"],
  npc_suburb_farmer: ["陈守田"],
  npc_fan_kejie: ["范柯杰"],
  npc_fan_kexi: ["范珂汐"],
  npc_jack_fanma: ["杰克·范马", "范杰克", "杰克"],
};

function literaryVisibleLine(raw: string, npcId: string): string {
  let value = raw.trim();
  if (!value || /^\*\*/.test(value) || /^#{1,4}\s|^---/.test(value)) return "";
  if (/^（若玩家留下，下面发生在当日；若已离开，以下转为下次见面时/.test(value)) {
    value = value.replace(/^（若玩家留下，下面发生在当日；若已离开，以下转为下次见面时[^。]*。/, "（").trim();
  }
  if (/^（若继续交谈/.test(value)) return "";
  for (const speaker of LITERARY_NPC_SPEAKERS[npcId] ?? []) {
    value = value.replace(new RegExp(`^${speaker}[：:]\\s*`), "");
  }
  return value;
}

function literaryLinesText(lines: string[], npcId: string): string {
  return lines.map((line) => literaryVisibleLine(line, npcId)).filter(Boolean).join("\n");
}

/** Speakers are parsed from line prefixes, never from names inside quotations. */
function literarySpeeches(lines: string[], npcId: string): import("../core/npcDialoguePlayback").NpcSpeech[] {
  const result: import("../core/npcDialoguePlayback").NpcSpeech[] = [];
  for (const raw of lines) {
    const value = raw.trim();
    if (!literaryVisibleLine(value, npcId)) continue;
    const aliases = [...(LITERARY_NPC_SPEAKERS[npcId] ?? []), "玩家", "你"];
    const match = value.match(new RegExp(`^(（[^）]*）)?(${aliases.join("|")})[：:]\\s*(.*)$`));
    if (match) {
      if (match[1]) result.push({ speakerId: null, text: match[1] });
      const text = match[3];
      result.push({ speakerId: match[2] === "玩家" || match[2] === "你" ? "player" : npcId, text: text.replace(/^（[^）]*）\s*/, "") || text, portraitText: text });
    } else {
      result.push({ speakerId: null, text: literaryVisibleLine(value, npcId) });
    }
  }
  return result;
}

function literaryNode(id: string, lines: string[], npcId: string, options: NpcTalkOption[]): NpcTalkNode {
  const speeches = literarySpeeches(lines, npcId);
  return { id, text: speeches.map(speech => speech.text).join("\n"), speeches, options };
}

function parseLiteraryScene(
  raw: string,
  npcId: string,
  scenePrefix: string,
): { startNodeId?: string; nodes: NpcTalkNode[] } {
  const lines = linesOf(raw);
  const choiceMatches = [...raw.matchAll(/^[ \t]*\d+\.[ \t]+\*\*[^\n]*?\*\*[ \t]*$/gm)];
  const choiceIndexes = choiceMatches.map((match) => {
    const before = raw.slice(0, match.index ?? 0);
    return before.split("\n").length - 1;
  });
  const choiceLines = choiceIndexes.map((index) => lines[index] ?? "");
  const rootId = `${npcId}_reset_${scenePrefix}_intro`;
  const nodes: NpcTalkNode[] = [];

  if (choiceIndexes.length === 0) {
    const text = literaryLinesText(lines, npcId);
    if (!text) return { nodes };
    nodes.push(literaryNode(rootId, lines, npcId, [{ label: "结束交流", affinity: 0 }]));
    return { startNodeId: rootId, nodes };
  }

  const root = literaryNode(rootId, lines.slice(0, choiceIndexes[0]), npcId, []);
  nodes.push(root);
  const lastChoiceIndex = choiceIndexes[choiceIndexes.length - 1];
  const commonLines = lines.slice(lastChoiceIndex + 1).filter((line) => {
    if (!line.trim() || /^\s/.test(line) || /^\*\*(?:关系|前置|后续变化|分支收束|地点)/.test(line.trim())) return false;
    return true;
  });

  for (let index = 0; index < choiceIndexes.length; index += 1) {
    const start = choiceIndexes[index];
    const end = choiceIndexes[index + 1] ?? lines.length;
    const parsed = parseChoice(choiceLines[index]);
    if (!parsed) continue;
    const option = parsed.option;
    const leave = option.leave
      || /(?:先走了|赶时间，先走|今天不找了，我还有事)/.test(option.label);
    const branchLines = lines.slice(start + 1, end).filter((line) => /^\s+\S/.test(line));
    const branchContent = [...branchLines, ...(leave ? [] : commonLines)];
    option.label = option.label.replace(/【仅玩家听过[^】]*】/g, "");
    if (npcId === "npc_fan_kexi" && option.label.includes("都死了")) {
      option.requiresHeardFlag = "npc_heard_kejie_parents_dead";
    }
    if (leave) {
      const branchNodeId = `${npcId}_reset_${scenePrefix}_choice_${index + 1}`;
      root.options.push({
        ...option,
        leave: false,
        leaveAfterNext: true,
        next: branchNodeId,
        affinity: option.affinity ?? 0,
      });
      nodes.push(literaryNode(branchNodeId, branchContent, npcId, [{ label: "结束交流", leave: true, affinity: 0 }]));
      continue;
    }
    const branchNodeId = `${npcId}_reset_${scenePrefix}_choice_${index + 1}`;
    root.options.push({ ...option, leave: false, next: branchNodeId, affinity: option.affinity ?? 0 });
    nodes.push(literaryNode(branchNodeId, branchContent, npcId, [{ label: "结束交流", affinity: 0 }]));
  }

  if (root.options.length === 0) return { nodes: [] };
  return { startNodeId: rootId, nodes };
}

function resetDailyConditions(npcId: string, number: number): NpcRemasterCondition[] {
  if (npcId === "npc_librarian" && number === 2) {
    return [{ type: "flag", key: "npc_remaster_librarian_returned_book" }];
  }
  if (npcId === "npc_lin_xiaoyu" && number === 7) return [{ type: "eventNotSeen", eventIds: ["reset_story_e01"] }];
  if (npcId === "npc_lin_xiaoyu" && number === 9) return [{ type: "eventNotSeen", eventIds: ["reset_story_e03"] }];
  if (npcId === "npc_zhao_gang" && number === 10) return [{ type: "eventNotSeen", eventIds: ["reset_story_e03"] }];
  if (npcId === "npc_chen_jie" && number === 7) return [{ type: "eventNotSeen", eventIds: ["reset_story_e01"] }];
  if (npcId === "npc_chen_jie" && number === 9) return [{ type: "eventNotSeen", eventIds: ["reset_story_e03"] }];
  return [];
}

function resetStoryConditions(npcId: string, number: number): NpcRemasterCondition[] {
  const dailyId = (stage: string, n: number) => `reset_daily_${stage}_d${String(n).padStart(2, "0")}`;
  if (number === 1) {
    const conditions: NpcRemasterCondition[] = [];
    if (npcId === "npc_lin_xiaoyu" || npcId === "npc_chen_jie") {
      conditions.push({ type: "dailySeen", sceneIds: [dailyId("friend", 7)] });
    }
    if (npcId === "npc_snack_street_vendor") conditions.push({ type: "location", locationId: "snack_street" });
    if (npcId === "npc_suburb_farmer") {
      conditions.push({ type: "location", locationId: "farm" }, { type: "rainCleared", minimumRainTalks: 2 });
    }
    return conditions;
  }
  if (number === 2) {
    const conditions: NpcRemasterCondition[] = [{ type: "eventAll", eventIds: ["reset_story_e01"] }, { type: "eventDayGap", eventId: "reset_story_e01", days: 1 }];
    if (npcId === "npc_chen_jie") conditions.push({ type: "nonPeak" });
    if (npcId === "npc_snack_street_vendor") conditions.push({ type: "location", locationId: "snack_street" }, { type: "timeRange", start: 20, end: 24 });
    if (npcId === "npc_suburb_farmer") conditions.push({ type: "location", locationId: "farm" }, { type: "eventDayGap", eventId: "reset_story_e01", days: 3 }, { type: "rainCleared", minimumRainTalks: 2 });
    return conditions;
  }

  const conditions: NpcRemasterCondition[] = [
    { type: "eventAll", eventIds: ["reset_story_e02"] },
    { type: "eventDayGap", eventId: "reset_story_e02", days: 1 },
  ];
  if (npcId === "npc_zhao_gang") conditions.push({ type: "dailySeen", sceneIds: [dailyId("close_friend", 10)] });
  if (npcId === "npc_chen_jie") {
    conditions.push({ type: "dailySeen", sceneIds: [dailyId("friend", 9)] }, { type: "weekendNow" });
  }
  if (npcId === "npc_suburb_farmer") {
    conditions.push({ type: "location", locationId: "farm" }, { type: "eventDayGap", eventId: "reset_story_e02", days: 3 });
  }
  return conditions;
}

function resetEventMeta(npcId: string, number: number, title: string, startNodeId: string): NpcRemasterScene {
  const id = `reset_story_e${String(number).padStart(2, "0")}`;
  const isEarlyFamiliarity = npcId === "npc_zhao_gang" && number === 1;
  return {
    id,
    kind: "event",
    casualChat: false,
    channel: "formal",
    stageKey: isEarlyFamiliarity ? "acquaintance" : number === 3 ? "close_friend" : "friend",
    minAffinity: isEarlyFamiliarity ? 20 : number === 3 ? 70 : 40,
    startNodeId,
    title,
    conditionText: `人物故事第 ${number} 段`,
    conditions: resetStoryConditions(npcId, number),
  };
}

function addLiteraryScene(
  target: LiteraryNpcAccumulator,
  npcId: string,
  scene: NpcRemasterScene,
  parsed: { startNodeId?: string; nodes: NpcTalkNode[] },
): boolean {
  if (!parsed.startNodeId || parsed.nodes.length === 0) return false;
  attachLiteraryDialogueBenefits(npcId,scene.id,parsed.nodes);
  for (const node of parsed.nodes) target.talkNodes[scene.stageKey][node.id] = node;
  target.stageStarts[scene.stageKey] ??= parsed.startNodeId;
  target.scenes[scene.id] = scene;
  if (scene.kind === "daily" && scene.stageKey !== "meet") {
    target.dailySceneIds[scene.stageKey] ??= [];
    target.dailySceneIds[scene.stageKey]?.push(scene.id);
  }
  if (scene.kind === "meet") target.meetSceneId = scene.id;
  void npcId;
  return true;
}

const IMPORTANT_TOPICS: Record<string, readonly number[]> = {
  npc_fan_kejie: [1, 2, 4], npc_jack_fanma: [1, 2, 4], npc_fan_kexi: [1, 2, 3, 5],
};

function literaryLocation(content: string): string | undefined {
  return content.match(/\*\*地点：[^\n]*?（([a-z][a-z0-9_]*)(?:，|,|）)/)?.[1];
}

function literaryAffinity(content: string, fallback = 20): number {
  const band = content.match(/关系：([^。；;\n*]+)/)?.[1];
  return band?.includes("信任") ? 70 : band?.includes("朋友") ? 40 : band?.includes("熟悉") ? 20 : band?.includes("刚认识") ? 0 : fallback;
}

function stageForAffinity(affinity: number): Exclude<NpcTalkStageKey, "meet"> {
  return affinity >= 70 ? "close_friend" : affinity >= 40 ? "friend" : "acquaintance";
}

function parseLiteraryRemasterData(raw: string): Record<string, NpcRemasterData> {
  const markers = [...raw.matchAll(/^#[ \t]+\d+．.+?（(npc_[^）]+)）[ \t]*$/gm)];
  const accumulators: Record<string, LiteraryNpcAccumulator> = {};
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const npcId = marker[1];
    if (!npcData.some((npc) => npc.id === npcId)) continue;
    const start = marker.index ?? 0;
    const end = markers[index + 1]?.index ?? raw.length;
    const chunk = raw.slice(start, end);
    const target: LiteraryNpcAccumulator = {
      profile: extractProfile(chunk),
      talkNodes: { meet: {}, acquaintance: {}, friend: {}, close_friend: {} },
      stageStarts: {},
      scenes: {},
      dailySceneIds: {},
    };
    const meetContent = between(chunk, /^##[ \t]+初见[ \t]*$/m, [/^##[ \t]+/m]);
    const meet = parseLiteraryScene(meetContent, npcId, "reset_meet");
    if (meet.startNodeId) {
      addLiteraryScene(target, npcId, {
        id: "meet",
        kind: "meet",
        stageKey: "meet",
        startNodeId: meet.startNodeId,
        title: "初次相遇",
        conditions: [],
      }, meet);
    }

    const dailyContent = between(chunk, /^##[ \t]+日常对话[ \t]*$/m, [/^##[ \t]+/m]);
    const dailyMarkers = [...dailyContent.matchAll(/^###[ \t]+D(\d+)｜(.+?)[ \t]*$/gm)];
    for (let dailyIndex = 0; dailyIndex < dailyMarkers.length; dailyIndex += 1) {
      const dailyMarker = dailyMarkers[dailyIndex];
      const number = Number(dailyMarker[1]);
      const contentStart = (dailyMarker.index ?? 0) + dailyMarker[0].length;
      const contentEnd = dailyMarkers[dailyIndex + 1]?.index ?? dailyContent.length;
      const content = dailyContent.slice(contentStart, contentEnd);
      const isExpanded = dailyMarkers.length === 24;
      const band = Math.floor((number - 1) / (isExpanded ? 6 : 3));
      const minAffinity = [0, 20, 40, 70][band] ?? 70;
      const stageKey = stageForAffinity(minAffinity);
      const sceneId = `reset_daily_${stageKey}_d${String(number).padStart(2, "0")}`;
      const privateQuestion = number === 24 && (npcId === "npc_fan_kejie" || npcId === "npc_fan_kexi");
      const parsed = parseLiteraryScene(content, npcId, sceneId);
      if (!parsed.startNodeId) continue;
      addLiteraryScene(target, npcId, {
        id: sceneId,
        kind: privateQuestion ? "topic" : "daily",
        channel: privateQuestion ? "formal" : "chat",
        stageKey,
        startNodeId: parsed.startNodeId,
        title: dailyMarker[2].trim(),
        minAffinity,
        ...(band < 3 && !privateQuestion ? { maxAffinity: [19, 39, 69][band] } : {}),
        locationId: literaryLocation(content),
        retellable: !privateQuestion,
        conditions: [
          ...(isExpanded ? [] : resetDailyConditions(npcId, number).filter(condition =>
            condition.type === "flag" ? /还书/.test(content)
              : condition.type !== "eventNotSeen" || (npcId === "npc_zhao_gang" && number === 10) || (npcId === "npc_chen_jie" && number === 9))),
          ...(/\*\*场合：当前下雨/.test(content) ? [{ type: "rainNow" as const }] : []),
        ],
      }, parsed);
    }

    const topicContent = between(chunk, /^##[ \t]+其他闲谈[ \t]*$/m, [/^##[ \t]+/m, /^---[ \t]*$/m]);
    const topicMarkers = [...topicContent.matchAll(/^###[ \t]+T(\d+)｜(.+?)[ \t]*$/gm)];
    for (let topicIndex = 0; topicIndex < topicMarkers.length; topicIndex += 1) {
      const marker = topicMarkers[topicIndex], number = Number(marker[1]);
      const content = topicContent.slice((marker.index ?? 0) + marker[0].length, topicMarkers[topicIndex + 1]?.index ?? topicContent.length);
      const id = `reset_topic_t${String(number).padStart(2, "0")}`;
      const parsed = parseLiteraryScene(content, npcId, id);
      if (!parsed.startNodeId) continue;
      const minAffinity = literaryAffinity(content);
      addLiteraryScene(target, npcId, {
        id, kind: "topic", channel: IMPORTANT_TOPICS[npcId]?.includes(number) ? "formal" : "chat",
        stageKey: stageForAffinity(minAffinity), minAffinity, startNodeId: parsed.startNodeId,
        title: marker[2].trim(), locationId: literaryLocation(content), conditions: [],
        ...(npcId === "npc_lin_xiaoyu" && number === 1 ? { retrospectiveAfter: "reset_story_e03" } : {}),
      }, parsed);
    }

    const storyContent = between(chunk, /^##[ \t]+故事线[ \t]*$/m, [/^##[ \t]+/m]);
    const storyMarkers = [...storyContent.matchAll(/^###[ \t]+E(\d+)｜(.+?)[ \t]*$/gm)];
    for (let storyIndex = 0; storyIndex < storyMarkers.length; storyIndex += 1) {
      const storyMarker = storyMarkers[storyIndex];
      const number = Number(storyMarker[1]);
      const sceneId = `reset_story_e${String(number).padStart(2, "0")}`;
      const contentStart = (storyMarker.index ?? 0) + storyMarker[0].length;
      const contentEnd = storyMarkers[storyIndex + 1]?.index ?? storyContent.length;
      const parsed = parseLiteraryScene(storyContent.slice(contentStart, contentEnd), npcId, sceneId);
      if (!parsed.startNodeId) continue;
      addLiteraryScene(target, npcId, resetEventMeta(npcId, number, storyMarker[2].trim(), parsed.startNodeId), parsed);
    }

    const afterContent = between(chunk, /^##[ \t]+故事之后[ \t]*$/m, [/^---[ \t]*$/m]);
    const afterMarkers = [...afterContent.matchAll(/^\*\*S(\d+)｜(.+?)\*\*(.*)$/gm)];
    for (let afterIndex = 0; afterIndex < afterMarkers.length; afterIndex += 1) {
      const afterMarker = afterMarkers[afterIndex];
      const number = Number(afterMarker[1]);
      const sceneId = `reset_after_s${String(number).padStart(2, "0")}`;
      const contentStart = (afterMarker.index ?? 0) + afterMarker[0].length;
      const contentEnd = afterMarkers[afterIndex + 1]?.index ?? afterContent.length;
      const content = `${afterMarker[3]}\n${afterContent.slice(contentStart, contentEnd)}`;
      const parsed = parseLiteraryScene(content, npcId, sceneId);
      if (!parsed.startNodeId) continue;
      const requiredEvents = ["reset_story_e01", "reset_story_e02", "reset_story_e03"];
      if (number > 1) requiredEvents.push("reset_after_s01");
      addLiteraryScene(target, npcId, {
        id: sceneId,
        kind: "event",
        casualChat: false,
        channel: "formal",
        stageKey: "close_friend",
        minAffinity: 70,
        startNodeId: parsed.startNodeId,
        title: afterMarker[2].trim().replace(/[。.]$/, ""),
        conditionText: "主线故事完成后的近况闲聊",
        conditions: [{ type: "eventAll", eventIds: requiredEvents }],
      }, parsed);
    }
    accumulators[npcId] = target;
  }

  const groupContent = between(raw, /^#[ \t]+(?:群像补篇：顺路碰到|熟人交集：由眼前的人聊起)[ \t]*$/m, []);
  const groupMarkers = [...groupContent.matchAll(/^##[ \t]+X(\d+)｜(.+?)[ \t]*$/gm)];
  const groupDefinitions = [
    { host: "npc_chen_jie", participants: ["npc_chen_jie", "npc_zhao_gang", "npc_wang_lei"], locationId: "fast_food", startHour: 13, endHour: 15 },
    { host: "npc_librarian", participants: ["npc_librarian", "npc_lin_xiaoyu"], locationId: "library" },
  ];
  for (let groupIndex = 0; groupIndex < groupMarkers.length; groupIndex += 1) {
    const marker = groupMarkers[groupIndex];
    const number = Number(marker[1]);
    const definition = groupDefinitions[number - 1];
    const target = definition ? accumulators[definition.host] : undefined;
    if (!target || !definition) continue;
    const contentStart = (marker.index ?? 0) + marker[0].length;
    const contentEnd = groupMarkers[groupIndex + 1]?.index ?? groupContent.length;
    const sceneId = `reset_group_x${String(number).padStart(2, "0")}`;
    const parsed = parseLiteraryScene(groupContent.slice(contentStart, contentEnd), definition.host, sceneId);
    if (!parsed.startNodeId) continue;
    addLiteraryScene(target, definition.host, {
      id: sceneId,
      kind: "topic",
      channel: "chat",
      stageKey: "acquaintance",
      minAffinity: 20,
      startNodeId: parsed.startNodeId,
      title: marker[2].trim(),
      conditionText: "聊聊熟人的小事",
      locationId: definition.locationId,
      conditions: [],
      ...(number === 2 ? { retrospectiveAfter: "reset_story_e03" } : {}),
    }, parsed);
  }

  const result: Record<string, NpcRemasterData> = {};
  for (const [npcId, target] of Object.entries(accumulators)) {
    const talk: Partial<Record<NpcTalkStageKey, NpcTalkStage>> = {};
    for (const stageKey of ["meet", ...DAILY_STAGES] as NpcTalkStageKey[]) {
      const nodes = target.talkNodes[stageKey];
      const start = target.stageStarts[stageKey] ?? Object.keys(nodes)[0];
      if (start) talk[stageKey] = { start, nodes };
    }
    result[npcId] = {
      profile: target.profile,
      talk,
      scenes: target.scenes,
      dailySceneIds: target.dailySceneIds,
      meetSceneId: target.meetSceneId,
    };
  }
  return result;
}

function parseRemasterData(raw: string): Record<string, NpcRemasterData> {
  const hasLiteraryReset = /^#[ \t]+\d+．.+?（npc_[^）]+）/m.test(raw) && /^###\s+D01｜/m.test(raw);
  return hasLiteraryReset ? parseLiteraryRemasterData(raw) : parseLegacyRemasterData(raw);
}

function numberFlag(state: GameState, key: string): number {
  const value = state.flags[key];
  return typeof value === "number" ? value : 0;
}

function hash(value: string): number {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function stageAtLeast(current: NpcTalkStageKey, required: NpcTalkStageKey): boolean {
  return STAGE_ORDER[current] >= STAGE_ORDER[required];
}

function affinityForStage(stage: NpcTalkStageKey): number {
  if (stage === "close_friend") return 70;
  if (stage === "friend") return 40;
  if (stage === "acquaintance") return 0;
  return 0;
}

function eventSeenFlagKey(npcId: string, eventId: string): string {
  return `npc_remaster_event_seen_${npcId}_${eventId}`;
}

function eventDayFlagKey(npcId: string, eventId: string): string {
  return `npc_remaster_event_day_${npcId}_${eventId}`;
}

function dailySeenFlagKey(npcId: string, sceneId: string): string {
  return `npc_remaster_daily_seen_${npcId}_${sceneId}`;
}

type StreakCounter = Extract<NpcRemasterCondition, { type: "streak" }>["counter"];

function streakFlagKey(counter: StreakCounter, npcId: string): string {
  switch (counter) {
    case "visits": return `npc_remaster_visit_streak_${npcId}`;
    case "rain": return `npc_remaster_rain_streak_${npcId}`;
    case "quiet": return `npc_remaster_quiet_streak_${npcId}`;
    case "passive": return `npc_remaster_passive_streak_${npcId}`;
    case "weekend": return `npc_remaster_weekend_streak_${npcId}`;
    case "closing": return `npc_remaster_closing_streak_${npcId}`;
    case "flower": return `npc_remaster_flower_purchase_streak_${npcId}`;
    case "sameDish": return `npc_remaster_snack_order_streak_${npcId}`;
    case "farmHelp": return `npc_remaster_farm_help_streak_${npcId}`;
  }
}

function setStreak(state: GameState, counter: StreakCounter, npcId: string, value: number): void {
  state.flags[streakFlagKey(counter, npcId)] = Math.max(0, Math.floor(value));
}

const REMASTER_FOOD_IDS = new Set(
  ((itemsData as { items?: Array<{ id: string; useEffects?: { satiety?: number }; effects?: { satiety?: number } }> }).items ?? [])
    .filter((item) => (item.useEffects?.satiety ?? item.effects?.satiety ?? 0) > 0)
    .map((item) => item.id),
);

/** 由行动结算器在成功路径调用；取消或失败路径不得写入这些计数。 */
export function recordRemasterAction(state: GameState, action: NpcRemasterActionRecord): void {
  if (action.kind === "food_gift") {
    if (action.npcId !== "npc_zhao_gang" || !REMASTER_FOOD_IDS.has(action.itemId)) return;
    state.flags["npc_remaster_food_gifted_npc_zhao_gang"] = true;
    const totalKey = "npc_remaster_food_gift_count_npc_zhao_gang";
    state.flags[totalKey] = numberFlag(state, totalKey) + 1;
    return;
  }

  if (action.kind === "snack_order") {
    const npcId = "npc_snack_street_vendor";
    const lastPrefix = "npc_remaster_snack_last_item_";
    const currentLastKey = `${lastPrefix}${action.itemId}`;
    const streakKey = streakFlagKey("sameDish", npcId);
    const totalKey = "npc_remaster_snack_order_total_npc_snack_street";
    const sameAsPrevious = state.flags[currentLastKey] === true;
    state.flags[streakKey] = sameAsPrevious
      ? numberFlag(state, streakKey) + 1
      : 1;
    for (const key of Object.keys(state.flags)) {
      if (key.startsWith(lastPrefix) && key !== currentLastKey) delete state.flags[key];
    }
    state.flags[currentLastKey] = true;
    state.flags[totalKey] = numberFlag(state, totalKey) + 1;
    return;
  }

  if (action.kind === "flower_market_purchase") {
    const npcId = "npc_flower_market_owner";
    const streakKey = streakFlagKey("flower", npcId);
    const totalKey = "npc_remaster_flower_purchase_total_npc_flower_market";
    if (action.actionId === "buy_flower_flower_market" && action.itemId === "market_flower") {
      state.flags[streakKey] = numberFlag(state, streakKey) + 1;
      state.flags[totalKey] = numberFlag(state, totalKey) + 1;
    } else {
      // 买盆栽等其他花店商品会打断「连续买花」。
      state.flags[streakKey] = 0;
    }
    return;
  }

  if (action.workedMinutes <= 0) return;
  const npcId = "npc_suburb_farmer";
  const streakKey = streakFlagKey("farmHelp", npcId);
  if (action.jobId === "job_farm_hand") {
    state.flags[streakKey] = numberFlag(state, streakKey) + 1;
    const totalKey = "npc_remaster_farm_help_total_npc_suburb_farmer";
    state.flags[totalKey] = numberFlag(state, totalKey) + 1;
  } else {
    state.flags[streakKey] = 0;
  }
}

function isRainy(state: GameState): boolean {
  return state.weather?.id === "rain";
}

function hourOfDay(state: GameState): number {
  return state.time.hour + (state.time.minute ?? 0) / 60;
}

function isNonPeakFastFoodTime(state: GameState): boolean {
  const hour = hourOfDay(state);
  // 午餐 11:00–14:00、晚餐 17:00–19:00 为用餐高峰。
  return !(hour >= 11 && hour < 14) && !(hour >= 17 && hour < 19);
}

function isQuietChoice(options: NpcTalkOption[]): boolean {
  return options.some((option) => /安静|没说话|不打扰|陪.{0,4}坐|坐会儿/.test(option.label));
}

function isRequest(options: NpcTalkOption[]): boolean {
  return options.some((option) => option.help || option.commission || option.cityCommissionId);
}

function recordVisitStreaks(state: GameState, npcId: string, options: NpcTalkOption[], updateTotals: boolean): void {
  const visitsKey = streakFlagKey("visits", npcId);
  const visitLocation = npcId === "npc_lin_xiaoyu" ? "cafe" : undefined;
  const qualifiesAsVisit = !visitLocation || state.locationId === visitLocation;
  setStreak(state, "visits", npcId, qualifiesAsVisit ? numberFlag(state, visitsKey) + 1 : 0);

  const rainKey = streakFlagKey("rain", npcId);
  const rainy = isRainy(state);
  if (rainy && updateTotals) state.flags[`npc_remaster_rain_talks_${npcId}`] = numberFlag(state, `npc_remaster_rain_talks_${npcId}`) + 1;
  const rainLocation = npcId === "npc_zhao_gang" ? "labor_market" : undefined;
  const qualifiesAsRainVisit = rainy && (!rainLocation || state.locationId === rainLocation);
  setStreak(state, "rain", npcId, qualifiesAsRainVisit ? numberFlag(state, rainKey) + 1 : 0);

  const quietKey = streakFlagKey("quiet", npcId);
  const quiet = isQuietChoice(options) && !isRequest(options);
  if (quiet && updateTotals) state.flags[`npc_remaster_quiet_${npcId}`] = numberFlag(state, `npc_remaster_quiet_${npcId}`) + 1;
  setStreak(state, "quiet", npcId, quiet ? numberFlag(state, quietKey) + 1 : 0);

  const passiveKey = streakFlagKey("passive", npcId);
  const requested = isRequest(options);
  if (requested) {
    state.flags[`npc_remaster_ever_requested_${npcId}`] = true;
    setStreak(state, "passive", npcId, 0);
  } else {
    if (updateTotals) state.flags[`npc_remaster_passive_${npcId}`] = numberFlag(state, `npc_remaster_passive_${npcId}`) + 1;
    setStreak(state, "passive", npcId, numberFlag(state, passiveKey) + 1);
  }

  const weekendKey = streakFlagKey("weekend", npcId);
  const weekday = weekdayOf(state.time);
  const weekend = (weekday === 5 || weekday === 6) && (npcId !== "npc_wang_lei" || state.locationId === "park");
  setStreak(state, "weekend", npcId, weekend ? numberFlag(state, weekendKey) + 1 : 0);

  if (npcId === "npc_librarian") {
    const closingKey = streakFlagKey("closing", npcId);
    const atClosing = state.locationId === "library" && hourOfDay(state) >= 21 && hourOfDay(state) < 22;
    setStreak(state, "closing", npcId, atClosing ? numberFlag(state, closingKey) + 1 : 0);
  }
}

function conditionIsSatisfied(state: GameState, npcId: string, condition: NpcRemasterCondition): boolean {
  switch (condition.type) {
    case "streak":
      return numberFlag(state, streakFlagKey(condition.counter, npcId)) >= condition.count;
    case "rainNow":
      return state.weather?.id === "rain";
    case "weekendNow": {
      const weekday = weekdayOf(state.time);
      return weekday === 5 || weekday === 6;
    }
    case "timeRange": {
      const now = hourOfDay(state);
      return now >= condition.start && now < condition.end;
    }
    case "location":
      return state.locationId === condition.locationId;
    case "nonPeak":
      return isNonPeakFastFoodTime(state);
    case "eventAny":
      return condition.eventIds.some((eventId) => state.flags[eventSeenFlagKey(npcId, eventId)] === true);
    case "eventAll":
      return condition.eventIds.every((eventId) => state.flags[eventSeenFlagKey(npcId, eventId)] === true);
    case "eventNotSeen":
      return condition.eventIds.every((eventId) => state.flags[eventSeenFlagKey(npcId, eventId)] !== true);
    case "dailySeen":
      return condition.sceneIds.every((sceneId) => state.flags[dailySeenFlagKey(npcId, sceneId)] === true);
    case "crossEventAll":
      return condition.events.every(({ npcId: participantId, eventId }) => state.flags[eventSeenFlagKey(participantId, eventId)] === true);
    case "eventDayGap": {
      if (state.flags[eventSeenFlagKey(npcId, condition.eventId)] !== true) return false;
      const completedDay = state.flags[eventDayFlagKey(npcId, condition.eventId)];
      return typeof completedDay === "number" && gameDay(state.time) - completedDay >= condition.days;
    }
    case "rainCleared":
      return state.weather?.id !== "rain"
        && numberFlag(state, `npc_remaster_rain_talks_${npcId}`) >= condition.minimumRainTalks;
    case "flag":
      return state.flags[condition.key] === true;
    case "foodGifted":
      return state.flags["npc_remaster_food_gifted_npc_zhao_gang"] === true;
  }
}

function eventIsEligible(
  state: GameState,
  npcId: string,
  currentStage: NpcTalkStageKey,
  event: NpcRemasterScene,
  affinity: number,
): boolean {
  if (!stageAtLeast(currentStage, event.stageKey)) return false;
  if (event.minAffinity != null && affinity < event.minAffinity) return false;
  if (event.maxAffinity != null && affinity > event.maxAffinity) return false;
  if (state.flags[eventSeenFlagKey(npcId, event.id)] === true) return false;
  return event.conditions.every((condition) => conditionIsSatisfied(state, npcId, condition));
}

/**
 * 依据关系、天气和已发生的互动，选择本次对话的入口节点。
 * 所有条件事件先进入候选池；v1.46 条件满足后直接进入事件，不再依赖运气抽签。
 */
export function remasterConversationStart(
  state: GameState,
  npcId: string,
  currentStage: NpcTalkStageKey,
  affinity = affinityForStage(currentStage),
): NpcRemasterStart | undefined {
  const data = npcDialogueRemasterData()[npcId];
  if (!data) return undefined;
  if (currentStage === "meet") {
    const scene = data.meetSceneId ? data.scenes[data.meetSceneId] : undefined;
    return scene ? { sceneId: scene.id, kind: scene.kind, stageKey: scene.stageKey, nodeId: scene.startNodeId, title: scene.title } : undefined;
  }

  const eligibleEvents = remasterEligibleEvents(state, npcId, currentStage, affinity);
  const visit = numberFlag(state, `npc_remaster_talks_${npcId}`);
  const drawKey = `${npcId}:${state.time.year}:${state.time.month}:${state.time.day}:${state.time.hour}:${visit}`;
  // 以当前游戏状态作稳定抽签，避免玩家通过原地退出、重开对话反复刷特殊事件。
  const eventSeed = hash(`${drawKey}:event`);
  const event = eligibleEvents.length > 0 && eventSeed % 100 < NPC_SPECIAL_EVENT_CHANCE * 100
    ? eligibleEvents[Math.floor(eventSeed / 100) % eligibleEvents.length]
    : undefined;
  if (event) return event;

  return remasterDailyConversationStart(state, npcId, currentStage);
}

/** 取得当前阶段所有已满足条件、尚未结算的正式剧情。 */
export function remasterEligibleEvents(
  state: GameState,
  npcId: string,
  currentStage: NpcTalkStageKey,
  affinity = affinityForStage(currentStage),
): NpcRemasterStart[] {
  const data = npcDialogueRemasterData()[npcId];
  if (!data || currentStage === "meet") return [];
  return Object.values(data.scenes)
    .filter((scene) => scene.kind === "event" && eventIsEligible(state, npcId, currentStage, scene, affinity))
    .map((scene) => ({ sceneId: scene.id, kind: scene.kind, stageKey: scene.stageKey, nodeId: scene.startNodeId, title: scene.title }));
}

/** 所有生活话题归入闲聊；完整听过的片段永久去重，兼容既有已读标记。 */
export function remasterEligibleTopics(state: GameState, npcId: string, channel: "chat" | "formal", affinity: number): NpcRemasterScene[] {
  const data = npcDialogueRemasterData()[npcId];
  return Object.values(data?.scenes ?? {}).filter(scene => scene.kind === "topic" && (channel === "chat" || scene.channel === channel)
    && state.flags[`npc_remaster_topic_seen_${npcId}_${scene.id}`] !== true
    && affinity >= (scene.minAffinity ?? 0) && (!scene.locationId || scene.locationId === state.locationId)
    && scene.conditions.every(condition => conditionIsSatisfied(state, npcId, condition)));
}

/** 闲聊优先递进重置稿中的一次性社交故事段落，随后按关系抽取日常场景。 */
export function remasterDailyConversationStart(
  state: GameState,
  npcId: string,
  currentStage: NpcTalkStageKey,
  affinity = affinityForStage(currentStage),
): NpcRemasterStart | undefined {
  const data = npcDialogueRemasterData()[npcId];
  if (!data || currentStage === "meet") return undefined;
  const eligibleEvents = remasterEligibleEvents(state, npcId, currentStage, affinity);
  const casualEvents = eligibleEvents;
  if (casualEvents.length > 0) {
    const visit = numberFlag(state, `npc_remaster_talks_${npcId}`);
    const event = casualEvents[hash(`${state.rng.seed}:${npcId}:${gameDay(state.time)}:${visit}:event`) % casualEvents.length];
    if (event) return event;
  }
  const ids = data.dailySceneIds[currentStage] ?? [];
  const eligibleDailies = ids
    .map((id) => data.scenes[id])
    .filter((scene): scene is NpcRemasterScene => !!scene
      && (!scene.locationId || scene.locationId === state.locationId || scene.retellable === true)
      && (scene.minAffinity == null || affinity >= scene.minAffinity)
      && (scene.maxAffinity == null || affinity <= scene.maxAffinity)
      && scene.conditions.every((condition) => conditionIsSatisfied(state, npcId, condition)));
  const visit = numberFlag(state, `npc_remaster_talks_${npcId}`);
  const unplayed = eligibleDailies.filter(scene => state.flags[dailySeenFlagKey(npcId, scene.id)] !== true);
  const topics = remasterEligibleTopics(state,npcId,"chat",affinity);
  const local = unplayed.filter(scene => !scene.locationId || scene.locationId === state.locationId);
  const pool = [...topics, ...(local.length ? local : unplayed)];
  if (!pool.length) return undefined;
  // 同一状态下抽签稳定；只有正常结算后才记已读，退出不跳过文案。
  const scene = pool[hash(`${state.rng.seed}:${npcId}:${gameDay(state.time)}:${visit}:chat`) % pool.length];
  return scene ? { sceneId: scene.id, kind: scene.kind, stageKey: scene.stageKey, nodeId: scene.startNodeId, title: scene.title } : undefined;
}

export function remasterScene(npcId: string, sceneId: string | undefined): NpcRemasterScene | undefined {
  return sceneId ? npcDialogueRemasterData()[npcId]?.scenes[sceneId] : undefined;
}

function dailyPlayedDayFlagKey(npcId: string, sceneId: string): string {
  return `npc_remaster_daily_day_${npcId}_${sceneId}`;
}

export function remasterProfile(npcId: string): NpcRemasterProfile | undefined {
  return npcDialogueRemasterData()[npcId]?.profile;
}

/** 成功结算后的日常/特殊互动记录触发条件；初见及取消不推进连续计数。 */
export function recordRemasterConversation(
  state: GameState,
  npcId: string,
  sceneId: string | undefined,
  options: NpcTalkOption[],
): void {
  const scene = remasterScene(npcId, sceneId);
  if (!scene) return;
  if (scene.kind === "topic") {
    state.flags[`npc_remaster_topic_seen_${npcId}_${scene.id}`] = true;
    const talksKey = `npc_remaster_talks_${npcId}`;
    state.flags[talksKey] = numberFlag(state, talksKey) + 1;
    recordVisitStreaks(state,npcId,options,true);
    return;
  }
  if (scene.kind === "event") {
    state.flags[eventSeenFlagKey(npcId, scene.id)] = true;
    state.flags[eventDayFlagKey(npcId, scene.id)] = gameDay(state.time);
    {
      const talksKey = `npc_remaster_talks_${npcId}`;
      state.flags[talksKey] = numberFlag(state, talksKey) + 1;
      recordVisitStreaks(state, npcId, options, true);
    }
    return;
  }
  if (scene.kind !== "daily") return;

  const talksKey = `npc_remaster_talks_${npcId}`;
  state.flags[talksKey] = numberFlag(state, talksKey) + 1;
  state.flags[dailySeenFlagKey(npcId, scene.id)] = true;
  state.flags[dailyPlayedDayFlagKey(npcId, scene.id)] = gameDay(state.time);
  recordVisitStreaks(state, npcId, options, true);
}

const REMASTER_HINTS: Record<string, string> = {
  npc_lin_xiaoyu: "我每隔几天会在咖啡馆坐一会儿，安静的时候画得出来。",
  npc_chen_jie: "周末店里会慢一点，我通常会在前台把事情理顺。",
  npc_librarian: "闭馆前总有些书没归位，那个时候馆里最安静。",
  npc_flower_market_owner: "花市的熟客都会记得常买的花色，买得多了，摊主就知道你喜欢什么。",
  npc_snack_street_vendor: "同一道菜多点几回，我才能摸准你喜欢哪种火候。",
  npc_suburb_farmer: "农场这边的活儿每天都在变，愿意来搭把手就来。",
};

/** 在普通日常里偶尔放出不带数字的自然线索，不直接暴露条件字段。 */
export function hintFor(state: GameState, npcId: string, sceneId: string | undefined): string | undefined {
  const scene = remasterScene(npcId, sceneId);
  if (!scene || scene.kind !== "daily") return undefined;
  if (scene.id.startsWith("reset_daily_")) return undefined;
  void state;
  return REMASTER_HINTS[npcId];
}



export function remasterSceneReward(npcId: string, sceneId: string | undefined): { itemId: string; text: string } | undefined {
  return remasterScene(npcId, sceneId)?.reward;
}

let remasterCache: Record<string, NpcRemasterData> | undefined;
/** Parse the authored dialogue only when an NPC registry or conversation first needs it. */
export function npcDialogueRemasterData(): Record<string, NpcRemasterData> {
  return remasterCache ??= Object.fromEntries(
    Object.entries(parseRemasterData(sourceText)).filter(([id]) => npcData.some((npc) => npc.id === id)),
  );
}

/** Lazy compatibility view: authored dialogue is parsed only when consumers read it. */
export const NPC_DIALOGUE_REMASTER: Record<string, NpcRemasterData> = new Proxy({}, {
  get(_target, property) {
    return typeof property === "string" ? npcDialogueRemasterData()[property] : undefined;
  },
  has(_target, property) {
    return typeof property === "string" && property in npcDialogueRemasterData();
  },
  ownKeys() {
    return Reflect.ownKeys(npcDialogueRemasterData());
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") return undefined;
    const value = npcDialogueRemasterData()[property];
    return value === undefined ? undefined : { configurable: true, enumerable: true, value };
  },
});
