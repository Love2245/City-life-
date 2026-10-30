import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { migrateSave } from "../src/game/core/migrate";
import { gameDay } from "../src/game/core/calendar";
import {
  canArriveEarly, canPerform, closedReason, exitLocation, getLocation,
  isLocationOpen, isLocationVisible, locationAvailabilityAtArrival, locationOpenPhase,
  moveTo, regionTravelPlan, travelPlan, travelToRegion, waitHere, waitOptions,
} from "../src/game/core/actions";
import { goToMap, regionPathOf } from "../src/game/core/regions";
import type { ActionDef, GameState } from "../src/game/types";

function at(region: string, day = 1, hour = 12, minute = 0): GameState {
  const state = createInitialState(14805);
  state.region = region;
  state.area = region;
  state.locationId = "map";
  state.navStack = ["map", ...regionPathOf(region)];
  state.time.day = day;
  state.time.hour = hour;
  state.time.minute = minute;
  state.player.money = 100;
  state.player.attrs = { stamina: 100, health: 100, satiety: 100, hygiene: 100, mood: 100 };
  return state;
}
const minutes = (state: GameState) => gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
const copy = (state: GameState): GameState => JSON.parse(JSON.stringify(state));

describe("伯月新区与泊月区相邻交通", () => {
  it.each([
    [undefined, "subway", 30, 2], ["car", "car", 10, 0],
    ["e_bike", "bike", 20, 0], ["tricycle", "bike", 20, 0], ["bicycle", "bike", 20, 0],
  ])("%s 二级区域出行沿用城区交通，总览道路返程免费", (vehicle, mode, duration, fare) => {
    const state = at("development_culture");
    if (vehicle) state.flags[`item_${vehicle}`] = true;
    const before = minutes(state);
    expect(regionTravelPlan(state, "boyue")).toMatchObject({ mode, hours: duration / 60, fare });
    expect(travelToRegion(state, "boyue").ok).toBe(true);
    expect(state.region).toBe("boyue");
    expect(state.player.money).toBe(100 - fare);
    expect(minutes(state) - before).toBe(duration);
    expect(travelToRegion(state, "development").ok).toBe(true);
    expect(state.region).toBe("development");
    expect(state.player.money).toBe(100 - fare);
    expect(minutes(state) - before).toBe(duration);
  });

  it("泊月区到树堰区保留现有新区长途规则", () => {
    const state = at("boyue_university");
    expect(regionTravelPlan(state, "downtown")).toMatchObject({ mode: "development_subway", fare: 5, hours: 1 });
    expect(travelToRegion(state, "downtown").ok).toBe(true);
    expect(state.player.money).toBe(95);
    expect(state.time.hour).toBe(13);
    expect(travelToRegion(state, "boyue").ok).toBe(true);
    expect(state.player.money).toBe(90);
    expect(state.time.hour).toBe(14);
  });

  it("泊月区与紫羊区没有直达道路，需从车站乘车或使用私人载具", () => {
    const state = at("boyue_university");
    const before = minutes(state);
    expect(regionTravelPlan(state, "suburb")).toMatchObject({ mode: "bus", fare: 16, hours: 1.25, requiresTicket: true });
    const blocked = travelToRegion(state, "suburb");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain("车站");
    expect(state.region).toBe("boyue_university");
    expect(state.player.money).toBe(100);
    expect(minutes(state)).toBe(before);

    state.flags.item_car = true;
    expect(regionTravelPlan(state, "suburb")).toMatchObject({ mode: "car", fare: 0, hours: 1 });
    expect(travelToRegion(state, "suburb").ok).toBe(true);
    expect(state.region).toBe("suburban_edge");
  });

  it("伯月新区与紫羊区的既有直达路线继续可用", () => {
    const state = at("development_university");
    expect(regionTravelPlan(state, "suburb")).toMatchObject({ mode: "development_subway", fare: 5, hours: 1 });
    expect(travelToRegion(state, "suburb").ok).toBe(true);
    expect(state.region).toBe("suburb");
  });

  it("夜间无地铁或钱不足时相邻区仍按旧城区步行，不借用长途免费跳转", () => {
    const state = at("development_culture", 1, 2);
    state.player.money = 0;
    expect(regionTravelPlan(state, "boyue")).toMatchObject({ mode: "walk", fare: 0, hours: 1 });
    expect(travelToRegion(state, "boyue").ok).toBe(true);
    expect(state.time.hour).toBe(3);
  });

  it("树堰区与紫羊区仍需车票，汽车可用60分钟抵达城市边缘", () => {
    const state = at("downtown_center");
    expect(regionTravelPlan(state, "suburb")).toMatchObject({ requiresTicket: true, fare: 16, hours: 1.25 });
    expect(travelToRegion(state, "suburb").ok).toBe(false);
    state.flags.item_car = true;
    expect(regionTravelPlan(state, "suburb")).toMatchObject({ mode: "car", fare: 0, hours: 1 });
    expect(travelToRegion(state, "suburb").ok).toBe(true);
    expect(state.region).toBe("suburban_edge");
    expect(state.time.hour).toBe(13);
  });
});

