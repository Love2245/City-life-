<script lang="ts">
 import {onMount} from 'svelte';
 import type {RhythmCfg} from '../../../game/core/minigame';
 import {playSound} from '../../../lib/audio';
 let {cfg,onFinish,paused=false}:{cfg:RhythmCfg;onFinish:(n:number)=>void;paused?:boolean}=$props();
 const home=$derived(cfg.title.includes('居家'));
 const reps=$derived(Math.max(6,Math.round(cfg.notes/2)));
 let started=$state(false),done=$state(false),holding=$state(false),position=$state(0),count=$state(0),score=$state(0),message=$state(''),rest=$state(0),last=0;
 // Keep the exercise clock independent from Svelte rendering. Updating the
 // SVG paths and meter at display refresh rate caused needless layout/paint
 // work on lower-end WebViews, which presented as whole-screen flicker.
 let motionPosition=0, restRemaining=0, lastPaint=0;
 let raf=0;
 const FRAME_INTERVAL=1000/30;
 function start(){started=true;}
 function scheduleTick(){if(!raf&&!done)raf=requestAnimationFrame(tick);}
 function down(){if(!started||done||restRemaining>0||holding)return;holding=true;motionPosition=0;position=0;last=performance.now();lastPaint=0;scheduleTick();}
 function release(){if(!holding||done)return;holding=false;const error=Math.abs(motionPosition-.72);const points=error<.09?1:error<.2?.65:.2;score+=points;count++;message=points===1?'动作稳定，呼气还原':points===.65?'节奏不错，再稳一点':'过快或过度发力，放慢动作';playSound(points===1?'success':'game');restRemaining=1;rest=1;if(count>=reps)done=true;scheduleTick();}
 function tick(t:number){raf=0;if(paused)return;const dt=Math.min(.05,(t-last)/1000);last=t;if(holding){motionPosition=Math.min(1,motionPosition+dt*.48);if(motionPosition===1)release();}else {restRemaining=Math.max(0,restRemaining-dt);motionPosition=Math.max(0,motionPosition-dt);}if(t-lastPaint>=FRAME_INTERVAL||done){position=motionPosition;rest=restRemaining;lastPaint=t;}if(!done&&(holding||restRemaining>0||motionPosition>0))scheduleTick();}
 // 暂停期间 RAF 停走；恢复时按当前动作状态续跑，不会永久卡住。
 $effect(()=>{if(!paused&&(holding||restRemaining>0||motionPosition>0))scheduleTick();});
 function key(e:KeyboardEvent){if(e.key===' '){e.preventDefault();if(!e.repeat)down();}}
 onMount(()=>()=>cancelAnimationFrame(raf));
</script>
<svelte:window onkeydown={key} onkeyup={(e)=>{if(e.key===' ')release();}} onblur={()=>release()}/>
<div class="training" class:home><header><h3>{home?'居家力量训练':'健身房 · 控制举重'}</h3><span>{count}/{reps} 次</span></header><p>按住按钮发力，在金色区松手；呼气还原后开始下一次。支持空格键。</p>
 <div class="room"><svg viewBox="0 0 600 310" aria-hidden="true"><rect width="600" height="310" fill={home?'#5c655f':'#394d5a'}/><rect x="35" y="28" width="169" height="177" fill={home?'#b7c6bd':'#94a4a8'}/><path d="M118 28V205M35 111H204" stroke="#626f6a" stroke-width="8"/><path d="M0 240H600V310H0Z" fill="#8b7559"/><path d="M180 269H430" stroke="#365d68" stroke-width="27"/>
  {#if !home}<path d="M477 233V54M550 233V54M465 66H565" stroke="#9da7a6" stroke-width="12"/>{#each [100,145,190] as y}<path d={`M488 ${y}H544`} stroke="#263c47" stroke-width="16"/>{/each}{:else}<path d="M489 252V150M489 181Q449 165 453 134M489 201Q523 160 533 155" stroke="#729267" stroke-width="14"/><path d="M459 245H517L509 285H467Z" fill="#bc9c75"/>{/if}
  <circle cx="300" cy="79" r="24" fill="#d6ad89"/><path d="M269 113Q300 97 329 113L324 196H277Z" fill={home?'#d7b56e':'#649d9c'}/><path d="M287 196L273 256M315 196L333 256" stroke="#263d49" stroke-width="18" stroke-linecap="round"/>
  <path d={`M273 122L235 ${173-position*65}L212 ${179-position*100}M327 122L366 ${173-position*65}L388 ${179-position*100}`} stroke="#d6ad89" stroke-width="13" fill="none" stroke-linecap="round"/>
  {#each [212,388] as x}<g transform={`translate(${x} ${179-position*100})`}><path d="M-25 0H25" stroke="#c9ccbd" stroke-width="7"/><path d="M-21-15V15M21-15V15" stroke="#2b3d46" stroke-width="13"/></g>{/each}
 </svg><span>{holding?'呼气 · 发力':rest>0?'吸气 · 还原':'准备'}</span></div>
 <div class="meter"><div class="zone"></div><span class="meter-cursor" style={`transform:translate3d(${position*100}%,0,0)`}><i></i></span></div><p class="feedback">{message||'匀速举起，避免抢拍'}</p>
 {#if !started}<button type="button" onclick={start}>开始训练</button>{:else if done}<button type="button" onclick={()=>onFinish(score/reps)}>完成 · 动作质量 {Math.round(score/reps*100)}%</button>{:else}<button type="button" disabled={rest>0} onpointerdown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);down();}} onpointerup={release} onpointercancel={release} onkeydown={(e)=>{if(e.key==='Enter'&&!e.repeat)down();}} onkeyup={(e)=>{if(e.key==='Enter')release();}} onblur={release}>{rest>0?'休息，等待还原…':'按住发力 → 金色区松手'}</button>{/if}
</div>
<style>.training{color:#f6eacf;display:flex;flex-direction:column;gap:14px}header{display:flex;justify-content:space-between;align-items:center}h3{margin:0;font-size:23px}p{font-size:13px;color:#d5e1dd;line-height:1.7;margin:0}.room{position:relative;overflow:hidden;border-radius:15px;border:2px solid #86938b;contain:layout paint}.room svg{width:100%;display:block}.room span{position:absolute;bottom:12px;left:18px;background:#233d42dd;border-radius:20px;padding:7px 14px;font-size:12px}.meter{height:22px;background:#22383e;border-radius:12px;position:relative;overflow:hidden}.zone{position:absolute;left:63%;width:18%;height:100%;background:#d9b669}.meter-cursor{position:absolute;inset:0 auto 0 0;width:calc(100% - 5px);will-change:transform;pointer-events:none}.meter-cursor i{position:absolute;left:0;width:5px;height:100%;background:white;box-shadow:0 0 7px white}.feedback{min-height:24px}button{padding:14px;border-radius:10px;background:linear-gradient(#d9b977,#b38d50);border:1px solid #f3d293;color:#1b2c30;font-weight:800;touch-action:none}button:disabled{background:#546c6b;color:#d5e1dd}</style>
