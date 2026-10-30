import { describe, expect, it } from "vitest";
import { createTitleTapCounter, readDeveloperAccess, writeDeveloperAccess, DEVELOPER_STORAGE_KEY } from "../src/lib/developerAccess";
import { createInitialState } from "../src/game/core/state";
import { executeDeveloperAction, importDeveloperJson, type DeveloperAction } from "../src/game/core/developer";
import { DEVELOPER_TASK_PRESETS } from "../src/game/core/developerTasks";
import { executeNpcTaskAction, getNpcTaskQuest, npcTaskNow } from "../src/game/core/npcTasks";
import { ensureRelationship } from "../src/game/core/relationships";
import { allNpcs, npcAtLocation } from "../src/game/core/npcs";
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from "../src/game/core/calendar";
import { ITEMS } from "../src/game/core/items";
import { CATS } from "../src/game/core/cat";
import { JOB_DEFS } from "../src/game/core/jobs";
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from "../src/game/data/npcIntroductionProgress";
import type { NpcTaskId } from "../src/game/npcTaskTypes";
import type { GameState } from "../src/game/types";
const enabled = { unlocked: true, enabled: true };
function initial() {
  const s = createInitialState(149210); Object.assign(s.time, { day: 3, hour: 9, minute: 0 });
  s.locationId = "labor_market"; s.region = "downtown_industrial";
  for (const def of allNpcs()) ensureRelationship(s, def.id).affinity = 40;
  s.flags[INTRO_FIRST_COMPLETE] = true; s.flags[INTRO_SECOND_COMPLETE] = true;
  return s;
}
function run(s: GameState, action: DeveloperAction): GameState {
  const result = executeDeveloperAction(s, enabled, action); expect(result, JSON.stringify(action)).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.message); return result.state;
}
describe("标题解锁和权限", () => {
  it("前9次不解锁，第10次解锁，隔太久或明确打断重计", () => {
    const c = createTitleTapCounter(); for (let i = 0; i < 9; i++) expect(c.tap(i * 100)).toBe(false); expect(c.tap(900)).toBe(true);
    for (let i = 0; i < 5; i++) c.tap(1000 + i * 100);
    expect(c.tap(5000)).toBe(false); for (let i = 1; i <= 8; i++) expect(c.tap(5000 + i * 100)).toBe(false);
    expect(c.tap(5900)).toBe(true); c.tap(6000); c.reset(); for (let i = 1; i <= 9; i++) expect(c.tap(6000 + i)).toBe(false);
  });
  it("存储损坏和伪造enabled不能绕过未解锁状态", () => {
    expect(readDeveloperAccess({ getItem: () => '{"enabled":true}' })).toEqual({ unlocked: false, enabled: false });
    expect(readDeveloperAccess({ getItem: () => "broken" })).toEqual({ unlocked: false, enabled: false });
    const values: Record<string, string> = {}, storage = { getItem: (key: string) => values[key], setItem: (key: string, value: string) => { values[key] = value; } };
    writeDeveloperAccess({ unlocked: true, enabled: false }, storage); expect(JSON.parse(values[DEVELOPER_STORAGE_KEY])).toEqual({ unlocked: true, enabled: false });
    writeDeveloperAccess(enabled, storage); expect(readDeveloperAccess(storage)).toEqual(enabled);
  });
  it.each([{ unlocked: false, enabled: false }, { unlocked: false, enabled: true }, { unlocked: true, enabled: false }])("权限%j不能修改任何资产", (access) => {
    const s = initial(), before = JSON.stringify(s); expect(executeDeveloperAction(s, access, { type: "money", mode: "add", value: 1000 }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
  });
});
describe("开发工具事务和正常游戏数据", () => {
  it("改钱不伪造工资，成功和失败均不改输入对象", () => {
    const s = initial(), before = JSON.stringify(s); const edited = run(s, { type: "money", mode: "set", value: 123456.78 });
    expect(edited.player.money).toBe(123456.78); expect(edited.work?.wageRecords).toEqual(s.work?.wageRecords); expect(JSON.stringify(s)).toBe(before);
    expect(executeDeveloperAction(s, enabled, { type: "money", mode: "add", value: Infinity }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
  });
  it("物品增设删和分类批量生成包含正式任务物品", () => {
    let s = run(initial(), { type: "item", id: "task_toy_bear", mode: "add", quantity: 2 });
    s = run(s, { type: "item", id: "task_toy_bear", mode: "set", quantity: 5 }); expect(s.inventory.task_toy_bear).toBe(5);
    s = run(s, { type: "item", id: "task_toy_bear", mode: "set", quantity: 0 }); expect(s.inventory.task_toy_bear).toBeUndefined();
    s = run(s, { type: "itemBatch", group: "quest_items", quantity: 2 }); expect(s.inventory.task_toy_bear).toBe(2); expect(s.inventory.task_toy_ticket).toBe(2); expect(s.inventory.task_vegetable_crate).toBeUndefined();
  });
  it("移除装备不会留下加成，基础衣物不能删成缺失", () => {
    let s = initial(); const jacket = s.equipped.clothes!;
    s = run(s, { type: "item", id: jacket, mode: "set", quantity: 0 }); expect(s.equipped.clothes).not.toBe(jacket); expect(s.inventory[jacket]).toBeUndefined();
    const equipped = s.equipped.clothes!;
    const before = JSON.stringify(s); const result = executeDeveloperAction(s, enabled, { type: "item", id: equipped, mode: "set", quantity: 0 });
    expect(result.ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
    const added = run(s, { type: "item", id: "fridge_small", mode: "set", quantity: 1 });
    const removed = run(added, { type: "item", id: "fridge_small", mode: "set", quantity: 0 }); expect(removed.inventory.fridge_small).toBeUndefined();
    delete removed.flags.doc_city_guide_awarded;
    expect(importDeveloperJson(JSON.stringify(removed)).equipped.clothes).toBe(s.equipped.clothes);
  });
  it("技能、成长、恢复和复活维持有效范围", () => {
    let s = run(initial(), { type: "player", group: "stats", key: "fitness", value: 80 }); expect(s.player.baseStats?.fitness).toBe(80);
    s = run(s, { type: "player", group: "skills", key: "cooking", value: 9.5 }); expect(s.player.skills.cooking).toBe(9.5);
    s.player.attrs.health = 1; s.player.stress = 95; s.endingId = "test";
    s = run(s, { type: "revive" }); expect(s.endingId).toBeNull(); expect(s.player.attrs.health).toBe(100); expect(s.player.stress).toBe(0);
    expect(executeDeveloperAction(s, enabled, { type: "player", group: "stats", key: "fitness", value: 101 }).ok).toBe(false);
  });
  it("认识、拉黑解除、未认识和联系人状态使用正式关系结构", () => {
    let s = run(initial(), { type: "npc", id: "npc_zhao_gang", affinity: 70, relation: "blocked", met: true });
    s = run(s, { type: "npc", id: "npc_zhao_gang", affinity: 40, relation: "auto", met: true }); expect(s.relationships.find((r) => r.npcId === "npc_zhao_gang")?.state).toBe("friend");
    s = run(s, { type: "npc", id: "npc_zhao_gang", affinity: 0, relation: "auto", met: false }); expect(s.relationships.some((r) => r.npcId === "npc_zhao_gang")).toBe(false); expect(s.contacts.some((c) => c.npcId === "npc_zhao_gang")).toBe(false);
    expect(executeDeveloperAction(s, enabled, { type: "npc", id: "npc_zhao_gang", affinity: 80, relation: "lover", met: true }).ok).toBe(false);
  });
  it("重置日常次数不删除会话幂等游标或已读剧情", () => {
    const s = initial(); s.flags.npc_chat_count_npc_zhao_gang = 5; s.flags.npc_chat_day_npc_zhao_gang = gameDay(s.time); s.flags.npc_talk_commit_cursor_npc_zhao_gang = 99; s.flags.npc_remaster_event_seen_npc_zhao_gang_x = true;
    const next = run(s, { type: "resetChats", id: "npc_zhao_gang" }); expect(next.flags.npc_chat_count_npc_zhao_gang).toBeUndefined(); expect(next.flags.npc_talk_commit_cursor_npc_zhao_gang).toBe(99); expect(next.flags.npc_remaster_event_seen_npc_zhao_gang_x).toBe(true);
  });
  it("跨年定位使用30天日历，正常推进与直接定位有不同日结语义", () => {
    let s = run(initial(), { type: "date", year: 2026, month: 12, day: 30, hour: 23, minute: 30 });
    s = run(s, { type: "advance", minutes: 60 }); expect(s.time).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0, minute: 30 });
    expect(executeDeveloperAction(s, enabled, { type: "date", year: 2026, month: 8, day: 31, hour: 10, minute: 0 }).ok).toBe(false);
  });
  it("活动进行中阻止改日期或传送，明确取消后可以办理", () => {
    const s = initial(); s.work!.active = { id: "test", status: "paused" } as any;
    expect(executeDeveloperAction(s, enabled, { type: "advance", minutes: 60 }).ok).toBe(false);
    expect(executeDeveloperAction(s, enabled, { type: "teleport", locationId: "map", regionId: "downtown_station" }).ok).toBe(false);
    const next = run(s, { type: "cancelActivity" }); expect(next.work?.active).toBeUndefined(); expect(run(next, { type: "teleport", locationId: "map", regionId: "downtown_station" }).region).toBe("downtown_station");
  });
  it("传送建立正确导航栈，NPC定位服从真实日程", () => {
    const s = run(initial(), { type: "teleport", locationId: "snack_street", regionId: "downtown_station" }); expect(s.navStack).toEqual(["map", "downtown", "downtown_station"]);
    expect(executeDeveloperAction(s, enabled, { type: "teleport", locationId: "snack_street", regionId: "boyue_night_market" }).ok).toBe(false);
    const found = run(s, { type: "findNpc", id: "npc_jack_fanma", next: true }); expect(npcAtLocation("npc_jack_fanma", found.locationId, { ...found.time, weekday: weekdayOf(found.time), seed: found.rng.seed, regionId: found.region })).toBe(true);
  });
  it("天气、标记、载具、会籍、宠物和职业形成正式可用数据", () => {
    let s = run(initial(), { type: "weather", id: "rain" }); expect(s.weather).toEqual({ id: "rain", lastRollDay: gameDay(s.time) });
    s = run(s, { type: "flag", key: "test_progress", value: 3 }); expect(s.flags.test_progress).toBe(3);
    expect(executeDeveloperAction(s, enabled, { type: "flag", key: "__proto__", value: true }).ok).toBe(false);
    s = run(s, { type: "vehicle", id: "car", owned: true }); expect(s.vehicles.car.owned).toBe(true);
    s = run(s, { type: "membership", id: "gym", days: 30 }); expect(s.inventory.gym_card).toBe(1); expect(s.memberships.gym).toEqual(fromLinearDay(START_EPOCH + gameDay(s.time) + 30));
    s = run(s, { type: "cat", id: CATS.find((c) => c.rarity !== "boss")!.id }); expect(s.pets[0].cardPack?.length).toBeGreaterThan(0);
    s = run(s, { type: "catLevel", uid: s.pets[0].uid, level: 80 }); expect(s.pets[0].level).toBe(80);
    s = run(s, { type: "job", id: JOB_DEFS.find((j) => j.kind === "formal")!.id }); expect(s.career.nextShiftDay).toBeTypeOf("number"); expect(s.career.nextPayDay).toBeTypeOf("number");
  });
  it("完整状态导入保留任务，坏JSON和残缺状态不会写回", () => {
    const s = run(initial(), { type: "task", id: "zhao_staff", preset: "reported" }); expect(importDeveloperJson(JSON.stringify(s)).quests.find((q) => q.npcTask)?.npcTask?.stage).toBe("await_staff_result");
    expect(() => importDeveloperJson('{"version":34}')).toThrow(); const bad = JSON.parse(JSON.stringify(s)); bad.flags.unknown = "hello"; expect(() => importDeveloperJson(JSON.stringify(bad))).toThrow();
    expect(() => importDeveloperJson('{"__proto__":{}}')).toThrow(); expect(executeDeveloperAction(s, enabled, { type: "import", json: "broken" }).ok).toBe(false);
  });
  it("城市总地图没有region字段时仍可原样导入", () => {
    const s = initial(); s.locationId = "map"; s.region = undefined; s.area = undefined; s.navStack = ["map"];
    const restored = importDeveloperJson(JSON.stringify(s)); expect(restored.locationId).toBe("map"); expect(restored.region).toBeUndefined();
  });
});
describe("NPC任务调试场景能进入正式流程", () => {
  for (const [id, presets] of Object.entries(DEVELOPER_TASK_PRESETS)) it.each(presets)(`${id} / $id 准备不发奖励，保留另一实体任务并清理旧占位`, (preset) => {
    const other = id === "zhao_toy" ? "zhao_staff" : "zhao_toy";
    const s = run(initial(), { type: "task", id: other, preset: "start" });
    const kept = structuredClone(getNpcTaskQuest(s, other));
    s.quests.push({ id: "old", type: "story", title: "旧占位", icon: "", desc: "", day: 0, status: "active", commission: { npcId: "npc_other" } as any });
    const next = run(s, { type: "task", id: id as NpcTaskId, preset: preset.id });
    expect(next.player.money).toBe(s.player.money);
    expect(next.quests.find((q) => q.id === "old")).toBeUndefined();
    expect(getNpcTaskQuest(next, other)).toEqual(kept);
    const q = getNpcTaskQuest(next, id as NpcTaskId); if (preset.id === "reset") expect(q).toBeUndefined(); else expect(q?.npcTask?.taskId).toBe(id);
  });
  it("赵刚名单今天交付不发钱，次日才走正式结算", () => {
    const today = run(initial(), { type: "task", id: "zhao_staff", preset: "reported" }), money = today.player.money;
    expect(executeNpcTaskAction(today, "npc_zhao_gang", { taskId: "zhao_staff", action: "staff_claim_commission" }).ok).toBe(false);
    const tomorrow = run(today, { type: "date", ...fromLinearDay(START_EPOCH + gameDay(today.time) + 1), hour: 9, minute: 0 });
    const result = executeNpcTaskAction(tomorrow, "npc_zhao_gang", { taskId: "zhao_staff", action: "staff_claim_commission" }); expect(result.ok).toBe(true); expect(result.state!.player.money).toBe(money + 120);
    expect(executeNpcTaskAction(result.state!, "npc_zhao_gang", { taskId: "zhao_staff", action: "staff_claim_commission" }).ok).toBe(false);
  });
});
