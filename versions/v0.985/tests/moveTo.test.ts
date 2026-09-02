import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { moveTo, exitLocation, travelHours, travelLabel, getLocation } from "../src/game/core/actions";
import { locationsOfRegion } from "../src/game/core/regions";

describe("moveTo 区域入口", () => {
  it("moveTo(downtown) 进入市区", () => {
    const s = createInitialState();
    s.time.hour = 12;
    const r = moveTo(s, "downtown");
    expect(r.ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("downtown");
    expect(s.navStack).toEqual(["map", "downtown"]);
  });

  it("moveTo(suburb) 进入郊区（v0.98 已开放）", () => {
    const s = createInitialState();
    s.time.hour = 12;
    const r = moveTo(s, "suburb");
    expect(r.ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("suburb");
    expect(s.navStack).toEqual(["map", "suburb"]);
  });

  it("郊区二级导航：进入城市边缘显示其地点（游乐场/环湖公园/教堂/寺庙）", () => {
    const s = createInitialState();
    s.time.hour = 12;
    expect(moveTo(s, "suburb").ok).toBe(true);
    expect(moveTo(s, "suburban_edge").ok).toBe(true);
    expect(s.region).toBe("suburban_edge");
    expect(s.navStack).toEqual(["map", "suburb", "suburban_edge"]);
    expect(locationsOfRegion("suburban_edge").length).toBe(4);
  });

  it("农村地带含农场/牧场/果园三地点", () => {
    const s = createInitialState();
    s.time.hour = 12;
    expect(moveTo(s, "suburb").ok).toBe(true);
    expect(moveTo(s, "rural").ok).toBe(true);
    expect(locationsOfRegion("rural").length).toBe(3);
  });

  it("moveTo(downtown_station) 火车站区锁定", () => {
    const s = createInitialState();
    const r = moveTo(s, "downtown_station");
    expect(r.ok).toBe(false);
  });
});

describe("moveTo 地点入口", () => {
  it("锁定地点拒绝", () => {
    const s = createInitialState();
    s.time.hour = 12;
    const r = moveTo(s, "high_speed_rail");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("暂未开放");
  });

  it("打烊地点拒绝", () => {
    const s = createInitialState();
    s.time.hour = 22; // library 9-18
    const r = moveTo(s, "library");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("打烊");
  });

  it("moveTo 进入地点：region=来源区、navStack 清空", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "downtown_center"); // 进入区域视图
    const r = moveTo(s, "library");
    expect(r.ok).toBe(true);
    expect(s.locationId).toBe("library");
    expect(s.region).toBe("downtown_center");
    expect(s.navStack).toEqual([]);
  });

  it("moveTo(map) 复位主地图", () => {
    const s = createInitialState();
    moveTo(s, "downtown_center");
    moveTo(s, "map");
    expect(s.locationId).toBe("map");
    expect(s.region).toBeUndefined();
    expect(s.navStack).toEqual(["map"]);
  });
});

describe("exitLocation（出门按钮）", () => {
  it("地点态回到 region", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "library"); // 进地点，region="downtown_center"
    const r = exitLocation(s);
    expect(r.ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("downtown_center");
  });

  it("无 region 地点态回主地图", () => {
    const s = createInitialState();
    // 手动模拟无 region 地点（实际不会发生但兜底）
    s.locationId = "home";
    s.region = undefined;
    s.navStack = [];
    const r = exitLocation(s);
    expect(r.ok).toBe(true);
    expect(s.region).toBeUndefined();
  });

  it("在地图态拒绝", () => {
    const s = createInitialState();
    s.locationId = "map";
    const r = exitLocation(s);
    expect(r.ok).toBe(false);
  });
});

describe("moveTo 跨区同 id", () => {
  it("从市中心进入便利店，region=市中心", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "downtown_center");
    moveTo(s, "convenience_store");
    expect(s.locationId).toBe("convenience_store");
    expect(s.region).toBe("downtown_center");
  });

  it("从商场进入便利店，region=商场", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "downtown_mall");
    moveTo(s, "convenience_store");
    expect(s.region).toBe("downtown_mall");
  });

  it("从商场进便利店后出门，回到商场区域视图", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "downtown_mall");
    moveTo(s, "convenience_store");
    exitLocation(s);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("downtown_mall");
  });
});
describe("通行时间（v0.93）", () => {
  it("v0.975：同区 0h / 跨区 0.5h（地铁）/ 主地图态按物理 area 回退", () => {
    const s = createInitialState();
    const cafe = getLocation("cafe")!; // downtown_center + downtown_residential
    s.region = "downtown_residential";
    expect(travelHours(s, cafe)).toBe(0); // 同区（residential）→ 0
    s.region = "downtown_industrial";
    expect(travelHours(s, cafe)).toBe(0.5); // 跨区 → 0.5h（地铁）
    // 主地图态：region 清空，但物理所在 area 仍记录 → 同区 0
    s.region = undefined;
    expect(travelHours(s, cafe)).toBe(0); // area 回退 residential，cafe 同区 → 0
    // 物理 area 也不在地点归属区 → 跨区 0.5h
    s.area = "downtown_industrial";
    expect(travelHours(s, cafe)).toBe(0.5);
  });

  it("travelLabel 文案", () => {
    expect(travelLabel(0)).toBe("即刻到达");
    expect(travelLabel(0.5)).toBe("约 30 分钟");
    expect(travelLabel(1)).toBe("约 1 小时");
  });

  it("v0.93：开局在住宅区，同区去菜市场即刻到达（0 分钟）", () => {
    const s = createInitialState();
    s.time.hour = 12;
    expect(s.region).toBe("downtown_residential");
    moveTo(s, "market");
    expect(s.time.hour).toBe(12);
    expect(s.time.minute).toBe(0);
  });

  it("v0.93：开局在住宅区，跨区去电子厂耗 0.5 小时", () => {
    const s = createInitialState();
    s.time.hour = 12;
    moveTo(s, "electronics_factory");
    expect(s.time.hour).toBe(12);
    expect(s.time.minute).toBe(30);
  });

  it("跨区打烊投影按 0.5 小时算（17:30 出发赶不上 18 点关门的劳务市场）", () => {
    const s = createInitialState();
    s.time.hour = 17;
    s.time.minute = 30;
    const r = moveTo(s, "labor_market");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("打烊");
    expect(r.reason).toContain("30 分钟");
  });
});
