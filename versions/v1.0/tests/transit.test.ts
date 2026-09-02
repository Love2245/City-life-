import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { planTransit, currentVehicle, isSubwayRunning, hoursLabel, planLabel, walkReason, SUBWAY_FARE, SUBWAY_HOURS, WALK_CROSS_HOURS, CAR_HOURS, BIKE_HOURS, INTERCITY_BUS_FARE, INTERCITY_BUS_HOURS, INTERCITY_BIKE_HOURS, INTERCITY_CAR_HOURS } from "../src/game/core/transit";
import { travelToRegion, currentArea, isSameArea, travelText } from "../src/game/core/actions";
import { getLocation } from "../src/game/core/actions";

/** 把玩家放到市中心某地点（物理 area = downtown_center） */
function atCenter(s: ReturnType<typeof createInitialState>) {
  s.region = "downtown_center";
  s.area = "downtown_center";
}

describe("transit：方案计算 planTransit", () => {
  it("同区 → 步行免费 0h", () => {
    const s = createInitialState();
    atCenter(s);
    const p = planTransit(s, "same");
    expect(p.mode).toBe("same");
    expect(p.hours).toBe(0);
    expect(p.fare).toBe(0);
  });

  it("跨区 + 地铁在营 + 钱够 → 地铁 0.5h / 2 元", () => {
    const s = createInitialState(); // hour=7 ≥5，money=500≥2
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("subway");
    expect(p.hours).toBe(SUBWAY_HOURS);
    expect(p.fare).toBe(SUBWAY_FARE);
  });

  it("深夜地铁停运（hour<5）→ 步行 2h 免费", () => {
    const s = createInitialState();
    s.time.hour = 2;
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("walk");
    expect(p.hours).toBe(WALK_CROSS_HOURS);
    expect(p.fare).toBe(0);
    expect(walkReason(s)).toContain("停运");
  });

  it("钱不够 2 元 → 步行 2h 免费", () => {
    const s = createInitialState();
    s.player.money = 0;
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("walk");
    expect(p.hours).toBe(WALK_CROSS_HOURS);
    expect(walkReason(s)).toContain("车费");
  });

  it("有汽车 → 10 分钟免费（优先于地铁）", () => {
    const s = createInitialState();
    s.flags.item_car = true;
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("car");
    expect(p.hours).toBeCloseTo(CAR_HOURS); // 1/6 h
    expect(p.fare).toBe(0);
    expect(currentVehicle(s)).toBe("car");
  });

  it("有电动车/三轮车（无汽车）→ 20 分钟免费", () => {
    const s = createInitialState();
    s.flags.item_e_bike = true;
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("bike");
    expect(p.hours).toBeCloseTo(BIKE_HOURS); // 1/3 h
    expect(p.fare).toBe(0);
    expect(currentVehicle(s)).toBe("e_bike");

    const s2 = createInitialState();
    s2.flags.item_tricycle = true;
    const p2 = planTransit(s2, "local");
    expect(p2.mode).toBe("bike");
    expect(currentVehicle(s2)).toBe("tricycle");
  });

  it("汽车优先于电动车", () => {
    const s = createInitialState();
    s.flags.item_car = true;
    s.flags.item_e_bike = true;
    expect(currentVehicle(s)).toBe("car");
  });
});

