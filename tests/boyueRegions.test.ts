import { describe, expect, it } from "vitest";
import locationsData from "../src/game/data/locations.json";
import { CHANGELOG, VERSION } from "../src/version";
import {
  REGIONS,
  childrenOf,
  getRegion,
  locationsOfRegion,
  regionPathOf,
  topRegionOf,
} from "../src/game/core/regions";
import { LOCATIONS, actionsAtLocation, getLocation, isLocationOpen } from "../src/game/core/actions";
import { createInitialState } from "../src/game/core/state";

const boyueFacilities = {
  boyue_university: {
    boyue_food_street: "美食街",
    boyue_internet_cafe: "网吧",
  },
  boyue_mall: {
    boyue_cafe: "咖啡厅",
    boyue_convenience_store: "便利店",
    boyue_fast_food: "快餐店",
    boyue_gym: "健身房",
    boyue_western_restaurant: "西餐厅",
  },
  boyue_olympic: {
    boyue_swimming_pool: "游泳馆",
    boyue_football_field: "足球场",
    boyue_basketball_court: "篮球场",
    boyue_sports_store: "体育用品店",
  },
  boyue_night_market: {
    boyue_nightclub: "夜总会",
    boyue_snack_street: "小吃街",
    boyue_arcade: "电玩城",
    boyue_bathhouse: "洗浴中心",
    hotel_boyu_nightmarket: "泊月快捷酒店",
    boyue_lounge_bar: "清吧",
    boyue_texas_shop: "德州小店",
  },
};

const newFacilityIds = Object.values(boyueFacilities).flatMap((facilities) => Object.keys(facilities));
const nightFacilityIds = ["boyue_nightclub", "boyue_lounge_bar", "boyue_texas_shop"];

