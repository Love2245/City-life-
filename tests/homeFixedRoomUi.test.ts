// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {residenceLocationId} from '../src/game/core/residence';
afterEach(()=>{vi.unstubAllGlobals();uiState.modal=null;});
describe('fixed room usable facilities and editing boundary',()=>{
  it.each(['minsu','hotel_budget','hotel','hotel_boyu_nightmarket','hotel_mooncourt','hotel_mooncourt_budget'])('enters %s with rest and shower but without furnishing controls',id=>{
    vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
    const s=createInitialState(456);s.player.money=100000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');
    s.inventory.gym_high=1;s.inventory.laptop_pro=1;s.inventory.plant=1;
    expect(selectLodging(s,id)).toBe(true);expect(moveTo(s,residenceLocationId(s)).ok).toBe(true);replaceState(s);
    const target=document.createElement('div');document.body.append(target);
    const onAction=vi.fn(),component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction,onCooking:vi.fn(),onExit:vi.fn()}});flushSync();
    try{
      expect(target.querySelector('[data-home-id]')?.getAttribute('data-home-id')).toBe(id);
      expect(target.querySelector('[data-home-editable]')?.getAttribute('data-home-editable')).toBe('false');
      expect(target.querySelector('[data-home-object="gym"]')).toBeNull();
      target.querySelector<HTMLButtonElement>('.personal-toggle')!.click();flushSync();
      expect(target.querySelector('.personal-fold')!.textContent).not.toMatch(/添置家具|墙面与地面|猫咪/);
      target.querySelector<HTMLButtonElement>('[data-home-object="bed"]')!.click();flushSync();
      expect(target.querySelector('.action-roots')!.textContent).toContain('睡觉');
      expect(target.querySelector('.home-detail')!.textContent).not.toContain('布置与升级');
      target.querySelector<HTMLButtonElement>('[data-home-object="shower"]')!.click();flushSync();
      [...target.querySelectorAll<HTMLButtonElement>('.action-roots button')].find(b=>b.textContent?.includes('洗漱'))!.click();flushSync();
      const shower=[...target.querySelectorAll<HTMLButtonElement>('.action-branch button')].find(b=>b.textContent?.includes('洗澡'));
      expect(shower).toBeDefined();expect(shower!.disabled).toBe(false);shower!.click();flushSync();expect(onAction).toHaveBeenCalled();
    }finally{unmount(component);target.remove();}
  });
});
