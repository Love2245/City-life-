import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { advanceHours } from '../src/game/core/time';
import { gameDay, fromLinearDay, START_EPOCH, weekdayOf } from '../src/game/core/calendar';
import { migrateSave, SAVE_VERSION } from '../src/game/core/migrate';
import { workOnProject, projectsDoneCount, startNextProgrammingProject, settlePassiveIncome } from '../src/game/core/projects';
import { ensureDevelopmentHistory } from '../src/game/core/developmentHistory';
import { companyOverview, companyOfficeHere } from '../src/game/core/companyOverview';
import { COMPANY_MONTH_MINUTES, COMPANY_STAGES, companyStage } from '../src/game/core/companyConfig';
import { assignCompanyComputer, assignCompanyEmployee, buyCompanyComputers, changeCompanyProject, companyExpansionQuote, dismissCompanyEmployee, expandCompany, founderCompanyWork, hireCompanyEmployee, interviewCompany, processCompany, raiseCompanySalary, registerCompany, repayCompanyDebts, respondCompanyRequest, startCompanyProject, transferCompanyMoney } from '../src/game/core/company';
import { calendarEventsOf } from '../src/game/core/phoneCalendar';
import { todoCommitmentsOf } from '../src/game/core/todoSummary';
import { signLease } from '../src/game/core/housing';
import { HOUSING_OFFERS } from '../src/game/data/housingOffers';
import { isLocationVisible, isLocationUnlocked, getLocation } from '../src/game/core/actions';
import { netWorth } from '../src/game/core/difficulty';
import { officeSeats, COMPANY_OFFICES } from '../src/game/core/companyOffice';
import { buildCompanyOffice } from '../src/lib/companyOffice3D';
import type { GameState } from '../src/game/types';
import { Box3 } from 'three';
import { adoptCat } from '../src/game/core/cat';
import { developmentWorkBudget } from '../src/game/core/developmentWork';
import { requestCompanyRaise } from '../src/game/core/companyPersonnel';
import { primeHiringGate } from './helpers/companyGate';

const tick = (s: GameState, hours: number) => advanceHours(s, hours, false, true);
function fresh() {
  const s = createInitialState(1497); s.mode = 'eternal'; s.player.money = 1_000_000;
  s.player.skills.programming = s.player.skills.design = 3; s.flags.item_laptop_mid = true;
  s.time.hour = 10; s.locationId = 'municipal_hall';
  return s;
}
function company(total = 75) {
  const s = fresh(); s.developmentHistory!.total = total; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });
  expect(registerCompany(s, '树下工作室').ok).toBe(true); primeHiringGate(s); s.locationId = 'dev_incubator'; return s;
}
function buy(s: GameState, count: number, tier: 'low' | 'mid' | 'high' = 'mid') {
  s.locationId = 'electronics_store'; if (s.time.hour < 10 || s.time.hour >= 22) tick(s, (34 - s.time.hour) % 24);
  expect(buyCompanyComputers(s, tier, count).ok).toBe(true); s.locationId = companyStage(s.company!.stage).location;
}
function employee(s: GameState) {
  buy(s, 1); expect(interviewCompany(s).ok).toBe(true);
  const candidate = s.company!.candidates.find(e => !e.hired)!;
  expect(hireCompanyEmployee(s, candidate.id).ok).toBe(true); return s.company!.employees.at(-1)!;
}
function nextWorkMorning(s: GameState) {
  while (weekdayOf(s.time) >= 5 || s.time.hour !== 9 || s.time.minute !== 0) tick(s, s.time.hour >= 9 ? 24 - s.time.hour + 9 - s.time.minute / 60 : 9 - s.time.hour - s.time.minute / 60);
}

