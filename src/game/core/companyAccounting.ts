import type { CompanyFundingPolicy, CompanyState } from '../companyTypes';
import type { GameState } from '../types';
import { gameDay } from './calendar';
import { COMPANY_MONTH_MINUTES, companyStage } from './companyConfig';

export interface CompanyAccountingPeriod {
  periodStartMinute: number; endMinute: number; incomeCents: number;
  wageUnits: number; rentUnits: number; otherCostCents: number;
  assetInCents: number; assetOutCents: number; ownerInCents: number; ownerOutCents: number;
}
export interface CompanyAccounting extends Omit<CompanyAccountingPeriod, 'endMinute'> {
  version: 1; cursor: number; periods: CompanyAccountingPeriod[];
}
export type CompanyAccountingKind = 'income' | 'other_cost' | 'asset_in' | 'asset_out' | 'owner_in' | 'owner_out';
export function createCompanyAccounting(minute: number): CompanyAccounting {
  return { version: 1, periodStartMinute: minute, cursor: minute, incomeCents: 0, wageUnits: 0, rentUnits: 0,
    otherCostCents: 0, assetInCents: 0, assetOutCents: 0, ownerInCents: 0, ownerOutCents: 0, periods: [] };
}
function rollPeriod(a: CompanyAccounting) {
  const endMinute = a.periodStartMinute + COMPANY_MONTH_MINUTES;
  const { version: _v, cursor: _c, periods: _p, ...period } = a;
  a.periods.push({ ...period, endMinute }); a.periods = a.periods.slice(-12);
  Object.assign(a, createCompanyAccounting(endMinute), { periods: a.periods });
}
/** 工资和租金在实际占用时间发生；付款只是清偿负债，不再重复计费用。minute 是区间起点。 */
export function accrueCompanyAccounting(c: CompanyState, minute: number, minutes = 1): void {
  const a = c.accounting ??= createCompanyAccounting(minute);
  const end = Math.max(a.cursor, minute + Math.max(0, minutes));
  let cursor = Math.max(a.cursor, minute);
  while (cursor < end) {
    if (cursor >= a.periodStartMinute + COMPANY_MONTH_MINUTES) { rollPeriod(a); continue; }
    const length = Math.min(end, a.periodStartMinute + COMPANY_MONTH_MINUTES) - cursor;
    if (c.status !== 'closed') {
      a.wageUnits += c.employees.reduce((sum, e) => sum + e.salaryCents, 0) * length;
      a.rentUnits += companyStage(c.stage).rent * 100 * length;
    }
    cursor += length; a.cursor = cursor;
  }
  if (a.cursor >= a.periodStartMinute + COMPANY_MONTH_MINUTES) rollPeriod(a);
}
export function recordCompanyAccounting(c: CompanyState, kind: CompanyAccountingKind, amountCents: number): void {
  const a = c.accounting ??= createCompanyAccounting(c.cursor);
  const amount = Math.max(0, Math.round(amountCents));
  const field = { income: 'incomeCents', other_cost: 'otherCostCents', asset_in: 'assetInCents', asset_out: 'assetOutCents', owner_in: 'ownerInCents', owner_out: 'ownerOutCents' }[kind] as 'incomeCents';
  a[field] += amount;
}
export function companyAccountingOverview(c: CompanyState) {
  const a = c.accounting ?? createCompanyAccounting(c.cursor);
  const wageCents = Math.round(a.wageUnits / COMPANY_MONTH_MINUTES), rentCents = Math.round(a.rentUnits / COMPANY_MONTH_MINUTES);
  const expenseCents = wageCents + rentCents + a.otherCostCents;
  return { ...a, wageCents, rentCents, expenseCents, profitCents: a.incomeCents - expenseCents };
}
/** 上一个已结账的 30 天周期结余；没有完整周期时 complete=false；仅供账目回顾，不作为招聘门槛。 */
export function companyLastPeriodProfitCents(c: CompanyState): { complete: boolean; profitCents: number } {
  const periods = (c.accounting ?? createCompanyAccounting(c.cursor)).periods, period = periods[periods.length - 1];
  if (!period) return { complete: false, profitCents: 0 };
  const wageCents = Math.round(period.wageUnits / COMPANY_MONTH_MINUTES), rentCents = Math.round(period.rentUnits / COMPANY_MONTH_MINUTES);
  return { complete: true, profitCents: period.incomeCents - wageCents - rentCents - period.otherCostCents };
}
export function companyFundingPolicy(s: GameState): CompanyFundingPolicy {
  const monthKey = s.time.year * 12 + s.time.month - 1;
  const stored = s.company?.fundingPolicy;
  return stored ? { ...stored, usedCents: stored.monthKey === monthKey ? stored.usedCents : 0, monthKey }
    : { reserveCents: 300_000, monthlyLimitCents: 500_000, usedCents: 0, monthKey, enabled: true };
}
/** 只读：不重置原存档，不动用个人保留额，也不把主动注资计入自动垫付上限。 */
export function companyOwnerFundingAvailable(s: GameState): number {
  if (!s.company) return 0;
  const p = companyFundingPolicy(s);
  return p.enabled ? Math.max(0, Math.min(Math.round(s.player.money * 100) - p.reserveCents,
    p.monthlyLimitCents === null ? Infinity : p.monthlyLimitCents - p.usedCents)) : 0;
}
/** 返回实际已从个人扣除的分。调用者将其用于本次账单，不能再扣一次个人现金。 */
export function consumeOwnerFunding(s: GameState, requestedCents: number): number {
  if (!s.company || !Number.isFinite(requestedCents) || requestedCents <= 0) return 0;
  const amount = Math.min(Math.floor(requestedCents), companyOwnerFundingAvailable(s));
  s.company.fundingPolicy = companyFundingPolicy(s);
  if (amount) {
    s.player.money = (Math.round(s.player.money * 100) - amount) / 100;
    s.company.fundingPolicy.usedCents += amount;
    recordCompanyAccounting(s.company, 'owner_in', amount);
  }
  return amount;
}
export function setCompanyFundingPolicy(s: GameState, values: { reserveCents: number; monthlyLimitCents: number | null; enabled: boolean }) {
  const c = s.company;
  if (!c) return { ok: false, reason: '尚未成立公司' };
  if (!(s.locationId === 'municipal_hall' || s.locationId === companyStage(c.stage).location)) return { ok: false, reason: '请到公司或市政企业窗口调整' };
  if (![values.reserveCents, values.monthlyLimitCents ?? 0].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e12)) return { ok: false, reason: '请输入有效的个人保留额和月度上限' };
  c.fundingPolicy = { ...companyFundingPolicy(s), ...values };
  c.ledger.push({ minute: gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute, kind: 'funding_policy', amountCents: 0, text: '更新个人自动垫付安排' });
  c.ledger = c.ledger.slice(-200);
  return { ok: true };
}
