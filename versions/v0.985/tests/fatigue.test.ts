import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  isFatigued,
  isStaminaZero,
  collapseFee,
  guardCollapse,
  FATIGUE_WARN_THRESHOLD,
} from "../src/game/core/fatigue";
import { triggerCollapse } from "../src/game/engine";
import { performAction } from "../src/game/core/actions";
import { performJob } from "../src/game/core/jobs";
import { playGame } from "../src/game/core/phone";

describe("体力惩罚机制（v0.91）", () => {
  it("体力 < 20 判定为疲劳", () => {
    const s = createInitialState();
    s.player.attrs.stamina = 19;
    expect(isFatigued(s)).toBe(true);
    expect(FATIGUE_WARN_THRESHOLD).toBe(20);
  });

  it("体力 = 0 判定为耗尽", () => {
    const s = createInitialState();
    s.player.attrs.stamina = 0;
    expect(isStaminaZero(s)).toBe(true);
  });

  it("医药费按余额 20% 收取，至少 30 元", () => {
    const s = createInitialState();
    s.player.money = 1000;
    expect(collapseFee(s)).toBe(200);
    s.player.money = 100;
    expect(collapseFee(s)).toBe(30); // 至少 30
  });

  it("体力未耗尽时 guardCollapse 放行", () => {
    const s = createInitialState();
    s.player.attrs.stamina = 50;
    expect(guardCollapse(s, "test", triggerCollapse).ok).toBe(true);
  });

  it("体力耗尽时 guardCollapse 触发晕倒：扣费+回家+恢复一半体力+跳 12h", () => {
    const s = createInitialState();
    s.time.hour = 10;
    s.player.attrs.stamina = 0;
    s.player.money = 1000;
    s.locationId = "gym";
    s.region = "downtown_mall";

    const g = guardCollapse(s, "在极度疲惫时强行工作", triggerCollapse);
    expect(g.ok).toBe(false);
    // 医药费 200
    expect(s.player.money).toBe(800);
    // 强制回家
    expect(s.locationId).toBe("home");
    // 恢复一半体力（上限 100 → 50）
    expect(s.player.attrs.stamina).toBe(50);
    // 时间跳过 12 小时
    expect(s.time.hour).toBe(22);
  });

  it("体力归零强行健身房锻炼 → 晕倒（行动被阻断）", () => {
    const s = createInitialState();
    s.time.hour = 12;
    s.player.attrs.stamina = 0;
    s.player.money = 500;
    // v0.92：月卡以「绝对到期日」为准，仅置 flag 不再生效
    s.flags["gym_member"] = true;
    s.memberships["gym"] = { day: s.time.day, month: s.time.month + 1, year: s.time.year };
    s.player.attrs.health = 60;

    const r = performAction(s, "exercise_gym");
    expect(r.ok).toBe(false);
    expect(s.locationId).toBe("home");
    expect(s.player.money).toBe(500 - 100); // 20% = 100
  });

  it("体力归零强行工作 → 晕倒（被送回家）", () => {
    const s = createInitialState();
    s.time.hour = 10;
    s.player.attrs.stamina = 0;
    s.player.money = 500;
    // 构造劳务市场岗位
    s.laborMarket.generatedDay = s.time.day;
    s.laborMarket.offers = [{ uid: "job_delivery_0", jobId: "job_delivery", quota: 1 }];

    const r = performJob(s, "job_delivery_0");
    expect(r.ok).toBe(false);
    expect(s.locationId).toBe("home");
  });

  it("体力归零强行打手机游戏 → 晕倒", () => {
    const s = createInitialState();
    s.player.attrs.stamina = 0;
    s.player.money = 500;
    const r = playGame(s);
    expect(r.ok).toBe(false);
    expect(s.locationId).toBe("home");
  });
});
