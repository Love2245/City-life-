import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { addContactFromNpc } from "../src/game/core/contacts";
import {
  CITY_COMMISSIONS,
  acceptCityCommission,
  markCityCommissionLocation,
  offeredCityCommissions,
  refreshCityCommissionOffers,
  tickCityCommissions,
  weekIndexOf,
} from "../src/game/core/cityCommissions";
import { ensureRelationship, findRelationship } from "../src/game/core/relationships";
import { allNpcs, getNpcDef } from "../src/game/core/npcs";
import { EVENTS } from "../src/game/core/events";
import { getMiniGameConfig } from "../src/game/core/minigame";
import { getJobDef } from "../src/game/core/jobs";
import { travelToRegion, regionTravelPlan } from "../src/game/core/actions";
import {
  PROGRAMMING_PASSIVE_CAP,
  programmingPassiveMultiplier,
  settlePassiveIncome,
  workOnProject,
} from "../src/game/core/projects";
import { generateDailyGoals, tickDailyGoals } from "../src/game/core/quests";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";
import locationsData from "../src/game/data/locations.json";
import actionsData from "../src/game/data/actions.json";
import itemsData from "../src/game/data/items.json";
import { isRetiredNpcCityCommission } from '../src/game/core/npcTasks';

const NEW_NPC_IDS = [
  "npc_flower_market_owner",
  "npc_snack_street_vendor",
  
  "npc_suburb_farmer",
];

function makeEligible(state: GameState, npcId: string): void {
  const relationship = ensureRelationship(state, npcId);
  relationship.affinity = 40;
  const alreadyContact = state.contacts.some((contact) => contact.id === `npc_${npcId}`);
  if (!alreadyContact) expect(addContactFromNpc(state, npcId)).toBe(true);
}

function pinOffer(state: GameState, commissionId: string): void {
  state.cityCommissions = {
    weekIndex: weekIndexOf(state),
    offeredIds: [commissionId],
    activeId: null,
    cooldownUntilDay: {},
  };
}

describe("1.41 城市活起来：每日目标与内容数据", () => {
  it("每日目标 JSON 往返后仍能按 id 恢复检查器，且奖励不会重复", () => {
    const state = createInitialState(41);
    state.dailyGoals = [{ id: "eat_hot", text: "吃一顿热的", reward: { mood: 2 }, done: false }];
    state.flags.ateToday = true;

    state.dailyGoals = JSON.parse(JSON.stringify(state.dailyGoals)) as NonNullable<GameState["dailyGoals"]>;
    const rewards: number[] = [];
    expect(tickDailyGoals(state, (mood) => rewards.push(mood))).toBe(0);
    expect(tickDailyGoals(state, (mood) => rewards.push(mood))).toBe(0);
    expect(state.dailyGoals).toBeUndefined();
    expect(rewards).toEqual([]);
  });

  it("读档遇到未知目标时丢弃异常项并补足到两条", () => {
    const state = createInitialState(41);
    state.flags.goal_day = gameDay(state.time);
    state.dailyGoals = [
      { id: "eat_hot", text: "吃一顿热的", reward: { mood: 2 }, done: true },
      { id: "removed_goal", text: "已删除目标", reward: { mood: 2 }, done: false },
    ];

    const goals = generateDailyGoals(state);
    expect(goals).toHaveLength(0);
    expect(goals.some((goal) => goal.id === "removed_goal")).toBe(false);
    expect(state.dailyGoals).toBeUndefined();
  });

  it("新增 4 名地区 NPC 都有地点、好感数据且不开放恋爱线", () => {
    const npcs = allNpcs().filter((npc) => NEW_NPC_IDS.includes(npc.id));
    expect(npcs).toHaveLength(3);
    for (const npc of npcs) {
      expect(npc.meetLocation).toBeTruthy();
      expect(npc.initialAffinity).toEqual(expect.any(Number));
      expect(npc.contactAt).toEqual(expect.any(Number));
      expect(npc.romanceable).toBe(false);
    }
  });

  it("事件库包含 18 条 1.41 专属事件，并全部绑定地点与音效", () => {
    const events = EVENTS.filter((event) => event.id.startsWith("ev_v141_"));
    expect(events).toHaveLength(18);
    for (const event of events) {
      expect(event.sound).toBeTruthy();
      expect(event.conditions.locationId || event.conditions.locationIn?.length).toBeTruthy();
    }
  });
});

