import type { GameState } from '../types';
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from './calendar';
import { getJobDef } from './jobs';
import { isWorkRestDay, scheduledWorkShift } from './workSchedule';
import { daysUntilNextRent, LEASE_PERIOD_DAYS } from './housing';
import { isRetiredNpcQuest } from './npcTaskAvailability';
import { npcStaffReported, npcStaffResultReadyAt } from './npcStaffTask';
import { activeStoryCards } from './story';
import { MATCH_HOUR, scheduledMatchDay } from './tournament';
import { getTournamentDef } from './catBattle';
import { stockObligationsOf } from './stockObligations';
import { companyEmployeeRequests } from './companyPersonnel';

export type CalendarKind = 'work' | 'task' | 'match' | 'rent' | 'pay' | 'finance';
export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  title: string;
  detail: string;
  /** Absolute game minutes, matching the work/task clock. */
  at: number;
  endAt?: number;
  deadline?: boolean;
  status?: 'done' | 'ongoing';
}
export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = { work: '上班', task: '事项', match: '赛事', rent: '房租', pay: '发薪', finance: '还款' };

export function calendarMonthCells(year: number, month: number) {
  const first = { year, month, day: 1 }, offset = weekdayOf(first), start = gameDay(first) - offset;
  return Array.from({ length: Math.ceil((offset + 30) / 7) * 7 }, (_, i) => {
    const day = start + i, date = fromLinearDay(START_EPOCH + day);
    return { day, date, inMonth: date.year === year && date.month === month };
  });
}

