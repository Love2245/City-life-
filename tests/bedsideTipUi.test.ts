// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import CityTipModal from '../src/components/layout/CityTipModal.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState,closeModal} from '../src/stores/uiStore.svelte';
import {LOADING_TIPS} from '../src/game/data/loadingTips';
vi.mock('../src/stores/sceneLoading.svelte',()=>({sceneLoading:{current:null},cancelSceneLoading:()=>{},beginSceneLoading:()=>({id:1,covered:Promise.resolve(false),active:()=>false,ready:()=>{},fail:()=>{},cancel:()=>{}})}));
afterEach(()=>{closeModal();document.body.replaceChildren();});

describe('bedside paper tips',()=>{
  it.each(['old_apartment','minsu'])('clicking the basket in %s opens only author copy and does not settle gameplay',async id=>{
    const state=createInitialState();state.player.money=10000;state.time.hour=10;
    if(id==='old_apartment')signLease(state,id);else selectLodging(state,id);moveTo(state,id);replaceState(state);
    const target=document.createElement('div');document.body.append(target);
    const onAction=vi.fn(),home=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction,onCooking:()=>{},onExit:()=>{}}});flushSync();
    const before=JSON.stringify(gameState);const button=target.querySelector<HTMLButtonElement>('[data-home-object="trash"]')!;expect(button).not.toBeNull();expect(target.querySelector('svg.home-fallback')).toBeNull();expect(target.querySelector('image[href^="data:image/svg+xml"]')).toBeNull();
    flushSync(()=>button.click());expect(uiState.modal).toBe('city_tip');expect(LOADING_TIPS).toContain(uiState.cityTip);expect(onAction).not.toHaveBeenCalled();
    const popup=mount(CityTipModal,{target});flushSync();const first=uiState.cityTip;
    flushSync(()=>target.querySelector<HTMLButtonElement>('[data-city-tip] button')!.click());expect(uiState.cityTip).not.toBe(first);expect(LOADING_TIPS).toContain(uiState.cityTip);expect(JSON.stringify(gameState)).toBe(before);
    const shortcut=vi.fn();window.addEventListener('keydown',shortcut);
    target.querySelector('[data-city-tip]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));flushSync();
    expect(uiState.modal).toBeNull();expect(uiState.cityTip).toBeNull();expect(shortcut).not.toHaveBeenCalled();window.removeEventListener('keydown',shortcut);
    await unmount(popup);await unmount(home);
  });
});
