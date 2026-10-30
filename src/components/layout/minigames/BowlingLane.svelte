<script lang="ts">
 import {onMount} from 'svelte';
 import type {BowlingCfg} from '../../../game/core/minigame';
 import {rack,launch,stepWorld,type BowlingWorld} from '../../../game/core/bowlingPhysics';
 import SpriteIcon from '../SpriteIcon.svelte';
 import {playSound} from '../../../lib/audio';
 let {cfg,onFinish,paused=false}:{cfg:BowlingCfg;onFinish:(ratio:number)=>void;paused?:boolean}=$props();
 const attempts=$derived(cfg.attempts??2),pinCount=$derived(cfg.pinCount??10);
 let pins=$state<ReturnType<typeof rack>>([]);
 $effect(() => { pins = rack(pinCount); });
 let aim=$state(50),power=$state(.68),spin=$state(0),rolls=$state(0),rolling=$state(false),done=$state(false),knocked=$state(0);
 let ball=$state({x:50,y:91,angle:0}),message=$state('瞄准头瓶两侧，力度越大，球瓶传递的冲击越强。');
 let difficulty=$state('标准');
 let board:HTMLDivElement;let start:{x:number;y:number}|null=null,frame=0,last=0,world:BowlingWorld|null=null;
 function aimAt(e:PointerEvent){const r=board.getBoundingClientRect();aim=Math.max(8,Math.min(92,(e.clientX-r.left)/r.width*100));}
 function down(e:PointerEvent){if(rolling||done)return;start={x:e.clientX,y:e.clientY};aimAt(e);board.setPointerCapture(e.pointerId);}
 function move(e:PointerEvent){if(!start||rolling)return;aimAt(e);power=Math.max(.2,Math.min(1,(start.y-e.clientY)/board.getBoundingClientRect().height*2+.35));}
 function up(e:PointerEvent){if(!start)return;start=null;board.releasePointerCapture(e.pointerId);throwBall();}
 function throwBall(){if(rolling||done)return;rolling=true;rolls++;message='球沿球道滚动中…';world=launch(pins.filter(p=>!p.fallen),aim,power,spin);if(difficulty==='练习')world.ball.radius=4.6;if(difficulty==='挑战')world.ball.radius=2.8;last=performance.now();playSound('game');frame=requestAnimationFrame(tick);}
 function tick(t:number){if(!world||paused)return;stepWorld(world,Math.min(.04,(t-last)/1000));last=t;ball={...world.ball};pins=world.pins.map(p=>({...p}));if(world.elapsed>2.4){const hit=world.pins.filter(p=>p.fallen).length;knocked+=hit;rolling=false;message=world.gutter?`落入沟槽，本球击倒 ${hit} 瓶`:`本球击倒 ${hit} 瓶 · 累计 ${knocked}/${pinCount}`;playSound(hit?'success':'error');if(rolls>=attempts||knocked>=pinCount)done=true;else {pins=pins.filter(p=>!p.fallen);ball={x:50,y:91,angle:0};}return;}frame=requestAnimationFrame(tick);}
 // 暂停期间 RAF 停走（最小化/后台暂停时个别 WebView 仍会驱动 RAF），恢复后从当前球位续跑。
 $effect(()=>{if(!paused&&rolling&&world)frame=requestAnimationFrame(tick);});
 onMount(()=>()=>cancelAnimationFrame(frame));
</script>
<div class="bowling">
 <header><div><small>LANE 01</small><h3>保龄球馆</h3></div><strong>{knocked}<small> / {pinCount}</small></strong></header>
 <div class="settings"><label>难度 <select bind:value={difficulty} disabled={rolls>0}><option>练习</option><option>标准</option><option>挑战</option></select></label><span>第 {Math.min(rolls+1,attempts)} / {attempts} 球</span></div>
 <div class="lane-wrap" bind:this={board} role="application" aria-label="保龄球球道，拖动调整方向并向上滑动投球" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={()=>start=null}>
  <div class="gutter left"></div><div class="gutter right"></div><div class="wood"></div>
  <svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M50 91L${aim} 43`} stroke="#ffe1a3" stroke-width=".5" stroke-dasharray="2 2" fill="none"/></svg>
  {#each pins as p,i (i)}<div class="pin" class:fallen={p.fallen} style={`left:${p.x}%;top:${p.y}%;transform:translate(-50%,-75%) rotate(${p.fallen?p.angle+65:0}deg)`}><SpriteIcon game="bowling" item="bowling-pin" fallback=""/></div>{/each}
  <div class="ball" style={`left:${ball.x}%;top:${ball.y}%;transform:translate(-50%,-50%) rotate(${ball.angle}deg)`}><SpriteIcon game="bowling" item="bowling-ball" fallback=""/></div>
  <div class="foul">投球线</div>
 </div>
 <div class="controls"><label>方向 {Math.round(aim)}<input type="range" min="8" max="92" bind:value={aim} disabled={rolling||done}/></label><label>力量 {Math.round(power*100)}%<input type="range" min=".2" max="1" step=".01" bind:value={power} disabled={rolling||done}/></label><label>侧旋 {spin}<input type="range" min="-2" max="2" step=".2" bind:value={spin} disabled={rolling||done}/></label></div>
 <p>{message}</p>
 {#if done}<button type="button" onclick={()=>onFinish(Math.min(1,knocked/pinCount))}>完成 · {knocked}/{pinCount}</button>{:else}<button type="button" onclick={throwBall} disabled={rolling}>{rolling?'球瓶碰撞中…':'投球'}</button>{/if}
</div>
<style>
 .bowling{color:#f7ebd4;max-width:640px;margin:auto;display:flex;flex-direction:column;gap:12px}header{display:flex;justify-content:space-between;align-items:center}header small{color:#c7b18d;font-size:11px;letter-spacing:2px}h3{margin:3px 0;font-size:22px}strong{font-size:32px;color:#ffcf7b}.settings{display:flex;justify-content:space-between;font-size:12px}select{background:#22303a;color:#fff0d4;border:1px solid #7a7063;padding:5px}.lane-wrap{height:clamp(310px,50vh,500px);position:relative;overflow:hidden;border-radius:18px;touch-action:none;background:#171e24;border:6px solid #554639}.wood{position:absolute;inset:0 6%;background:repeating-linear-gradient(90deg,#ae8156 0%,#e2b982 7%,#b58a5d 7.3%,#cca370 14%);box-shadow:inset 0 80px 70px #24161277}.gutter{position:absolute;top:0;bottom:0;width:6%;background:linear-gradient(90deg,#12171b,#59616a,#182026)}.left{left:0}.right{right:0}.guide{position:absolute;inset:0;width:100%;height:100%;z-index:2}.pin{position:absolute;width:6%;height:11%;z-index:3;filter:drop-shadow(3px 6px 3px #0006)}.pin.fallen{opacity:.68}.pin :global(img),.pin :global(span),.ball :global(img),.ball :global(span){width:100%;height:100%;object-fit:contain;display:block}.ball{position:absolute;width:8%;aspect-ratio:1;z-index:4;filter:drop-shadow(0 5px 4px #0007)}.foul{position:absolute;bottom:5%;left:6%;right:6%;border-top:3px solid #763d2f99;font-size:10px;color:#603822;text-align:center}.controls{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:12px}input{width:100%;accent-color:#e9b469}p{font-size:13px;min-height:20px;margin:0;color:#ead8b8}button{padding:12px;border-radius:10px;border:1px solid #ddaa69;background:linear-gradient(#dcaa68,#a87338);color:#201c17;font-weight:800}button:disabled{opacity:.6}
</style>
