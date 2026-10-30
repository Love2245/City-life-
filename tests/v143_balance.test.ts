import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { sleepSettlement } from "../src/game/core/time";
import { advanceHours } from "../src/game/core/time";
import { moveTo } from "../src/game/core/actions";
import { JOB_DEFS } from "../src/game/core/jobs";
import { getFamily } from "../src/game/core/families";
import { getLeaseTier } from "../src/game/core/housing";
import { monthlyInflationRate, priceIndexCap } from "../src/game/core/difficulty";
import {
  DEPRESSION_RECOVER_DAYS,
  DEPRESSION_RECOVER_MOOD,
  dailySurvivalSettlement,
} from "../src/game/core/survival";
import {
  NETBAR_HOURLY_FEE,
  NETBAR_MIN_HOURS,
  endNetbarSession,
  hasLaptop,
  laptopTier,
  netbarSessionRemainingMinutes,
  startNetbarSession,
} from "../src/game/core/projects";

function fresh(seed = 5) {
  const s = createInitialState(seed);
  s.living.govDaysLeft = 30; // 避开每晚住宿费干扰
  return s;
}

describe("v1.43 网吧上机（接入笔记本系统）", () => {
  it("没有电脑时第 1 档位是 none；上机后按办公本档位可用", () => {
    const s = fresh();
    expect(laptopTier(s)).toBe("none");
    expect(hasLaptop(s)).toBe(false);

    s.locationId = "internet_cafe";
    s.player.money = 200;
    const r = startNetbarSession(s);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(200 - NETBAR_HOURLY_FEE * NETBAR_MIN_HOURS);
    expect(laptopTier(s)).toBe("mid"); // 网吧机 = 办公本，优于老旧笔记本
    expect(hasLaptop(s)).toBe(true);
  });

  it("电竞本档位不会被网吧机拉低", () => {
    const s = fresh();
    s.flags["item_laptop_pro"] = true;
    s.locationId = "internet_cafe";
    s.player.money = 200;
    expect(startNetbarSession(s).ok).toBe(true);
    expect(laptopTier(s)).toBe("high");
  });

  it("钱不够时拒绝上机，且不扣费、不开权限", () => {
    const s = fresh();
    s.locationId = "internet_cafe";
    s.player.money = 10;
    const r = startNetbarSession(s);
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(10);
    expect(onNetbar(s)).toBe(false);
  });

  it("每天只能上机一次（防止刷心情）", () => {
    const s = fresh();
    s.locationId = "internet_cafe";
    s.player.money = 500;
    expect(startNetbarSession(s).ok).toBe(true);
    const afterFirst = s.player.money;
    const second = startNetbarSession(s);
    expect(second.ok).toBe(false);
    expect(s.player.money).toBe(afterFirst);
  });

  it("离开网吧后机位失效（不会变成永久电脑）", () => {
    const s = fresh();
    s.player.money = 500;
    s.locationId = "internet_cafe";
    expect(startNetbarSession(s).ok).toBe(true);
    expect(hasLaptop(s)).toBe(true);

    expect(moveTo(s, "home").ok).toBe(true);
    expect(hasLaptop(s)).toBe(false);
    expect(laptopTier(s)).toBe("none");

    // 显式结束同样生效
    s.player.money = 500;
    s.locationId = "internet_cafe";
    startNetbarSession(s);
    endNetbarSession(s);
    expect(hasLaptop(s)).toBe(false);
  });

  it("绕过 enterLocation 的强制位移（晕倒回家）也不会漏出机位权限", () => {
    const s = fresh();
    s.player.money = 500;
    s.locationId = "internet_cafe";
    expect(startNetbarSession(s).ok).toBe(true);
    expect(hasLaptop(s)).toBe(true);

    // engine.triggerCollapse 直接改 locationId，不经过 enterLocation
    s.locationId = "home";
    s.region = "downtown_residential";
    expect(hasLaptop(s)).toBe(false);
    expect(laptopTier(s)).toBe("none");
  });

  it("网吧机位在购买的 3 小时用尽后失效", () => {
    const s = fresh();
    s.locationId = "internet_cafe";
    s.player.money = 500;
    expect(startNetbarSession(s).ok).toBe(true);
    advanceHours(s, 2.5);
    expect(netbarSessionRemainingMinutes(s)).toBe(30);
    expect(hasLaptop(s)).toBe(true);
    advanceHours(s, 0.5);
    expect(netbarSessionRemainingMinutes(s)).toBe(0);
    expect(hasLaptop(s)).toBe(false);
    expect(laptopTier(s)).toBe("none");
  });

  it("跨午夜继续消耗机时，过期后即使还在网吧也不可用", () => {
    const s = fresh();
    s.locationId = "internet_cafe";
    s.time.hour = 22;
    s.player.money = 500;
    expect(startNetbarSession(s).ok).toBe(true);
    advanceHours(s, 2);
    expect(s.time.day).toBe(2);
    expect(netbarSessionRemainingMinutes(s)).toBe(60);
    advanceHours(s, 1);
    expect(hasLaptop(s)).toBe(false);
  });
});

