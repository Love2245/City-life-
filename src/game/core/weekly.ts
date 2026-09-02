/**
 * v1.10 周记统计：每周日晚上睡觉时汇总本周人际关系/收支/工作/目标缺口。
 * 纯逻辑层：只读写 state，不碰 DOM/store；周记视图由 UI 层观察 pending 跳转。
 */
import type { GameState, WeeklyReport, WeeklyState } from "../types";
import { weekdayOf, gameDay } from "./calendar";
import { arcGoalGap } from "./story";
import { settlePassiveIncome } from "./projects";

/** 空周记统计（新档/迁移缺省） */
export function initWeekly(): WeeklyState {
  return { earned: 0, spent: 0, interactions: {}, jobsDone: 0, pending: false, report: null };
}

/** 记账：收入/支出（±amt 均可，内部按正负分桶） */
export function recordMoney(state: GameState, amt: number): void {
  const w = state.weekly;
  if (amt >= 0) w.earned += amt;
  else w.spent += -amt;
}

/** 记账：与 NPC 互动一次 */
export function recordInteraction(state: GameState, npcId: string): void {
  const w = state.weekly;
  w.interactions[npcId] = (w.interactions[npcId] ?? 0) + 1;
}

/** 记账：完成一次工作 */
export function recordJob(state: GameState): void {
  state.weekly.jobsDone += 1;
}

/**
 * 每周日晚上睡觉时调用：把本周累计汇总为 report、置 pending、清零累计。
 * 非周日调用直接返回（不影响累计）。
 */
export function weeklySettlement(state: GameState): void {
  if (weekdayOf(state.time) !== 6) return; // 仅周日
  const w = state.weekly;
  // v1.215 修复：编程周入按「周」去重——同周日多次入睡不再重复发放（原实现每睡一觉发一次，可刷钱）
  const wk = Math.floor(gameDay(state.time) / 7);
  if (state.flags["passive_paid_week"] !== wk) {
    const passive = settlePassiveIncome(state);
    if (passive > 0) recordMoney(state, passive);
    state.flags["passive_paid_week"] = wk;
  }
  const interactions = Object.entries(w.interactions)
    .map(([npcId, count]) => ({ npcId, count }))
    .sort((a, b) => b.count - a.count);
  const report: WeeklyReport = {
    earned: Math.round(w.earned),
    spent: Math.round(w.spent),
    interactions,
    jobsDone: w.jobsDone,
    goalGap: arcGoalGap(state),
  };
  w.report = report;
  w.pending = true;
  w.earned = 0;
  w.spent = 0;
  w.interactions = {};
  w.jobsDone = 0;
}
