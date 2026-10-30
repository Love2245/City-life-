<script lang="ts">
 import {onDestroy} from 'svelte';
 import {getAudioSettings} from '../../../lib/audio';
 import type {DanceSession,LeisureInput} from '../../../game/core/districtLeisure';
 import FiveLaneStage from '../minigames/FiveLaneStage.svelte';
 let {session,oninput,onpause,enabled}:{session:DanceSession;oninput:(input:LeisureInput)=>void;onpause:()=>void;enabled:boolean}=$props();
 let running=$state(false),judge=$state('');let frame=0,last=0,context:AudioContext|undefined;
 const notes=$derived(session.notes.map(n=>({track:n.lane,hitAt:n.atMs,judged:n.status!=='pending'})));
 const accuracy=$derived(Math.max(0,(session.notes.reduce((sum,n)=>sum+(n.status==='hit'?(n.precision??1):0),0)-(session.strayHits??0)*.2)/Math.max(1,session.notes.length)*100));
 function pause(){if(running){running=false;onpause();}cancelAnimationFrame(frame);last=0;}
 function loop(t:number){if(!running||!enabled||document.hidden||session.phase!=='playing'){pause();return;}const before=session.notes.filter(n=>n.status==='miss').length;if(last)oninput({type:'dance_tick',dtMs:Math.min(100,t-last)});if(session.notes.filter(n=>n.status==='miss').length>before)judge='错过';last=t;frame=requestAnimationFrame(loop);}
 function start(){if(!enabled||session.phase!=='playing')return;try{context??=new AudioContext();void context.resume();}catch{}running=true;last=0;frame=requestAnimationFrame(loop);}
 function hit(lane:number){if(!running||!enabled)return;const missed=session.strayHits??0;oninput({type:'dance_hit',lane:lane as 0|1|2|3|4});const note=session.notes.filter(n=>n.lane===lane&&n.status==='hit').slice(-1)[0];judge=(session.strayHits??0)>missed?'空拍':note?.precision===1?'完美':note?.precision===.75?'良好':'普通';
  const settings=getAudioSettings();if(!context||context.state!=='running'||settings.muted||settings.paused||!settings.sfxVolume)return;const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=[261.63,293.66,329.63,392,440][lane];const t=context.currentTime;gain.gain.setValueAtTime(.035*settings.sfxVolume,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(t);oscillator.stop(t+.14);
 }
 $effect(()=>{if(!enabled||session.phase!=='playing')pause();});
 onDestroy(()=>{cancelAnimationFrame(frame);if(context)void context.close();});
</script>
<svelte:window onblur={pause}/><svelte:document onvisibilitychange={()=>{if(document.hidden)pause();}}/>
<FiveLaneStage {notes} elapsed={session.elapsedMs} playing={running} finished={session.phase==='ready'} score={accuracy} combo={session.combo??0} {judge} onhit={hit} onstart={start} onpause={pause}/>
