import { describe, expect, it } from "vitest";
import { deriveVersionMetadata } from "../scripts/version-metadata.js";
import {
  REGIONS,
  childrenOf,
  getRegion,
  locationsOfRegion,
  regionPathOf,
  topRegionOf,
} from "../src/game/core/regions";
import { LOCATIONS, actionsAtLocation, getLocation, isLocationOpen } from "../src/game/core/actions";

const developmentFacilities = {
  development_culture: {
    dev_museum: "博物馆",
    dev_science_museum: "科技馆",
    dev_art_gallery: "美术馆",
    development_bus_station: "伯月新区巴士站",
  },
  development_university: {
    dev_food_street: "美食街",
  },
  development_reserve: {
    moon_mountain: "月亮山·东月道观",
    treasure_lake: "珍宝湖水库",
    camping_base: "野营基地",
  },
};

describe("1.48 伯月新区地图数据契约", () => {
  it("四个一级区域名称明确，伯月新区三个分区开放且名称完整", () => {
    expect(REGIONS.filter((region) => !region.parent).map((region) => region.id).sort()).toEqual([
      "boyue", "development", "downtown", "suburb",
    ]);
    expect(getRegion("downtown")?.name).toBe("树堰区");
    expect(getRegion("suburb")?.name).toBe("紫羊区");
    expect(getRegion("development")?.name).toBe("伯月新区");
    expect(getRegion("boyue")?.name).toBe("泊月区");
    expect(childrenOf("development").map(({ id }) => id).sort()).toEqual(Object.keys(developmentFacilities).sort());
    expect(childrenOf("development").map(({ name }) => name).sort()).toEqual([
      "大学城", "市三馆", "自然保护区",
    ].sort());
    for (const region of [getRegion("development")!, ...childrenOf("development")]) {
      expect(region.locked ?? false).toBe(false);
      expect(region.unlockFlag).toBeUndefined();
    }
  });

  it("伯月新区十一处设施各自只归属指定分区，师范学院保留原设施 id", () => {
    for (const [regionId, facilities] of Object.entries(developmentFacilities)) {
      expect(locationsOfRegion(regionId).map(({ id }) => id).sort()).toEqual(Object.keys(facilities).sort());
      expect(regionPathOf(regionId)).toEqual(["development", regionId]);
      expect(topRegionOf(regionId)).toBe("development");
      for (const [locationId, name] of Object.entries(facilities)) {
        const location = getLocation(locationId);
        expect(location?.name).toBe(name);
        expect(location?.regions).toEqual([regionId]);
        expect(location?.desc.length).toBeGreaterThan(15);
      }
    }
  });

  it("区域和设施 id 唯一，新增地图没有孤立父节点或地点归属", () => {
    expect(new Set(REGIONS.map(({ id }) => id)).size).toBe(REGIONS.length);
    expect(new Set(LOCATIONS.map(({ id }) => id)).size).toBe(LOCATIONS.length);
    for (const region of REGIONS) {
      if (region.parent) expect(getRegion(region.parent)).toBeDefined();
    }
    for (const location of LOCATIONS) {
      for (const regionId of location.regions ?? []) expect(getRegion(regionId)).toBeDefined();
    }
  });

  it("三馆与食堂遵循营业时间，室外和公共住房入口全天开放", () => {
    const daytimeHours = {
      dev_museum: { start: 8, end: 18 }, dev_science_museum: { start: 8, end: 18 },
      dev_art_gallery: { start: 8, end: 18 }, dev_university: { start: 7, end: 21 },
    };
    for (const facilities of Object.values(developmentFacilities)) {
      for (const locationId of Object.keys(facilities)) {
        const location = getLocation(locationId);
        expect(location?.locked ?? false).toBe(false);
        expect(location?.unlockFlag).toBeUndefined();
        const expectedHours = daytimeHours[locationId as keyof typeof daytimeHours];
        expect(location?.openHours).toEqual(expectedHours ?? null);
        for (const action of actionsAtLocation(locationId)) expect(action.locationId).toBe(locationId);
      }
    }
  });

  it("伯月新区巴士的两端车站全天可以进入", () => {
    for (const locationId of ["bus_station", "development_bus_station"]) {
      for (const hour of [0, 5, 12, 23]) expect(isLocationOpen(getLocation(locationId), hour)).toBe(true);
    }
    expect(getLocation("development_bus_station")?.desc).toContain("每小时整点");
    expect(getLocation("suburb_bus_station")?.name).toBe("紫羊区巴士站");
    expect(getLocation("suburb_train_station")?.name).toBe("紫羊区火车站");
  });
});

describe("版本安装顺序", () => {
  it("版本同步保留 1.475 到 1.48 的递增安装代码，不会缩成 148", () => {
    const [oldMetadata, metadata, previousPatchMetadata, patchMetadata] = ["1.475", "1.48", "1.48.1", "1.48.2"].map(deriveVersionMetadata);
    expect(oldMetadata.versionCode).toBe(1_475_000);
    expect(metadata).toEqual({ buildVersion: "1.48.0", versionCode: 1_480_000 });
    expect(metadata.versionCode).toBeGreaterThan(oldMetadata.versionCode);
    expect(previousPatchMetadata).toEqual({ buildVersion: "1.48.1", versionCode: 1_480_001 });
    expect(patchMetadata).toEqual({ buildVersion: "1.48.2", versionCode: 1_480_002 });
  });
});
