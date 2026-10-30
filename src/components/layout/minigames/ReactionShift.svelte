<script lang="ts">
 import {onMount} from 'svelte';
 import {applyWrongLimit, type WhackCfg} from '../../../game/core/minigame';
 import {miniGameRandom} from '../../../lib/minigameRandom';
 import {playSound} from '../../../lib/audio';
 let {cfg,onFinish,paused=false}:{cfg:WhackCfg;onFinish:(n:number)=>void;paused?:boolean}=$props();
 const kind=$derived(cfg.title.includes('果')?'orchard':cfg.title.includes('货')?'loading':'clean');
 const timeLimit=$derived(cfg.timeLimit??30);
 // 坏目标必须走种子随机流：按生成序号确定性出现（每第 4 个）可被玩家专点前 3 个、
 // 跳过第 4 个零失误刷满分/S 级，评分与工资晋升绑定即构成作弊。
 const random=miniGameRandom();
 interface Item{id:number;x:number;y:number;age:number;bad:boolean;clean:number;hit:boolean}
 let items=$state<Item[]>([]),started=$state(false),done=$state(false),left=$state(timeLimit),hits=$state(0),wrong=$state(0),spawned=$state(0),goodTotal=$state(0),message=$state(''),sweeping=$state(false);
 let seq=0,clock=0;
 function spawn(){if(spawned>=cfg.targets)return;const bad=random()<0.25;const i=seq++;items.push({id:i,x:kind==='loading'?2:12+(i*23)%76,y:kind==='orchard'?27+(i*13)%48:kind==='loading'?52:34+(i*17)%47,age:0,bad,clean:0,hit:false});spawned++;if(!bad)goodTotal++;}
 function hit(id:number){if(!started||done)return;const o=items.find(i=>i.id===id);if(!o||o.hit)return;
  if(o.bad||(kind==='orchard'&&o.age<1)){wrong++;o.hit=true;message=kind==='orchard'?'青果还没成熟，留在树上':'这是需要保留的物品';playSound('error');return;}
  if(kind==='clean'&&++o.clean<2){message='再清扫一次，污渍就干净了';return;}
  o.hit=true;hits++;message=kind==='loading'?'货箱已稳妥装车':kind==='orchard'?'熟果已收入果篮':'地面清理干净';playSound('game');
 }
 onMount(()=>{const timer=setInterval(()=>{if(!started||done||paused)return;clock+=.05;left=Math.max(0,left-.05);const interval=Math.max(.35,timeLimit/Math.max(1,cfg.targets));if(spawned===0||clock>=interval){clock=0;spawn();}items=items.map(o=>({...o,age:o.age+.05,x:kind==='loading'?o.x+1:o.x})).filter(o=>o.age<5&&o.x<96&&!o.hit);if(left===0||(spawned>=cfg.targets&&!items.length))done=true;},50);return()=>clearInterval(timer);});
