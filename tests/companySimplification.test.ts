import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,interviewCompany,hireCompanyEmployee,startCompanyProject,contributeCompanyWork,setCompanyNextProject,changeCompanyProject,processCompany,companyMinute} from '../src/game/core/company';
import {companyOverview} from '../src/game/core/companyOverview';
import {forecastCompanyToday} from '../src/game/core/companyToday';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {fromLinearDay,START_EPOCH,weekdayOf} from '../src/game/core/calendar';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';
import {COMPANY_OFFICES} from '../src/game/core/companyOffice';
import {officeLightScheme} from '../src/lib/officeLighting';
import type {CompanyEmployee} from '../src/game/companyTypes';
import * as THREE from 'three';

function ready(total=5){
  const s=createInitialState(149727);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';
  s.developmentHistory!.total=total;s.developmentHistory!.byType={home_design:5};expect(registerCompany(s,'简洁工作室',2).ok).toBe(true);s.locationId='company_office_single';return s;
}
function employee(s:ReturnType<typeof ready>,overrides:Partial<CompanyEmployee>={}){
  const e:CompanyEmployee={id:'employee-'+s.company!.employees.length,name:'员工'+String.fromCharCode(65+s.company!.employees.length),programming:10,design:1,stars:5,quoteFactor:1,salaryCents:300000,hired:true,
    role:'programming',secondaryRole:'design',seatIndex:s.company!.employees.length+1,joinedMinute:s.company!.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:0,nextLeaveDay:999,leaveDays:[],requests:{},...overrides};
  s.company!.employees.push(e);s.company!.computers.push({id:'pc-'+e.id,tier:'high',costCents:650000,assignee:e.id,seatIndex:e.seatIndex});return e;
}

describe('招聘由项目件数决定',()=>{
  it('新公司零现金、没有盈利周期也可录用；工资和欠薪仍按原机制结算',()=>{
    const s=ready(),c=s.company!;s.player.money=0;c.balanceCents=0;c.computers.push({id:'pc',tier:'low',costCents:50000,assignee:null,seatIndex:1});
    expect(c.accounting!.periods).toEqual([]);expect(interviewCompany(s).ok).toBe(true);expect(hireCompanyEmployee(s,c.candidates[0]!.id,1).ok).toBe(true);
    expect(c.employees).toHaveLength(1);expect(c.balanceCents).toBe(0);expect(c.employees[0]!.salaryCents).toBeGreaterThan(0);
  });
  it('9件只能招一人，第10件再开放一人；旧经营经验不增加名额',()=>{
    const s=ready(9),c=s.company!;c.recruitmentFloor=15;c.growthPoints=999999;
    for(let i=1;i<=2;i++)c.computers.push({id:'pc-'+i,tier:'mid',costCents:150000,assignee:null,seatIndex:i});
    interviewCompany(s);expect(hireCompanyEmployee(s,c.candidates[0]!.id,1).ok).toBe(true);expect(hireCompanyEmployee(s,c.candidates[1]!.id,2).ok).toBe(false);
    startCompanyProject(s,'design','平面设计','short');contributeCompanyWork(s,'design',40);
    expect(s.developmentHistory!.total).toBe(10);expect(hireCompanyEmployee(s,c.candidates[1]!.id,2).ok).toBe(true);
  });
  it('现有欠款不额外限制面试或录用，生产停工规则仍有效',()=>{
    const s=ready(),c=s.company!;c.liabilities=[{id:'rent',kind:'rent',amountCents:100,dueDay:0}];c.computers.push({id:'pc',tier:'low',costCents:50000,assignee:null});
    expect(interviewCompany(s).ok).toBe(true);expect(hireCompanyEmployee(s,c.candidates[0]!.id).ok).toBe(true);expect(companyOverview(s)!.stopped).toBe(true);
  });
  it('读档不解雇已在职人员，不用旧经验补发新岗位',()=>{
    const s=ready(),c=s.company!;employee(s);employee(s);c.recruitmentFloor=15;c.growthPoints=7000;
    const old=JSON.stringify(c.employees);normalizeCompanySave(s);expect(JSON.stringify(c.employees)).toBe(old);expect(companyOverview(s)!.unlocked).toBe(1);
  });
});

