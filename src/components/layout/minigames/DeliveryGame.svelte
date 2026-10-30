<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { DeliveryCfg } from '../../../game/core/minigame';
  import type { TrafficIncident } from '../../../game/core/deliveryShift';
  import { getAudioSettings, subscribeAudioSettings, playSound } from '../../../lib/audio';
  import { STREET_DISPATCH_CHANNEL, cloneStreetDispatchProgress, readStreetDispatchMessage, streetDispatchDocument } from '../../../lib/streetDispatch/bridge';
  let { cfg, sceneKey='', seed, paused=false, initialProgress, onProgress, onPause, onFinish, onIncident }: {
    cfg:DeliveryCfg;sceneKey?:string;seed?:number;paused?:boolean;initialProgress?:unknown;
    onProgress?:(progress:unknown)=>void;onPause?:()=>void;
    onFinish:(ratio:number,completedOrders?:number,final?:boolean,reason?:string,earnedFare?:number)=>void;
    onIncident?:(incident:TrafficIncident)=>void;
  }=$props();
  // Periodic session updates must not rebuild its running frame.
  const initial=untrack(()=>({cfg:cloneStreetDispatchProgress(cfg),sceneKey,seed,progress:cloneStreetDispatchProgress(initialProgress)}));
  const bridgeId=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const documentSource=streetDispatchDocument(bridgeId);
  let frame:HTMLIFrameElement,initialized=$state(false),finalReceived=false,lastCompleted=0;
  const snapshotWaiters=new Set<()=>void>();
  export async function flushProgress():Promise<void>{
    if(!initialized)return;
    await new Promise<void>((resolve,reject)=>{
      const complete=()=>{clearTimeout(timeout);snapshotWaiters.delete(complete);resolve();};
      const timeout=setTimeout(()=>{snapshotWaiters.delete(complete);reject(new Error('Delivery progress did not respond'));},1500);
      snapshotWaiters.add(complete);send('snapshot');
    });
  }
  function send(type:string,payload:Record<string,unknown>={}){frame?.contentWindow?.postMessage({channel:STREET_DISPATCH_CHANNEL,bridgeId,type,...payload},'*');}
  function initializeFrame(){if(!initialized)send('init',{...initial,paused,pauseWithParent:!!onPause,audioSettings:getAudioSettings()});}
  $effect(()=>{const freeze=paused;if(initialized)send('pause',{paused:freeze});});
  onMount(()=>{
    const unsubscribeAudio = subscribeAudioSettings(audioSettings => send('audio-settings',{audioSettings}));
    let initTimer:ReturnType<typeof setInterval> | undefined;
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame?.contentWindow)return;
      const message=readStreetDispatchMessage(event.data,bridgeId);if(!message)return;
      if(message.type==='ready')initializeFrame();
      else if(message.type==='initialized'){
        initialized=true;
        if(initTimer!==undefined){clearInterval(initTimer);initTimer=undefined;}
      }
      else if(message.type==='progress'){onProgress?.(message.progress);if(!finalReceived)onFinish(Math.min(1,message.completedOrders/(cfg.targetOrders??6)),message.completedOrders,false,'',message.earnedFare);if(message.completedOrders>lastCompleted){lastCompleted=message.completedOrders;playSound('coin');}for(const resolve of snapshotWaiters)resolve();}
      else if(message.type==='pause-request')onPause?.();
      else if(message.type==='incident'&&!finalReceived)onIncident?.(message.incident);
      else if(message.type==='finish'&&!finalReceived){if(message.final)finalReceived=true;playSound('game');onFinish(message.ratio,message.completedOrders,message.final,message.reason,message.earnedFare);}
    };
    window.addEventListener('message',receive);
    // The frame's first ready or load notification can arrive before the host
    // listener or child script. Re-send init until the frame confirms it.
    initTimer=setInterval(initializeFrame,500);
    initializeFrame();
    return()=>{if(initTimer!==undefined)clearInterval(initTimer);unsubscribeAudio();send('dispose');window.removeEventListener('message',receive);for(const resolve of snapshotWaiters)resolve();};
  });
</script>
<iframe class="street-dispatch-frame" title={`${cfg.title} · 俯视自由驾驶`} aria-label={`${cfg.title} · 自由驾驶、停靠取送与派单`} srcdoc={documentSource} sandbox="allow-scripts" bind:this={frame} onload={initializeFrame}></iframe>
<style>
 .street-dispatch-frame{display:block;width:100%;height:100%;min-width:0;min-height:0;border:0;background:#0c131f;border-radius:14px;}
</style>
