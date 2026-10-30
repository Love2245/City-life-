import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { registerCompany, processCompany, transferCompanyMoney, repayCompanyDebts } from '../src/game/core/company';
import { createCompanyAccounting, accrueCompanyAccounting, recordCompanyAccounting, companyAccountingOverview, companyOwnerFundingAvailable, consumeOwnerFunding } from '../src/game/core/companyAccounting';
import { forecastCompanyCash } from '../src/game/core/companyForecast';
import { closeCompany, reopenCompany, downsizeCompany, companyDownsizeQuote, sellCompanyComputer } from '../src/game/core/companyLifecycle';
import { COMPANY_MONTH_MINUTES, companyStage } from '../src/game/core/companyConfig';
import { START_EPOCH, fromLinearDay, gameDay } from '../src/game/core/calendar';
import type { CompanyEmployee } from '../src/game/companyTypes';
import type { GameState } from '../src/game/types';
function fresh(stage: 1 | 2 = 1) {
  const s = createInitialState(1497); s.mode = 'eternal'; s.player.money = 100000;
  s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 }); s.locationId = 'municipal_hall'; s.time.hour = 10;
  expect(registerCompany(s, '资金测试公司', stage).ok).toBe(true); return s;
}
function employee(s: GameState, salaryCents = 200000): CompanyEmployee {
  const e: CompanyEmployee = { id: 'employee-test', name: '员工A', hired: true, programming: 10, design: 10, stars: 5,
    quoteFactor: 1, salaryCents, role: 'design', joinedMinute: s.company!.cursor, accruedUnits: 0, programmingXp: 0, designXp: 0,
    satisfaction: 80, underpaidDays: 0, lastRaiseDay: 0, nextLeaveDay: 999, leaveDays: [] };
  s.company!.employees.push(e); return e;
}
function setMinute(s: GameState, minute: number) {
  Object.assign(s.time, fromLinearDay(START_EPOCH + Math.floor(minute / 1440)), { hour: Math.floor(minute % 1440 / 60), minute: minute % 60 });
}

