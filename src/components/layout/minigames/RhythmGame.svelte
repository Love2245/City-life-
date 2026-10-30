<script lang="ts">
 import {onMount,untrack} from 'svelte';
 import type {RhythmCfg} from '../../../game/core/minigame';
 import {judgeTimingAtScale,getJudgeWindow,JUDGE_SCORE,JUDGE_LABEL} from '../../../game/core/minigame';
 import {miniGameRandom} from '../../../lib/minigameRandom';
 import {buildFiveLaneChart} from '../../../lib/rhythmChart';
 import {playSound} from '../../../lib/audio';
 import FiveLaneStage from './FiveLaneStage.svelte';
 let {cfg,onFinish,paused=false,initialProgress,onProgress,difficultyScale=1}:{cfg:RhythmCfg;onFinish:(ratio:number)=>void;paused?:boolean;initialProgress?:unknown;onProgress?:(snapshot:unknown)=>void;difficultyScale?:number}=$props();
 type Note={track:number;hitAt:number;judged:boolean;judge:string|null};
 const random=miniGameRandom();
 let notes=$state<Note[]>([]),elapsed=$state(0),points=$state(0),combo=$state(0),maxCombo=$state(0),strayHits=$state(0),judge=$state(''),started=$state(false),localPaused=$state(false),done=$state(false),mounted=$state(false);
 let last=0,published=0;
 const playing=$derived(started&&!paused&&!localPaused&&!done);
 const fallMs=$derived(Math.max(1000,cfg.fallMs*difficultyScale));
 const scale=$derived(difficultyScale*.75);
 const windows=$derived(getJudgeWindow(scale));
 const accuracy=$derived(Math.max(0,(points-strayHits*20)/Math.max(1,notes.length)));
 function snapshot(){return{schema:'urban-life-rhythm',version:2,configuration:JSON.stringify([cfg,difficultyScale]),notesArr:JSON.parse(JSON.stringify(notes)),elapsed,score:points,combo,maxCombo,strayHits,started,localPaused,judge};}
 export async function flushProgress(){if(mounted&&!done)onProgress?.(snapshot());}
 function restore(raw:unknown){
  if(!raw||typeof raw!=='object')return false;const p=raw as ReturnType<typeof snapshot>;
  if(p.schema!=='urban-life-rhythm'||![1,2].includes(p.version)||!Array.isArray(p.notesArr)||!p.notesArr.length||p.notesArr.length>300)return false;
  try{if(JSON.parse(p.configuration)[0].title!==cfg.title)return false;}catch{return false;}
  if([p.elapsed,p.score,p.combo,p.maxCombo,p.strayHits??0].some(v=>!Number.isFinite(v)||v<0)||p.notesArr.some((n:Note)=>!Number.isFinite(n.hitAt)||n.hitAt<0||!Number.isInteger(n.track)||n.track<0||n.track>4||typeof n.judged!=='boolean'))return false;
  notes=p.notesArr;elapsed=p.elapsed;points=p.score;combo=p.combo;maxCombo=p.maxCombo;strayHits=p.strayHits??0;started=!!p.started;localPaused=started;judge='';return true;
 }
 function start(){if(paused||done)return;started=true;localPaused=false;last=performance.now();void flushProgress();}
 function pause(){if(!started||done)return;localPaused=true;void flushProgress();}
 function finish(){if(done)return;done=true;onFinish(Math.min(1,accuracy/100));}
 function sync(){const t=performance.now();elapsed+=Math.max(0,t-last);last=t;}
 function hit(track:number){
  if(!playing)return;sync();const note=notes.filter(n=>!n.judged&&n.track===track).sort((a,b)=>Math.abs(a.hitAt-elapsed)-Math.abs(b.hitAt-elapsed))[0];
  if(!note||Math.abs(note.hitAt-elapsed)>windows.ok){strayHits++;combo=0;judge='空拍';return;}
  const j=judgeTimingAtScale(elapsed-note.hitAt,scale);note.judged=true;note.judge=j;
  if(j==='miss')combo=0;else{points+=JUDGE_SCORE[j];combo++;maxCombo=Math.max(maxCombo,combo);playSound('game');}
  judge=JUDGE_LABEL[j];void flushProgress();if(notes.every(n=>n.judged))finish();
 }
 onMount(()=>{if(!restore(initialProgress))notes=buildFiveLaneChart(cfg.notes,cfg.intervalMs,fallMs,random).map(n=>({...n,judged:false,judge:null}));mounted=true;void flushProgress();return()=>{void flushProgress();mounted=false;};});
 $effect(()=>{if(!mounted||!playing){if(paused)untrack(()=>{void flushProgress();});return;}last=performance.now();const timer=setInterval(()=>{if(!playing)return;sync();for(const n of notes)if(!n.judged&&elapsed>n.hitAt+windows.ok){n.judged=true;n.judge='miss';combo=0;judge='错过';}if(elapsed>(notes.slice(-1)[0]?.hitAt??0)+windows.ok+200)finish();if(elapsed-published>=1000){published=elapsed;void flushProgress();}},16);return()=>clearInterval(timer);});
</script>
<svelte:window onblur={pause}/><svelte:document onvisibilitychange={()=>{if(document.hidden)pause();}}/>
<FiveLaneStage {notes} {elapsed} {fallMs} {playing} finished={done} score={accuracy} {combo} {judge} onhit={hit} onstart={start} onpause={pause}/>
