import { describe, it, expect } from "vitest";
import {
  REGIONS,
  getRegion,
  childrenOf,
  locationsOfRegion,
  regionPathOf,
  inferRegionOfLocation,
  enterRegion,
  exitRegion,
  goToMap,
  crumbTo,
} from "../src/game/core/regions";
import { createInitialState } from "../src/game/core/state";
import { LOCATIONS } from "../src/game/core/actions";

describe("区域数据", () => {
  it("7 个区域齐全", () => {
    const ids = REGIONS.map((r) => r.id);
    expect(ids).toContain("downtown");
    expect(ids).toContain("suburb");
    expect(ids).toContain("downtown_center");
    expect(ids).toContain("downtown_mall");
    expect(ids).toContain("downtown_industrial");
    expect(ids).toContain("downtown_residential");
    expect(ids).toContain("downtown_station");
  });

  it("downtown 的 5 个子区域", () => {
    const kids = childrenOf("downtown").map((r) => r.id);
    expect(kids.sort()).toEqual([
      "downtown_center",
      "downtown_industrial",
      "downtown_mall",
      "downtown_residential",
      "downtown_station",
    ]);
  });

  it("v0.981：suburb 已解锁，downtown_station / heavy_industry 仍锁定", () => {
    expect(getRegion("suburb")?.locked ?? false).toBe(false);
    expect(getRegion("downtown_station")?.locked).toBe(true);
    expect(getRegion("heavy_industry")?.locked).toBe(true);
  });

  it("v0.981：suburb 的子区域（郊区边缘 / 乡村 / 重工业区）", () => {
    const kids = childrenOf("suburb").map((r) => r.id);
    expect(kids.sort()).toEqual(["heavy_industry", "rural", "suburban_edge"]);
  });

  it("regionPathOf 追溯父链", () => {
    expect(regionPathOf("downtown_residential")).toEqual([
      "downtown",
      "downtown_residential",
    ]);
    expect(regionPathOf("downtown")).toEqual(["downtown"]);
  });

  it("每个非 map 地点都归属至少一个区域", () => {
    for (const loc of LOCATIONS) {
      if (loc.id === "map") continue;
      expect(loc.regions?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("区域地点查询", () => {
  it("住宅区包含 home/convenience_store/cafe/market/park 等", () => {
    const ids = locationsOfRegion("downtown_residential").map((l) => l.id);
    expect(ids).toContain("home");
    expect(ids).toContain("convenience_store");
    expect(ids).toContain("cafe");
    expect(ids).toContain("market");
  });

  it("便利店归属市中心/商场/住宅区 3 区", () => {
    const ids = locationsOfRegion("downtown_center")
      .concat(locationsOfRegion("downtown_mall"))
      .concat(locationsOfRegion("downtown_residential"))
      .map((l) => l.id);
    expect(ids.filter((i) => i === "convenience_store").length).toBe(3);
  });

  it("inferRegionOfLocation: home → downtown_residential", () => {
    expect(inferRegionOfLocation("home")).toBe("downtown_residential");
  });

  it("inferRegionOfLocation: map → undefined", () => {
    expect(inferRegionOfLocation("map")).toBeUndefined();
  });
});

describe("导航栈", () => {
  it("enterRegion 锁定区域拒绝（重工业区），郊区 v0.981 已可进入", () => {
    const s = createInitialState();
    const blocked = enterRegion(s, "heavy_industry");
    expect(blocked.ok).toBe(false);
    expect(s.locationId).toBe("home"); // 未改变

    const ok = enterRegion(s, "suburb");
    expect(ok.ok).toBe(true);
    expect(s.region).toBe("suburb");
    expect(s.navStack).toEqual(["map", "suburb"]);
  });

  it("enterRegion 火车站区锁定", () => {
    const s = createInitialState();
    const r = enterRegion(s, "downtown_station");
    expect(r.ok).toBe(false);
  });

  it("enterRegion 压栈 + locationId=map + region 设置", () => {
    const s = createInitialState();
    s.locationId = "home";
    s.region = "downtown_residential";
    s.navStack = [];
    const r = enterRegion(s, "downtown");
    expect(r.ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("downtown");
    expect(s.navStack).toEqual(["map", "downtown"]);
  });

  it("enterRegion 二级区域", () => {
    const s = createInitialState();
    const r = enterRegion(s, "downtown_center");
    expect(r.ok).toBe(true);
    expect(s.navStack).toEqual(["map", "downtown", "downtown_center"]);
  });

  it("exitRegion 出栈", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center"); // 栈：["map","downtown","downtown_center"]
    exitRegion(s); // 出栈到 downtown
    expect(s.navStack).toEqual(["map", "downtown"]);
    expect(s.region).toBe("downtown");
  });

  it("exitRegion 到底（栈长 1）保持主地图", () => {
    const s = createInitialState();
    enterRegion(s, "downtown"); // 栈：["map","downtown"]
    exitRegion(s); // 出栈到 map
    expect(s.navStack).toEqual(["map"]);
    expect(s.region).toBeUndefined();
  });

  it("goToMap 复位", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center");
    goToMap(s);
    expect(s.navStack).toEqual(["map"]);
    expect(s.region).toBeUndefined();
    expect(s.locationId).toBe("map");
  });

  it("crumbTo 回退到第 i 层", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center"); // 栈长 3
    crumbTo(s, 1); // 回到 downtown
    expect(s.navStack).toEqual(["map", "downtown"]);
    expect(s.region).toBe("downtown");
  });

  it("crumbTo(0) 等价 goToMap", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center");
    crumbTo(s, 0);
    expect(s.region).toBeUndefined();
    expect(s.locationId).toBe("map");
  });
});