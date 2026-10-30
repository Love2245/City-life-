import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {companyMinute,registerCompany,buyCompanyComputers,startCompanyProject,founderCompanyWork,interviewCompany,hireCompanyEmployee,assignCompanyEmployee,processCompany} from '../src/game/core/company';
import {COMPANY_SCALES,companyDailyWork,companySkillMultiplier,companyRoyaltyAddition} from '../src/game/core/companyConfig';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {companyOverview} from '../src/game/core/companyOverview';
import type {CompanyLane,CompanyScale} from '../src/game/companyTypes';
import {fromLinearDay,START_EPOCH,weekdayOf} from '../src/game/core/calendar';
import { primeHiringGate } from './helpers/companyGate';

function ready(){const s=createInitialState(149725);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 75; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });expect(registerCompany(s,'效率校验',2).ok).toBe(true);primeHiringGate(s);s.locationId='company_office_single';return s;}
function setClock(s:ReturnType<typeof ready>,day:number,hour:number){Object.assign(s.time,fromLinearDay(START_EPOCH+day),{hour,minute:0});s.company!.cursor=companyMinute(s);}
function nextWeekday(s:ReturnType<typeof ready>){let d=Math.floor(s.company!.cursor/1440)+1;while(weekdayOf(fromLinearDay(START_EPOCH+d))>=5)d++;setClock(s,d,9);}

describe('统一工作量、主角与员工效率',()=>{
  it.each([[0,'low',5],[1,'low',5],[1,'mid',7.5],[1,'high',10],[10,'low',7.5],[10,'mid',11.25],[10,'high',15]] as const)('技能%i、%s电脑的标准日为%i点',(skill,tier,expected)=>{expect(companyDailyWork(skill,tier)).toBeCloseTo(expected,8);});
  it('技能加成最高1.5倍，不再因技能与设备相加产生额外倍数',()=>{expect(companySkillMultiplier(1)).toBe(1);expect(companySkillMultiplier(10)).toBe(1.5);expect(companySkillMultiplier(20)).toBe(1.5);});
  it.each(['programming','design'] as CompanyLane[])('%s：同技能设备的主角8小时与员工完整工作日贡献相同',lane=>{
    const s=ready();expect(buyCompanyComputers(s,'high',1,0).ok).toBe(true);expect(buyCompanyComputers(s,'high',1,1).ok).toBe(true);interviewCompany(s);hireCompanyEmployee(s,s.company!.candidates[0]!.id,1);
    const e=s.company!.employees[0]!;e.programming=e.design=10;s.player.skills.programming=s.player.skills.design=10;nextWeekday(s);startCompanyProject(s,lane,lane==='design'?'界面设计':'工具软件','medium');
    const employeeState=structuredClone(s);assignCompanyEmployee(employeeState,e.id,lane);
    const day=Math.floor(employeeState.company!.cursor/1440);setClock(employeeState,day,17);employeeState.company!.cursor-=480;processCompany(employeeState);
    expect(founderCompanyWork(s,lane,8).ok).toBe(true);expect(s.company![lane]!.progress).toBe(15);expect(employeeState.company![lane]!.progress).toBe(15);
  });
  it.each([[4,7.5],[8,15],[12,22.5]])('满级顶配%i小时贡献%s点且真实消耗所选时间',(hours,points)=>{const s=ready();s.player.skills.programming=10;buyCompanyComputers(s,'high',1,0);startCompanyProject(s,'programming','工具软件','medium');const before=companyMinute(s);expect(founderCompanyWork(s,'programming',hours).ok).toBe(true);expect(s.company!.programming!.progress).toBe(points);expect(companyMinute(s)-before).toBe(hours*60);});
  it('100/400/1200是绝对工作量：相同工作各增加12点，比例各不相同',()=>{
    const values=[];for(const scale of ['small','medium','large'] as CompanyScale[]){const s=ready();s.company!.stage=3;s.locationId='company_office_large';s.player.skills.design=10;buyCompanyComputers(s,'high',1,0);startCompanyProject(s,'design','界面设计',scale);founderCompanyWork(s,'design',8);values.push(s.company!.design!.progress/COMPANY_SCALES[scale].work);}
    expect(values).toEqual([.15,.0375,.0125]);
  });
});

