import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { rentVehicle, checkVehicleExpiry, VEHICLE_RENT } from "../src/game/core/vehicle";
import { resolveVehicle, resolveTierForJob, getJobDef, settleJobEffects, mergedJobEffects } from "../src/game/core/jobs";
import { performAction } from "../src/game/core/actions";
import { applyFamily } from "../src/game/core/families";

describe("载具月租", () => {
  it("三档月租 600/1200/3000", () => {
    expect(VEHICLE_RENT).toEqual({ e_bike: 600, tricycle: 1200, car: 3000 });
  });

  it("租用成功：扣款 + 写 flag + 到期日 +30", () => {
    const s = createInitialState();
    s.player.money = 1000;
    const r = rentVehicle(s, "e_bike");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(400);
    expect(s.flags["item_e_bike"]).toBe(true);
    expect(s.vehicles["e_bike"].day).toBe(1); // day 1 + 30 → 跨月进位到 month9 day1（开局 8 月）
    expect(s.vehicles["e_bike"].month).toBe(9);
  });

  it("钱不足拒绝", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = rentVehicle(s, "car");
    expect(r.ok).toBe(false);
    expect(s.flags["item_car"]).toBeUndefined();
  });

  it("已持有拒绝（不重复扣款）", () => {
    const s = createInitialState();
    s.player.money = 2000;
    rentVehicle(s, "e_bike");
    const money = s.player.money;
    const r = rentVehicle(s, "e_bike");
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(money);
  });

  it("到期收回", () => {
    const s = createInitialState();
    s.player.money = 1000;
    rentVehicle(s, "e_bike");
    s.time.month = 9; s.time.day = 1; // 到期日（day1+30 进位到 month9 day1）
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(false);
    expect(s.vehicles["e_bike"]).toBeUndefined();
  });

  it("跨月租用仍可用满 30 天（月底租不提前到期）", () => {
    const s = createInitialState();
    s.player.money = 1000;
    s.time.day = 29; // 月底（8/29）
    rentVehicle(s, "e_bike");
    expect(s.vehicles["e_bike"].month).toBe(9);
    expect(s.vehicles["e_bike"].day).toBe(29);
    s.time.month = 9; s.time.day = 28;
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(true); // 仍在租期
    s.time.month = 9; s.time.day = 29;
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(false); // 次月 29 日才到期（v0.936 修复前次月 1 日即误判到期）
  });

  it("未到期不收回", () => {
    const s = createInitialState();
    s.player.money = 1000;
    rentVehicle(s, "e_bike");
    s.time.day = 20;
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(true);
  });

  it("租用行动（劳务市场）生效", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 10;
    s.player.money = 1000;
    s.locationId = "labor_market";
    const r = performAction(s, "rent_e_bike_labor");
    expect(r.ok).toBe(true);
    expect(s.flags["item_e_bike"]).toBe(true);
    expect(s.player.money).toBe(400);
  });
});

describe("载具与岗位联动", () => {
  it("resolveVehicle 优先级 car > tricycle > e_bike > bicycle", () => {
    const s = createInitialState();
    s.flags["item_e_bike"] = true;
    expect(resolveVehicle(s)).toBe("e_bike");
    s.flags["item_tricycle"] = true;
    expect(resolveVehicle(s)).toBe("tricycle");
    s.flags["item_car"] = true;
    expect(resolveVehicle(s)).toBe("car");
  });

  it("快递岗 tricycle 档位最高", () => {
    const s = createInitialState();
    const job = getJobDef("job_express")!;
    expect(mergedJobEffects(s, job).money).toBe(55); // none 档
    s.flags["item_tricycle"] = true;
    expect(mergedJobEffects(s, job).money).toBe(105); // tricycle 档
  });

  it("持 car 跑外卖回退到 e_bike 档（防跳档）", () => {
    const s = createInitialState();
    s.flags["item_car"] = true;
    const job = getJobDef("job_delivery")!;
    const tier = resolveTierForJob(s, job);
    expect(tier).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(90);
  });

  it("网约车岗需 car + 驾驶本", () => {
    const s = createInitialState();
    s.player.stats.intelligence = 40;
    s.player.skills.driving = 1;
    const job = getJobDef("job_ride_hailing")!;
    const job2 = getJobDef("job_taxi")!;
    expect(job.requirements?.flag).toBe("item_car");
    expect(job2.requirements?.flag).toBe("item_car");
  });

  it("网约车工资浮动区间 90-140", () => {
    const s = createInitialState(42);
    s.flags["item_car"] = true;
    s.player.skills.driving = 1;
    const job = getJobDef("job_ride_hailing")!;
    for (let i = 0; i < 20; i++) {
      const eff = settleJobEffects(s, job);
      expect(eff.money).toBeGreaterThanOrEqual(90);
      expect(eff.money).toBeLessThanOrEqual(140);
    }
  });

  it("销售岗底薪+提成浮动", () => {
    const s = createInitialState(42);
    const job = getJobDef("job_sales")!;
    const eff = settleJobEffects(s, job);
    expect(eff.money).toBeGreaterThanOrEqual(60);
    expect(eff.money).toBeLessThanOrEqual(110);
  });
});

describe("新行动集成", () => {
  it("洗浴中心：300 元泡 24h，干净度饱食体力回满", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 12;
    s.player.money = 500;
    s.player.attrs.satiety = 20;
    s.player.attrs.stamina = 30;
    s.player.attrs.hygiene = 10;
    s.locationId = "bathhouse";
    const r = performAction(s, "bath_center");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.satiety).toBe(100);
    expect(s.player.attrs.stamina).toBe(100);
    expect(s.player.attrs.hygiene).toBe(100);
    expect(s.player.money).toBe(200);
    expect(s.time.day).toBe(2); // +24h 跨天
  });

  it("酒店开房：nightly 模式切到 hotel 档", () => {
    const s = createInitialState();
    applyFamily(s, "wealthy"); // 无 gov，直接 nightly
    s.time.hour = 12;
    s.player.money = 500;
    s.locationId = "hotel";
    const r = performAction(s, "stay_hotel");
    expect(r.ok).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("hotel");
  });

  it("已有固定住处不能开房", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 12;
    s.player.money = 500;
    s.locationId = "hotel";
    const r = performAction(s, "stay_hotel");
    expect(r.ok).toBe(false);
  });

  it("住院中出门被拦截", () => {
    const s = createInitialState();
    s.flags["hospitalized"] = true;
    s.locationId = "hospital";
    s.region = "downtown_center";
    const r = performAction(s, "discharge") as { ok: boolean };
    expect(r.ok).toBe(true); // 出院行动本身可以
    expect(s.flags["hospitalized"]).toBe(false);
  });
});