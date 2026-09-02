import { describe, it, expect } from "vitest";
import type { Effects } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { refreshLaborMarket, performJob, getTodayOffers, mergedJobEffects, settleJobEffects, resolveVehicle, getJobDef, deliveryParttimeBasePay } from "../src/game/core/jobs";

describe("工作机会：劳务市场", () => {
  it("同 seed 同天数生成可复现的岗位池", () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    refreshLaborMarket(a);
    refreshLaborMarket(b);
    expect(a.laborMarket.offers.map((o) => o.jobId)).toEqual(
      b.laborMarket.offers.map((o) => o.jobId),
    );
  });

  it("每日 3~6 个岗位（v0.93）", () => {
    const s = createInitialState(1);
    refreshLaborMarket(s);
    const n = s.laborMarket.offers.length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
  });

  it("保底含至少一个低门槛岗（无技能/证书要求，v0.93）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createInitialState(seed);
      refreshLaborMarket(s);
      const lowBarrier = s.laborMarket.offers.some((o) => {
        const def = getJobDef(o.jobId);
        return def && !def.requirements?.skill && !def.requirements?.flag;
      });
      expect(lowBarrier, `seed ${seed} 未保底低门槛岗`).toBe(true);
    }
  });

  it("同一天重复调用不重复生成", () => {
    const s = createInitialState(7);
    refreshLaborMarket(s);
    const before = s.laborMarket.offers.length;
    refreshLaborMarket(s);
    expect(s.laborMarket.offers.length).toBe(before);
  });

  it("跨天后重新生成岗位池", () => {
    const s = createInitialState(99);
    refreshLaborMarket(s);
    const day1Ids = s.laborMarket.offers.map((o) => o.jobId);
    s.time.day = 3; // gameDay 2（跨天）
    refreshLaborMarket(s);
    // 同 seed 下不同天的序列不同
    const day2Ids = s.laborMarket.offers.map((o) => o.jobId);
    expect(day2Ids).not.toEqual(day1Ids);
    expect(s.laborMarket.generatedDay).toBe(2);
  });

  it("日结工体力消耗 -55 ~ -95 区间（无低消耗档，工作极累）", () => {
    const s = createInitialState(1);
    refreshLaborMarket(s);
    for (const { def } of getTodayOffers(s)) {
      const cost = def.effects.stamina ?? 0;
      expect(cost).toBeLessThan(0);
      expect(-cost).toBeGreaterThanOrEqual(55);
      expect(-cost).toBeLessThanOrEqual(95);
    }
  });

  it("日结工工作时长 6-12 小时（v1.20 无门槛岗改 12 小时班）", () => {
    const s = createInitialState(1);
    refreshLaborMarket(s);
    for (const { def } of getTodayOffers(s)) {
      expect(def.duration).toBeGreaterThanOrEqual(6);
      expect(def.duration).toBeLessThanOrEqual(12);
    }
  });

  it("执行日结工推进工作时长", () => {
    const s = createInitialState(2);
    s.time = { ...s.time, day: 3 }; // v0.97 周一（周六休息日）
    refreshLaborMarket(s);
    const target = s.laborMarket.offers[0];
    if (!target) return;
    const job = getTodayOffers(s).find((x) => x.offer.uid === target.uid)!.def;
    const hour0 = s.time.hour;
    const r = performJob(s, target.uid);
    expect(r.ok).toBe(true);
    expect(s.time.hour).toBe((hour0 + job.duration) % 24);
  });
});

