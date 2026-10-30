import { grantTempleStay, grantWorkerDormStay } from "../src/game/core/residence";
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { HOUSING, selectLodging, currentRegion, homeResidenceName, currentResidenceName, mapResidenceName, canSleepHere, signLease } from "../src/game/core/housing";
import { RESIDENCE_TIERS, residenceLocationId, permanentResidence } from "../src/game/core/residence";
import { getLocation, getAction, visibleActionsAtLocation, canPerform, moveTo, autoExitIfClosed } from "../src/game/core/actions";
import { sleep } from "../src/game/core/time";
import { migrateSave } from "../src/game/core/migrate";
import { mapAnchor } from "../src/lib/mapAtlas";

describe("住宿与居家建筑统一", () => {
  it("地图住宿标牌只显示建筑名，不附加期限、费用或借宿说明", () => {
    const temple = createInitialState();
    temple.living.mode = "nightly";
    temple.living.nightly = { lodgingId: "temple" };
    grantTempleStay(temple);
    expect(mapResidenceName(temple)).toBe("寺庙禅房");

    const hostel = createInitialState();
    hostel.living.mode = "nightly";
    hostel.living.nightly = { lodgingId: "hostel" };
    expect(mapResidenceName(hostel)).toBe(HOUSING.nightly.find((tier) => tier.id === "hostel")!.name);
  });

  for (const tier of RESIDENCE_TIERS) {
    it(`${tier.name} 的真实地图入口提供完整居家行动`, () => {
      const s = createInitialState(); s.player.money = 999999;
      s.time.month = 9; s.time.day = 1; s.flags.item_student_pass=true;
      if (tier.id === "worker_dorm") {
        s.flags.route_heavy_industry = true;
        s.flags.industrial_dorm_qualified = true;
      }
      if (tier.id === "gov") s.living.mode = "gov";
      else if (HOUSING.lease.some(t => t.id === tier.id)) {
        s.living.mode = "lease"; s.living.lease = { housingId: tier.id, rent: tier.price, rentGrowthCount: 0 };
      } else if (HOUSING.buy.some(t => t.id === tier.id)) {
        s.living.mode = "own"; s.living.ownedId = tier.id;
      } else { s.living.mode = "nightly"; s.living.nightly = { lodgingId: tier.id }; }
      if (tier.id === "temple") grantTempleStay(s);
      if (tier.id === "worker_dorm") grantWorkerDormStay(s);
      const id = residenceLocationId(s); s.locationId = id; s.region = tier.region;
      expect(getLocation(id)!.regions).toContain(tier.region);
      expect(mapAnchor(tier.region!, id)).toBeDefined();
      const ids = visibleActionsAtLocation(s, id).map(a => a.id);
      expect(ids).toEqual(expect.arrayContaining(["sleep_home", "wash_basic", "use_laptop_home"]));
      expect(canSleepHere(s)).toBe(true);
      expect(canPerform(s, getAction("wash_basic")!).ok).toBe(true);
      s.time.hour = 23;
      expect(canPerform(s, getAction("sleep_home")!).ok).toBe(true);
      autoExitIfClosed(s); expect(s.locationId).toBe(id);
      s.locationId = "map";
      expect(moveTo(s, "home").ok).toBe(true); expect(s.locationId).toBe(id);
    });
  }
  it("寺庙借宿睡醒仍是家，返回公寓才退房并保留租约", () => {
    const s = createInitialState(); s.player.money = 99999;
    signLease(s, "rental_apartment");
    s.locationId = "temple"; s.region = "suburban_edge";
    s.flags.temple_volunteered = 1; s.flags.item_car = true;
    s.time.month = 6; s.time.day = 15; s.living.lease!.nextRentDay = 999999;
    const lease = { ...s.living.lease! };
    grantTempleStay(s);
    expect(selectLodging(s, "temple")).toBe(true);
    expect(currentRegion(s)).toBe("suburban_edge");
    expect(homeResidenceName(s)).toBe(currentResidenceName(s));
    expect(permanentResidence(s).id).toBe("rental_apartment");
    const before = s.player.money; sleep(s, 8);
    expect(s.player.money).toBe(before);
    expect(s.living.awayNight?.lodgingId).toBe("temple"); expect(canSleepHere(s)).toBe(true);
    expect(moveTo(s, "rental_apartment").ok).toBe(true);
    expect(s.locationId).toBe("map"); // 跨城先抵达车站区域。
    expect(s.living.awayNight?.lodgingId).toBe("temple");
    expect(moveTo(s, "rental_apartment").ok).toBe(true);
    expect(s.living.awayNight).toBeNull(); expect(currentRegion(s)).toBe("downtown_center");
    expect(s.locationId).toBe("rental_apartment"); expect(s.living.lease).toEqual(lease);
  });
  it("酒店借宿每天只扣一笔房费，不消耗政府床位", () => {
    const s = createInitialState(); s.player.money = 1000; s.time.month = 6; s.time.day = 15;
    s.locationId = "hotel"; const days = s.living.govDaysLeft;
    selectLodging(s, "hotel"); const before = s.player.money; sleep(s, 8);
    expect(s.player.money).toBe(before); expect(s.living.govDaysLeft).toBe(days);
    expect(s.living.awayNight?.lodgingId).toBe("hotel"); expect(canSleepHere(s)).toBe(true);
  });
  it("选择远处房源不会瞬移，未抵达不能使用居家功能", () => {
    const s = createInitialState(); s.player.money = 500; selectLodging(s, "hostel");
    expect(s.locationId).toBe("old_apartment"); expect(canSleepHere(s)).toBe(false);
    expect(canPerform(s, getAction("wash_basic")!).ok).toBe(false);
  });
  it("旧 home 存档迁移到当前入住建筑，并保持幂等", () => {
    const s = createInitialState(); s.living.awayNight = { lodgingId: "hostel" };
    const migrated = migrateSave(s);
    expect(migrated.locationId).toBe("hostel"); expect(migrated.region).toBe("downtown_station");
    expect(migrated.navStack).toEqual(["map", "downtown", "downtown_station"]);
    expect(migrateSave(migrated)).toEqual(migrated);
  });
});
