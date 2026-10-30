/** 工作日历的纯计算：绝对分钟以 gameDay * 1440 为基准，支持跨午夜班次。 */
import type { GameState, JobDef } from "../types";
import { fromLinearDay, gameDay, START_EPOCH, weekdayOf } from "./calendar";

export function workMinute(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}

export function workDate(day: number): { year: number; month: number; day: number } {
  return fromLinearDay(START_EPOCH + day);
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function isRestDayOf(job: JobDef, weekdayIndex: number): boolean {
  if (job.kind === "day") return false;
  const key = WEEKDAY_KEYS[weekdayIndex];
  return !!key && (job.restDays ?? ["sat"]).includes(key);
}

export function isWorkRestDay(job: JobDef, day: number): boolean {
  const weekday = weekdayOf(workDate(day));
  return isRestDayOf(job, weekday);
}

export function nextWorkDay(job: JobDef, fromDay: number): number {
  let day = Math.floor(fromDay);
  while (isWorkRestDay(job, day)) day++;
  return day;
}

export function standardWorkMinutes(job: JobDef): number {
  if (Number.isFinite(job.duration) && job.duration > 0) return Math.round(job.duration * 60);
  const start = job.startHour ?? 9;
  const end = job.endHour ?? 17;
  return Math.round(((end - start + 24) % 24 || 8) * 60);
}

export function scheduledWorkShift(job: JobDef, day: number): { day: number; startMinute: number; endMinute: number } {
  const startMinute = day * 1440 + Math.round((job.startHour ?? 9) * 60);
  const duration = job.endHour === undefined
    ? standardWorkMinutes(job)
    : Math.round(((job.endHour - (job.startHour ?? 9) + 24) % 24 || 24) * 60);
  return { day, startMinute, endMinute: startMinute + duration };
}

/** 今天的开工时刻未过（含恰好开工）才安排今天；迟到应聘不补造早先的班次。 */
export function firstWorkDay(job: JobDef, nowMinute: number): number {
  const today = Math.floor(nowMinute / 1440);
  const todayShift = scheduledWorkShift(job, today);
  return nextWorkDay(job, todayShift.startMinute >= nowMinute ? today : today + 1);
}

export function workClock(minute: number): string {
  const local = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
}

export function workDateLabel(day: number): string {
  const date = workDate(day);
  return `${date.month}月${date.day}日`;
}
