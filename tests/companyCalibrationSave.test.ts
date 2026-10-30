import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,startCompanyProject,contributeCompanyWork,companyMinute,processCompany,changeCompanyProject} from '../src/game/core/company';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {normalizePersonalDevelopment} from '../src/game/core/projects';
import {COMPANY_SCALES,companyStage} from '../src/game/core/companyConfig';
import {fromLinearDay,START_EPOCH} from '../src/game/core/calendar';
import {companyOverview} from '../src/game/core/companyOverview';
import {companyProjectTerms} from '../src/game/core/companyProjects';

function ready(){const s=createInitialState(149726);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.developmentHistory!.total = 5; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });s.locationId='municipal_hall';expect(registerCompany(s,'经济兼容样本',2).ok).toBe(true);s.locationId='company_office_single';return s;}
describe('20261026经济规则只对新约生效',()=>{
  it('新公司与新合同使用新报价，规模经验和工时没有改动',()=>{
    const s=ready();expect(s.company!.economyVersion).toBe(2);expect(companyStage(2).cap).toBe(1000);expect(companyOverview(s)!.unlocked).toBe(1);
    startCompanyProject(s,'design','平面设计','medium');expect(s.company!.design!.quote).toMatchObject({work:400,priceCents:920000,growthPoints:400,milestones:[{progress:200,amountCents:276000},{progress:400,amountCents:644000}]});
    contributeCompanyWork(s,'design',400);expect(s.company!.earnedCents).toBe(920000);expect(s.company!.growthPoints).toBe(400);expect(COMPANY_SCALES.large.work).toBe(1200);
  });
  it('旧37版已付阶段、已签报价和工资不重定价，再次载入没有任何补收补发',()=>{
    const s=ready(),c=s.company!;delete c.economyVersion;c.balanceCents=420000;c.earnedCents=420000;
    c.design={id:'old-design',lane:'design',topic:'界面设计',scale:'medium',progress:200,mode:'contract',repeat:true,quote:{work:400,priceCents:1400000,royaltyCents:0,growthPoints:400,milestones:[{progress:200,amountCents:420000},{progress:400,amountCents:980000}]},paidMilestones:[0],paidCents:420000};
    const before=structuredClone(c);normalizeCompanySave(s);expect(c.balanceCents).toBe(before.balanceCents);expect(c.design).toEqual(before.design);expect(c.earnedCents).toBe(before.earnedCents);
    const once=structuredClone(s);normalizeCompanySave(s);expect(s).toEqual(once);contributeCompanyWork(s,'design',200);expect(c.balanceCents).toBe(1400000);expect(c.design!.quote!.priceCents).toBe(920000);expect(c.design!.paidCents).toBe(0);expect(c.design!.paidMilestones).toEqual([]);
  });
  it('无报价字段的36版设计保留14000尾款，旧作品版税按旧上限兑现，下一件才用新标准',()=>{
    const s=ready(),c=s.company!;delete c.economyVersion;delete c.managementVersion;s.version=36;
    c.design={id:'legacy-design',lane:'design',topic:'平面设计',scale:'medium',progress:300,repeat:false};c.programming={id:'legacy-code',lane:'programming',topic:'工具软件',scale:'medium',progress:399,repeat:true};
    normalizeCompanySave(s);expect(companyProjectTerms(c.design!).priceCents).toBe(1400000);expect(companyProjectTerms(c.programming!)).toMatchObject({royaltyCents:132000,minimumRoyaltyCapCents:750000});
    contributeCompanyWork(s,'programming',1);expect(c.royaltyCents).toBe(132000);expect(c.programming!.quote!.royaltyCents).toBe(24000);expect(c.programming!.quote!.minimumRoyaltyCapCents).toBeUndefined();
    contributeCompanyWork(s,'design',100);expect(c.balanceCents).toBe(1400000);changeCompanyProject(s,'programming','cancel');
  });
  it('已获得的30000元周版税在小办公室照常完整到账，迁移不按新1000上限削减',()=>{
    const s=ready(),c=s.company!;delete c.economyVersion;c.royaltyCents=3000000;c.balanceCents=0;normalizeCompanySave(s);expect(c.royaltyCents).toBe(3000000);
    Object.assign(s.time,fromLinearDay(START_EPOCH+2),{hour:0,minute:0});processCompany(s);expect(c.balanceCents).toBe(3000000);expect(c.royaltyCents).toBe(2700000);const before=structuredClone(c);processCompany(s);expect(c).toEqual(before);
  });
  it('旧个人1000元现金单注册后保留在途价，完成后新连续单为850，个人旧报价已清除',()=>{
    const s=createInitialState(149726);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });delete s.flags.development_economy_v2;s.career.projects.personal_programming_order=20;normalizePersonalDevelopment(s);expect(registerCompany(s,'承接现金单',2).ok).toBe(true);
    const c=s.company!;expect(c.programming).toMatchObject({scale:'short',progress:20,sourceId:'personal_programming_order',quote:{work:40,priceCents:100000}});expect(s.flags.personal_development_contract_quote_personal_programming_order).toBeUndefined();
    c.programming!.repeat=true;contributeCompanyWork(s,'programming',20);expect(c.balanceCents).toBe(100000);expect(c.programming!.quote!.priceCents).toBe(85000);
  });
  it('旧个人在途版税保留基础450和1500上限，转公司后使用同一约定',()=>{
    const s=createInitialState(149726);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.player.skills.programming=10;s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });delete s.flags.development_economy_v2;s.career.projects.indie_game=50;
    expect(registerCompany(s,'承接旧作品',2).ok).toBe(true);const c=s.company!;expect(c.programming!.quote).toMatchObject({royaltyCents:45000,minimumRoyaltyCapCents:150000});expect(s.flags.personal_development_royalty_quote_indie_game).toBeUndefined();contributeCompanyWork(s,'programming',50);expect(c.royaltyCents).toBe(45000);
  });
  it('查看报价概况或重复日结不改变现金、时间与随机数',()=>{const s=ready();startCompanyProject(s,'design','平面设计','small');const before=structuredClone(s),minute=companyMinute(s);companyOverview(s);companyProjectTerms(s.company!.design!);processCompany(s);expect(s).toEqual(before);expect(companyMinute(s)).toBe(minute);});
});