describe("工作机会：执行与名额", () => {
  it("属性不足时拒绝接活", () => {
    const s = createInitialState(1);
    s.player.attrs.stamina = 5;
    s.player.attrs.health = 10;
    refreshLaborMarket(s);
    expect(s.laborMarket.offers.length).toBeGreaterThan(0);
    const uid = s.laborMarket.offers[0].uid;
    const r = performJob(s, uid);
    expect(r.ok).toBe(false);
    // 名额不应减少
    expect(s.laborMarket.offers[0].quota).toBeGreaterThan(0);
  });

  it("无驾驶本可进实习期（驾校助教工资 50%）", () => {
    const s = createInitialState(2);
    s.time = { ...s.time, day: 3 }; // v0.97 周一
    s.player.attrs.health = 80;
    s.player.attrs.stamina = 80;
    s.time.hour = 9; // 驾校营业 8:00-20:00
    const money0 = s.player.money;
    const r = performJob(s, "job_driving_tutor");
    expect(r.ok).toBe(true);
    // 实习期工资 50%（100 → 50）
    expect(s.player.money - money0).toBe(50);
    expect(s.career.internDays["job_driving_tutor"]).toBe(1);
    expect(s.flags["item_driving_license"]).toBeUndefined();
  });

  it("持有驾驶本后接活拿全额工资", () => {
    const s = createInitialState(2);
    s.time = { ...s.time, day: 3 }; // v0.97 周一
    s.player.attrs.health = 80;
    s.player.attrs.stamina = 80;
    s.time.hour = 9;
    s.flags["item_driving_license"] = true;
    const money0 = s.player.money;
    const r = performJob(s, "job_driving_tutor");
    expect(r.ok).toBe(true);
    expect(s.player.money - money0).toBe(110); // 100 + 持证补贴 10
  });

  it("咖啡厅店员：无技能证书可实习（50%），满 3 天自动发证恢复全额", () => {
    const s = createInitialState(3);
    s.time = { ...s.time, day: 3 }; // v0.97 周一（第 1 天）
    s.time.hour = 9; // cafe 8-22 营业，且 startHour=9 准点到岗
    s.player.attrs.health = 80;
    s.player.attrs.stamina = 80;
    s.player.skills.service = 5;
    s.player.money = 1000;

    // 第 1 天：实习 50%（110 → 55）
    const m0 = s.player.money;
    expect(performJob(s, "job_cafe_staff").ok).toBe(true);
    expect(s.player.money - m0).toBe(55);
    expect(s.career.internDays["job_cafe_staff"]).toBe(1);
    expect(s.flags["item_certificate"]).toBeUndefined();

    // 第 2 天：跨天 + 实习
    s.time.day = 4; // gameDay 3
    s.time.hour = 9;
    s.player.attrs.stamina = 80;
    s.player.money = 1000;
    const m1 = s.player.money;
    expect(performJob(s, "job_cafe_staff").ok).toBe(true);
    expect(s.player.money - m1).toBe(55);
    expect(s.career.internDays["job_cafe_staff"]).toBe(2);

    // 第 3 天：满 3 天发证，本次仍 50%，下一班全额
    s.time.day = 5; // gameDay 4
    s.time.hour = 9;
    s.player.attrs.stamina = 80;
    s.player.money = 1000;
    const m2 = s.player.money;
    expect(performJob(s, "job_cafe_staff").ok).toBe(true);
    expect(s.player.money - m2).toBe(55);
    expect(s.flags["item_certificate"]).toBe(true);
    expect(s.career.internDays["job_cafe_staff"]).toBe(0);

    // 第 4 天：已持证，全额 110 + 持证补贴 10 = 120
    s.time.day = 6; // gameDay 5
    s.time.hour = 9;
    s.player.attrs.stamina = 80;
    s.player.money = 1000;
    const m3 = s.player.money;
    expect(performJob(s, "job_cafe_staff").ok).toBe(true);
    expect(s.player.money - m3).toBe(120);
  });

  it("接活成功扣体力 + 加钱 + 名额减少（按交通工具分档）", () => {
    const s = createInitialState(2);
    refreshLaborMarket(s);
    const target = s.laborMarket.offers.find((o) => o.quota === 1);
    if (!target) return; // 数据随机性兜底
    const money0 = s.player.money;
    const stamina0 = s.player.attrs.stamina;
    const r = performJob(s, target.uid);
    expect(r.ok).toBe(true);
    const earned = s.player.money - money0;
    expect(earned).toBeGreaterThan(0);
    expect(earned).toBeLessThanOrEqual(160); // 无车档 40-65，最高档 105-125，留余量
    expect(s.player.attrs.stamina).toBeLessThan(stamina0);
    const still = s.laborMarket.offers.find((o) => o.uid === target.uid);
    if (still) expect(still.quota).toBeLessThan(target.quota);
  });

  it("外卖分档基础值：无车 55 / 自行车 75 / 电动车 105", () => {
    const s = createInitialState(7);
    expect(resolveVehicle(s)).toBe("none");
    const job = getJobDef("job_delivery")!;
    expect(mergedJobEffects(s, job).money).toBe(55);
    s.flags["item_bicycle"] = true;
    expect(resolveVehicle(s)).toBe("bicycle");
    expect(mergedJobEffects(s, job).money).toBe(75);
    s.flags["item_e_bike"] = true;
    expect(resolveVehicle(s)).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(105);
  });

  it("外卖结算浮动工资落在区间内（电动车 95-125）", () => {
    const s = createInitialState(11);
    s.flags["item_e_bike"] = true;
    const job = getJobDef("job_delivery")!;
    let last: Effects | null = null;
    for (let i = 0; i < 20; i++) {
      last = settleJobEffects(s, job);
      expect(last.money!).toBeGreaterThanOrEqual(95);
      expect(last.money!).toBeLessThanOrEqual(125);
    }
    // log 占位符被替换
    expect(last!.log).not.toContain("{money}");
  });

  it("兼职外卖基础收入按载具档位（P1-12：修复裸 flag 导致恒为步行 35）", () => {
    const s = createInitialState(7);
    expect(deliveryParttimeBasePay(s)).toBe(35); // 无车步行
    s.flags["item_bicycle"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(50);
    delete s.flags["item_bicycle"];
    s.flags["item_tricycle"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(60);
    delete s.flags["item_tricycle"];
    s.flags["item_e_bike"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(70);
    delete s.flags["item_e_bike"];
    s.flags["item_car"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(90);
  });
});
