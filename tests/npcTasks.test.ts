import { describe, expect, it } from "vitest";
import type { GameState } from "../src/game/types";
import type { NpcTaskAction, NpcTaskId } from "../src/game/npcTaskTypes";
import { NPC_TASK_ITEMS } from "../src/game/data/npcTaskData";
import {
  executeNpcTaskAction, getNpcTaskCounterTopics, getNpcTaskDocument, getNpcTaskQuest,
  getNpcTaskTopics, isRetiredNpcCityCommission, isRetiredNpcCommission,
  npcTaskAppointmentDays, npcTaskNow, npcTaskSummary, tickNpcTasks,
} from "../src/game/core/npcTasks";
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from "../src/game/core/calendar";
import { createInitialState } from "../src/game/core/state";
import { ensureRelationship, findRelationship } from "../src/game/core/relationships";
import { npcPresenceAt } from "../src/game/core/npcs";
import { advanceHours } from "../src/game/core/time";

const OWNER = { zhao_toy: "npc_zhao_gang", xiaoyu_print: "npc_lin_xiaoyu", farmer_delivery: "npc_suburb_farmer" };
function fresh(): GameState {
  const state = createInitialState(1492);
  state.time.day = 3; // 周一，gameDay=2。
  state.time.hour = 7;
  state.player.money = 1000;
  for (const id of Object.values(OWNER)) ensureRelationship(state, id).affinity = 20;
  ensureRelationship(state, "npc_netbar_boss");
  return state;
}
function at(state: GameState, locationId: string, hour: number, minute = 0, day = gameDay(state.time), region?: string): GameState {
  Object.assign(state.time, fromLinearDay(START_EPOCH + day), { hour, minute });
  state.locationId = locationId;
  state.region = region ?? ({ cafe: "downtown_residential", fast_food: "downtown_mall", labor_market: "downtown_industrial", farm: "rural", boyue_fast_food: "boyue_mall", snack_street: "downtown_station", internet_cafe: "downtown_residential" } as Record<string, string>)[locationId];
  return state;
}
function act(state: GameState, npcId: string | null, taskId: NpcTaskId, action: string, extra: Partial<NpcTaskAction> = {}): GameState {
  const result = executeNpcTaskAction(state, npcId, { taskId, action, ...extra });
  expect(result.ok, `${taskId}/${action}: ${result.reason}`).toBe(true);
  expect(result.state).toBeDefined();
  return result.state!;
}
function accepted(taskId: NpcTaskId): GameState {
  let state = fresh();
  if (taskId === "zhao_toy") at(state, "labor_market", 9);
  else if (taskId === "xiaoyu_print") at(state, "cafe", 7);
  else at(state, "farm", 7);
  state = act(state, OWNER[taskId], taskId, "accept", taskId === "farmer_delivery" ? { appointmentDay: npcTaskAppointmentDays(state)[0] } : {});
  return state;
}
function withToy(): GameState {
  let state = accepted("zhao_toy");
  at(state, "boyue_fast_food", 10);
  state = act(state, null, "zhao_toy", "buy_toy");
  return at(state, "labor_market", 11);
}
function loaded(): GameState {
  let state = accepted("farmer_delivery");
  const day = getNpcTaskQuest(state, "farmer_delivery")!.npcTask!.data.appointmentDay!;
  at(state, "farm", 8, 0, day);
  state = act(state, OWNER.farmer_delivery, "farmer_delivery", "load_vegetables");
  return state;
}