describe('公司创业完整旅程与资格', () => {
  it('先有 5 件设计或编程交付才可注册，注册后可直接录用首人，每五件解锁下一人、发薪并扩张', () => {
    const s = fresh(); expect(registerCompany(s, '未交付公司').ok).toBe(false);
    for (let i = 0; i < 3; i++) { Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100});expect(workOnProject(s, 'home_design').ok).toBe(true); tick(s, 16); }
    expect(s.developmentHistory!.total).toBe(1); // 个人设计20点，办公电脑、技能3，第三个正常日交付。
    if(s.time.hour<9||s.time.hour>=18)tick(s,((9*60-s.time.hour*60-s.time.minute+1440)%1440)/60);
    s.locationId = 'municipal_hall';
    // 设计可计入资格，但一件尚不足五件；混合专业的交付可合计。
    const noWorks = registerCompany(s, '资格不足公司'); expect(noWorks.ok).toBe(false); expect(noWorks.reason).toContain('设计或编程项目');
    Object.assign(s.developmentHistory!.byType, { indie_game: 5 }); s.developmentHistory!.total = 6;
    expect(registerCompany(s, '正常经营旅程').ok).toBe(true);
    expect(s.locationId).toBe('municipal_hall');
    buy(s, 3); expect(assignCompanyComputer(s, s.company!.computers[0]!.id, 'founder').ok).toBe(true);
    expect(interviewCompany(s).ok).toBe(true);
    expect(hireCompanyEmployee(s,s.company!.candidates[0]!.id).ok).toBe(true);
    expect(assignCompanyEmployee(s,s.company!.employees[0]!.id,'design').ok).toBe(true);
    expect(startCompanyProject(s, 'design', '界面设计', 'small', true).ok).toBe(true);
    while (s.developmentHistory!.total < 10) {
      Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100});
      if (!developmentWorkBudget(s).remainingMinutes) tick(s, 24);
      expect(founderCompanyWork(s, 'design').ok).toBe(true); tick(s, 16);
    }
    expect(s.developmentHistory!.total).toBeGreaterThanOrEqual(6);
    expect(companyOverview(s)!.unlocked).toBe(2);
    expect(interviewCompany(s).ok).toBe(true);
    expect(hireCompanyEmployee(s,s.company!.candidates.find(c=>!c.hired)!.id).ok).toBe(true);
    expect(s.company!.employees).toHaveLength(2);
    for (const e of s.company!.employees) expect(assignCompanyEmployee(s, e.id, 'design').ok).toBe(true);
    tick(s, 30 * 24);
    expect(s.company!.ledger.some(l => l.kind === 'salary' && l.amountCents < 0)).toBe(true);
    s.locationId = 'municipal_hall'; if (s.time.hour < 9 || s.time.hour >= 18) tick(s, (34 - s.time.hour) % 24);
    const beforePayDay = s.company!.nextPayDay;
    expect(expandCompany(s).ok).toBe(true); expect(s.company!.stage).toBe(2); expect(s.company!.nextPayDay).toBe(beforePayDay);
    expect(s.company!.computers).toHaveLength(3); expect(s.company!.liabilities).toHaveLength(0);
  });
  it('需要市政营业、有效名称、5 件设计或编程交付和启动资金；注册不传送且不可重复注册', () => {
    const s = fresh(); s.developmentHistory!.total = 0; s.developmentHistory!.byType = {};
    s.time.hour = 8; expect(registerCompany(s, '创业').ok).toBe(false); s.time.hour = 10;
    s.developmentHistory!.byType = { indie_game: 4 }; s.developmentHistory!.total = 4;
    const short = registerCompany(s, '创业'); expect(short.ok).toBe(false); expect(short.reason).toContain('5 件');
    s.developmentHistory!.byType = { indie_game: 5 }; s.developmentHistory!.total = 5;
    expect(registerCompany(s, '').ok).toBe(false); expect(registerCompany(s, '名'.repeat(21)).ok).toBe(false);
    s.player.money = 2099; expect(registerCompany(s, '创业').ok).toBe(false); s.player.money = 2100;
    expect(registerCompany(s, '创业').ok).toBe(true); expect(s.player.money).toBe(500); expect(s.locationId).toBe('municipal_hall'); expect(registerCompany(s, '第二家').ok).toBe(false);
  });
  it.each([[0,0],[4,0],[5,1],[9,1],[10,2],[14,2],[15,3],[74,14],[75,15],[500,15]])('已完成%i个项目解锁%i名员工，经营经验不再影响名额', (completed, slots) => {
    const s=company();s.developmentHistory!.total=completed;s.company!.growthPoints=999999;expect(companyOverview(s)!.unlocked).toBe(slots);
  });
  it('个人历史同类重复交付累计，成就仍按种类计数', () => {
    const s = fresh();
    for (let i = 0; i < 2; i++) { if(i)tick(s,16);s.career.projects.indie_game = 99; expect(workOnProject(s, 'indie_game').completed).toBe(true); if (!i) expect(startNextProgrammingProject(s, 'indie_game').ok).toBe(true); }
    expect(s.developmentHistory!.total).toBe(2); expect(projectsDoneCount(s)).toBe(1);
  });
  it('注册保留所有未完工进度、合并个人版税且不发现金', () => {
    const s = fresh(); s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 }); s.career.passiveIncome = 1250;
    delete s.flags.development_economy_v2; // 旧个人在途作品继续兑现原报价。
    s.career.projects = { indie_game: 40, mobile_app: 70, home_design: 25 }; // 旧个人设计100点单位先迁移为5/20，再并入公司25/100。
    const money = s.player.money;
    expect(registerCompany(s, '接续作品').ok).toBe(true);
    expect(s.company!.programming!.sourceId).toBe('mobile_app'); expect(s.company!.programming!.progress).toBe(70);
    expect(s.company!.pending[0]!.sourceId).toBe('indie_game'); expect(s.company!.design!.progress).toBe(25);
    expect(s.company!.royaltyCents).toBe(125000); expect(s.career.passiveIncome).toBe(0); expect(s.player.money).toBe(money - 1600);
    expect(settlePassiveIncome(s)).toBe(0); expect(workOnProject(s, 'home_design').ok).toBe(false); expect(s.developmentHistory!.total).toBe(1);
  });
});

