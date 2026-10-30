// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import CatPanel from '../src/components/CatPanel.svelte';
import HospitalTrainModal from '../src/components/layout/HospitalTrainModal.svelte';
import {createInitialState} from '../src/game/core/state';
import {adoptCat} from '../src/game/core/cat';
import {configureFinancialRiskStorage} from '../src/game/core/financialRisk';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';

let host:HTMLDivElement,component:ReturnType<typeof mount>|undefined,restoreRisk:()=>void;
beforeAll(()=>{Element.prototype.animate??=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as any;});
beforeEach(()=>{
  vi.useFakeTimers();restoreRisk=configureFinancialRiskStorage(undefined);
  const s=createInitialState(149728601);s.player.money=10000;adoptCat(s,'orange');delete s.pets[0].cardPack;
  s.locationId='pet_hospital';s.region=s.area='downtown_center';s.time.hour=12;s.time.minute=0;
  replaceState(s);uiState.modal=null;uiState.catPanelTab='cards';uiState.hospitalTrainMode='special';
  host=document.createElement('div');document.body.append(host);
});
afterEach(async()=>{if(component)await unmount(component);component=undefined;host.remove();restoreRisk();uiState.modal=null;uiState.catPanelTab='care';vi.useRealTimers();vi.restoreAllMocks();});

describe('游戏性排查：旧档宠物界面',()=>{
  it('缺少卡包的旧宠物可打开卡包页，查看不会写存档',()=>{
    const before=JSON.stringify(gameState.pets);
    component=mount(CatPanel,{target:host});flushSync();
    expect(host.textContent).toContain('卡包');expect(host.querySelectorAll('.collection-card:not(.unowned)')).toHaveLength(6);
    expect(JSON.stringify(gameState.pets)).toBe(before);
  });
  it('旧卡包可打开医院训练，训练一次只收200元并持久保存强化结果',()=>{
    component=mount(HospitalTrainModal,{target:host});flushSync();
    expect(host.querySelectorAll('.card-list>button')).toHaveLength(12);expect(gameState.pets[0].cardPack).toBeUndefined();
    (host.querySelector('.upgrade') as HTMLButtonElement).click();flushSync();
    expect(gameState.player.money).toBe(9800);expect(gameState.pets[0].cardPack).toBeUndefined();
    expect(gameState.catDuel!.collection[0].upgraded).toBe(true);expect((host.querySelector('.upgrade') as HTMLButtonElement).disabled).toBe(true);expect(gameState.time.hour).toBe(13);
  });
});
