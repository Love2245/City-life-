<script lang="ts">
 import {applyWrongLimit, type SequenceCfg} from '../../../game/core/minigame';
 import {playSound} from '../../../lib/audio';
 let {cfg,onFinish,paused=false}:{cfg:SequenceCfg;onFinish:(ratio:number)=>void;paused?:boolean}=$props();
 const kind=$derived(cfg.title.includes('挤奶')?'milk':cfg.title.includes('寺')?'temple':'farm');
 const rounds=$derived(cfg.rounds??3);
 const timeLimit=$derived(cfg.timeLimit??30);
 let started=$state(false),done=$state(false),round=$state(0),step=$state(0),correct=$state(0),errors=$state(0),tool=$state(''),hold=$state(0),pressing=$state(false),squeezes=$state(0),lastHand=$state(''),left=$state(timeLimit),message=$state('');
 const target=$derived(cfg.steps[step]);
 const progress=$derived((round*cfg.steps.length+step)/(rounds*cfg.steps.length));
 function finalScore(){return applyWrongLimit(Math.max(0,(correct-errors*.5)/(rounds*cfg.steps.length)),errors,cfg.wrongLimit);}
 function complete(){correct++;step++;hold=0;pressing=false;tool='';squeezes=0;lastHand='';playSound('success');message='完成，继续下一道工序';if(step>=cfg.steps.length){round++;step=0;}if(round>=rounds)done=true;}
 function act(){if(!started||done)return;if(tool!==target){errors++;message=`先选择「${target}」工具`;playSound('error');return;}complete();}
 function squeeze(hand:string){if(!started||done)return;if(hand===lastHand){message='左右交替，给奶牛一点缓冲';return;}lastHand=hand;squeezes++;playSound('game');if(squeezes>=6)complete();}
 function beginHold(){if(started&&!done)pressing=true;}
 $effect(()=>{if(!started||done||paused)return;const t=setInterval(()=>{if(done)return;left=Math.max(0,left-.05);if(left<=0){done=true;pressing=false;}if(pressing){hold+=.05;if(hold>=.8)complete();}},50);return()=>clearInterval(t);});
 $effect(()=>{if(paused)pressing=false;});
</script>
<div class="shift" class:farm={kind==='farm'} class:temple={kind==='temple'} class:milk={kind==='milk'}>
 <header><div><small>{kind==='farm'?'田间手记':kind==='milk'?'牧场早班':'山寺晨课'}</small><h3>{cfg.title}</h3></div><strong>{Math.ceil(left)}<small> 秒</small></strong></header>
 <p>{kind==='farm'?'选好工具，再点击当前田垄；依次翻地、下种、覆土、浇水。':kind==='milk'?'先安抚与清洗，再左右交替挤奶，最后过滤装桶。':'按工序整理庭院；按住操作键完成手头的劳动。'}</p>
 <div class="work-scene">
  <div class="work-scene-art" aria-hidden="true"></div>
  <span class="scene-label">{kind==='farm'?'当前田垄':kind==='milk'?'奶牛':'庭院'} {Math.min(round+1,rounds)} / {rounds}</span>
  {#if started&&!done&&kind==='farm'}<button type="button" class="plot-target" onclick={act}>在当前田垄使用{tool||'工具'}</button>{/if}
 </div>
 <div class="progress"><i style={`width:${progress*100}%`}></i></div>
 <div class="work-controls">
 {#if !started}<button type="button" class="primary" onclick={()=>started=true}>开始工作</button>
 {:else if done}<div class="result">完成 {correct} 道工序 · 失误 {errors}<button type="button" class="primary" onclick={()=>onFinish(finalScore())}>完成工作</button></div>
 {:else}
  <div class="steps">{#each cfg.steps as name,i (name + ':' + i)}<span class:active={i===step} class:complete={i<step}>{i<step?'✓':i+1} {name}</span>{/each}</div>
  {#if kind==='farm'}<div class="tools">{#each cfg.steps as name,i (name + ':' + i)}<button type="button" class:selected={tool===name} onclick={()=>tool=name}>{name==='翻地'?'锄头':name==='下种'?'种子袋':name==='覆土'?'土耙':'浇水壶'}<small>{name}</small></button>{/each}</div>
  {:else if kind==='milk'&&step===2}<div class="tools"><button type="button" onclick={()=>squeeze('left')}>左手挤压</button><span>{squeezes} / 6</span><button type="button" onclick={()=>squeeze('right')}>右手挤压</button></div>
  {:else}<button type="button" class="primary hold" onpointerdown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);beginHold();}} onpointerup={()=>pressing=false} onpointercancel={()=>pressing=false} onkeydown={(e)=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)beginHold();}}} onkeyup={()=>pressing=false} onblur={()=>pressing=false}>按住 · {target}<i style={`width:${Math.min(100,hold/.8*100)}%`}></i></button>{/if}
 {/if}
 </div>
 <p>{message||'每项劳动都有完成进度；离开或超时仅按实际完成计分。'}</p>