describe("泊月区机场旧档归属", () => {
  it.each(["development", "development_airport", undefined])("机场旧 region=%s 修复导航与 area，出门留在泊月区", (region) => {
    const state = at("development_culture");
    state.locationId = "airport";
    state.region = region;
    state.area = "development";
    state.navStack = ["map", "development", "development_airport"];
    const loaded = migrateSave(copy(state));
    expect(loaded.region).toBe("boyue");
    expect(loaded.area).toBe("boyue");
    expect(loaded.navStack).toEqual(["map", "boyue"]);
    expect(loaded.locationId).toBe("map");
    expect(loaded.region).toBe("boyue");
    const before = minutes(loaded);
    expect(travelToRegion(loaded, "development").ok).toBe(true);
    expect(loaded.player.money).toBe(100);
    expect(minutes(loaded) - before).toBe(0);
  });

  it("机场旧档退出后保留旧顶级 region 的地图档也迁入泊月区", () => {
    const state = at("development");
    state.area = "development_airport";
    const loaded = migrateSave(copy(state));
    expect(loaded.region).toBe("boyue");
    expect(loaded.navStack).toEqual(["map", "boyue"]);
  });

  it("机场直入的相邻交通预览与实际一致，回主地图也不会回新区", () => {
    const state = at("development_culture");
    expect(regionTravelPlan(state, "development_airport")).toEqual(travelPlan(state, getLocation("airport")));
    const before = copy(state);
    expect(moveTo(state, "development_airport").ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe("泊月夜市营业与周末夜场", () => {
  it.each([
    [7, 18, false], // 周五晚
    [1, 5, false],  // 周六凌晨仍属于周五晚
    [1, 18, true], [2, 5, true],
    [2, 18, true], [3, 5, true],
    [3, 6, false], [1, 12, false],
  ])("第%d日 %d:00 德州可见/开放=%s，真实进入遵循同一规则", (day, hour, expected) => {
    const state = at("boyue_night_market", day, hour);
    const shop = getLocation("boyue_texas_shop")!;
    expect(isLocationVisible(state, shop)).toBe(expected);
    expect(isLocationVisible(state, shop.id)).toBe(expected);
    expect(isLocationOpen(shop, hour, state)).toBe(expected);
    expect(locationOpenPhase(shop, hour, state) === "open").toBe(expected);
    expect(closedReason(shop, hour, state) === "").toBe(expected);
    const before = copy(state);
    expect(moveTo(state, shop.id).ok).toBe(expected);
    if (!expected) expect(state).toEqual(before);
  });

  it.each(["boyue_nightclub", "boyue_lounge_bar"])("%s 仅18点至次日06点可进入，白天不允许提前候场", (id) => {
    const state = at("boyue_night_market", 7, 17);
    const venue = getLocation(id)!;
    expect(canArriveEarly(venue, 17, state)).toBe(false);
    expect(moveTo(state, id).ok).toBe(false);
    state.time.hour = 18;
    expect(moveTo(state, id).ok).toBe(true);
    state.time.day = 1;
    state.time.hour = 5;
    expect(isLocationOpen(venue, 5, state)).toBe(true);
    state.time.hour = 6;
    expect(isLocationOpen(venue, 6, state)).toBe(false);
  });

  it("午夜抵达预览使用抵达日与前一夜营业日，实际费用/时间一致", () => {
    const state = at("development_culture", 1, 23, 50);
    // 夜间城区地铁仍在运营，邻区跨午夜30分钟。
    const shop = getLocation("boyue_texas_shop")!;
    expect(locationAvailabilityAtArrival(state, shop)).toMatchObject({ arrivalHour: 20 / 60, open: true });
    const before = minutes(state);
    expect(moveTo(state, shop.id).ok).toBe(true);
    expect(state.time.day).toBe(2);
    expect(state.time.hour).toBe(0);
    expect(state.time.minute).toBe(20);
    expect(minutes(state) - before).toBe(30);
    expect(state.player.money).toBe(98);
  });

  it("抵达恰好06点已打烊，不扣费不推进时间", () => {
    const state = at("boyue_university", 3, 5, 50);
    state.flags.item_car = true;
    const shop = getLocation("boyue_texas_shop")!;
    expect(locationAvailabilityAtArrival(state, shop)).toMatchObject({ arrivalHour: 6, open: false, early: false });
    const before = copy(state);
    expect(moveTo(state, shop.id).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("合法夜场等待跨06点自动回夜市，闭店或隐藏档不能等候/执行行动绕过", () => {
    const state = at("boyue_night_market", 3, 5, 30);
    expect(moveTo(state, "boyue_texas_shop").ok).toBe(true);
    expect(waitHere(state, 0.5).ok).toBe(true);
    expect(state.locationId).toBe("map");
    expect(state.region).toBe("boyue_night_market");
    state.locationId = "boyue_texas_shop";
    const action = { id: "test_texas", locationId: "boyue_texas_shop", name: "测试", duration: 1, effects: {} } as ActionDef;
    const before = copy(state);
    expect(waitOptions(state)).toEqual([]);
    expect(waitHere(state, 1).ok).toBe(false);
    expect(canPerform(state, action).ok).toBe(false);
    expect(state).toEqual(before);
  });
});
