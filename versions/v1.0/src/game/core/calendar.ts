/**
 * 日历系统（v0.95）：统一「存活天数 / 绝对日 / 季节」判定。
 * 内部时间引擎 year/month/day，统一 30 天月；开局纪元 = 2026-08-01（第 0 天）。
 * - linearDay：年月日线性化为绝对天序号（跨任意纪元通用，可做差值）
 * - gameDay：自开局起的存活天数（开局 = 0；难度 / 成就 / 事件冷却语义）
 * 纯函数，不依赖引擎。
 */
/** 开局年月（v0.95：初始日期从 1年1月1日 改为 2026年8月1日） */
export const START_YEAR = 2026;
export const START_MONTH = 8;

/** 线性化绝对日序号：2026-08-01 → 0 的推广式，任意年月日可比较/做差 */
export function linearDay(t: { year: number; month: number; day: number }): number {
  return t.year * 360 + (t.month - 1) * 30 + (t.day - 1);
}

/** 开局纪元线性日（2026-08-01 = 第 0 天） */
export const START_EPOCH = linearDay({ year: START_YEAR, month: START_MONTH, day: 1 });

/** 自开局起的存活天数（开局 = 0） */
export function gameDay(t: { year: number; month: number; day: number }): number {
  return linearDay(t) - START_EPOCH;
}

/** 线性日反推年月日（30 天月历；迁移换算用） */
export function fromLinearDay(linear: number): { year: number; month: number; day: number } {
  const year = Math.floor(linear / 360);
  const rem = linear % 360;
  const month = Math.floor(rem / 30) + 1;
  const day = (rem % 30) + 1;
  return { year, month, day };
}

export type Season = "spring" | "summer" | "autumn" | "winter";

/** 季节（6-8 夏 / 9-11 秋 / 12-2 冬 / 3-5 春） */
export function seasonOf(month: number): Season {
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  if (month === 12 || month <= 2) return "winter";
  return "spring";
}

/** 季节中文名（UI 用） */
export const SEASON_LABEL: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

// ---- v0.97 星期制度 ----

/** 星期（0=周一 … 6=周日）。开局 2026-08-01 = 周六（真实日历）。 */
export function weekdayOf(t: { year: number; month: number; day: number }): number {
  // linearDay 换算：2026-08-01 的 linearDay ≡ 2 (mod 7)，需映射到周六=5（0=周一）
  return (((linearDay(t) % 7) + 3) % 7 + 7) % 7;
}

export const WEEKDAY_LABEL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 是否周末（周六/周日） */
export function isWeekend(t: { year: number; month: number; day: number }): boolean {
  const w = weekdayOf(t);
  return w === 5 || w === 6;
}

/** 星期中文名（UI 用） */
export function weekdayLabel(t: { year: number; month: number; day: number }): string {
  return WEEKDAY_LABEL[weekdayOf(t)];
}