describe('项目推进、电脑与每周维护', () => {
  it('主角技能3办公电脑正常日约8.33点，小项目第十二天交付，两条线互不覆盖', () => {
    const s = company(1); buy(s, 1); assignCompanyComputer(s, s.company!.computers[0]!.id, 'founder');
    expect(startCompanyProject(s, 'programming', '工具软件', 'small').ok).toBe(true);
    expect(startCompanyProject(s, 'design', '品牌视觉', 'small').ok).toBe(true);
    for (let i=0;i<12;i++) { s.player.attrs.stamina=100; expect(founderCompanyWork(s,'programming').ok).toBe(true); if(i===0)expect(s.company!.programming!.progress).toBeCloseTo(8.33333333); expect(developmentWorkBudget(s).remainingMinutes).toBeGreaterThanOrEqual(240); tick(s,16); }
    expect(s.company!.programming).toBeNull(); expect(s.company!.royaltyCents).toBe(6000); expect(s.developmentHistory!.total).toBe(2); expect(s.company!.design!.progress).toBe(0);
  });
  it('个人旧当日标记保守折算8小时，仍可补足至12小时；异地与未配电脑受核心校验', () => {
    const s=fresh();s.developmentHistory!.total = 75; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });s.flags.dev_work_day=gameDay(s.time);expect(registerCompany(s,'承接个人工时').ok).toBe(true);s.locationId='dev_incubator';startCompanyProject(s, 'design', '平面设计', 'small');
    expect(founderCompanyWork(s,'design').reason).toContain('电脑'); buy(s,1); assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');
    expect(developmentWorkBudget(s).usedMinutes).toBe(480);expect(founderCompanyWork(s,'design').ok).toBe(true);expect(developmentWorkBudget(s).remainingMinutes).toBe(0);expect(founderCompanyWork(s,'design',4).ok).toBe(false);
    delete s.flags.dev_work_day; s.locationId='old_apartment'; expect(founderCompanyWork(s,'design').ok).toBe(false);
  });
  it('连续开发保留剩余工作量，关闭后完工等待且不重复计数', () => {
    const s = company(); buy(s,1); assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');
    startCompanyProject(s,'design','品牌视觉','small',true); s.company!.design!.progress=99;
    founderCompanyWork(s,'design'); expect(s.company!.design!.progress).toBeCloseTo(7.33333333); expect(s.developmentHistory!.total).toBe(76);
    changeCompanyProject(s,'design','repeat'); s.company!.design!.progress=99; tick(s,24); s.player.attrs.stamina=100;
    founderCompanyWork(s,'design'); expect(s.company!.design).toBeNull(); expect(s.developmentHistory!.total).toBe(77);
    const earned=s.company!.earnedCents; tick(s,24); expect(s.company!.earnedCents).toBe(earned);
  });
  it('暂停和恢复保留进度；取消、维护不增加作品数；阶段控制项目规模', () => {
    const s = company(); expect(startCompanyProject(s,'design','平面设计','medium').ok).toBe(false);
    startCompanyProject(s,'design','平面设计','small'); s.company!.design!.progress=12;
    const p=s.company!.design!.id; changeCompanyProject(s,'design','pause'); expect(s.company!.pending[0]!.progress).toBe(12);
    changeCompanyProject(s,'design','pause',p); expect(s.company!.design!.progress).toBe(12);
    changeCompanyProject(s,'design','cancel'); expect(s.developmentHistory!.total).toBe(75);
  });
  it.each([[0,7500],[20000,5250],[40000,3000],[59000,1000],[60000,0],[450000,0]])('当前版税 %i 分时新游戏交付新增 %i 分，含题材加成及新上限；旧大池不截断', (current, added) => {
    const s=company(); buy(s,1); assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');
    startCompanyProject(s,'programming','游戏','small'); s.company!.programming!.progress=119; s.company!.royaltyCents=current;
    founderCompanyWork(s,'programming'); expect(s.company!.royaltyCents).toBe(current+added);
  });
  it.each([[0,90000],[5,95000],[10,100000]])('维护量%i时周结先发1000元，次周池%i分', (maintenance, next) => {
    const s=company(); s.company!.royaltyCents=100000; s.company!.maintenance=maintenance;
    tick(s,38); expect(s.company!.balanceCents).toBe(100000); expect(s.company!.royaltyCents).toBe(next); expect(s.company!.maintenance).toBe(0);
    const before=JSON.stringify(s.company); processCompany(s); expect(JSON.stringify(s.company)).toBe(before);
  });
  it('公司承接本周个人已发放记录，不再次派发；超过1500的公司池可保存', () => {
    const s=fresh(); s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 }); s.flags.passive_paid_week=0; s.career.passiveIncome=1500;
    registerCompany(s,'版税承接'); tick(s,38); expect(s.company!.balanceCents).toBe(0); expect(s.company!.royaltyCents).toBe(150000);
    s.company!.royaltyCents=400000; const loaded=migrateSave(s); expect(loaded.company!.royaltyCents).toBe(400000); expect(loaded.career.passiveIncome).toBe(0);
  });
  it('公司电脑独立采购、保留旧设备，升级与调配不复制电脑', () => {
    const s=company(); buy(s,1,'low'); const p=s.company!.computers[0]!; assignCompanyComputer(s,p.id,'founder'); buy(s,1,'high');
    assignCompanyComputer(s,s.company!.computers[1]!.id,'founder'); expect(p.assignee).toBeNull(); expect(s.company!.computers.filter(p=>p.assignee==='founder')).toHaveLength(1);
    expect(s.flags.item_laptop_mid).toBe(true); expect(s.company!.computers).toHaveLength(2);
    s.locationId='old_apartment'; expect(buyCompanyComputers(s,'mid',1).ok).toBe(false);
  });
  it('员工工作日09—17推进，周末与带薪假仍计薪，待分配无经验', () => {
    const s=company(), e=employee(s); e.programming=3; nextWorkMorning(s);
    startCompanyProject(s,'programming','工具软件','small',true); assignCompanyEmployee(s,e.id,'programming');
    const salary=e.accruedUnits; tick(s,8); expect(s.developmentHistory!.total).toBeGreaterThanOrEqual(75); expect(e.programmingXp).toBeGreaterThan(0); expect(e.accruedUnits-salary).toBe(e.salaryCents*480);
    assignCompanyEmployee(s,e.id,'idle'); const xp=e.programmingXp; tick(s,24); expect(e.programmingXp).toBe(xp);
    nextWorkMorning(s); e.leaveDays=[gameDay(s.time)]; assignCompanyEmployee(s,e.id,'programming'); const before=JSON.stringify(s.company!.programming),wage=e.accruedUnits; tick(s,8);
    expect(JSON.stringify(s.company!.programming)).toBe(before); expect(e.accruedUnits-wage).toBe(e.salaryCents*480);
  });
  it('维护经验为开发一半，足额后停止无效维护；周末、缺电脑均无进度但计薪', () => {
    const s=company(),e=employee(s);nextWorkMorning(s);e.programming=3;e.programmingXp=0;s.company!.royaltyCents=400000;
    startCompanyProject(s,'programming','工具软件','small',true);assignCompanyEmployee(s,e.id,'programming');const dev=migrateSave(s),maint=migrateSave(s);assignCompanyEmployee(maint,e.id,'maintenance');
    tick(dev,1);tick(maint,1);expect(maint.company!.employees[0]!.programmingXp).toBeCloseTo(dev.company!.employees[0]!.programmingXp/2,6);
    maint.company!.maintenance=40;const xp=maint.company!.employees[0]!.programmingXp;tick(maint,1);expect(maint.company!.employees[0]!.programmingXp).toBe(xp);
    assignCompanyComputer(s,s.company!.computers[0]!.id,null);const progress=s.company!.programming!.progress,wage=e.accruedUnits;tick(s,1);expect(s.company!.programming!.progress).toBe(progress);expect(e.accruedUnits-wage).toBe(e.salaryCents*60);
    while(weekdayOf(s.time)!==5)tick(s,24);const weekendWage=e.accruedUnits,weekendProgress=s.company!.programming!.progress;tick(s,24);expect(s.company!.programming!.progress).toBe(weekendProgress);expect(e.accruedUnits-weekendWage).toBe(e.salaryCents*1440);
  });
});

