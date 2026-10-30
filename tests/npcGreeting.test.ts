import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  advanceNpcConversation,
  beginNpcConversation,
  commitNpcConversation,
  npcConversationView,
} from "../src/game/core/npcTalk";
import { ensureRelationship } from "../src/game/core/relationships";
import { gameDay } from "../src/game/core/calendar";
import { getNpcDef } from "../src/game/core/npcs";
import { remasterConversationStart, remasterScene } from "../src/game/data/npcDialogueRemaster";
import {
  GREETING_TIME_COST,
  greetingScriptTexts,
  npcGreetingNode,
} from "../src/game/data/npcGreetings";
import type { GameState } from "../src/game/types";
import {NPC_CONTEXT_DIALOGUES,contextDialogueDayFlag} from '../src/game/data/npcContextDialogues';

/** 把玩家放到指定地点/时刻，并让目标 NPC 正好在场；重复地点 ID 的咖啡馆/网吧明确采用住宅区实例。 */
function at(state: GameState, locationId: string, hour: number): GameState {
  state.locationId = locationId;
  state.region = locationId === "cafe" || locationId === "internet_cafe"
    ? "downtown_residential"
    : locationId === "snack_street" ? "downtown_station" : "downtown_center";
  state.time.hour = hour;
  state.time.minute = 0;
  state.player.attrs.stamina = 90;
  // 本文件核对场景短稿用完后的旧问候；真实优先级另由 npcContextRewards 覆盖。
  for(const scene of Object.values(NPC_CONTEXT_DIALOGUES))state.flags[contextDialogueDayFlag(scene.id)]=gameDay(state.time);
  return state;
}

/** 林小雨：住宅区的 cafe 每天 7–9h（见 npcs.json weeklySchedule）。 */
const LIN = { id: "npc_lin_xiaoyu", loc: "cafe", hour: 8 };
/** 马师傅：snack_street 周一–六全天，可用来验证深夜问候。 */
const MA = { id: "npc_snack_street_vendor", loc: "snack_street", hour: 23 };

function fresh(): GameState {
  const s = createInitialState(21);
  s.living.govDaysLeft = 30;
  s.time.day = 3;
  ensureRelationship(s, LIN.id);
  ensureRelationship(s, MA.id);
  return s;
}

function chatWith(state: GameState, npcId: string) {
  const begin = beginNpcConversation(state, npcId, "chat");
  expect(begin.ok, begin.reason).toBe(true);
  return begin.session!;
}

