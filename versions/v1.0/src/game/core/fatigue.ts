/**
 * 体力惩罚机制（v0.91）：体力归零后强行高强度活动 → 晕倒。
 * 纯逻辑层。
 * 注意：本模块不 import engine/time（避免 actions → fatigue → engine → time → jobs → fatigue 重环），
 * 晕倒结算 triggerCollapse 由 engine 提供，调用方通过回调传入。
 * - 体力 < 20：UI 层 toast 提示「很累需要休息」（不阻断）
 * - 体力 = 0：再次警告；仍进行锻炼/工作/打游戏 → 晕倒
 */
import type { GameState } from "../types";

/** 体力危险线：低于此值提示休息 */
export const FATIGUE_WARN_THRESHOLD = 20;

/** 体力是否危险（<20） */
export function isFatigued(state: GameState): boolean {
  return state.player.attrs.stamina < FATIGUE_WARN_THRESHOLD;
}

/** 体力是否耗尽（=0） */
export function isStaminaZero(state: GameState): boolean {
  return state.player.attrs.stamina <= 0;
}

/** 医药费：按余额 20% 收取，至少 30 元（展示用） */
export function collapseFee(state: GameState): number {
  return Math.max(30, Math.round(state.player.money * 0.2));
}

/**
 * 高强度活动前检查（锻炼/工作/打游戏调用）：
 * - 体力归零 → 触发晕倒并阻断活动
 * - 否则放行
 * @param triggerCollapse 晕倒结算函数（由调用方从 engine 传入，避免循环依赖）
 */
export function guardCollapse(
  state: GameState,
  why: string,
  triggerCollapse: (s: GameState, reason: string) => void,
): { ok: boolean; reason?: string } {
  if (isStaminaZero(state)) {
    triggerCollapse(state, why);
    return { ok: false, reason: "体力透支晕倒了！" };
  }
  return { ok: true };
}
