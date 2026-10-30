import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,transferCompanyMoney,startCompanyProject,contributeCompanyWork} from '../src/game/core/company';
import {closeCompany,companyClosureQuote} from '../src/game/core/companyLifecycle';
import {companyPayoutQuote} from '../src/game/core/companyTax';
import {companyAccountingOverview} from '../src/game/core/companyAccounting';
import {companyOverview} from '../src/game/core/companyOverview';
import {normalizeCompanySave} from '../src/game/core/companyMigration';
import {gameDay} from '../src/game/core/calendar';
import {forecastCompanyCash} from '../src/game/core/companyForecast';
import {COMPANY_OFFICES,officeBuildingFootprint} from '../src/game/core/companyOffice';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';
import {officeCameraLimits,constrainOfficeCamera} from '../src/lib/companyCamera';
import {HOME_TOUR_GROUPS,homeTourLevel} from '../src/game/core/homeTourCatalog';
import {HOME_TOUR_RESIDENCES} from '../src/game/core/homeInterior';

function ready(){const s=createInitialState(149727);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total=10;s.developmentHistory!.byType={home_design:10};expect(registerCompany(s,'参观与税务',2).ok).toBe(true);s.locationId='company_office_single';normalizeCompanySave(s);return s;}
describe('公司转出时先扣20%税',()=>{
  it('提现1000元，公司扣1000，个人实收800，200记税，不重复计账',()=>{
    const s=ready(),c=s.company!;s.player.money=123.45;c.balanceCents=100000;
    expect(transferCompanyMoney(s,1000,'withdraw').ok).toBe(true);expect(s.player.money).toBe(923.45);expect(c.balanceCents).toBe(0);
    expect(companyAccountingOverview(c)).toMatchObject({ownerOutCents:80000,otherCostCents:20000});expect(c.ledger.filter(e=>e.kind==='withdrawal_tax')).toHaveLength(1);
    const before=structuredClone(s);normalizeCompanySave(s);expect(s).toEqual(before);
  });
  it('注资和项目入账不扣税；工资欠款预留不能通过税前金额绕过',()=>{
    const s=ready(),c=s.company!;c.balanceCents=0;s.player.money=1000;
    expect(transferCompanyMoney(s,1000,'deposit').ok).toBe(true);expect(c.balanceCents).toBe(100000);expect(c.ledger.some(e=>e.kind==='withdrawal_tax')).toBe(false);
    startCompanyProject(s,'design','平面设计','small');contributeCompanyWork(s,'design',100);expect(c.balanceCents).toBe(320000);
    c.liabilities=[{id:'wage',kind:'salary',amountCents:100000,dueDay:gameDay(s.time)}];const before=JSON.stringify(s);
    expect(transferCompanyMoney(s,2200.01,'withdraw').ok).toBe(false);expect(JSON.stringify(s)).toBe(before);expect(companyOverview(s)!.withdrawableCents).toBe(220000);
  });
  it('最小货币单位向上扣税，拆分小额转账不能规避20%',()=>{
    expect(companyPayoutQuote(100000)).toEqual({grossCents:100000,taxCents:20000,netCents:80000});
    for(const cents of [1,2,4,5,6,101,999])expect(companyPayoutQuote(cents).taxCents).toBeGreaterThanOrEqual(cents*.2);
  });
  it('停业清算剩余资金也统一扣税，二次停业不再次扣钱',()=>{
    const s=ready(),c=s.company!;c.balanceCents=100000;c.depositCents=100000;c.nextRentDay=gameDay(s.time);s.locationId='municipal_hall';s.player.money=0;
    expect(companyClosureQuote(s)).toMatchObject({grossReturnCents:200000,taxCents:40000,returnCents:160000});
    expect(closeCompany(s).ok).toBe(true);expect(s.player.money).toBe(1600);expect(c.balanceCents).toBe(0);expect(c.ledger.filter(e=>e.kind==='withdrawal_tax')).toHaveLength(1);expect(c.ledger.find(e=>e.kind==='closure')!.amountCents).toBe(0);
    const old=JSON.stringify(s);expect(closeCompany(s).ok).toBe(false);expect(JSON.stringify(s)).toBe(old);
  });
});
describe('简洁月度收支预测',()=>{
  it('按已安排连续项目预测后续回款，不修改实际项目或现金',()=>{
    const s=ready(),c=s.company!;c.balanceCents=1e7;startCompanyProject(s,'design','平面设计','short',true);
    c.employees.push({id:'e',name:'员工A',programming:1,design:10,stars:5,quoteFactor:1,salaryCents:300000,hired:true,role:'design',secondaryRole:'idle',seatIndex:1,joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:0,nextLeaveDay:999,leaveDays:[],requests:{}});
    c.computers.push({id:'pc',tier:'high',costCents:650000,assignee:'e',seatIndex:1});
    const before=JSON.stringify(s),single=forecastCompanyCash(s),repeat=forecastCompanyCash(s,{includeRepeat:true});
    const income=(f:typeof repeat)=>f.events.filter(e=>e.kind==='project').reduce((n,e)=>n+e.amountCents,0);
    expect(income(single)).toBe(85000);expect(income(repeat)).toBeGreaterThan(85000);expect(companyOverview(s)!.monthlyFixedCents).toBe(500000);expect(JSON.stringify(s)).toBe(before);
  });
});
describe('办公室镜头始终围绕办公室与走廊',()=>{
  it.each([1,2,3,4])('阶段%i反复向地图边缘拖拽也不能移出目标边界、地下或无限缩放',stage=>{
    const p=COMPANY_OFFICES[stage-1]!,center=new THREE.Vector3(p.size[0]/2,.3,(p.size[1]+3)/2),limits=officeCameraLimits(p,center,24),camera=new THREE.PerspectiveCamera(38,1,.1,180),target=center.clone();
    camera.position.copy(center).add(new THREE.Vector3(12,22,22));
    for(let i=0;i<50;i++){const pan=new THREE.Vector3(i%2?999:-999,i%3?999:-999,999);target.add(pan);camera.position.add(pan);constrainOfficeCamera(camera,target,limits);}
    expect(target.x).toBeGreaterThanOrEqual(limits.minTarget[0]!);expect(target.x).toBeLessThanOrEqual(limits.maxTarget[0]!);expect(target.z).toBeLessThanOrEqual(limits.maxTarget[2]!);expect(target.y).toBe(.3);
    const pose=new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));expect(pose.radius).toBeLessThanOrEqual(limits.maxDistance+1e-8);expect(pose.phi).toBeLessThanOrEqual(limits.maxPolarAngle+1e-8);expect(pose.phi).toBeGreaterThanOrEqual(limits.minPolarAngle-1e-8);
  });
  it.each([1,2,3])('阶段%i办公室面积不变，外围为更大楼层和不透明邻公司屋顶',stage=>{
    const p=COMPANY_OFFICES[stage-1]!,f=officeBuildingFootprint(p),m=buildCompanyOffice(p);
    try{expect(f.width*f.depth).toBeGreaterThan(p.size[0]*p.size[1]*2);const shell=m.root.getObjectByName('neighbour-office-shells')!;expect(shell.userData.opaqueCeilings).toBe(true);const ceilings:THREE.Object3D[]=[];shell.traverse(o=>{if(o.name.endsWith('office-ceiling'))ceilings.push(o);});expect(ceilings).toHaveLength(3);expect(m.workstations).toHaveLength(p.desks.length);
      const doors:THREE.Object3D[]=[];m.root.traverse(o=>{if(o.userData.followsWall)doors.push(o);});expect(doors).toHaveLength(stage===3?2:5);
      for(const door of doors)expect(m.walls.some(w=>w.group===door)).toBe(true);
      for(const wall of m.walls)wall.group.scale.y=.2;m.root.updateMatrixWorld(true);
      for(const door of doors)expect(new THREE.Box3().setFromObject(door).getSize(new THREE.Vector3()).y).toBeLessThan(.7);
      expect(new THREE.Box3().setFromObject(m.entry).getSize(new THREE.Vector3()).y).toBeGreaterThan(2);
    }finally{m.dispose();}
  });
  it('整层不加邻公司壳层，仍通过专用电梯离开',()=>{
    const m=buildCompanyOffice(COMPANY_OFFICES[3]!);try{expect(m.root.getObjectByName('neighbour-office-shells')).toBeUndefined();expect(m.entry.userData.elevator).toBe(true);}finally{m.dispose();}
  });
});
describe('住所参观分类',()=>{
  it('遵照用户给定类别，人才公寓不按低租金错分到一级',()=>{
    for(const id of ['old_apartment','suburb_room','minsu'])expect(homeTourLevel(id)).toBe('basic');
    for(const id of ['rental_apartment','boyue_talent_apartment','hotel','hotel_mooncourt'])expect(homeTourLevel(id)).toBe('comfortable');
    for(const id of ['own_villa','lease_villa','own_apartment','lease_premium_apartment'])expect(homeTourLevel(id)).toBe('premium');
  });
  it('三个类别各自有房源，同名租售入口合并，所有原有房源名称仍可找到',()=>{
    const homes=HOME_TOUR_GROUPS.flatMap(g=>g.homes),names=new Set(homes.map(h=>h.name));expect(homes.length).toBe(names.size);
    for(const home of HOME_TOUR_RESIDENCES)expect(names.has(home.name)).toBe(true);for(const group of HOME_TOUR_GROUPS)expect(group.homes.length).toBeGreaterThan(0);
  });
});
