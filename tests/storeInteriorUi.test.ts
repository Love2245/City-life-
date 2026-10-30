// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import StoreInterior from '../src/components/layout/StoreInterior.svelte';
import {STORE_FACILITIES,type StoreFacilityId} from '../src/lib/convenienceStore/facilities';
import {uiState} from '../src/stores/uiStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {visibleActionsAtLocation} from '../src/game/core/actions';
import {isFacilityProduct} from '../src/game/core/facilityShopping';
import {itemCount} from '../src/game/core/items';
// These component tests exercise venue interactions; full overlay timing is covered by scene-loading integration tests.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

const fake=vi.hoisted(()=>({options:null as Record<string,any>|null,dispose:vi.fn(),update:vi.fn()}));
vi.mock('../src/lib/convenienceStore3D',()=>({createStoreRoom:vi.fn((_host:HTMLElement,options:Record<string,any>)=>{fake.options=options;return{ready:Promise.resolve(),update:fake.update,dispose:fake.dispose,selectFacility:vi.fn((id:StoreFacilityId|null)=>options.onSelect(id?{id,...STORE_FACILITIES[id],x:50,y:40,visible:true}:null)),focus:vi.fn(),overview:vi.fn(),reset:vi.fn(),zoom:vi.fn(),rotate:vi.fn(),setQuality:vi.fn(),setDragMode:vi.fn(),toggleDoor:vi.fn()};})}));
const settle=async()=>{await vi.waitFor(()=>{flushSync();expect(fake.options).not.toBeNull();});await new Promise(done=>setTimeout(done,0));flushSync();};
function select(id:StoreFacilityId){flushSync(()=>fake.options!.onSelect({id,...STORE_FACILITIES[id],x:50,y:40,visible:true}));}
function click(target:HTMLElement,selector:string){flushSync(()=>target.querySelector<HTMLButtonElement>(selector)!.click());}
beforeEach(()=>{fake.options=null;const state=createInitialState();state.locationId='convenience_store';state.time.hour=10;state.time.minute=15;state.player.money=1000;replaceState(state);uiState.modal=null;});
afterEach(()=>{uiState.modal=null;uiState.npcTalk=null;uiState.npcTaskPanel=null;document.body.innerHTML='';vi.clearAllMocks();});
describe('store facility interactions',()=>{
  it('updates the live store weather without changing the clock or purchasing anything',async()=>{
    gameState.weather.id='rain';const clock=JSON.stringify(gameState.time),money=gameState.player.money,target=document.createElement('div');document.body.append(target);
    const component=mount(StoreInterior,{target,props:{night:false,onExit:()=>{}}});await settle();expect(fake.options?.weather).toBe('rain');
    gameState.weather.id='cloudy';flushSync();expect(fake.update).toHaveBeenLastCalledWith({night:false,weather:'cloudy'});expect(JSON.stringify(gameState.time)).toBe(clock);expect(gameState.player.money).toBe(money);await unmount(component);
  });
  it('shows products directly on the selected model, preserves the cart across facilities, and settles once',async()=>{
    const target=document.createElement('div');document.body.append(target);const products=visibleActionsAtLocation(gameState,gameState.locationId).filter(isFacilityProduct);const component=mount(StoreInterior,{target,props:{night:false,products,onExit:()=>{}}});await settle();
    expect(target.querySelector('[data-store-fullscreen="true"]')).not.toBeNull();expect(target.querySelector('[data-store-product]')).toBeNull();
    const displayed=()=>[...target.querySelectorAll<HTMLElement>('[data-store-product]')].map(e=>e.dataset.storeProduct).sort();const before=JSON.stringify(gameState);
    select('fresh');expect(displayed()).toEqual(['buy_lunch_convenience','buy_salad_convenience','buy_sandwich_convenience']);expect(target.querySelector('[data-store-shop]')).toBeNull();expect(uiState.modal).toBeNull();click(target,'[aria-label="添加盒饭"]');
    select('drinks');expect(displayed()).toEqual(['buy_drink_convenience','convenience_store_energy_drink']);click(target,'[aria-label="添加饮料"]');
    select('noodles');expect(displayed()).toEqual(['buy_noodles_convenience']);select('seasoning');expect(displayed()).toHaveLength(5);click(target,'[aria-label="添加盐"]');expect(target.textContent).toContain('采购清单 · 3 件');expect(JSON.stringify(gameState)).toBe(before);
    select('checkout');expect(target.querySelectorAll('[data-store-cart-line]')).toHaveLength(3);const checkout=target.querySelector<HTMLButtonElement>('[data-store-checkout]')!;checkout.click();checkout.click();flushSync();
    expect(gameState.player.money).toBe(984);expect(itemCount(gameState,'bento')).toBe(1);expect(itemCount(gameState,'drink')).toBe(1);expect(itemCount(gameState,'salt')).toBe(1);expect(gameState.time.hour).toBe(10);expect(gameState.time.minute).toBe(30);expect(uiState.modal).toBe('result');expect(target.querySelector('[data-store-cart]')).toBeNull();
    await unmount(component);expect(fake.dispose).toHaveBeenCalled();
  });
  it('preserves the night blind-box restriction and the selected door exit flow',async()=>{
    const target=document.createElement('div');document.body.append(target);const onExit=vi.fn(),onBlindBox=vi.fn();const component=mount(StoreInterior,{target,props:{night:false,onExit,onBlindBox,blindBox:{title:'夜间盲盒',detail:'10 元',disabled:true,reason:'22:00 后供应'}}});await settle();
    select('blindbox');expect(target.querySelector<HTMLButtonElement>('[data-store-blindbox]')!.disabled).toBe(true);expect(target.textContent).toContain('22:00 后供应');expect(onBlindBox).not.toHaveBeenCalled();
    select('door');expect(onExit).not.toHaveBeenCalled();click(target,'[data-store-leave]');expect(onExit).toHaveBeenCalledTimes(1);await unmount(component);
  });
});
