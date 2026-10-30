import type { GameState } from "../types";
import { gameDay } from "./calendar";

export const TRAINING_CERTIFICATE_MAX_LEVEL = 3;
export const TRAINING_COURSES_FOR_CERTIFICATE = 5;
export const TRAINING_CONSECUTIVE_DAYS_FOR_CERTIFICATE = 3;

export interface TrainingProgress {
  certificateLevel: number;
  nextCertificateLevel: number | null;
  coursesCompleted: number;
  coursesRemaining: number;
  hoursRemaining: number;
  consecutiveDays: number;
  consecutiveDaysRemaining: number;
  completedToday: boolean;
  maxLevel: boolean;
}

function countFlag(state: GameState, key: string): number {
  const value = state.flags?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function certificateLevelOf(state: GameState): number {
  const saved = Math.min(TRAINING_CERTIFICATE_MAX_LEVEL, countFlag(state, "skill_certificate_level"));
  return Math.max(saved, state.flags?.item_training_cert ? 1 : 0);
}

/** The training school advances one credential level per qualifying course cycle. */
export function trainingProgress(state: GameState): TrainingProgress {
  const certificateLevel = certificateLevelOf(state);
  const today = gameDay(state.time);
  const total = countFlag(state, "train_total");
  const cycle = state.flags?.train_cycle_total;
  const hasCycleCounter = typeof cycle === "number" && Number.isFinite(cycle);
  const legacyCertified = certificateLevel > 0 && !hasCycleCounter;
  const coursesCompleted = hasCycleCounter ? countFlag(state, "train_cycle_total") : legacyCertified ? 0 : total;
  const lastDayValue = state.flags?.train_last_day;
  const lastDay = typeof lastDayValue === "number" && Number.isFinite(lastDayValue) ? Math.floor(lastDayValue) : -1;
  const completedToday = state.flags?.[`trained_${today}`] === true;
  const savedStreak = legacyCertified ? 0 : countFlag(state, "train_streak");
  const consecutiveDays = lastDay === today || lastDay === today - 1 ? Math.min(3, savedStreak) : 0;
  const maxLevel = certificateLevel >= TRAINING_CERTIFICATE_MAX_LEVEL;
  const remaining = (target: number, value: number) => Math.max(0, target - value);
  return {
    certificateLevel,
    nextCertificateLevel: maxLevel ? null : certificateLevel + 1,
    coursesCompleted,
    coursesRemaining: remaining(TRAINING_COURSES_FOR_CERTIFICATE, coursesCompleted),
    hoursRemaining: remaining(TRAINING_COURSES_FOR_CERTIFICATE, coursesCompleted) * 2,
    consecutiveDays,
    consecutiveDaysRemaining: remaining(TRAINING_CONSECUTIVE_DAYS_FOR_CERTIFICATE, consecutiveDays),
    completedToday,
    maxLevel,
  };
}

/** A visible progress hint using the exact same persisted counters as course settlement. */
export function trainingProgressLabel(state: GameState): string {
  const progress = trainingProgress(state);
  const status = progress.completedToday ? "今天已上课" : "今天可以上课";
  if (progress.maxLevel) {
    return `技能证书已达 3 级（背包有结业凭证）；${status}。本轮连续 3 天或累计 5 堂（10 小时）结业后领取 200 元。`;
  }
  return `证书 ${progress.certificateLevel}/3 级；第 ${progress.nextCertificateLevel} 级进度 ${progress.coursesCompleted}/5 堂（累计还需 ${progress.coursesRemaining} 堂、${progress.hoursRemaining} 小时），连续上课 ${progress.consecutiveDays}/3 天；${status}。满足连续 3 天或本级累计 5 堂（每堂 2 小时）即可结业。`;
}

/** Older versions stored the qualification flag but did not add a visible certificate item. */
export function normalizeTrainingCertificate(state: GameState): void {
  state.flags ??= {};
  state.inventory ??= {};
  const level = certificateLevelOf(state);
  if (level < 1) return;
  state.flags.item_training_cert = true;
  state.flags.skill_certificate_level = level;
  state.inventory.training_certificate = Math.max(1, state.inventory.training_certificate ?? 0);
}