function onNetbar(s: ReturnType<typeof fresh>): boolean {
  return s.flags["netbar_session"] === 1;
}

describe("v1.43 抑郁症自助恢复（修复「没钱治 → 干不了活」软锁）", () => {
  it("心情回升并稳定若干天后可自行走出抑郁", () => {
    const s = fresh();
    s.statuses = [{ id: "depressed", severity: 2, count: 1 }];
    s.flags["depressionRecoverStreak"] = 0;

    for (let day = 0; day < DEPRESSION_RECOVER_DAYS; day++) {
      s.player.attrs.mood = DEPRESSION_RECOVER_MOOD;
      dailySurvivalSettlement(s, { preMood: DEPRESSION_RECOVER_MOOD, log: () => {} });
    }

    expect(s.statuses.some((st) => st.id === "depressed")).toBe(false);
    expect(s.flags["depressionRecoverStreak"]).toBe(0);
  });

  it("心情再次低落会清空恢复进度", () => {
    const s = fresh();
    s.statuses = [{ id: "depressed", severity: 2, count: 1 }];
    s.flags["depressionRecoverStreak"] = 0;

    s.player.attrs.mood = DEPRESSION_RECOVER_MOOD;
    dailySurvivalSettlement(s, { preMood: DEPRESSION_RECOVER_MOOD, log: () => {} });
    expect(Number(s.flags["depressionRecoverStreak"])).toBe(1);

    s.player.attrs.mood = 10;
    dailySurvivalSettlement(s, { preMood: 10, log: () => {} });
    expect(Number(s.flags["depressionRecoverStreak"])).toBe(0);
    expect(s.statuses.some((st) => st.id === "depressed")).toBe(true);
  });
});

describe("v1.43 经济数值修正", () => {
  it("月租有绝对上限，涨到 rentCap 就不再涨", () => {
    const s = fresh();
    s.player.money = 100000;
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1700, rentGrowthCount: 0, nextRentDay: gameDay(s.time) };
    s.time.day = 1;
    sleepSettlement(s);

    const cap = getLeaseTier("old_apartment")?.rentCap;
    expect(cap).toBe(1800);
    expect(s.living.lease.rent).toBe(cap);

    // 下个月 1 号再结算：已到顶，不再上涨
    s.time.month = 9;
    s.time.day = 1;
    sleepSettlement(s);
    expect(s.living.lease.rent).toBe(cap);
  });

  it("出租公寓的涨租同样有上限", () => {
    const s = fresh();
    s.player.money = 100000;
    s.living.mode = "lease";
    s.living.lease = { housingId: "rental_apartment", rent: 3100, rentGrowthCount: 0, nextRentDay: gameDay(s.time) };
    s.time.day = 1;
    sleepSettlement(s);
    expect(s.living.lease.rent).toBe(getLeaseTier("rental_apartment")?.rentCap);
    expect(getLeaseTier("rental_apartment")?.rentCap).toBe(3200);
  });

  it("物价每步涨幅与倍率上限符合设定（+0.05，封顶 1.5 倍）", () => {
    const s = fresh();
    expect(priceIndexCap()).toBe(1.5);
    // 难度 0 时月度通胀步长即 0.05 → 10 个月正好到 1.5 倍
    expect(monthlyInflationRate(s)).toBeGreaterThanOrEqual(0.05);
    expect(1 + 10 * 0.05).toBeCloseTo(priceIndexCap(), 6);
  });

  it("赤贫月供已从 -1000 压到可承受量级", () => {
    expect(getFamily("destitute")?.monthlyPayment).toBe(-300);
    expect(getFamily("wealthy")?.monthlyPayment).toBe(500);
  });

  it("不再有 12 小时的班次（最长 10 小时）", () => {
    const long = JOB_DEFS.filter((j) => (j.duration ?? 0) > 10).map((j) => `${j.id}:${j.duration}h`);
    expect(long).toEqual([]);
  });

  it("显式 endHour 与 duration 保持一致（班次缩短时不能漏改）", () => {
    const bad: string[] = [];
    for (const j of JOB_DEFS) {
      if (j.startHour === undefined || j.endHour === undefined) continue;
      const span = (((j.endHour - j.startHour) % 24) + 24) % 24;
      if (span !== (j.duration ?? 8)) bad.push(`${j.id}: ${j.startHour}→${j.endHour} 跨 ${span}h，duration=${j.duration}`);
    }
    expect(bad).toEqual([]);
  });
});
