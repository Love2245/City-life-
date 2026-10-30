import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { planTransit, currentVehicle, isSubwayRunning, hoursLabel, planLabel, walkReason, departureMinutesOf, nextDeparture, nextDepartureAfter, buyIntercityTicket, boardIntercityTicket, ticketStatus, SUBWAY_FARE, SUBWAY_HOURS, WALK_CROSS_HOURS, CAR_HOURS, BIKE_HOURS, INTERCITY_BUS_FARE, INTERCITY_BUS_HOURS, INTERCITY_BIKE_HOURS, INTERCITY_CAR_HOURS, INTERCITY_TRAIN_FARE } from "../src/game/core/transit";
import { travelToRegion, currentArea, isSameArea, travelText, purchaseAndRideIntercityTicket, canPerform, getAction, getLocation } from "../src/game/core/actions";

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

  it("深夜地铁停运（hour<5）→ 步行 1h 免费", () => {
    const s = createInitialState();
    s.time.hour = 2;
    atCenter(s);
    const p = planTransit(s, "local");
    expect(p.mode).toBe("walk");
    expect(p.hours).toBe(WALK_CROSS_HOURS);
    expect(p.fare).toBe(0);
    expect(walkReason(s)).toContain("停运");
  });

  it("钱不够 2 元 → 步行 1h 免费", () => {
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

describe("transit：跨一级区（市区↔郊区）长途交通", () => {
  it("无载具 → 城际巴士 16 元 / 1 小时 15 分，并要求车站购票", () => {
    const s = createInitialState();
    atCenter(s);
    const p = planTransit(s, "intercity");
    expect(p.mode).toBe("bus");
    expect(p.fare).toBe(INTERCITY_BUS_FARE);
    expect(p.hours).toBe(INTERCITY_BUS_HOURS);
    expect(p.requiresTicket).toBe(true);
    expect(p.ticketMode).toBe("bus");
    expect(planLabel(p)).toContain("🚌");
  });

  it("电动车 → 跨城耗时 1.5 小时且免费", () => {
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

  it("汽车 → 跨城耗时 1 小时且优先于巴士", () => {
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

  it("没有私人载具 → 地图直达被拒绝，不扣钱不推时间", () => {
    const s = createInitialState();
    s.player.money = 5;
    s.area = "downtown_center";
    s.region = "downtown_center";
    const hourBefore = s.time.hour;
    const r = travelToRegion(s, "suburb");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("车站");
    expect(s.player.money).toBe(5);
    expect(s.time.hour).toBe(hourBefore);
  });

  it("有汽车 → 进入郊区城市边缘，免费并推进 1 小时", () => {
    const s = createInitialState();
    s.time.hour = 9;
    s.time.minute = 0;
    s.flags.item_car = true;
    s.area = "downtown_center";
    s.region = "downtown_center";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "suburb");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore);
    expect(s.time.hour).toBe(10);
    expect(s.region).toBe("suburban_edge");
  });

  it("车站班次：巴士每小时 06:00—18:00，火车全天每三小时一班", () => {
    const s = createInitialState();
    expect(departureMinutesOf("train")).toEqual([0, 180, 360, 540, 720, 900, 1080, 1260]);
    s.time.hour = 6;
    s.time.minute = 1;
    expect(nextDeparture(s.time, "bus")).toEqual({ day: 0, minute: 420 });
    expect(nextDeparture(s.time, "train")).toEqual({ day: 0, minute: 540 });
    s.time.hour = 19;
    expect(nextDeparture(s.time, "bus")).toEqual({ day: 1, minute: 360 });
    expect(nextDeparture(s.time, "train")).toEqual({ day: 0, minute: 1260 });
    s.time.hour = 21;
    s.time.minute = 1;
    expect(nextDeparture(s.time, "train")).toEqual({ day: 1, minute: 0 });
    s.time.hour = 0;
    s.time.minute = 0;
    expect(nextDeparture(s.time, "train")).toEqual({ day: 0, minute: 0 });
    expect(nextDepartureAfter(s.time, "train")).toEqual({ day: 0, minute: 180 });
    s.time.hour = 23;
    s.time.minute = 59;
    expect(nextDepartureAfter(s.time, "train")).toEqual({ day: 1, minute: 0 });
  });

  it("两座火车站 24 小时开放，跨午夜购票会搭乘次日 00:00 班次", () => {
    const s = createInitialState();
    s.time.hour = 0;
    s.locationId = "high_speed_rail";
    s.region = "downtown_station";
    s.area = "downtown_station";
    expect(canPerform(s, getAction("station_intercity_train")!).ok).toBe(true);
    const beforeDay = s.time.day;
    s.time.hour = 23;
    s.time.minute = 59;
    const result = purchaseAndRideIntercityTicket(s, "train");
    expect(result.ok).toBe(true);
    expect(result.ticket).toMatchObject({ departureDay: 1, departureMinute: 0 });
    expect(s.region).toBe("suburban_edge");
    expect(s.time.day).toBe(beforeDay + 1);
    expect(s.time.hour).toBe(1);
    expect(s.time.minute).toBe(0);

    const returnState = createInitialState();
    returnState.locationId = "suburb_train_station";
    returnState.region = "suburban_edge";
    returnState.area = "suburban_edge";
    returnState.time.hour = 0;
    expect(canPerform(returnState, getAction("suburb_station_intercity_train")!).ok).toBe(true);
    returnState.time.hour = 0;
    returnState.time.minute = 0;
    const returnTrip = purchaseAndRideIntercityTicket(returnState, "train");
    expect(returnTrip.ok).toBe(true);
    expect(returnTrip.ticket).toMatchObject({ departureDay: 0, departureMinute: 180 });
    expect(returnState.region).toBe("downtown_station");
    expect(returnState.time.hour).toBe(4);
    expect(returnState.time.minute).toBe(0);
  });

  it("购票后可离站再回站，只有绑定车站和发车分钟可以检票", () => {
    const s = createInitialState();
    s.locationId = "bus_station";
    s.region = "downtown_station";
    s.area = "downtown_station";
    s.time.hour = 6;
    s.time.minute = 0;
    const before = s.player.money;
    const bought = buyIntercityTicket(s, "bus", "bus_station");
    expect(bought.ok).toBe(true);
    expect(s.player.money).toBe(before - INTERCITY_BUS_FARE);
    expect(ticketStatus(s)).toBe("due");

    s.locationId = "flower_market";
    expect(boardIntercityTicket(s, "flower_market").ok).toBe(false);
    s.locationId = "bus_station";
    expect(boardIntercityTicket(s, "bus_station").ok).toBe(true);
    expect(s.intercityTicket).toBeUndefined();

    s.locationId = "high_speed_rail";
    s.time.hour = 9;
    const train = buyIntercityTicket(s, "train", "high_speed_rail");
    expect(train.ok).toBe(true);
    expect(train.ticket?.fare).toBe(INTERCITY_TRAIN_FARE);
  });

  it("错过班次后车票失效且不退款", () => {
    const s = createInitialState();
    s.locationId = "bus_station";
    s.time.hour = 6;
    s.time.minute = 0;
    const before = s.player.money;
    expect(buyIntercityTicket(s, "bus", "bus_station").ok).toBe(true);
    s.time.hour = 6;
    s.time.minute = 1;
    expect(ticketStatus(s)).toBe("missed");
    expect(boardIntercityTicket(s, "bus_station").ok).toBe(false);
    expect(s.intercityTicket).toBeUndefined();
    expect(s.player.money).toBe(before - INTERCITY_BUS_FARE);
  });

  it("v1.42 买票即乘车：11:00 购票后自动到 12:00 发车并在 13:15 抵达", () => {
    const s = createInitialState();
    s.locationId = "bus_station";
    s.region = "downtown_station";
    s.area = "downtown_station";
    s.time.hour = 11;
    s.time.minute = 0;
    const before = s.player.money;
    const result = purchaseAndRideIntercityTicket(s, "bus");
    expect(result.ok).toBe(true);
    expect(s.player.money).toBe(before - INTERCITY_BUS_FARE);
    expect(s.intercityTicket).toBeUndefined();
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("suburban_edge");
    expect(s.time.hour).toBe(13);
    expect(s.time.minute).toBe(15);
  });

  it("旧存档待发车车票仍保留人工检票，不被新购票流程覆盖", () => {
    const s = createInitialState();
    s.locationId = "bus_station";
    s.region = "downtown_station";
    s.area = "downtown_station";
    s.time.hour = 11;
    s.time.minute = 1;
    expect(buyIntercityTicket(s, "bus", "bus_station").ok).toBe(true);
    const ticket = s.intercityTicket;
    expect(ticket?.departureMinute).toBe(720);
    s.time.hour = 11;
    expect(purchaseAndRideIntercityTicket(s, "bus").ok).toBe(false);
    expect(s.intercityTicket).toEqual(ticket);
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

  it("深夜跨区步行 1h 免费", () => {
    const s = createInitialState();
    s.time.hour = 2;
    s.area = "downtown_residential";
    s.region = "downtown_residential";
    const moneyBefore = s.player.money;
    const r = travelToRegion(s, "downtown_center");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore);
    expect(s.time.hour).toBe(3); // 2 + 1h
    expect(s.time.minute).toBe(0);
  });
});
