// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import ScenePanel from '../src/components/layout/ScenePanel.svelte';
import {createInitialState} from '../src/game/core/state';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {beginSceneLoading} from '../src/stores/sceneLoading.svelte';
import {setSceneMode,uiState} from '../src/stores/uiStore.svelte';

// These component tests exercise venue interactions; full overlay timing is covered by scene-loading integration tests.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

const fake=vi.hoisted(()=>({created:0,disposed:0,stills:0,stillDisposed:0}));
vi.mock('../src/lib/venueStill',()=>{const create=()=>{fake.stills++;return{ready:Promise.resolve(),update(){},setQuality(){},setResolution(){},selectFacility(){},dispose(){fake.stillDisposed++;}};};return{createCafeStill:create,createStoreStill:create};});
vi.mock('../src/lib/homeStillView',()=>({createHomeStillView:()=>{fake.stills++;return{ready:Promise.resolve(),update(){},setWalls(){},setQuality(){},select(){},hover(){},dispose(){fake.stillDisposed++;}};}}));
vi.mock('../src/lib/cafeRoom3D',()=>({createCafeRoom:()=>{fake.created++;return {ready:Promise.resolve(),update:()=>{},setQuality:()=>{},setResolution:()=>{},dispose:()=>{fake.disposed++;}};}}));
vi.mock('../src/lib/convenienceStore3D',()=>({createStoreRoom:()=>{fake.created++;return {ready:Promise.resolve(),update:()=>{},setQuality:()=>{},setResolution:()=>{},dispose:()=>{fake.disposed++;}};}}));
vi.mock('../src/lib/homeRoom3D',async original=>({...await original<typeof import('../src/lib/homeRoom3D')>(),createHomeRoom:()=>{fake.created++;return {ready:Promise.resolve(),update:()=>{},setQuality:()=>{},setWalls:()=>{},setResolution:()=>{},dispose:()=>{fake.disposed++;}};}}));
let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement;
const settle=async()=>{await new Promise(done=>setTimeout(done,0));flushSync();};
beforeAll(()=>{Element.prototype.animate=(()=>{
  let cancelled=false;
  const animation={finished:Promise.resolve(),onfinish:null as null|(()=>void),currentTime:0,playState:'running',cancel(){cancelled=true;},play(){},pause(){}};
  queueMicrotask(()=>{if(!cancelled){animation.playState='finished';animation.onfinish?.();}});
  return animation;
}) as any;globalThis.ResizeObserver??=class{observe(){}disconnect(){}} as any;window.matchMedia??=((media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){}})) as any;});
beforeEach(()=>{fake.created=fake.disposed=fake.stills=fake.stillDisposed=0;uiState.modal=null;uiState.gameMode='pc';setSceneMode('2d');target=document.createElement('div');document.body.append(target);});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target.remove();setSceneMode('3d');uiState.modal=null;});

for(const location of ['cafe','convenience_store','own_apartment'])it(`${location}: 2D photographs replace the former classic scene, and mode switches release renderers`,async()=>{
  const state=createInitialState(235);state.locationId=location;state.time.hour=14;state.player.money=500000;if(location==='own_apartment'){state.living.mode='own';state.living.ownedId='own_apartment';}replaceState(state);
  const before={money:gameState.player.money,time:JSON.stringify(gameState.time)};component=mount(ScenePanel,{target});flushSync();
  await vi.waitFor(()=>{flushSync();expect(fake.stills).toBe(1);},{timeout:5000});
  expect(target.querySelector('.loc-card')).toBeNull();expect(fake.created).toBe(0);expect(target.querySelector('.home-body')).not.toBeNull();
  setSceneMode('3d');flushSync();await vi.waitFor(()=>{flushSync();expect(fake.created).toBe(1);},{timeout:5000});expect(fake.stillDisposed).toBe(1);
  setSceneMode('2d');flushSync();await vi.waitFor(()=>{flushSync();expect(fake.stills).toBe(2);expect(fake.disposed).toBe(1);});
  expect(target.querySelector('.loc-card')).toBeNull();expect(gameState.player.money).toBe(before.money);expect(JSON.stringify(gameState.time)).toBe(before.time);
});

it('offers retry after graphics context loss while retaining the chosen 3D mode and save',async()=>{
  const state=createInitialState(236);state.locationId='cafe';state.time.hour=14;replaceState(state);setSceneMode('3d');component=mount(ScenePanel,{target});flushSync();await settle();await settle();
  await vi.waitFor(()=>{flushSync();expect(fake.created).toBe(1);});
  const before={money:gameState.player.money,time:JSON.stringify(gameState.time)};document.dispatchEvent(new Event('scene-context-lost'));flushSync();await settle();
  expect(uiState.sceneMode).toBe('3d');expect(vi.mocked(beginSceneLoading).mock.results.slice(-1)[0].value.fail).toHaveBeenCalledWith(expect.stringContaining('3D 场景已中断'));expect(gameState.player.money).toBe(before.money);expect(JSON.stringify(gameState.time)).toBe(before.time);
});
