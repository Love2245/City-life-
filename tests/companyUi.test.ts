// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CompanyPanel from '../src/components/layout/CompanyPanel.svelte';
import CompanyInterior from '../src/components/layout/CompanyInterior.svelte';
import ServiceWindows from '../src/components/layout/ServiceWindows.svelte';
import LaptopDesktop from '../src/components/layout/LaptopDesktopView.svelte';
import PhoneWorkspace from '../src/components/PhoneScreenWorkspace.svelte';
import { createInitialState } from '../src/game/core/state';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState } from '../src/stores/uiStore.svelte';
import { registerCompany, buyCompanyComputers, assignCompanyComputer, startCompanyProject, interviewCompany, hireCompanyEmployee } from '../src/game/core/company';
import { companyStage } from '../src/game/core/companyConfig';
import { saveGameImmediately, loadGame } from '../src/lib/save';
import { primeHiringGate } from './helpers/companyGate';

vi.mock('../src/stores/sceneLoading.svelte',()=>({sceneLoading:{current:null},beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn()}));
vi.mock('../src/lib/companyStillView',async()=>{
  const {COMPANY_OFFICES}=await import('../src/game/core/companyOffice');
  return{createCompanyStill:(_host:HTMLElement,stage:number,onLabels:(labels:any[])=>void)=>({ready:Promise.resolve(),update(){onLabels([...COMPANY_OFFICES[stage-1].desks.map((_,index)=>({index,x:20+index*3,y:40,visible:true})),{index:-1,x:45,y:80,visible:true}]);},setWalls(){},setQuality(){},setResolution(){},rotate(){},reset(){},dispose(){}})};
});

