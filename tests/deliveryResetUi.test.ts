// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MiniGameModal from '../src/components/layout/MiniGameModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { rideHailingParttime } from '../src/game/core/jobs';
import { gameState, replaceState, currentView } from '../src/stores/gameStore.svelte';
import { presentWorkSession, uiState } from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn(),beginMinigameMusic:vi.fn(()=>()=>{}),getAudioSettings:vi.fn(()=>({musicEnabled:true,musicVolume:.6,sfxVolume:.8,muted:false,paused:false})),subscribeAudioSettings:vi.fn(()=>()=>{})}));
let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement;
beforeEach(()=>{
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  Element.prototype.animate=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;
  const state=createInitialState(901);state.time.hour=5;state.time.minute=0;
  Object.assign(state.player.attrs,{stamina:100,satiety:100,hygiene:100});
  Object.assign(state.flags,{app_ride_hailing:true,item_car:true,item_driving_license:true});state.player.skills.driving=1;
  replaceState(state);expect(rideHailingParttime(gameState).ok).toBe(true);presentWorkSession();
  target=document.createElement('div');document.body.append(target);component=mount(MiniGameModal,{target});flushSync();
});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target.remove();uiState.modal=null;uiState.minigamePayload=null;replaceState(createInitialState(1));vi.restoreAllMocks();});
function bridge(){
  const frame=target.querySelector('iframe')!;
  const bridgeId=/__STREET_DISPATCH_BRIDGE_ID__="([^"]+)"/.exec(frame.srcdoc)![1];
  const send=(data:Record<string,unknown>,source:MessageEventSource|null=frame.contentWindow)=>window.dispatchEvent(new MessageEvent('message',{source,data:{channel:'urban-life-street-dispatch',bridgeId,...data}}));
  return {frame,send};
}
function progress(count=2,fare=40){return {schema:'urban-life-street-dispatch',version:1,sceneKey:'job_ride_hailing',kind:'rideshare',mode:'playing',delivered:count,earnedFare:fare,remaining:120,player:{x:760,y:500},orders:[]};}
describe('实际班次与配送 iframe 联动',()=>{
  it('匹配来源的实时进度带回班次；完成事件按满意度发工资并清除活动班次',()=>{
    const {send}=bridge(),cash=gameState.player.money;
    send({type:'progress',progress:progress(),completedOrders:2,earnedFare:40},window);flushSync();expect(gameState.work?.active?.completedOrders).toBe(0);
    send({type:'progress',progress:progress(),completedOrders:2,earnedFare:40});flushSync();
    expect(gameState.work?.active).toMatchObject({completedOrders:2,deliveryEarnedFare:40,minigameProgress:progress()});expect(gameState.player.money).toBe(cash);
    send({type:'finish',ratio:1,completedOrders:2,earnedFare:40,final:true,reason:'本班时间已到'});flushSync();
    expect(gameState.work?.active).toBeUndefined();expect(gameState.player.money).toBe(cash+40);
    send({type:'finish',ratio:1,completedOrders:2,earnedFare:40,final:true});expect(gameState.player.money).toBe(cash+40);
  });
  it('暂停保持原 iframe 和工位，保存退出先索取最新快照再写存档',async()=>{
    const {send,frame}=bridge();send({type:'initialized',restored:false});flushSync();
    send({type:'progress',progress:progress(1,25),completedOrders:1,earnedFare:25});send({type:'pause-request'});flushSync();
    expect(gameState.work?.active?.status).toBe('paused');expect(target.querySelector('iframe')).toBe(frame);
    const latest=progress(1,25);latest.remaining=119.75;
    vi.spyOn(frame.contentWindow!,'postMessage').mockImplementation((data:any)=>{if(data.type==='snapshot')send({type:'progress',progress:latest,completedOrders:1,earnedFare:25});});
    const save=Array.from(target.querySelectorAll<HTMLButtonElement>('.mg-pause-actions button')).find(b=>b.textContent?.includes('保存并返回菜单'))!;
    save.click();await new Promise(resolve=>setTimeout(resolve,0));flushSync();
    const saved=JSON.parse(localStorage.getItem('urban_life_save_auto')!);
    expect(saved.work.active.minigameProgress.remaining).toBe(119.75);expect(saved.work.active.deliveryEarnedFare).toBe(25);expect(currentView.name).toBe('menu');
  });
  it('班次最后一帧到期与暂停同时发生时，继续后完成结算且不会卡在结束画面',()=>{
    const {send}=bridge(),cash=gameState.player.money;
    send({type:'pause-request'});flushSync();expect(gameState.work?.active?.status).toBe('paused');
    const snapshot={...progress(2,40),mode:'end',remaining:0};
    send({type:'progress',progress:snapshot,completedOrders:2,earnedFare:40});
    send({type:'finish',ratio:1,completedOrders:2,earnedFare:40,final:true,reason:'本班时间已到'});flushSync();
    expect(gameState.player.money).toBe(cash);expect(gameState.work?.active?.deliveryEarnedFare).toBe(40);
    target.querySelector<HTMLButtonElement>('.mg-pause-primary')!.click();flushSync();
    expect(gameState.work?.active).toBeUndefined();expect(gameState.player.money).toBe(cash+40);
  });
});
