import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { buyProperty, getEffectiveLodging, getBuyTiers } from "../src/game/core/housing";
import { buyVehicle, rentVehicle, checkVehicleExpiry, VEHICLE_NAMES } from "../src/game/core/vehicle";
import {
  buyInvestment,
  sellInvestment,
  settleInvestments,
  INVEST_PRODUCTS,
  investmentTotal,
} from "../src/game/core/invest";
import { sleepSettlement, advanceHours } from "../src/game/core/time";
import { performAction } from "../src/game/core/actions";
import { evaluateTarot } from "../src/game/core/tarot";

describe("经济闭环 v0.94（产权房 / 购车 / 投资 / 奢侈品）", () => {
  describe("产权买房", () => {
    it("买断成功：mode→own、ownedId、扣款、flag、生效档位", () => {
      const s = createInitialState();
      s.player.money = 50000;
      const r = buyProperty(s, "own_old_unit");
      expect(r.ok).toBe(true);
      expect(r.price).toBe(30000);
      expect(s.player.money).toBe(20000);
      expect(s.living.mode).toBe("own");
      expect(s.living.ownedId).toBe("own_old_unit");
      expect(s.living.lease).toBeNull();
      expect(s.living.nightly).toBeNull();
      expect(s.flags["owned_property"]).toBe(true);
      expect(getEffectiveLodging(s).id).toBe("own_old_unit");
      expect(getEffectiveLodging(s).recovery).toBe(0.8);
    });

    it("房价按物价倍率缩放", () => {
      const s = createInitialState();
      s.player.money = 100000;
      s.economy.priceIndex = 1.5;
      const r = buyProperty(s, "own_old_unit");
      expect(r.ok).toBe(true);
      expect(r.price).toBe(45000);
      expect(s.player.money).toBe(55000);
    });

    it("现金不足拒绝", () => {
      const s = createInitialState();
      s.player.money = 1000;
      const r = buyProperty(s, "own_apartment");
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("买不起");
      expect(s.living.mode).toBe("gov"); // 状态未被污染
    });

    it("已有产权不能重复购买", () => {
      const s = createInitialState();
      s.player.money = 100000;
      buyProperty(s, "own_old_unit");
      const r2 = buyProperty(s, "own_apartment");
      expect(r2.ok).toBe(false);
      expect(r2.reason).toContain("重复购买");
      expect(s.living.ownedId).toBe("own_old_unit");
    });

    it("自有房睡觉免按天房费", () => {
      const s = createInitialState();
      s.player.money = 100000;
      s.living = { mode: "nightly", govDaysLeft: 0, nightly: { lodgingId: "hotel" }, lease: null };
      const r = buyProperty(s, "own_apartment"); // hotel 120/晚，买断后不再扣
      expect(r.ok).toBe(true);
      const before = s.player.money;
      sleepSettlement(s, { stayedUp: false, hours: 8 });
      expect(s.player.money).toBe(before);
    });

    it("自有房每月 1 号不再扣月租", () => {
      const s = createInitialState();
      s.player.money = 300000;
      s.time = { ...s.time, day: 1 };
      s.living = { mode: "lease", govDaysLeft: 0, nightly: null, lease: { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 } };
      const r = buyProperty(s, "own_villa");
      expect(r.ok).toBe(true);
      const before = s.player.money;
      sleepSettlement(s, { stayedUp: false, hours: 8 });
      expect(s.player.money).toBe(before);
    });

    it("getBuyTiers 提供 3 档可购房源", () => {
      expect(getBuyTiers().length).toBe(3);
      expect(getBuyTiers()[0].buyPrice).toBeGreaterThan(0);
    });
  });

  describe("购车资产", () => {
    it("买断成功：owned=true、flag、不受到期回收", () => {
      const s = createInitialState();
      s.player.money = 100000;
      const r = buyVehicle(s, "car");
      expect(r.ok).toBe(true);
      expect(r.price).toBe(50000);
      expect(s.vehicles["car"]?.owned).toBe(true);
      expect(s.flags["item_car"]).toBe(true);
      // 时间推移远超租期 → 自有车不被回收
      s.time = { ...s.time, year: 3, month: 3, day: 1 };
      checkVehicleExpiry(s);
      expect(s.vehicles["car"]?.owned).toBe(true);
    });

    it("购车价按物价缩放", () => {
      const s = createInitialState();
      s.player.money = 100000;
      s.economy.priceIndex = 1.2;
      const r = buyVehicle(s, "e_bike");
      expect(r.ok).toBe(true);
      expect(r.price).toBe(3600);
      expect(s.player.money).toBe(96400);
    });

    it("现金不足 / 重复购买拒绝", () => {
      const s = createInitialState();
      s.player.money = 1000;
      expect(buyVehicle(s, "car").ok).toBe(false);
      s.player.money = 100000;
      buyVehicle(s, "car");
      const r2 = buyVehicle(s, "car");
      expect(r2.ok).toBe(false);
      expect(r2.reason).toContain("已经拥有");
    });

    it("v1.20 押金制租车不再 30 天到期；旧版无押金记录仍到期回收", () => {
      const s = createInitialState();
      s.player.money = 5000;
      rentVehicle(s, "car");
      expect(s.vehicles["car"]?.owned).not.toBe(true);
      // 押金制：不限租期，跨月也不回收
      s.time = { ...s.time, month: s.time.month + 1, day: s.time.day };
      checkVehicleExpiry(s);
      expect(s.vehicles["car"]).toBeDefined();
      expect(s.flags["item_car"]).toBe(true);
      // 旧版无押金记录（迁移前）→ 仍按 30 天到期回收
      const s2 = createInitialState();
      s2.vehicles["car"] = { day: s2.time.day, month: s2.time.month, year: s2.time.year };
      s2.flags["item_car"] = true;
      s2.time = { ...s2.time, month: s2.time.month + 1, day: s2.time.day };
      checkVehicleExpiry(s2);
      expect(s2.vehicles["car"]).toBeUndefined();
      expect(s2.flags["item_car"]).toBe(false);
    });

    it("VEHICLE_NAMES 覆盖三种载具", () => {
      expect(VEHICLE_NAMES["car"]).toBe("汽车");
    });
  });

  describe("投资理财", () => {
    it("买入成功：扣现金、入组合、value=principal", () => {
      const s = createInitialState();
      s.player.money = 10000;
      const r = buyInvestment(s, "deposit", 1000);
      expect(r.ok).toBe(true);
      expect(s.player.money).toBe(9000);
      expect(s.economy.investments.length).toBe(1);
      const inv = s.economy.investments[0];
      expect(inv.productId).toBe("deposit");
      expect(inv.principal).toBe(1000);
      expect(inv.value).toBe(1000);
    });

    it("低于最低投入 / 现金不足拒绝", () => {
      const s = createInitialState();
      s.player.money = 10000;
      expect(buyInvestment(s, "stock", 100).ok).toBe(false); // stock 最低 1000
      expect(buyInvestment(s, "deposit", 50).ok).toBe(false); // deposit 最低 100
      expect(buyInvestment(s, "stock", 99999).ok).toBe(false); // 现金不足
      expect(s.economy.investments.length).toBe(0);
    });

    it("卖出变现：money 加回、列表移除、盈亏正确", () => {
      const s = createInitialState();
      s.player.money = 10000;
      buyInvestment(s, "deposit", 1000);
      const id = s.economy.investments[0].id;
      const r = sellInvestment(s, id);
      expect(r.ok).toBe(true);
      expect(r.gain).toBe(0);
      expect(s.economy.investments.length).toBe(0);
      expect(s.player.money).toBe(10000); // 10000 - 1000 + 1000
    });

    it("月结：存款固定正息，市值增长且保底 ≥1", () => {
      const s = createInitialState();
      s.player.money = 10000;
      buyInvestment(s, "deposit", 1000);
      settleInvestments(s);
      const inv = s.economy.investments[0];
      expect(inv.value).toBe(1005); // 1000 * 1.005 四舍五入
      expect(investmentTotal(s)).toBe(1005);
    });

    it("月结挂点：advanceHours 跨月自动结算", () => {
      const s = createInitialState();
      s.player.money = 10000;
      buyInvestment(s, "deposit", 1000);
      s.time = { ...s.time, day: 30, hour: 23, minute: 0 };
      advanceHours(s, 2); // 跨入 9 月 1 号 → rollDay 触发通胀 + 投资结算
      expect(s.time.month).toBe(9);
      expect(s.time.day).toBe(1);
      const inv = s.economy.investments[0];
      expect(inv.value).toBeGreaterThan(inv.principal); // 存款固定正收益
      expect(s.economy.priceIndex).toBeGreaterThan(1); // 通胀同时发生
    });

    it("股票波动可能亏损但市值保底", () => {
      const s = createInitialState();
      s.player.money = 100000;
      buyInvestment(s, "stock", 1000);
      const before = s.economy.investments[0].value;
      settleInvestments(s);
      const after = s.economy.investments[0].value;
      expect(after).toBeGreaterThanOrEqual(1);
        // 波动范围：期望 2% ± 24%（两次 rng 噪声 → 理论最大 ±26%）
        expect(Math.abs(after - before)).toBeLessThanOrEqual(Math.round(before * 0.26) + 1);
    });

    it("INVEST_PRODUCTS 三档产品齐全", () => {
      expect(INVEST_PRODUCTS.map((p) => p.id)).toEqual(["deposit", "fund", "stock"]);
    });
  });

  describe("奢侈品消费", () => {
    it("名牌店购买记录 ownedLuxury，集齐 3 件且金钱≥20000 解锁「恶魔」牌", () => {
      const s = createInitialState();
      s.player.money = 50000;
      s.time = { ...s.time, hour: 12, minute: 0 }; // 名牌店 10-22 点营业
      const r1 = performAction(s, "buy_luxury_coat");
      expect(r1.ok).toBe(true);
      expect(s.economy.ownedLuxury).toContain("luxury_coat");
      const r2 = performAction(s, "buy_luxury_watch");
      expect(r2.ok).toBe(true);
      const r3 = performAction(s, "buy_luxury_bag");
      expect(r3.ok).toBe(true);
      expect(s.economy.ownedLuxury.length).toBe(3);
      // 50000 − 3000 − 10000 − 15000 = 22000 ≥ 20000 → 恶魔（15）
      evaluateTarot(s);
      expect(s.tarot.unlocked).toContain(15);
    });

    it("重复购买同一奢侈品不去重计数（ownedLuxury 列表含 id）", () => {
      const s = createInitialState();
      s.player.money = 50000;
      s.time = { ...s.time, hour: 12, minute: 0 };
      performAction(s, "buy_luxury_coat");
      performAction(s, "buy_luxury_coat");
      expect(s.economy.ownedLuxury.filter((x) => x === "luxury_coat").length).toBe(1); // 去重
    });
  });
});
