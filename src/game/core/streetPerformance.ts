import type { GameState } from '../types';
import { applyEffects, pushLog } from '../engine';
import { gameDay } from './calendar';
import { fameIncomeMult } from './stats';
import { priceMultiplier } from './difficulty';

/** A performance quote survives saving; admission never grants money. */
export function pendingStreetPerformance(state: GameState) {
  const id = state.flags.street_performance_pending;
  const quote = state.flags.street_performance_quote;
  return typeof id === 'number' && id > 0 && typeof quote === 'number' && Number.isFinite(quote)
    ? { id, quote: Math.max(0, quote) } : undefined;
}

export function streetPerformanceCheck(state: GameState): { ok: boolean; reason?: string } {
  if (pendingStreetPerformance(state)) return { ok: false, reason: '请先完成本次街头演出' };
  const attempts = state.flags.street_performance_day === gameDay(state.time)
    ? Number(state.flags.street_performance_attempts ?? 0) : 0;
  return attempts >= 2 ? { ok: false, reason: '今天已演出两场，观众也需要休息，明天再来吧' } : { ok: true };
}

export function beginStreetPerformance(state: GameState) {
  const day = gameDay(state.time);
  const attempt = state.flags.street_performance_day === day ? Number(state.flags.street_performance_attempts ?? 0) + 1 : 1;
  state.flags.street_performance_day = day;
  state.flags.street_performance_attempts = attempt;
  const id = Number(state.flags.street_performance_sequence ?? 0) + 1;
  state.flags.street_performance_sequence = id;
  state.flags.street_performance_pending = id;
  // A two-hour set should supplement a day's wage. Repeat audiences tip less.
  const reputation = Math.min(35, (state.player.stats.fame + state.player.stats.charm) * .2);
  const quote = Math.round(Math.min(65, (25 + reputation) * fameIncomeMult(state)) * (attempt === 1 ? 1 : .55) * priceMultiplier(state));
  state.flags.street_performance_quote = quote;
  return { id, quote };
}

export function settleStreetPerformance(state: GameState, id: number, score: number) {
  const pending = pendingStreetPerformance(state);
  if (!pending || pending.id !== id) return undefined;
  const ratio = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  const passed = ratio >= .6;
  const money = passed ? Math.round(pending.quote * ratio) : 0;
  delete state.flags.street_performance_pending;
  delete state.flags.street_performance_quote;
  applyEffects(state, { money, ...(passed ? { fame: 1, mood: 3, stress: -3 } : { mood: -2 }) }, '🎤');
  const verdict = passed ? `演出 ${Math.round(ratio * 100)} 分，收到 ¥${money} 打赏。`
    : `演出 ${Math.round(ratio * 100)} 分，未达到 60 分，本场没有打赏；已消耗的演出时间和体力不会退还。`;
  pushLog(state, '🎤', verdict);
  return { money, ratio, verdict };
}
