/**
 * 季节/天气/节假日系统（v0.95）。
 * 纯逻辑层：
 * - 天气每日跨天重掷（rollWeather，按季节加权，走 state.rng 可复现）
 * - 季节由内部月份派生（calendar.seasonOf）
 * - 节假日由 holidays.json 数据驱动（公历节日 + 春节预设表）
 */
import type { GameState, WeatherId } from "../types";
import { seasonOf, gameDay, type Season } from "./calendar";
import { weightedDraw } from "../rng";
import holidayData from "../data/holidays.json";

/** 按季节的天气权重表（夏季热浪/冬季雪与寒潮） */
const SEASON_WEATHER: Record<Season, Array<{ id: WeatherId; weight: number }>> = {
  summer: [
    { id: "sunny", weight: 40 },
    { id: "cloudy", weight: 25 },
    { id: "rain", weight: 20 },
    { id: "heatwave", weight: 15 },
  ],
  autumn: [
    { id: "sunny", weight: 35 },
    { id: "cloudy", weight: 30 },
    { id: "rain", weight: 30 },
    { id: "coldwave", weight: 5 },
  ],
  winter: [
    { id: "sunny", weight: 30 },
    { id: "cloudy", weight: 25 },
    { id: "rain", weight: 10 },
    { id: "snow", weight: 25 },
    { id: "coldwave", weight: 10 },
  ],
  spring: [
    { id: "sunny", weight: 40 },
    { id: "cloudy", weight: 30 },
    { id: "rain", weight: 25 },
    { id: "heatwave", weight: 5 },
  ],
};

export const WEATHER_LABEL: Record<WeatherId, string> = {
  sunny: "☀️ 晴",
  cloudy: "☁️ 多云",
  rain: "🌧️ 雨",
  snow: "❄️ 雪",
  heatwave: "🥵 热浪",
  coldwave: "🥶 寒潮",
};

/** 按当前季节掷天气（跨天挂点：time.ts rollDay） */
export function rollWeather(state: GameState): WeatherId {
  const season = seasonOf(state.time.month);
  const pool = SEASON_WEATHER[season];
  const picked = weightedDraw(state.rng, pool.map((w) => ({ item: w.id, weight: w.weight })));
  return picked ?? "sunny";
}

/** 当前天气 id（未初始化兜底 sunny） */
export function currentWeather(state: GameState): WeatherId {
  return state.weather?.id ?? "sunny";
}

export function currentSeason(state: GameState): Season {
  return seasonOf(state.time.month);
}

/** 是否雨雪（出行减速/淋雨判定） */
export function isRainy(state: GameState): boolean {
  const w = currentWeather(state);
  return w === "rain" || w === "snow";
}

// ---- 节假日 ----

export interface HolidayDef {
  id: string;
  name: string;
  icon: string;
  /** 公历日期（内部月份/日期，30 天月历） */
  date?: { month: number; day: number };
  /** 春节等按年份的预设表（内部年份 → 公历 月/日） */
  byYear?: Record<number, { month: number; day: number }>;
}

const HOLIDAYS: HolidayDef[] = (holidayData as { holidays: HolidayDef[] }).holidays;

/** 当天节假日（无返回 null） */
export function holidayOf(state: GameState): HolidayDef | null {
  const t = state.time;
  for (const h of HOLIDAYS) {
    if (h.date && h.date.month === t.month && h.date.day === t.day) return h;
    if (h.byYear) {
      const d = h.byYear[t.year];
      if (d && d.month === t.month && d.day === t.day) return h;
    }
  }
  return null;
}

/** 节假日事件是否当日生效（rollEvent 前优先注入用） */
export function todayIsHoliday(state: GameState): boolean {
  return holidayOf(state) !== null;
}

/** 游戏内当前天数（供天气 lastRollDay 记录） */
export function todayGameDay(state: GameState): number {
  return gameDay(state.time);
}
