// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation,performAction} from '../src/game/core/actions';
import {addItem} from '../src/game/core/items';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';

afterEach(()=>vi.unstubAllGlobals());
describe('home scene teardown',()=>{
  it('a sofa exposes relaxation and a short nap, and settles only after the selected action is clicked',async()=>{
    const s=createInitialState();s.player.money=10000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');addItem(s,'sofa');s.player.attrs.stamina=30;replaceState(s);
    const target=document.createElement('div');document.body.append(target);
    const onAction=vi.fn(a=>performAction(gameState,a.id));
    const component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction,onCooking:()=>{},onExit:()=>{}}});flushSync();
    try{
      flushSync(()=>target.querySelector<HTMLButtonElement>('[data-home-object="sofa"]')!.click());
      flushSync(()=>[...target.querySelectorAll<HTMLButtonElement>('.action-roots button')].find(b=>b.textContent?.includes('休息放松'))!.click());
      expect(onAction).not.toHaveBeenCalled();const options=[...target.querySelectorAll<HTMLButtonElement>('[data-home-branch="use"] button')];
      expect(options.map(b=>b.textContent)).toEqual([expect.stringContaining('休息放松'),expect.stringContaining('短暂小睡')]);expect(target.textContent).not.toContain('选一本书');
      const hour=gameState.time.hour;flushSync(()=>options[1].click());expect(onAction).toHaveBeenCalledTimes(1);expect(gameState.time.hour).toBe(hour+2);expect(gameState.player.attrs.stamina).toBe(45);expect(target.querySelector('.home-detail')).toBeNull();
    }finally{await unmount(component);target.remove();}
  });
  it('leaving the home or replacing a loaded save never reads a missing furniture anchor',()=>{
    vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
    const s=createInitialState();s.player.money=10000;signLease(s,'old_apartment');moveTo(s,'old_apartment');replaceState(s);
    const target=document.createElement('div');document.body.appendChild(target);
    const component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:()=>{},onCooking:()=>{},onExit:()=>{gameState.locationId='map';}}});flushSync();
    expect(target.querySelectorAll('[data-home-object]').length).toBeGreaterThan(0);
    expect(()=>{target.querySelector<HTMLButtonElement>('[data-home-object="door"]')!.click();flushSync();}).not.toThrow();
    expect(target.querySelectorAll('[data-home-object]')).toHaveLength(0);
    expect(()=>{replaceState(createInitialState());flushSync();}).not.toThrow();unmount(component);target.remove();
  });
});
