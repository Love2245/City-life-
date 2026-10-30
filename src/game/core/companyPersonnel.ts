import type { CompanyCandidate, CompanyEmployee, CompanyEmployeeRequest, CompanyState } from '../companyTypes';
import { COMPANY_RULES as R, companyFairSalary as skillSalary } from './companyConfig';
import {fromLinearDay,START_EPOCH} from './calendar';

type RequestKind = CompanyEmployeeRequest['kind'];
type Notify = (text: string) => void;
const dateLabel=(day:number)=>{const date=fromLinearDay(START_EPOCH+day);return `${date.month}月${date.day}日`;};
export interface PersonnelResult { ok: boolean; message: string }

/** Agreed quotation differences remain attached to the person as their skills grow. */
export function companyFairSalary(employee: Pick<CompanyCandidate, 'programming' | 'design' | 'quoteFactor'>): number {
  return skillSalary(Math.max(1, Math.min(10, employee.programming)), Math.max(1, Math.min(10, employee.design)), employee.quoteFactor);
}

function normalizedRequest(request: CompanyEmployee['request']): CompanyEmployeeRequest | undefined {
  if (!request || !['raise', 'leave'].includes(request.kind)) return undefined;
  const day = Number.isFinite(request.day) ? Math.floor(request.day) : 0;
  const leaveDays = request.kind === 'leave' ? [...new Set(request.leaveDays ?? [])].filter(Number.isSafeInteger).sort((a, b) => a - b) : undefined;
  if (request.kind === 'leave' && !leaveDays?.length) return undefined;
  if (request.kind === 'raise' && (!Number.isFinite(request.salaryCents) || request.salaryCents! <= 0)) return undefined;
  const deadlineDay = Number.isSafeInteger(request.deadlineDay) ? request.deadlineDay! : request.kind === 'raise' ? day + 3 : leaveDays![0]! - 1;
  return { kind: request.kind, day, deadlineDay, ...(leaveDays ? { leaveDays } : { salaryCents: Math.round(request.salaryCents!) }), ...(request.reminded ? { reminded: true } : {}) };
}

/** Read-only projection; opening a panel or a calendar never expires an application. */
export function companyEmployeeRequests(employee: CompanyEmployee): CompanyEmployeeRequest[] {
  const slots = employee.requests;
  const requests = slots ? [slots.raise, slots.leave] : [employee.request];
  return requests.map(normalizedRequest).filter((request): request is CompanyEmployeeRequest => !!request)
    .sort((a, b) => a.deadlineDay - b.deadlineDay || a.kind.localeCompare(b.kind));
}

function syncLegacyMirror(employee: CompanyEmployee) {
  const first = companyEmployeeRequests(employee)[0];
  if (first) employee.request = first;
  else delete employee.request;
}

/** Presence of requests, including an empty object, is authoritative over a stale legacy mirror. */
export function normalizeEmployeeRequests(employee: CompanyEmployee, _today: number): void {
  if (employee.requests === undefined) {
    employee.requests = {};
    const legacy = normalizedRequest(employee.request);
    if (legacy) employee.requests[legacy.kind] = legacy;
  } else {
    for (const kind of ['raise', 'leave'] as const) {
      const request = normalizedRequest(employee.requests[kind]);
      if (request && request.kind === kind) employee.requests[kind] = request;
      else delete employee.requests[kind];
    }
  }
  syncLegacyMirror(employee);
}

function reject(employee: CompanyEmployee, request: CompanyEmployeeRequest) {
  employee.satisfaction = Math.max(0, employee.satisfaction - (request.kind === 'raise' ? R.rejectRaise : R.rejectLeave));
  delete employee.requests![request.kind];
}

/** Resolved slots are removed before notifying, so repeat day settlement is idempotent. */
export function processEmployeeRequests(employee: CompanyEmployee, day: number, notify?: Notify): void {
  normalizeEmployeeRequests(employee, day);
  for (const request of companyEmployeeRequests(employee)) {
    const label = request.kind === 'raise' ? '涨薪' : '带薪休假';
    if (day >= request.deadlineDay) {
      reject(employee, request);
      notify?.(`${employee.name}的${label}申请已逾期，按拒绝处理，满意度降低${request.kind === 'raise' ? R.rejectRaise : R.rejectLeave}点`);
    } else if (day >= request.deadlineDay - 1 && !request.reminded) {
      employee.requests![request.kind]!.reminded = true;
      notify?.(`${employee.name}的${label}申请还剩1天处理，逾期将按拒绝处理`);
    }
  }
  syncLegacyMirror(employee);
}

