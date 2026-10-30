// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import DeliveryGame from '../src/components/layout/minigames/DeliveryGame.svelte';
import {getMiniGameConfig,type DeliveryCfg} from '../src/game/core/minigame';
vi.mock('../src/lib/audio',()=>({getAudioSettings:()=>({musicEnabled:true,musicVolume:.6,sfxVolume:.8,muted:false,paused:false}),subscribeAudioSettings:()=>()=>{},playSound:()=>{}}));
let component:ReturnType<typeof mount>|undefined;
afterEach(async()=>{if(component)await unmount(component);component=undefined;document.body.replaceChildren();vi.useRealTimers();vi.restoreAllMocks();});
describe('配送宿主与 iframe 初始化握手',()=>{
  it('ready 或首次 init 丢失时重试；确认后停止重试且保留原始班次参数',()=>{
    vi.useFakeTimers();const target=document.createElement('div');document.body.append(target);
    const cfg=getMiniGameConfig('job_delivery') as DeliveryCfg;
    component=mount(DeliveryGame,{target,props:{cfg,sceneKey:'job_delivery',seed:1928,onFinish:()=>{}}});flushSync();
    const frame=target.querySelector('iframe')!;
    const bridgeId=/__STREET_DISPATCH_BRIDGE_ID__="([^"]+)"/.exec(frame.srcdoc)![1];
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    vi.advanceTimersByTime(1000);
    const retries=post.mock.calls.map(call=>call[0] as any).filter(message=>message.type==='init');
    expect(retries.length).toBeGreaterThanOrEqual(2);
    expect(retries.every(message=>message.bridgeId===bridgeId&&message.seed===1928&&message.sceneKey==='job_delivery'&&message.paused===false)).toBe(true);
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{channel:'urban-life-street-dispatch',bridgeId,type:'initialized',restored:false}}));flushSync();
    post.mockClear();vi.advanceTimersByTime(1500);
    expect(post.mock.calls.map(call=>call[0] as any).filter(message=>message.type==='init')).toHaveLength(0);
  });
});
