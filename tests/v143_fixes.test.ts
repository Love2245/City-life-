import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours, sleep } from "../src/game/core/time";
import { EVENTS, checkEventConditions, rollEvent, RANDOM_EVENT_MIN_GAP_MINUTES } from "../src/game/core/events";
import {
  currentRegion,
  getBuyTier,
  getEffectiveLodging,
  getLeaseTier,
  getLodging,
  selectLodging,
} from "../src/game/core/housing";
import { afterTempleVolunteer } from "../src/game/core/religion";
import {
  advanceNpcConversation,
  beginNpcConversation,
  commitNpcConversation,
  npcConversationView,
} from "../src/game/core/npcTalk";
import { ensureRelationship } from "../src/game/core/relationships";
import { gameDay } from "../src/game/core/calendar";
import { absoluteDay } from "../src/game/core/membership";
import type { GameState } from "../src/game/types";

function fresh(seed = 31): GameState {
  const s = createInitialState(seed);
  s.living.govDaysLeft = 30;
  s.time.day = 15; // 避开 1 号交租 / 20 号月供
  s.time.hour = 21;
  s.time.minute = 0;
  return s;
}

/** 一路选「非离开」选项走到会话结束（日常池是多节点，一次 advance 不会结束）。 */
function walkToEnd(state: GameState, session: ReturnType<typeof beginNpcConversation>["session"]) {
  let current = session!;
  for (let step = 0; step < 12 && current.status === "active"; step += 1) {
    const view = npcConversationView(state, current)!;
    const index = view.options.findIndex((o) => !o.leave);
    current = advanceNpcConversation(state, current, index >= 0 ? index : 0).session!;
  }
  return current;
}

function event(id: string) {
  const e = EVENTS.find((x) => x.id === id);
  expect(e, `缺少事件 ${id}`).toBeDefined();
  return e!;
}

describe("v1.43 饱食度按整数扣减", () => {
  it("1 小时 -3、半小时 -2，且永远是整数，不再出现 0.30000000000000004 之类的尾差", () => {
    const s = fresh();
    s.player.attrs.satiety = 70;
    advanceHours(s, 1);
    expect(s.player.attrs.satiety).toBe(67);

    s.player.attrs.satiety = 70;
    advanceHours(s, 0.5);
    expect(s.player.attrs.satiety).toBe(68); // round(1.5)
    expect(Number.isInteger(s.player.attrs.satiety)).toBe(true);

    s.player.attrs.satiety = 70;
    advanceHours(s, 0.1); // 问候级别的小段时间
    expect(s.player.attrs.satiety).toBe(70);
    expect(Number.isInteger(s.player.attrs.satiety)).toBe(true);
  });

  it("住宅区咖啡馆对话结算面板显示的饱食度差值是干净数字", () => {
    const s = fresh();
    s.locationId = "cafe";
    s.region = "downtown_residential";
    s.time.day = 17;
    s.time.hour = 8;
    s.player.attrs.satiety = 70;
    ensureRelationship(s, "npc_lin_xiaoyu");
    s.flags["npc_greet_day_npc_lin_xiaoyu"] = gameDay(s.time); // 跳过每日问候，直接走日常池

    const session = beginNpcConversation(s, "npc_lin_xiaoyu", "chat").session!;
    const commit = commitNpcConversation(s, walkToEnd(s, session));
    expect(commit.ok).toBe(true);

    const satietyDelta = commit.summary!.deltas.find((d) => d.key === "satiety");
    expect(satietyDelta, "对话应当体现饱食度消耗").toBeDefined();
    expect(Number.isInteger(satietyDelta!.value)).toBe(true);
  });
});