describe("transit：跨一级区（市区↔郊区）长途费率", () => {
  it("无载具 → 长途巴士 20 元 / 2 小时", () => {
    const s = createInitialState();
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("bus");
    expect(p.fare).toBe(INTERCITY_BUS_FARE);
    expect(p.hours).toBe(INTERCITY_BUS_HOURS);
    expect(planLabel(p)).toContain("🚌");
  });

  it("电动车 → 自行往返 1 小时免费", () => {
    const s = createInitialState();
    s.flags.item_e_bike = true;
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("bike");
    expect(p.hours).toBeCloseTo(INTERCITY_BIKE_HOURS);
    expect(p.fare).toBe(0);
  });

  it("三轮车 → 与电动车同费率", () => {
    const s = createInitialState();
    s.flags.item_tricycle = true;
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("bike");
    expect(p.hours).toBeCloseTo(INTERCITY_BIKE_HOURS);
  });

  it("汽车 → 0.5 小时免费，且优先于巴士", () => {
    const s = createInitialState();
    s.flags.item_car = true;
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("car");
    expect(p.hours).toBeCloseTo(INTERCITY_CAR_HOURS);
    expect(p.fare).toBe(0);
  });

  it("长途费率高于同一级区内跨子区费率", () => {
    const s = createInitialState();
    atCenter(s);
    const local = planTransit(s, "local");
    const inter = planTransit(s, "intercity");
    expect(inter.fare).toBeGreaterThan(local.fare);
    expect(inter.hours).toBeGreaterThan(local.hours);
  });

  it("planTransit 是纯计算层：钱不够仍返回 bus 方案（拦截在 actions 层）", () => {
    const s = createInitialState();
    s.player.money = 0;
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("bus");
    expect(p.fare).toBe(INTERCITY_BUS_FARE);
  });

  it("钱不够长途车费 → travelToRegion 拒绝，不扣钱不推时间", () => {
    const s = createInitialState();
    s.player.money = 5;
    s.area = "downtown_center";
    s.region = "downtown_center";
    const hourBefore = s.time.hour;
    const r = travelToRegion(s, "suburb");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("长途车费");
    expect(s.player.money).toBe(5);
    expect(s.time.hour).toBe(hourBefore);
  });

  it("钱够 → 进郊区扣 20 元 + 推进 2 小时", () => {
    const s = createInitialState();
    s.time.hour = 9;
    s.time.minute = 0;
    s.area = "downtown_center";
    s.region = "downtown_center";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "suburb");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - INTERCITY_BUS_FARE);
    expect(s.time.hour).toBe(11);
  });
});

describe("transit：时间/文案工具", () => {
  it("isSubwayRunning（hour≥5）", () => {
    const s = createInitialState();
    s.time.hour = 5;
    expect(isSubwayRunning(s)).toBe(true);
    s.time.hour = 4;
    expect(isSubwayRunning(s)).toBe(false);
  });

  it("hoursLabel", () => {
    expect(hoursLabel(0)).toBe("即刻到达");
    expect(hoursLabel(0.5)).toBe("约 30 分钟");
    expect(hoursLabel(1)).toBe("约 1 小时");
    expect(hoursLabel(2)).toBe("约 2 小时");
  });

  it("planLabel", () => {
    const s = createInitialState();
    atCenter(s);
    expect(planLabel(planTransit(s, "same"))).toBe("即刻到达");
    expect(planLabel(planTransit(s, "local"))).toContain("🚇");
    expect(planLabel(planTransit(s, "local"))).toContain("2 元");
  });
});

describe("transit：区域/同区判定", () => {
  it("currentArea 回退 state.area（主地图态）", () => {
    const s = createInitialState();
    s.region = undefined;
    s.area = "downtown_residential";
    expect(currentArea(s)).toBe("downtown_residential");
    // 站在二级区内时直接返回该区
    s.region = "downtown_center";
    expect(currentArea(s)).toBe("downtown_center");
  });

  it("isSameArea 按物理 area 判断", () => {
    const s = createInitialState();
    const market = getLocation("market")!; // 归属 residential
    s.region = undefined;
    s.area = "downtown_residential";
    expect(isSameArea(s, market)).toBe(true);
    s.area = "downtown_industrial";
    expect(isSameArea(s, market)).toBe(false);
  });
});

describe("transit：travelToRegion 集成", () => {
  it("跨二级区坐地铁：扣 2 元 + 推进 0.5h", () => {
    const s = createInitialState();
    s.time.hour = 10;
    s.time.minute = 0;
    // 当前在住宅区，跨到市中心
    s.area = "downtown_residential";
    s.region = "downtown_residential";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "downtown_center");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - SUBWAY_FARE);
    expect(s.time.hour).toBe(10);
    expect(s.time.minute).toBe(30);
    expect(s.area).toBe("downtown_center");
    // 到住宅区地点（market 仅 residential）仍为跨区 → 地铁
    expect(travelText(s, getLocation("market"))).toContain("🚇");
  });

  it("在同一二级区切换子区不收费、不耗时", () => {
    const s = createInitialState();
    s.time.hour = 10;
    s.area = "downtown_center";
    s.region = "downtown_center";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "downtown_center");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore);
    expect(s.time.minute).toBe(0);
  });

  it("深夜跨区步行 2h 免费", () => {
    const s = createInitialState();
    s.time.hour = 2;
    s.area = "downtown_residential";
    s.region = "downtown_residential";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "downtown_center");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore);
    expect(s.time.hour).toBe(4); // 2 + 2h
    expect(s.time.minute).toBe(0);
  });
});