describe('招聘、工资、成长与资金责任', () => {
  it('每天仅一批三人，读档不刷新，可当天录用多名；电脑与办公室阻止超编', () => {
    const s=company();s.company!.growthPoints=1000; buy(s,4); interviewCompany(s); const candidates=JSON.stringify(s.company!.candidates),rng=s.company!.rng.calls;
    interviewCompany(s); expect(JSON.stringify(s.company!.candidates)).toBe(candidates); expect(s.company!.rng.calls).toBe(rng);
    const loaded=migrateSave(s); expect(JSON.stringify(loaded.company!.candidates)).toBe(candidates);
    for(const candidate of s.company!.candidates.slice(0,2)) expect(hireCompanyEmployee(s,candidate.id).ok).toBe(true);
    expect(hireCompanyEmployee(s,s.company!.candidates[2]!.id).reason).toContain('工位');
  });
  it('无空电脑不能录用，候选报价和星级范围正确', () => {
    const s=company(); interviewCompany(s); for(const e of s.company!.candidates){const highest=Math.max(e.programming,e.design),base=2500+125*(highest-1);expect(e.stars).toBe(Math.ceil(highest/2));expect(e.salaryCents).toBe(Math.round(base*e.quoteFactor*100));expect(e.quoteFactor).toBeGreaterThanOrEqual(.8);expect(e.quoteFactor).toBeLessThanOrEqual(1.2);}
    expect(hireCompanyEmployee(s,s.company!.candidates[0]!.id).reason).toContain('电脑');
  });
  it('每日按月薪逐分钟计提，月中调薪不追溯；公司先扣、个人自动补差', () => {
    const s=company(), e=employee(s); e.salaryCents=300000;
    const start=s.company!.cursor; tick(s,10*24); const first=e.accruedUnits;
    expect(first).toBe(300000*10*1440); raiseCompanySalary(s,e.id,4500); tick(s,5*24);
    expect(e.accruedUnits).toBe(first+450000*5*1440);
    const due=s.company!.nextPayDay*1440,expected=Math.floor((first+450000*(due-start-10*1440))/COMPANY_MONTH_MINUTES);
    const personal=s.player.money; s.company!.balanceCents=10000;
    tick(s,(due-s.company!.cursor)/60);
    const salary=s.company!.ledger.filter(l=>l.kind==='salary').reduce((a,l)=>a-l.amountCents,0);
    expect(salary).toBe(expected); expect(s.company!.liabilities).toHaveLength(0); expect(s.player.money).toBeCloseTo(personal-(expected+80000-10000)/100,2);
  });
  it('提现预留计提工资和到期欠款；注资不当作收入，可清偿复工', () => {
    const s=company(), e=employee(s); tick(s,24); s.company!.balanceCents=100000;
    const reserve=companyOverview(s)!.reservedCents,earned=s.company!.earnedCents;
    expect(reserve).toBeGreaterThan(0); expect(transferCompanyMoney(s,1000,'withdraw').ok).toBe(false);
    expect(transferCompanyMoney(s,(100000-reserve)/100,'withdraw').ok).toBe(true);
    s.player.money=0; s.company!.balanceCents=0; s.company!.nextPayDay=gameDay(s.time)+1; s.company!.royaltyCents=0;
    tick(s,24); expect(companyOverview(s)!.stopped).toBe(true);
    s.player.money=5000; const before=s.company!.earnedCents; transferCompanyMoney(s,3000,'deposit'); expect(companyOverview(s)!.stopped).toBe(false); expect(s.company!.earnedCents).toBe(before); expect(earned).toBe(0); expect(e.accruedUnits).toBeGreaterThanOrEqual(0);
  });
  it('无法支付解雇补偿时员工不消失；成功时付工资与七日补偿并返还电脑', () => {
    const s=company(), e=employee(s); tick(s,24); const accrued=Math.ceil(e.accruedUnits/COMPANY_MONTH_MINUTES),compensation=Math.round(e.salaryCents*7/30);
    s.player.money=0; expect(dismissCompanyEmployee(s,e.id).ok).toBe(false); expect(s.company!.employees).toHaveLength(1);
    s.player.money=10000; expect(dismissCompanyEmployee(s,e.id).ok).toBe(true); expect(s.company!.employees).toHaveLength(0); expect(s.company!.computers[0]!.assignee).toBeNull(); expect(s.player.money).toBeCloseTo(10000-(accrued+compensation)/100,2);
  });
  it('欠薪停工、自愿离职留债，偿还后公司保留且无新增人生结局', () => {
    const s=company(), e=employee(s); startCompanyProject(s,'design','平面设计','small',true); assignCompanyEmployee(s,e.id,'design');
    s.player.money=0; s.company!.balanceCents=0; s.company!.nextPayDay=gameDay(s.time)+1; tick(s,24);
    const project=JSON.stringify(s.company!.design); expect(companyOverview(s)!.stopped).toBe(true); tick(s,24*7);
    expect(s.company!.employees).toHaveLength(0); expect(s.company!.liabilities.some(d=>d.employeeId===e.id)).toBe(true); expect(JSON.stringify(s.company!.design)).toBe(project); expect(s.endingId).toBeNull();
    s.player.money=10000; expect(repayCompanyDebts(s).ok).toBe(true); expect(s.company!.name).toBe('树下工作室'); expect(companyOverview(s)!.stopped).toBe(false);
  });
  it('停工期间既有版税照常到账偿还工资，清偿后恢复员工生产', () => {
    const s=company(),e=employee(s);s.company!.royaltyCents=100000;s.company!.nextPayDay=1;s.player.money=0;s.company!.balanceCents=0;
    startCompanyProject(s,'design','界面设计','small',true);assignCompanyEmployee(s,e.id,'design');tick(s,13);expect(companyOverview(s)!.stopped).toBe(true);
    tick(s,24);expect(companyOverview(s)!.stopped).toBe(false);expect(s.company!.earnedCents).toBe(100000);expect(s.company!.employees).toHaveLength(1);expect(s.company!.balanceCents).toBeGreaterThan(0);expect(s.endingId).toBeNull();
  });
  it('涨薪、休假与离职补救遵循满意度；按贡献升级触发合理报价', () => {
    const s=company(),e=employee(s); nextWorkMorning(s); e.programming=2;e.design=1;e.stars=1;e.quoteFactor=1;e.salaryCents=200000;e.programmingXp=199.99;
    startCompanyProject(s,'programming','工具软件','small',true); assignCompanyEmployee(s,e.id,'programming'); tick(s,1);
    expect(e.programming).toBe(3);expect(e.stars).toBe(2);expect(e.request?.kind).toBe('raise');
    respondCompanyRequest(s,e.id,false);expect(e.satisfaction).toBe(65);
    e.requests!.leave={kind:'leave',day:gameDay(s.time),deadlineDay:gameDay(s.time)+1,leaveDays:[gameDay(s.time)+2]};respondCompanyRequest(s,e.id,false,'leave');expect(e.satisfaction).toBe(45);
    e.requests!.leave={kind:'leave',day:gameDay(s.time),deadlineDay:gameDay(s.time)+1,leaveDays:[gameDay(s.time)+2]};respondCompanyRequest(s,e.id,true,'leave');expect(e.leaveDays).toHaveLength(1);expect(e.satisfaction).toBe(60);
    e.satisfaction=20;tick(s,24);expect(e.resignationDay).toBeDefined();raiseCompanySalary(s,e.id,4000);expect(e.resignationDay).toBeUndefined();
  });
  it('低薪十四日申请涨薪，休假至少提前三日通知，不强制打断玩家', () => {
    const s=company(),e=employee(s);e.programming=10;e.design=1;e.stars=5;e.salaryCents=200000;e.quoteFactor=1;e.nextLeaveDay=1000;
    tick(s,24*14); expect(e.requests?.raise?.kind).toBe('raise');expect(e.requests?.raise?.salaryCents).toBe(362500);respondCompanyRequest(s,e.id,true,'raise');expect(e.salaryCents).toBe(362500);
    e.nextLeaveDay=gameDay(s.time)+1;tick(s,24);expect(e.request?.kind).toBe('leave');expect(e.request!.leaveDays!.every(d=>d>=gameDay(s.time)+1)).toBe(true);expect(s.endingId).toBeNull();
  });
  it('真实推进90天忽略涨薪申请会反复按拒绝扣分，经补救期后离职，重复结算不重复处罚', () => {
    const s=company(),e=employee(s),day=gameDay(s.time);
    Object.assign(e,{programming:10,design:1,stars:5,quoteFactor:1,salaryCents:200000,lastRaiseDay:day-14,nextLeaveDay:day+1000});
    s.company!.balanceCents=10000000;
    expect(requestCompanyRaise(e,day)).toBe(true);
    tick(s,90*24);
    expect(s.company!.employees).toHaveLength(0);
    expect(s.company!.ledger.filter(entry=>entry.kind==='request'&&entry.text.includes('涨薪申请已逾期'))).toHaveLength(4);
    expect(s.company!.ledger.some(entry=>entry.kind==='intention')).toBe(true);
    expect(s.company!.ledger.some(entry=>entry.kind==='departure')).toBe(true);
    const settled=JSON.stringify(s.company);processCompany(s);expect(JSON.stringify(s.company)).toBe(settled);
  });
});

