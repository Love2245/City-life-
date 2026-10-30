import { grantTempleStay } from "../src/game/core/residence";
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import {
  getEffectiveLodging,
  buyProperty,
  selectLodging,
  signLease,
  canSleepHere,
  hasFacility,
  currentResidenceName,
  currentRegion,
  daysUntilNextRent,
  HOUSING,
} from "../src/game/core/housing";
import { gameDay } from "../src/game/core/calendar";
import { sleep, sleepSettlement } from "../src/game/core/time";
import { canPerform, getAction, getLocation, performAction, travelPlan, visibleActionsAtLocation } from "../src/game/core/actions";

describe("住房系统：档位解析", () => {
  it("gov 模式 → gov 档（v0.97 起含洗澡设施，无灶台）", () => {
    const s = createInitialState();
    expect(s.living.mode).toBe("gov");
    const tier = getEffectiveLodging(s);
    expect(tier.id).toBe("gov");
    expect(hasFacility(s, "rest")).toBe(true);
    expect(hasFacility(s, "shower")).toBe(true); // v0.97 政府住房与民宿一致
    expect(hasFacility(s, "cook")).toBe(false);
  });

  it("nightly 模式 + 未选 → 默认 ATM", () => {
    const s = createInitialState();
    s.living.mode = "nightly";
    s.living.nightly = null;
    expect(getEffectiveLodging(s).id).toBe("atm");
  });

  it("nightly 模式 + hostel → 青旅", () => {
    const s = createInitialState();
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "hostel" };
    expect(getEffectiveLodging(s).id).toBe("hostel");
    expect(hasFacility(s, "shower")).toBe(true);
  });

  it("lease 模式 → 月租档", () => {
    const s = createInitialState();
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    expect(getEffectiveLodging(s).id).toBe("old_apartment");
    expect(hasFacility(s, "cook")).toBe(true);
  });
});

