import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { ensureRelationship } from "../src/game/core/relationships";
import { performAction } from "../src/game/core/actions";
import { giftNpc } from "../src/game/core/romance";
import { performJob, completeWork, recordWageActionCompletion } from "../src/game/core/jobs";
import { beginNpcFormalConversation, npcFormalTopics, presentNpcs } from "../src/game/core/npcTalk";
import { migrateSave } from "../src/game/core/migrate";
import { dialogueLines } from "../src/game/core/npcPortraits";
import {
  NPC_DIALOGUE_REMASTER,
  NPC_REMASTER_EVENT_CONDITION_DEFINITIONS,
  recordRemasterConversation,
  remasterEligibleEvents,
} from "../src/game/data/npcDialogueRemaster";
import type { GameState } from "../src/game/types";

function fresh(locationId = "labor_market"): GameState {
  const state = createInitialState(1475);
  state.time.year = 2026;
  state.time.month = 8;
  state.time.day = 3; // 周一
  state.time.hour = 10;
  state.time.minute = 0;
  state.locationId = locationId;
  state.region = "downtown_residential";
  state.player.money = 10000;
  state.player.attrs.stamina = 100;
  state.player.attrs.health = 100;
  state.player.attrs.satiety = 100;
  return state;
}

function eligible(state: GameState, npcId: string, sceneId: string, stage: "friend" | "close_friend" = "close_friend"): boolean {
  return remasterEligibleEvents(state, npcId, stage).some((scene) => scene.sceneId === sceneId);
}

function daily(npcId: string): string {
  return NPC_DIALOGUE_REMASTER[npcId].dailySceneIds.close_friend![0];
}

