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
import { useItem } from "../src/game/core/items";
import { applyFamily } from "../src/game/core/families";

describe("v0.936 · 饥饿计数（hungryStreak）", () => {
  // v1.42 起整日结算改为按「结算锚点（完整年月日）」去重：同一自然日反复长睡不再重复结算。
  // 因此模拟「连续 N 晚不进食」必须真的跨过 N 个自然日（每晚 23:00 睡到次日 07:00），
  // 而不是连点 N 次 sleep(s, 8) ——那是同一自然日内的重复睡眠，只结算一次。
  it("连续不进食会累加饥饿计数，满 5 晚触发「饿死街头」", () => {
    const s = createInitialState();
    s.family = "ordinary";
    for (let night = 0; night < 6; night++) {
      s.time.hour = 23;
      s.time.minute = 0;
      sleep(s, 8);
    }
    expect(s.player.hungryStreak).toBeGreaterThanOrEqual(5);
    expect(s.endingId).toBe("ending_starved");
  });

  it("当日进食后饥饿计数清零（ateToday 标记生效）", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.time.hour = 23;
    sleep(s, 8); // 第 1 晚：未进食 → 计数 1
    expect(s.player.hungryStreak).toBe(1);
    applyEffects(s, { satiety: 30, log: "吃了一顿" }, "🍜");
    expect(s.flags["ateToday"]).toBe(true);
    s.time.hour = 23; // 次日 23 点
    sleep(s, 8); // 第 2 晚：已进食 → 清零
    expect(s.player.hungryStreak).toBe(0);
    expect(s.flags["ateToday"]).toBe(false);
  });
});

describe("v0.936 · 破产计数（negativeMoneyStreak）", () => {
  it("欠钱每晚 +1，赚钱回正则清零", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = -50;
    s.time.hour = 23;
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(1);
    s.time.hour = 23;
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(2);
    s.player.money = 200; // 赚回钱
    s.time.hour = 23;
    sleep(s, 8);
    expect(s.player.negativeMoneyStreak).toBe(0);
  });
});

describe("v0.936 · 绝对日判定（熬出个黎明 / 跨月）", () => {
  it("活满一年（gameDay>=360）解锁「熬出个黎明」（v1.44：仅图鉴，不结束游戏）", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.time.year = 2027;
    s.time.month = 8;
    s.time.day = 1; // 开局 2026-08-01 + 360 天
    expect(gameDay(s.time)).toBe(360);
    const e = checkEnding(s);
    expect(e).toBeNull();
    expect(s.endingId).toBeNull();
    expect(s.unlockedEndings).toContain("ending_survivor");
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
    s.locationId = "street"; // v1.43：家是安全区——无地点声明的街头事件不在家触发
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
  it("政府住宿无需灶台也能购买并从背包食用泡面", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary"); // gov 住房，无灶台
    s.locationId = "convenience_store";
    s.time.hour = 12;
    s.player.money = 50;
    s.player.attrs.satiety = 0;
    const r = performAction(s, "buy_noodles_convenience", { dine: "pack" });
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(46);
    s.locationId = "home";
    expect(useItem(s, "noodles").ok).toBe(true);
    expect(s.player.attrs.satiety).toBeGreaterThan(0);
  });
});
