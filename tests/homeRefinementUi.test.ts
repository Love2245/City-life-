// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import ArcadeView from '../src/views/ArcadeView.svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
let target:HTMLDivElement,component:ReturnType<typeof mount>|undefined;
beforeEach(()=>{target=document.createElement('div');document.body.append(target);replaceState(createInitialState());});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target.remove();uiState.modal=null;vi.restoreAllMocks();});
describe('home catalogue and independent tours',()=>{
  it('opens a separate home category and returns from a changed preview without touching the live game or save',async()=>{
    localStorage.setItem('urban_life_save_auto','keep-this-save');const before=JSON.stringify(gameState);
    component=mount(ArcadeView,{target});flushSync();expect(target.querySelectorAll('[data-tour-home]')).toHaveLength(7);
    const categories={basic:['minsu','hotel_budget','hotel_boyu_nightmarket','hotel_mooncourt_budget','old_apartment','suburb_room','own_old_unit'],comfortable:['hotel','hotel_mooncourt','rental_apartment','boyue_talent_apartment'],premium:['own_apartment','own_villa']};
    for(const [category,ids] of Object.entries(categories)){
      target.querySelector<HTMLButtonElement>(`[data-tour-category="${category}"]`)!.click();flushSync();
      expect([...target.querySelectorAll('[data-tour-home]')].map(e=>e.getAttribute('data-tour-home'))).toEqual(ids);
      expect(target.querySelector(`[data-tour-category="${category}"]`)?.getAttribute('aria-pressed')).toBe('true');
    }
    for(const id of ['gov','atm','hostel','temple','worker_dorm','camping_lodging','dev_incubator'])expect(target.querySelector(`[data-tour-home="${id}"]`)).toBeNull();
    target.querySelector<HTMLButtonElement>('[data-tour-category="comfortable"]')!.click();flushSync();
    target.querySelector<HTMLButtonElement>('[data-tour-home="rental_apartment"]')!.click();flushSync();
    await vi.waitFor(()=>{flushSync();expect(target.querySelector('[data-home-tour]')).not.toBeNull();});
    expect(target.querySelector('[data-home-tour]')?.getAttribute('data-home-tour')).toBe('rental_apartment');
    [...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='深夜')!.click();flushSync();
    expect(target.querySelectorAll('.view-controls button')).toHaveLength(2);
    expect(target.textContent).not.toContain('添置齐全');
    const selector=target.querySelector<HTMLSelectElement>('[aria-label="选择参观住宅"]')!;selector.value='own_villa';selector.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(target.querySelector('[data-home-tour]')?.getAttribute('data-home-tour')).toBe('own_villa');
    selector.value='minsu';selector.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(target.querySelector('[data-home-tour]')?.getAttribute('data-home-tour')).toBe('minsu');
    expect(target.textContent).not.toContain('添置与升级');
    [...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='返回房屋列表')!.click();flushSync();
    expect(target.querySelector('[data-arcade-category="homes"]')).not.toBeNull();expect(JSON.stringify(gameState)).toBe(before);expect(localStorage.getItem('urban_life_save_auto')).toBe('keep-this-save');
  });
  it('keeps an unpurchased fridge absent from the room while allowing delivery from the global catalogue',()=>{
    const s=createInitialState();s.player.money=10000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');replaceState(s);
    component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:()=>{},onCooking:()=>{},onExit:()=>{}}});flushSync();
    expect(target.querySelector('[data-home-object="fridge"]')).toBeNull();
    target.querySelector<HTMLButtonElement>('[aria-label="随身面板"]')!.click();flushSync();
    [...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('添置家具'))!.click();flushSync();
    [...target.querySelectorAll<HTMLButtonElement>('.catalog-kinds button')].find(b=>b.textContent==='冰箱')!.click();flushSync();
    const money=gameState.player.money;target.querySelector<HTMLButtonElement>('[data-home-buy="fridge_small"]')!.click();flushSync();
    expect(gameState.player.money).toBe(money-300);expect(gameState.fridge.tier).toBe('small');expect(target.querySelector('[data-home-object="fridge"]')).not.toBeNull();
  });
});