describe("1.475 特殊条件与真实行为入口", () => {
  it("在用 NPC 的原稿日常完整载入，事件都有显式规则，D20 可显示", () => {
    const data = Object.values(NPC_DIALOGUE_REMASTER);
    expect(data).toHaveLength(9);
    const missing = Object.entries(NPC_DIALOGUE_REMASTER).flatMap(([npcId, npc]) =>
      Array.from({ length: 25 }, (_, i) => i + 1).filter((i) => !Object.values(npc.scenes).some((scene) => scene.kind === "daily" && scene.id.endsWith(`_d${i}`))).map((i) => `${npcId}:D${i}`),
    );
    // 陈姐的源稿只有 D1–D24，不能为凑数补写未获授权的新对白。
    expect(missing).toEqual(["npc_chen_jie:D25"]);
    expect(data.flatMap((npc) => Object.values(npc.scenes)).filter((scene) => scene.kind === "daily")).toHaveLength(224);
    const events = Object.entries(NPC_DIALOGUE_REMASTER).flatMap(([npcId, npc]) =>
      Object.values(npc.scenes).filter((scene) => scene.kind === "event").map((scene) => `${npcId}:${scene.id}`),
    );
    expect(events).toHaveLength(31);
    expect(events.sort()).toEqual(Object.keys(NPC_REMASTER_EVENT_CONDITION_DEFINITIONS).sort());
    for (const npcId of ["npc_chen_jie", "npc_flower_market_owner", "npc_snack_street_vendor", "npc_suburb_farmer"]) {
      const npc = NPC_DIALOGUE_REMASTER[npcId];
      const scene = Object.values(npc.scenes).find((candidate) => candidate.kind === "daily" && candidate.id.endsWith("_d20"))!;
      expect(scene, npcId).toBeDefined();
      expect(dialogueLines(npc.talk.close_friend!.nodes[scene.startNodeId].text), npcId).not.toHaveLength(0);
    }
  });

  it("雨天剧情使用当前雨天，历史雨聊与雪天不代替当前天气", () => {
    const state = fresh("cafe");
    const npcId = "npc_lin_xiaoyu";
    state.flags[`npc_remaster_rain_talks_${npcId}`] = 20;
    state.weather.id = "sunny";
    expect(eligible(state, npcId, "event_2")).toBe(false);
    state.weather.id = "snow";
    expect(eligible(state, npcId, "event_2")).toBe(false);
    delete state.flags[`npc_remaster_rain_talks_${npcId}`];
    state.weather.id = "rain";
    expect(eligible(state, npcId, "event_2")).toBe(true);
  });

  it("赵刚的事件 A 或 B 任一满足即可，并且续篇仍要求先完成事件 C", () => {
    const state = fresh();
    const npcId = "npc_zhao_gang";
    expect(eligible(state, npcId, "event_c", "friend")).toBe(false);
    for (const eventId of ["event_a", "event_b"]) {
      state.flags[`npc_remaster_event_seen_${npcId}_event_a`] = false;
      state.flags[`npc_remaster_event_seen_${npcId}_event_b`] = false;
      state.flags[`npc_remaster_event_seen_${npcId}_${eventId}`] = true;
      expect(eligible(state, npcId, "event_c", "friend")).toBe(true);
    }
    expect(eligible(state, npcId, "event_c_followup_1", "friend")).toBe(false);
    state.flags[`npc_remaster_event_seen_${npcId}_event_c`] = true;
    expect(eligible(state, npcId, "event_c_followup_1", "friend")).toBe(true);
  });

  it("带过吃的读取实际成功赠礼，失败和仅持有水果不记，并可保存载入", () => {
    const state = fresh();
    const npcId = "npc_zhao_gang";
    ensureRelationship(state, npcId).affinity = 90;
    expect(giftNpc(state, npcId, "fruit").ok).toBe(false);
    state.inventory.fruit = 1;
    expect(eligible(state, npcId, "event_5")).toBe(false);
    expect(giftNpc(state, npcId, "fruit").ok).toBe(true);
    expect(state.inventory.fruit ?? 0).toBe(0);
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(eligible(loaded, npcId, "event_5")).toBe(true);
  });

  it("删除凌晨网吧排班后，旧03点事件不再能通过实际搭话启动", () => {
    const state = fresh("internet_cafe");
    const npcId = "npc_netbar_boss";
    ensureRelationship(state, npcId).affinity = 90;
    const topicId = "event:event_c";
    expect(npcFormalTopics(state, npcId).some((topic) => topic.id === topicId)).toBe(false);
    state.time.hour = 3;
    expect(presentNpcs(state).some((npc) => npc.id === npcId)).toBe(false);
    expect(beginNpcFormalConversation(state, npcId, topicId).ok).toBe(false);
    state.region = "downtown_center";
    expect(beginNpcFormalConversation(state, npcId, topicId).ok).toBe(false);
    state.region = "downtown_residential";
    state.time.hour = 4;
    expect(beginNpcFormalConversation(state, npcId, topicId).ok).toBe(false);
  });

  it("连续会面按地点与当次条件重置，不把累计统计当作连续次数", () => {
    const state = fresh("cafe");
    const lin = "npc_lin_xiaoyu";
    for (let i = 0; i < 3; i++) recordRemasterConversation(state, lin, daily(lin), [{ label: "陪你坐一会儿" }]);
    expect(eligible(state, lin, "event_1", "friend")).toBe(true);
    state.locationId = "park";
    recordRemasterConversation(state, lin, daily(lin), [{ label: "普通地聊几句" }]);
    state.locationId = "cafe";
    expect(state.flags[`npc_remaster_talks_${lin}`]).toBe(4);
    expect(eligible(state, lin, "event_1", "friend")).toBe(false);

    const zhao = "npc_zhao_gang";
    state.locationId = "labor_market";
    for (let i = 0; i < 5; i++) recordRemasterConversation(state, zhao, daily(zhao), [{ label: "听他说完" }]);
    expect(eligible(state, zhao, "event_6")).toBe(true);
    recordRemasterConversation(state, zhao, daily(zhao), [{ label: "我来帮忙", help: { log: "帮忙", reward: {} } }]);
    expect(eligible(state, zhao, "event_6")).toBe(false);
    for (let i = 0; i < 5; i++) recordRemasterConversation(state, zhao, daily(zhao), [{ label: "听他说完" }]);
    expect(state.flags[`npc_remaster_ever_requested_${zhao}`]).toBe(true);
    expect(eligible(state, zhao, "event_6")).toBe(true);
  });

  it("真实点单推进同菜记录，换菜重置，失败消费不推进，保存载入后继续", () => {
    let state = fresh("snack_street");
    state.region = "downtown_station";
    const npcId = "npc_snack_street_vendor";
    for (let i = 0; i < 2; i++) expect(performAction(state, "snack_street_noodles", { dine: "pack" }).ok).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(false);
    state = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(performAction(state, "snack_street_noodles", { dine: "pack" }).ok).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(true);
    expect(performAction(state, "snack_street_tofu", { dine: "pack" }).ok).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(false);
    const before = state.flags[`npc_remaster_snack_order_streak_${npcId}`];
    state.player.money = 0;
    expect(performAction(state, "snack_street_noodles", { dine: "pack" }).ok).toBe(false);
    expect(state.flags[`npc_remaster_snack_order_streak_${npcId}`]).toBe(before);
  });

  it("真实买花推进，买盆栽打断，失败购买不记", () => {
    const state = fresh("flower_market");
    state.time.day = 7; // 周五
    state.region = "downtown_station";
    const npcId = "npc_flower_market_owner";
    for (let i = 0; i < 3; i++) expect(performAction(state, "buy_flower_flower_market").ok).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(true);
    expect(performAction(state, "buy_plant_flower_market").ok).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(false);
    state.player.money = 0;
    expect(performAction(state, "buy_flower_flower_market").ok).toBe(false);
    expect(state.flags[`npc_remaster_flower_purchase_streak_${npcId}`]).toBe(0);
  });

  it("农场任务只记真实完工，开始与重复回调不增加，其他工作打断", () => {
    const state = fresh("farm");
    state.region = "suburban_farm";
    const npcId = "npc_suburb_farmer";
    for (let i = 0; i < 3; i++) {
      state.time.day = 3 + i;
      state.time.hour = 7;
      state.time.minute = 0;
      state.player.attrs.stamina = 100;
      state.player.attrs.health = 100;
      state.player.attrs.satiety = 100;
      const began = performJob(state, "job_farm_hand");
      expect(began.ok, began.reason).toBe(true);
      expect(state.flags[`npc_remaster_farm_help_streak_${npcId}`] ?? 0).toBe(i);
      const id = began.session!.id;
      expect(completeWork(state, id, 1).ok).toBe(true);
      expect(state.flags[`npc_remaster_farm_help_streak_${npcId}`]).toBe(i + 1);
      expect(completeWork(state, id, 1).ok).toBe(false);
      expect(state.flags[`npc_remaster_farm_help_streak_${npcId}`]).toBe(i + 1);
    }
    expect(eligible(state, npcId, "event_c")).toBe(true);
    expect(recordWageActionCompletion(state, "steel_shift", 80)).toBe(true);
    expect(eligible(state, npcId, "event_c")).toBe(false);
  });

  it("用餐高峰、周末与末班前时段遵守真实地点和当前时间", () => {
    const state = fresh("fast_food");
    state.time.hour = 12;
    expect(eligible(state, "npc_chen_jie", "event_b")).toBe(false);
    state.time.hour = 14;
    expect(eligible(state, "npc_chen_jie", "event_b")).toBe(true);
    state.locationId = "market";
    expect(eligible(state, "npc_chen_jie", "event_b")).toBe(false);
    state.locationId = "park";
    state.flags.npc_remaster_weekend_streak_npc_wang_lei = 3;
    expect(eligible(state, "npc_wang_lei", "event_b")).toBe(false);
    state.time.day = 8; // 周六
    expect(eligible(state, "npc_wang_lei", "event_b")).toBe(true);
    state.locationId = "suburb_bus_station";
    state.time.hour = 17;
    expect(eligible(state, "npc_suburb_station_staff", "event_a", "friend")).toBe(false);
    state.time.hour = 18;
    expect(eligible(state, "npc_suburb_station_staff", "event_a", "friend")).toBe(false);
  });
});
