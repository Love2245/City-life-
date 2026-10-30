import type { GameState } from '../types';
import { gameDay } from './calendar';
import { ensureDevelopmentHistory } from './developmentHistory';
import { companyStage, COMPANY_SCALES, COMPANY_COMPUTERS, COMPANY_LEGACY_WORK, COMPANY_WORK_BALANCE_VERSION, COMPANY_MANAGEMENT_VERSION,COMPANY_LEGACY_ECONOMY,DEVELOPMENT_ECONOMY_VERSION } from './companyConfig';
import { residenceLocationId, residenceRegion } from './residence';
import { pushLog } from '../engine';
import { ensureRngState } from '../rng';
import { activeOwnedProperty } from './propertyPortfolio';
import { normalizeCompanyStaffNames } from './companyStaffNames';
import {normalizeCompanyWorkstations} from './companyWorkstations';
import {companyProjectTerms} from './companyProjects';
import {normalizeEmployeeRequests} from './companyPersonnel';
import {createCompanyAccounting,companyFundingPolicy} from './companyAccounting';

/** v36 仅撤销孵化室租住身份；家具、宠物、产权、通行证均不动。 */
export function normalizeCompanySave(s: GameState): void {
  ensureDevelopmentHistory(s);
  s.company ??= null;
  if (s.flags.company_incubator_office_v36 !== true) {
    const lease = s.living.lease;
    if (lease?.housingId === 'dev_incubator') {
      const remaining = Math.max(0, Math.min(30, (lease.nextRentDay ?? gameDay(s.time) + 30) - gameDay(s.time)));
      const refund = Math.round(lease.rent * 100 * remaining / 30) / 100;
      s.player.money = Math.round((s.player.money + refund) * 100) / 100;
      s.living.lease = null;
      s.flags.item_student_pass = true;
      const owned = activeOwnedProperty(s);
      if (owned) { s.living.mode = 'own'; s.living.ownedId = owned.housingId; s.living.activePropertyId = owned.id; }
      else { s.living.mode = 'gov'; s.living.govDaysLeft = 7; }
      s.living.nightly = null; s.living.awayNight = null;
      if (s.locationId === 'dev_incubator' || s.locationId === 'home') {
        s.locationId = residenceLocationId(s); s.region = residenceRegion(s); s.area = s.region;
      }
      pushLog(s, '🏢', `创业孵化基地转为纯办公，未用租金退还 ${refund.toFixed(2)} 元${s.living.mode === 'gov' ? '，已安排一次 7 晚免费过渡住宿，请自行选择新住所' : '，已返回自有住所'}`);
    }
    s.flags.company_incubator_office_v36 = true;
  }
  const h = s.developmentHistory!;
  if (!Number.isSafeInteger(h.total) || h.total < 0 || !h.byType || Object.values(h.byType).some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('累计交付记录损坏');
  const c = s.company;
  if (!c) return;
  const bad = (): never => { throw new Error('公司经营存档损坏，已停止载入以保留原账目'); };
  const integer = (v: number, min = 0) => Number.isSafeInteger(v) && v >= min;
  const finite = (v: number) => Number.isFinite(v) && v >= 0;
  const legacyWork = c.workBalanceVersion === undefined;
  if (!legacyWork && c.workBalanceVersion !== COMPANY_WORK_BALANCE_VERSION) bad();
  if (!c.rng || !integer(c.rng.seed) || !integer(c.rng.calls)) bad();
  ensureRngState(c.rng);
  if (![1, 2, 3, 4].includes(c.stage) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40 ||
    !integer(c.cursor) || c.cursor > gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute ||
    !integer(c.foundedMinute) || c.cursor < c.foundedMinute || !integer(c.sequence) || !integer(c.balanceCents) ||
    !integer(c.depositCents) || !integer(c.nextRentDay) || !integer(c.nextPayDay) || !integer(c.royaltyCents) ||
    c.royaltyCents > 1e12 || !finite(c.maintenance) || !integer(c.lastRoyaltyWeek, -1) ||
    !integer(c.earnedCents) || !integer(c.spentCents) || !integer(c.interviewDay, -1)) bad();
  if (!Array.isArray(c.employees) || c.employees.length > 15 || c.employees.length + 1 > companyStage(c.stage).capacity ||
    !Array.isArray(c.computers) || c.computers.length > 64 || !Array.isArray(c.candidates) || c.candidates.length > 3 ||
    !Array.isArray(c.pending) || c.pending.length > 100 || !Array.isArray(c.liabilities) || !Array.isArray(c.ledger) || c.ledger.length > 200) bad();
  const ids = new Set<string>();
  const unique = (v: string) => { if (typeof v !== 'string' || !v || ids.has(v)) bad(); ids.add(v); };
  const candidate = (e: typeof c.candidates[number]) => {
    if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || !integer(e.stars, 1) || e.stars > 5 ||
      !integer(e.programming, 1) || e.programming > 10 || !integer(e.design, 1) || e.design > 10 ||
      !finite(e.quoteFactor) || e.quoteFactor < .8 || e.quoteFactor > 1.2 || !integer(e.salaryCents, 1) || typeof e.hired !== 'boolean') bad();
  };
  for (const e of c.employees) {
    candidate(e); unique(e.id);
    if (!['programming', 'design', 'maintenance', 'idle'].includes(e.role) || !integer(e.accruedUnits) ||
      !integer(e.joinedMinute) || e.joinedMinute > c.cursor || !finite(e.programmingXp) || !finite(e.designXp) ||
      !finite(e.satisfaction) || e.satisfaction > 100 || !integer(e.underpaidDays) || !integer(e.lastRaiseDay, -14) ||
      !integer(e.nextLeaveDay) || !Array.isArray(e.leaveDays) || e.leaveDays.some(d => !integer(d)) ||
      e.resignationDay !== undefined && !integer(e.resignationDay)) bad();
    if(e.secondaryRole!==undefined&&!['programming','design','maintenance','idle'].includes(e.secondaryRole))bad();
    if (e.request && (!['raise', 'leave'].includes(e.request.kind) || !integer(e.request.day) ||
      e.request.kind === 'raise' && !integer(e.request.salaryCents!, 1) ||
      e.request.kind === 'leave' && (!Array.isArray(e.request.leaveDays) || e.request.leaveDays.length < 1 || e.request.leaveDays.length > 3 || e.request.leaveDays.some(d => !integer(d))))) bad();
    if(e.requests!==undefined){
      if(!e.requests||typeof e.requests!=='object'||Array.isArray(e.requests))bad();
      for(const kind of ['raise','leave']as const){const r=e.requests[kind];if(!r)continue;
        if(r.kind!==kind||!integer(r.day)||!integer(r.deadlineDay)||r.deadlineDay<=r.day||r.reminded!==undefined&&typeof r.reminded!=='boolean'||kind==='raise'&&!integer(r.salaryCents!,1)||kind==='leave'&&(!Array.isArray(r.leaveDays)||!r.leaveDays.length||r.leaveDays.length>3||r.leaveDays.some(d=>!integer(d)||d<=r.deadlineDay)))bad();
      }
    }
  }
  const assignments = new Set<string>();
  for (const pc of c.computers) {
    unique(pc.id);
    if (!(pc.tier in COMPANY_COMPUTERS) || !integer(pc.costCents) || pc.assignee !== null && pc.assignee !== 'founder' && !c.employees.some(e => e.id === pc.assignee)) bad();
    if (pc.assignee) { if (assignments.has(pc.assignee)) bad(); assignments.add(pc.assignee); }
  }
  for (const e of c.candidates) candidate(e);
  for (const p of [c.programming, c.design, ...c.pending]) {
    if (!p) continue;
    unique(p.id);
    if (!['programming', 'design'].includes(p.lane) || !(p.scale in COMPANY_SCALES) || !finite(p.progress) || p.progress >= (legacyWork ? COMPANY_LEGACY_WORK[p.scale] : companyProjectTerms(p).work) || typeof p.topic !== 'string' || typeof p.repeat !== 'boolean') bad();
    if(p.mode!==undefined&&!['product','contract'].includes(p.mode))bad();
    if(p.next&&(!(p.next.scale in COMPANY_SCALES)||!['product','contract'].includes(p.next.mode)||typeof p.next.topic!=='string'||p.lane==='design'&&p.next.mode!=='contract'||p.next.scale==='short'&&p.next.mode!=='contract'))bad();
    if(p.quote){const q=p.quote;if(!finite(q.work)||q.work<=0||!integer(q.priceCents)||!integer(q.royaltyCents)||!finite(q.growthPoints)||q.minimumRoyaltyCapCents!==undefined&&!integer(q.minimumRoyaltyCapCents)||!Array.isArray(q.milestones)||q.milestones.some(m=>!finite(m.progress)||m.progress<=0||m.progress>q.work||!integer(m.amountCents))||q.milestones.reduce((n,m)=>n+m.amountCents,0)!==q.priceCents)bad();}
    if(p.paidMilestones!==undefined&&(!Array.isArray(p.paidMilestones)||new Set(p.paidMilestones).size!==p.paidMilestones.length||p.paidMilestones.some(i=>!integer(i)||i>=companyProjectTerms(p).milestones.length)))bad();
    if(p.paidCents!==undefined&&(!integer(p.paidCents)||p.paidCents!==companyProjectTerms(p).milestones.reduce((n,m,i)=>n+(p.paidMilestones?.includes(i)?m.amountCents:0),0)))bad();
  }
  if (c.programming?.lane === 'design' || c.design?.lane === 'programming') bad();
  for (const d of c.liabilities) { unique(d.id); if (!['salary', 'rent', 'severance'].includes(d.kind) || !integer(d.amountCents, 1) || !integer(d.dueDay)) bad(); }
  for (const entry of c.ledger) if (!integer(entry.minute) || !Number.isSafeInteger(entry.amountCents) || typeof entry.text !== 'string' || typeof entry.kind !== 'string') bad();
  // 仅换算活动项目和暂停项目的工作量单位，不重复交付，不改钱、版税、维护或时间。
  if (legacyWork) {
    for (const p of [c.programming, c.design, ...c.pending]) if (p) p.progress = p.progress / COMPANY_LEGACY_WORK[p.scale] * COMPANY_SCALES[p.scale].work;
    c.workBalanceVersion = COMPANY_WORK_BALANCE_VERSION;
  }
  if(c.managementVersion===undefined){
    // 旧合同此前没有阶段款，继续在交付时领原合同全款，既不补发历史阶段也不扣尾款。
    for(const p of [c.programming,c.design,...c.pending])if(p&&!p.quote){const d=COMPANY_LEGACY_ECONOMY.scales[p.scale];p.mode=p.lane==='design'?'contract':'product';p.quote={work:d.work,priceCents:p.lane==='design'?d.design*100:0,royaltyCents:p.lane==='programming'?d.royalty*100:0,growthPoints:d.work,milestones:p.lane==='design'?[{progress:d.work,amountCents:d.design*100}]:[]};p.paidMilestones=[];p.paidCents=0;}
    const preserved=Math.min(15,Math.max(1,c.employees.length,Math.floor(h.total/5)));
    c.recruitmentFloor=preserved;c.growthPoints=(preserved-1)*500;
    c.status='active';c.managementVersion=COMPANY_MANAGEMENT_VERSION;
  }
  if(c.economyVersion===undefined){
    // 既有合同按旧报价兑现；已有员工、候选人和待回复涨薪均为已作出的约定。
    for(const p of [c.programming,c.design,...c.pending])if(p){
      if(!p.quote){const d=COMPANY_LEGACY_ECONOMY.scales[p.scale],contract=p.lane==='design'||p.mode==='contract';p.quote={work:d.work,priceCents:contract?d.design*100:0,royaltyCents:contract?0:d.royalty*100,growthPoints:d.work,milestones:contract?[{progress:d.work,amountCents:d.design*100}]:[]};p.paidMilestones??=[];p.paidCents??=0;}
      if(p.quote.royaltyCents>0)p.quote.minimumRoyaltyCapCents??=COMPANY_LEGACY_ECONOMY.caps[c.stage-1]!*100;
    }
    c.economyVersion=DEVELOPMENT_ECONOMY_VERSION;
  }
  if(c.economyVersion!==DEVELOPMENT_ECONOMY_VERSION)bad();
  if(c.managementVersion!==COMPANY_MANAGEMENT_VERSION||!['active','closed'].includes(c.status??'active')||!integer(c.growthPoints??0)||!integer(c.recruitmentFloor??1,1)||(c.recruitmentFloor??1)>15)bad();
  for(const e of c.employees)normalizeEmployeeRequests(e,gameDay(s.time));
  c.accounting??=createCompanyAccounting(c.cursor);
  c.fundingPolicy??=companyFundingPolicy(s);
  const a=c.accounting,f=c.fundingPolicy;
  if(a.version!==1||!integer(a.cursor)||a.cursor>c.cursor||!integer(a.periodStartMinute)||a.periodStartMinute>a.cursor||!Array.isArray(a.periods)||a.periods.length>12)bad();
  const financial=['incomeCents','wageUnits','rentUnits','otherCostCents','assetInCents','assetOutCents','ownerInCents','ownerOutCents'] as const;
  if(financial.some(key=>!integer(a[key]))||a.periods.some(p=>!integer(p.periodStartMinute)||!integer(p.endMinute)||financial.some(key=>!integer(p[key]))))bad();
  if(!integer(f.reserveCents)||f.monthlyLimitCents!==null&&!integer(f.monthlyLimitCents)||!integer(f.usedCents)||!integer(f.monthKey)||typeof f.enabled!=='boolean')bad();
  if(c.status==='closed'&&(c.employees.length||c.depositCents||c.programming||c.design||c.pending.length))bad();
  normalizeCompanyStaffNames(s);
  normalizeCompanyWorkstations(c);
  // 公司收益独立持久化，绝不再落回旧 1500 元个人池。
  if(c.status!=='closed')s.career.passiveIncome = 0;
  s.flags.programming_royalty_persistent_v1 = true;
  s.flags.item_student_pass = true;
}
