import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import {
  getEffectiveLodging,
  selectLodging,
  signLease,
  hasFacility,
  currentResidenceName,
  HOUSING,
} from "../src/game/core/housing";
import { sleep } from "../src/game/core/time";

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
  it("selectLodging 仅 nightly 模式生效", () => {
    const s = createInitialState();
    expect(selectLodging(s, "hostel")).toBe(false);
    s.living.mode = "nightly";
    expect(selectLodging(s, "hostel")).toBe(true);
    expect(s.living.nightly?.lodgingId).toBe("hostel");
    expect(selectLodging(s, "nonexistent")).toBe(false);
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
});

describe("住房系统：入睡结算", () => {
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