describe('公司发生制经营账与个人垫付', () => {
  it('工资和租期按分钟计入成本，尚未付款也计费用，资金和资产变动不混入损益', () => {
    const s = fresh(), c = s.company!; employee(s); c.accounting = createCompanyAccounting(c.cursor);
    accrueCompanyAccounting(c, c.cursor, COMPANY_MONTH_MINUTES / 2);
    recordCompanyAccounting(c, 'income', 300000); recordCompanyAccounting(c, 'owner_in', 100000);
    recordCompanyAccounting(c, 'owner_out', 20000); recordCompanyAccounting(c, 'asset_in', 500000);
    const a = companyAccountingOverview(c);
    expect(a.wageCents).toBe(100000); expect(a.rentCents).toBe(40000);
    expect(a.expenseCents).toBe(140000); expect(a.profitCents).toBe(160000);
    expect(a.ownerInCents).toBe(100000); expect(a.assetInCents).toBe(500000);
    const saved = JSON.stringify(c.accounting); accrueCompanyAccounting(c, c.cursor, COMPANY_MONTH_MINUTES / 2);
    expect(JSON.stringify(c.accounting)).toBe(saved);
  });
  it('长推进与分段会计一致，30日归档；调薪只影响之后实际时间', () => {
    const a = fresh(), b = fresh(); employee(a); const eb = employee(b);
    a.company!.accounting = createCompanyAccounting(a.company!.cursor); b.company!.accounting = createCompanyAccounting(b.company!.cursor);
    accrueCompanyAccounting(a.company!, a.company!.cursor, COMPANY_MONTH_MINUTES + 100);
    for (let m = 0; m < COMPANY_MONTH_MINUTES + 100; m += 100) accrueCompanyAccounting(b.company!, b.company!.cursor + m, Math.min(100, COMPANY_MONTH_MINUTES + 100 - m));
    expect(b.company!.accounting).toEqual(a.company!.accounting);
    expect(a.company!.accounting!.periods).toHaveLength(1);
    const before = b.company!.accounting!.wageUnits; eb.salaryCents *= 2;
    accrueCompanyAccounting(b.company!, b.company!.accounting!.cursor, 100);
    expect(b.company!.accounting!.wageUnits - before).toBe(eb.salaryCents * 100);
  });
  it('自动垫付保留生活费、遵守月限，跨月重置；主动注资不占自动额度', () => {
    const s = fresh(); s.player.money = 10000;
    expect(companyOwnerFundingAvailable(s)).toBe(500000);
    expect(consumeOwnerFunding(s, 600000)).toBe(500000); expect(s.player.money).toBe(5000);
    expect(companyOwnerFundingAvailable(s)).toBe(0);
    expect(transferCompanyMoney(s, 100, 'deposit').ok).toBe(true); expect(s.company!.fundingPolicy!.usedCents).toBe(500000);
    s.time.month++; expect(companyOwnerFundingAvailable(s)).toBe(190000);
    expect(consumeOwnerFunding(s, 999999)).toBe(190000); expect(s.player.money).toBe(3000);
  });
  it('离职工资债留存且自动垫付关闭后不能吞掉生活费', () => {
    const s = fresh(); const c = s.company!; c.balanceCents = 0; s.player.money = 8000;
    c.fundingPolicy = { enabled: false, reserveCents: 300000, monthlyLimitCents: 500000, usedCents: 0, monthKey: s.time.year * 12 + s.time.month - 1 };
    c.liabilities.push({ id: 'former-worker', employeeId: 'gone', employeeName: '员工B', kind: 'salary', amountCents: 200000, dueDay: gameDay(s.time) });
    expect(repayCompanyDebts(s).ok).toBe(false); expect(c.liabilities[0]!.amountCents).toBe(200000); expect(s.player.money).toBe(8000);
    expect(closeCompany(s).ok).toBe(true);expect(c.status).toBe('closed');expect(c.liabilities[0]!.amountCents).toBe(40000);expect(s.player.money).toBe(8000);
  });
});
describe('公司按日期预测与周转款留存', () => {
  it('4万元现金，未来工资租金合计1.4万，建议2.6万，不重复扣已计提工资', () => {
    const s = fresh(); const c = s.company!; const e = employee(s, 1200000);
    c.stage = 2; c.balanceCents = 4000000; c.royaltyCents = 0;
    c.nextPayDay = Math.floor(c.cursor / 1440) + 15; c.nextRentDay = c.nextPayDay;
    e.accruedUnits = e.salaryCents * (COMPANY_MONTH_MINUTES - (c.nextPayDay * 1440 - c.cursor));
    const snapshot = JSON.stringify(s), f = forecastCompanyCash(s);
    expect(f.suggestedWithdrawalCents).toBe(2600000); expect(f.safeGapMinute).toBeNull();
    expect(f.events.filter(x => x.kind === 'salary').reduce((n, x) => n - x.amountCents, 0)).toBe(1200000);
    expect(JSON.stringify(s)).toBe(snapshot); expect(forecastCompanyCash(s)).toEqual(f);
  });
  it('月底回款不能抵消月初资金缺口；假设招聘会增加未来工资风险', () => {
    const s = fresh(), c = s.company!; c.balanceCents = 100000; c.nextRentDay = Math.floor(c.cursor / 1440) + 1;
    c.stage = 2; c.royaltyCents = 0;
    const f = forecastCompanyCash(s); expect(f.safeGapMinute).toBe(c.nextRentDay * 1440); expect(f.suggestedWithdrawalCents).toBe(0);
    c.stage = 1; c.nextRentDay += 20; c.balanceCents = 500000;
    expect(forecastCompanyCash(s).safeGapMinute).toBeNull();
    expect(forecastCompanyCash(s, { extraMonthlySalaryCents: 1000000 }).safeGapMinute).not.toBeNull();
  });
  it('旧冻结合同阶段款是条件预计，仅未支付的原9800元尾款被预测；带薪假与无设备影响预计完工', () => {
    const s = fresh(), c = s.company!, e = employee(s); c.balanceCents = 2000000;
    c.stage = 2; c.nextPayDay = c.nextRentDay = Math.floor(c.cursor / 1440) + 30;
    c.computers.push({ id: 'pc', tier: 'high', costCents: 500000, assignee: e.id });
    c.design = { id: 'contract', lane: 'design', topic: '品牌视觉', scale: 'medium', mode: 'contract', quote: {work:400,priceCents:1400000,royaltyCents:0,growthPoints:400,milestones:[{progress:200,amountCents:420000},{progress:400,amountCents:980000}]}, progress: 200, repeat: true, paidMilestones: [0], paidCents: 420000 };
    const f = forecastCompanyCash(s), planned = f.events.filter(x => x.kind === 'project');
    expect(planned).toHaveLength(1); expect(planned[0]!.amountCents).toBe(980000); expect(planned[0]!.conditional).toBe(true);
    const eta = f.projectEstimates.design!.completionMinute!; expect(eta).toBeGreaterThan(c.cursor);
    e.leaveDays = Array.from({ length: 30 }, (_, index) => Math.floor(c.cursor / 1440) + index);
    expect(forecastCompanyCash(s).projectEstimates.design!.completionMinute!).toBeGreaterThan(eta);
    c.computers[0]!.assignee = null; expect(forecastCompanyCash(s).projectEstimates.design!.completionMinute).toBeNull();
  });
});
describe('公司缩小、资产回收和停业恢复', () => {
  it('缩小办公室退押租保留版权/进度/薪日，超出新容量的空置电脑回库存', () => {
    const s = fresh(2), c = s.company!; c.stage = 4; c.depositCents = 1000000; c.royaltyCents = 3000000;
    c.balanceCents = 100000; c.computers.push({ id: 'spare', tier: 'high', costCents: 500000, assignee: null, seatIndex: 15 });
    c.design = { id: 'progress', lane: 'design', topic: '界面设计', scale: 'large', progress: 111, repeat: false };
    const payDay = c.nextPayDay, q = companyDownsizeQuote(s, 1)!;
    expect(q.netCents).toBeLessThan(0); expect(downsizeCompany(s, 1).ok).toBe(true);
    expect(c.stage).toBe(1); expect(c.balanceCents).toBe(100000 - q.netCents); expect(c.royaltyCents).toBe(3000000);
    expect(c.design!.progress).toBe(111); expect(c.nextPayDay).toBe(payDay); expect(c.computers[0]!.seatIndex).toBeUndefined();
    employee(s); employee(s); employee(s); c.stage = 2; expect(downsizeCompany(s, 1).ok).toBe(false);
  });
  it('仅闲置电脑可按真实购入价50%出售，回收是资产变动', () => {
    const s = fresh(), c = s.company!; c.balanceCents = 0;
    c.computers.push({ id: 'pc', tier: 'high', costCents: 515555, assignee: 'founder', seatIndex: 0 });
    expect(sellCompanyComputer(s, 'pc').ok).toBe(false); c.computers[0]!.assignee = null;
    expect(sellCompanyComputer(s, 'pc').ok).toBe(true); expect(c.balanceCents).toBe(257777);
    expect(companyAccountingOverview(c).incomeCents).toBe(0); expect(companyAccountingOverview(c).assetOutCents).toBe(257777);
  });
  it('停业用资产结算员工工资补偿，保留唯一公司、版权和电脑；停业后无租金，再开不重复领版权', () => {
    const s = fresh(), c = s.company!; c.balanceCents = 10000; c.royaltyCents = 500000;
    c.computers.push({ id: 'pc', tier: 'mid', costCents: 150000, assignee: 'founder', seatIndex: 0 });
    employee(s); expect(closeCompany(s).ok).toBe(true);expect(c.employees).toHaveLength(0); expect(s.company).toBe(c); expect(c.status).toBe('closed');
    expect(c.balanceCents).toBe(0); expect(c.royaltyCents).toBe(500000); expect(c.computers[0]!.assignee).toBeNull();
    const stopMinute = c.cursor; setMinute(s, stopMinute + 35 * 1440); processCompany(s);
    expect(c.liabilities).toHaveLength(0); expect(c.balanceCents).toBeGreaterThan(0);
    expect(c.ledger.filter(x=>x.kind==='rent'||x.kind==='salary')).toHaveLength(0);
    expect(forecastCompanyCash(s).events.some(x=>x.kind==='rent'||x.kind==='salary')).toBe(false);
    s.time.hour = 10; processCompany(s); s.career.passiveIncome = 100; const before = c.royaltyCents;
    expect(reopenCompany(s, 2).ok).toBe(true); expect(s.company).toBe(c); expect(c.royaltyCents).toBe(before + 10000);
    expect(s.career.passiveIncome).toBe(0); expect(c.status).toBe('active'); expect(companyStage(c.stage).stage).toBe(2);
    expect(reopenCompany(s, 2).ok).toBe(false);
  });
});