</div>
<style>
 .shift{color:#f8ecd7;display:flex;flex-direction:column;gap:12px;max-width:780px;margin:auto}header{display:flex;justify-content:space-between;align-items:center}h3{margin:4px 0;font-size:24px}small{font-size:11px;letter-spacing:1px;color:#dfc79b}strong{font-size:26px}p{font-size:13px;line-height:1.6;color:#dce4d5;margin:0}.work-scene{position:relative;overflow:hidden;border-radius:16px;border:1px solid #d9c39455;box-shadow:0 12px 28px #02060a66}.work-scene-art{min-height:290px;background-color:#25363b;background-image:linear-gradient(180deg,#0d182055 0%,#0b111c40 45%,#09111dcc 100%),var(--mgh-scene,linear-gradient(145deg,#46646a,#263c3f));background-position:center;background-size:cover;background-repeat:no-repeat;transition:filter .3s ease,background-position .6s ease}.work-scene-art::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#07101950,transparent 30%,transparent 70%,#07101966)}.milk .work-scene-art{background-position:42% center}.farm .work-scene-art{background-position:center 62%}.temple .work-scene-art{background-position:center}.scene-label{position:absolute;top:12px;left:12px;padding:6px 12px;border-radius:20px;background:#132b2bdb;border:1px solid #d5e2c944;color:#fff0d4;font-size:12px;box-shadow:0 4px 12px #0005}.plot-target{position:absolute;bottom:15px;left:50%;transform:translateX(-50%);background:#efe0b7ef!important;color:#3f442a!important;min-width:190px;z-index:2}.steps,.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.steps span{padding:7px;border-radius:7px;background:#ffffff09;color:#b7c6c1;font-size:12px}.steps .active{color:#ffe3a4;background:#9c763844}.steps .complete{color:#9ad79b}.tools button{flex:1}.tools small{display:block;color:inherit;font-size:11px;margin-top:4px}button{border:1px solid #b9aa8055;border-radius:10px;padding:12px;background:#35483f;color:#fff2cf;cursor:pointer;font-weight:700;min-height:44px}.selected{outline:2px solid #e8c36b}.primary{background:linear-gradient(#b6a16c,#8f784c);color:#171f18}.progress{height:7px;background:#1b2c28;border-radius:4px;overflow:hidden}.progress i{display:block;height:100%;background:#a5c77b;transition:width .3s}.hold{position:relative;overflow:hidden;touch-action:none}.hold i{position:absolute;inset:auto auto 0 0;height:5px;background:#e9f5bd}.result{display:flex;justify-content:space-between;align-items:center}.milk .primary{background:#769da0}.temple .primary{background:#b0a17e}
 .work-controls{min-height:108px;display:flex;flex-direction:column;justify-content:center;gap:8px}
 @media(max-width:520px){.work-controls{min-height:156px}}
</style>
