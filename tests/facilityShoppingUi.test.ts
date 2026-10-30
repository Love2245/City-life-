// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import FacilityShoppingModal from '../src/components/layout/FacilityShoppingModal.svelte';
import {createInitialState} from '../src/game/core/state';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {itemCount} from '../src/game/core/items';
let target:HTMLDivElement,component:ReturnType<typeof mount>;
function button(label:string){return target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;}
function click(b:HTMLButtonElement){b.click();flushSync();}
function category(name:string){click([...target.querySelectorAll<HTMLButtonElement>('.retail-categories button')].find(b=>b.textContent===name)!);}
beforeEach(()=>{const s=createInitialState();s.locationId='convenience_store';s.time.hour=10;s.time.minute=15;s.player.money=1000;replaceState(s);uiState.modal='facility_shop';uiState.modalStack=[];target=document.createElement('div');document.body.append(target);component=mount(FacilityShoppingModal,{target});flushSync();});
afterEach(async()=>{await unmount(component);target.remove();uiState.modal=null;uiState.modalStack=[];});
describe('facility catalog and shared cart',()=>{
  it('keeps quantities across category and search changes, and commits one checkout',()=>{
    const before=JSON.stringify(gameState);category('饮品');click(button('添加饮料'));click(button('添加饮料'));category('调料');click(button('添加盐'));const search=target.querySelector<HTMLInputElement>('input[type=search]')!;search.value='酱油';search.dispatchEvent(new Event('input',{bubbles:true}));flushSync();expect(target.querySelectorAll('[data-cart-line]')).toHaveLength(2);expect(JSON.stringify(gameState)).toBe(before);
    click(target.querySelector<HTMLButtonElement>('[data-checkout-shop]')!);expect(itemCount(gameState,'drink')).toBe(2);expect(itemCount(gameState,'salt')).toBe(1);expect(gameState.player.money).toBe(993);expect(gameState.time.hour).toBe(10);expect(gameState.time.minute).toBe(30);expect(uiState.modal).toBe('result');
  });
  it('cancels and clears the cart without touching the player state',()=>{
    const before=JSON.stringify(gameState);click(button('添加盒饭'));click([...target.querySelectorAll<HTMLButtonElement>('.cart-heading button')][0]);expect(target.querySelectorAll('[data-cart-line]')).toHaveLength(0);click(button('关闭采购目录'));expect(JSON.stringify(gameState)).toBe(before);expect(uiState.modal).toBeNull();
  });
  it('ignores a second click on the stale checkout button',()=>{
    click(button('添加盒饭'));const checkout=target.querySelector<HTMLButtonElement>('[data-checkout-shop]')!;checkout.click();checkout.click();flushSync();expect(itemCount(gameState,'bento')).toBe(1);expect(gameState.player.money).toBe(988);expect(gameState.time.minute).toBe(15);
  });

});
