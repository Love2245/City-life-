import type { GameState } from '../types';
import { fullShiftWage, getJobDef } from './jobs';
import { gameDay } from './calendar';
import { isWorkRestDay } from './workSchedule';
import { monthlyPropertyIncome } from './propertyPortfolio';
import { permanentResidence } from './residence';
import { nightlyCost } from './housing';
import { salarySummary } from './career';
import { stockDebtBudgetOf } from './stockObligations';
import { companyOverview } from './companyOverview';

/** Read-only forecast of known commitments; discretionary spending stays unestimated. */
export function livingBudgetOf(state: GameState) {
  const job = state.career.jobId ? getJobDef(state.career.jobId) : undefined;
  const today = gameDay(state.time);
  const shifts = job ? Array.from({ length: 30 }, (_, i) => today + i)
    .filter(day => !isWorkRestDay(job, day)).length : 0;
  const salary = job ? fullShiftWage(state, job) * shifts : 0;
  const propertyIncome = monthlyPropertyIncome(state);
  const residence = permanentResidence(state);
  const rent = state.living.mode === 'lease' ? state.living.lease?.rent ?? 0
    : state.living.mode === 'nightly' ? nightlyCost(state, residence.price) * 30 : 0;
  const housingLabel = state.living.mode === 'own' ? '自住房 · 免租'
    : state.living.mode === 'lease' ? '每月房租'
    : state.living.mode === 'nightly' ? '当前住宿 · 30 晚' : '当前免费住宿';
  const housingNote = state.living.mode === 'gov' ? '免费住宿到期后需另作安排。' : '';
  const income = salary + propertyIncome;
  return { company: companyOverview(state), ...stockDebtBudgetOf(state), job: job?.name, employed: !!job, shifts, salary, propertyIncome, income, rent,
    balance: income - rent, housingLabel, housingNote,
    pendingSalary: salarySummary(state).pending,
    weeklyEarned: state.weekly?.earned ?? 0, weeklySpent: state.weekly?.spent ?? 0 };
}
