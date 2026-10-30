import type { GameState } from '../types';
import type { CompanyEmployee } from '../companyTypes';
import { COMPANY_MONTH_MINUTES, COMPANY_RULES, companyDailyWork, companyStage } from './companyConfig';
import { gameDay } from './calendar';
import { companyEmployeeRequests } from './companyPersonnel';

export function companyOfficeHere(state: GameState): boolean { return !!state.company && state.company.status!=='closed' && state.locationId === companyStage(state.company.stage).location; }
export function accruedSalaryCents(employee: CompanyEmployee): number { return Math.ceil(employee.accruedUnits / COMPANY_MONTH_MINUTES); }
/** 所有界面使用此只读投影，不生成候选人，不推进任何时间。 */
export function companyOverview(state: GameState) {
  const c = state.company;
  if (!c) return null;
  const stage = companyStage(c.stage), debt = c.liabilities.reduce((a, d) => a + d.amountCents, 0);
  const accrued = Math.ceil(c.employees.reduce((a, e) => a + e.accruedUnits, 0) / COMPANY_MONTH_MINUTES);
  const maintenanceNeed = c.royaltyCents / 100 / COMPANY_RULES.maintenanceDivisor;
  const coverage = maintenanceNeed > 0 ? Math.min(1, c.maintenance / maintenanceNeed) : 1;
  const freeComputers = c.computers.filter(p => p.assignee === null).length;
  const completedProjects = state.developmentHistory?.total ?? 0;
  const unlocked = Math.min(COMPANY_RULES.maxEmployees, Math.floor(completedProjects / COMPANY_RULES.deliveriesPerEmployee));
  const today = gameDay(state.time);
  const prepaidRent = c.status==='closed'?0:Math.round(stage.rent * 100 * Math.max(0, Math.min(30, c.nextRentDay - today)) / 30);
  const monthlyPayrollCents = c.employees.reduce((sum, e) => sum + e.salaryCents, 0);
  const monthlyFixedCents = monthlyPayrollCents + (c.status==='closed'?0:stage.rent * 100);
  const royaltyMonthlyCents = Math.round(c.royaltyCents * 30 / 7);
  return { stage, people: c.employees.length + 1, unlocked, freeComputers, accruedCents: accrued, debtCents: debt,
    reservedCents: accrued + debt, withdrawableCents: Math.max(0, c.balanceCents - accrued - debt),
    netAssetsCents: c.balanceCents + c.depositCents + prepaidRent + c.computers.reduce((a, p) => a + p.costCents, 0) - accrued - debt,
    maintenanceNeed, coverage, nextRoyaltyCents: Math.max(0, c.royaltyCents - Math.ceil(c.royaltyCents * COMPANY_RULES.decay * (1 - coverage))),
    stopped: debt > 0, closed: c.status==='closed', requests: c.employees.filter(e => companyEmployeeRequests(e).length || e.resignationDay !== undefined),
    completedProjects, nextEmployeeProjects: unlocked >= COMPANY_RULES.maxEmployees ? 0 : Math.max(0, (unlocked + 1) * COMPANY_RULES.deliveriesPerEmployee - completedProjects),
    monthlyPayrollCents, monthlyFixedCents, royaltyMonthlyCents, royaltyMarginCents: royaltyMonthlyCents - monthlyFixedCents,
  };
}
/** 标准8小时工作日的已分配员工产能，休息/休假另按实际排班执行；不包含主角。 */
export function companyAssignedProduction(state: GameState) {
  const result = { programming: { people: 0, points: 0 }, design: { people: 0, points: 0 }, maintenance: { people: 0, points: 0 } };
  const c = state.company;
  if (!c || c.status==='closed') return result;
  for (const e of c.employees) {
    const pc = c.computers.find(p => p.assignee === e.id);
    if (!pc || e.role === 'idle') continue;
    result[e.role].people++;
    result[e.role].points += companyDailyWork(e.role === 'design' ? e.design : e.programming, pc.tier);
  }
  return result;
}
export function companyCommitments(state: GameState) {
  const c = state.company, o = companyOverview(state);
  if (!c || !o || c.status==='closed') return [];
  return [
    { icon: '🏢', title: '公司房租', detail: `${Math.max(0, c.nextRentDay - gameDay(state.time))} 天后 · ${o.stage.rent} 元／30天`, tone: undefined as 'warn' | undefined },
    { icon: '💼', title: '公司发薪', detail: `${Math.max(0, c.nextPayDay - gameDay(state.time))} 天后 · 已计提 ${(o.accruedCents / 100).toFixed(2)} 元`, tone: undefined as 'warn' | undefined },
    ...(o.debtCents ? [{ icon: '⚠️', title: '公司欠款停工', detail: `待清偿 ${(o.debtCents / 100).toFixed(2)} 元，补齐后复工`, tone: 'warn' as const }] : []),
    ...o.requests.flatMap(e => [
      ...(e.resignationDay!==undefined?[{icon:'👤',title:`${e.name}有离职意向`,detail:'请在补救期内改善待遇',tone:'warn' as const}]:[]),
      ...companyEmployeeRequests(e).map(r=>({icon:'👤',title:`${e.name}${r.kind==='raise'?'申请涨薪':'申请休假'}`,detail:`${Math.max(0,r.deadlineDay-gameDay(state.time))}天内回复，逾期按拒绝处理；点击工位办理`,tone:'warn' as const}))
    ]),
  ];
}