describe("1.492 移除旧城市占位委托", () => {
  it("正式目录为空，所有旧标题停止发放", () => {
    expect(CITY_COMMISSIONS).toEqual([]);
    const state=createInitialState(41);
    expect(offeredCityCommissions(state)).toEqual([]);
  });
  it("跨周刷新不再生成候选", () => {
    const state=createInitialState(41);
    state.cityCommissions={weekIndex:weekIndexOf(state),offeredIds:['city_market_weekend_stock'],activeId:null,cooldownUntilDay:{}};
    expect(refreshCityCommissionOffers(state)).toEqual([]);
    state.time.day+=7;
    expect(refreshCityCommissionOffers(state)).toEqual([]);
    expect(state.cityCommissions.offeredIds).toEqual([]);
  });
  it("伪造旧周候选也不能重新接取", () => {
    const state=createInitialState(41),before=JSON.stringify(state);
    for(const id of ['city_market_weekend_stock','city_snack_signature','city_fresh_goods_into_town']) {
      expect(acceptCityCommission(state,id)).toMatchObject({ok:false});
    }
    expect(JSON.stringify(state)).toBe(before);
  });
  it("旧接口不再凭到达地点自动领奖", () => {
    const state=createInitialState(41),before=JSON.stringify(state);
    expect(markCityCommissionLocation(state,'flower_market')).toMatchObject({ok:false});
    expect(JSON.stringify(state)).toBe(before);
  });
  it("清理活动和冷却记录不结算奖励或惩罚", () => {
    const state=createInitialState(41),money=state.player.money;
    state.cityCommissions={weekIndex:7,offeredIds:['city_snack_signature'],activeId:'city_snack_signature',cooldownUntilDay:{city_snack_signature:999}};
    tickCityCommissions(state);
    expect(state.cityCommissions).toEqual({weekIndex:0,offeredIds:[],activeId:null,cooldownUntilDay:{}});
    expect(state.player.money).toBe(money);
  });
});

describe("1.41 学校兼职、版税池与地图入口", () => {
  it("学校辅导使用独立答题配置并保留原岗位结算", () => {
    const cfg = getMiniGameConfig("job_school_tutor");
    const job = getJobDef("job_school_tutor");
    expect(cfg?.type).toBe("quiz");
    expect(cfg && "questions" in cfg ? cfg.questions.length : 0).toBeGreaterThanOrEqual(5);
    expect(job).toMatchObject({ startHour: 9, endHour: 17, restDays: ["sun"] });
    expect(job?.effects).toMatchObject({ money: 135, stamina: -35, stress: 4, skills: { service: 1 } });
  });

  it("版税池倍率为 100%/70%/40%，封顶后不再增加且每周发放后衰减", () => {
    expect(programmingPassiveMultiplier(0)).toBe(1);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP/3-0.01)).toBe(1);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP/3)).toBe(0.7);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP*2/3-0.01)).toBe(0.7);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP*2/3)).toBe(0.4);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP-0.01)).toBe(0.4);
    expect(programmingPassiveMultiplier(PROGRAMMING_PASSIVE_CAP)).toBe(0);
    // 旧在途约定仍用原上限，相同的递减比例不变。
    expect(programmingPassiveMultiplier(499,1500)).toBe(1);
    expect(programmingPassiveMultiplier(500,1500)).toBe(0.7);
    expect(programmingPassiveMultiplier(1000,1500)).toBe(0.4);
    expect(programmingPassiveMultiplier(1500,1500)).toBe(0);

    const state = createInitialState(41);
    state.player.skills.programming = 5;
    state.flags.item_laptop = true;
    state.career.passiveIncome = PROGRAMMING_PASSIVE_CAP;
    state.career.projects.indie_game = 96;
    const money = state.player.money;
    expect(workOnProject(state, "indie_game").completed).toBe(true);
    expect(state.career.passiveIncome).toBe(PROGRAMMING_PASSIVE_CAP);
    expect(state.player.money).toBe(money);

    state.career.passiveIncome = 1800;
    // 已有版权不按新上限截断，先完整发放，再衰减10%。
    expect(settlePassiveIncome(state)).toBe(1800);
    expect(state.career.passiveIncome).toBe(1620);
  });

  it("没有载具时一级地图跨城被拦截，拥有汽车后抵达郊区城市边缘", () => {
    const state = createInitialState(41);
    expect(regionTravelPlan(state, "suburb").requiresTicket).toBe(true);
    expect(travelToRegion(state, "suburb").ok).toBe(false);

    state.flags.item_car = true;
    expect(travelToRegion(state, "suburb").ok).toBe(true);
    expect(state.region).toBe("suburban_edge");
    expect(state.locationId).toBe("map");
  });
});
