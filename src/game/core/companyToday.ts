import type { GameState } from '../types';
import { COMPANY_RULES } from './companyConfig';
import { companyMinute, processCompany } from './company';
import { companyProjectTerms } from './companyProjects';
import { weekdayOf } from './calendar';

/** Uses the actual minute settlement on an isolated copy, including secondary work and repeated projects. */
export function forecastCompanyToday(state: GameState) {
  const c = state.company;
  const points = { programming: 0, design: 0, maintenance: 0 };
  const progress = { programming: c?.programming?.progress ?? 0, design: c?.design?.progress ?? 0 };
  const workingDay = weekdayOf(state.time) < 5;
  if (!c || c.status === 'closed' || !workingDay || state.time.hour >= COMPANY_RULES.workEnd)
    return { points, progress, total: 0, workingDay };
  // JSON also accepts the live Svelte proxy; all RNG, messages, wages and logs remain in the copy.
  const preview = JSON.parse(JSON.stringify(state)) as GameState;
  processCompany(preview);
  const start = companyMinute(preview);
  preview.time.hour = COMPANY_RULES.workEnd; preview.time.minute = 0;
  if (companyMinute(preview) > start) processCompany(preview, (role, used) => { if (role !== 'idle') points[role] += used; });
  for (const lane of ['programming','design'] as const) {
    const original = c[lane];
    if (original) progress[lane] = preview.company![lane]?.id === original.id ? preview.company![lane]!.progress : companyProjectTerms(original).work;
  }
  return { points, progress, total: points.programming + points.design, workingDay };
}
