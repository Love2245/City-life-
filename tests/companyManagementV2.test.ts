import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,startCompanyProject,contributeCompanyWork,changeCompanyProject,founderCompanyWork,buyCompanyComputers,processCompany,companyMinute,interviewCompany,hireCompanyEmployee,raiseCompanySalary} from '../src/game/core/company';
import {companyOverview} from '../src/game/core/companyOverview';
import {companyProjectTerms} from '../src/game/core/companyProjects';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {migrateSave,SAVE_VERSION} from '../src/game/core/migrate';
import {developmentWorkBudget} from '../src/game/core/developmentWork';
import {fromLinearDay,START_EPOCH} from '../src/game/core/calendar';
import { primeHiringGate } from './helpers/companyGate';

function ready(){const s=createInitialState(149725);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 5; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });expect(registerCompany(s,'经营验证',2).ok).toBe(true);primeHiringGate(s);s.locationId='company_office_single';return s;}
describe('项目阶段回款、加权招聘与注册首名',()=>{
  it('小中大项目各计一件，招聘只看交付数量，不看工作量或旧经验',()=>{
    const small=ready(),large=ready();expect(companyOverview(small)!.unlocked).toBe(1);
    startCompanyProject(small,'design','平面设计','small',true);contributeCompanyWork(small,'design',1200);
    large.company!.stage=3;large.locationId='company_office_large';startCompanyProject(large,'design','平面设计','large');contributeCompanyWork(large,'design',1200);
    expect(small.company!.growthPoints).toBe(1200);expect(large.company!.growthPoints).toBe(1200);
    expect(small.developmentHistory!.total).toBe(17);expect(large.developmentHistory!.total).toBe(6);
    expect(companyOverview(small)!.unlocked).toBe(3);expect(companyOverview(large)!.unlocked).toBe(1);
    large.company!.growthPoints=1e6;large.company!.recruitmentFloor=15;expect(companyOverview(large)!.unlocked).toBe(1);
  });
  it.each([['medium',400,[[200,276000],[200,644000]]],['large',1200,[[300,600000],[420,900000],[480,1500000]]]] as const)('%s委托仅在验收点付款，暂停/读档不重领',(scale,work,stages)=>{
    const s=ready();s.company!.stage=3;s.locationId='company_office_large';startCompanyProject(s,'programming','工具软件',scale,false,'contract');let sum=0;
    for(const [points,payment]of stages){const previous=s.company!.balanceCents;contributeCompanyWork(s,'programming',points);expect(s.company!.balanceCents-previous).toBe(payment);sum+=payment;normalizeCompanySave(s);processCompany(s);expect(s.company!.balanceCents).toBe(sum);}
    expect(s.company!.programming).toBeNull();expect(s.company!.royaltyCents).toBe(0);expect(s.company!.growthPoints).toBe(work);expect(s.developmentHistory!.total).toBe(6);
  });
  it('短单两条线均回款，连续项目重置验收标记，取消不刷经营经验',()=>{
    const s=ready();startCompanyProject(s,'programming','工具软件','short',true,'contract');contributeCompanyWork(s,'programming',85);
    expect(s.company!.balanceCents).toBe(170000);expect(s.company!.growthPoints).toBe(80);expect(s.company!.programming!.paidMilestones).toEqual([]);expect(s.company!.programming!.progress).toBe(5);
    startCompanyProject(s,'design','界面设计','short');contributeCompanyWork(s,'design',40);expect(s.company!.balanceCents).toBe(255000);
    changeCompanyProject(s,'programming','cancel');expect(s.company!.growthPoints).toBe(120);expect(s.developmentHistory!.total).toBe(8);
  });
  it('缩小办公室保留原大项目，但交付后不能用连续开发绕过规模门槛',()=>{
    const s=ready();s.company!.stage=3;s.locationId='company_office_large';startCompanyProject(s,'design','平面设计','large',true);s.company!.stage=1;s.locationId='dev_incubator';contributeCompanyWork(s,'design',1201);expect(s.company!.design).toBeNull();expect(s.company!.growthPoints).toBe(1200);expect(s.company!.earnedCents).toBe(3000000);expect(startCompanyProject(s,'design','平面设计','large',true).ok).toBe(false);
  });
  it('旧36版合同保留全额尾款和已计提工资，迁移幂等且不补发现金',()=>{
    const s=ready(),c=s.company!;s.version=36;delete c.managementVersion;delete c.accounting;delete c.fundingPolicy;c.design={id:'legacy',lane:'design',topic:'界面设计',scale:'medium',progress:250,repeat:false};c.balanceCents=12345;
    const migrated=migrateSave(structuredClone(s));expect(SAVE_VERSION).toBe(38);expect(migrated.version).toBe(38);expect(migrated.company!.balanceCents).toBe(12345);expect(companyProjectTerms(migrated.company!.design!).milestones).toEqual([{progress:400,amountCents:1400000}]);
    const once=structuredClone(migrated);expect(migrateSave(migrated)).toEqual(once);contributeCompanyWork(migrated,'design',150);expect(migrated.company!.balanceCents).toBe(1412345);
  });
});
describe('公司实际工时和跨任务',()=>{
  it('象征性加薪不能抹去长期低薪或白送15点满意度，实际达到合理工资才完整恢复',()=>{
    const s=ready();buyCompanyComputers(s,'high',1,1);interviewCompany(s);hireCompanyEmployee(s,s.company!.candidates[0]!.id,1);const e=s.company!.employees[0]!;e.programming=e.design=10;e.quoteFactor=1;e.salaryCents=200000;e.satisfaction=20;e.underpaidDays=20;
    expect(raiseCompanySalary(s,e.id,2000.01).ok).toBe(true);expect(e.underpaidDays).toBe(20);expect(e.satisfaction).toBeLessThan(20.01);expect(e.requests?.raise).toBeUndefined();
    expect(raiseCompanySalary(s,e.id,3625).ok).toBe(true);expect(e.underpaidDays).toBe(0);expect(e.satisfaction).toBeCloseTo(35,2);
  });
  it('同日4+4+4按累计工时加班，完成一个任务后可切换另一条线',()=>{
    const s=ready();Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100});s.player.skills.programming=s.player.skills.design=10;buyCompanyComputers(s,'high',1,0);startCompanyProject(s,'programming','工具软件','medium');startCompanyProject(s,'design','平面设计','medium');
    const start=companyMinute(s);expect(founderCompanyWork(s,'programming',4).ok).toBe(true);expect(founderCompanyWork(s,'design',4).ok).toBe(true);expect(founderCompanyWork(s,'programming',4).ok).toBe(true);
    expect(s.company!.programming!.progress).toBeCloseTo(15,5);expect(s.company!.design!.progress).toBeCloseTo(7.5,5);expect(companyMinute(s)-start).toBe(720);expect(developmentWorkBudget(s).remainingMinutes).toBe(0);expect(founderCompanyWork(s,'design',4).ok).toBe(false);
    expect(s.player.attrs.stamina).toBeCloseTo(52,5);expect(s.player.attrs.health).toBeCloseTo(95,5);
  });
  it('只差1点维护只花32分钟；项目尾项不再强占4小时',()=>{
    const s=ready();s.player.skills.programming=10;buyCompanyComputers(s,'high',1,0);s.company!.royaltyCents=10000;let start=companyMinute(s);expect(founderCompanyWork(s,'maintenance',4).ok).toBe(true);expect(companyMinute(s)-start).toBe(32);expect(s.company!.maintenance).toBe(1);
    startCompanyProject(s,'programming','工具软件','small');s.company!.programming!.progress=99;start=companyMinute(s);expect(founderCompanyWork(s,'programming',4).ok).toBe(true);expect(companyMinute(s)-start).toBe(32);expect(s.company!.programming).toBeNull();expect(developmentWorkBudget(s).usedMinutes).toBe(64);
  });
  it('长推进与分段推进员工主次工时、工资和阶段款完全相同',()=>{
    const s=ready();const c=s.company!;c.employees=[{id:'e',name:'员工A',programming:10,design:10,stars:5,quoteFactor:1,salaryCents:308000,hired:true,role:'maintenance',secondaryRole:'design',joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:0,nextLeaveDay:99,leaveDays:[],requests:{}}];c.computers=[{id:'pc',tier:'high',costCents:500000,assignee:'e',seatIndex:1}];c.royaltyCents=10000;startCompanyProject(s,'design','平面设计','short',true);
    Object.assign(s.time,fromLinearDay(START_EPOCH+2),{hour:9,minute:0});c.cursor=companyMinute(s);delete c.accounting;
    const split=structuredClone(s);s.time.hour=17;processCompany(s);for(let h=10;h<=17;h++){split.time.hour=h;processCompany(split);}expect(s.company).toEqual(split.company);expect(c.maintenance).toBe(1);expect(c.design!.progress).toBeCloseTo(14,5);
  });
});
