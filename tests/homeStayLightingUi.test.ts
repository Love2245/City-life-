// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
import {homeLightMode,homeLightScheme} from '../src/game/core/homeLighting';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';

afterEach(()=>{vi.unstubAllGlobals();uiState.modal=null;});
describe('guest room installed light',()=>{
  it('operates the actual guest-room light switch while furnishing remains unavailable',()=>{
    vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
    const s=createInitialState(123);s.player.money=100000;s.time.hour=12;signLease(s,'old_apartment');moveTo(s,'old_apartment');
    s.homeLighting={old_apartment:'off'};expect(selectLodging(s,'minsu')).toBe(true);expect(moveTo(s,'minsu').ok).toBe(true);replaceState(s);
    const target=document.createElement('div');document.body.append(target);
    const component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:vi.fn(),onCooking:vi.fn(),onExit:vi.fn()}});flushSync();
    try{
      target.querySelector<HTMLButtonElement>('.personal-toggle')!.click();flushSync();
      const light=target.querySelector<HTMLButtonElement>('[data-home-light-switch]')!;
      expect(light.textContent).toContain('自动');light.click();flushSync();
      expect(light.textContent).toContain('开灯');expect(homeLightMode(gameState)).toBe('on');
      expect(homeLightScheme(12,9,'sunny',homeLightMode(gameState)).lamps).toBe(true);
      light.click();flushSync();expect(light.textContent).toContain('关灯');expect(homeLightMode(gameState)).toBe('off');
      expect(homeLightScheme(23,9,'sunny',homeLightMode(gameState)).lamps).toBe(false);
      expect(gameState.homeLighting?.old_apartment).toBe('off');expect(target.querySelector('.personal-fold')!.textContent).not.toMatch(/添置家具|墙面与地面/);
    }finally{unmount(component);target.remove();}
  });
});
