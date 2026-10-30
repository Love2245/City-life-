// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn()}));
let target:HTMLDivElement,component:ReturnType<typeof mount>;
const onAction=vi.fn(),onCooking=vi.fn();
function button(text:string){return [...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim().startsWith(text))!;}
function click(b:HTMLButtonElement){b.click();flushSync();}
function bed(){click(target.querySelector<HTMLButtonElement>('[data-home-object="bed"]')!);click(button('睡觉'));}
beforeEach(()=>{const s=createInitialState();s.player.money=5000;s.time.hour=10;s.time.minute=15;signLease(s,'old_apartment');moveTo(s,'old_apartment');replaceState(s);uiState.modal=null;onAction.mockClear();onCooking.mockClear();target=document.createElement('div');document.body.append(target);component=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction,onCooking,onExit:()=>{}}});flushSync();});
afterEach(async()=>{await unmount(component);target.remove();uiState.modal=null;});
describe('home context branches and folded personal tools',()=>{
  it('places the independent simple meal between cooking and furnishing',()=>{
    click(target.querySelector<HTMLButtonElement>('[data-home-object="kitchen"]')!);
    const roots=[...target.querySelectorAll<HTMLButtonElement>('.action-roots>button')];
    expect(roots[0].textContent).toContain('做饭');expect(roots[1].hasAttribute('data-home-simple-meal')).toBe(true);expect(roots[2].textContent).toContain('布置与升级');
    click(roots[1]);expect(onAction).toHaveBeenCalledTimes(1);expect(onAction.mock.calls[0][0].id).toBe('eat_simple_meal_home');expect(onCooking).not.toHaveBeenCalled();
  });
  it('keeps personal tools folded until requested, then opens phone through the existing modal',()=>{
    expect(target.querySelector('.personal-fold')).toBeNull();expect(target.querySelector('.home-status')).not.toBeNull();expect(target.querySelectorAll('.body-stat')).toHaveLength(5);
    click(target.querySelector<HTMLButtonElement>('[aria-label="随身面板"]')!);expect(target.querySelector('.personal-fold')).not.toBeNull();
    click([...target.querySelectorAll<HTMLButtonElement>('.personal-fold button')].find(b=>b.textContent?.includes('手机'))!);
    expect(uiState.modal).toBe('phone');expect(target.querySelector('.personal-fold')).toBeNull();
  });
  it('opens the full phone from the presentation-only pocket without advancing the game',()=>{
    const before=JSON.stringify({time:gameState.time,money:gameState.player.money});click(target.querySelector<HTMLButtonElement>('[data-home-phone-pocket]')!);
    expect(uiState.modal).toBe('phone');expect(target.querySelector('[data-home-phone-pocket] button')).toBeNull();expect(JSON.stringify({time:gameState.time,money:gameState.player.money})).toBe(before);
  });
  it('expands sleep choices without advancing time, and a short rest advances exactly two hours',()=>{
    gameState.player.attrs.stamina=30;flushSync();const money=gameState.player.money;bed();
    expect(target.querySelectorAll('[data-home-sleep]')).toHaveLength(3);expect(gameState.time.hour).toBe(10);
    click(target.querySelector<HTMLButtonElement>('[data-home-sleep="nap"]')!);
    expect(gameState.time.hour).toBe(12);expect(gameState.time.minute).toBe(15);expect(gameState.player.money).toBe(money);expect(gameState.player.attrs.stamina).toBe(60);expect(target.querySelector('.home-detail')).toBeNull();
  });
  it('natural rest retains the established alarm rule and advances to the next alarm',()=>{
    gameState.time.hour=23;gameState.time.minute=15;gameState.alarmHour=6;flushSync();bed();
    expect(target.querySelector<HTMLButtonElement>('[data-home-sleep="nap"]')!.disabled).toBe(true);
    click(target.querySelector<HTMLButtonElement>('[data-home-sleep="natural"]')!);
    expect(gameState.time.hour).toBe(6);expect(gameState.time.minute).toBe(0);expect(gameState.alarmHour).toBe(6);
  });
  it('embeds the timed controls beside the bed and uses the selected duration once',()=>{
    bed();click(target.querySelector<HTMLButtonElement>('[data-home-sleep="timed"]')!);
    expect(target.querySelector('.overlay.embedded')).not.toBeNull();expect(target.querySelector('.timed-editor [data-home-sleep]')).toBeNull();
    const slider=target.querySelector<HTMLInputElement>('.timed-editor input[type="range"]')!;slider.value='4';slider.dispatchEvent(new Event('input',{bubbles:true}));flushSync();
    click([...target.querySelectorAll<HTMLButtonElement>('.timed-editor button')].find(b=>b.textContent?.includes('睡 4 小时'))!);
    expect(gameState.time.hour).toBe(14);expect(gameState.time.minute).toBe(15);expect(target.querySelector('.timed-editor')).toBeNull();
  });
  it('opens one cooking workbench without legacy direct-dish or practice shortcuts',()=>{
    gameState.flags.cook_utensil=true;flushSync();click(target.querySelector<HTMLButtonElement>('[data-home-object="kitchen"]')!);
    expect(target.querySelector('[data-home-branch="cook"]')).toBeNull();click(button('做饭'));expect(button('正式烹饪')).toBeDefined();expect(button('料理练手')).toBeUndefined();
    for(const legacy of ['吃泡面','炒时蔬','拌沙拉','炖红烧肉','做两菜一汤','煎牛排'])expect(button(legacy)).toBeUndefined();
    expect(target.querySelectorAll('[data-home-branch="cook"] button')).toHaveLength(1);
    click(button('正式烹饪'));expect(onCooking).toHaveBeenCalledTimes(1);expect(onAction).not.toHaveBeenCalled();
  });
});
