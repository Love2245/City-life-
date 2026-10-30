import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { getNpcDef, allNpcs } from "../src/game/core/npcs";
import { beginNpcConversation, advanceNpcConversation, commitNpcConversation, cancelNpcConversation, npcConversationView } from "../src/game/core/npcTalk";
import { npcPortraitRevealed } from "../src/game/core/npcFamiliarity";
import type { GameState } from "../src/game/types";
import { migrateSave } from "../src/game/core/migrate";
import { SHARED_INTRO_NPCS } from '../src/game/data/npcIntroductionProgress';

function encounterState(npcId: string, locationId: string): GameState {
  const schedule = getNpcDef(npcId)!.weeklySchedule!.find(row => row.locationId === locationId)!;
  for (let seed = 1; seed <= 40; seed++) {
    for (let day = 1; day <= 7; day++) {
      const state = createInitialState(seed);
      state.time.day = day;
      state.time.hour = schedule.hourRange?.[0] ?? 12;
      state.locationId = locationId;
      if (schedule.regionId) state.region = schedule.regionId;
      if (beginNpcConversation(state, npcId, "meet").ok) return state;
    }
  }
  throw new Error(`No scheduled encounter: ${npcId}/${locationId}`);
}

describe("首次相遇跟随实际地点", () => {
  it("老工头在劳务市场保留原初见，在小吃街改为饭桌偶遇并能结算", () => {
    const regular = encounterState("npc_zhao_gang", "labor_market");
    const regularSession = beginNpcConversation(regular, "npc_zhao_gang", "meet").session!;
    expect(npcConversationView(regular, regularSession)!.text).toContain("这张是样表");
    const state = encounterState("npc_zhao_gang", "snack_street");
    const session = beginNpcConversation(state, "npc_zhao_gang", "meet").session!;
    expect(npcConversationView(state, session)!.text).toContain("热汤");
    expect(npcConversationView(state, session)!.text).not.toContain("期望工种");
    const ended = advanceNpcConversation(state, session, 0).session!;
    const result = commitNpcConversation(state, ended);
    expect(result.ok).toBe(true);
    expect(result.state!.relationships.some(row => row.npcId === "npc_zhao_gang")).toBe(true);
    expect(result.state!.flags.npc_dialogue_days_npc_zhao_gang).toBe(1);
    expect(commitNpcConversation(result.state!, ended).ok).toBe(false);
  });

  it("全部非原驻地排班都有可提交的场景初见，直接退出不会建立关系或累计天数", () => {
    for (const npc of allNpcs()) {
      if(SHARED_INTRO_NPCS.some(id=>id===npc.id))continue;
      for (const row of npc.weeklySchedule ?? []) {
        if (row.locationId === npc.meetLocation) continue;
        const state = encounterState(npc.id, row.locationId);
        const session = beginNpcConversation(state, npc.id, "meet").session!;
        expect(session.encounterNode, `${npc.id}/${row.locationId}`).toBeDefined();
        const result = commitNpcConversation(state, advanceNpcConversation(state, session, 0).session!);
        expect(result.ok, result.reason).toBe(true);
        const cancelled = commitNpcConversation(state, cancelNpcConversation(session));
        expect(cancelled.ok).toBe(false);
        const left = commitNpcConversation(state, advanceNpcConversation(state, session, 1).session!);
        expect(left.ok).toBe(true);
        expect(left.state?.flags[`npc_dialogue_days_${npc.id}`]).toBeUndefined();
        expect(state.relationships).toHaveLength(0);
      }
    }
  });

  it("换地点后不能提交之前的偶遇对话", () => {
    const state = encounterState("npc_zhao_gang", "snack_street");
    const session = beginNpcConversation(state, "npc_zhao_gang", "meet").session!;
    const ended = advanceNpcConversation(state, session, 0).session!;
    state.locationId = "labor_market"; state.time.hour = 10;
    expect(commitNpcConversation(state, ended).ok).toBe(false);
  });
});

describe("累计对话日与清晰立绘互不限制", () => {
  it("正常结算按不同日期累计，同一天重复交谈和取消不刷天数，保存读回仍保留", () => {
    let state = encounterState("npc_zhao_gang", "snack_street");
    let first = beginNpcConversation(state, "npc_zhao_gang", "meet").session!;
    state = commitNpcConversation(state, advanceNpcConversation(state, first, 0).session!).state!;
    expect(npcPortraitRevealed(state, "npc_zhao_gang")).toBe(true);
    const firstDay = state.time.day;
    for (let offset = 0; offset < 3; offset++) {
      state.time.day = firstDay + [0, 2, 5][offset]; state.time.hour = offset === 0 ? 17 : 10; state.time.minute = 0;
      if (offset > 0) { state.locationId = "labor_market"; state.region = "downtown_industrial"; }
      const session = beginNpcConversation(state, "npc_zhao_gang", "chat").session!;
      expect(session).toBeDefined();
      const ended = advanceNpcConversation(state, session, 0).session!;
      const result = commitNpcConversation(state, { ...ended, status: "ended", endReason: "leave" });
      expect(result.ok, result.reason).toBe(true);
      state = result.state!;
      expect(state.flags.npc_dialogue_days_npc_zhao_gang).toBe(Math.min(3, offset + 1));
      expect(npcPortraitRevealed(state, "npc_zhao_gang")).toBe(true);
    }
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)));
    loaded.time.day += 5;
    expect(npcPortraitRevealed(loaded, "npc_zhao_gang")).toBe(true);
  });
});