describe('旧版公司工作量迁移与收益',()=>{
  it('活动双线与暂停列表按原比例迁移一次，资金、工资、版税、维护和交付历史保持不变',()=>{
    const s=ready();const c=s.company!;delete c.workBalanceVersion;delete c.economyVersion;
    c.programming={id:'old-code',lane:'programming',topic:'工具软件',scale:'small',progress:30,repeat:true};c.design={id:'old-design',lane:'design',topic:'界面设计',scale:'medium',progress:120,repeat:false};c.pending=[{id:'old-large',lane:'programming',topic:'游戏',scale:'large',progress:360,repeat:true}];c.royaltyCents=600000;c.maintenance=8;c.balanceCents=123456;
    const before=structuredClone(s),raw={cash:c.balanceCents,royalty:c.royaltyCents,maintenance:c.maintenance,pay:c.nextPayDay,rent:c.nextRentDay,ledger:structuredClone(c.ledger),history:structuredClone(s.developmentHistory)};
    normalizeCompanySave(s);expect(c.programming.progress).toBe(50);expect(c.design.progress).toBe(200);expect(c.pending[0]!.progress).toBe(600);
    expect(c.programming.quote).toMatchObject({royaltyCents:30000,minimumRoyaltyCapCents:750000});
    expect(c.design.quote).toMatchObject({priceCents:1400000,milestones:[{progress:400,amountCents:1400000}]});
    expect(c.pending[0]!.quote).toMatchObject({royaltyCents:432000,minimumRoyaltyCapCents:750000});
    expect({cash:c.balanceCents,royalty:c.royaltyCents,maintenance:c.maintenance,pay:c.nextPayDay,rent:c.nextRentDay,ledger:c.ledger,history:s.developmentHistory}).toEqual(raw);expect(s.player.money).toBe(before.player.money);
    const once=structuredClone(c);normalizeCompanySave(s);expect(c).toEqual(once);
  });
  it('旧档越界进度和未知平衡版本不作为正常迁移吞掉',()=>{const s=ready();delete s.company!.workBalanceVersion;s.company!.programming={id:'bad-old',lane:'programming',topic:'工具软件',scale:'small',progress:60,repeat:false};expect(()=>normalizeCompanySave(s)).toThrow('损坏');s.company!.programming=null;s.company!.workBalanceVersion=99;expect(()=>normalizeCompanySave(s)).toThrow('损坏');});
  it.each([['small',60,2200],['medium',240,9200],['large',720,30000]] as const)('%s新合同交付只领取一次新收益，连续开发余量按点保留',(scale,royalty,design)=>{
    for(const lane of ['programming','design'] as const){const s=ready();s.company!.stage=3;s.locationId='company_office_large';s.player.skills.programming=s.player.skills.design=10;buyCompanyComputers(s,'high',1,0);startCompanyProject(s,lane,lane==='design'?'界面设计':'工具软件',scale,true);s.company![lane]!.progress=COMPANY_SCALES[scale].work-1;const before=s.developmentHistory!.total;founderCompanyWork(s,lane,8);expect(s.developmentHistory!.total).toBe(before+1);expect(s.company![lane]!.progress).toBe(14);if(lane==='programming')expect(s.company!.royaltyCents).toBe(royalty*100);else expect(s.company!.earnedCents).toBe(design*100);const snapshot=structuredClone(s.company);processCompany(s);expect(s.company).toEqual(snapshot);}
  });
  it('新编程收益按600元上限逐档递减，封顶不增；固定开支与按30天折算版税是只读概况',()=>{expect(companyRoyaltyAddition(0,1,'small')).toBe(6000);expect(companyRoyaltyAddition(20000,1,'small')).toBe(4200);expect(companyRoyaltyAddition(40000,1,'small')).toBe(2400);expect(companyRoyaltyAddition(59999,1,'large')).toBe(1);expect(companyRoyaltyAddition(60000,1,'small')).toBe(0);const s=ready();s.company!.royaltyCents=70000;const before=JSON.stringify(s);const o=companyOverview(s)!;expect(o.royaltyMonthlyCents).toBe(300000);expect(o.monthlyFixedCents).toBe(200000);expect(o.royaltyMarginCents).toBe(100000);expect(JSON.stringify(s)).toBe(before);});
});
