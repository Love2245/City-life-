// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import CompanyInterior from '../src/components/layout/CompanyInterior.svelte';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,companyMinute,startCompanyProject,processCompany} from '../src/game/core/company';
import {companyStage,companyHourlyWork} from '../src/game/core/companyConfig';
import {advanceHours} from '../src/game/core/time';
import {gameDay,weekdayOf} from '../src/game/core/calendar';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';

const fake=vi.hoisted(()=>({views:[] as {mode:string;update:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[],loaders:[] as {retry:()=>void}[]}));
vi.mock('../src/stores/sceneLoading.svelte',()=>({sceneLoading:{current:null},beginSceneLoading:vi.fn((options:{retry:()=>void})=>{fake.loaders.push(options);return{id:fake.loaders.length,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()};}),markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn()}));
vi.mock('../src/lib/companyOffice3D',()=>({createCompanyOffice:()=>{const view={mode:'3d',update:vi.fn(),dispose:vi.fn(),ready:Promise.resolve(),setWalls(){},setQuality(){},setResolution(){},rotate(){},reset(){}};fake.views.push(view);return view;}}));
vi.mock('../src/lib/companyStillView',()=>({createCompanyStill:()=>{const view={mode:'2d',update:vi.fn(),dispose:vi.fn(),ready:Promise.resolve(),setWalls(){},setQuality(){},setResolution(){},rotate(){},reset(){},zoom(){},resetView(){}};fake.views.push(view);return view;}}));
const mounted:ReturnType<typeof mount>[]=[];
afterEach(async()=>{for(const component of mounted.splice(0))await unmount(component);document.body.replaceChildren();localStorage.clear();fake.views=[];fake.loaders=[];uiState.modal=null;});
function state(){const s=createInitialState(149743);s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });expect(registerCompany(s,'日夜办公室').ok).toBe(true);s.locationId=companyStage(1).location;while(weekdayOf(s.time)>=5)s.time.day++;s.time.hour=16;s.time.minute=45;s.weather={id:'rain',lastRollDay:gameDay(s.time)};s.company!.employees.push({id:'light-worker',name:'员工A',stars:3,programming:5,design:4,quoteFactor:1,salaryCents:200000,hired:true,role:'programming',joinedMinute:companyMinute(s),accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:-100,nextLeaveDay:gameDay(s.time)+30,leaveDays:[],seatIndex:1});return s;}
describe('办公室真实组件传递游戏分钟、天气、季节和员工排班',()=>{
  it.each(['3d','2d'] as const)('%s初次和后续更新保留天气，16:59→17:00员工下班不重建场景',async mode=>{
    const s=state();replaceState(s);uiState.sceneMode=mode;uiState.modal=null;const target=document.createElement('div');document.body.append(target);mounted.push(mount(CompanyInterior,{target,props:{onExit:vi.fn()}}));flushSync();
    await vi.waitFor(()=>{flushSync();expect(fake.views).toHaveLength(1);expect(fake.views[0]!.update).toHaveBeenCalled();});
    const view=fake.views[0]!;expect(view.mode).toBe(mode);
    expect(view.update.mock.lastCall!.slice(1)).toEqual([16.75,'rain',s.time.month]);
    expect(view.update.mock.lastCall![0][1].present).toBe(true);
    flushSync(()=>{gameState.time.minute=59;gameState.weather.id='snow';gameState.time.month=12;});
    expect(view.update.mock.lastCall!.slice(1)).toEqual([16+59/60,'snow',12]);
    flushSync(()=>{gameState.time.hour=17;gameState.time.minute=0;});
    expect(view.update.mock.lastCall!.slice(1)).toEqual([17,'snow',12]);expect(view.update.mock.lastCall![0][1].present).toBe(false);
    expect(fake.views).toHaveLength(1);expect(view.dispose).not.toHaveBeenCalled();
    const time=JSON.stringify(gameState.time),cash=gameState.player.money,company=JSON.stringify(gameState.company);
    fake.loaders[0]!.retry();
    await vi.waitFor(()=>{flushSync();expect(fake.views).toHaveLength(2);expect(fake.views[1]!.update).toHaveBeenCalled();});
    expect(view.dispose).toHaveBeenCalledOnce();expect(fake.views[1]!.update.mock.lastCall!.slice(1)).toEqual([17,'snow',12]);
    expect(JSON.stringify(gameState.time)).toBe(time);expect(gameState.player.money).toBe(cash);expect(JSON.stringify(gameState.company)).toBe(company);
    await unmount(mounted.pop()!);expect(fake.views[1]!.dispose).toHaveBeenCalledOnce();
  });
  it('实际等待按钮由10点推进到11点，员工开发与工资计提经过原时间引擎一次，菜单随操作关闭',async()=>{
    const s=state();s.time.hour=10;s.time.minute=0;s.company!.cursor=companyMinute(s);s.company!.employees[0]!.joinedMinute=companyMinute(s);
    s.company!.computers.push({id:'employee-pc',tier:'high',costCents:500000,assignee:'light-worker',seatIndex:1});expect(startCompanyProject(s,'programming','工具软件','small').ok).toBe(true);
    replaceState(s);uiState.sceneMode='2d';uiState.modal=null;const target=document.createElement('div');document.body.append(target);const wait=vi.fn((hours:number)=>advanceHours(gameState,hours));
    mounted.push(mount(CompanyInterior,{target,props:{onExit:vi.fn(),waitOptions:[{hours:1,label:'等待1小时'},{hours:2,label:'等待2小时'}],onWait:wait}}));flushSync();
    await vi.waitFor(()=>{flushSync();expect(fake.views[0]?.update).toHaveBeenCalled();});expect(gameState.time.hour).toBe(10);
    flushSync(()=>target.querySelector<HTMLButtonElement>('[aria-label="办公室等待"]')!.click());
    const menu=target.querySelector('[aria-label="办公室等待时长"]')!;expect(menu.textContent).toContain('工资租金正常计算');
    flushSync(()=>[...menu.querySelectorAll('button')].find(button=>button.textContent==='等待1小时')!.click());
    expect(wait).toHaveBeenCalledExactlyOnceWith(1);expect(gameState.time.hour).toBe(11);expect(gameState.time.minute).toBe(0);
    expect(gameState.company!.programming!.progress).toBeCloseTo(companyHourlyWork(5,'high'),5);
    expect(gameState.company!.employees[0]!.accruedUnits).toBe(200000*60);
    expect(target.querySelector('[aria-label="办公室等待时长"]')).toBeNull();
    flushSync(()=>target.querySelector<HTMLButtonElement>('[aria-label="办公室等待"]')!.click());
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));flushSync();expect(target.querySelector('[aria-label="办公室等待时长"]')).toBeNull();
  });
  it('等待跨午夜发薪及房租各结算一次，重复读取场景不再次扣款',async()=>{
    const s=state();s.time.hour=23;s.time.minute=30;const c=s.company!,due=gameDay(s.time)+1;c.cursor=companyMinute(s);c.balanceCents=10000000;c.nextPayDay=due;c.nextRentDay=due;c.employees[0]!.accruedUnits=c.employees[0]!.salaryCents*15*1440;
    replaceState(s);uiState.sceneMode='2d';uiState.modal=null;const target=document.createElement('div');document.body.append(target);
    mounted.push(mount(CompanyInterior,{target,props:{onExit:vi.fn(),waitOptions:[{hours:1,label:'等待1小时'}],onWait:(hours:number)=>advanceHours(gameState,hours)}}));flushSync();
    await vi.waitFor(()=>{flushSync();expect(fake.views[0]?.update).toHaveBeenCalled();});
    flushSync(()=>target.querySelector<HTMLButtonElement>('[aria-label="办公室等待"]')!.click());flushSync(()=>target.querySelector<HTMLButtonElement>('.company-wait button')!.click());
    expect(gameState.time.hour).toBe(0);expect(gameState.time.minute).toBe(30);expect(gameState.company!.nextPayDay).toBe(due+30);expect(gameState.company!.nextRentDay).toBe(due+30);
    expect(gameState.company!.ledger.filter(entry=>entry.kind==='salary')).toHaveLength(1);expect(gameState.company!.ledger.filter(entry=>entry.kind==='rent')).toHaveLength(1);
    const balance=gameState.company!.balanceCents;processCompany(gameState);flushSync();expect(gameState.company!.balanceCents).toBe(balance);
    expect(gameState.company!.ledger.filter(entry=>entry.kind==='salary')).toHaveLength(1);expect(gameState.company!.ledger.filter(entry=>entry.kind==='rent')).toHaveLength(1);
  });
});
