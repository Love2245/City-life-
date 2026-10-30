import type { GameState } from '../types';
import projects from '../data/projects.json';

/** 不猜测被 200 条日志上限截掉的历史；每种作品取日志和完成标记的可确认下限。 */
export function ensureDevelopmentHistory(state: GameState): void {
  if (state.developmentHistory?.migrated) return;
  const byType: Record<string, number> = {};
  for (const p of projects) {
    if (p.category !== 'programming' && p.category !== 'design') continue;
    const logs = (state.log ?? []).filter(l => l.text.includes(`【${p.name}】`) && /大功告成！|交付一单！/.test(l.text)).length;
    const marked = state.flags[`project_completed_${p.id}`] === true || (p.category === 'programming' && (state.career.projects[p.id] ?? 0) >= (p.maxProgress ?? 100));
    byType[p.id] = Math.max(logs, marked ? 1 : 0);
  }
  state.developmentHistory = { total: Object.values(byType).reduce((a, b) => a + b, 0), byType, migrated: true };
}
export function recordDevelopmentDelivery(state: GameState, type: string): void {
  ensureDevelopmentHistory(state);
  const h = state.developmentHistory!;
  h.total++;
  h.byType[type] = (h.byType[type] ?? 0) + 1;
}