describe('扩张、存档、时钟和场景契约', () => {
  it('三、六、十人逐级扩张，最高十五员工；搬迁保留所有经营进度', () => {
    const s=company(75);s.company!.growthPoints=7000;buy(s,16);assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');startCompanyProject(s,'programming','工具软件','small',true);s.company!.programming!.progress=12;s.company!.maintenance=4;
    for(const target of [3,6,10,16]){
      while(s.company!.employees.length+1<target){s.locationId=companyStage(s.company!.stage).location;interviewCompany(s);for(const candidate of s.company!.candidates.filter(c=>!c.hired)){if(s.company!.employees.length+1>=target)break;expect(hireCompanyEmployee(s,candidate.id).ok).toBe(true);}if(s.company!.employees.length+1<target)tick(s,24);}
      if(target<16){s.locationId='municipal_hall';if(s.time.hour<9||s.time.hour>=18)tick(s,(34-s.time.hour)%24);const payday=s.company!.nextPayDay;s.company!.maintenance=4;expect(companyExpansionQuote(s)!.next.requiredPeople).toBe(target);expect(expandCompany(s).ok).toBe(true);expect(s.company!.nextPayDay).toBe(payday);expect(s.company!.maintenance).toBe(4);}
    }
    expect(s.company!.employees).toHaveLength(15);expect(s.company!.stage).toBe(4);expect(companyExpansionQuote(s)).toBeNull();expect(s.company!.programming!.progress).toBe(12);expect(s.company!.computers).toHaveLength(16);
  });
  it('报价按退押金与剩余租金计算，未达到人数不能扩张', () => {
    const s=company();tick(s,24*10);expect(companyExpansionQuote(s)!.refundRentCents).toBe(Math.round(80000*20/30));s.locationId='municipal_hall';expect(expandCompany(s).ok).toBe(false);
  });
  it('旧35档保守补记、孵化住房退款且仅迁移一次；家具宠物通行证保留', () => {
    const s=fresh();s.version=35;delete s.developmentHistory;s.flags.project_completed_indie_game=true;s.flags.project_completed_home_design=true;
    s.log=[{text:'【居家设计】交付一单！设计费 +90 元，下一单马上开工',icon:'🛋️',time:'10:00'} as any,{text:'【居家设计】交付一单！设计费 +90 元，下一单马上开工',icon:'🛋️',time:'10:00'} as any];
    s.living.mode='lease';s.living.lease={housingId:'dev_incubator',rent:800,rentGrowthCount:0,nextRentDay:15};s.locationId='dev_incubator';s.equipped.sofa='sofa';const cash=s.player.money,time=JSON.stringify(s.time);
    const loaded=migrateSave(s);expect(loaded.version).toBe(38);expect(SAVE_VERSION).toBe(38);expect(loaded.developmentHistory!.total).toBe(3);expect(loaded.player.money).toBe(cash+400);expect(loaded.living.mode).toBe('gov');expect(loaded.living.govDaysLeft).toBe(7);expect(loaded.equipped.sofa).toBe('sofa');expect(loaded.flags.item_student_pass).toBe(true);expect(JSON.stringify(loaded.time)).toBe(time);expect(migrateSave(loaded).player.money).toBe(loaded.player.money);
    expect(signLease(loaded,'dev_incubator').ok).toBe(false);expect(HOUSING_OFFERS.some(o=>(o.lease as string)==='dev_incubator')).toBe(false);
  });
  it('长时间推进和分段推进跨月跨年保持公司账目、进度、薪资与候选一致', () => {
    const s=company(),e=employee(s);s.company!.royaltyCents=400000;s.company!.balanceCents=10000000;startCompanyProject(s,'design','界面设计','small',true);assignCompanyEmployee(s,e.id,'design');
    const single=migrateSave(s),split=migrateSave(s);tick(single,24*160);for(let i=0;i<160*4;i++)tick(split,6);
    expect(single.time.year).toBe(2027);expect(single.company).toEqual(split.company);expect(single.developmentHistory).toEqual(split.developmentHistory);expect(single.player.money).toBe(split.player.money);
    const loaded=migrateSave(single),before=JSON.stringify(loaded.company);processCompany(loaded);expect(JSON.stringify(loaded.company)).toBe(before);
  },30000);
  it('迁出孵化住房时优先使用已有产权，资产、宠物与布置记录保持原样', () => {
    const s=fresh();s.version=35;s.living.mode='lease';s.living.lease={housingId:'dev_incubator',rent:800,rentGrowthCount:0,nextRentDay:15};
    s.living.properties=[{id:'property_1',housingId:'own_rental_apartment',acquiredDay:0,lastAccountedDay:0,rentalDays:0}];s.locationId='dev_incubator';
    s.homeLayouts={old_apartment:{lamp:1}};adoptCat(s,'orange','小橘');const layouts=JSON.stringify(s.homeLayouts),pets=JSON.parse(JSON.stringify(s.pets));
    const loaded=migrateSave(s);expect(loaded.living.mode).toBe('own');expect(loaded.living.ownedId).toBe('own_rental_apartment');expect(loaded.locationId).toBe('rental_apartment');expect(JSON.stringify(loaded.homeLayouts)).toBe(layouts);expect(loaded.pets).toMatchObject(pets);
  });
  it('只读概况、资产、日历与待办不结算；腐坏公司账目拒绝载入', () => {
    const s=company(),e=employee(s);e.requests!.raise={kind:'raise',day:gameDay(s.time),deadlineDay:gameDay(s.time)+3,salaryCents:e.salaryCents+10000};const before=JSON.stringify(s);
    expect(calendarEventsOf(s,0,100).some(e=>e.title==='公司员工发薪')).toBe(true);expect(todoCommitmentsOf(s).some(e=>e.title.includes('申请涨薪'))).toBe(true);companyOverview(s);netWorth(s);officeSeats(s);expect(JSON.stringify(s)).toBe(before);
    s.company!.balanceCents=-1;expect(()=>migrateSave(s)).toThrow('公司经营存档损坏');
  });
  it.each(COMPANY_STAGES)('第$stage阶段有独立结构、准确工位和实际设备状态', stage => {
    const s=company();s.company!.stage=stage.stage;s.locationId=stage.location;buy(s,1,'high');assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');
    const plan=COMPANY_OFFICES[stage.stage-1]!,model=buildCompanyOffice(plan),seats=officeSeats(s);model.update(seats);
    expect(plan.desks).toHaveLength(stage.capacity);expect(model.root.children.filter(c=>c.name.startsWith('workstation-'))).toHaveLength(stage.capacity);
    expect(model.root.getObjectByName('computer-premium-procedural-fallback')).toBeDefined();const computerBounds=new Box3().setFromObject(model.root.getObjectByName('assigned-computer')!);expect(computerBounds.min.y).toBeGreaterThanOrEqual(.80);expect(computerBounds.max.y).toBeLessThan(1.5);expect(seats[0]!.tier).toBe('high');expect(companyOfficeHere(s)).toBe(true);
    for(const other of COMPANY_STAGES.filter(x=>x.stage>1))expect(isLocationVisible(s,other.location)).toBe(other.stage===stage.stage);
    expect(isLocationUnlocked(s,getLocation(stage.location))).toBe(true);model.dispose();expect(model.root.children).toHaveLength(0);
  });
});
