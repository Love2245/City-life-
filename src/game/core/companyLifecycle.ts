import {companyPayoutQuote,payCompanyOwner} from './companyTax';
import type { GameState } from '../types';
import type { CompanyState } from '../companyTypes';
import { pushLog } from '../engine';
import { gameDay } from './calendar';
import { COMPANY_MONTH_MINUTES, COMPANY_RULES, companyStage } from './companyConfig';
import { companyOverview } from './companyOverview';
import { normalizeCompanyWorkstations } from './companyWorkstations';
import { recordCompanyAccounting } from './companyAccounting';
import { adoptPersonalCompanyProjects } from './companyPersonalMerge';

const fail = (reason: string) => ({ ok: false, reason });
const municipal = (s: GameState) => s.locationId === 'municipal_hall' && s.time.hour >= 9 && s.time.hour < 18 && !s.work?.active && !s.districtLeisure?.active;
function ledger(s: GameState, kind: string, amountCents: number, text: string) {
  const c = s.company!; c.ledger.push({ minute: c.cursor, kind, amountCents, text }); c.ledger = c.ledger.slice(-200); pushLog(s, '🏢', text);
}
/** 主动确认的搬迁/重开支出：公司工资留存不动用；个人补足是本次明确付款，和自动垫付限额分开。 */
function voluntaryPayment(s: GameState, amountCents: number, refundCents = 0): boolean {
  const c = s.company!, reserved = companyOverview(s)!.reservedCents;
  const free = Math.max(0, c.balanceCents + refundCents - reserved);
  const personal = Math.max(0, Math.round(s.player.money * 100));
  if (free + personal < amountCents) return false;
  const owner = Math.max(0, amountCents - free);
  c.balanceCents += refundCents + owner - amountCents;
  if (owner) { s.player.money = (personal - owner) / 100; recordCompanyAccounting(c, 'owner_in', owner); }
  return true;
}
function prepaidRent(s: GameState, c: CompanyState) {
  return c.status === 'closed' ? 0 : Math.round(companyStage(c.stage).rent * 100 * Math.max(0, Math.min(30, c.nextRentDay - gameDay(s.time))) / 30);
}
export function companyDownsizeQuote(s: GameState, targetStage: number) {
  const c = s.company;
  if (!c || c.status === 'closed' || !Number.isInteger(targetStage) || targetStage < 1 || targetStage >= c.stage) return null;
  const target = companyStage(targetStage), refundRentCents = prepaidRent(s, c), refundCents = c.depositCents + refundRentCents;
  const grossCents = target.rent * 200;
  return { target, refundRentCents, refundCents, grossCents, netCents: grossCents - refundCents,
    monthlyDifferenceCents: (target.rent - companyStage(c.stage).rent) * 100,
    fits: c.employees.length + 1 <= target.capacity };
}
export function downsizeCompany(s: GameState, targetStage: number) {
  if (!municipal(s)) return fail('请在 9—18 点到市政企业窗口办理搬迁');
  const c = s.company, q = companyDownsizeQuote(s, targetStage);
  if (!c || !q) return fail('请选择比当前更小的办公室');
  if (!q.fits) return fail(`当前含主角 ${c.employees.length + 1} 人，超过该场地 ${q.target.capacity} 人容量`);
  if (c.liabilities.length) return fail('请先清偿到期欠款再办理退租搬迁');
  if (!voluntaryPayment(s, q.grossCents, q.refundCents)) return fail('搬迁资金不足，已计提工资需要继续留存');
  recordCompanyAccounting(c, 'asset_out', q.refundCents); recordCompanyAccounting(c, 'asset_in', q.grossCents);
  c.stage = targetStage; c.depositCents = q.target.rent * 100; c.nextRentDay = gameDay(s.time) + 30;
  normalizeCompanyWorkstations(c);
  if (targetStage === 1) s.flags.item_student_pass = true;
  ledger(s, 'downsize', -q.netCents, `公司搬入${q.target.name}，净${q.netCents >= 0 ? '支出' : '退回'} ${(Math.abs(q.netCents) / 100).toFixed(2)} 元；原有版权与全部设备保留`);
  return { ok: true };
}
export function sellCompanyComputer(s: GameState, computerId: string) {
  const c = s.company;
  if (!c) return fail('尚未成立公司');
  const allowed = municipal(s) || s.locationId === 'electronics_store' && s.time.hour >= 10 && s.time.hour < 22 || c.status !== 'closed' && s.locationId === companyStage(c.stage).location;
  if (!allowed) return fail('请到公司、电子城或市政企业窗口出售设备');
  const pc = c.computers.find(p => p.id === computerId);
  if (!pc) return fail('设备不存在');
  if (pc.assignee !== null) return fail('请先将使用中的电脑移回库存，再出售');
  const value = Math.floor(pc.costCents * .5);
  c.computers.splice(c.computers.indexOf(pc), 1); c.balanceCents += value;
  recordCompanyAccounting(c, 'asset_out', value);
  ledger(s, 'equipment_sale', value, `闲置电脑按原购入价一半出售，回收 ${(value / 100).toFixed(2)} 元`);
  return { ok: true };
}
export function companyClosureQuote(s: GameState) {
  const c = s.company, o = companyOverview(s); if (!c || !o) return null;
  const refundRentCents = prepaidRent(s, c);
  const accruedCents = c.employees.reduce((sum,e)=>sum+Math.ceil(e.accruedUnits/COMPANY_MONTH_MINUTES),0);
  const severanceCents = c.employees.reduce((sum,e)=>sum+Math.round(e.salaryCents*COMPANY_RULES.severanceDays/30),0);
  const unpaidCents = o.debtCents + accruedCents, settlementCents = unpaidCents + severanceCents;
  const availableCents = c.balanceCents + c.depositCents + refundRentCents;
  const payout=companyPayoutQuote(Math.max(0,availableCents-settlementCents));
  return { refundRentCents, refundDepositCents: c.depositCents, availableCents, severanceCents, settlementCents,
    returnCents:payout.netCents,grossReturnCents:payout.grossCents,taxCents:payout.taxCents,remainingDebtCents: Math.max(0,settlementCents-availableCents),
    unpaidCents, employees: c.employees.length, activeProjects: Number(!!c.programming) + Number(!!c.design) + c.pending.length };
}
export function closeCompany(s: GameState) {
  if (!municipal(s)) return fail('请在 9—18 点到市政企业窗口办理停业');
  const c = s.company, q = companyClosureQuote(s);
  if (!c || !q || c.status === 'closed') return fail('当前公司已经停业或尚未注册');
  const today=gameDay(s.time);
  for(const e of c.employees){
    const wages=Math.ceil(e.accruedUnits/COMPANY_MONTH_MINUTES),severance=Math.round(e.salaryCents*COMPANY_RULES.severanceDays/30);
    if(wages)c.liabilities.push({id:`due-${++c.sequence}`,kind:'salary',amountCents:wages,dueDay:today,employeeId:e.id,employeeName:e.name});
    if(severance)c.liabilities.push({id:`due-${++c.sequence}`,kind:'severance',amountCents:severance,dueDay:today,employeeId:e.id,employeeName:e.name});
    recordCompanyAccounting(c,'other_cost',severance);
    ledger(s,'leave',0,`${e.name}因公司停业离职，已计提工资与${COMPANY_RULES.severanceDays}日补偿纳入清算；未付部分保留应付记录`);
  }
  c.employees=[];
  c.balanceCents+=q.refundDepositCents+q.refundRentCents;
  recordCompanyAccounting(c, 'asset_out', q.refundRentCents + q.refundDepositCents);
  // This confirmed liquidation uses company assets only. Personal living cash is left to the player.
  for(const d of c.liabilities){
    const paid=Math.min(c.balanceCents,d.amountCents);if(!paid)continue;
    c.balanceCents-=paid;d.amountCents-=paid;c.spentCents+=paid;
    ledger(s,d.kind,-paid,`停业清算支付${d.employeeName??'办公室'}${d.kind==='rent'?'租金':d.kind==='severance'?'补偿':'工资'} ${(paid/100).toFixed(2)} 元`);
  }
  c.liabilities=c.liabilities.filter(d=>d.amountCents>0);
  const payout=payCompanyOwner(s,c.balanceCents,'停业剩余资金转出'),returned=payout.netCents;
  c.balanceCents = 0; c.depositCents = 0; c.status = 'closed'; c.programming = c.design = null; c.pending = []; c.candidates = [];
  for (const pc of c.computers) { pc.assignee = null; delete pc.seatIndex; }
  const remaining=c.liabilities.reduce((sum,d)=>sum+d.amountCents,0);
  ledger(s, 'closure', 0, `公司停业，押金、未用租金及余额先清偿应付款，剩余 ${(returned / 100).toFixed(2)} 元税后退回个人；${remaining?`仍欠 ${(remaining/100).toFixed(2)} 元，可用个人接单收入主动注资偿还；`:''}已有版权与电脑库存保留，不再新增工资和租金`);
  return { ok: true };
}
export function reopenCompany(s: GameState, targetStage: number) {
  if (!municipal(s)) return fail('请在 9—18 点到市政企业窗口恢复营业');
  const c = s.company;
  if (!c || c.status !== 'closed') return fail('只有已停业的原公司可以恢复营业');
  if (targetStage !== 1 && targetStage !== 2) return fail('恢复营业可选择孵化室或写字楼单间');
  if (c.employees.length || c.liabilities.length) return fail('原公司人员和欠款尚未结清');
  const office = companyStage(targetStage), fee = office.rent * 200;
  if (!voluntaryPayment(s, fee)) return fail(`恢复营业需保证金与首月租金共 ${fee / 100} 元`);
  recordCompanyAccounting(c, 'asset_in', fee);
  c.status = 'active'; c.stage = targetStage; c.depositCents = office.rent * 100; c.nextRentDay = c.nextPayDay = gameDay(s.time) + 30;
  c.cursor = gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
  adoptPersonalCompanyProjects(s); normalizeCompanyWorkstations(c);
  if (targetStage === 1) s.flags.item_student_pass = true;
  ledger(s, 'reopen', -fee, `原公司恢复营业，入驻${office.name}，支付押金和首月租金 ${fee / 100} 元`);
  return { ok: true };
}

