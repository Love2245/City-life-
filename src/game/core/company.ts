import type { GameState } from '../types';
import type { CompanyComputerTier, CompanyEmployee, CompanyLane, CompanyProjectMode, CompanyProjectPlan, CompanyRole, CompanyScale, CompanyState } from '../companyTypes';
import { pushLog } from '../engine';
import { createRng, randomInt } from '../rng';
import { START_EPOCH, fromLinearDay, gameDay, weekdayOf } from './calendar';
import { COMPANY_COMPUTERS, COMPANY_MONTH_MINUTES, COMPANY_RULES as R, COMPANY_SCALES, COMPANY_TOPICS, COMPANY_WORK_BALANCE_VERSION, companyHourlyWork, companyStage, employeeStars } from './companyConfig';
import { companyOfficeHere, companyOverview } from './companyOverview';
import { ensureDevelopmentHistory, recordDevelopmentDelivery } from './developmentHistory';
import { scaleCost } from './difficulty';
import { advanceHours } from './time';
import { companyStaffNamesInUse, nextCompanyStaffName } from './companyStaffNames';
import {COMPANY_WORK_SHIFTS} from './companyConfig';
import {companyEmployeeAtSeat,normalizeCompanyWorkstations} from './companyWorkstations';
import { companyProjectQuote, companyProjectTerms, companyProjectRoyaltyAddition } from './companyProjects';
import { companyEmployeeRequests, companyFairSalary, requestCompanyRaise, requestCompanyLeave, processEmployeeRequests, respondToEmployeeRequest, clearSatisfiedRaise } from './companyPersonnel';
import { performDevelopmentWork } from './developmentWork';
import { createCompanyAccounting, accrueCompanyAccounting, recordCompanyAccounting, companyOwnerFundingAvailable, consumeOwnerFunding,companyFundingPolicy } from './companyAccounting';
import {normalizePersonalDevelopment,personalDevelopmentWorks} from './projects';
import {adoptPersonalCompanyProjects} from './companyPersonalMerge';
import {awardCompanyFounderExperience} from './companyFounderSkills';
import {sendSms} from './phone';
import {payCompanyOwner} from './companyTax';

