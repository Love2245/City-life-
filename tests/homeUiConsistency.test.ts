// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {createInitialState} from '../src/game/core/state';
import {gameState,replaceState,autoSaveStatus} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {signLease} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn()}));
let target:HTMLDivElement,component:ReturnType<typeof mount>;
beforeEach(()=>{const s=createInitialState();s.player.money=5000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');replaceState(s);uiState.modal=null;autoSaveStatus.status='idle';target=document.createElement('div');document.body.append(target);component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:()=>{},onCooking:()=>{},onExit:()=>{}}});flushSync();});
afterEach(async()=>{await unmount(component);target.remove();uiState.modal=null;autoSaveStatus.status='idle';autoSaveStatus.error='';});
describe('home and outdoor HUD continuity',()=>{
  it('keeps the timed editor on its own branch and returns to the three sleep choices without charging',()=>{
    const before=JSON.stringify(gameState.time);target.querySelector<HTMLButtonElement>('[data-home-object="bed"]')!.click();flushSync();[...target.querySelectorAll<HTMLButtonElement>('.action-roots button')].find(b=>b.textContent?.includes('睡觉'))!.click();flushSync();target.querySelector<HTMLButtonElement>('[data-home-sleep="timed"]')!.click();flushSync();expect(target.querySelector('.timed-editor')).not.toBeNull();expect(target.querySelector('[data-home-sleep="nap"]')).toBeNull();[...target.querySelectorAll<HTMLButtonElement>('.action-branch button')].find(b=>b.textContent?.includes('返回睡眠选项'))!.click();flushSync();expect(target.querySelector('.timed-editor')).toBeNull();expect(target.querySelectorAll('[data-home-sleep]')).toHaveLength(3);expect(JSON.stringify(gameState.time)).toBe(before);
  });
  it('opens inventory and logs from personal tools without charging time or money',()=>{
    const before=JSON.stringify({money:gameState.player.money,time:gameState.time});for(const [label,modal]of [['背包','inventory'],['行动日志','log']] as const){uiState.modal=null;flushSync();target.querySelector<HTMLButtonElement>('[aria-label="随身面板"]')!.click();flushSync();[...target.querySelectorAll<HTMLButtonElement>('.personal-fold button')].find(b=>b.textContent?.includes(label))!.click();flushSync();expect(uiState.modal).toBe(modal);expect(target.querySelector('.personal-fold')).toBeNull();}expect(JSON.stringify({money:gameState.player.money,time:gameState.time})).toBe(before);
  });
  it('clears the home action popup when a shared application opens',()=>{
    target.querySelector<HTMLButtonElement>('[data-home-object="bed"]')!.click();flushSync();expect(target.querySelector('.home-detail')).not.toBeNull();uiState.modal='inventory';flushSync();expect(target.querySelector('.home-detail')).toBeNull();expect(target.querySelector('.home-status')).not.toBeNull();
  });
  it('exposes the same save recovery controls inside the home',()=>{
    autoSaveStatus.status='failed';autoSaveStatus.error='存储空间不足';flushSync();target.querySelector<HTMLButtonElement>('.save-failed')!.click();flushSync();const alert=target.querySelector('[role="alert"]')!;expect(alert.textContent).toContain('重试保存');expect(alert.textContent).toContain('导出当前进度');autoSaveStatus.status='saved';flushSync();expect(target.querySelector('[role="alert"]')).toBeNull();
  });
});
