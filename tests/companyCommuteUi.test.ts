// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import ScenePanel from '../src/components/layout/ScenePanel.svelte';
import { createInitialState } from '../src/game/core/state';
import { registerCompany } from '../src/game/core/company';
import { companyCommuteQuote, commuteToCompany } from '../src/game/core/companyCommute';
import { signLease, selectLodging } from '../src/game/core/housing';
import { residenceLocationId, residenceRegion } from '../src/game/core/residence';
import { visibleActionsAtLocation } from '../src/game/core/actions';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState } from '../src/stores/uiStore.svelte';
import { cancelSceneLoading, sceneLoading } from '../src/stores/sceneLoading.svelte';

vi.mock('../src/stores/sceneLoading.svelte',()=>{const sceneLoading={current:null as any};return{sceneLoading,beginSceneLoading:vi.fn((request:any)=>{sceneLoading.current=request;return{id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(()=>{if(sceneLoading.current===request)sceneLoading.current=null;}),fail:vi.fn(),cancel:vi.fn(()=>{if(sceneLoading.current===request)sceneLoading.current=null;})};}),markLoadingCovered:vi.fn(),cancelSceneLoading(){sceneLoading.current=null;}};});
vi.mock('../src/lib/homeStillView',()=>({createHomeStillView:(_host:HTMLElement,plan:any,onLabels:(labels:any[])=>void)=>({ready:Promise.resolve(),update(state:any){onLabels(state.objects.map((object:any)=>({kind:object.kind,x:50,y:50,visible:true})));},setWalls(){},setQuality(){},select(){},hover(){},dispose(){}})}));

const mounted: ReturnType<typeof mount>[] = [];
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} } as any;
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
});
afterEach(async () => { for (const app of mounted.splice(0)) await unmount(app); cancelSceneLoading(); document.body.replaceChildren(); uiState.modal = null; });
function prepare(home = 'old_apartment', company = true) {
  cancelSceneLoading(); uiState.sceneMode='2d'; uiState.modal = null; uiState.npcTaskPanel = null; uiState.npcTalk = null;
  const state = createInitialState(149724); state.mode = 'eternal'; state.player.money = 100_000; state.time.hour = 10;
  if (company) { state.locationId = 'municipal_hall'; state.developmentHistory!.total = 1; Object.assign(state.developmentHistory!.byType, { indie_game: 5 }); expect(registerCompany(state, '界面通勤', 2).ok).toBe(true); }
  if (home.startsWith('hotel')) expect(selectLodging(state, home)).toBe(true);
  else expect(signLease(state, home).ok).toBe(true);
  state.locationId = residenceLocationId(state); state.region = state.area = residenceRegion(state);
  state.navStack = ['map', state.region]; replaceState(state);
}
function show(component: any, props = {}) {
  const target = document.createElement('div'); document.body.append(target);
  mounted.push(mount(component, { target, props })); flushSync(); return target;
}
function press(target: ParentNode, selector: string) { const control = target.querySelector<HTMLButtonElement>(selector); expect(control).not.toBeNull(); flushSync(() => control!.click()); }
function home(props: Partial<{ onExit: () => void; onCompany: () => void; onAction: (action: any) => void }> = {}) {
  return show(HomeInterior, { actions: visibleActionsAtLocation(gameState, gameState.locationId), onAction() {}, onCooking() {}, onExit() {}, onCompany() {}, ...props });
}

