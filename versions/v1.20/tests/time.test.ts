import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import {
  advanceHours,
  sleep,
  nap,
  periodOfHour,
  isExhausted,
  formatTime,
} from "../src/game/core/time";

describe("时间系统：小时推进", () => {
  it("advanceHours 推进小时", () => {
    const s = createInitialState();
    expect(s.time.hour).toBe(7);
    advanceHours(s, 2);
    expect(s.time.hour).toBe(9);
    expect(s.time.minute).toBe(0);
  });

  it("支持 0.5 小时行动（分钟推进）", () => {
    const s = createInitialState();
    advanceHours(s, 0.5);
    expect(s.time.hour).toBe(7);
    expect(s.time.minute).toBe(30);
  });

  it("跨午夜只 rollover 日期 + 标熬夜，不自动入睡", () => {
    const s = createInitialState();
    s.time.hour = 22;
    const r = advanceHours(s, 4); // 22:00 → 次日 02:00
    expect(r.crossedDay).toBe(true);
    expect(s.time.hour).toBe(2);
    expect(s.time.day).toBe(2);
    expect(s.time.stayedUp).toBe(true);
  });

  it("30 天结束进入下月 1 号", () => {
    const s = createInitialState();
    s.time.day = 30;
    s.time.month = 5;
    s.time.hour = 22;
    advanceHours(s, 4);
    expect(s.time.day).toBe(1);
    expect(s.time.month).toBe(6);
  });

  it("12 月 30 日跨年", () => {
    const s = createInitialState();
    s.time.day = 30;
    s.time.month = 12;
    s.time.year = 1;
    s.time.hour = 22;
    advanceHours(s, 4);
    expect(s.time.year).toBe(2);
    expect(s.time.month).toBe(1);
    expect(s.time.day).toBe(1);
  });
});

describe("时间系统：睡觉", () => {
  it("22 点睡 9 小时跨天到次日 7 点", () => {
    const s = createInitialState();
    s.time.hour = 22;
    sleep(s, 9);
    expect(s.time.hour).toBe(7);
    expect(s.time.day).toBe(2);
    expect(s.time.stayedUp).toBe(false);
  });

  it("凌晨 4 点睡 3 小时到 7 点不跨天（夜班）", () => {
    const s = createInitialState();
    s.time.hour = 4;
    s.time.day = 5;
    sleep(s, 3);
    expect(s.time.hour).toBe(7);
    expect(s.time.day).toBe(5);
  });

  it("睡眠恢复体力按住宿档位（gov 0.65，睡 8h）", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.player.attrs.stamina = 40;
    s.time.hour = 22;
    sleep(s, 8);
    // 40 + (100-40)*0.65*1.0 = 79
    expect(s.player.attrs.stamina).toBeCloseTo(79, 5);
  });

  it("月租出租屋恢复体力 80%（睡 8h）", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    s.player.attrs.stamina = 40;
    s.time.hour = 22;
    sleep(s, 8);
    // 40 + (100-40)*0.8*1.0 = 88
    expect(s.player.attrs.stamina).toBeCloseTo(88, 5);
  });

  it("熬夜（23 点后入睡）恢复打折", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.player.attrs.stamina = 40;
    s.time.hour = 23;
    sleep(s, 8); // 23 点睡 → 熬夜
    // v0.992：睡满 8h 不算「作息混乱」（短睡 <7h 的熬夜才累积 sleep_disorder），只吃熬夜 ×0.85
    // 40 + (100-40)*0.65*1.0*0.85 = 73.15
    expect(s.player.attrs.stamina).toBeCloseTo(73.15, 5);
  });

  it("青旅收费 25 元（nightly）", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "hostel" };
    s.time.hour = 22;
    sleep(s, 8);
    expect(s.player.money).toBe(500 - 25);
  });

  it("小睡补觉不结算自然衰减，恢复上限 20%", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 12;
    s.player.attrs.stamina = 30;
    const health0 = s.player.attrs.health;
    nap(s, 2);
    expect(s.time.hour).toBe(14);
    expect(s.player.attrs.stamina).toBeCloseTo(30 + 100 * 0.3, 5); // v0.93：小睡恢复 30%
    expect(s.player.attrs.health).toBe(health0); // 无自然衰减
  });
});

describe("时间系统：入睡结算", () => {
  it("健康每日基础衰减 1 + 按时睡奖励 +0.5（睡 8h）", () => {
    const s = createInitialState(); // health 85
    s.time.hour = 22;
    sleep(s, 8);
    // 85 - 1(基础衰减) + 0.5(按时睡 7-9h) = 84.5
    expect(s.player.attrs.health).toBeCloseTo(84.5, 5);
  });

  it("健康过低（<20）持续恶化", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.player.attrs.health = 15;
    s.time.hour = 22;
    sleep(s, 8);
    // 15 - 1(基础) - 1(<20 恶化) + 0.5(按时睡) = 13.5
    expect(s.player.attrs.health).toBeCloseTo(13.5, 5);
  });

  it("干净度每日下降 6", () => {
    const s = createInitialState();
    const h0 = s.player.attrs.hygiene;
    s.time.hour = 22;
    sleep(s, 8);
    expect(s.player.attrs.hygiene).toBeCloseTo(h0 - 6, 5);
  });

  it("政府免费住宿倒计时：到期转 nightly", () => {
    const s = createInitialState();
    s.living.govDaysLeft = 1;
    s.time.hour = 22;
    sleep(s, 8);
    expect(s.living.mode).toBe("nightly");
    expect(s.living.govDaysLeft).toBe(0);
  });

  it("每月 1 号交房租并涨租 20%（lease 模式）", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    s.player.money = 5000;
    s.time.day = 1;
    s.time.hour = 22;
    const rent = s.living.lease.rent;
    sleep(s, 8);
    expect(s.player.money).toBe(5000 - rent);
    expect(s.living.lease!.rent).toBe(Math.round(rent * 1.2));
    expect(s.living.lease!.rentGrowthCount).toBe(1);
  });

  it("房租 12 个月后封顶不再涨", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 12 };
    s.time.day = 1;
    s.time.hour = 22;
    const rent = s.living.lease.rent;
    sleep(s, 8);
    expect(s.living.lease!.rent).toBe(rent);
  });
});

describe("时间系统：派生与工具", () => {
  it("periodOfHour 分桶", () => {
    expect(periodOfHour(7)).toBe("morning");
    expect(periodOfHour(12)).toBe("afternoon");
    expect(periodOfHour(19)).toBe("evening");
    expect(periodOfHour(23)).toBe("night");
    expect(periodOfHour(2)).toBe("night");
  });

  it("formatTime", () => {
    expect(formatTime(14, 30)).toBe("14:30");
    expect(formatTime(7, 0)).toBe("07:00");
  });

  it("isExhausted：凌晨 3-7 点或体力耗尽", () => {
    const s = createInitialState();
    s.time.hour = 4;
    expect(isExhausted(s)).toBe(true);
    s.time.hour = 10;
    expect(isExhausted(s)).toBe(false);
    s.player.attrs.stamina = 0;
    expect(isExhausted(s)).toBe(true);
  });
});