const apps: ReturnType<typeof mount>[] = [];
beforeAll(() => { if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any; });
afterEach(async () => { for (const app of apps.splice(0)) await unmount(app); document.body.replaceChildren(); localStorage.clear(); });
function show(component: any, props = {}) { const target = document.createElement('div'); document.body.append(target); apps.push(mount(component, { target, props })); flushSync(); return target; }
function button(text: string, root: ParentNode = document) { const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => (b.textContent?.trim() === text || b.getAttribute('aria-label')===text)); expect(found, `button: ${text}`).toBeDefined(); return found!; }
const click = (text: string, root?: ParentNode) => flushSync(() => button(text, root).click());
function prepared(total = 10) {
  const s=createInitialState(1497);s.player.money=100000;s.player.skills.programming=s.player.skills.design=3;s.locationId='municipal_hall';s.time.hour=10;s.developmentHistory!.total=total;Object.assign(s.developmentHistory!.byType,{indie_game:5});
  registerCompany(s,'青禾科技');primeHiringGate(s);s.locationId='electronics_store';buyCompanyComputers(s,'mid',3);s.locationId='dev_incubator';assignCompanyComputer(s,s.company!.computers[0]!.id,'founder');uiState.sceneMode='2d';replaceState(s);
}
describe('公司实际界面与保存旅程', () => {
  it('企业窗口实际注册、收费并显示扩张报价，不传送玩家', () => {
    const s=createInitialState(1497);s.player.money=2100;s.locationId='municipal_hall';s.time.hour=10;s.developmentHistory!.total = 5; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });replaceState(s);
    show(ServiceWindows,{onAction:()=>{}});click('企业窗口');
    const input=document.querySelector<HTMLInputElement>('[aria-label="企业登记窗口"] input')!;
    flushSync(()=>{input.value='注册界面公司';input.dispatchEvent(new Event('input',{bubbles:true}));});
    click('准备注册公司');expect(document.body.textContent).toContain('支付 1600 元');click('确认登记并付款');
    expect(gameState.company!.name).toBe('注册界面公司');expect(gameState.player.money).toBe(500);expect(gameState.locationId).toBe('municipal_hall');expect(document.body.textContent).toContain('净支出');
  });
  it('电子城按数量采购入公司库存，个人电脑不被替换', () => {
    prepared();flushSync(()=>{gameState.locationId='electronics_store';gameState.flags.item_laptop=true;});show(ServiceWindows,{onAction:()=>{}});
    click('查看采购单');click('确认采购并付款');expect(gameState.company!.computers).toHaveLength(4);expect(gameState.flags.item_laptop).toBe(true);
  });
  it('经营面板完成立项和每日开发，双线进度实际更新', () => {
    prepared();const root=show(CompanyPanel);click('新建编程项目',root);click('立项编程作品',root);click('新建设计订单',root);click('立项设计订单',root);
    expect(gameState.company!.programming?.topic).toBe('工具软件');expect(gameState.company!.design?.topic).toBe('平面设计');click('最多4小时短段安排',root);click('开始工作 · 最多4小时',root);
    expect(gameState.company!.programming!.progress).toBeCloseTo(4.16666667);expect(gameState.company!.design!.progress).toBe(0);expect(root.textContent).toContain('今日已工作4 / 12小时');
  });
  it('面试录用、员工分工及电脑升级通过实际控件操作', () => {
    prepared();const root=show(CompanyPanel,{seatIndex:1});
    click('分配办公台式电脑',root);click('开始今日面试',root);expect(gameState.company!.candidates).toHaveLength(3);
    click('录用到此工位',root);expect(gameState.company!.employees).toHaveLength(1);
    click('作品维护',root);expect(gameState.company!.employees[0]!.role).toBe('maintenance');
    expect(root.querySelector('[data-workstation-panel="1"]')).not.toBeNull();
    expect(gameState.company!.computers.filter(p=>p.assignee===gameState.company!.employees[0]!.id)).toHaveLength(1);
  });
  it('在项目快捷安排和工作内容按钮之间切换后，快捷安排仍准确选中对应工作',()=>{
    prepared();startCompanyProject(gameState,'programming','工具软件','small');startCompanyProject(gameState,'design','平面设计','small');const before=JSON.stringify(gameState.company),root=show(CompanyPanel);
    click('我来设计',root);expect(button('我的工作：设计',root).getAttribute('aria-pressed')).toBe('true');click('我的工作：编程',root);expect(button('我的工作：编程',root).getAttribute('aria-pressed')).toBe('true');click('我来设计',root);expect(button('我的工作：设计',root).getAttribute('aria-pressed')).toBe('true');expect(JSON.stringify(gameState.company)).toBe(before);
  });
  it.each([1,2,3,4])('第%i套2D截图办公室有全部可点击工位，开关面板不修改经营状态', async stage => {
    prepared();flushSync(()=>{gameState.company!.stage=stage;gameState.locationId=companyStage(stage).location;});const before=JSON.stringify(gameState.company),root=show(CompanyInterior,{onExit:()=>{}});
    await vi.waitFor(()=>{flushSync();expect(root.querySelectorAll('[data-office-seat]')).toHaveLength(companyStage(stage).capacity);});const founder=root.querySelector<HTMLButtonElement>('[data-office-seat="0"]')!;flushSync(()=>founder.click());
    expect(document.querySelector('[aria-label="公司经营面板"]')).not.toBeNull();click('关闭 ×');expect(JSON.stringify(gameState.company)).toBe(before);
  });
  it('真实存档读取后候选、进度、员工、设备和公司池保持一致', async () => {
    prepared();startCompanyProject(gameState,'programming','手机 App','small',true);interviewCompany(gameState);hireCompanyEmployee(gameState,gameState.company!.candidates[0]!.id);gameState.company!.royaltyCents=400000;
    const before=JSON.stringify(gameState.company);saveGameImmediately('slot_1',gameState);replaceState(createInitialState());const loaded=await loadGame('slot_1');
    expect(loaded!.version).toBe(38);expect(JSON.stringify(loaded!.company)).toBe(before);
  });
  it('家中开发台为只读公司概况，资产与待办实际展示公司责任', async () => {
    prepared();flushSync(()=>{gameState.locationId='old_apartment';gameState.flags.item_laptop=true;gameState.flags.laptop_app_dev=true;});
    const laptop=show(LaptopDesktop);flushSync(()=>laptop.querySelector<HTMLButtonElement>('[data-app-id="dev"]')!.click());expect(laptop.textContent).toContain('作品与版税权益已统一并入公司');expect(laptop.textContent).toContain('大学创业孵化室');expect(laptop.textContent).not.toContain('▶ 推进一晚');
    const phone=show(PhoneWorkspace,{initialApp:'todo'});expect(phone.textContent).toContain('公司房租');expect(phone.textContent).toContain('公司发薪');
  });
});