describe('住宅真实出门控件接入公司通勤', () => {
  it.each(['[data-home-object="door"]', '[data-home-departure]'])('%s 开出门菜单，预览只读且点击后按显示报价结算', async selector => {
    prepare(); const ordinaryExit = vi.fn(), depart = vi.fn(() => commuteToCompany(gameState));
    const root = home({ onExit: ordinaryExit, onCompany: depart }), before = JSON.stringify(gameState), quote = companyCommuteQuote(gameState);
    await vi.waitFor(()=>{flushSync();expect(root.querySelector(selector)).not.toBeNull();});
    press(root, selector); expect(ordinaryExit).not.toHaveBeenCalled(); expect(JSON.stringify(gameState)).toBe(before);
    const choice = root.querySelector<HTMLButtonElement>('[data-home-company-commute]')!;
    expect(choice.textContent).toContain('去公司'); expect(choice.textContent).toContain('写字楼单间'); expect(choice.textContent).toContain(quote.detail);
    const cash = gameState.player.money, time = gameState.time.hour * 60 + gameState.time.minute;
    press(root, '[data-home-company-commute]'); expect(depart).toHaveBeenCalledTimes(1); expect(ordinaryExit).not.toHaveBeenCalled();
    expect(gameState.locationId).toBe('company_office_single'); expect(cash - gameState.player.money).toBe(2);
    expect(gameState.time.hour * 60 + gameState.time.minute - time).toBe(30);
  });
  it('没有公司时保留普通住宅出门行为', () => {
    prepare('old_apartment', false); const exit = vi.fn(), root = home({ onExit: exit });
    press(root, '[data-home-departure]'); expect(exit).toHaveBeenCalledTimes(1); expect(root.querySelector('[data-home-company-commute]')).toBeNull();
  });
  it('酒店保留下楼用餐及离开酒店，菜单中增加公司路线', () => {
    prepare('hotel'); const exit = vi.fn(), action = vi.fn(), root = home({ onExit: exit, onAction: action });
    press(root, '[data-home-departure]'); expect(root.querySelector('[aria-label="酒店出门选项"]')).not.toBeNull();
    expect(root.querySelector('[data-home-company-commute]')).not.toBeNull();
    const dining = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '下楼用餐')!;
    flushSync(() => dining.click()); expect(action).toHaveBeenCalledTimes(1); expect(action.mock.calls[0][0].id).toBe('hotel_resident_dining'); expect(exit).not.toHaveBeenCalled();
    press(root, '[data-home-departure]'); press(root, '[data-home-normal-exit]'); expect(exit).toHaveBeenCalledTimes(1);
  });
  it('失败原因显示在禁用的公司按钮内，普通出门仍可选', () => {
    prepare(); flushSync(() => { gameState.company!.stage = 1; gameState.flags.item_student_pass = true; gameState.player.money = 4; });
    const depart = vi.fn(), root = home({ onCompany: depart }), before = JSON.stringify(gameState);
    press(root, '[data-home-departure]'); const choice = root.querySelector<HTMLButtonElement>('[data-home-company-commute]')!;
    expect(choice.disabled).toBe(true); expect(choice.textContent).toContain('5 元车费'); expect(root.querySelector('[data-home-normal-exit]')).not.toBeNull();
    press(root, '[data-home-company-commute]'); expect(depart).not.toHaveBeenCalled(); expect(JSON.stringify(gameState)).toBe(before);
  });
  it('2D截图住宅的实际ScenePanel走相同公司路线，完成后只结算一趟', async () => {
    prepare(); uiState.sceneMode = '2d'; const root = show(ScenePanel);
    await vi.waitFor(()=>{flushSync();expect(root.querySelector('[data-home-object="bed"]')).not.toBeNull();expect(sceneLoading.current).toBeNull();});
    const before = JSON.stringify(gameState);
    press(root, '[data-home-departure]'); expect(JSON.stringify(gameState)).toBe(before);
    expect(root.querySelector('[data-home-company-commute]')?.textContent).toContain('30 分钟');
    const cash = gameState.player.money; press(root, '[data-home-company-commute]');
    expect(gameState.locationId).toBe('company_office_single'); expect(cash - gameState.player.money).toBe(2);
    expect(gameState.time.hour).toBe(10); expect(gameState.time.minute).toBe(30);
    expect(sceneLoading.current?.sceneKey).toContain('company_office_single');
  });
  it('菜单打开后扩张自动更新目标办公室，不修改时间与金钱', () => {
    prepare(); const root = home(), before = { time: JSON.stringify(gameState.time), money: gameState.player.money };
    press(root, '[data-home-departure]'); flushSync(() => gameState.company!.stage = 4);
    expect(root.querySelector('[data-home-company-commute]')?.textContent).toContain('写字楼整层');
    expect(JSON.stringify(gameState.time)).toBe(before.time); expect(gameState.player.money).toBe(before.money);
  });
});