export type CompanyResult = { ok: boolean; reason?: string };
const fail = (reason: string): CompanyResult => ({ ok: false, reason });
const ok = (): CompanyResult => ({ ok: true });
export const companyMinute = (s: GameState) => gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
const id = (c: CompanyState, prefix: string) => `${prefix}-${++c.sequence}`;
const roundWork = (v: number) => Math.round(v * 1e12) / 1e12;
const fairSalary = companyFairSalary;
function ledger(s: GameState, kind: string, amountCents: number, text: string) {
  const c = s.company!;
  c.ledger.push({ minute: c.cursor, kind, amountCents, text });
  if (c.ledger.length > 200) c.ledger.splice(0, c.ledger.length - 200);
  pushLog(s, '🏢', text);
}
function commandHere(s: GameState): CompanyResult { return companyOfficeHere(s) ? ok() : fail('请到公司办公桌前办理'); }
function municipal(s: GameState): boolean { return s.locationId === 'municipal_hall' && s.time.hour >= 9 && s.time.hour < 18 && !s.work?.active && !s.districtLeisure?.active; }
function spend(s: GameState, amount: number, automatic=false): boolean {
  const c = s.company!, personal = automatic?companyOwnerFundingAvailable(s):Math.max(0, Math.round(s.player.money * 100));
  const available=automatic?c.balanceCents:Math.max(0,c.balanceCents-companyOverview(s)!.reservedCents);
  if (available + personal < amount) return false;
  const fromCompany = Math.min(available, amount);
  c.balanceCents -= fromCompany;
  const fromPersonal = amount - fromCompany;
  if (fromPersonal) { if(automatic)consumeOwnerFunding(s,fromPersonal);else {s.player.money=(Math.round(s.player.money*100)-fromPersonal)/100;recordCompanyAccounting(c,'owner_in',fromPersonal);}ledger(s, 'owner_cover', fromPersonal, `个人现金补足公司支出 ${(fromPersonal / 100).toFixed(2)} 元`); }
  return true;
}
/** 到期项逐笔偿付，已离职员工的债务也保留在同一应付账中。 */
export function settleCompanyDebts(s: GameState): void {
  const c = s.company;
  if (!c) return;
  const stopped = c.liabilities.length > 0;
  for (const d of c.liabilities) {
    const available = c.balanceCents + companyOwnerFundingAvailable(s);
    const paid = Math.min(d.amountCents, available);
    if (!paid) break;
    spend(s, paid,true); d.amountCents -= paid;
    c.spentCents += paid;
    ledger(s, d.kind, -paid, `${d.employeeName ?? c.name}${d.kind === 'rent' ? '支付房租' : d.kind === 'severance' ? '支付离职补偿' : '结清工资'} ${(paid / 100).toFixed(2)} 元`);
  }
  c.liabilities = c.liabilities.filter(d => d.amountCents > 0);
  if (stopped && !c.liabilities.length) ledger(s, 'resume', 0, '公司欠款已清偿，恢复经营');
}
function receive(s: GameState, amount: number, text: string) {
  const c = s.company!;
  c.balanceCents += amount; c.earnedCents += amount;
  recordCompanyAccounting(c,'income',amount);
  ledger(s, 'income', amount, text);
  settleCompanyDebts(s);
}
export type CompanyStartingStage = 1 | 2;
/** Registration accepts both professional development routes and only counts true deliveries. */
export function companyRegistrationGate(s: GameState): { ok: boolean; reason?: string; royaltyWorks?: number; requiredWorks?: number; requiredCashCents?: number } {
  ensureDevelopmentHistory(s);
  const requiredWorks = R.royaltyWorksRequired, royaltyWorks = personalDevelopmentWorks(s);
  if (royaltyWorks < requiredWorks) return { ok: false, royaltyWorks, requiredWorks, reason: `需先交付 ${requiredWorks} 件设计或编程项目（可合计，含现金委托），当前 ${royaltyWorks} 件` };
  return { ok: true, royaltyWorks, requiredWorks };
}
export function registerCompany(s: GameState, rawName: string, startingStage: CompanyStartingStage = 1): CompanyResult {
  if (!municipal(s)) return fail('请在 9—18 点到市政大厅企业窗口办理');
  if (s.company) return fail('一局只能经营一家公司');
  if (startingStage !== 1 && startingStage !== 2) return fail('初始办公场地只能选择大学创业孵化室或写字楼单间');
  ensureDevelopmentHistory(s);
  const worksGate = companyRegistrationGate(s);
  if (!worksGate.ok) return fail(worksGate.reason!);
  const name = rawName.trim();
  if (!name || [...name].length > 20 || /[\x00-\x1f<>]/.test(name)) return fail('公司名称需为 1—20 个有效字符');
  const stage = companyStage(startingStage), fee = stage.rent * 200;
  const startupCents = fee + COMPANY_COMPUTERS.low.price * 100;
  if (Math.round(s.player.money * 100) < startupCents) return fail(`注册需保证金与首月租金 ${fee / 100} 元，并至少留出 ${COMPANY_COMPUTERS.low.price} 元采购一台公司电脑，共 ${startupCents / 100} 元`);
  const now = companyMinute(s), today = gameDay(s.time);
  normalizePersonalDevelopment(s);
  s.player.money = (Math.round(s.player.money * 100) - fee) / 100;
  s.company = { workBalanceVersion: COMPANY_WORK_BALANCE_VERSION, managementVersion: 2, economyVersion:2, status: 'active', growthPoints: 0, recruitmentFloor: 1, rng: createRng(randomInt(s.rng, 1, 0x7fffffff)), name, stage: startingStage, foundedMinute: now, cursor: now, sequence: 0, balanceCents: 0,
    depositCents: stage.rent * 100, nextRentDay: today + 30, nextPayDay: today + 30,
    royaltyCents: 0,
    lastRoyaltyWeek: typeof s.flags.passive_paid_week === 'number' ? s.flags.passive_paid_week : -1,
    maintenance: 0, programming: null, design: null, pending: [], employees: [], computers: [],
    interviewDay: -1, candidates: [], liabilities: [], ledger: [], earnedCents: 0, spentCents: stage.rent * 100 };
  s.flags.programming_royalty_persistent_v1 = true;
  // 仅迁入尚未完成的进度与已获得权益，保留在途个人委托报价。
  const c = s.company;
  c.accounting=createCompanyAccounting(now);
  c.fundingPolicy=companyFundingPolicy(s);
  recordCompanyAccounting(c,'owner_in',fee);
  recordCompanyAccounting(c,'asset_in',fee);
  adoptPersonalCompanyProjects(s);
  // 创业校内通行资格随登记生效，与住房租约分离。
  if (startingStage === 1) s.flags.item_student_pass = true;
  ledger(s, 'owner_deposit', fee, `创始人支付注册资金 ${(fee / 100).toFixed(2)} 元，用于保证金及首月租金`);
  ledger(s, 'registration', -fee, `${name}注册成立，入驻${stage.name}，缴纳保证金与首月租金 ${fee / 100} 元；办公室入口已开放`);
  return ok();
}
export function companyExpansionQuote(s: GameState) {
  const c = s.company;
  if (!c || c.status==='closed' || c.stage >= 4) return null;
  const current = companyStage(c.stage), next = companyStage(c.stage + 1);
  const refundRentCents = Math.round(current.rent * 100 * Math.max(0, Math.min(30, c.nextRentDay - gameDay(s.time))) / 30);
  const refundCents = c.depositCents + refundRentCents;
  return { next, refundRentCents, refundCents, grossCents: next.rent * 200, netCents: next.rent * 200 - refundCents };
}
export function expandCompany(s: GameState): CompanyResult {
  if (!municipal(s)) return fail('请在市政大厅企业窗口申请扩张');
  const c = s.company, quote = companyExpansionQuote(s);
  if (!c || !quote) return fail('当前不能继续扩张');
  if (c.liabilities.length) return fail('请先清偿公司到期欠款');
  if (c.employees.length + 1 < quote.next.requiredPeople) return fail(`总人数需达到 ${quote.next.requiredPeople} 人（含主角）`);
  // 扩张属于主动支出，不能动用已计提工资；还要为新场地留下 1 个月固定成本。
  const available = Math.max(0, c.balanceCents - companyOverview(s)!.reservedCents) + Math.max(0, Math.round(s.player.money * 100));
  const newFixedCents = quote.next.rent * 100 + c.employees.reduce((total, e) => total + e.salaryCents, 0);
  if (available < quote.netCents) return fail(`扩张净支出 ${quote.netCents / 100} 元，需另留足已计提工资`);
  if (available < quote.netCents + newFixedCents) return fail(`扩张后还需预留新场地 1 个月固定成本 ${(newFixedCents / 100).toFixed(2)} 元，当前可动用 ${(available / 100).toFixed(2)} 元`);
  c.balanceCents += quote.refundCents;
  spend(s, quote.grossCents);
  c.stage++; c.depositCents = quote.next.rent * 100; c.nextRentDay = gameDay(s.time) + 30;
  c.spentCents += quote.grossCents - quote.next.rent * 100 - quote.refundRentCents;
  recordCompanyAccounting(c,'asset_out',quote.refundCents);recordCompanyAccounting(c,'asset_in',quote.grossCents);
  ledger(s, 'expansion', -quote.netCents, `搬入${quote.next.name}，退还旧押金和未用租金后净支出 ${(quote.netCents / 100).toFixed(2)} 元`);
  return ok();
}
export function transferCompanyMoney(s: GameState, amountYuan: number, direction: 'deposit' | 'withdraw'): CompanyResult {
  if (!s.company) return fail('尚未成立公司');
  if (!companyOfficeHere(s)&&s.locationId!=='municipal_hall'&&s.company.status!=='closed') return fail('请到公司财务台或市政企业窗口办理');
  const amount = Math.round(amountYuan * 100), c = s.company;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e12) return fail('请输入有效金额');
  if (direction === 'deposit') {
    if (Math.round(s.player.money * 100) < amount) return fail('个人现金不足');
    s.player.money = (Math.round(s.player.money * 100) - amount) / 100; c.balanceCents += amount;
    recordCompanyAccounting(c,'owner_in',amount);
    ledger(s, 'owner_deposit', amount, `个人注资 ${(amount / 100).toFixed(2)} 元`); settleCompanyDebts(s);
  } else {
    if (amount > companyOverview(s)!.withdrawableCents) return fail('提现需预留已计提工资和到期欠款');
    payCompanyOwner(s,amount);
  }
  return ok();
}
export function repayCompanyDebts(s: GameState): CompanyResult {
  if(!s.company)return fail('尚未成立公司');
  if(!companyOfficeHere(s)&&s.locationId!=='municipal_hall'&&s.company.status!=='closed')return fail('请到公司或市政企业窗口办理');
  settleCompanyDebts(s);
  return s.company!.liabilities.length ? fail('已尽力偿付，余额仍不足，请继续注资') : ok();
}
export function buyCompanyComputers(s: GameState, tier: CompanyComputerTier, quantity: number, seatIndex?:number): CompanyResult {
  const c = s.company;
  if (!c) return fail('尚未成立公司');
  if(c.status==='closed')return fail('公司已关停，请先在市政大厅重新租用办公室');
  if (s.locationId !== 'electronics_store' && !(seatIndex!==undefined&&companyOfficeHere(s)) || s.time.hour < 10 || s.time.hour >= 22) return fail('请在 10—22 点通过电子城或公司工位订购电脑');
  if(seatIndex!==undefined&&(!Number.isInteger(seatIndex)||seatIndex<0||seatIndex>=companyStage(c.stage).capacity||quantity!==1))return fail('请选择有效工位，每个工位一次订购一台电脑');
  if (!(tier in COMPANY_COMPUTERS) || !Number.isInteger(quantity) || quantity < 1 || quantity > 16 || c.computers.length + quantity > 64) return fail('采购数量应为 1—16 台，设备库最多 64 台');
  if (c.liabilities.length) return fail('请先清偿到期欠款');
  const unit = scaleCost(s, COMPANY_COMPUTERS[tier].price) * 100, cost = unit * quantity;
  const freeCash = companyOverview(s)!.withdrawableCents + Math.max(0, Math.round(s.player.money * 100));
  if (freeCash < cost) return fail(`采购需要 ${cost / 100} 元，并需预留工资`);
  spend(s, cost);
  recordCompanyAccounting(c,'asset_in',cost);
  normalizeCompanyWorkstations(c);
  if(seatIndex!==undefined)for(const pc of c.computers)if(pc.seatIndex===seatIndex){pc.assignee=null;delete pc.seatIndex;}
  for (let n = 0; n < quantity; n++) c.computers.push({ id: id(c, 'pc'), tier, costCents: unit, assignee:seatIndex===undefined?null:seatIndex===0?'founder':companyEmployeeAtSeat(c,seatIndex)?.id??null,...(seatIndex!==undefined?{seatIndex}:{}) });
  ledger(s, 'equipment', -cost, `采购${COMPANY_COMPUTERS[tier].name} ${quantity} 台，直接送入公司设备库`);
  advanceHours(s, 1);
  return ok();
}
export function assignCompanyComputer(s: GameState, computerId: string, assignee: string | null): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!, pc = c.computers.find(p => p.id === computerId);
  if (!pc || assignee !== null && assignee !== 'founder' && !c.employees.some(e => e.id === assignee)) return fail('设备或人员不存在');
  normalizeCompanyWorkstations(c);
  const seat=assignee==='founder'?0:c.employees.find(e=>e.id===assignee)?.seatIndex;
  for (const p of c.computers) if (p!==pc&&(assignee !== null && p.assignee === assignee||seat!==undefined&&p.seatIndex===seat)){p.assignee = null;delete p.seatIndex;}
  pc.assignee = assignee;if(seat===undefined)delete pc.seatIndex;else pc.seatIndex=seat;
  return ok();
}
export function assignCompanyWorkstationComputer(s:GameState,seatIndex:number,computerId:string):CompanyResult{
  const check=commandHere(s);if(!check.ok)return check;const c=s.company!,pc=c.computers.find(p=>p.id===computerId);
  if(!Number.isInteger(seatIndex)||seatIndex<0||seatIndex>=companyStage(c.stage).capacity||!pc)return fail('请选择有效工位和电脑');
  const assignee=seatIndex===0?'founder':companyEmployeeAtSeat(c,seatIndex)?.id??null;
  if(pc.assignee&&pc.assignee!==assignee)return fail('该电脑正在由其他人使用，请从库存中选择');
  normalizeCompanyWorkstations(c);
  for(const other of c.computers)if(other!==pc&&(other.seatIndex===seatIndex||assignee!==null&&other.assignee===assignee)){other.assignee=null;delete other.seatIndex;}
  pc.assignee=assignee;pc.seatIndex=seatIndex;return ok();
}
export function startCompanyProject(s: GameState, lane: CompanyLane, topic: string, scale: CompanyScale, repeat = false, mode: CompanyProjectMode = lane === 'design' ? 'contract' : 'product'): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!;
  if (!COMPANY_TOPICS[lane]?.includes(topic) || !(scale in COMPANY_SCALES)) return fail('请选择有效题材和规模');
  if (!['product', 'contract'].includes(mode) || lane === 'design' && mode !== 'contract') return fail('请选择自研产品或委托开发');
  if (scale === 'short' && mode !== 'contract') return fail('短单用于委托接单，请先选择委托开发');
  if (c.liabilities.length) return fail('欠款停工中，请先清偿');
  if (COMPANY_SCALES[scale].stage > c.stage) return fail('当前办公室尚未解锁此规模');
  if (c[lane]) return fail('当前项目尚未完成，可先暂停到待恢复列表');
  c[lane] = { id: id(c, 'project'), lane, topic, scale, progress: 0, repeat, mode, quote: companyProjectQuote(lane, topic, scale, mode), paidMilestones: [], paidCents: 0 };
  ledger(s, 'project', 0, `立项：${COMPANY_SCALES[scale].name}${topic}${repeat ? '（连续开发）' : ''}`);
  return ok();
}
export function changeCompanyProject(s: GameState, lane: CompanyLane, action: 'pause' | 'cancel' | 'repeat', projectId?: string): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!;
  if (lane !== 'programming' && lane !== 'design') return fail('无效项目线');
  if (projectId) {
    const index = c.pending.findIndex(p => p.id === projectId && p.lane === lane);
    if (index < 0 || c[lane]) return fail('请先腾出对应项目线');
    c[lane] = c.pending.splice(index, 1)[0]!; return ok();
  }
  if (!c[lane]) return fail('当前没有项目');
  if (action === 'repeat') c[lane]!.repeat = !c[lane]!.repeat;
  else {
    if (action === 'pause') { if (c.pending.length >= 100) return fail('待恢复列表已满'); c.pending.push(c[lane]!); }
    c[lane] = null;
  }
  return ok();
}
/** A future brief never rewrites the signed quote or earned milestones of the current project. */
export function setCompanyNextProject(s: GameState, lane: CompanyLane, plan: CompanyProjectPlan): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!, p = c[lane];
  if (!p) return fail('当前没有项目');
  if (!COMPANY_TOPICS[lane]?.includes(plan.topic) || !(plan.scale in COMPANY_SCALES)
    || !['product','contract'].includes(plan.mode) || lane === 'design' && plan.mode !== 'contract'
    || plan.scale === 'short' && plan.mode !== 'contract') return fail('请选择有效的下一项目类型和规模');
  if (COMPANY_SCALES[plan.scale].stage > c.stage) return fail('当前办公室尚未解锁此规模');
  p.next = { ...plan }; p.repeat = true;
  return ok();
}
export function contributeCompanyWork(s: GameState, role: CompanyRole, points: number): number {
  const c = s.company!;
  if (role === 'idle' || c.liabilities.length) return 0;
  if (role === 'maintenance') {
    const used = Math.max(0, Math.min(points, c.royaltyCents / 100 / R.maintenanceDivisor - c.maintenance));
    c.maintenance = roundWork(c.maintenance + used); return used;
  }
  let remaining = points, used = 0;
  while (remaining > 1e-8 && c[role]) {
    const p = c[role]!, def = companyProjectTerms(p), step = Math.min(remaining, def.work - p.progress);
    p.progress = roundWork(p.progress + step); remaining = roundWork(remaining - step); used += step;
    p.paidMilestones ??= []; p.paidCents ??= 0;
    for (let index=0; index<def.milestones.length; index++) {
      const milestone=def.milestones[index]!;
      if(p.progress+1e-7<milestone.progress || p.paidMilestones.includes(index)) continue;
      p.paidMilestones.push(index);p.paidCents+=milestone.amountCents;
      receive(s,milestone.amountCents,`【${p.topic}】${milestone.progress>=def.work?'交付':'阶段验收'}收款 ${(milestone.amountCents/100).toFixed(2)} 元（${(milestone.progress/def.work*100).toFixed(0)}%）`);
    }
    if (p.progress < def.work - 1e-7) break;
    recordDevelopmentDelivery(s, p.sourceId ?? `company_${role}_${p.topic}`);
    c.growthPoints = (c.growthPoints ?? 0) + def.growthPoints;
    const legacy = p.sourceId ?? (role === 'design' ? 'home_design' : p.topic.includes('游戏') ? 'indie_game' : 'mobile_app');
    s.flags[`project_completed_${legacy}`] = true;
    if (def.royaltyCents > 0) {
      const added = companyProjectRoyaltyAddition(c.royaltyCents, c.stage, p);
      c.royaltyCents += added;
      ledger(s, 'release', 0, `【${p.topic}】公司作品上线，${added ? `新增周版税 ${(added / 100).toFixed(2)} 元` : '版税已封顶，本件不再增加版税'}，累计 ${s.developmentHistory!.total} 件`);
    }
    else ledger(s,'delivery',0,`【${p.topic}】委托已交付，总款 ${(def.priceCents/100).toFixed(2)} 元，累计 ${s.developmentHistory!.total} 件`);
    const next=p.next??{topic:p.topic,scale:p.scale,mode:p.mode??(p.lane==='design'?'contract':'product')};
    const canRepeat=p.repeat&&COMPANY_SCALES[next.scale].stage<=c.stage;
    c[role] = canRepeat ? { id: id(c,'project'),lane:p.lane,topic:next.topic,scale:next.scale,mode:next.mode,repeat:true,progress:0,quote:companyProjectQuote(p.lane,next.topic,next.scale,next.mode),paidMilestones:[],paidCents:0 } : null;
    if(p.repeat&&!canRepeat)ledger(s,'project',0,'原有大项目已交付；当前办公室未开放该规模，连续开发已结束');
  }
  return roundWork(used);
}
export function founderCompanyWork(s: GameState, role: Exclude<CompanyRole, 'idle'>,hours:number=8): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!;
  const shift=COMPANY_WORK_SHIFTS.find(p=>p.hours===hours);if(!shift)return fail('请选择4、8或12小时工作');
  if (!['programming', 'design', 'maintenance'].includes(role)) return fail('请选择开发或维护工作');
  if (s.work?.active || s.districtLeisure?.active) return fail('请先完成当前活动');
  if (c.liabilities.length) return fail('公司欠款停工中');
  const pc = c.computers.find(p => p.assignee === 'founder');
  if (!pc) return fail('请先给主角分配一台公司电脑');
  if (role !== 'maintenance' && !c[role]) return fail('请先在对应项目线立项');
  if (role === 'maintenance' && c.royaltyCents <= 0) return fail('当前没有需要维护的版税作品');
  if (role === 'maintenance' && c.maintenance >= c.royaltyCents / 100 / R.maintenanceDivisor) return fail('本周维护已足额，可以参与新项目');
  const skill = role === 'design' ? s.player.skills.design : s.player.skills.programming;
  processCompany(s);
  const result=performDevelopmentWork(s,{hours,pointsPerHour:companyHourlyWork(skill,pc.tier),
    remaining:()=>role==='maintenance'?Math.max(0,c.royaltyCents/100/R.maintenanceDivisor-c.maintenance):c[role]?c[role]!.repeat?Infinity:companyProjectTerms(c[role]!).work-c[role]!.progress:0,
    contribute:points=>{const used=contributeCompanyWork(s,role,points);awardCompanyFounderExperience(s,role,used);return used;},canContinue:()=>c.status!=='closed'&&!c.liabilities.length&&companyOfficeHere(s)});
  if(!result.ok)return fail(result.reason??'当前无法工作');
  ledger(s,'founder_work',0,`主角${role==='maintenance'?'维护':role==='design'?'设计':'编程'} ${(result.minutes/60).toFixed(2)} 小时，贡献 ${result.points.toFixed(2)} 点；不足整段按实际有效工时结束`);
  return ok();
}
export function interviewCompany(s: GameState): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!, today = gameDay(s.time);
  if (c.interviewDay === today) return ok();
  if (companyOverview(s)!.unlocked === 0) return fail('累计交付 5 件作品后开放面试');
  const usedNames = companyStaffNamesInUse(c);
  c.interviewDay = today;
  c.candidates = Array.from({ length: 3 }, () => {
    const stars = randomInt(c.rng, 1, 5), highest = stars * 2 - randomInt(c.rng, 0, 1), other = randomInt(c.rng, 1, highest), programmingFirst = randomInt(c.rng, 0, 1) === 0;
    const quoteFactor = randomInt(c.rng, 80, 120) / 100;
    const name = nextCompanyStaffName(usedNames);
    return { id: id(c, 'employee'), name, stars,
      programming: programmingFirst ? highest : other, design: programmingFirst ? other : highest,
      quoteFactor, salaryCents: Math.round((R.salaryBase+R.salaryPerSkill*(highest-1))*quoteFactor*100), hired: false };
  });
  ledger(s, 'interview', 0, '今日三名面试候选人已到场，当天可录用多名，不能重新刷新');
  return ok();
}
export function hireCompanyEmployee(s: GameState, candidateId: string,seatIndex?:number): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!, o = companyOverview(s)!, candidate = c.candidates.find(e => e.id === candidateId);
  if (c.interviewDay !== gameDay(s.time) || !candidate || candidate.hired) return fail('此候选人不可录用');
  if (c.employees.length >= o.unlocked) return fail(`每完成${R.deliveriesPerEmployee}个项目解锁一个员工岗位，请先完成更多项目`);
  if (o.people >= o.stage.capacity) return fail('工位已满，请先扩张办公室');
  normalizeCompanyWorkstations(c);
  seatIndex??=Array.from({length:o.stage.capacity-1},(_,i)=>i+1).find(i=>!companyEmployeeAtSeat(c,i));
  if(seatIndex===undefined||!Number.isInteger(seatIndex)||seatIndex<=0||seatIndex>=o.stage.capacity||companyEmployeeAtSeat(c,seatIndex))return fail('请选择空闲员工工位');
  const pc = c.computers.find(p=>!p.assignee&&p.seatIndex===seatIndex)??c.computers.find(p => p.assignee === null&&p.seatIndex===undefined);
  if (!pc) return fail('没有未分配电脑，请到电子城采购');
  candidate.hired = true;
  const today = gameDay(s.time);
  const employee: CompanyEmployee = { ...candidate, role: 'idle', secondaryRole: 'idle', requests: {}, joinedMinute: companyMinute(s), accruedUnits: 0, programmingXp: 0, designXp: 0,
    satisfaction: R.initialSatisfaction, underpaidDays: 0, lastRaiseDay: today - R.raiseCooldown, nextLeaveDay: today + randomInt(c.rng, R.leaveMin, R.leaveMax), leaveDays: [] };
  employee.seatIndex=seatIndex;c.employees.push(employee); pc.assignee = employee.id;pc.seatIndex=seatIndex;
  ledger(s, 'hire', 0, `录用${employee.name}，月薪 ${(employee.salaryCents / 100).toFixed(2)} 元，已分配${COMPANY_COMPUTERS[pc.tier].name}`);
  return ok();
}
export function assignCompanyEmployee(s: GameState, employeeId: string, role: CompanyRole, secondaryRole?: CompanyRole): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const e = s.company!.employees.find(e => e.id === employeeId);
  if (!e || !['programming', 'design', 'maintenance', 'idle'].includes(role) || secondaryRole!==undefined&&!['programming','design','maintenance','idle'].includes(secondaryRole)) return fail('请选择有效人员和工作');
  e.role = role; if(secondaryRole!==undefined)e.secondaryRole=secondaryRole===role?'idle':secondaryRole; return ok();
}
function createWageDebt(c: CompanyState, e: CompanyEmployee, day: number, leaving = false) {
  const cents = leaving ? Math.ceil(e.accruedUnits / COMPANY_MONTH_MINUTES) : Math.floor(e.accruedUnits / COMPANY_MONTH_MINUTES);
  e.accruedUnits = leaving ? 0 : e.accruedUnits - cents * COMPANY_MONTH_MINUTES;
  if (cents) c.liabilities.push({ id: id(c, 'due'), kind: 'salary', amountCents: cents, dueDay: day, employeeId: e.id, employeeName: e.name });
}
function removeEmployee(s: GameState, e: CompanyEmployee, voluntary: boolean) {
  const c = s.company!, today = Math.floor(c.cursor / 1440);
  createWageDebt(c, e, today, true);
  if (!voluntary) c.liabilities.push({ id: id(c, 'due'), kind: 'severance', dueDay: today, amountCents: Math.round(e.salaryCents * R.severanceDays / 30), employeeId: e.id, employeeName: e.name });
  if(!voluntary)recordCompanyAccounting(c,'other_cost',Math.round(e.salaryCents*R.severanceDays/30));
  c.employees = c.employees.filter(p => p.id !== e.id);
  for (const pc of c.computers) if (pc.assignee === e.id) pc.assignee = null;
  ledger(s, 'departure', 0, `${e.name}${voluntary ? '主动离职；未付工资仍保留在公司应付账' : '办理离职，结清工资及 7 日补偿'}`);
  settleCompanyDebts(s);
}
export function dismissCompanyEmployee(s: GameState, employeeId: string): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const c = s.company!, e = c.employees.find(e => e.id === employeeId);
  if (!e) return fail('员工不存在');
  const due = companyOverview(s)!.reservedCents + Math.round(e.salaryCents * R.severanceDays / 30);
  if (c.balanceCents + companyOwnerFundingAvailable(s) < due) return fail('公司资金及自动垫付额度不足以结清工资和 7 日补偿，请先主动注资');
  removeEmployee(s, e, false); return ok();
}
export function respondCompanyRequest(s: GameState, employeeId: string, approve: boolean, kind?:'raise'|'leave'): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const e = s.company!.employees.find(e => e.id === employeeId);
  if (!e) return fail('员工不存在');
  const result=respondToEmployeeRequest(e,approve,gameDay(s.time),kind,text=>ledger(s,'request',0,text));
  return result.ok?ok():fail(result.message);
}
export function raiseCompanySalary(s: GameState, employeeId: string, monthlyYuan: number): CompanyResult {
  const check = commandHere(s); if (!check.ok) return check;
  const e = s.company!.employees.find(e => e.id === employeeId), cents = Math.round(monthlyYuan * 100);
  if (!e || !Number.isSafeInteger(cents) || cents <= e.salaryCents || cents > 1e8) return fail('新月薪应高于现有月薪');
  const fair=fairSalary(e),previous=e.salaryCents;
  const fulfilled=companyEmployeeRequests(e).some(r=>r.kind==='raise'&&cents>=r.salaryCents!) || previous<fair&&cents>=fair;
  const recovery=fulfilled?15:Math.min(15,15*(cents-previous)/Math.max(1,Math.round(fair*.05)));
  e.salaryCents=cents;if(cents>=fair*R.underpaidRatio)e.underpaidDays=0;
  e.satisfaction=Math.min(100,e.satisfaction+recovery);
  clearSatisfiedRaise(e);
  if (e.satisfaction >= R.resignationSatisfaction && e.resignationReason !== 'unpaid') { delete e.resignationDay; delete e.resignationReason; }
  ledger(s, 'raise', 0, `${e.name}月薪调整为 ${(cents / 100).toFixed(2)} 元，从当前时刻起计提`);
  return ok();
}
function personnelNotice(s: GameState, e: CompanyEmployee, text: string, kind='request') {
  ledger(s,kind,0,text);
  sendSms(s,e.name,'👤',`【${s.company!.name}】${text}。请到公司工位查看并作出安排。`,undefined,{conversationId:`company:${s.company!.foundedMinute}:${e.id}`,sentAt:s.company!.cursor});
}
function requestRaise(s: GameState, e: CompanyEmployee, day: number) {
  requestCompanyRaise(e,day,text=>personnelNotice(s,e,text));
}
function experience(s: GameState, e: CompanyEmployee, role: CompanyRole, points: number, day: number) {
  if (points <= 0 || role === 'idle') return;
  const skill = role === 'design' ? 'design' : 'programming', xp = skill === 'design' ? 'designXp' : 'programmingXp';
  e[xp] = roundWork(e[xp] + points * (role === 'maintenance' ? .5 : 1));
  const oldStars = e.stars, oldSkill=e[skill];
  while (e[skill] < 10 && e[xp] >= R.xpBase + e[skill] * R.xpPerLevel) { e[xp] = roundWork(e[xp] - R.xpBase - e[skill] * R.xpPerLevel); e[skill]++; }
  if (e[skill] === 10) e[xp] = 0;
  e.stars = employeeStars(e.programming, e.design);
  if (e.stars > oldStars) { ledger(s, 'growth', 0, `${e.name}成长至 ${e.stars} 星`); requestRaise(s, e, day); }
  else if(e[skill]>oldSkill)requestRaise(s,e,day);
}
function workdaysFrom(day: number, count: number): number[] {
  const result: number[] = [];
  for (let d = day; result.length < count; d++) if (weekdayOf(fromLinearDay(START_EPOCH + d)) < 5) result.push(d);
  return result;
}
function midnight(s: GameState, day: number) {
  const c = s.company!;
  if (c.status!=='closed' && day >= c.nextPayDay) {
    for (const e of c.employees) createWageDebt(c, e, day);
    c.nextPayDay += 30;
  }
  if (c.status!=='closed' && day >= c.nextRentDay) {
    c.liabilities.push({ id: id(c, 'due'), kind: 'rent', amountCents: companyStage(c.stage).rent * 100, dueDay: day });
    c.nextRentDay += 30;
  }
  if (weekdayOf(fromLinearDay(START_EPOCH + day)) === 0) {
    const week = Math.floor((day - 1) / 7);
    if (week > c.lastRoyaltyWeek) {
      const overview = companyOverview(s)!;
      const payout = c.royaltyCents;
      c.royaltyCents = overview.nextRoyaltyCents; c.maintenance = 0; c.lastRoyaltyWeek = week;
      if (payout) receive(s, payout, `公司周版税到账 ${(payout / 100).toFixed(2)} 元，维护覆盖 ${(overview.coverage * 100).toFixed(0)}%，下周版税 ${(c.royaltyCents / 100).toFixed(2)} 元`);
    } else c.maintenance = 0;
  }
  settleCompanyDebts(s);
  for (const e of [...c.employees]) {
    e.leaveDays = e.leaveDays.filter(d => d >= day);
    processEmployeeRequests(e,day,text=>personnelNotice(s,e,text));
    const overdue = c.liabilities.filter(d => d.employeeId === e.id && d.kind === 'salary');
    const overdueDays = overdue.length ? day - Math.min(...overdue.map(d => d.dueDay)) : 0;
    if (overdueDays > 0) e.satisfaction = Math.max(0, e.satisfaction - R.overduePenalty);
    const unhappy=e.satisfaction<R.resignationSatisfaction,unpaidNotice=overdueDays>=R.overdueResignDays-R.noticeDays;
    if(e.resignationDay!==undefined&&day>=e.resignationDay&&(unhappy||overdueDays>=R.overdueResignDays)){removeEmployee(s,e,true);continue;}
    if((unhappy||unpaidNotice)&&e.resignationDay===undefined){
      e.resignationDay=day+R.noticeDays;e.resignationReason=unpaidNotice?'unpaid':'satisfaction';
      const date=fromLinearDay(START_EPOCH+e.resignationDay);
      personnelNotice(s,e,`${e.name}提出离职意向，提前${R.noticeDays}天通知；请在${date.month}月${date.day}日00:00前${unpaidNotice?'结清欠薪':'改善待遇'}，期间仍保留劳动关系和应付工资`,'intention');
    }
    if(!unhappy&&!unpaidNotice){delete e.resignationDay;delete e.resignationReason;}
    e.underpaidDays = e.salaryCents < fairSalary(e) * R.underpaidRatio ? e.underpaidDays + 1 : 0;
    if (e.underpaidDays >= R.raiseCooldown) requestRaise(s, e, day);
    if (day >= e.nextLeaveDay && !companyEmployeeRequests(e).some(r=>r.kind==='leave')) {
      requestCompanyLeave(e,day,workdaysFrom(day+R.noticeDays+1,randomInt(c.rng,1,3)),text=>personnelNotice(s,e,text));
      e.nextLeaveDay = day + randomInt(c.rng, R.leaveMin, R.leaveMax);
    }
  }
}
/** 按整分钟消费持久化游标；每次只处理新经过的时间，拆分行动和读档不改变结算。 */
export function processCompany(s: GameState, onEmployeeWork?: (role: CompanyRole, points: number) => void): void {
  const c = s.company; if (!c) return;
  const target = companyMinute(s);
  if (target < c.cursor) throw new Error('公司时间游标晚于游戏时钟');
  while (c.cursor < target) {
    const minute = c.cursor, day = Math.floor(minute / 1440), clock = ((minute % 1440) + 1440) % 1440;
    accrueCompanyAccounting(c,minute);
    const working = c.status!=='closed' && clock >= R.workStart * 60 && clock < R.workEnd * 60 && weekdayOf(fromLinearDay(START_EPOCH + day)) < 5 && !c.liabilities.length;
    for (const e of c.employees) {
      e.accruedUnits += e.salaryCents;
      if (!working || e.leaveDays.includes(day)) continue;
      const pc = c.computers.find(p => p.assignee === e.id);
      if (!pc) continue;
      let time=1;
      for(const role of [e.role,e.secondaryRole??'idle']) {
        if(time<=1e-8||role==='idle')continue;
        const rate=companyHourlyWork(role==='design'?e.design:e.programming,pc.tier)/60;
        const used=contributeCompanyWork(s,role,rate*time);
        if (used > 0) onEmployeeWork?.(role, used);
        time=Math.max(0,time-used/rate);
        experience(s,e,role,used,day);
      }
    }
    c.cursor++;
    if (c.cursor % 1440 === 0) midnight(s, c.cursor / 1440);
  }
}
