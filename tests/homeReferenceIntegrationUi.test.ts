// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { createHomeRoom } from '../src/lib/homeRoom3D';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import HomeTourStage from '../src/components/layout/HomeTourStage.svelte';
import { createInitialState } from '../src/game/core/state';
import { buyProperty } from '../src/game/core/housing';
import { moveTo, visibleActionsAtLocation } from '../src/game/core/actions';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState } from '../src/stores/uiStore.svelte';
import { homePlanFor } from '../src/game/core/homeInterior';
import { homePreviewRoom } from '../src/lib/homeRoom3D';
import type { createHomeStillView } from '../src/lib/homeStillView';

// These component tests exercise venue interactions; full overlay timing is covered by scene-loading integration tests.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

const capture = vi.hoisted(() => ({ calls: [] as Parameters<typeof createHomeRoom>[], update: vi.fn(), select: vi.fn(), quality: vi.fn() }));
const still = vi.hoisted(() => ({calls:[] as Parameters<typeof createHomeStillView>[],update:vi.fn()}));
vi.mock('../src/lib/homeStillView',()=>({createHomeStillView:(...args:Parameters<typeof createHomeStillView>)=>{
  still.calls.push(args);
  return {ready:Promise.resolve(),update:still.update,focus:vi.fn(),rotate:vi.fn(),zoom:vi.fn(),setWalls:vi.fn(),select:vi.fn(),hover:vi.fn(),dispose:vi.fn()};
}}));
vi.mock('../src/lib/homeRoom3D', async original => ({ ...await original<typeof import('../src/lib/homeRoom3D')>(),
  createHomeRoom: (...args: Parameters<typeof createHomeRoom>) => {
    capture.calls.push(args);
    return { ready:Promise.resolve(), update: capture.update, select: capture.select, setQuality: capture.quality, hover: vi.fn(), focus: vi.fn(), rotate: vi.fn(), zoom: vi.fn(), setWalls: vi.fn(), dispose: () => args[5]?.environment?.dispose() };
  },
}));
afterEach(() => { capture.calls.length = 0; capture.update.mockClear(); capture.select.mockClear(); capture.quality.mockClear(); still.calls.length=0;still.update.mockClear();uiState.modal = null; uiState.gameMode='pc';uiState.sceneMode='3d'; });
describe('reference furniture is connected to playable housing', () => {
  it('loads the same visual assets in the real home and home tour while model picks retain the normal home interaction', async () => {
    const state = createInitialState(123); state.player.money = 100000; state.time.hour = 10;
    expect(buyProperty(state, 'own_apartment').ok).toBe(true); expect(moveTo(state, 'own_apartment').ok).toBe(true);
    replaceState(state); uiState.gameMode = 'pc'; uiState.sceneMode='3d'; uiState.modal = null;
    const target = document.createElement('div'); document.body.append(target);
    let component = mount(HomeInterior, { target, props: { actions: visibleActionsAtLocation(gameState, gameState.locationId), onAction: vi.fn(), onCooking: vi.fn(), onExit: vi.fn() } }); flushSync();
    await vi.waitFor(()=>{flushSync();expect(capture.calls).toHaveLength(1);});
    const playable = capture.calls[0]; expect(playable[5]?.objects?.kitchen).toBeDefined(); expect(playable[5]?.contactShadows).toBe(true);
    expect(capture.update.mock.lastCall![0].objects.find((object: {kind:string}) => object.kind === 'kitchen').position).toEqual([14, 7.6]);
    playable[3]('kitchen'); flushSync(); expect(target.querySelector('.home-detail')?.textContent).toContain('做饭'); expect(capture.select).toHaveBeenLastCalledWith('kitchen');
    const saved=JSON.stringify({time:gameState.time,money:gameState.player.money,inventory:gameState.inventory,layouts:gameState.homeLayouts});
    target.querySelector<HTMLButtonElement>('.display-trigger')!.click();flushSync();
    const quality=target.querySelector<HTMLSelectElement>('[aria-label="住宅画质"]')!;quality.value='light';quality.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(capture.quality).toHaveBeenLastCalledWith('light','pc');expect(target.querySelector('.home-detail')?.textContent).toContain('做饭');
    uiState.gameMode='mobile';flushSync();expect(target.querySelector('[aria-label="住宅画质"]')).not.toBeNull();expect(capture.quality).toHaveBeenLastCalledWith('light','mobile');
    expect(JSON.stringify({time:gameState.time,money:gameState.player.money,inventory:gameState.inventory,layouts:gameState.homeLayouts})).toBe(saved);
    await unmount(component);
    uiState.gameMode='pc';
    const plan = homePlanFor('own_apartment');
    component = mount(HomeTourStage, { target, props: { plan, snapshot: homePreviewRoom(plan, true, 12), onChoose: vi.fn() } }); flushSync();
    await vi.waitFor(()=>{flushSync();expect(capture.calls).toHaveLength(2);});
    expect(capture.calls[1][5]?.objects?.kitchen).toEqual(playable[5]?.objects?.kitchen);
    await unmount(component); target.remove();
  });
  it.each(['pc','mobile'] as const)('uses the image factory for %s 2D home tours and preserves the ordinary object callback',async gameMode=>{
    uiState.gameMode=gameMode;uiState.sceneMode='2d';const target=document.createElement('div');document.body.append(target);
    const plan=homePlanFor('own_apartment'),snapshot=homePreviewRoom(plan,true,12),onChoose=vi.fn();
    const component=mount(HomeTourStage,{target,props:{plan,snapshot,onChoose}});flushSync();
    try{
      await vi.waitFor(()=>{flushSync();expect(still.calls).toHaveLength(1);});
      expect(capture.calls).toHaveLength(0);expect(still.update.mock.lastCall![0].objects.find((o:{kind:string})=>o.kind==='kitchen').position).toEqual([14,7.6]);
      still.calls[0][3]('kitchen');expect(onChoose).toHaveBeenCalledWith('kitchen');
      expect(target.querySelector('[data-home-exterior]')).toBeNull();
    }finally{await unmount(component);target.remove();}
  });

  it('uses the model factory when a phone player explicitly selects 3D',async()=>{
    uiState.gameMode='mobile';uiState.sceneMode='3d';const target=document.createElement('div');document.body.append(target);
    const plan=homePlanFor('own_apartment'),onChoose=vi.fn(),component=mount(HomeTourStage,{target,props:{plan,snapshot:homePreviewRoom(plan,true,12),onChoose}});flushSync();
    try{await vi.waitFor(()=>{flushSync();expect(capture.calls).toHaveLength(1);});expect(still.calls).toHaveLength(0);capture.calls[0][3]('kitchen');expect(onChoose).toHaveBeenCalledWith('kitchen');}
    finally{await unmount(component);target.remove();}
  });

});