describe("v1.43 NPC 每日首次问候（按地点 / 时段）", () => {
  it("当天第一次搭话给的是地点问候，而不是日常池", () => {
    const s = at(fresh(), LIN.loc, LIN.hour);
    const session = chatWith(s, LIN.id);
    const view = npcConversationView(s, session)!;

    expect(session.greetingNode).toBeDefined();
    expect(view.conversationKind).toBe("greeting");
    // 台词必须来自「林小雨 × cafe」的脚本，而不是通用兜底
    const key = greetingScriptTexts().find((t) => t.text === view.text)?.key;
    expect(key).toBe(`${LIN.id}/cafe`);
  });

  it("问候只有一轮：两个选项都是结束型", () => {
    const s = at(fresh(), LIN.loc, LIN.hour);
    const view = npcConversationView(s, chatWith(s, LIN.id))!;
    expect(view.options).toHaveLength(2);
    expect(view.options.some((o) => o.leave)).toBe(true);
    for (const option of view.options) {
      expect(option.next).toBeUndefined();
      expect(option.nextStage).toBeUndefined();
    }
  });

  it("问候结束后：同一天第二次搭话走正常日常池", () => {
    const s = at(fresh(), LIN.loc, LIN.hour);
    const session = chatWith(s, LIN.id);
    const done = advanceNpcConversation(s, session, 0); // 选「回应一句」
    const commit = commitNpcConversation(s, done.session!);
    expect(commit.ok).toBe(true);
    const next = commit.state!;
    expect(next.flags[`npc_greet_day_${LIN.id}`]).toBe(gameDay(next.time));

    const second = at(next, LIN.loc, LIN.hour);
    const session2 = chatWith(second, LIN.id);
    expect(session2.greetingNode).toBeUndefined();
    expect(remasterScene(LIN.id, session2.sceneId)?.kind).toBe("daily");
  });

  it("问候很轻：只花 0.1 小时，且不计入特殊事件的访问次数", () => {
    const s = at(fresh(), LIN.loc, LIN.hour);
    const talksKey = `npc_remaster_talks_${LIN.id}`;
    const before = Number(s.flags[talksKey] ?? 0);
    const session = chatWith(s, LIN.id);
    const done = advanceNpcConversation(s, session, 0);
    const commit = commitNpcConversation(s, done.session!);

    expect(commit.ok).toBe(true);
    expect(commit.summary!.timeCost).toBe(GREETING_TIME_COST);
    expect(Number(commit.state!.flags[talksKey] ?? 0)).toBe(before);
  });

  it("跨到第二天会重新问候", () => {
    const s = at(fresh(), LIN.loc, LIN.hour);
    const day0 = gameDay(s.time);
    const session = chatWith(s, LIN.id);
    const commit = commitNpcConversation(s, advanceNpcConversation(s, session, 0).session!);
    const next = commit.state!;
    expect(next.flags[`npc_greet_day_${LIN.id}`]).toBe(day0);

    next.time.day += 1; // 进入下一个自然日
    expect(gameDay(next.time)).toBe(day0 + 1);
    at(next, LIN.loc, LIN.hour);
    expect(chatWith(next, LIN.id).greetingNode).toBeDefined();
  });

  it("初见不受影响：meet 永远走固定初见场景", () => {
    const s = at(createInitialState(21), "cafe", 8);
    s.living.govDaysLeft = 30;
  s.time.day = 3;
    const begin = beginNpcConversation(s, LIN.id, "meet");
    expect(begin.ok, begin.reason).toBe(true);
    expect(begin.session!.greetingNode).toBeUndefined();
  });

  it("完成初见后同一天再搭话走日常池（初见本身已算当天的一次交流）", () => {
    const s = at(createInitialState(21), "cafe", 8);
    s.living.govDaysLeft = 30;
  s.time.day = 3;
    const meet = beginNpcConversation(s, LIN.id, "meet");
    expect(meet.ok, meet.reason).toBe(true);

    let session = meet.session!;
    for (let step = 0; step < 12 && session.status === "active"; step += 1) {
      const view = npcConversationView(s, session)!;
      const index = view.options.findIndex((o) => !o.leave);
      session = advanceNpcConversation(s, session, index >= 0 ? index : view.options.length - 1).session!;
    }
    const committed = commitNpcConversation(s, session);
    expect(committed.ok).toBe(true);
    const next = at(committed.state!, LIN.loc, LIN.hour);

    expect(next.flags[`npc_greet_day_${LIN.id}`]).toBe(gameDay(next.time));
    const again = chatWith(next, LIN.id);
    expect(again.greetingNode).toBeUndefined();
    expect(remasterScene(LIN.id, again.sceneId)?.kind).toBe("daily");
  });

  it("深夜问候会换成「这么晚还在外面」一类的台词", () => {
    const s = at(fresh(), MA.loc, MA.hour);
    const view = npcConversationView(s, chatWith(s, MA.id))!;
    const key = greetingScriptTexts().find((t) => t.text === view.text)?.key;
    expect(key).toBe(`${MA.id}/late`);
  });

  it("特殊事件优先：问候不会顶掉天气 / 时段 / 连续访问触发的特殊事件", () => {
    const errors: string[] = [];
    for (let day = 1; day <= 28; day++) {
      for (const hour of [7, 8, 14, 21]) {
        const s = at(fresh(), LIN.loc, hour);
        s.time.day = day;
        s.weather = { id: day % 3 === 0 ? "rain" : "sunny", lastRollDay: day };
        const stage = remasterConversationStart(s, LIN.id, "acquaintance");
        if (stage?.kind !== "event") continue;
        const session = chatWith(s, LIN.id);
        if (session.greetingNode) errors.push(`day${day} ${hour}h 用问候顶掉了特殊事件`);
      }
    }
    expect(errors, errors.slice(0, 5).join("\n")).toHaveLength(0);
  });
});

describe("v1.43 问候脚本覆盖度（每个 NPC × 排班地点都必须有专属台词）", () => {
  it("排班里的每个地点都能取到该 NPC 的专属问候，而不是通用兜底", () => {
    const byText = new Map(greetingScriptTexts().map((t) => [t.text, t.key]));
    const missing: string[] = [];
    for (const npc of allScheduleNpcs()) {
      for (const loc of npc.locations) {
        // 12 点属于「常规」时段，必然会走地点脚本
        const node = npcGreetingNode(npc.id, loc, 12, 1);
        if (!node) {
          missing.push(`${npc.id}/${loc} 无问候`);
          continue;
        }
        if (byText.get(node.text) !== `${npc.id}/${loc}`) {
          missing.push(`${npc.id}/${loc} 落到通用兜底：「${node.text}」`);
        }
      }
    }
    expect(missing, missing.slice(0, 10).join("\n")).toHaveLength(0);
  });
});

/** 从 npcs.json 排班中抽出「NPC → 会出现的所有地点」。 */
function allScheduleNpcs(): Array<{ id: string; locations: string[] }> {
  const ids = [
    "npc_lin_xiaoyu",
    "npc_zhao_gang",
    "npc_chen_jie",
    "npc_wang_lei",
    "npc_netbar_boss",
    "npc_librarian",
    
    "npc_flower_market_owner",
    "npc_snack_street_vendor",
    
    "npc_suburb_farmer",
  ];
  return ids.map((id) => {
    const def = getNpcDef(id) as { weeklySchedule?: Array<{ locationId: string }> } | undefined;
    const locations = [...new Set((def?.weeklySchedule ?? []).map((s) => s.locationId))];
    return { id, locations };
  });
}
