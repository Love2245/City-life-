<script lang="ts">
  import { miniGameRandom } from "../../../lib/minigameRandom";
  const random = miniGameRandom();
 import {onMount} from 'svelte';
 import {applyWrongLimit, type QuizCfg} from '../../../game/core/minigame';
 import {playSound} from '../../../lib/audio';
 let {cfg,onFinish,paused=false}:{cfg:QuizCfg;onFinish:(n:number)=>void;paused?:boolean}=$props();
 const mode=$derived(cfg.theme??(cfg.title.includes('归档')?'archive':cfg.title.includes('销售')?'sales':cfg.title.includes('学校')?'school':'classroom'));
 function shuffle<T>(a:T[]):T[]{const out=[...a];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
 // 洗牌只做一次：cfg 由技能等级加工而成，$derived.by 会在任何触发 gameCfg 重算的状态变化时
 // 重新洗牌——同 seed 复现不出同一套题、答题中途题目顺序可能突变，还额外消耗随机流。
 const questions=$state(shuffle(cfg.questions).map(q=>({...q,choices:shuffle(q.options.map((label,index)=>({label,correct:index===q.answer})))})));
 const timeLimit=$derived(cfg.timeLimit??30);
 let started=$state(false),done=$state(false),idx=$state(0),correct=$state(0),wrong=$state(0),selected=$state(-1),left=$state(timeLimit);
 const current=$derived(questions[idx]);
 function answer(i:number){if(!started||done||selected>=0||!current)return;selected=i;if(current.choices[i].correct){correct++;playSound('success');}else{wrong++;playSound('error');}}
 function next(){if(selected<0)return;idx++;selected=-1;if(idx>=questions.length)done=true;}
 function finalScore(){return applyWrongLimit(correct/Math.max(1,questions.length),wrong,cfg.wrongLimit);}
 function onkey(e:KeyboardEvent){if(e.repeat)return;const i=Number(e.key)-1;if(Number.isInteger(i)&&i>=0&&i<(current?.choices.length??0))answer(i);}
 onMount(()=>{const timer=setInterval(()=>{if(started&&!done&&selected<0&&!paused){left=Math.max(0,left-.1);if(!left)done=true;}},100);return()=>clearInterval(timer);});
</script>
<svelte:window onkeydown={onkey}/>
<div class="quiz" class:archive={mode==='archive'} class:sales={mode==='sales'} class:school={mode==='school'} class:classroom={mode==='classroom'}>
 <header><div><small>{mode==='market'?'集市摊位':mode==='station'?'车站票务':mode==='archive'?'行政办公室':mode==='sales'?'门店接待':mode==='school'?'课后小课堂':'编程教室'}</small><h3>{cfg.title}</h3></div><strong>{Math.ceil(left)}s</strong></header>
 <p>{mode==='market'?'看清单价、重量与付款，算好找零。':mode==='station'?'对照班次与车票，核对时刻、去向和票款。':mode==='archive'?'阅读文件摘要，选择对应档案夹归档。':mode==='sales'?'听清顾客的顾虑，再选合适的回应。':'读清题目作答，答后核对知识点再继续。'}</p>
 {#if !started}<div class="intro"><div class="desk-art"><i></i><i></i><i></i></div><button type="button" onclick={()=>started=true}>开始{mode==='archive'?'归档':mode==='sales'?'接待':'答题'}</button></div>
 {:else if done}<section><h3>本次完成</h3><p>答对 {correct} / {questions.length} · 失误 {wrong}</p><button type="button" onclick={()=>onFinish(finalScore())}>完成</button></section>
 {:else if current}
  <section class="question"><div class="paper-label">{mode==='market'?'顾客结算单':mode==='station'?'待核对票务':mode==='archive'?'待归档文件':mode==='sales'?'顾客说':'黑板上的问题'} <span>{idx+1} / {questions.length}</span></div><p class="prompt">{current.q}</p>
  {#if mode==='archive'}<div class="paper-lines"><i></i><i></i><i></i></div>{/if}
  </section>
  <div class="options" class:answered={selected>=0}>
   {#if selected<0}
    {#each current.choices as opt,i (current.q + ':' + opt.label + ':' + i)}<button type="button" class:folder={mode==='archive'} onclick={()=>answer(i)}><span class="number">{i+1}</span>{opt.label}</button>{/each}
   {:else}
    <div class="answer-note"><div><b>{current.choices[selected].correct?'判断正确':'再看一遍'}</b><p>{mode==='archive'?'归档位置':mode==='sales'?'适合的回应':'正确答案'}：{current.choices.find(c=>c.correct)?.label}</p></div><button type="button" onclick={next}>继续 →</button></div>
   {/if}
  </div>
 {/if}
 <footer>已完成 {Math.min(idx,questions.length)} 项 · 答对 {correct} 项 · 失误 {wrong} 项 · 数字键也可选择</footer>
</div>
<style>
  .quiz {
    --paper: #e9dfc7;
    --ink: #423f33;
    display: flex;
    flex-direction: column;
    gap: 15px;
    color: #f8ead4;
    max-width: 800px;
    min-height: 447px;
    margin: auto;
    box-sizing: border-box;
  }
  header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 4px 0; font-size: 24px; }
  small { font-size: 11px; letter-spacing: 2px; color: #d6c59f; }
  strong { font-size: 25px; color: #f8ca80; }
  p { margin: 0; line-height: 1.75; font-size: 14px; }
  .intro { padding: 40px; background: #68757533; border: 1px solid #b7ac8455; border-radius: 14px; text-align: center; }
  .desk-art { height: 140px; position: relative; max-width: 260px; margin: auto; }
  .desk-art i { position: absolute; left: 30px; top: 14px; width: 130px; height: 100px; background: #e8ddc5; transform: rotate(-8deg); border: 1px solid #927959; box-shadow: 3px 7px 12px #0004; }
  .desk-art i:nth-child(2) { left: 70px; top: 8px; transform: rotate(4deg); }
  .desk-art i:nth-child(3) { left: 115px; top: 18px; transform: rotate(13deg); background: repeating-linear-gradient(#fff0d4 0 17px, #c7b795 18px 19px); }
  section { padding: 24px; background: var(--paper); color: var(--ink); border-radius: 10px; box-shadow: 0 9px 18px #0003; }
  .paper-label { display: flex; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #9f927355; font-size: 12px; font-weight: 700; }
  .prompt { min-height: 55px; padding-top: 22px; font-size: 19px; }
  .paper-lines i { display: block; height: 1px; margin-top: 15px; background: #b4a788; }
  .paper-lines i:last-child { width: 70%; }
  .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-height: 108px; }
  .options.answered { display: block; }
  button { min-height: 48px; padding: 15px; border: 1px solid #bcc6c466; border-radius: 10px; background: linear-gradient(#40535e, #293d48); color: #f9eedc; font-weight: 700; text-align: left; cursor: pointer; line-height: 1.6; }
  .options button { display: flex; align-items: center; gap: 10px; }
  .number { padding: 0 6px; border: 1px solid #f4d79a66; border-radius: 6px; color: #f5dba6; font-size: 12px; }
  .folder { position: relative; margin-top: 10px; background: linear-gradient(#b29459, #967443); color: #fff8e7; }
  .folder::before { content: ''; position: absolute; left: 0; top: -10px; width: 40%; height: 10px; border-radius: 8px 8px 0 0; background: #b29459; }
  .answer-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 108px; box-sizing: border-box; padding: 12px 16px; border-left: 3px solid #e8cb87; border-radius: 6px; background: #ffffff0b; }
  .answer-note b { color: #f6d79a; }
  .answer-note p { margin-top: 6px; }
  .answer-note button { flex: 0 0 auto; min-width: 100px; text-align: center; }
  .sales section { --paper: #e3cfae; border-radius: 22px 22px 22px 0; }
  .school section, .classroom section { --paper: #284c43; --ink: #f3e9c9; border: 9px solid #997750; border-radius: 3px; }
  .school .prompt { font-family: 'KaiTi', serif; font-size: 23px; }
  .classroom .prompt { font-family: monospace; font-size: 19px; }
  footer { color: #c6d6d5; font-size: 12px; }
  @media (max-width: 760px) { .quiz { min-height: 540px; } }
  @media (max-width: 480px) {
    .options { grid-template-columns: 1fr; min-height: 228px; }
    .options.answered, .answer-note { min-height: 228px; }
    .answer-note { flex-direction: column; justify-content: center; text-align: center; }
    .prompt { font-size: 16px; }
    section { padding: 16px; }
  }
</style>
