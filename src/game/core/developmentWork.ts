import type { GameState } from '../types';
import { applyEffects } from '../engine';
import { gameDay } from './calendar';
import { advanceHours } from './time';

const VERSION = 'development_work_v2_migrated';
const DAY = 'development_work_v2_day';
const MINUTES = 'development_work_v2_minutes';
const LEARNING = 'development_work_v2_learning_minutes';
export const DEVELOPMENT_NORMAL_MINUTES = 480;
export const DEVELOPMENT_MAX_MINUTES = 720;
const round = (n: number) => Math.round(n * 1e10) / 1e10;

export interface DevelopmentCosts { stamina: number; health: number; mood: number; stress: number }
export interface DevelopmentWorkBudget { day: number; usedMinutes: number; remainingMinutes: number; normalMinutesRemaining: number }
export interface DevelopmentWorkPreview extends DevelopmentWorkBudget {
  ok: boolean; reason?: string; minutes: number; points: number; costs: DevelopmentCosts;
}
export interface DevelopmentWorkResult {
  ok: boolean; reason?: string; minutes: number; points: number; costs: DevelopmentCosts; elapsedHours: number; crossedDay: boolean;
}
const emptyCosts = (): DevelopmentCosts => ({ stamina: 0, health: 0, mood: 0, stress: 0 });

/** Read-only, including the conservative interpretation of an unmigrated once-per-day save. */
export function developmentWorkBudget(state: GameState): DevelopmentWorkBudget {
  const day = gameDay(state.time);
  const legacy = state.flags[VERSION] !== true && state.flags.dev_work_day === day;
  const stored = state.flags[DAY] === day ? Number(state.flags[MINUTES]) : 0;
  const usedMinutes = Math.min(DEVELOPMENT_MAX_MINUTES, Math.max(legacy ? 480 : 0, Number.isFinite(stored) ? Math.floor(stored) : 0));
  return { day, usedMinutes, remainingMinutes: DEVELOPMENT_MAX_MINUTES - usedMinutes, normalMinutesRemaining: Math.max(0, DEVELOPMENT_NORMAL_MINUTES - usedMinutes) };
}

/** Only load/command paths call this. Merely opening a preview cannot modify a save. */
export function normalizeDevelopmentWork(state: GameState): void {
  if (state.flags[VERSION] === true) return;
  const budget = developmentWorkBudget(state);
  state.flags[DAY] = budget.day;
  state.flags[MINUTES] = budget.usedMinutes;
  state.flags[VERSION] = true;
}

function cumulativeCosts(minutes: number): DevelopmentCosts {
  const normal = Math.min(480, minutes), overtime = Math.max(0, minutes - 480);
  return { stamina: round(normal * 28 / 480 + overtime * 20 / 240), health: round(normal * 2 / 480 + overtime * 3 / 240), mood: round(normal * 4 / 480 + overtime * 6 / 240), stress: round(normal * 8 / 480 + overtime * 10 / 240) };
}
function costsBetween(from: number, to: number): DevelopmentCosts {
  // Rounded cumulative differences match the individual minutes, including overtime.
  const before = cumulativeCosts(from), after = cumulativeCosts(to);
  return { stamina: round(after.stamina - before.stamina), health: round(after.health - before.health), mood: round(after.mood - before.mood), stress: round(after.stress - before.stress) };
}
function minuteCosts(usedMinutes: number): DevelopmentCosts { return costsBetween(usedMinutes, usedMinutes + 1); }
function addCosts(total: DevelopmentCosts, cost: DevelopmentCosts): void {
  for (const key of ['stamina', 'health', 'mood', 'stress'] as const) total[key] = round(total[key] + cost[key]);
}