describe("住房系统：操作", () => {
  it("selectLodging：nightly 写常驻选择；有住处时写「今晚外宿」保留常住地址并持续到退房", () => {
    const s = createInitialState();
    s.player.money = 500;
    // 有固定住处（gov）也能去酒店 / 民宿 / 寺庙住一晚
    expect(selectLodging(s, "hostel")).toBe(true);
    expect(s.living.awayNight?.lodgingId).toBe("hostel");
    // 未知档位仍然拒绝
    expect(selectLodging(s, "nonexistent")).toBe(false);
    // 现金不够时拒绝（避免睡完变负资产）
    s.player.money = 1;
    expect(selectLodging(s, "hotel")).toBe(false);

    s.player.money = 500;
    s.living.mode = "nightly";
    expect(selectLodging(s, "hostel")).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("hostel");
  });

  it("signLease 钱不够被拒", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.player.money = 500;
    const r = signLease(s, "old_apartment");
    expect(r.ok).toBe(false);
    expect(s.living.mode).not.toBe("lease");
  });

  it("signLease 成功后切到 lease + 扣首月 + 清 nightly", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "hostel" };
    s.player.money = 1500;
    const r = signLease(s, "old_apartment");
    expect(r.ok).toBe(true);
    expect(s.living.mode).toBe("lease");
    expect(s.living.nightly).toBe(null);
    expect(s.living.lease?.rent).toBe(1000);
    expect(s.player.money).toBe(500);
  });

  it("赤贫签约月租享 15% 折扣（1000 → 850）", () => {
    const s = createInitialState();
    applyFamily(s, "destitute"); // rentDiscount 0.15
    s.player.money = 900;
    const r = signLease(s, "old_apartment");
    expect(r.ok).toBe(true);
    expect(s.living.lease?.rent).toBe(850);
    expect(s.player.money).toBe(50);
  });

  it("赤贫折扣后钱仍不够被拒", () => {
    const s = createInitialState();
    applyFamily(s, "destitute");
    s.player.money = 100;
    const r = signLease(s, "old_apartment");
    expect(r.ok).toBe(false);
  });

  it("已有产权时普通租约入口与签约逻辑都拒绝覆盖住房", () => {
    const s = createInitialState();
    s.living.mode = "own";
    s.living.ownedId = "own_old_unit";
    s.flags["owned_property"] = true;
    s.player.money = 5000;
    const moneyBefore = s.player.money;
    const action = getAction("sign_lease")!;

    expect(action.requirements?.notFlag).toBe("owned_property");
    expect(canPerform(s, action).ok).toBe(false);
    expect(performAction(s, "sign_lease").ok).toBe(false);
    expect(signLease(s, "old_apartment").ok).toBe(false);
    expect(s.living.mode).toBe("own");
    expect(s.living.ownedId).toBe("own_old_unit");
    expect(s.player.money).toBe(moneyBefore);
  });

  it("旧档残留产权时仍不能覆盖为普通租约，但可继续购入产权房", () => {
    for (const residue of ["ownedId", "owned_property"] as const) {
      const s = createInitialState();
      s.living.mode = "lease";
      s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
      if (residue === "ownedId") s.living.ownedId = "own_old_unit";
      else s.flags["owned_property"] = true;
      s.player.money = 100000;
      const moneyBefore = s.player.money;

      expect(signLease(s, "rental_apartment").ok).toBe(false);
      expect(s.player.money).toBe(moneyBefore);
      expect(buyProperty(s, "own_apartment").ok).toBe(true);
      expect(s.player.money).toBeLessThan(moneyBefore);
      expect(s.living.mode).toBe("own");
      expect(s.living.lease).toBeNull();
      expect(s.living.ownedId).toBe("own_apartment");
      expect(s.living.properties).toHaveLength(residue==='ownedId'?2:1);
      expect(s.flags["owned_property"]).toBe(true);
    }
  });

  it("8/23 签约预付 30 天：9/1 不重复扣款，到 9/23 才续缴", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.year = 2026;
    s.time.month = 8;
    s.time.day = 23;
    s.time.hour = 12;
    s.player.money = 5000;

    expect(signLease(s, "old_apartment").ok).toBe(true);
    const firstDueDay = gameDay({ year: 2026, month: 9, day: 23 });
    expect(s.living.lease?.nextRentDay).toBe(firstDueDay);
    expect(daysUntilNextRent(s)).toBe(30);
    expect(s.flags["lease_first_month_prepaid"]).toBeUndefined();

    const rentLogsBefore = s.log.filter((entry) => entry.text.includes("交了房租")).length;
    const afterSigning = s.player.money;
    s.time.month = 9;
    s.time.day = 1;
    s.time.hour = 8;
    s.time.stayedUp = false;
    delete s.flags["settledToday"];
    sleepSettlement(s);
    expect(s.log.filter((entry) => entry.text.includes("交了房租")).length).toBe(rentLogsBefore);
    expect(s.player.money).toBe(afterSigning);
    expect(daysUntilNextRent(s)).toBe(22);
    expect(s.flags["lease_first_month_prepaid"]).toBeUndefined();

    const rentAtDue = s.living.lease!.rent;
    s.time.day = 23;
    sleepSettlement(s);
    expect(s.log.filter((entry) => entry.text.includes("交了房租")).length).toBe(rentLogsBefore + 1);
    expect(s.player.money).toBe(afterSigning - rentAtDue);
    expect(s.living.lease?.rent).toBe(Math.round(rentAtDue * 1.08));
    expect(s.living.lease?.nextRentDay).toBe(firstDueDay + 30);
    expect(daysUntilNextRent(s)).toBe(30);

    const afterDue = s.player.money;
    sleepSettlement(s); // 同一天再次结算不能重复扣租
    expect(s.player.money).toBe(afterDue);
    expect(s.log.filter((entry) => entry.text.includes("交了房租")).length).toBe(rentLogsBefore + 1);
    expect(s.flags["lease_first_month_prepaid"]).toBeUndefined();
  });

  it("城市边缘房源入住郊区并缩短重工业通勤", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.player.money = 5000;
    s.locationId = "housing_agency";
    s.region = "downtown_center";
    s.time.hour = 10;
    expect(getAction("sign_lease_suburb")?.housingId).toBe("suburb_room");
    expect(visibleActionsAtLocation(s, "housing_agency").some((action) => action.id === "sign_lease_suburb")).toBe(true);
    expect(performAction(s, "sign_lease_suburb").ok).toBe(true);
    expect(currentRegion(s)).toBe("suburban_edge");

    s.region = "suburban_edge";
    s.area = "suburb";
    const suburbCommute = travelPlan(s, getLocation("steel_factory"));
    expect(suburbCommute.mode).toBe("suburb_bus");
    expect(suburbCommute.fare).toBe(5);

    s.locationId = "steel_factory";
    s.region = "heavy_industry";
    const commuteHome = travelPlan(s, getLocation("home"));
    expect(commuteHome.mode).toBe("suburb_bus");
    expect(commuteHome.requiresTicket).toBeUndefined();
  });
});

