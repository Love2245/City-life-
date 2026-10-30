// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import CafeInterior from '../src/components/layout/CafeInterior.svelte';
import StoreInterior from '../src/components/layout/StoreInterior.svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import HomeTour from '../src/components/layout/HomeTour.svelte';
import {CAFE_FACILITIES} from '../src/lib/cafeRoom/facilities';
import {STORE_FACILITIES} from '../src/lib/convenienceStore/facilities';
import {createInitialState} from '../src/game/core/state';
import {visibleActionsAtLocation} from '../src/game/core/actions';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
// Tool behavior is tested after the separately verified loading cover has painted.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));
const fake=vi.hoisted(()=>({cafe:null as any,store:null as any,home:null as any}));
vi.mock('../src/lib/cafeRoom3D',()=>({createCafeRoom:(_host:HTMLElement,options:any)=>fake.cafe={options,ready:Promise.resolve(),update:vi.fn(),rotate:vi.fn(),setQuality:vi.fn(),setResolution:vi.fn(),dispose:vi.fn(),selectFacility:vi.fn((id:keyof typeof CAFE_FACILITIES|null)=>options.onSelect(id?{id,...CAFE_FACILITIES[id],x:50,y:40,visible:true}:null))}}));
vi.mock('../src/lib/convenienceStore3D',()=>({createStoreRoom:(_host:HTMLElement,options:any)=>fake.store={options,ready:Promise.resolve(),update:vi.fn(),rotate:vi.fn(),setQuality:vi.fn(),setResolution:vi.fn(),dispose:vi.fn(),selectFacility:vi.fn((id:keyof typeof STORE_FACILITIES|null)=>options.onSelect(id?{id,...STORE_FACILITIES[id],x:50,y:40,visible:true}:null))}}));
vi.mock('../src/lib/homeRoom3D',async original=>({...await original<typeof import('../src/lib/homeRoom3D')>(),createHomeRoom:(_host:HTMLElement,_plan:any,onLabels:any)=>{onLabels([{kind:'bed',x:50,y:40,visible:true}]);return fake.home={ready:Promise.resolve(),update:vi.fn(),rotate:vi.fn(),setQuality:vi.fn(),setResolution:vi.fn(),setWalls:vi.fn(),hover:vi.fn(),select:vi.fn(),dispose:vi.fn()};}}));
let target:HTMLDivElement,component:ReturnType<typeof mount>|undefined;
const settle=async()=>{await new Promise(done=>setTimeout(done,0));flushSync();};
beforeAll(()=>{globalThis.ResizeObserver??=class{observe(){}disconnect(){}} as any;Element.prototype.animate??=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
beforeEach(()=>{fake.cafe=null;fake.store=null;fake.home=null;const state=createInitialState(902);state.locationId='own_apartment';state.living.mode='own';state.living.ownedId='own_apartment';replaceState(state);uiState.sceneMode='3d';uiState.gameMode='pc';uiState.modal=null;target=document.createElement('div');document.body.append(target);});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target.remove();uiState.modal=null;uiState.sceneMode='3d';});

describe('compact scene tools and facility tags',()=>{
  for(const venue of ['cafe','store'] as const)it(`${venue}: two turns, one settings entry, clickable fixture names and nested quality`,async()=>{
    const before={time:JSON.stringify(gameState.time),money:gameState.player.money};
    component=venue==='cafe'?mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{},onOrder:vi.fn()}}):mount(StoreInterior,{target,props:{night:false,onExit:()=>{}}});await vi.waitFor(()=>{flushSync();expect(fake[venue]).not.toBeNull();});await settle();
    const room=fake[venue],id=venue==='cafe'?'counter':'fresh',title=venue==='cafe'?'点单与取餐台':'冷藏鲜食柜';
    room.options.onLabels([{id,title,x:50,y:40,visible:true}]);flushSync();
    expect(target.querySelectorAll('.view-controls button')).toHaveLength(2);expect(target.querySelector(`.${venue}-find`)!.textContent?.trim()).toBe('画面设置');
    expect(target.textContent).not.toContain('店内设施');expect(target.querySelector('[aria-label$="拉近视角"]')).toBeNull();expect(target.querySelector('select')).toBeNull();
    target.querySelector<HTMLButtonElement>(`[data-${venue}-facility="${id}"]`)!.click();flushSync();expect(room.selectFacility).toHaveBeenCalledWith(id);expect(target.querySelector(`.${venue}-interaction`)?.textContent).toContain(title);
    const turns=target.querySelectorAll<HTMLButtonElement>('.view-controls button');turns[0].click();turns[1].click();flushSync();expect(room.rotate.mock.calls.map((call:any)=>call[0])).toEqual([-Math.PI/2,Math.PI/2]);
    target.querySelector<HTMLButtonElement>('.display-trigger')!.click();flushSync();const quality=target.querySelector<HTMLSelectElement>(`[aria-label="${venue==='cafe'?'咖啡厅':'便利店'}画质"]`)!;expect(quality.value).toBe('auto');quality.value='light';quality.dispatchEvent(new Event('change',{bubbles:true}));flushSync();expect(room.setQuality).toHaveBeenCalledWith('light');
    expect(gameState.player.money).toBe(before.money);expect(JSON.stringify(gameState.time)).toBe(before.time);
  });
  it('home keeps furniture shopping in personal tools and quality inside the single settings menu',async()=>{
    component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:()=>{},onCooking:()=>{},onExit:()=>{}}});flushSync();
    await vi.waitFor(()=>{flushSync();expect(fake.home).not.toBeNull();});await settle();
    expect(target.querySelectorAll('.view-controls button')).toHaveLength(2);expect(target.querySelector('.home-find')!.textContent?.trim()).toBe('画面设置');expect(target.textContent).not.toContain('家中物件');expect(target.textContent).not.toContain('添置家具');
    target.querySelector<HTMLButtonElement>('[aria-label="随身面板"]')!.click();flushSync();expect(target.querySelector('.personal-fold')?.textContent).toContain('添置家具');
    target.querySelector<HTMLButtonElement>('.display-trigger')!.click();flushSync();expect(target.querySelector('[aria-label="住宅画质"]')).not.toBeNull();
  });
  it('home gallery removes furnishing switches and room controls, keeping turns and combined display settings',async()=>{
    const before=JSON.stringify(gameState);component=mount(HomeTour,{target,props:{homeId:'own_apartment',onExit:()=>{}}});flushSync();
    await vi.waitFor(()=>{flushSync();expect(fake.home).not.toBeNull();});await settle();
    expect(target.querySelectorAll('.tour-camera .view-controls button')).toHaveLength(2);expect(target.querySelector('.tour-camera [data-home-exterior]')).not.toBeNull();expect(target.querySelectorAll('.tour-furnishing button')).toHaveLength(1);expect(target.textContent).not.toContain('添置齐全');expect(target.querySelector('[aria-label="参观房间"]')).toBeNull();
    target.querySelector<HTMLButtonElement>('.display-trigger')!.click();flushSync();const quality=target.querySelector<HTMLSelectElement>('[aria-label="住宅画质"]')!;quality.value='light';quality.dispatchEvent(new Event('change',{bubbles:true}));flushSync();expect(fake.home.setQuality).toHaveBeenLastCalledWith('light','pc');expect(JSON.stringify(gameState)).toBe(before);
  });
});
