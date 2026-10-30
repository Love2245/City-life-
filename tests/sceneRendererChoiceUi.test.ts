// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import HomeTour from '../src/components/layout/HomeTour.svelte';
import StoreInterior from '../src/components/layout/StoreInterior.svelte';
import CafeInterior from '../src/components/layout/CafeInterior.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo,visibleActionsAtLocation} from '../src/game/core/actions';
import {beginSceneLoading} from '../src/stores/sceneLoading.svelte';

const calls=vi.hoisted(()=>({home3d:vi.fn(),home2d:vi.fn(),store3d:vi.fn(),store2d:vi.fn(),cafe3d:vi.fn(),cafe2d:vi.fn()}));
vi.mock('../src/stores/sceneLoading.svelte',()=>({sceneLoading:{current:null},beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn()}));
function room(){return{ready:Promise.resolve(),update:vi.fn(),dispose:vi.fn(),setWalls:vi.fn(),setResolution:vi.fn(),setQuality:vi.fn(),select:vi.fn(),selectFacility:vi.fn(),rotate:vi.fn(),focus:vi.fn(),hover:vi.fn(),zoom:vi.fn(),toggleDoor:vi.fn()};}
vi.mock('../src/lib/homeRoom3D',()=>({createHomeRoom:(...args:unknown[])=>{calls.home3d(...args);return room();}}));
vi.mock('../src/lib/homeStillView',()=>({createHomeStillView:(...args:unknown[])=>{calls.home2d(...args);return room();}}));
vi.mock('../src/lib/homeReferenceVisuals',()=>({createHomeReferenceVisuals:()=>({})}));
vi.mock('../src/lib/convenienceStore3D',()=>({createStoreRoom:(...args:unknown[])=>{calls.store3d(...args);return room();}}));
vi.mock('../src/lib/cafeRoom3D',()=>({createCafeRoom:(...args:unknown[])=>{calls.cafe3d(...args);return room();}}));
vi.mock('../src/lib/venueStill',()=>({createStoreStill:(...args:unknown[])=>{calls.store2d(...args);return room();},createCafeStill:(...args:unknown[])=>{calls.cafe2d(...args);return room();}}));
afterEach(()=>{vi.clearAllMocks();uiState.sceneMode='3d';uiState.gameMode='pc';uiState.modal=null;document.body.replaceChildren();});
function state(){const s=createInitialState(149702);s.player.money=10000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');replaceState(s);}
describe('only the selected scene mode chooses the renderer',()=>{
  it.each([{device:'pc',mode:'3d'},{device:'pc',mode:'2d'},{device:'pe',mode:'3d'},{device:'pe',mode:'2d'}] as const)('$device / $mode uses the selected factory for home, store and cafe',async({device,mode})=>{
    state();uiState.gameMode=device;uiState.sceneMode=mode;
    const target=document.createElement('div');document.body.append(target);
    const suffix=mode==='2d'?'2d':'3d',other=mode==='2d'?'3d':'2d';
    const home=mount(HomeInterior,{target,props:{actions:visibleActionsAtLocation(gameState,gameState.locationId),onAction:()=>{},onCooking:()=>{},onExit:()=>{}}});flushSync();
    try{await vi.waitFor(()=>expect(calls[`home${suffix}`]).toHaveBeenCalledOnce());expect(calls[`home${other}`]).not.toHaveBeenCalled();expect(target.querySelector('svg.home-fallback')).toBeNull();}finally{await unmount(home);}
    const store=mount(StoreInterior,{target,props:{night:false,onExit:()=>{}}});flushSync();
    try{await vi.waitFor(()=>expect(calls[`store${suffix}`]).toHaveBeenCalledOnce());expect(calls[`store${other}`]).not.toHaveBeenCalled();}finally{await unmount(store);}
    const cafe=mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{},onOrder:()=>{}}});flushSync();
    try{await vi.waitFor(()=>expect(calls[`cafe${suffix}`]).toHaveBeenCalledOnce());expect(calls[`cafe${other}`]).not.toHaveBeenCalled();}finally{await unmount(cafe);}
    const requests=vi.mocked(beginSceneLoading).mock.calls.map(call=>call[0]);expect(requests.length).toBe(3);
    expect(requests.every(request=>mode==='3d'?typeof request.fallback==='function':request.fallback===undefined)).toBe(true);
  });
  it('the legacy preview3d hint does not override an explicit 2D home-tour setting',async()=>{
    state();uiState.sceneMode='2d';uiState.gameMode='pc';const target=document.createElement('div');document.body.append(target);
    const tour=mount(HomeTour,{target,props:{homeId:'old_apartment',preview3d:true,onExit:()=>{}}});flushSync();
    try{await vi.waitFor(()=>expect(calls.home2d).toHaveBeenCalledOnce());expect(calls.home3d).not.toHaveBeenCalled();expect(target.querySelector('[data-tour-mode="2d"]')).toBeTruthy();expect(target.querySelector('svg')).toBeNull();}
    finally{await unmount(tour);}
  });
});