describe('下次开发与无损切换',()=>{
  it('小型当前项目照原合同完成，下一件变中型并接收本次多余工作量',()=>{
    const s=ready(),c=s.company!;startCompanyProject(s,'design','平面设计','small',true);contributeCompanyWork(s,'design',70);
    const old=structuredClone(c.design!);expect(setCompanyNextProject(s,'design',{topic:'平面设计',scale:'medium',mode:'contract'}).ok).toBe(true);
    expect(c.design!.progress).toBe(70);expect(c.design!.quote).toEqual(old.quote);contributeCompanyWork(s,'design',35);
    expect(c.design).toMatchObject({scale:'medium',progress:5,paidCents:0,paidMilestones:[]});expect(c.design!.quote!.priceCents).toBe(920000);expect(c.earnedCents).toBe(220000);
  });
  it('编程下一件可切委托短单，存档和暂停恢复保留安排',()=>{
    const s=ready(),c=s.company!;startCompanyProject(s,'programming','工具软件','small');contributeCompanyWork(s,'programming',90);
    expect(setCompanyNextProject(s,'programming',{topic:'工具软件',scale:'short',mode:'contract'}).ok).toBe(true);
    changeCompanyProject(s,'programming','pause');normalizeCompanySave(s);expect(c.pending[0]!.next!.scale).toBe('short');
    changeCompanyProject(s,'programming','pause',c.pending[0]!.id);contributeCompanyWork(s,'programming',12);
    expect(c.programming).toMatchObject({scale:'short',mode:'contract',progress:2});expect(c.royaltyCents).toBe(6000);
  });
  it('非法下一规模或类型不能改变当前项目、报价或账户',()=>{
    const s=ready();startCompanyProject(s,'design','平面设计','small');const before=JSON.stringify(s.company);
    expect(setCompanyNextProject(s,'design',{topic:'平面设计',scale:'large',mode:'contract'}).ok).toBe(false);
    expect(setCompanyNextProject(s,'design',{topic:'平面设计',scale:'short',mode:'product'}).ok).toBe(false);expect(JSON.stringify(s.company)).toBe(before);
  });
  it('立即另开项目可通过暂停保留全部已验收款、原进度和下一安排',()=>{
    const s=ready(),c=s.company!;startCompanyProject(s,'design','平面设计','medium');contributeCompanyWork(s,'design',210);const old=structuredClone(c.design!),cash=c.balanceCents;
    changeCompanyProject(s,'design','pause');expect(startCompanyProject(s,'design','品牌视觉','small').ok).toBe(true);
    expect(c.pending[0]).toEqual(old);expect(c.balanceCents).toBe(cash);expect(s.developmentHistory!.total).toBe(5);
  });
});

describe('今日虚线使用真实员工结算',()=>{
  function setup(){const s=ready();let day=100;while(weekdayOf(fromLinearDay(START_EPOCH+day))>=5)day++;Object.assign(s.time,fromLinearDay(START_EPOCH+day),{hour:13,minute:0});s.company!.cursor=companyMinute(s);s.company!.accounting=undefined;s.company!.balanceCents=1e6;employee(s);startCompanyProject(s,'programming','工具软件','small');startCompanyProject(s,'design','平面设计','small');return s;}
  it('只算今天剩余工时和员工，不更改时间、随机数、短信和账目',()=>{
    const s=setup(),before=JSON.stringify(s),f=forecastCompanyToday(s);expect(f.points.programming).toBeCloseTo(7.5);expect(f.progress.programming).toBeCloseTo(7.5);expect(f.points.design).toBe(0);expect(JSON.stringify(s)).toBe(before);
    s.time.hour=17;processCompany(s);expect(s.company!.programming!.progress).toBeCloseTo(f.progress.programming);
  });
  it('当前项目尾项封顶，剩余工时转给次要工作，休假人员不参与',()=>{
    const s=setup();s.company!.programming!.progress=99;const absent=employee(s,{leaveDays:[Math.floor(companyMinute(s)/1440)]});const f=forecastCompanyToday(s);
    expect(absent.leaveDays).toHaveLength(1);expect(f.progress.programming).toBe(100);expect(f.points.programming).toBeCloseTo(1);expect(f.points.design).toBeCloseTo(10*(4-1/1.875)/8);
    s.time.hour=17;processCompany(s);expect(s.company!.programming).toBeNull();expect(s.company!.design!.progress).toBeCloseTo(f.progress.design);
  });
  it('连续开发仍完整统计今天推进，当前条封顶且不把下一件进度误画成倒退',()=>{
    const s=setup();s.company!.programming!.progress=99;s.company!.programming!.repeat=true;const f=forecastCompanyToday(s);
    expect(f.progress.programming).toBe(100);expect(f.points.programming).toBeCloseTo(7.5);expect(f.total).toBeCloseTo(7.5);
  });
  it('周末、下班、欠款及缺少电脑均不会凭空增加预计进度',()=>{
    const s=setup();s.company!.liabilities=[{id:'due',kind:'salary',amountCents:1,dueDay:0}];expect(forecastCompanyToday(s).total).toBe(0);s.company!.liabilities=[];
    s.company!.computers=[];expect(forecastCompanyToday(s).total).toBe(0);s.time.hour=22;expect(forecastCompanyToday(s).total).toBe(0);
    let day=100;while(weekdayOf(fromLinearDay(START_EPOCH+day))<5)day++;Object.assign(s.time,fromLinearDay(START_EPOCH+day),{hour:9,minute:0});expect(forecastCompanyToday(s).workingDay).toBe(false);
  });
});

describe('办公室背景的楼层与资源归属',()=>{
  it.each([1,2,3,4])('阶段%i拥有连续街区且地面在真实楼层下方，不改变工位或相机',stage=>{
    const plan=COMPANY_OFFICES[stage-1]!,m=buildCompanyOffice(plan),district=m.root.getObjectByName('office-district-background')!;
    try{expect(district).toBeDefined();expect(district.userData.groundY).toBeCloseTo(-(m.address.floor-1)*3.2-.24);expect(district.getObjectByName('district-tree-crowns')).toBeInstanceOf(THREE.InstancedMesh);
      expect(new THREE.Box3().setFromObject(district).getSize(new THREE.Vector3()).x).toBeGreaterThan(400);expect(m.framingBounds.getSize(new THREE.Vector3()).x).toBeLessThan(plan.size[0]+2);
      expect(m.workstations).toHaveLength(plan.desks.length);m.setLighting(officeLightScheme(22,11));expect(m.entry.userData.seat).toBe(-1);
    }finally{m.dispose();expect(district.children).toHaveLength(0);}
  });
});
