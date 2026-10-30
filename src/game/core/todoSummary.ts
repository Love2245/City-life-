import type { GameState } from '../types';
import { daysUntilNextRent } from './housing';
import { activeQuests, locationName } from './quests';
import { getWorkShift } from './career';
import { getJobDef } from './jobs';
import { activeStoryCards } from './story';
import { gameDay } from './calendar';
import { npcTaskSummary } from './npcTasks';
import { stockObligationsOf } from './stockObligations';
import { companyCommitments } from './companyOverview';

export function todoCommitmentsOf(state: GameState) {
  const commitments: { icon: string; title: string; detail: string; tone?: 'warn' }[] = [];
  const lease = state.living.mode === 'lease' ? state.living.lease : undefined;
  if (lease) {
    const days = daysUntilNextRent(state) ?? 0;
    commitments.push({ icon: '🏠', title: '房租缴纳', detail: `${days === 0 ? '今日续缴' : `${days} 天后续缴`} · 每 30 天 ${lease.rent} 元`, tone: days <= 3 && state.player.money < lease.rent ? 'warn' : undefined });
  }
  for (const debt of stockObligationsOf(state)) commitments.push({ icon: '💳', title: debt.title, detail: debt.detail,
    tone: debt.severity === 'ok' ? undefined : 'warn' });
  commitments.push(...companyCommitments(state));
  return commitments;
}

/** Read-only projection of the phone's commitments and schedule. */
export function todoSummaryOf(state: GameState) {
  const today = gameDay(state.time), job = state.work?.active ? getJobDef(state.work.active.jobId) : getJobDef(state.career.jobId ?? '');
  const shift = job ? getWorkShift(state, job) : undefined;
  const tasks: { id: string; title: string; detail: string; urgent?: boolean }[] = [];
  if (job && shift) {
    const clock = (n: number) => `${String(Math.floor(n % 1440 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    tasks.push({ id: 'work', title: state.work?.active ? `继续${job.name}` : shift.phase === 'rest' ? '今天是休息日' : job.name,
      detail: state.work?.active ? '本班尚未结算' : shift.day === today ? `${clock(shift.startMinute)}—${clock(shift.endMinute)} · ${locationName(job.locationId)}` : shift.label,
      urgent: ['working', 'travel', 'active'].includes(shift.phase) && shift.day === today });
  }
  for (const { act, def } of activeStoryCards(state)) {
    const days = Math.max(0, act.deadlineDay - today);
    tasks.push({ id: `story:${act.cardId}`, title: def.title, detail: days === 0 ? '今天必须处理' : `剩 ${days} 天`, urgent: days <= 2 });
  }
  for (const q of activeQuests(state).filter(q => !q.jobId && ['pending', 'active'].includes(q.status))) {
    if (q.npcTask) {
      const summary = npcTaskSummary(state, q);
      tasks.push({ id: q.id, title: q.title, detail: `${summary.detail} · ${summary.deadlineText}`, urgent: summary.urgent });
      continue;
    }
    const deadline = q.commission ? q.commission.deadlineDay ?? q.commission.startDay + q.commission.days : undefined;
    const days = deadline === undefined ? undefined : Math.max(0, deadline - today);
    tasks.push({ id: q.id, title: q.title, detail: days === undefined ? q.desc ?? '查看手机中的详情' : days === 0 ? '今天是最后期限' : `剩 ${days} 天`, urgent: days !== undefined && days <= 1 });
  }
  return { goals: [], commitments: todoCommitmentsOf(state), tasks };
}
