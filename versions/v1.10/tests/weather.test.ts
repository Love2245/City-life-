import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { rollWeather, currentWeather, holidayOf, todayIsHoliday, WEATHER_LABEL } from "../src/game/core/weather";
import { seasonOf, SEASON_LABEL } from "../src/game/core/calendar";
import { advanceHours, sleepSettlement } from "../src/game/core/time";
import { travelHours } from "../src/game/core/actions";
import { getLocation } from "../src/game/core/actions";
import { checkEventConditions, EVENTS } from "../src/game/core/events";

describe("v0.95 季节/天气系统", () => {
  it("初始 2026-08-01 为夏季，天气默认晴", () => {
    const s = createInitialState();
    expect(seasonOf(s.time.month)).toBe("summer");
    expect(SEASON_LABEL[seasonOf(s.time.month)]).toBe("夏");
    expect(currentWeather(s)).toBe("sunny");
    expect(WEATHER_LABEL.sunny).toBe("☀️ 晴");
  });

  it("季节随月份变化", () => {
    expect(seasonOf(11)).toBe("autumn");
    expect(seasonOf(1)).toBe("winter");
    expect(seasonOf(4)).toBe("spring");
  });

  it("rollWeather 冬季出现雪/寒潮（固定 rng 可复现）", () => {
    const s = createInitialState(7);
    s.time.month = 12; // 冬
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(rollWeather(s));
    expect(seen.has("snow") || seen.has("coldwave")).toBe(true); // 冬季必有雪或寒潮
  });

  it("rollWeather 夏季出现热浪", () => {
    const s = createInitialState(7);
    s.time.month = 7; // 夏
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(rollWeather(s));
    expect(seen.has("heatwave")).toBe(true);
  });

  it("跨天自动重掷天气（rollDay 挂点）", () => {
    const s = createInitialState(42);
    s.time = { ...s.time, day: 1, hour: 23, minute: 0 };
    const before = s.weather;
    advanceHours(s, 2); // 跨入新一天
    expect(s.time.day).toBe(2);
    expect(s.weather.lastRollDay).toBeGreaterThanOrEqual(1);
    expect(WEATHER_LABEL[s.weather.id]).toBeDefined();
    expect(before.id).toBeTruthy();
  });

  it("雨天跨区出行时间 ×1.5（0.5 → 0.75h），同区不变", () => {
    const s = createInitialState();
    s.weather = { id: "rain", lastRollDay: 0 };
    s.region = "downtown_residential";
    const crossLoc = getLocation("housing_agency")!; // downtown_center，跨区
    expect(travelHours(s, crossLoc)).toBe(0.75);
    const sameLoc = getLocation("market")!; // downtown_residential，同区
    expect(travelHours(s, sameLoc)).toBe(0);
  });

  it("晴天出行时间不变", () => {
    const s = createInitialState();
    s.region = "downtown_residential";
    const crossLoc = getLocation("housing_agency")!;
    expect(travelHours(s, crossLoc)).toBe(0.5);
  });

  it("寒潮：按天住宿费上浮 1.3 倍，own 房不涨", () => {
    const s = createInitialState();
    s.player.money = 1000;
    s.living = { mode: "nightly", govDaysLeft: 0, nightly: { lodgingId: "hotel" }, lease: null }; // hotel 120/晚
    s.weather = { id: "coldwave", lastRollDay: 0 };
    sleepSettlement(s, { stayedUp: false, hours: 8 });
    expect(s.player.money).toBe(1000 - Math.round(120 * 1.3)); // 156
  });

  it("寒潮对产权房（own）无影响", () => {
    const s = createInitialState();
    s.player.money = 10000;
    s.living = { mode: "own", govDaysLeft: 0, nightly: null, lease: null, ownedId: "own_apartment" };
    s.weather = { id: "coldwave", lastRollDay: 0 };
    const before = s.player.money;
    sleepSettlement(s, { stayedUp: false, hours: 8 });
    expect(s.player.money).toBe(before);
  });
});

describe("v0.95 节假日", () => {
  it("国庆节 10/1 命中", () => {
    const s = createInitialState();
    s.time.month = 10;
    s.time.day = 1;
    const h = holidayOf(s);
    expect(h?.id).toBe("national_day");
    expect(todayIsHoliday(s)).toBe(true);
  });

  it("春节按年份表命中（2028-01-26）", () => {
    const s = createInitialState();
    s.time.year = 2028;
    s.time.month = 1;
    s.time.day = 26;
    expect(holidayOf(s)?.id).toBe("spring_festival");
  });

  it("非节假日返回 null", () => {
    const s = createInitialState(); // 2026-08-01 无节日
    expect(holidayOf(s)).toBeNull();
    expect(todayIsHoliday(s)).toBe(false);
  });

  it("节假日专属事件条件过滤：春节事件仅在春节可触发", () => {
    const s = createInitialState();
    const ev = EVENTS.find((e) => e.id === "ev_spring_festival")!;
    expect(checkEventConditions(s, ev)).toBe(false); // 8 月不是春节
    s.time.year = 2028;
    s.time.month = 1;
    s.time.day = 26;
    expect(checkEventConditions(s, ev)).toBe(true);
  });

  it("季节事件：落叶捡钱仅秋季公园可触发", () => {
    const s = createInitialState();
    s.locationId = "park";
    const ev = EVENTS.find((e) => e.id === "ev_autumn_leaves")!;
    expect(checkEventConditions(s, ev)).toBe(false); // 夏
    s.time.month = 10; // 秋
    expect(checkEventConditions(s, ev)).toBe(true);
  });

  it("天气事件：中暑事件仅热浪天触发", () => {
    const s = createInitialState();
    s.locationId = "street";
    const ev = EVENTS.find((e) => e.id === "ev_summer_heatstroke")!;
    expect(checkEventConditions(s, ev)).toBe(false); // 晴
    s.weather = { id: "heatwave", lastRollDay: 0 };
    expect(checkEventConditions(s, ev)).toBe(true);
  });
});