/** hours is a maximum duration. A finished task and the actual daily allowance can shorten it. */
export function previewDevelopmentWork(state: GameState, options: { hours: number; pointsPerHour: number; remainingPoints: number }): DevelopmentWorkPreview {
  const budget = developmentWorkBudget(state), costs = emptyCosts();
  const result: DevelopmentWorkPreview = { ...budget, ok: false, minutes: 0, points: 0, costs };
  if (![4, 8, 12].includes(options.hours)) return { ...result, reason: '请选择最多工作4、8或12小时' };
  if (!(options.pointsPerHour > 0) || !Number.isFinite(options.pointsPerHour)) return { ...result, reason: '当前没有可用的开发效率' };
  if (!(options.remainingPoints > 1e-8)) return { ...result, reason: '当前工作已完成，请重新安排任务' };
  if (!budget.remainingMinutes) return { ...result, reason: '今天已累计工作12小时，请明天继续' };
  const rate = options.pointsPerHour / 60;
  let used = budget.usedMinutes, clock = state.time.hour * 60 + state.time.minute;
  const requested = Math.min(options.hours * 60, Math.ceil((options.remainingPoints - 1e-8) / rate));
  // A work preview may be computed many times while the computer window redraws.
  // Costs telescope over each day; the actual command still advances each minute.
  while (result.minutes < requested && used < DEVELOPMENT_MAX_MINUTES) {
    const untilMidnight = Number.isInteger(clock) && clock >= 0 && clock < 1440 ? 1440 - clock : Infinity;
    const span = Math.min(requested - result.minutes, DEVELOPMENT_MAX_MINUTES - used, untilMidnight);
    addCosts(costs, costsBetween(used, used + span));
    result.minutes += span;
    used += span;
    clock += span;
    if (clock === 1440) { clock = 0; used = 0; }
  }
  result.points = round(Math.min(options.remainingPoints, result.minutes * rate));
  result.ok = result.minutes > 0 && state.player.attrs.stamina + 1e-7 >= costs.stamina;
  if (!result.ok) result.reason = `本次有效工作需要${Number(costs.stamina.toFixed(2))}点体力，请先休息或缩短安排`;
  return result;
}

/**
 * Contributions, costs and calendar settlement advance together, one effective minute at a time.
 * contribute returns actual accepted work; remaining returns 0 after a non-continuous task ends.
 * Callers must not apply the body costs or advance game time a second time.
 */
export function performDevelopmentWork(state: GameState, options: {
  hours: number; pointsPerHour: number; remaining: () => number;
  contribute: (points: number) => number; canContinue?: () => boolean;
}): DevelopmentWorkResult {
  const preview = previewDevelopmentWork(state, { ...options, remainingPoints: options.remaining() });
  const result: DevelopmentWorkResult = { ok: false, reason: preview.reason, minutes: 0, points: 0, costs: emptyCosts(), elapsedHours: 0, crossedDay: false };
  if (!preview.ok) return result;
  normalizeDevelopmentWork(state);
  const initialDay = gameDay(state.time), rate = options.pointsPerHour / 60;
  for (let minute = 0; minute < preview.minutes; minute++) {
    const budget = developmentWorkBudget(state), remaining = options.remaining();
    if (!budget.remainingMinutes || remaining <= 1e-8 || options.canContinue?.() === false || state.endingId === 'ending_financial_default') break;
    const cost = minuteCosts(budget.usedMinutes);
    if (state.player.attrs.stamina + 1e-7 < cost.stamina) { result.reason = '体力不足，已结束本次工作'; break; }
    const accepted = Math.max(0, Math.min(rate, remaining, options.contribute(Math.min(rate, remaining))));
    if (!(accepted > 0)) break;
    // Body changes stay smooth; growth is awarded per 8 actual hours, never per click.
    for (const key of ['stamina', 'health', 'mood'] as const) state.player.attrs[key] = round(Math.max(0, state.player.attrs[key] - cost[key]));
    state.player.stress = round(Math.min(100, state.player.stress + cost.stress));
    addCosts(result.costs, cost);
    state.flags[DAY] = budget.day;
    state.flags[MINUTES] = budget.usedMinutes + 1;
    const learning = Number(state.flags[LEARNING] ?? 0) + 1;
    state.flags[LEARNING] = learning % 480;
    if (learning >= 480) applyEffects(state, { intelligence: Math.floor(learning / 480) });
    result.points = round(result.points + accepted);
    result.minutes++;
    advanceHours(state, 1 / 60);
  }
  result.ok = result.minutes > 0;
  result.elapsedHours = result.minutes / 60;
  result.crossedDay = gameDay(state.time) !== initialDay;
  if (result.ok && result.reason === preview.reason) delete result.reason;
  return result;
}
