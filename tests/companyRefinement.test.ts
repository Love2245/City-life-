import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {companyMinute,companyRegistrationGate,registerCompany,processCompany,transferCompanyMoney,repayCompanyDebts} from '../src/game/core/company';
import {companyClosureQuote,closeCompany,reopenCompany} from '../src/game/core/companyLifecycle';
import {companyOverview} from '../src/game/core/companyOverview';
import {companyStage,COMPANY_RULES,COMPANY_COMPUTERS,COMPANY_MONTH_MINUTES} from '../src/game/core/companyConfig';
import {fromLinearDay,START_EPOCH,gameDay} from '../src/game/core/calendar';
import {awardCompanyFounderExperience} from '../src/game/core/companyFounderSkills';
import {personalDevelopmentPreview,workOnProject} from '../src/game/core/projects';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {migrateSave} from '../src/game/core/migrate';
import {companyEmployeeRequests,respondToEmployeeRequest} from '../src/game/core/companyPersonnel';
import type {CompanyEmployee} from '../src/game/companyTypes';
import type {GameState} from '../src/game/types';

function ready(){
  const s=createInitialState(149727);s.mode='eternal';s.player.money=100000;
  Object.assign(s.time,fromLinearDay(START_EPOCH+100),{hour:10,minute:0});s.locationId='municipal_hall';
  s.developmentHistory!.total=5;s.developmentHistory!.byType={home_design:3,personal_programming_order:2};
  expect(registerCompany(s,'双专业工作室').ok).toBe(true);
  s.company!.fundingPolicy={enabled:false,reserveCents:300000,monthlyLimitCents:500000,usedCents:0,monthKey:s.time.year*12+s.time.month-1};
  return s;
}
function clock(s:GameState,day:number,hour=0,minute=0){Object.assign(s.time,fromLinearDay(START_EPOCH+day),{hour,minute});processCompany(s);}
function staff(s:GameState,overrides:Partial<CompanyEmployee>={}):CompanyEmployee{
  const e:CompanyEmployee={id:'employee-probe',name:'员工A',programming:1,design:1,stars:1,quoteFactor:1,salaryCents:250000,hired:true,role:'idle',secondaryRole:'idle',joinedMinute:s.company!.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:86,nextLeaveDay:999,leaveDays:[],requests:{},...overrides};
  s.company!.employees.push(e);return e;
}

describe('创业改进：注册与原有招聘边界',()=>{
  it.each([{home_design:5},{indie_game:5},{home_design:2,mobile_app:1,personal_programming_order:2}])('设计、编程及现金委托真实交付可合计注册 %j',byType=>{
    const s=createInitialState(1);s.developmentHistory!.byType=byType;s.developmentHistory!.total=5;
    expect(companyRegistrationGate(s)).toMatchObject({ok:true,royaltyWorks:5,requiredWorks:5});
  });
  it('未交付进度和摆摊等其他项目不能替代专业交付',()=>{
    const s=createInitialState(1);s.developmentHistory!.byType={home_design:4,street_stall:999};s.developmentHistory!.total=1003;s.career.projects.indie_game=99;
    expect(companyRegistrationGate(s)).toMatchObject({ok:false,royaltyWorks:4});
  });
  it('电脑配置仍按用户确定的三档倍率',()=>{
    expect(COMPANY_COMPUTERS.low.efficiency).toBe(1);expect(COMPANY_COMPUTERS.mid.efficiency).toBe(1.5);expect(COMPANY_COMPUTERS.high.efficiency).toBe(2);expect(COMPANY_COMPUTERS.high.price).toBe(6500);
  });
});

