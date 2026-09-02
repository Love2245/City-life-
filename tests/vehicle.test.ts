import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  rentVehicle,
  returnVehicle,
  buyVehicle,
  checkVehicleExpiry,
  VEHICLE_DEPOSIT,
  VEHICLE_BUY,
} from "../src/game/core/vehicle";
import { resolveVehicle, resolveTierForJob, getJobDef, settleJobEffects, mergedJobEffects } from "../src/game/core/jobs";
import { performAction } from "../src/game/core/actions";
import { applyFamily } from "../src/game/core/families";

describe("v1.20 载具押金制租赁", () => {
  it("三档押金 600/1200/3000，自行车仅买断 300", () => {
    expect(VEHICLE_DEPOSIT).toEqual({ e_bike: 600, tricycle: 1200, car: 3000 });
    expect(VEHICLE_BUY.bicycle).toBe(300);
  });

  it("租用成功：扣押金 + 写 flag + 记录押金（不限租期）", () => {
    const s = createInitialState();
    s.player.money = 1000;
    const r = rentVehicle(s, "e_bike");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(400);
    expect(s.flags["item_e_bike"]).toBe(true);
    expect(s.vehicles["e_bike"].day).toBe(1);
    expect(s.vehicles["e_bike"].deposit).toBe(600);
  });

  it("钱不足拒绝", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = rentVehicle(s, "car");
    expect(r.ok).toBe(false);
    expect(s.flags["item_car"]).toBeUndefined();
  });

  it("已持有/已租用拒绝（不重复扣款）", () => {
    const s = createInitialState();
    s.player.money = 2000;
    rentVehicle(s, "e_bike");
    const money = s.player.money;
    const r = rentVehicle(s, "e_bike");
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(money);
  });

  it("押金制租赁不自动到期（需手动退租）", () => {
    const s = createInitialState();
    s.player.money = 1000;
    rentVehicle(s, "e_bike");
    s.time.month = 12; s.time.day = 29;
    checkVehicleExpiry(s);
    expect(s.flags["item_e_bike"]).toBe(true);
    expect(s.vehicles["e_bike"]).toBeDefined();
  });

  it("退租：退押金 + 清 flag + 删记录", () => {
    const s = createInitialState();
    s.player.money = 1000;
    rentVehicle(s, "e_bike");
    const r = returnVehicle(s, "e_bike");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(1000);
    expect(s.flags["item_e_bike"]).toBe(false);
    expect(s.vehicles["e_bike"]).toBeUndefined();
  });

  it("买断租用中的车：押金抵扣购车款", () => {
    const s = createInitialState();
    s.player.money = 5000;
    rentVehicle(s, "e_bike");
    // 买断 3000 - 押金 600 = 2400
    const r = buyVehicle(s, "e_bike");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(5000 - 600 - 2400);
    expect(s.vehicles["e_bike"].owned).toBe(true);
    expect(s.vehicles["e_bike"].deposit).toBeUndefined();
  });

  it("租用行动（汽车租赁行）生效", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 10;
    s.player.money = 1000;
    s.locationId = "car_rental";
    const r = performAction(s, "rent_e_bike_shop");
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
    expect(mergedJobEffects(s, job).money).toBe(65); // none 档
    s.flags["item_tricycle"] = true;
    expect(mergedJobEffects(s, job).money).toBe(120); // tricycle 档
  });

  it("v1.215 修复：e_bike 跑快递拿 e_bike 档（不再错拿 tricycle 高档）", () => {
    const s = createInitialState();
    s.flags["item_e_bike"] = true;
    const job = getJobDef("job_express")!;
    const tier = resolveTierForJob(s, job);
    expect(tier).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(105); // 原实现跳档到 tricycle 120（+33% 错档）
  });

  it("持 car 跑外卖回退到 e_bike 档（防跳档）", () => {
    const s = createInitialState();
    s.flags["item_car"] = true;
    const job = getJobDef("job_delivery")!;
    const tier = resolveTierForJob(s, job);
    expect(tier).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(105);
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
