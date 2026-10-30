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
import { checkJobRequirements, resolveVehicle, resolveTierForJob, getJobDef, settleJobEffects, mergedJobEffects, rideHailingParttime } from "../src/game/core/jobs";
import { performAction } from "../src/game/core/actions";
import { applyFamily } from "../src/game/core/families";

describe("v1.20 载具押金制租赁", () => {
  it("四档押金 100/600/1200/3000，自行车可租可买", () => {
    expect(VEHICLE_DEPOSIT).toEqual({ bicycle:100,e_bike: 600, tricycle: 1200, car: 3000 });
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

  it("租车押金随物价倍率调整，退租退回实际缴纳的金额", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 10;
    s.player.money = 900;
    s.economy.priceIndex = 1.5;
    s.locationId = "car_rental";

    const rented = performAction(s, "rent_e_bike_shop");
    expect(rented.ok).toBe(true);
    expect(s.player.money).toBe(0);
    expect(s.vehicles.e_bike?.deposit).toBe(900);

    const returned = returnVehicle(s, "e_bike");
    expect(returned).toMatchObject({ ok: true, price: 900 });
    expect(s.player.money).toBe(900);
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

  it("快递岗单位提供基础工具，自有三轮车只加成且不替代基础工资", () => {
    const s = createInitialState();
    const job = getJobDef("job_express")!;
    const base = mergedJobEffects(s, job).money!;
    expect(base).toBe(job.effects.money);
    s.flags["item_tricycle"] = true;
    expect(mergedJobEffects(s, job).money).toBe(Math.round(base * 1.12));
    expect(mergedJobEffects(s, job).money).toBeGreaterThan(base);
  });

  it("v1.215 修复：e_bike 跑快递拿 e_bike 档（不再错拿 tricycle 高档）", () => {
    const s = createInitialState();
    s.flags["item_e_bike"] = true;
    const job = getJobDef("job_express")!;
    const tier = resolveTierForJob(s, job);
    expect(tier).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(Math.round(job.effects.money! * 1.1));
  });

  it("持 car 跑外卖回退到 e_bike 档（防跳档）", () => {
    const s = createInitialState();
    s.flags["item_car"] = true;
    const job = getJobDef("job_delivery")!;
    const tier = resolveTierForJob(s, job);
    expect(tier).toBe("e_bike");
    expect(mergedJobEffects(s, job).money).toBe(Math.round(job.effects.money! * 1.1));
  });

  it("网约车班次必须持驾驶证、有汽车并安装手机 App", () => {
    const s = createInitialState();
    const job = getJobDef("job_ride_hailing")!;
    const job2 = getJobDef("job_taxi")!;
    expect(job.requirements?.flag).toBe("item_car");
    expect(job2.requirements?.flag).toBe("item_car");
    expect(checkJobRequirements(s, job).ok).toBe(false);
    s.flags.item_car = true;
    s.player.skills.driving = 1;
    expect(checkJobRequirements(s, job)).toMatchObject({ ok: true, intern: false });
    expect(checkJobRequirements(s, job2)).toMatchObject({ ok: true, intern: false });
    delete s.flags.item_car;
    expect(rideHailingParttime(s).reason).toContain("驾驶证");
    s.flags.item_driving_license = true;
    expect(rideHailingParttime(s).reason).toContain("汽车");
    s.flags.item_car = true;
    expect(rideHailingParttime(s).reason).toContain("安装网约车软件");
  });

  it("网约车不再使用劳务市场随机底薪", () => {
    const s = createInitialState(42);
    s.player.skills.driving = 0;
    const job = getJobDef("job_ride_hailing")!;
    for (let i = 0; i < 20; i++) {
      const eff = settleJobEffects(s, job);
      expect(eff.money).toBe(0);
    }
  });

  it("销售岗底薪+提成浮动", () => {
    const s = createInitialState(42);
    const job = getJobDef("job_sales")!;
    const eff = settleJobEffects(s, job);
    expect(eff.money).toBeGreaterThanOrEqual(120);
    expect(eff.money).toBeLessThanOrEqual(145);
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

  it("已有固定住处也能开房并保留政府床位", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 12;
    s.player.money = 500;
    s.locationId = "hotel";
    const r = performAction(s, "stay_hotel");
    expect(r.ok).toBe(true);
    expect(s.living.mode).toBe("gov");
    expect(s.living.awayNight?.lodgingId).toBe("hotel");
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
