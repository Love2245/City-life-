import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { migrateSave } from "../src/game/core/migrate";
import { gameDay } from "../src/game/core/calendar";
import {
  developmentBusPlan, exitLocation, getLocation, moveTo, regionTravelPlan,
  isLocationUnlocked, locationLockReason, rideDevelopmentBus, travelPlan, travelToRegion,
} from "../src/game/core/actions";
import { goToMap } from "../src/game/core/regions";
import { planTransit } from "../src/game/core/transit";
import * as time from "../src/game/core/time";
import { triggerCollapse } from "../src/game/engine";
import { residenceLocationId } from "../src/game/core/residence";
import type { GameState } from "../src/game/types";

function readyState(region = "downtown_center", location = "map"): GameState {
  const state = createInitialState(148);
  state.region = region;
  state.area = region;
  state.locationId = location;
  state.time.hour = 12;
  state.time.minute = 0;
  state.player.money = 100;
  state.player.attrs = { stamina: 100, health: 100, mood: 80, hygiene: 100, satiety: 100 };
  return state;
}

function minuteOf(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}

function copy(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

describe("v1.48 开发区地图通行", () => {
  it("无私人车地图直达并正常收费，返回市区使用相同方案", () => {
    const state = readyState();
    const before = minuteOf(state);
    expect(regionTravelPlan(state, "development")).toMatchObject({
      mode: "development_subway", fare: 5, hours: 1,
    });
    expect(travelToRegion(state, "development").ok).toBe(true);
    expect(state.locationId).toBe("map");
    expect(state.region).toBe("development");
    expect(state.area).toBe("development");
    expect(state.navStack).toEqual(["map", "development"]);
    expect(state.player.money).toBe(95);
    expect(minuteOf(state) - before).toBe(60);
    expect(state.weekly.spent).toBe(5);
    expect(state.intercityTicket).toBeUndefined();

    expect(travelToRegion(state, "downtown").ok).toBe(true);
    expect(state.region).toBe("downtown");
    expect(state.player.money).toBe(90);
    expect(minuteOf(state) - before).toBe(120);
  });

  it.each([
    ["e_bike", "bike", 45],
    ["tricycle", "bike", 45],
    ["car", "car", 30],
  ])("%s 往返开发区优先使用私人车且耗时一致", (vehicle, mode, minutes) => {
    const state = readyState();
    state.flags[`item_${vehicle}`] = true;
    const before = minuteOf(state);
    expect(regionTravelPlan(state, "development_culture")).toMatchObject({ mode, fare: 0, hours: minutes / 60 });
    expect(moveTo(state, "development_culture").ok).toBe(true);
    expect(state.region).toBe("development_culture");
    expect(state.player.money).toBe(100);
    expect(minuteOf(state) - before).toBe(minutes);
    expect(moveTo(state, "downtown_center").ok).toBe(true);
    expect(state.region).toBe("downtown_center");
    expect(minuteOf(state) - before).toBe(minutes * 2);
  });

  it("汽车优先于三轮车与电动车，自行车不作为跨区私人车", () => {
    const state = readyState();
    state.flags.item_bicycle = true;
    expect(regionTravelPlan(state, "development")).toMatchObject({ mode: "development_subway", hours: 1, fare: 5 });
    state.flags.item_e_bike = true;
    state.flags.item_tricycle = true;
    state.flags.item_car = true;
    expect(regionTravelPlan(state, "development")).toMatchObject({ mode: "car", hours: 0.5, fare: 0 });
  });

  it("长途地铁不因夜间或雨雪增加未约定的耗时", () => {
    const state = readyState();
    state.time.hour = 2;
    state.weather.id = "rain";
    expect(travelToRegion(state, "development").ok).toBe(true);
    expect(state.time.hour).toBe(3);
    expect(state.player.money).toBe(95);
  });

  it("地图跨区费用不足失败时完整状态不变，不退化为免费步行", () => {
    const state = readyState();
    state.player.money = 4;
    const before = copy(state);
    expect(travelToRegion(state, "development")).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });

  it("moveTo 直达设施同样结算长途交通，并允许正常反向", () => {
    const state = readyState();
    const before = minuteOf(state);
    expect(moveTo(state, "dev_museum").ok).toBe(true);
    expect(state.locationId).toBe("dev_museum");
    expect(state.region).toBe("development_culture");
    expect(state.player.money).toBe(95);
    expect(minuteOf(state) - before).toBe(60);
    expect(moveTo(state, "bus_station").ok).toBe(true);
    expect(state.locationId).toBe("bus_station");
    expect(state.player.money).toBe(90);
    expect(minuteOf(state) - before).toBe(120);
  });

  it("创业孵化基地暂停对外开放，两处学院提示学生通行证，现有住户仍可回家", () => {
    const state = readyState();
    state.time.year = 2026;
    state.time.month = 9;
    state.time.day = 3;
    for (const [id, reason] of [
      ["dev_incubator", "需要学生通行证"],
      ["dev_university", "需要学生通行证"],
      ["boyue_engineering_college", "需要学生通行证"],
    ] as const) {
      const place = getLocation(id)!;
      expect(isLocationUnlocked(state, place)).toBe(false);
      expect(locationLockReason(state, place)).toBe(reason);
      expect(moveTo(state, id)).toMatchObject({ ok: false, reason });
    }

    state.flags.item_student_pass = true;
    expect(isLocationUnlocked(state, getLocation("dev_university"))).toBe(true);
    expect(isLocationUnlocked(state, getLocation("boyue_engineering_college"))).toBe(true);
    state.region = "development_university";
    state.area = "development_university";
    state.locationId = "map";
    state.living.mode = "lease";
    state.living.lease = { housingId: "dev_incubator", rent: 800, rentGrowthCount: 0 };
    expect(isLocationUnlocked(state, getLocation("dev_incubator"))).toBe(true);
    expect(moveTo(state, "dev_incubator").ok).toBe(true);
  });

  it("跨一级区不会被旧 area 当作同区而免除费用", () => {
    const state = readyState("development");
    state.area = "downtown_residential";
    expect(travelPlan(state, getLocation("cafe"))).toMatchObject({ mode: "development_subway", fare: 5, hours: 1 });
    expect(regionTravelPlan(state, "downtown_residential")).toMatchObject({ fare: 5, hours: 1 });
    expect(moveTo(state, "cafe").ok).toBe(true);
    expect(state.player.money).toBe(95);
    expect(state.time.hour).toBe(13);
  });

  it("设施移动收费失败也保留网吧机位等既有状态", () => {
    const state = readyState("downtown_center", "internet_cafe");
    state.flags.netbar_session = 1;
    state.flags.netbar_session_until_minute = minuteOf(state) + 120;
    state.player.money = 4;
    const before = copy(state);
    expect(moveTo(state, "dev_museum")).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });
});

describe("v1.48 开发区整点直达巴士", () => {
  it("整点可搭当班，8 元/45 分钟抵达对侧巴士站", () => {
    const state = readyState("downtown_station", "bus_station");
    const before = copy(state);
    expect(developmentBusPlan(state)).toMatchObject({
      ok: true, cost: 8, waitMinutes: 0, travelHours: 0.75, totalHours: 0.75,
      arrivalHour: 12, arrivalMinute: 45, destinationStationId: "development_bus_station",
    });
    expect(state).toEqual(before);
    expect(rideDevelopmentBus(state).ok).toBe(true);
    expect(state.locationId).toBe("development_bus_station");
    expect(state.region).toBe("development_culture");
    expect(state.area).toBe("development_culture");
    expect(state.navStack).toEqual(["map", "development", "development_culture"]);
    expect(state.time.hour).toBe(12);
    expect(state.time.minute).toBe(45);
    expect(state.player.money).toBe(92);
    expect(state.weekly.spent).toBe(8);
    expect(state.intercityTicket).toBeUndefined();
  });

  it("整点后一分候车 59 分，候车与行驶共同推进生存时间", () => {
    const state = readyState("downtown_station", "bus_station");
    state.time.minute = 1;
    const before = minuteOf(state);
    expect(developmentBusPlan(state)).toMatchObject({ waitMinutes: 59, departure: { minute: 13 * 60 }, travelHours: 0.75, arrivalHour: 13, arrivalMinute: 45 });
    expect(rideDevelopmentBus(state).ok).toBe(true);
    expect(minuteOf(state) - before).toBe(104);
    expect(state.player.money).toBe(92);
  });

  it("反向从开发区巴士站返回市区巴士站", () => {
    const state = readyState("development_culture", "development_bus_station");
    expect(developmentBusPlan(state)).toMatchObject({ ok: true, destinationStationId: "bus_station", routeLabel: "伯月新区 → 树堰区" });
    expect(rideDevelopmentBus(state).ok).toBe(true);
    expect(state.locationId).toBe("bus_station");
    expect(state.navStack).toEqual(["map", "downtown", "downtown_station"]);
    expect(state.player.money).toBe(92);
    expect(state.time.minute).toBe(45);
  });

  it("深夜班次照常发车，跨午夜沿用一次自然日生存结算", () => {
    const state = readyState("downtown_station", "bus_station");
    state.time.day = 2;
    state.time.hour = 23;
    state.time.minute = 40;
    const before = minuteOf(state);
    expect(developmentBusPlan(state)).toMatchObject({ waitMinutes: 20, departure: { day: gameDay(state.time) + 1, minute: 0 }, travelHours: 0.75, arrivalHour: 0, arrivalMinute: 45 });
    expect(rideDevelopmentBus(state).ok).toBe(true);
    expect(minuteOf(state) - before).toBe(65);
    expect(state.time.day).toBe(3);
    expect(state.player.attrs.health).toBe(98.5);
    expect(state.player.attrs.hygiene).toBe(94);
    expect(state.player.money).toBe(92);
  });

  it("有私人车仍可主动选择直达巴士", () => {
    const state = readyState("downtown_station", "bus_station");
    state.flags.item_car = true;
    expect(rideDevelopmentBus(state).ok).toBe(true);
    expect(state.player.money).toBe(92);
    expect(state.locationId).toBe("development_bus_station");
  });

  it("候车跨午夜触发坏结局时停止行程，不继续行驶或写入抵达", () => {
    const state = readyState("downtown_station", "bus_station");
    state.time.day = 2;
    state.time.hour = 23;
    state.time.minute = 40;
    state.player.attrs.health = 0;
    state.player.criticalHealthStreak = 3;

    const result = rideDevelopmentBus(state);

    expect(result.ok).toBe(false);
    expect(state.endingId).toBe("ending_sick");
    expect(state.locationId).toBe("bus_station");
    expect(state.time.hour).toBe(0);
    expect(state.time.minute).toBe(0);
    expect(state.player.money).toBe(92); // 候车前已购票，但没有再执行行驶时间。
    expect(state.log.some((entry) => entry.text.includes("已抵达"))).toBe(false);
  });

  it.each(["collapse", "hospital"])("候车期间发生 %s 后不覆盖被系统改变的位置", (interruption) => {
    const state = readyState("downtown_station", "bus_station");
    state.time.minute = 40;
    const originalAdvance = time.advanceHours;
    let interrupted = false;
    const advance = vi.spyOn(time, "advanceHours").mockImplementation((s, ...args) => {
      const result = originalAdvance(s, ...args);
      if (!interrupted) {
        interrupted = true;
        if (interruption === "collapse") triggerCollapse(s, "旅途中身体不适");
        else {
          s.flags.hospitalized = true;
          s.locationId = "hospital";
          s.region = "downtown_center";
          s.area = "downtown_center";
          s.navStack = ["map", "downtown", "downtown_center"];
        }
      }
      return result;
    });
    try {
      expect(rideDevelopmentBus(state).ok).toBe(false);
      expect(state.locationId).toBe(interruption === "collapse" ? residenceLocationId(state) : "hospital");
      expect(state.region).not.toBe("development_culture");
      expect(state.log.some((entry) => entry.text.includes("已抵达"))).toBe(false);
    } finally {
      advance.mockRestore();
    }
  });

  it.each(["not_station", "insufficient_fare", "hospitalized", "working", "ended"])("%s 准入失败时完整状态不变", (blocked) => {
    const state = readyState("downtown_station", "bus_station");
    if (blocked === "not_station") state.locationId = "suburb_bus_station";
    if (blocked === "insufficient_fare") state.player.money = 7;
    if (blocked === "hospitalized") state.flags.hospitalized = true;
    if (blocked === "working") state.work!.active = { id: "ongoing" } as NonNullable<GameState["work"]>["active"];
    if (blocked === "ended") state.endingId = "ending_sick";
    const before = copy(state);
    expect(developmentBusPlan(state).ok).toBe(false);
    expect(rideDevelopmentBus(state).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("两侧巴士站全天能从地图进入", () => {
    for (const [region, station] of [["downtown_station", "bus_station"], ["development_culture", "development_bus_station"]]) {
      const state = readyState(region);
      state.time.hour = 0;
      expect(moveTo(state, station).ok).toBe(true);
      expect(developmentBusPlan(state)).toMatchObject({ ok: true, waitMinutes: 0 });
    }
  });
});

describe("v1.48 机场直入、读档与旧交通", () => {
  it.each(["development", "development_reserve", "treasure_lake"])("跨午夜前往 %s 触发坏结局时不写入目的地", (target) => {
    const state = readyState("downtown_center", "map");
    state.time.day = 2;
    state.time.hour = 23;
    state.time.minute = 40;
    state.player.attrs.health = 0;
    state.player.criticalHealthStreak = 3;
    state.navStack = ["map", "downtown", "downtown_center"];

    expect(moveTo(state, target).ok).toBe(false);
    expect(state.endingId).toBe("ending_sick");
    expect(state.locationId).toBe("map");
    expect(state.region).toBe("downtown_center");
    expect(state.navStack).toEqual(["map", "downtown", "downtown_center"]);
    expect(state.time.hour).toBe(0);
    expect(state.time.minute).toBe(0);
    expect(state.player.money).toBe(95);
  });

  it("长途地铁跨午夜正常到达时只收一次车费且总时长保持一小时", () => {
    const state = readyState();
    state.time.day = 3;
    state.time.hour = 23;
    state.time.minute = 40;
    const before = minuteOf(state);
    expect(moveTo(state, "treasure_lake").ok).toBe(true);
    expect(state.locationId).toBe("treasure_lake");
    expect(state.time.hour).toBe(0);
    expect(state.time.minute).toBe(40);
    expect(minuteOf(state) - before).toBe(60);
    expect(state.player.money).toBe(95);
    expect(state.weekly.spent).toBe(5);
  });

  it("已触发坏结局后不能经地图或设施启动开发区交通", () => {
    for (const target of ["development", "development_airport", "airport"]) {
      const state = readyState();
      state.endingId = "ending_sick";
      const before = copy(state);
      expect(moveTo(state, target).ok).toBe(false);
      expect(state).toEqual(before);
    }
  });

  it.each(["development_airport", "airport"])("跨一级区通过 %s 前往未开放机场不收费、不耗时", (target) => {
    const state = readyState();
    expect(regionTravelPlan(state, "development_airport")).toEqual(travelPlan(state, getLocation("airport")));
    const before = copy(state);
    expect(moveTo(state, target).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("开发区内跨子区去机场正常计入本地地铁费用与时间", () => {
    const state = readyState("development_culture");
    const before = copy(state);
    expect(travelToRegion(state, "development_airport").ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("机场档与巴士站档能恢复完整导航，回主地图仍留在开发区", () => {
    for (const target of ["airport", "development_bus_station"]) {
      const state = readyState();
      if (target === "airport") state.locationId = "airport";
      else expect(moveTo(state, target).ok).toBe(true);
      state.navStack = ["map"];
      delete state.region;
      const loaded = migrateSave(copy(state));
      const owner = target === "airport" ? "boyue" : "development";
      expect(loaded.navStack).toEqual(target === "airport" ? ["map", owner] : ["map", owner, loaded.region]);
      expect(loaded.area).toBe(target === "airport" ? "boyue" : "development_culture");
      goToMap(loaded);
      expect(loaded.region).toBe(owner);
      expect(loaded.navStack).toEqual(["map", owner]);
    }
  });

  it("住院期间地图、机场区域与机场设施入口均无法离院", () => {
    const state = readyState("downtown_center", "hospital");
    state.flags.hospitalized = true;
    const before = copy(state);
    expect(travelToRegion(state, "development").ok).toBe(false);
    expect(travelToRegion(state, "development_airport").ok).toBe(false);
    expect(moveTo(state, "airport").ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("市区↔郊区保持既有购票限制、私人车耗时与城市边缘落点", () => {
    const state = readyState();
    expect(planTransit(state, "intercity", "suburb", "downtown")).toMatchObject({ fare: 16, hours: 1.25, requiresTicket: true });
    const before = copy(state);
    expect(travelToRegion(state, "suburb").ok).toBe(false);
    expect(state).toEqual(before);
    state.flags.item_car = true;
    expect(travelToRegion(state, "rural").ok).toBe(true);
    expect(state.region).toBe("suburban_edge");
    expect(state.time.hour).toBe(13);
    expect(state.player.money).toBe(100);
  });
});
