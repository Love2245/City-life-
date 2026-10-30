// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import CafeInterior from '../src/components/layout/CafeInterior.svelte';
import {cafeUiProps} from './helpers/cafeUiProps.svelte';
import {CAFE_FACILITIES,type CafeFacilityId} from '../src/lib/cafeRoom/facilities';
import {uiState} from '../src/stores/uiStore.svelte';
import {getAction} from '../src/game/core/actions';
import {gameState} from '../src/stores/gameStore.svelte';
// These component tests exercise venue interactions; full overlay timing is covered by scene-loading integration tests.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

const fake=vi.hoisted(()=>({rooms:[] as {update:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>;options:Record<string,any>;resolve:()=>void}[],pending:false,fail:false}));
vi.mock('../src/lib/cafeRoom3D',()=>({createCafeRoom:vi.fn((_host:HTMLElement,options:Record<string,any>)=>{
  if(fake.fail)throw Error('WebGL unavailable');let resolve=()=>{};const ready=fake.pending?new Promise<void>(done=>resolve=done):Promise.resolve();
  const room={ready,options,resolve,update:vi.fn(),dispose:vi.fn(),focus:vi.fn(),overview:vi.fn(),reset:vi.fn(),rotate:vi.fn(),zoom:vi.fn(),setQuality:vi.fn(),toggleDoor:vi.fn(),setDragMode:vi.fn(),selectFacility:vi.fn((id:CafeFacilityId|null)=>options.onSelect(id?{id,...CAFE_FACILITIES[id],x:50,y:40,visible:true}:null))};fake.rooms.push(room);return room;
})}));
const settle=async()=>{await vi.waitFor(()=>{flushSync();if(fake.fail)expect(document.querySelector('.failure')).not.toBeNull();else expect(fake.rooms.length).toBeGreaterThan(0);});await new Promise(done=>setTimeout(done,0));flushSync();};
function select(id:CafeFacilityId){flushSync(()=>fake.rooms[0].options.onSelect({id,...CAFE_FACILITIES[id],x:50,y:40,visible:true}));}
function click(target:HTMLElement,selector:string){flushSync(()=>target.querySelector<HTMLButtonElement>(selector)!.click());}
afterEach(()=>{fake.rooms.length=0;fake.pending=false;fake.fail=false;vi.restoreAllMocks();uiState.modal=null;uiState.npcTalk=null;uiState.npcTaskPanel=null;uiState.phoneStartApp='home';document.body.innerHTML='';});
describe('full-screen cafe facility interactions',()=>{
  it('selects the real facility before showing an action, and keeps click separate from settlement',async()=>{
    const target=document.createElement('div');document.body.append(target);const onOrder=vi.fn(),onNpc=vi.fn();const props=cafeUiProps(onOrder,onNpc);
    const component=mount(CafeInterior,{target,props});await settle();
    expect(target.querySelector('[data-cafe-fullscreen="true"]')).not.toBeNull();expect(target.querySelector('[data-cafe-order]')).toBeNull();expect(target.querySelector('[data-cafe-talk]')).toBeNull();
    expect(fake.rooms[0].update).toHaveBeenLastCalledWith({night:false,linPresent:true,weather:'sunny'});
    select('counter');expect(target.querySelector('[data-cafe-selected="counter"]')).not.toBeNull();expect(onOrder).not.toHaveBeenCalled();
    click(target,'[data-cafe-order]');expect(onOrder).toHaveBeenCalledTimes(1);expect(target.querySelector('[data-cafe-selected]')).toBeNull();
    select('lin');expect(onNpc).not.toHaveBeenCalled();click(target,'[data-cafe-talk]');expect(onNpc).toHaveBeenCalledTimes(1);
    props.night=true;props.linPresent=false;flushSync();expect(fake.rooms[0].update).toHaveBeenLastCalledWith({night:true,linPresent:false,weather:'sunny'});expect(target.querySelector('[data-cafe-talk]')).toBeNull();
    await unmount(component);expect(fake.rooms[0].dispose).toHaveBeenCalled();
  });
  it('forwards live weather changes to the same scene without ordering or advancing time',async()=>{
    const previous=gameState.weather.id,clock=JSON.stringify(gameState.time),money=gameState.player.money,onOrder=vi.fn();
    gameState.weather.id='rain';const target=document.createElement('div');document.body.append(target);const component=mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{},onOrder}});
    try{await settle();expect(fake.rooms[0].options.weather).toBe('rain');gameState.weather.id='snow';flushSync();expect(fake.rooms[0].update).toHaveBeenLastCalledWith({night:false,linPresent:false,weather:'snow'});expect(fake.rooms).toHaveLength(1);expect(onOrder).not.toHaveBeenCalled();expect(JSON.stringify(gameState.time)).toBe(clock);expect(gameState.player.money).toBe(money);}
    finally{gameState.weather.id=previous;await unmount(component);}
  });
  it('switches facilities, honors disabled actions, and sends exit and sofa activities to their handlers',async()=>{
    const target=document.createElement('div');document.body.append(target);const onOrder=vi.fn(),onExit=vi.fn(),onActivity=vi.fn();
    const component=mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{},onOrder,orderDisabled:true,orderReason:'今天已经喝过两杯',onExit,onActivity,activities:[getAction('cafe_sofa_relax')!,getAction('cafe_sofa_nap')!]}});await settle();
    select('counter');expect(target.querySelector<HTMLButtonElement>('[data-cafe-order]')!.disabled).toBe(true);expect(target.textContent).toContain('今天已经喝过两杯');
    select('door');expect(target.querySelector('[data-cafe-order]')).toBeNull();expect(onExit).not.toHaveBeenCalled();click(target,'[data-cafe-leave]');expect(onExit).toHaveBeenCalledTimes(1);
    gameState.locationId='cafe';gameState.time.hour=10;select('lounge');expect(onActivity).not.toHaveBeenCalled();expect(target.querySelector('[data-cafe-order]')).toBeNull();expect(target.querySelectorAll('[data-cafe-activity]')).toHaveLength(2);click(target,'[data-cafe-activity="cafe_sofa_relax"]');expect(onActivity).toHaveBeenCalledWith(getAction('cafe_sofa_relax'));select('service');expect(target.querySelector('[data-cafe-selected]')).toBeNull();expect(onOrder).not.toHaveBeenCalled();await unmount(component);
  });
  it('opens the actual jobs phone app instead of hiring or starting a shift on a selection',async()=>{
    const target=document.createElement('div');document.body.append(target);const onWork=vi.fn();const component=mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{},onWork,workOptions:[{id:'job',title:'店员',detail:'09:00 上班',requiresHiring:true}]}});await settle();
    select('coffee');expect(onWork).not.toHaveBeenCalled();click(target,'[data-cafe-job]');expect(uiState.phoneStartApp).toBe('jobs');expect(uiState.modal).toBe('phone');expect(onWork).not.toHaveBeenCalled();await unmount(component);
  });
  it('disposes a room that finishes loading after the player has already left',async()=>{
    fake.pending=true;const target=document.createElement('div');document.body.append(target);const component=mount(CafeInterior,{target,props:{night:false,linPresent:false,onNpc:()=>{}}});await settle();const room=fake.rooms[0];await unmount(component);room.resolve();await settle();expect(room.dispose).toHaveBeenCalled();expect(target.querySelector('[data-cafe-interior]')).toBeNull();
  });
  it('keeps facility-first actions available when WebGL is unavailable',async()=>{
    fake.fail=true;vi.spyOn(console,'error').mockImplementation(()=>{});const target=document.createElement('div');document.body.append(target);const onOrder=vi.fn(),onNpc=vi.fn();const component=mount(CafeInterior,{target,props:{night:false,linPresent:true,onOrder,onNpc}});await settle();expect(target.textContent).toContain('暂时无法显示店内场景');
    expect(target.textContent).not.toContain('店内设施');click(target,'.failure button');expect(uiState.sceneMode).toBe('2d');expect(onOrder).not.toHaveBeenCalled();expect(onNpc).not.toHaveBeenCalled();uiState.sceneMode='3d';await unmount(component);
  });
});