describe("1.492 NPC实体委托：接取与独立存档", () => {
  it.each(["zhao_toy"] as const)("%s 好感门槛20；拒绝不创建、不计时、不扣好感", (id) => {
    const state = fresh();
    at(state, id === "zhao_toy" ? "labor_market" : id === "xiaoyu_print" ? "cafe" : "farm", id === "zhao_toy" ? 9 : 7);
    ensureRelationship(state, OWNER[id]).affinity = 19;
    expect(getNpcTaskTopics(state, OWNER[id], "formal")).toEqual([]);
    const before = JSON.stringify(state);
    expect(executeNpcTaskAction(state, OWNER[id], { taskId: id, action: "accept" }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    ensureRelationship(state, OWNER[id]).affinity = 20;
    expect(getNpcTaskTopics(state, OWNER[id], "formal")[0].category).toBe("offer");
    const now = npcTaskNow(state);
    const declined = act(state, OWNER[id], id, "decline");
    expect(npcTaskNow(declined)).toBe(now);
    expect(getNpcTaskQuest(declined, id)).toBeUndefined();
    expect(findRelationship(declined, OWNER[id])!.affinity).toBe(20);
    expect(getNpcTaskTopics(declined, OWNER[id], "formal")[0].category).toBe("offer");
  });

  it("任务分别持久化，接取时锁定七天总期限，不使用旧commission", () => {
    let state = accepted("zhao_toy");
    ensureRelationship(state, OWNER.zhao_toy).affinity = 40;
    at(state, "labor_market", 10);
    state = act(state, OWNER.zhao_toy, "zhao_staff", "accept");
    expect(state.quests.filter((q) => q.npcTask)).toHaveLength(2);
    for (const q of state.quests.filter((q) => q.npcTask)) {
      expect(q.commission).toBeUndefined();
      expect(q.npcTask!.deadlineAt - q.npcTask!.acceptedAt).toBe(7 * 1440);
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    advanceHours(state, 24);
    expect(state.quests.filter((q) => q.npcTask)).toHaveLength(2);
  });

  it("只停止指定人物旧自动委托与重复鲜货城市委托的新发放", () => {
    for (const id of Object.values(OWNER)) expect(isRetiredNpcCommission(id, "任意旧占位标题")).toBe(true);
    expect(isRetiredNpcCommission("npc_chen_jie")).toBe(false);
    expect(isRetiredNpcCityCommission("city_fresh_goods_into_town")).toBe(true);
    expect(isRetiredNpcCityCommission("city_netbar_print_samples")).toBe(false);
  });

  it("保留的玩具任务物品不可消耗或普通赠送", () => {
    expect(NPC_TASK_ITEMS).toHaveLength(2);
    for (const item of NPC_TASK_ITEMS) {
      expect(item.consumable).toBe(false);
      expect(item.tags).toEqual(["任务物品"]);
      expect(item.artId).toBeTruthy();
      expect(item.startOffer).toBe(false);
    }
    expect(NPC_TASK_ITEMS.find((i) => i.id === "task_print_good")).toBeUndefined();
  });
});

describe("赵刚：关系分流与实际取得", () => {
  it.each([
    { affinity: 0, stage: "seeking", toy: 0, ticket: 0, clue: false },
    { affinity: 19, stage: "seeking", toy: 0, ticket: 0, clue: false },
    { affinity: 20, stage: "seeking", toy: 0, ticket: 0, clue: true },
    { affinity: 39, stage: "seeking", toy: 0, ticket: 0, clue: true },
    { affinity: 40, stage: "reserved", toy: 0, ticket: 1, clue: false },
    { affinity: 69, stage: "reserved", toy: 0, ticket: 1, clue: false },
    { affinity: 70, stage: "has_toy", toy: 1, ticket: 0, clue: false },
    { affinity: 100, stage: "has_toy", toy: 1, ticket: 0, clue: false },
  ])("陈姐好感$affinity：$stage", ({ affinity, stage, toy, ticket, clue }) => {
    let state = accepted("zhao_toy");
    ensureRelationship(state, "npc_chen_jie").affinity = affinity;
    at(state, "fast_food", 10);
    const beforeMoney = state.player.money;
    state = act(state, "npc_chen_jie", "zhao_toy", "ask_chen");
    const p = getNpcTaskQuest(state, "zhao_toy")!.npcTask!;
    expect(p.stage).toBe(stage);
    expect(state.inventory.task_toy_bear ?? 0).toBe(toy);
    expect(state.inventory.task_toy_ticket ?? 0).toBe(ticket);
    expect(!!p.data.clueBoyue).toBe(clue);
    expect(state.player.money).toBe(beforeMoney);
    expect(state.time.minute).toBe(30);
    expect(findRelationship(state, "npc_chen_jie")!.affinity).toBe(affinity);
    if (stage === "reserved") expect(p.data.reservationPrice).toBe(50);
  });

  it("未问陈姐也可探索泊月柜台，取消和钱不足不改变资产", () => {
    let state = accepted("zhao_toy");
    expect(npcTaskSummary(state, getNpcTaskQuest(state, "zhao_toy")!).lines.join()).not.toContain("泊月");
    expect(getNpcTaskCounterTopics(state)).toHaveLength(0);
    at(state, "boyue_fast_food", 10);
    expect(getNpcTaskCounterTopics(state)).toHaveLength(1);
    const before = JSON.stringify(state);
    state = act(state, null, "zhao_toy", "cancel");
    expect(JSON.stringify(state)).toBe(before);
    state.player.money = 99;
    const insufficient = JSON.stringify(state);
    expect(executeNpcTaskAction(state, null, { taskId: "zhao_toy", action: "buy_toy" }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(insufficient);
    state.player.money = 100;
    state = act(state, null, "zhao_toy", "buy_toy");
    expect(state.player.money).toBe(0);
    expect(state.inventory.task_toy_bear).toBe(1);
    expect(getNpcTaskCounterTopics(state)).toHaveLength(0);
    expect(executeNpcTaskAction(state, null, { taskId: "zhao_toy", action: "buy_toy" }).ok).toBe(false);
  });

  it("周六预约，周日陈姐不在仍可柜台取货；价格不随关系变化", () => {
    let state = accepted("zhao_toy");
    at(state, "fast_food", 10, 0, 7); // 下个周六。
    ensureRelationship(state, "npc_chen_jie").affinity = 40;
    // 独立重接到这个周六，避免接取日7天总期限干扰本用例。
    state.quests = state.quests.filter((q) => !q.npcTask);
    at(state, "labor_market", 9, 0, 7);
    state = act(state, OWNER.zhao_toy, "zhao_toy", "accept");
    at(state, "fast_food", 10, 0, 7);
    state = act(state, "npc_chen_jie", "zhao_toy", "ask_chen");
    const before = JSON.stringify(state);
    expect(executeNpcTaskAction(state, null, { taskId: "zhao_toy", action: "pickup_reserved" }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    at(state, "fast_food", 10, 0, 8);
    ensureRelationship(state, "npc_chen_jie").affinity = 90;
    expect(getNpcTaskTopics(state, "npc_chen_jie", "chat")).toEqual([]);
    expect(getNpcTaskCounterTopics(state)[0].choices[0].disabledReason).toBeUndefined();
    state = act(state, null, "zhao_toy", "pickup_reserved");
    expect(state.inventory.task_toy_bear).toBe(1);
    expect(state.inventory.task_toy_ticket).toBeUndefined();
    expect(state.player.money).toBe(950);
  });

  it("预约后改去分店购买会核销旧单，所有渠道合计仅一份", () => {
    let state = accepted("zhao_toy");
    at(state, "fast_food", 10);
    ensureRelationship(state, "npc_chen_jie").affinity = 40;
    state = act(state, "npc_chen_jie", "zhao_toy", "ask_chen");
    at(state, "boyue_fast_food", 11);
    state = act(state, null, "zhao_toy", "buy_toy");
    at(state, "fast_food", 10, 0, gameDay(state.time) + 1);
    expect(executeNpcTaskAction(state, null, { taskId: "zhao_toy", action: "pickup_reserved" }).ok).toBe(false);
    expect(state.inventory.task_toy_bear).toBe(1);
    expect(state.inventory.task_toy_ticket).toBeUndefined();
  });

  it.each([
    ["quote_free", 0, 30, "done", 0],
    ["quote_standard", 120, 25, "done", 0],
    ["quote_150", 150, 20, "done", 0],
    ["quote_200", 200, 20, "done", 0],
    ["quote_1000", 0, 10, "failed", 1],
  ] as const)("报价%s按独立奖励结算，不叠加闲聊好感", (action, reward, affinity, status, toy) => {
    let state = withToy();
    const money = state.player.money;
    state = act(state, OWNER.zhao_toy, "zhao_toy", action);
    expect(state.player.money).toBe(money + reward);
    expect(findRelationship(state, OWNER.zhao_toy)!.affinity).toBe(affinity);
    expect(getNpcTaskQuest(state, "zhao_toy")!.status).toBe(status);
    expect(state.inventory.task_toy_bear ?? 0).toBe(toy);
    expect(executeNpcTaskAction(state, OWNER.zhao_toy, { taskId: "zhao_toy", action: "quote_standard" }).ok).toBe(false);
    expect(getNpcTaskTopics(state, OWNER.zhao_toy, "formal")[0].category).toBe("history");
    expect(executeNpcTaskAction(state, OWNER.zhao_toy, { taskId: "zhao_toy", action: "accept" }).ok).toBe(false);
  });

  it(" stale revision、异地、人物离场和没有实物都不能推进", () => {
    let state = accepted("zhao_toy");
    at(state, "boyue_fast_food", 10);
    const revision = getNpcTaskQuest(state, "zhao_toy")!.npcTask!.revision;
    state = act(state, null, "zhao_toy", "buy_toy", { expectedRevision: revision });
    expect(executeNpcTaskAction(state, null, { taskId: "zhao_toy", action: "buy_toy", expectedRevision: revision }).ok).toBe(false);
    const wrongPlace = JSON.stringify(state);
    expect(executeNpcTaskAction(state, OWNER.zhao_toy, { taskId: "zhao_toy", action: "quote_free" }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(wrongPlace);
    at(state, "labor_market", 15);
    expect(executeNpcTaskAction(state, OWNER.zhao_toy, { taskId: "zhao_toy", action: "quote_free" }).ok).toBe(false);
    at(state, "labor_market", 11);
    delete state.inventory.task_toy_bear;
    expect(executeNpcTaskAction(state, OWNER.zhao_toy, { taskId: "zhao_toy", action: "quote_free" }).ok).toBe(false);
  });

  it("跨年预约和七天期限使用同一绝对游戏分钟", () => {
    const state = fresh();
    Object.assign(state.time, { year: 2026, month: 12, day: 30 });
    at(state, "labor_market", 9);
    let acceptedState = act(state, OWNER.zhao_toy, "zhao_toy", "accept");
    // 若年末当天不在快餐店，直接在任意下一工作日预约，检查日历而不改排班。
    for (let offset = 0; offset < 7; offset += 1) {
      at(acceptedState, "fast_food", 10, 0, gameDay(state.time) + offset);
      if (npcPresenceAt("npc_chen_jie", { ...acceptedState.time, weekday: weekdayOf(acceptedState.time) })?.locationId === "fast_food") break;
    }
    ensureRelationship(acceptedState, "npc_chen_jie").affinity = 40;
    acceptedState = act(acceptedState, "npc_chen_jie", "zhao_toy", "ask_chen");
    const p = getNpcTaskQuest(acceptedState, "zhao_toy")!.npcTask!;
    at(acceptedState, "fast_food", 10, 0, p.data.reservationDay);
    const taken = act(acceptedState, null, "zhao_toy", "pickup_reserved");
    expect(taken.time.year).toBe(2027);
    expect(p.deadlineAt - p.acceptedAt).toBe(10080);
  });
});

describe("时间、失败、历史和原子提交", () => {
  it("成功动作返回副本，不会提前改原状态；已提交副本不会重复兑现", () => {
    const state = withToy();
    const before = JSON.stringify(state);
    const choice = getNpcTaskTopics(state, OWNER.zhao_toy, "formal")[0].choices.find((entry) => entry.action.action === "quote_free")!;
    const result = executeNpcTaskAction(state, OWNER.zhao_toy, choice.action);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state).not.toBe(state);
    expect(executeNpcTaskAction(result.state!, OWNER.zhao_toy, choice.action).ok).toBe(false);
    expect(findRelationship(result.state!, OWNER.zhao_toy)!.affinity).toBe(30);
  });

  it("实付成本和交付收入正常写入周记，不把报销重复记成成本", () => {
    let state = withToy();
    expect(state.weekly.spent).toBe(100);
    expect(state.weekly.earned).toBe(0);
    state = act(state, OWNER.zhao_toy, "zhao_toy", "quote_standard");
    expect(state.weekly.spent).toBe(100);
    expect(state.weekly.earned).toBe(120);
  });

  it("开始前明确判定能否按时完成，最终交付刚好到总期限可成功", () => {
    let state = withToy();
    const p = getNpcTaskQuest(state, "zhao_toy")!.npcTask!;
    // 使总期限落在可实际找到赵刚的11:05。
    p.deadlineAt = npcTaskNow(state) + 5;
    state = act(state, OWNER.zhao_toy, "zhao_toy", "quote_standard");
    expect(getNpcTaskQuest(state, "zhao_toy")!.status).toBe("done");
    const late = withToy();
    getNpcTaskQuest(late, "zhao_toy")!.npcTask!.deadlineAt = npcTaskNow(late) + 4;
    const before = JSON.stringify(late);
    expect(executeNpcTaskAction(late, OWNER.zhao_toy, { taskId: "zhao_toy", action: "quote_standard" }).ok).toBe(false);
    expect(JSON.stringify(late)).toBe(before);
  });

  it("跨月超期只扣一次，买来的玩具保留，终局可序列化不可重开", () => {
    const state = withToy();
    const p = getNpcTaskQuest(state, "zhao_toy")!.npcTask!;
    const day = Math.floor(p.deadlineAt / 1440);
    at(state, "labor_market", 11, 0, day + 31);
    tickNpcTasks(state);
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    const affinity = findRelationship(saved, OWNER.zhao_toy)!.affinity;
    tickNpcTasks(saved);
    expect(findRelationship(saved, OWNER.zhao_toy)!.affinity).toBe(affinity);
    expect(affinity).toBe(15);
    expect(saved.inventory.task_toy_bear).toBe(1);
    expect(getNpcTaskQuest(saved, "zhao_toy")!.status).toBe("failed");
    expect(executeNpcTaskAction(saved, OWNER.zhao_toy, { taskId: "zhao_toy", action: "accept" }).ok).toBe(false);
  });

  it("时间钩子无偿清理旧commission，不再累计等待领奖", () => {
    const state = fresh();
    state.quests.push({ id: "old", type: "story", title: "旧约定", icon: "📄", desc: "旧合同", day: 0, status: "active", commission: { npcId: OWNER.zhao_toy, days: 6, startDay: 0, rewardEffects: { money: 100 }, rewardText: "100元" } });
    const money=state.player.money,relations=JSON.stringify(state.relationships);
    tickNpcTasks(state);
    expect(state.quests).toEqual([]);expect(state.player.money).toBe(money);expect(JSON.stringify(state.relationships)).toBe(relations);
  });
});
