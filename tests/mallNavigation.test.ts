import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { exitLocation, getLocation, isLocationOpen, isLocationVisible, isNavigationTargetVisible, moveTo, regionTravelPlan, travelHours } from "../src/game/core/actions";
import { childrenOf, crumbTo, exitRegion, locationsOfRegion, regionPathOf } from "../src/game/core/regions";
import { migrateSave } from "../src/game/core/migrate";
import { mapAnchor } from "../src/lib/mapAtlas";

const inside = ["clothing_store", "luxury_store", "furniture_store", "western_restaurant"];
function atMall() {
  const s = createInitialState();
  s.time.hour = 12;
  s.time.minute = 0;
  s.locationId = "map";
  s.region = s.area = "downtown_mall";
  s.navStack = ["map", "downtown", "downtown_mall"];
  return s;
}

describe("nested mall navigation", () => {
  it("separates street outlets from indoor shops and anchors every entrance", () => {
    expect(locationsOfRegion("downtown_mall").map(l => l.id).sort()).toEqual([
      "budget_clothing_store", "convenience_store", "electronics_store", "fast_food", "gym",
    ]);
    expect(locationsOfRegion("mall_interior").map(l => l.id).sort()).toEqual([...inside].sort());
    expect(childrenOf("downtown_mall").map(r => r.id)).toEqual(["mall_interior"]);
    for (const region of ["downtown_mall", "mall_interior"]) {
      for (const l of locationsOfRegion(region)) expect(mapAnchor(region, l.id)).toBeDefined();
    }
    expect(mapAnchor("downtown_mall", "mall_interior")).toEqual({ x: 56, y: 42 });
    expect(mapAnchor("mall_interior", "downtown_mall")).toEqual({ x: 50, y: 91 });
  });

  it("routes the indoor mall portal as a region instead of hiding it as a facility", () => {
    const s = atMall();
    expect(isLocationVisible(s, "mall_interior")).toBe(false);
    expect(isNavigationTargetVisible(s, "mall_interior")).toBe(true);
    expect(moveTo(s, "mall_interior").ok).toBe(true);
    expect(s.region).toBe("mall_interior");
  });

  it.each(inside)("enters %s and returns through interior, exterior, and city without commuting", id => {
    const s = atMall();
    const money = s.player.money;
    expect(moveTo(s, "mall_interior").ok).toBe(true);
    expect(regionTravelPlan(s, "downtown_mall").hours).toBe(0);
    expect(travelHours(s, getLocation(id))).toBe(0);
    expect(moveTo(s, id).ok).toBe(true);
    expect(s.region).toBe("mall_interior");
    expect(s.area).toBe("downtown_mall");
    expect(s.navStack).toEqual(["map", ...regionPathOf("mall_interior")]);
    expect(exitLocation(s).ok).toBe(true);
    expect(s.region).toBe("mall_interior");
    exitRegion(s);
    expect(s.region).toBe("downtown_mall");
    expect(s.player.money).toBe(money);
    expect(s.time).toMatchObject({ hour: 12, minute: 0 });
    crumbTo(s, 1);
    expect(s.region).toBe("downtown");
  });

  it("keeps shared restaurants local and charges travel from another district", () => {
    const s = atMall();
    expect(moveTo(s, "western_restaurant").ok).toBe(true);
    expect(s.region).toBe("mall_interior");
    expect(moveTo(s, "downtown_mall").ok).toBe(true);
    expect(moveTo(s, "budget_clothing_store").ok).toBe(true);
    expect(exitLocation(s).ok).toBe(true);
    expect(s.region).toBe("downtown_mall");
    s.region = s.area = "downtown_residential";
    expect(regionTravelPlan(s, "mall_interior").hours).toBeGreaterThan(0);
    s.region = "downtown_center";
    expect(moveTo(s, "western_restaurant").ok).toBe(true);
    expect(s.region).toBe("downtown_center");
  });

  it.each(inside)("migrates old %s saves without changing the shop or save version", id => {
    const old = atMall();
    old.locationId = id;
    const version = old.version;
    const loaded = migrateSave(JSON.parse(JSON.stringify(old)));
    expect(loaded.version).toBe(version);
    expect(loaded.locationId).toBe(id);
    expect(loaded.region).toBe("mall_interior");
    expect(loaded.area).toBe("downtown_mall");
    expect(loaded.navStack).toEqual(["map", "downtown", "downtown_mall", "mall_interior"]);
    expect(exitLocation(loaded).ok).toBe(true);
    expect(loaded.region).toBe("mall_interior");
    expect(migrateSave(JSON.parse(JSON.stringify(loaded))).navStack).toEqual(loaded.navStack);
  });

  it("preserves individual hours and permits exit after shops close", () => {
    const s = atMall();
    s.time.hour = 9;
    expect(moveTo(s, "mall_interior").ok).toBe(true);
    expect(isLocationOpen(getLocation("furniture_store")!, 9)).toBe(true);
    expect(isLocationOpen(getLocation("clothing_store")!, 9)).toBe(false);
    expect(moveTo(s, "furniture_store").ok).toBe(true);
    s.time.hour = 22;
    expect(exitLocation(s).ok).toBe(true);
    for (const id of inside) expect(isLocationOpen(getLocation(id)!, 22)).toBe(false);
    expect(moveTo(s, "downtown_mall").ok).toBe(true);
    expect(moveTo(s, "fast_food").ok).toBe(true);
    s.region = s.area = "downtown_residential";
    for (const id of inside) expect(moveTo(s, id).ok).toBe(false);
  });
});