describe('停业清算与欠款后的恢复路径',()=>{
  it('1元欠款从800元押金清偿，剩余799元转出先扣税，重复停业不重领',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;c.nextRentDay=gameDay(s.time);
    c.liabilities=[{id:'rent-due',kind:'rent',amountCents:100,dueDay:100}];
    expect(companyClosureQuote(s)).toMatchObject({availableCents:80000,grossReturnCents:79900,taxCents:15980,returnCents:63920,remainingDebtCents:0});
    expect(closeCompany(s).ok).toBe(true);expect(s.player.money).toBe(639.2);expect(c.liabilities).toEqual([]);expect(c.status).toBe('closed');
    const once=structuredClone(s);expect(closeCompany(s).ok).toBe(false);expect(s).toEqual(once);
  });
  it('停业完整保留工资与7日补偿，资产不足仍可退出，存档往返不消债或重复计薪',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;c.nextRentDay=100;
    const e=staff(s,{salaryCents:300000,accruedUnits:150000*COMPANY_MONTH_MINUTES});
    c.liabilities=[{id:'old-wage',kind:'salary',amountCents:200000,dueDay:99,employeeId:'former',employeeName:'员工B'}];
    const q=companyClosureQuote(s)!;expect(q.settlementCents).toBe(420000);expect(q.remainingDebtCents).toBe(340000);
    expect(closeCompany(s).ok).toBe(true);expect(c.employees).toEqual([]);expect(c.liabilities.reduce((n,d)=>n+d.amountCents,0)).toBe(340000);
    expect(c.liabilities.some(d=>d.employeeId===e.id&&d.kind==='salary'&&d.amountCents===150000)).toBe(true);
    expect(c.liabilities.some(d=>d.employeeId===e.id&&d.kind==='severance'&&d.amountCents===70000)).toBe(true);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.company!.liabilities).toEqual(c.liabilities);normalizeCompanySave(loaded);
    clock(loaded,140,10);expect(loaded.company!.liabilities).toEqual(c.liabilities);expect(loaded.company!.employees).toHaveLength(0);
    expect(reopenCompany(loaded,1).ok).toBe(false);expect(companyOverview(loaded)!.monthlyFixedCents).toBe(0);
  });
  it('停业后个人接单可用，注资偿清保留债务后才能重新营业',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;c.nextRentDay=100;c.liabilities=[{id:'rent-due',kind:'rent',amountCents:160000,dueDay:100}];
    expect(closeCompany(s).ok).toBe(true);expect(c.liabilities[0]!.amountCents).toBe(80000);
    s.flags.item_laptop_pro=true;s.locationId='home';s.player.skills.design=7;s.career.projects.home_design=19.99;
    expect(personalDevelopmentPreview(s,'home_design',4).ok).toBe(true);expect(workOnProject(s,'home_design',{hours:4}).completed).toBe(true);expect(s.player.money).toBe(600);
    s.locationId='municipal_hall';expect(transferCompanyMoney(s,600,'deposit').ok).toBe(true);expect(c.liabilities[0]!.amountCents).toBe(20000);
    s.player.money=1800;expect(transferCompanyMoney(s,200,'deposit').ok).toBe(true);expect(repayCompanyDebts(s).ok).toBe(true);expect(c.liabilities).toHaveLength(0);
    expect(reopenCompany(s,1).ok).toBe(true);expect(c.status).toBe('active');
  });
});

describe('主角专业成长沿用编程与设计',()=>{
  it('维护与开发共用编程经验，设计独立；拆分贡献和读档不会多领经验',()=>{
    const a=ready(),b=structuredClone(a);a.player.skills.programming=b.player.skills.programming=3;a.player.skills.design=b.player.skills.design=3;
    const attributes=Object.keys(a.player.attrs),skills=Object.keys(a.player.skills);
    awardCompanyFounderExperience(a,'programming',200);awardCompanyFounderExperience(a,'maintenance',80);
    for(let i=0;i<20;i++)awardCompanyFounderExperience(b,'programming',10);
    const restored=migrateSave(JSON.parse(JSON.stringify(b)));for(let i=0;i<8;i++)awardCompanyFounderExperience(restored,'maintenance',10);
    expect(a.player.skills.programming).toBe(4);expect(restored.player.skills.programming).toBe(4);expect(a.flags.company_founder_programming_xp).toBe(0);expect(restored.flags.company_founder_programming_xp).toBe(0);
    expect(a.player.skills.design).toBe(3);awardCompanyFounderExperience(a,'design',240);expect(a.player.skills.design).toBe(4);
    expect(Object.keys(a.player.attrs)).toEqual(attributes);expect(Object.keys(a.player.skills)).toEqual(skills);
  });
  it('满级、空闲和非法贡献不额外升级，专业成长不改公司招聘经验或现金',()=>{
    const s=ready();s.player.skills.programming=10;const c=structuredClone(s.company);
    awardCompanyFounderExperience(s,'maintenance',10000);awardCompanyFounderExperience(s,'idle',10000);awardCompanyFounderExperience(s,'design',NaN);
    expect(s.player.skills.programming).toBe(10);expect(s.company).toEqual(c);
  });
});

