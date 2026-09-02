import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours } from "../src/game/core/time";
import { checkEventConditions } from "../src/game/core/events";
import {
  difficultyLevel,
  priceMultiplier,
  scaleCost,
  jobRequirementBonus,
  eventProbability,
  negativeWeightBoost,
  monthlyInflationRate,
  daysSurvived,
} from "../src/game/core/difficulty";
import type { EventDef } from "../src/game/types";

describe("难度递增 v0.94", () => {
  it("存活天数换算正确", () => {
    const s = createInitialState();
    s.time = { ...s.time, year: 2026, month: 9, day: 1 }; // 开局 2026-08-01 起第 30 天
    expect(daysSurvived(s)).toBe(30);
  });

  it("难度等级随存活天数与净资产爬升（封顶 6）", () => {
    const s = createInitialState();
    expect(difficultyLevel(s)).toBe(0); // 开局第 1 天

    s.time = { ...s.time, year: 2026, month: 11, day: 1 }; // 开局 +90 天 → floor(90/30)=3
    expect(difficultyLevel(s)).toBe(3);

    s.player.money = 100000; // +floor(100000/25000)=4 → 7，封顶 6
    expect(difficultyLevel(s)).toBe(6);
  });

  it("物价倍率 = economy.priceIndex", () => {
    const s = createInitialState();
    expect(priceMultiplier(s)).toBe(1);
    s.economy.priceIndex = 1.3;
    expect(priceMultiplier(s)).toBe(1.3);
  });

  it("scaleCost 按物价倍率缩放购买花费", () => {
    const s = createInitialState();
    expect(scaleCost(s, 100)).toBe(100); // 初始无通胀
    s.economy.priceIndex = 1.5;
    expect(scaleCost(s, 100)).toBe(150);
    expect(scaleCost(s, 33)).toBe(50); // 四舍五入 49.5 → 50
  });

  it("工作要求加成随等级上升并封顶", () => {
    const s = createInitialState();
    s.time = { ...s.time, year: 2026, month: 11, day: 1 }; // level 3
    expect(jobRequirementBonus(s)).toBe(3);
    s.player.money = 100000; // level 6
    expect(jobRequirementBonus(s)).toBe(5); // reqBonusCap = 5
  });

  it("事件概率随难度上升且封顶", () => {
    const s = createInitialState();
    const p0 = eventProbability(s);
    expect(p0).toBeGreaterThanOrEqual(0.16);
    s.time = { ...s.time, year: 2028, month: 1, day: 1 }; // level 6（封顶 0.38）
    expect(eventProbability(s)).toBeLessThanOrEqual(0.38);
    expect(eventProbability(s)).toBeGreaterThanOrEqual(p0);
  });

  it("负面事件权重放大系数随难度上升", () => {
    const s = createInitialState();
    const b0 = negativeWeightBoost(s);
    s.time = { ...s.time, year: 2027, month: 2, day: 1 }; // 开局 +180 天 → level 6
    expect(negativeWeightBoost(s)).toBeGreaterThan(b0);
  });

  it("跨月触发通胀，priceIndex 上涨（封顶 1.5）", () => {
    const s = createInitialState();
    expect(s.economy.priceIndex).toBe(1);
    s.time = { ...s.time, year: 2026, month: 8, day: 30 };
    advanceHours(s, 24); // 跨入 9 月 1 号
    expect(s.economy.priceIndex).toBeGreaterThan(1);
    expect(s.economy.priceIndex).toBeLessThanOrEqual(1.5);
  });

  it("事件难度区间门控：高难排除低难专属事件，准入高难事件", () => {
    const s = createInitialState();
    s.time = { ...s.time, year: 2027, month: 2, day: 20 }; // level 6
    const lowOnly = {
      id: "t_low", title: "", icon: "", text: "", weight: 1,
      conditions: { difficulty: { max: 1 } },
      choices: [{ label: "", effects: {} }],
    } as unknown as EventDef;
    const highOk = {
      id: "t_high", title: "", icon: "", text: "", weight: 1,
      conditions: { difficulty: { min: 2 } },
      choices: [{ label: "", effects: {} }],
    } as unknown as EventDef;
    expect(checkEventConditions(s, lowOnly)).toBe(false);
    expect(checkEventConditions(s, highOk)).toBe(true);
  });

  it("monthlyInflationRate 为正且随难度增大", () => {
    const s = createInitialState();
    const r0 = monthlyInflationRate(s);
    expect(r0).toBeGreaterThan(0);
    s.time = { ...s.time, year: 2027, month: 2, day: 1 }; // 开局 +180 天 → level 6
    expect(monthlyInflationRate(s)).toBeGreaterThan(r0);
  });
});