</script>
<div class="shift">
 <header><h3>{cfg.title}</h3><strong>{Math.ceil(left)}s</strong></header>
 <p>{kind==='orchard'?'等果实由青转红再摘；发黑的虫果不要采。':kind==='loading'?'检查传送带货箱：完整箱点击装车，裂开的箱子留待返修。':'按住鼠标扫过污渍，或点击两次清理；保留摊位的商品。'}</p>
  <div class="yard" class:orchard={kind==='orchard'} class:loading={kind==='loading'} onpointerdown={()=>sweeping=true} onpointerup={()=>sweeping=false} onpointerleave={()=>sweeping=false} role="group" aria-label={cfg.title}>
   <div class="yard-art" aria-hidden="true"></div>
  {#each items as item(item.id)}<button type="button" class="object" style={`left:${item.x}%;top:${item.y}%;opacity:${item.clean ? .55 : 1}`} disabled={!started||done} onclick={()=>hit(item.id)} onpointerenter={()=>{if(sweeping&&kind==='clean')hit(item.id);}} aria-label={kind==='orchard'?(item.bad?'虫果':item.age<1?'青果':'熟果'):item.bad?cfg.badLabel:cfg.goodLabel}>
   <svg viewBox="0 0 80 80" aria-hidden="true">
    {#if kind==='orchard'||(kind==='clean'&&item.bad)}<path d="M40 19Q44 5 53 9" stroke="#553e28" stroke-width="5" fill="none"/><path d="M40 21Q11 9 11 40Q16 76 39 69Q65 77 72 43Q76 9 40 21" fill={item.bad&&kind==='orchard'?'#84734b':kind==='clean'||item.age>=1?'#c35334':'#7ea345'} stroke="#69462d" stroke-width="2"/><path d="M26 28Q17 33 20 45" stroke="#f8d77d" stroke-width="5" opacity=".7" fill="none"/>{#if item.bad&&kind==='orchard'}<circle cx="53" cy="43" r="9" fill="#3b3025"/>{/if}
    {:else if kind==='loading'}<path d="M9 20L50 8L72 26V64L29 76L9 59Z" fill="#b38a55" stroke="#634b33" stroke-width="2"/><path d="M9 20L29 37L72 26M29 37V76" fill="none" stroke="#684e30" stroke-width="2"/><path d="M27 14L49 31V49" stroke="#e9c88a" stroke-width="9"/>{#if item.bad}<path d="M23 29l14 11-8 10 13 4-6 13" fill="none" stroke="#45291c" stroke-width="5"/>{/if}
    {:else}<path d="M11 29L29 17L40 30L66 21L71 55L48 70L30 60L9 67Z" fill="#67513c" opacity=".8"/><path d="M24 37L37 29L52 43L40 61Z" fill="#c8bda0"/><path d="M48 20l15 8-8 10" stroke="#897248" stroke-width="7"/>{/if}
   </svg>
  </button>{/each}
  {#if !started}<button type="button" class="start" onclick={()=>started=true}>开始工作</button>{/if}
 </div>
 <div class="totals"><span>已完成 {hits}</span><span>误操作 {wrong}</span><span>目标 {spawned}/{cfg.targets}</span></div>
 <p>{message||'观察物品状态，再操作。'}</p>
 {#if done}<button type="button" onclick={()=>onFinish(applyWrongLimit(Math.max(0,(hits-wrong)/Math.max(1,goodTotal)),wrong,cfg.wrongLimit))}>完成 · 查看成绩</button>{/if}
</div>
<style>
 .shift{color:#f7ead4;display:flex;flex-direction:column;gap:12px;max-width:850px;margin:auto}header,.totals{display:flex;justify-content:space-between;gap:12px}h3{font-size:23px;margin:0}strong{color:#f8ce82}p{font-size:13px;line-height:1.7;color:#dbe4df;margin:0}.yard{position:relative;min-height:320px;aspect-ratio:600/360;border:4px solid #8e795b;border-radius:16px;overflow:hidden;touch-action:none;box-shadow:0 12px 28px #02060a66;background:#23353c}.yard-art{position:absolute;inset:0;background-color:#334b4d;background-image:linear-gradient(180deg,#08131a44,#07101699),var(--mgh-scene,linear-gradient(145deg,#46646a,#263c3f));background-position:center;background-size:cover;background-repeat:no-repeat;transition:filter .3s ease,background-position .6s ease}.yard-art::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 28%,#050c1299 100%)}.object{position:absolute;width:10%;min-width:38px;aspect-ratio:1;padding:0!important;transform:translate(-50%,-50%);background:transparent!important;border:0!important;filter:drop-shadow(2px 6px 3px #0004);z-index:1}.object svg{width:100%;height:100%;display:block}.object:hover{filter:brightness(1.15) drop-shadow(0 0 6px #fff6)}.start{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2}button{background:#b89859;color:#171f23;border:1px solid #f2d89a;border-radius:9px;padding:12px;font-weight:800}.totals{font-size:13px;padding:10px;background:#283d3b;border-radius:8px}.loading{border-color:#7f9296}.loading .yard-art{background-position:55% center}.orchard{border-color:#83905f}.orchard .yard-art{background-position:center 62%}
</style>
