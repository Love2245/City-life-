import type { GameState } from '../types';
import type { CompanyLane, CompanyProject, CompanyRole } from '../companyTypes';
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from './calendar';
import { COMPANY_MONTH_MINUTES, COMPANY_RULES, companyDailyWork, COMPANY_SCALES } from './companyConfig';
import { companyProjectTerms, companyProjectRoyaltyAddition, companyProjectQuote } from './companyProjects';
import { companyOverview } from './companyOverview';

export interface CompanyForecastEvent { minute: number; amountCents: number; kind: string; label: string; conditional: boolean }
export interface CompanyProjectEstimate { completionMinute: number | null; nextPaymentMinute: number | null; nextPaymentCents: number; employeeDailyPoints: number }
export interface CompanyForecastOptions { days?: number; extraMonthlySalaryCents?: number; cashAdjustmentCents?: number; monthlyRentOverrideCents?: number; nextRentDayOverride?: number; includeRepeat?: boolean }
/** 纯预测：只看当前排班、设备和已批准的假期，不动账目、不生成随机数、不替玩家承诺未来手动工作。 */
export function forecastCompanyCash(s: GameState, options: CompanyForecastOptions = {}) {
  const c = s.company, o = companyOverview(s);
  const now = gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
  const horizon = now + Math.max(1, Math.min(90, options.days ?? 30)) * 1440;
  const events: CompanyForecastEvent[] = [], projectEstimates: Partial<Record<CompanyLane, CompanyProjectEstimate>> = {};
  const opening = (c?.balanceCents ?? 0) + (options.cashAdjustmentCents ?? 0);
  if (!c || !o) return { events, projectEstimates, gapMinute: null as number | null, safeGapMinute: null as number | null,
    suggestedWithdrawalCents: 0, mandatoryReservedCents: 0, minimumSafeCashCents: 0, horizonMinute: horizon, assumptions: [] as string[] };
  const active = c.status !== 'closed';
  const append = (minute: number, amountCents: number, kind: string, label: string, conditional = false) => {
    if (minute <= horizon && amountCents) events.push({ minute, amountCents: Math.round(amountCents), kind, label, conditional });
  };
  for (const d of c.liabilities) append(now, -d.amountCents, d.kind, `${d.employeeName ?? '公司'}已到期${d.kind === 'rent' ? '租金' : d.kind === 'severance' ? '补偿' : '工资'}`);
  if (active) {
    const salary = c.employees.reduce((n, e) => n + e.salaryCents, 0) + Math.max(0, options.extraMonthlySalaryCents ?? 0);
    let payrollMinute = Math.max(now, c.nextPayDay * 1440), accruedUnits = c.employees.reduce((n, e) => n + e.accruedUnits, 0), previousPayrollMinute = now;
    while (payrollMinute <= horizon) {
      append(payrollMinute, -Math.ceil((accruedUnits + salary * Math.max(0, payrollMinute - previousPayrollMinute)) / COMPANY_MONTH_MINUTES), 'salary', '已排定发薪（含当前已计提工资）');
      previousPayrollMinute = payrollMinute; payrollMinute += COMPANY_MONTH_MINUTES; accruedUnits = 0;
    }
    for (let rentMinute = Math.max(now, (options.nextRentDayOverride ?? c.nextRentDay) * 1440); rentMinute <= horizon; rentMinute += COMPANY_MONTH_MINUTES)
      append(rentMinute, -(options.monthlyRentOverrideCents ?? o.stage.rent * 100), 'rent', '办公室续租');
  }
  // 可靠基线只计现有作品；维护和新作品的潜在增加另列为条件预计。
  let safePool = c.royaltyCents, firstWeek = true;
  const safeRoyalty = new Map<number, number>();
  for (let day = Math.floor(now / 1440) + 1; day * 1440 <= horizon; day++) {
    if (weekdayOf(fromLinearDay(START_EPOCH + day)) !== 0 || Math.floor((day - 1) / 7) <= c.lastRoyaltyWeek) continue;
    safeRoyalty.set(day * 1440, safePool); append(day * 1440, safePool, 'royalty', '现有作品周版税（保守估计）');
    const coverage = firstWeek ? o.coverage : 0;
    safePool = Math.max(0, safePool - Math.ceil(safePool * COMPANY_RULES.decay * (1 - coverage))); firstWeek = false;
  }
  const projects: Partial<Record<CompanyLane, CompanyProject>> = {};
  for (const lane of ['programming', 'design'] as const) {
    const p = c[lane]; if (!p || !active) continue;
    projects[lane] = { ...p, quote: companyProjectTerms(p), paidMilestones: [...p.paidMilestones ?? []] };
    const next = companyProjectTerms(p).milestones.find((_, index) => !p.paidMilestones?.includes(index));
    projectEstimates[lane] = { completionMinute: null, nextPaymentMinute: null, nextPaymentCents: next?.amountCents ?? 0, employeeDailyPoints: 0 };
  }
  const workers = active ? c.employees.flatMap(e => {
    const pc = c.computers.find(p => p.assignee === e.id);
    return pc ? [{ ...e, pc, leave: new Set(e.leaveDays) }] : [];
  }) : [];
  for (const lane of ['programming', 'design'] as const) if (projectEstimates[lane])
    projectEstimates[lane]!.employeeDailyPoints = workers.reduce((n, e) => n + ((e.role === lane || e.secondaryRole === lane) ? companyDailyWork(lane === 'design' ? e.design : e.programming, e.pc.tier) : 0), 0);
  let plannedPool = c.royaltyCents, maintenance = c.maintenance;
  const simulationEndDay = options.includeRepeat ? Math.ceil(horizon / 1440) : Math.floor(now / 1440) + 180;
  const cashAt = (minute: number) => opening + events.reduce((sum, e) => sum + (e.minute <= minute ? e.amountCents : 0), 0);
  for (let day = Math.floor(now / 1440); day <= simulationEndDay; day++) {
    const weekday = weekdayOf(fromLinearDay(START_EPOCH + day));
    if (day * 1440 > now && weekday === 0 && Math.floor((day - 1) / 7) > c.lastRoyaltyWeek) {
      const baseline = safeRoyalty.get(day * 1440);
      if (baseline !== undefined) append(day * 1440, plannedPool - baseline, 'royalty', '按现有排班维护及新作品预计增加的版税', true);
      const need = plannedPool / 100 / COMPANY_RULES.maintenanceDivisor;
      const coverage = need ? Math.min(1, maintenance / need) : 1;
      plannedPool = Math.max(0, plannedPool - Math.ceil(plannedPool * COMPANY_RULES.decay * (1 - coverage))); maintenance = 0;
    }
    if (active && weekday < 5) for (let hour = COMPANY_RULES.workStart; hour < COMPANY_RULES.workEnd; hour++) {
      const start = Math.max(now, day * 1440 + hour * 60), end = day * 1440 + (hour + 1) * 60;
      if (start >= end || (start <= horizon && cashAt(start) < 0)) continue;
      for (const e of workers) {
        if (e.leave.has(day)) continue;
        let availableMinutes = end - start;
        for (const role of [e.role, e.secondaryRole ?? 'idle'] as CompanyRole[]) {
          if (!availableMinutes || role === 'idle') continue;
          const rate = companyDailyWork(role === 'design' ? e.design : e.programming, e.pc.tier) / 480;
          if (role === 'maintenance') {
            const used = Math.min(availableMinutes * rate, Math.max(0, plannedPool / 100 / COMPANY_RULES.maintenanceDivisor - maintenance));
            maintenance += used; availableMinutes -= used / rate; continue;
          }
          const p = projects[role]; if (!p) continue;
          const terms = companyProjectTerms(p), before = p.progress;
          const used = Math.min(availableMinutes * rate, terms.work - before);
          p.progress += used; availableMinutes -= used / rate;
          for (let index = 0; index < terms.milestones.length; index++) {
            const milestone = terms.milestones[index]!;
            if (p.progress + 1e-7 < milestone.progress || p.paidMilestones!.includes(index)) continue;
            p.paidMilestones!.push(index);
            const minute = Math.min(end, start + Math.ceil(Math.max(0, milestone.progress - before) / rate));
            append(minute, milestone.amountCents, 'project', `${p.topic}阶段验收款`, true);
            const estimate = projectEstimates[role]!;
            if (estimate.nextPaymentMinute === null) estimate.nextPaymentMinute = minute;
          }
          if (p.progress + 1e-7 >= terms.work) {
            projectEstimates[role]!.completionMinute ??= Math.min(end, start + Math.ceil(used / rate));
            if (terms.royaltyCents) plannedPool += companyProjectRoyaltyAddition(plannedPool, c.stage, p);
            const next=p.next??{topic:p.topic,scale:p.scale,mode:p.mode??(p.lane==='design'?'contract':'product')};
            if(options.includeRepeat&&p.repeat&&COMPANY_SCALES[next.scale].stage<=c.stage)projects[role]={id:p.id+'-forecast',lane:p.lane,...next,repeat:true,progress:0,quote:companyProjectQuote(p.lane,next.topic,next.scale,next.mode),paidMilestones:[],paidCents:0};
            else delete projects[role];
          }
        }
      }
    }
    if (day * 1440 > horizon && !projects.programming && !projects.design) break;
  }
  events.sort((a, b) => a.minute - b.minute || Number(a.conditional) - Number(b.conditional));
  let cash = opening, safeCash = opening, minimumSafeCashCents = opening;
  let gapMinute: number | null = cash < 0 ? now : null, safeGapMinute: number | null = safeCash < 0 ? now : null;
  for (let index = 0; index < events.length;) {
    const minute = events[index]!.minute;
    do { const e = events[index++]!; cash += e.amountCents; if (!e.conditional) safeCash += e.amountCents; } while (index < events.length && events[index]!.minute === minute);
    minimumSafeCashCents = Math.min(minimumSafeCashCents, safeCash);
    if (cash < 0 && gapMinute === null) gapMinute = minute;
    if (safeCash < 0 && safeGapMinute === null) safeGapMinute = minute;
  }
  return { events, projectEstimates, gapMinute, safeGapMinute, horizonMinute: horizon, minimumSafeCashCents,
    mandatoryReservedCents: o.reservedCents,
    suggestedWithdrawalCents: Math.max(0, Math.min(opening - o.reservedCents, minimumSafeCashCents)),
    assumptions: [options.includeRepeat?'只计当前员工排班、已批准假期和已安排连续项目；不计未来主角手动工作及未录用人员。':'只计现有员工当前排班与已批准带薪假，不计未来主角手动工作、未录用人员和下一轮连续订单。',
      '收付款与资金缺口检查覆盖未来30日；更远的完工日期最多估计180日，并假设后续经营资金充足。',
      '阶段款须实际达到验收进度才到账，日期为条件预计；建议提款不预支这些款项。',
      '保守版税只使用现有作品，下一周起按无人维护衰减；个人自动垫付款另由设置限制。',
      ...(c.liabilities.length ? ['当前有欠款，预计现金不足时停止开发；假期、待分配和设备不足会降低进度。'] : [])] };
}

