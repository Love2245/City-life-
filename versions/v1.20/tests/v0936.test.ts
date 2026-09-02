import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { sleep } from "../src/game/core/time";
import { applyEffects } from "../src/game/engine";
import { checkEnding } from "../src/game/core/endings";
import { checkEventConditions } from "../src/game/core/events";
import { absoluteDay } from "../src/game/core/membership";
import { gameDay } from "../src/game/core/calendar";
import { rentVehicle, returnVehicle, checkVehicleExpiry } from "../src/game/core/vehicle";
import { performAction } from "../src/game/core/actions";
import { applyFamily } from "../src/game/core/families";

describe("v0.936 · 饥饿计数（hungryStreak）", () => {
  it("连续不进食会累加饥饿计数，满 5 晚触发「饿死街头」", () => {
    const s = createInitialState();
    s.family = "ordinary";
    for (let i = 0; i < 5; i++) sleep(s, 8); // 全程不进食
    expect(s.player.hungryStreak).toBeGreaterThanOrEqual(5);
    expect(s.endingId).toBe("ending_starved");
  });

  it("当日进食后饥饿计数清零（ateToday 标记生效）", () => {
    const s = createInitialState();
    s.family = "ordinary";
    sleep(s, 8);
    expect(s.player.hungryStreak).toBe(1);
    applyEffects(s, { satiety: 30, log: "吃了一顿" }, "🍜");
    expect(s.flags["ateToday"]).toBe(true);
    sleep(s, 8);
    expect(s.player.hungryStreak).toBe(0);
    expect(s.flags["ateToday"]).toBe(false);
  });
});

describe("v0.936 · 破产计数（negativeMoneyStreak）", () => {
  it("欠钱每晚 +1，赚钱回正则清零", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = -50;
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(1);
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(2);
    s.player.money = 200; // 赚回钱
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(0);
  });
});

describe("v0.936 · 绝对日判定（熬出个黎明 / 跨月）", () => {
  it("活满一年（gameDay>=360）可触发「熬出个黎明」", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.time.year = 2027;
    s.time.month = 8;
    s.time.day = 1; // 开局 2026-08-01 + 360 天
    expect(gameDay(s.time)).toBe(360);
    const e = checkEnding(s);
    expect(e?.id).toBe("ending_survivor");
  });

  it("未满一年「熬出个黎明」不可达", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.time.year = 2026;
    s.time.month = 12;
    s.time.day = 30; // 开局 +149 天 < 360
    expect(checkEnding(s)).toBeNull();
  });

  it("事件冷却按真实天数跨月仍生效", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.time.month = 9;
    s.time.day = 1;
    const lastAbs = absoluteDay(s.time);
    (s.flags as Record<string, number | boolean>)["ev_test_last"] = lastAbs;
    const ev = { id: "test", weight: 1, choices: [], cooldown: 5 } as never;
    s.time.month = 10;
    s.time.day = 1; // 30 天后
    expect(checkEventConditions(s, ev)).toBe(true); // 已过冷却（旧逻辑会误判仍在冷却）
  });
});

describe("v1.20 · 押金制租车（不限租期）", () => {
  it("月底租用记录当天日期，跨月不被回收（需手动退租）", () => {
    const s = createInitialState();
    s.player.money = 1000;
    s.time.day = 29; // 月底（8/29）
    rentVehicle(s, "e_bike");
    expect(s.vehicles["e_bike"].month).toBe(8);
    expect(s.vehicles["e_bike"].day).toBe(29);
    expect(s.vehicles["e_bike"].deposit).toBe(600);
    s.time.month = 10;
    s.time.day = 30;
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(true); // 仍在租期
    returnVehicle(s, "e_bike");
    expect(s.flags["item_e_bike"]).toBe(false);
    expect(s.player.money).toBe(1000);
  });
});

describe("v0.936 · 政府住房兜底餐", () => {
  it("去掉灶台要求后，政府住房也能吃 3 元泡面", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary"); // gov 住房，无灶台
    s.locationId = "home";
    s.time.hour = 12;
    s.player.money = 50;
    const r = performAction(s, "eat_noodles_home");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.satiety).toBeGreaterThan(0);
  });
});
