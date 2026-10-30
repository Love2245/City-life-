import type { GameState } from '../types';
import type { CompanyRole } from '../companyTypes';
import { applyEffects, pushLog } from '../engine';
import { COMPANY_RULES } from './companyConfig';

/** Uses the existing two professional skills; progress is saved without adding an attribute bar. */
export function awardCompanyFounderExperience(state: GameState, role: CompanyRole, points: number): void {
  if (role === 'idle' || !(points > 0) || !Number.isFinite(points)) return;
  const skill = role === 'design' ? 'design' : 'programming';
  const key = `company_founder_${skill}_xp`, level = state.player.skills[skill];
  if (level >= 10) { state.flags[key] = 0; return; }
  const saved = Number(state.flags[key] ?? 0);
  let xp = Math.max(0, Number.isFinite(saved) ? saved : 0) + points * (role === 'maintenance' ? .5 : 1), current = level;
  while (current < 10) {
    const required = COMPANY_RULES.xpBase + current * COMPANY_RULES.xpPerLevel;
    if (xp + 1e-7 < required) break;
    xp -= required; current = Math.min(10, current + 1);
  }
  state.flags[key] = current >= 10 ? 0 : Math.round(Math.max(0, xp) * 1e8) / 1e8;
  if (current > level) {
    applyEffects(state, { skills: { [skill]: current - level } });
    pushLog(state, skill === 'design' ? '🎨' : '💻', `实际项目积累使${skill === 'design' ? '设计' : '编程'}提升至 ${current} 级${role === 'maintenance' ? '（维护计入编程）' : ''}`);
  }
}