describe("住房系统：入睡结算", () => {
  it("酒店入住后在酒店场景显示睡觉，并按酒店档结算一晚", () => {
    const s = createInitialState();
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "atm" };
    s.locationId = "hotel";
    s.time.month = 6;
    s.time.day = 15;
    s.time.hour = 12;
    s.player.money = 500;

    const checkIn = performAction(s, "stay_hotel");
    expect(checkIn.ok).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("hotel");
    expect(getEffectiveLodging(s).id).toBe("hotel");
    expect(canSleepHere(s)).toBe(true);
    expect(visibleActionsAtLocation(s, "hotel").some((action) => action.id === "sleep_home")).toBe(true);

    const beforeSleep = s.player.money;
    sleep(s, 8);
    expect(s.player.money).toBe(beforeSleep); // 首晚已在入住时预付
    expect(getEffectiveLodging(s).id).toBe("hotel");
  });

  it.each([
    ["hotel_boyu_nightmarket", "stay_hotel_boyu_nightmarket", 108],
  ] as const)("%s（%s）登记不扣款，睡眠结算房费 %i 元", (lodgingId, actionId, nightlyPrice) => {
    const s = createInitialState();
    s.time.month = 9; s.time.day = 1; s.time.hour = 12;
    s.locationId = lodgingId;
    s.player.money = 500;
    const before = s.player.money;
    const checkIn = performAction(s, actionId);
    expect(checkIn.ok).toBe(true);
    expect(s.living.awayNight?.lodgingId).toBe(lodgingId);
    expect(s.player.money).toBe(before);
    expect(canSleepHere(s)).toBe(true);
    expect(visibleActionsAtLocation(s, lodgingId).some((action) => action.id === "sleep_home")).toBe(true);
    sleep(s, 8);
    expect(s.player.money).toBe(before - nightlyPrice);
  });

  it("寺庙挂单后在寺庙场景显示睡觉，并按禅房档免费结算", () => {
    const s = createInitialState();
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "atm" };
    s.locationId = "temple";
    s.time.month = 6;
    s.time.day = 15;
    s.time.hour = 12;
    s.flags["temple_volunteered"] = 1;
    grantTempleStay(s);
    s.player.money = 500;

    const checkIn = performAction(s, "temple_lodging");
    expect(checkIn.ok).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("temple");
    expect(getEffectiveLodging(s).id).toBe("temple");
    expect(canSleepHere(s)).toBe(true);
    expect(visibleActionsAtLocation(s, "temple").some((action) => action.id === "sleep_home")).toBe(true);

    const beforeSleep = s.player.money;
    sleep(s, 8);
    expect(s.player.money).toBe(beforeSleep);
    expect(getEffectiveLodging(s).id).toBe("temple");
  });

  it("借宿只在登记的建筑显示居家行动，街头不开放", () => {
    const s = createInitialState();
    s.locationId = "street";
    s.living.awayNight = { lodgingId: "hostel" };

    expect(canSleepHere(s)).toBe(false);
    expect(visibleActionsAtLocation(s, "street").some((action) => action.id === "sleep_home")).toBe(false);
    s.locationId = "hostel";
    expect(canSleepHere(s)).toBe(true);
    expect(visibleActionsAtLocation(s, "hostel").some((action) => action.id === "sleep_home")).toBe(true);
    s.locationId = "street";

    s.living.awayNight = { lodgingId: "missing_lodging" };
    expect(canSleepHere(s)).toBe(false);
    expect(visibleActionsAtLocation(s, "street").some((action) => action.id === "sleep_home")).toBe(false);
  });

  it("gov 第 7 晚后自动转 nightly", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.govDaysLeft = 1;
    s.time.hour = 22;
    sleep(s, 8);
    expect(s.living.mode).toBe("nightly");
  });

  it("ATM 副作用：健康/干净下降", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "atm" };
    const health0 = s.player.attrs.health;
    const hygiene0 = s.player.attrs.hygiene;
    s.time.hour = 22;
    sleep(s, 8);
    expect(s.player.attrs.health).toBeLessThanOrEqual(health0 - 2);
    expect(s.player.attrs.hygiene).toBeLessThan(hygiene0);
  });

  it("currentResidenceName 显示档位名", () => {
    const s = createInitialState();
    expect(currentResidenceName(s)).toContain("政府免费住宿");
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "hostel" };
    expect(currentResidenceName(s)).toContain("青年旅舍");
  });
});

describe("住房系统：数据完整性", () => {
  it("HOUSING 数据完整", () => {
    expect(HOUSING.nightly.length).toBeGreaterThanOrEqual(3);
    expect(HOUSING.lease.length).toBeGreaterThanOrEqual(1);
    expect(HOUSING.gov).toBeDefined();
  });
});
