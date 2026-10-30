<script lang="ts">
 import {onMount} from 'svelte';
 import {applyWrongLimit, type SortCfg} from '../../../game/core/minigame';
 let {cfg,onFinish,paused=false}:{cfg:SortCfg;onFinish:(n:number)=>void;paused?:boolean}=$props();
 const order=$derived(cfg.order);
 const rounds=$derived(Math.min(3,cfg.rounds??2));
 const timeLimit=$derived(cfg.timeLimit??30);
 let started=$state(false),done=$state(false),point=$state(0),round=$state(0),correct=$state(0),wrong=$state(0),selected=$state(-1),left=$state(timeLimit),feedback=$state(''),checked=$state(false);
 const incidents=[{text:'门锁完整，访客已离开。',alert:false},{text:'门锁有撬痕，通道里散落工具。',alert:true},{text:'车灯熄灭，车辆停在划线车位内。',alert:false},{text:'发现漏水并接近带电设备。',alert:true},{text:'消防通道被纸箱堵住。',alert:true},{text:'监控画面正常，值守记录齐全。',alert:false}];
 const incident=$derived(incidents[(round*order.length+point)%incidents.length]);
 function inspect(i:number){if(!started||done||checked)return;if(i!==point){feedback=`先到「${order[point]}」，不要漏巡`;wrong++;return;}selected=i;feedback='';}
 function report(alert:boolean){if(selected<0||done||checked)return;checked=true;if(alert===incident.alert){correct++;feedback=alert?'异常已上报，等待处置':'正常记录已登记';}else {wrong++;feedback=incident.alert?'这里存在异常，应上报后继续巡逻':'现场正常，无需误报';}}
 function next(){selected=-1;checked=false;point++;if(point>=order.length){point=0;round++;}if(round>=rounds)done=true;}
 onMount(()=>{const t=setInterval(()=>{if(started&&!done&&!checked&&!paused){left=Math.max(0,left-.1);if(left===0)done=true;}},100);return()=>clearInterval(t);});
</script>
<div class="patrol"><header><h3>夜间巡逻</h3><strong>{Math.ceil(left)}s</strong></header><p>按照路线到点查看现场，判断是否需要上报。第 {round+1} 轮</p>
 <div class="campus"><svg viewBox="0 0 600 320" aria-hidden="true"><rect width="600" height="320" fill="#172b37"/><path d="M85 75H490V240H85Z" stroke="#465966" stroke-width="32" fill="none"/><path d="M85 75H490V240H85Z" stroke="#d4b576" stroke-width="2" stroke-dasharray="8 10" fill="none"/>
 <rect x="155" y="120" width="250" height="70" fill="#3e535b"/><path d="M145 120L280 80L416 120" fill="#617174"/>{#each [175,220,265,310,355] as x}<rect {x} y="140" width="25" height="30" fill="#e9c57c" opacity=".7"/>{/each}<path d="M27 292H570" stroke="#536a72" stroke-width="6"/></svg>
 {#each order as label,i (label + ':' + i)}<button type="button" class:current={i===point} class:visited={i<point} style={`left:${i%2?82:14}%;top:${i<2?23:75}%`} onclick={()=>inspect(i)} disabled={done||!started}>{i<point?'✓':i+1} {label}</button>{/each}</div>
 <div class="control-area">
  {#if !started}<button type="button" onclick={()=>started=true}>领取巡查单</button>
  {:else if done}<button type="button" onclick={()=>onFinish(applyWrongLimit(correct/Math.max(1,order.length*rounds),wrong,cfg.wrongLimit))}>完成巡查 · 正确 {correct} 次</button>
  {:else if selected>=0}<section><small>手电检查 · {order[selected]}</small><p>{incident.text}</p><div class="actions"><button type="button" disabled={checked} onclick={()=>report(false)}>登记正常</button><button type="button" disabled={checked} onclick={()=>report(true)}>上报异常</button>{#if checked}<button type="button" onclick={next}>下一处 →</button>{/if}</div></section>{/if}
 </div>
 <p>{feedback||`下一站：${order[point]} · 失误 ${wrong}`}</p></div>
<style>
 .patrol{color:#eceddc;display:flex;flex-direction:column;gap:14px}
 header{display:flex;justify-content:space-between;gap:10px}
 h3{margin:0;font-size:24px}
 strong,small{color:#efce8d}
 p{font-size:13px;line-height:1.7;margin:0}
 .campus{position:relative;overflow:hidden;border-radius:14px;border:1px solid #62757b}
 .campus svg{display:block;width:100%}
 .campus button{position:absolute;transform:translate(-50%,-50%);padding:9px;font-size:12px;min-width:95px}
 .current{outline:2px solid #efce8d}
 .visited{background:#3b725e}
 button{border:1px solid #768888;border-radius:9px;padding:12px;color:#fff3d0;background:#354e59;font-weight:700}
 .control-area{min-height:216px}
 .control-area section{box-sizing:border-box;min-height:216px;padding:16px;background:#1c323dcc;border-radius:12px}
 .control-area section p{padding:16px 0}
 .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 .actions button{min-width:0;min-height:44px}
 .actions button:nth-child(3){grid-column:1/-1}
 button:disabled{opacity:.55}
 @media(max-width:520px){
  .control-area{min-height:284px}
  .control-area section{min-height:284px}
  .actions{grid-template-columns:minmax(0,1fr)}
  .actions button:nth-child(3){grid-column:auto}
 }
</style>
