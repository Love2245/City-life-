// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MiniGameModal from '../src/components/layout/MiniGameModal.svelte';
import PhoneSnake from '../src/components/layout/minigames/PhoneSnake.svelte';
import { createInitialState } from '../src/game/core/state';
import { getAction, performAction } from '../src/game/core/actions';
import { getMiniGameConfigFor, type RestaurantCfg } from '../src/game/core/minigame';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState, setGameMode, presentJobResult } from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn(),beginMinigameMusic:vi.fn(()=>()=>{}),getAudioSettings:vi.fn(()=>({musicEnabled:true,musicVolume:.6,sfxVolume:.8,muted:false,paused:false})),subscribeAudioSettings:vi.fn(()=>()=>{})}));
let component:ReturnType<typeof mount>|undefined;
let target:HTMLDivElement;
beforeAll(()=>{
  Element.prototype.animate = (()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;
  globalThis.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}} as any;
});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();uiState.modal=null;uiState.minigamePayload=null;uiState.resultPayload=null;setGameMode('pc');vi.useRealTimers();vi.restoreAllMocks();});
function tick(ms:number){vi.advanceTimersByTime(ms);flushSync();}
function click(selector:string){target.querySelector<HTMLButtonElement>(selector)!.click();flushSync();}
function category(n:number){target.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n].click();flushSync();}
function startStall(){
  vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.1);vi.spyOn(document,'hidden','get').mockReturnValue(false);setGameMode('pc');
  const state=createInitialState(1);state.time.hour=16;state.player.attrs.stamina=100;state.player.skills.cooking=2;
  const action=getAction('stall_street_night')!;state.locationId=action.locationId;state.inventory.vegetable=1;state.inventory.meat=1;replaceState(state);
  const before={money:state.player.money,stamina:state.player.attrs.stamina,time:structuredClone(state.time)};
  const result=performAction(state,action.id);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);
  expect(state.player.money).toBe(before.money);expect(state.player.attrs.stamina).toBe(before.stamina);expect(state.time).toEqual(before.time);
  const cfg=getMiniGameConfigFor(state,action.id) as RestaurantCfg;
  presentJobResult(result.result,cfg,{id:action.id,name:action.name,icon:action.icon});
  target=document.createElement('div');document.body.append(target);component=mount(MiniGameModal,{target});flushSync();return cfg;
}
function serveFirstCustomer(cfg:RestaurantCfg){
  category(0);for(const id of cfg.recipes[0].recipe)click(`[data-item-id="${id}"]`);
  category(1);click(`[data-item-id="${cfg.sides![0].id}"]`);category(2);click(`[data-item-id="${cfg.drinks![0].id}"]`);
  tick(4200);click('.craft-flip');tick(3400);click('.craft-primary');tick(1000);click('.craft-primary');tick(2000);
  expect(target.querySelector('[data-production-phase="done"]')).not.toBeNull();click('.rg-ing-controls .action');
  expect(target.querySelector('.rg-stall-inc')?.textContent).toContain('9');
  expect(target.querySelector('.rg-top')?.textContent).toContain('1/30');
}
describe('2026-10-03 UI regressions',()=>{
 it('Esc settles customers already served at the stall',()=>{
  const cfg=startStall(), money=gameState.player.money, stamina=gameState.player.attrs.stamina,hour=gameState.time.hour;
  serveFirstCustomer(cfg);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));flushSync();
  expect(uiState.modal).toBe('result');
  expect(gameState.player.money).toBe(money+9);
  expect(gameState.player.attrs.stamina).toBe(stamina-(cfg.stallStaminaCost ?? 4));
  expect(gameState.time.hour+gameState.time.minute/60).toBe(hour+(cfg.stallHourPerCustomer ?? 0.3));
 });
 it('a hidden stall freezes customer patience and resumes when visible',()=>{
  startStall();
  const initial=target.querySelector('.rg-cust.active .rg-patience-fill')?.getAttribute('style');
  let hidden=true;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
  document.dispatchEvent(new Event('visibilitychange'));flushSync();
  tick(10000);
  const after=target.querySelector('.rg-cust.active .rg-patience-fill')?.getAttribute('style');
  expect(after).toBe(initial);
  expect(uiState.modal).toBe('minigame');
  for(let i=0;i<350;i++)tick(200);
  expect(uiState.modal).toBe('minigame');
  hidden=false;document.dispatchEvent(new Event('visibilitychange'));flushSync();tick(1000);
  expect(target.querySelector('.rg-cust.active .rg-patience-fill')?.getAttribute('style')).not.toBe(initial);
 });
 it('snake moving into a vacating tail square continues the game',()=>{
  vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.1);
  target=document.createElement('div');document.body.append(target);component=mount(PhoneSnake,{target});flushSync();
  click('.sn-head .sn-btn');tick(700);expect(target.querySelector('.sn-head')?.textContent).toContain('1/20');
  for(const key of ['ArrowUp','ArrowLeft','ArrowDown']){window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));tick(140);}
  expect(target.querySelector('.sn-msg')).toBeNull();
  expect(target.querySelector('.sn-head')?.textContent).toContain('1/20');
 });
});