export function requestCompanyRaise(employee: CompanyEmployee, day: number, notify?: Notify): boolean {
  normalizeEmployeeRequests(employee, day);
  const fair = companyFairSalary(employee);
  if (employee.requests!.raise || day - employee.lastRaiseDay < R.raiseCooldown || fair <= employee.salaryCents) return false;
  employee.requests!.raise = { kind: 'raise', day, deadlineDay: day + R.noticeDays, salaryCents: fair };
  employee.lastRaiseDay = day;
  syncLegacyMirror(employee);
  notify?.(`${employee.name}申请调整月薪为${(fair / 100).toFixed(2)}元，提前${R.noticeDays}天通知；请在${dateLabel(day+R.noticeDays)}00:00前回复`);
  return true;
}

export function requestCompanyLeave(employee: CompanyEmployee, day: number, leaveDays: number[], notify?: Notify): boolean {
  normalizeEmployeeRequests(employee, day);
  const dates = [...new Set(leaveDays)].filter(d => Number.isSafeInteger(d) && d >= day + R.noticeDays + 1).sort((a, b) => a - b);
  if (employee.requests!.leave || !dates.length) return false;
  employee.requests!.leave = { kind: 'leave', day, deadlineDay: dates[0]! - 1, leaveDays: dates };
  syncLegacyMirror(employee);
  notify?.(`${employee.name}申请${dates.length}个工作日的带薪假：${dates.map(dateLabel).join('、')}。已至少提前${R.noticeDays}天通知；请在${dateLabel(dates[0]!-1)}00:00前回复`);
  return true;
}

export function clearSatisfiedRaise(employee: CompanyEmployee): void {
  normalizeEmployeeRequests(employee, 0);
  if (employee.requests!.raise && employee.salaryCents >= employee.requests!.raise.salaryCents!) delete employee.requests!.raise;
  syncLegacyMirror(employee);
}

export function respondToEmployeeRequest(employee: CompanyEmployee, approve: boolean, today: number, kind?: RequestKind, notify?: Notify): PersonnelResult {
  processEmployeeRequests(employee, today, notify);
  const request = kind ? employee.requests![kind] : companyEmployeeRequests(employee)[0];
  if (!request) return { ok: false, message: '这项申请已处理或已过期' };
  if (approve) {
    if (request.kind === 'raise') {
      employee.salaryCents = Math.max(employee.salaryCents, request.salaryCents!);
      employee.underpaidDays = 0;
    } else employee.leaveDays = [...new Set([...employee.leaveDays, ...request.leaveDays!.filter(day => day >= today)])].sort((a, b) => a - b);
    employee.satisfaction = Math.min(100, employee.satisfaction + 15);
    delete employee.requests![request.kind];
  } else reject(employee, request);
  if (employee.satisfaction >= R.resignationSatisfaction && employee.resignationReason !== 'unpaid') { delete employee.resignationDay; delete employee.resignationReason; }
  syncLegacyMirror(employee);
  const message = `${employee.name}的${request.kind === 'raise' ? '涨薪' : '休假'}申请已${approve ? '批准' : '拒绝'}`;
  notify?.(message);
  return { ok: true, message };
}

/** 兼容旧调用：只规范申请结构，已签工资、候选报价和应付债务均不重新定价。 */
export function migrateCompensation(company: CompanyState) {
  const summary = { employees: company.employees.length, candidates: company.candidates.length, oldMonthlySalaryCents: 0, newMonthlySalaryCents: 0 };
  for (const employee of company.employees) {
    summary.oldMonthlySalaryCents += employee.salaryCents;
    normalizeEmployeeRequests(employee, 0);
    summary.newMonthlySalaryCents += employee.salaryCents;
  }
  return summary;
}