describe("v1.43 随机事件：降频 + 按场景限制", () => {
  it("家是安全区：没有声明「可在家发生」的事件不在家触发", () => {
    const s = fresh();
    s.locationId = "home";
    expect(checkEventConditions(s, event("ev_lost_wallet"))).toBe(false);

    s.locationId = "street";
    expect(checkEventConditions(s, event("ev_lost_wallet"))).toBe(true);
  });

  it("显式声明可在家发生的事件仍然照常触发", () => {
    const s = fresh();
    s.locationId = "home";
    s.time.hour = 21; // ev_home_noise 只要求在家的夜晚
    expect(checkEventConditions(s, event("ev_home_noise"))).toBe(true);
  });

  it("两次随机事件之间有最小间隔，不会一次行动弹一次", () => {
    const s = fresh();
    s.locationId = "street";
    s.player.money = 500;
    const first = rollEvent(s, 1);
    expect(first).not.toBeNull();

    // 同一时刻立刻再掷：被最小间隔挡住
    expect(rollEvent(s, 1)).toBeNull();

    // 过了一个半小时（90 分钟）后恢复
    advanceHours(s, RANDOM_EVENT_MIN_GAP_MINUTES / 60);
    expect(rollEvent(s, 1)).not.toBeNull();
  });

  it("捡钱包 / 周末零工不再能在任意地点反复刷", () => {
    const wallet = event("ev_lost_wallet");
    const odd = event("ev_weekend_odd_job");
    expect(wallet.cooldown ?? 0).toBeGreaterThan(0);
    expect(odd.cooldown ?? 0).toBeGreaterThan(0);

    const s = fresh();
    s.locationId = "street";
    // 冷却未过时不再进候选池
    s.flags[`ev_${wallet.id}_last`] = absoluteDay(s.time); // 本日刚触发过
    expect(checkEventConditions(s, wallet)).toBe(false);

    // 且这些事件在家不触发
    s.locationId = "home";
    expect(checkEventConditions(s, wallet)).toBe(false);
    expect(checkEventConditions(s, odd)).toBe(false);
  });
});

describe("v1.43 住宿：有房也能外宿，地点与住所类型匹配", () => {
  it("住宿地点与住所类型一一对应", () => {
    expect(getLodging("hostel")?.region).toBe("downtown_station"); // 青年旅舍 → 火车站附近
    expect(getLodging("hotel")?.region).toBe("downtown_center"); // 酒店 → 市中心
    expect(getLodging("temple")?.region).toBe("suburban_edge"); // 寺庙禅房 → 郊区城市边缘
    expect(getLodging("minsu")?.region).toBe("downtown_residential"); // 民宿 → 住宅区
    expect(getLodging("atm")?.region).toBe("downtown_residential");
    expect(getLeaseTier("old_apartment")?.region).toBe("downtown_residential"); // 普通出租屋 → 住宅区
    expect(getLeaseTier("rental_apartment")?.region).toBe("downtown_center"); // 出租公寓 → 市中心
    expect(getBuyTier("own_apartment")?.region).toBe("downtown_center"); // 精装公寓 → 市中心
  });

  it("有固定住处也能在外住一晚：当前入住酒店，睡醒仍保留租约和客房", () => {
    const s = fresh();
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    s.player.money = 1000;
    expect(currentRegion(s)).toBe("downtown_residential");

    expect(selectLodging(s, "hotel")).toBe(true);
    expect(getEffectiveLodging(s).id).toBe("hotel");
    expect(currentRegion(s)).toBe("downtown_center");
    s.locationId = "hotel";

    const moneyBefore = s.player.money;
    sleep(s, 8);

    expect(s.player.money).toBe(moneyBefore); // 首晚已预付，不重复扣款
    expect(s.living.awayNight?.lodgingId).toBe("hotel");
    expect(s.living.mode).toBe("lease"); // 居住模式不被改写
    expect(currentRegion(s)).toBe("downtown_center");
  });

  it("寺庙义工换来当晚禅房（城市边缘），且免费", () => {
    const s = fresh();
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    s.player.money = 500;

    s.locationId = "temple";
    afterTempleVolunteer(s);
    expect(s.living.awayNight?.lodgingId).toBe("temple");
    expect(currentRegion(s)).toBe("suburban_edge");

    const moneyBefore = s.player.money;
    sleep(s, 8);
    expect(s.player.money).toBe(moneyBefore);
    expect(s.living.awayNight?.lodgingId).toBe("temple");
  });

  it("无固定住处时仍走原有的 nightly 按天住宿", () => {
    const s = fresh();
    s.living.mode = "nightly";
    s.player.money = 200;
    expect(selectLodging(s, "hostel")).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("hostel");
    expect(currentRegion(s)).toBe("downtown_station");
  });
});
