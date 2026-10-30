// @vitest-environment jsdom
import {afterEach,it,expect} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import CompanyProjects from '../src/components/layout/CompanyProjects.svelte';
import {createInitialState} from '../src/game/core/state';
import {registerCompany,startCompanyProject,companyMinute} from '../src/game/core/company';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {fromLinearDay,START_EPOCH,weekdayOf} from '../src/game/core/calendar';

const apps:ReturnType<typeof mount>[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await unmount(app);document.body.replaceChildren();});
function show(){
  const s=createInitialState(149727);s.mode='eternal';s.player.money=100000;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total=5;s.developmentHistory!.byType={home_design:5};
  expect(registerCompany(s,'项目安排',2).ok).toBe(true);s.locationId='company_office_single';let day=100;while(weekdayOf(fromLinearDay(START_EPOCH+day))>=5)day++;
  Object.assign(s.time,fromLinearDay(START_EPOCH+day),{hour:13,minute:0});s.company!.cursor=companyMinute(s);startCompanyProject(s,'design','平面设计','small',true);
  s.company!.design!.progress=50;s.company!.employees.push({id:'employee-A',name:'员工A',programming:1,design:10,stars:5,quoteFactor:1,salaryCents:300000,hired:true,role:'design',secondaryRole:'idle',seatIndex:1,joinedMinute:s.company!.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:day,nextLeaveDay:999,leaveDays:[],requests:{}});
  s.company!.computers.push({id:'pc',tier:'high',costCents:650000,assignee:'employee-A',seatIndex:1});replaceState(s);
  const root=document.createElement('div');document.body.append(root);apps.push(mount(CompanyProjects,{target:root,props:{onWork(){},onTeam(){}}}));flushSync();return root;
}
it('实线保留50点，虚线显示员工下班后的57.5点，查看不推进时间或账目',()=>{
  const root=show(),before=JSON.stringify(gameState),bar=root.querySelector<HTMLElement>('[data-project-progress="design"]')!;
  expect(bar.dataset.currentProgress).toBe('50');expect(Number(bar.dataset.todayProgress)).toBeCloseTo(57.5);expect(bar.querySelector('progress')!.value).toBe(50);
  expect(bar.querySelector<HTMLElement>('.forecast-progress')!.style.width).toMatch(/^7.5/);expect(root.textContent).toContain('今日结束 57.5 点');expect(JSON.stringify(gameState)).toBe(before);
});
it('下一件规模的控件直接持久化，不改当前合同或当前进度',()=>{
  const root=show(),original=JSON.stringify(gameState.company!.design!.quote),select=root.querySelector<HTMLSelectElement>('[aria-label="设计下一项目规模"]')!;
  flushSync(()=>{select.value='medium';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(gameState.company!.design!.next).toEqual({topic:'平面设计',scale:'medium',mode:'contract'});expect(gameState.company!.design!.progress).toBe(50);expect(JSON.stringify(gameState.company!.design!.quote)).toBe(original);
});
it('立即换项目直接进入新建表单，旧项目完整留在暂停列表',()=>{
  const root=show(),button=[...root.querySelectorAll('button')].find(b=>b.textContent==='保留当前，另开项目')!;
  flushSync(()=>button.click());expect(gameState.company!.design).toBeNull();expect(gameState.company!.pending[0]!.progress).toBe(50);expect(root.querySelector('[aria-label="设计规模"]')).not.toBeNull();
});