describe("1.48 泊月区地图数据契约", () => {
  it("泊月区成为第四个一级区域，五个二级分区完整，机场保留但尚未开放", () => {
    expect(REGIONS.filter((region) => !region.parent).map(({ id }) => id).sort()).toEqual([
      "boyue", "development", "downtown", "suburb",
    ]);
    expect(getRegion("boyue")?.name).toBe("泊月区");
    expect(childrenOf("boyue").map(({ id }) => id).sort()).toEqual([
      ...Object.keys(boyueFacilities), "development_airport",
    ].sort());
    expect(childrenOf("boyue").map(({ name }) => name).sort()).toEqual([
      "大学城", "商场", "奥林匹克中心", "泊月夜市", "机场",
    ].sort());
    for (const region of [getRegion("boyue")!, ...childrenOf("boyue")]) {
      expect(region.locked ?? false).toBe(region.id === "development_airport");
      expect(region.unlockFlag).toBeUndefined();
      expect(region.desc.length).toBeGreaterThan(15);
    }
  });

  it("学院与人才公寓迁入校园后，外围设施按 2、5、4、7 归属四个分区", () => {
    expect(newFacilityIds).toHaveLength(18);
    expect(getLocation("boyue_central_fountain")).toBeUndefined();
    expect(Object.values(boyueFacilities).map((facilities) => Object.keys(facilities).length)).toEqual([2, 5, 4, 7]);
    const boyueRegionIds = Object.keys(boyueFacilities);
    expect(LOCATIONS.filter(({ regions }) => regions?.some((regionId) => boyueRegionIds.includes(regionId)))
      .map(({ id }) => id).sort()).toEqual(newFacilityIds.slice().sort());
    for (const [regionId, facilities] of Object.entries(boyueFacilities)) {
      const regionLocationIds = regionId === "boyue_university"
        ? [...Object.keys(facilities), "boyue_convenience_store"]
        : Object.keys(facilities);
      expect(locationsOfRegion(regionId).map(({ id }) => id).sort()).toEqual(regionLocationIds.sort());
      expect(regionPathOf(regionId)).toEqual(["boyue", regionId]);
      expect(topRegionOf(regionId)).toBe("boyue");
      for (const [locationId, name] of Object.entries(facilities)) {
        const location = getLocation(locationId);
        expect(location?.name).toBe(name);
        expect(location?.regions).toEqual(locationId === "boyue_convenience_store"
          ? ["boyue_mall", "boyue_university"]
          : [regionId]);
        expect(location?.desc.length).toBeGreaterThan(15);
        expect(location?.locked ?? false).toBe(false);
        expect(location?.unlockFlag).toBeUndefined();
      }
    }
    expect(locationsOfRegion("boyue_university").map(({ id }) => id).sort()).toEqual([
      "boyue_convenience_store", "boyue_food_street", "boyue_internet_cafe",
    ]);
  });

  it("机场保留原区域和设施 id，迁至泊月区且只有机场一个设施", () => {
    const airportRegion = getRegion("development_airport");
    const airport = getLocation("airport");
    expect(airportRegion?.parent).toBe("boyue");
    expect(regionPathOf("development_airport")).toEqual(["boyue", "development_airport"]);
    expect(topRegionOf("development_airport")).toBe("boyue");
    expect(childrenOf("development").some(({ id }) => id === "development_airport")).toBe(false);
    expect(locationsOfRegion("development_airport").map(({ id }) => id)).toEqual(["airport"]);
    expect(airport?.regions).toEqual(["development_airport"]);
    expect(airportRegion?.desc).toContain("小型民用通航机场");
    expect(airport?.desc).toContain("小型民用通航机场");
    expect(airportRegion?.locked).toBe(true);
    expect(airport?.locked).toBe(true);
    expect(airportRegion?.desc).toContain("尚未开放");
    expect(airport?.desc).toContain("尚未开放");
    expect(actionsAtLocation("airport")).toEqual([]);
  });

  it("夜总会、清吧与德州小店均按 18 点到次日 6 点开放", () => {
    const sunday = createInitialState();
    sunday.time = { year: 2026, month: 8, day: 2, hour: 18, minute: 0 };
    for (const locationId of nightFacilityIds) {
      const location = getLocation(locationId);
      expect(location?.openHours).toEqual({ start: 18, end: 6 });
      for (const hour of [0, 5, 18, 23]) expect(isLocationOpen(location, hour, sunday)).toBe(true);
      for (const hour of [6, 12, 17]) expect(isLocationOpen(location, hour, sunday)).toBe(false);
    }
  });

  it("德州小店独占周末夜间限制，其它夜市场所按要求全天开放", () => {
    expect(locationsData.filter((location) => "weekendNightOnly" in location && location.weekendNightOnly).map(({ id }) => id)).toEqual(["boyue_texas_shop"]);
    const texasShop = locationsData.find(({ id }) => id === "boyue_texas_shop");
    expect(texasShop).toHaveProperty("weekendNightOnly", true);
    for (const locationId of Object.keys(boyueFacilities.boyue_night_market).filter((id) => !nightFacilityIds.includes(id))) {
      expect(getLocation(locationId)?.openHours).toBeNull();
      for (const hour of [0, 5, 12, 18, 23]) expect(isLocationOpen(getLocation(locationId), hour)).toBe(true);
    }
  });

  it("新设施按批准的营业时间开放，所有消费行动精确绑定实际分店", () => {
    const hours = {
      boyue_engineering_college: { start: 7, end: 21 },
      boyue_cafe: { start: 8, end: 22 }, boyue_gym: { start: 8, end: 22 },
      boyue_western_restaurant: { start: 11, end: 22 },
      boyue_swimming_pool: { start: 8, end: 22 }, boyue_football_field: { start: 8, end: 22 },
      boyue_basketball_court: { start: 8, end: 22 }, boyue_sports_store: { start: 8, end: 22 },
    };
    for (const [locationId, openHours] of Object.entries(hours)) expect(getLocation(locationId)?.openHours).toEqual(openHours);
    for (const locationId of newFacilityIds) {
      for (const action of actionsAtLocation(locationId)) expect(action.locationId).toBe(locationId);
    }
    for (const locationId of ["boyue_food_street", "boyue_talent_apartment", "boyue_internet_cafe", "boyue_convenience_store", "boyue_fast_food"]) {
      expect(getLocation(locationId)?.openHours).toBeNull();
    }
  });

  it("全部区域和设施 id 唯一，父节点与地点归属均指向有效区域", () => {
    expect(new Set(REGIONS.map(({ id }) => id)).size).toBe(REGIONS.length);
    expect(new Set(LOCATIONS.map(({ id }) => id)).size).toBe(LOCATIONS.length);
    for (const region of REGIONS) {
      if (region.parent) expect(getRegion(region.parent)).toBeDefined();
    }
    for (const location of LOCATIONS) {
      for (const regionId of location.regions ?? []) expect(getRegion(regionId)).toBeDefined();
    }
  });

  it("当前更新公告沿用1.48内容并同步正式区名与新场景", () => {
    expect(CHANGELOG[0].version).toBe(VERSION);
    // 地图公告条目可能不是最新一条（后续版本可能只含修复说明），
    // 因此在更新日志中按 1.48 系列定位承载地图内容的条目。
    const mapEntry = CHANGELOG.find((entry) => entry.version.startsWith("1.48") && entry.notes.length === 10);
    expect(mapEntry).toBeDefined();
    const notes = mapEntry!.notes.join("\n");
    expect(mapEntry!.notes).toHaveLength(10);
    for (const name of ["树堰区", "紫羊区", "伯月新区", "泊月区", "师范学院", "工程学院", "小型民用通航机场", "德州小店"]) {
      expect(notes).toContain(name);
    }
  });
});