describe('员工三日前通知与真实手机消息',()=>{
  it('涨薪和休假同时发短信，至少留三日决策；原时刻记账，长推进不把消息挤到终点',()=>{
    const s=ready();s.company!.balanceCents=10000000;const e=staff(s,{programming:3,stars:2,salaryCents:200000,underpaidDays:13,nextLeaveDay:101});
    clock(s,101);const requests=companyEmployeeRequests(e);expect(requests.map(r=>r.kind).sort()).toEqual(['leave','raise']);
    for(const request of requests)expect(request.deadlineDay-request.day).toBeGreaterThanOrEqual(3);
    const messages=s.smsInbox.filter(m=>m.conversationId?.startsWith('company:'));expect(messages).toHaveLength(2);
    expect(messages.every(m=>m.day===101&&m.sentAt===101*1440&&m.dir==='in'&&m.options.length===0)).toBe(true);
    for(const request of requests){
      const deadline=fromLinearDay(START_EPOCH+request.deadlineDay),message=messages.find(m=>m.text.includes(request.kind==='raise'?'申请调整月薪':'带薪假'))!;
      expect(message.text).toContain(`${deadline.month}月${deadline.day}日00:00前回复`);
      for(const day of request.leaveDays??[]){const date=fromLinearDay(START_EPOCH+day);expect(message.text).toContain(`${date.month}月${date.day}日`);}
    }
    const before=JSON.stringify(s.smsInbox);processCompany(s);expect(JSON.stringify(s.smsInbox)).toBe(before);
    clock(s,103,23,59);expect(companyEmployeeRequests(e)).toHaveLength(2);expect(respondToEmployeeRequest(e,true,103,'leave').ok).toBe(true);
    expect(e.leaveDays[0]).toBeGreaterThanOrEqual(105);
  });
  it('欠薪离职提前三天通知，仍在职至生效日；未付工资在离职后保留',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;staff(s);c.liabilities=[{id:'wage-due',kind:'salary',amountCents:250000,dueDay:100,employeeId:'employee-probe',employeeName:'员工A'}];
    clock(s,104);expect(c.employees).toHaveLength(1);expect(c.employees[0]!.resignationDay).toBe(107);
    const notice=s.smsInbox.find(m=>m.text.includes('提出离职意向'))!;expect(notice.day).toBe(104);expect(notice.sentAt).toBe(104*1440);
    clock(s,106,23,59);expect(c.employees).toHaveLength(1);clock(s,107);expect(c.employees).toHaveLength(0);expect(c.liabilities.some(d=>d.employeeId==='employee-probe')).toBe(true);
  });
  it('三日补救期内结清欠薪可留任，不会因旧离职日期再次离职',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;staff(s);c.liabilities=[{id:'wage-due',kind:'salary',amountCents:250000,dueDay:100,employeeId:'employee-probe',employeeName:'员工A'}];
    clock(s,104);s.player.money=3000;s.locationId=companyStage(c.stage).location;expect(transferCompanyMoney(s,2500,'deposit').ok).toBe(true);
    clock(s,105);expect(c.employees[0]!.resignationDay).toBeUndefined();clock(s,108);expect(c.employees).toHaveLength(1);
  });
});