/** Read-only projection: viewing dates never starts work, expires tasks or charges rent. */
export function calendarEventsOf(state: GameState, fromDay: number, toDay: number): CalendarEvent[] {
  const result: CalendarEvent[] = [], today = gameDay(state.time);
  const add = (event: CalendarEvent) => {
    const day = Math.floor(event.at / 1440);
    if (Number.isFinite(event.at) && day >= fromDay && day < toDay) result.push(event);
  };
  const job = state.career.jobId ? getJobDef(state.career.jobId) : undefined;
  const active = state.work?.active;
  if (job?.kind === 'formal') {
    const first = Math.max(today, state.career.nextShiftDay ?? state.career.firstShiftDay ?? state.career.hiredDay ?? today);
    for (let day = Math.max(fromDay, first); day < toDay; day++) {
      if (isWorkRestDay(job, day) || state.flags[`worked_${job.id}_${day}`] || active?.jobId === job.id && active.day === day) continue;
      const shift = scheduledWorkShift(job, day);
      add({ id: `work:${job.id}:${day}`, kind: 'work', title: job.name, detail: '工作排班', at: shift.startMinute, endAt: shift.endMinute });
    }
    const payday = state.career.nextPayDay;
    if (Number.isSafeInteger(payday)) {
      for (let day = payday! + Math.max(0, Math.ceil((fromDay - payday!) / 7)) * 7; day < toDay; day += 7)
        add({ id: `pay:${job.id}:${day}`, kind: 'pay', title: '工资发放', detail: job.name, at: day * 1440 });
    }
  }
  if (active) add({ id: `active:${active.id}`, kind: 'work', title: getJobDef(active.jobId)?.name ?? '当前班次', detail: '本班尚未结算', at: active.startMinute, endAt: active.endMinute, status: 'ongoing' });
  const history = new Set<string>();
  for (const record of state.work?.wageRecords ?? []) {
    if (!['formal', 'day'].includes(record.kind)) continue;
    const key = `${record.jobId}:${record.day}`;
    if (history.has(key)) continue;
    history.add(key);
    const workedJob = getJobDef(record.jobId);
    add({ id: `worked:${key}`, kind: 'work', title: workedJob?.name ?? '已完成的工作', detail: '本班已结算', at: record.day * 1440 + (workedJob?.startHour ?? 9) * 60, status: 'done' });
  }
  const lease = state.living.mode === 'lease' ? state.living.lease : undefined;
  const company = state.company;
  if (company) {
    if (company.status !== 'closed') {
      for (let day = company.nextRentDay; day < toDay; day += 30) add({ id: `company-rent:${day}`, kind: 'rent', title: '公司房租', detail: `${company.name} · 每 30 天续缴`, at: day * 1440, deadline: true });
      for (let day = company.nextPayDay; day < toDay; day += 30) add({ id: `company-pay:${day}`, kind: 'pay', title: '公司员工发薪', detail: `${company.name} · 公司账户优先，个人补足遵循垫付设置`, at: day * 1440, deadline: true });
    }
    for (const debt of company.liabilities) add({ id: `company-debt:${debt.id}`, kind: 'finance', title: debt.kind === 'rent' ? '公司欠租' : `${debt.employeeName}待付工资`, detail: `尚欠 ${(debt.amountCents / 100).toFixed(2)} 元 · 已停工`, at: debt.dueDay * 1440, deadline: true });
    for (const employee of company.employees) {
      for (const request of companyEmployeeRequests(employee)) {
        const title = `${employee.name}${request.kind === 'raise' ? '申请涨薪' : '申请休假'}`;
        add({ id: `company-request:${employee.id}:${request.kind}`, kind: 'task', title, detail: '在该员工的公司工位处理；逾期按拒绝处理', at: Math.max(today, request.day) * 1440, status: 'ongoing' });
        add({ id: `company-request-deadline:${employee.id}:${request.kind}`, kind: 'task', title: `${title}回复截止`, detail: '当日00:00截止；未处理会降低满意度', at: request.deadlineDay * 1440, deadline: true });
      }
      if (employee.resignationDay !== undefined) add({ id: `company-resign:${employee.id}`, kind: 'task', title: `${employee.name}离职补救期`, detail: '提高待遇或结清欠款，改善满意度', at: employee.resignationDay * 1440, deadline: true });
      for (const day of employee.leaveDays) add({ id: `company-leave:${employee.id}:${day}`, kind: 'task', title: `${employee.name}带薪休假`, detail: '当天不推进项目，工资照常计提', at: day * 1440 });
    }
  }
  if (lease) {
    const due = Number.isSafeInteger(lease.nextRentDay) ? lease.nextRentDay! : today + (daysUntilNextRent(state) ?? LEASE_PERIOD_DAYS);
    for (let day = due + Math.max(0, Math.ceil((fromDay - due) / LEASE_PERIOD_DAYS)) * LEASE_PERIOD_DAYS; day < toDay; day += LEASE_PERIOD_DAYS)
      add({ id: `rent:${day}`, kind: 'rent', title: '房租续缴', detail: day === due ? `本期房租 ¥${lease.rent.toLocaleString('zh-CN')}` : '按租约续缴', at: day * 1440, deadline: true });
  }
  for (const debt of stockObligationsOf(state)) {
    if (debt.dueMinute !== undefined) add({ id: `finance:${debt.id}:due`, kind: 'finance', title: '抵押借款到期',
      detail: `当前待还 ¥${(debt.amountCents / 100).toFixed(2)} · 到期先自动还款；可在电脑顺顺花提前还款`, at: debt.dueMinute, deadline: true });
    add({ id: `finance:${debt.id}:deadline`, kind: 'finance', title: debt.kind === 'gap' ? '穿仓欠款宽限截止' : '抵押借款宽限截止',
      detail: `当前待还 ¥${(debt.amountCents / 100).toFixed(2)} · 未结清将处置资产偿债；请到电脑顺顺花还款`, at: debt.deadlineMinute, deadline: true });
  }
  for (const quest of state.quests) {
    if (!['pending', 'active'].includes(quest.status) || quest.jobId || isRetiredNpcQuest(quest)) continue;
    const progress = quest.npcTask;
    if (progress) {
      if (npcStaffReported(progress)) {
        const ready = npcStaffResultReadyAt(progress);
        const available = ready <= today * 1440 + state.time.hour * 60 + state.time.minute;
        add({ id: `task-result:${quest.id}`, kind: 'task', title: quest.title, detail: available ? '约定已完成，可确认后续结果' : '次日起可确认结果', at: Math.max(today * 1440, ready), status: available ? 'ongoing' : undefined });
      } else add({ id: `task:${quest.id}`, kind: 'task', title: quest.title, detail: '最晚交付时间', at: progress.deadlineAt, deadline: true });
    } else if (quest.endHour !== undefined) {
      add({ id: `quest:${quest.id}`, kind: 'task', title: quest.title, detail: quest.desc, at: quest.day * 1440 + quest.endHour * 60, deadline: true });
    }
  }
  for (const { act, def } of activeStoryCards(state))
    add({ id: `story:${act.cardId}`, kind: 'task', title: def.title, detail: '最晚处理时间', at: act.deadlineDay * 1440, deadline: true });
  const entry = state.catTournament?.entry;
  if (entry && !entry.settled) add({ id: `match:${entry.tierId}:${entry.signupDay}`, kind: 'match', title: getTournamentDef(entry.tierId)?.name ?? '已报名赛事', detail: entry.started ? '赛事进行中' : '14:00 开赛，当天结束前入场', at: scheduledMatchDay(entry) * 1440 + MATCH_HOUR * 60, status: entry.started ? 'ongoing' : undefined });
  return result.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function calendarCountdown(event: CalendarEvent, now: number): string {
  if (event.status === 'done') return '已完成';
  if (event.kind === 'task' && event.status === 'ongoing') return '可办理';
  if (event.status === 'ongoing' || event.endAt !== undefined && event.at <= now && event.endAt > now) return '进行中';
  const minutes = Math.ceil(event.at - now);
  if (minutes < 0) return event.deadline ? '已到期' : '已开始';
  if (minutes === 0) return '现在';
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} 天后`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}后`;
  return `${minutes} 分钟后`;
}
