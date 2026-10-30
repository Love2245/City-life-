import { describe, it, expect } from "vitest";
import {
  REGIONS,
  getRegion,
  childrenOf,
  locationsOfRegion,
  regionPathOf,
  inferRegionOfLocation,
  crossesTopLevelRegion,
  enterRegion,
  exitRegion,
  goToMap,
  crumbTo,
} from "../src/game/core/regions";
import { createInitialState } from "../src/game/core/state";
import { LOCATIONS } from "../src/game/core/actions";

describe("区域数据", () => {
  it("原有市区与郊区区域齐全", () => {
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

  it("1.4：老城区直接开放，重工业区仍锁定", () => {
    expect(getRegion("suburb")?.locked ?? false).toBe(false);
    expect(getRegion("downtown_station")?.locked ?? false).toBe(false);
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

  it("场景过场只在穿越一级区域边界时触发", () => {
    expect(crossesTopLevelRegion("downtown_residential", "downtown_center")).toBe(false);
    expect(crossesTopLevelRegion("downtown", "downtown_mall")).toBe(false);
    expect(crossesTopLevelRegion("downtown", "suburb")).toBe(true);
    expect(crossesTopLevelRegion(undefined, "suburb")).toBe(false);
  });

  it("每个非 map 地点都归属区域（旧宠物 id 作为兼容入口除外）", () => {
    for (const loc of LOCATIONS) {
      if (loc.id === "map") continue;
      if (loc.id === "pet_store" || loc.id === "pet_hospital") continue;
      expect(loc.regions?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it("1.4 老城区五个地点与郊区边缘两个车站已注册", () => {
    expect(locationsOfRegion("downtown_station").map((l) => l.id)).toEqual(
      expect.arrayContaining(["bus_station", "high_speed_rail", "flower_market", "snack_street", "school"]),
    );
    expect(locationsOfRegion("suburban_edge").map((l) => l.id)).toEqual(
      expect.arrayContaining(["suburb_bus_station", "suburb_train_station"]),
    );
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

  it("enterRegion 可直接进入老城区", () => {
    const s = createInitialState();
    const r = enterRegion(s, "downtown_station");
    expect(r.ok).toBe(true);
    expect(s.region).toBe("downtown_station");
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

  it("goToMap 回到当前所在城市一级（v1.43：修复郊区被误丢回市区的死档）", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center"); // 玩家在市区 L2
    goToMap(s);
    // 回到市区一级，而非清空到 undefined（旧行为会让郊区的回主地图误判为跨城）
    expect(s.navStack).toEqual(["map", "downtown"]);
    expect(s.region).toBe("downtown");
    expect(s.locationId).toBe("map");
  });

  it("crumbTo 回退到第 i 层", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center"); // 栈长 3
    crumbTo(s, 1); // 回到 downtown
    expect(s.navStack).toEqual(["map", "downtown"]);
    expect(s.region).toBe("downtown");
  });

  it("crumbTo(0) 等价 goToMap（回到当前城市一级，v1.43）", () => {
    const s = createInitialState();
    enterRegion(s, "downtown_center");
    crumbTo(s, 0);
    expect(s.region).toBe("downtown");
    expect(s.locationId).toBe("map");
  });
});
