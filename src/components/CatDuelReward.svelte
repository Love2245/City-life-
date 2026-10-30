<script lang="ts">
  import type {GameState} from '../game/types';
  import {getDuelCard} from '../game/core/catDuelCards';
  import {chooseDuelOffer} from '../game/core/catDuelCollection';
  import {isMobileLayout} from '../stores/uiStore.svelte';
  import DuelCard from './DuelCard.svelte';
  let {session,onDone=()=>{}}=$props<{session:GameState;onDone?:()=>void}>();
  const offer=$derived(session.catDuel?.offer);
  let message=$state(''),selected=$state('');
  function choose(id:string|null):void{if(!offer)return;const r=chooseDuelOffer(session,offer.id,id);message=r.ok?(id?'已收入共享收藏，出战牌组保持原样。':'已跳过选牌。'):r.reason??'';if(r.ok)onDone();}
  function pick(id:string):void{if(isMobileLayout()){selected=id;return;}choose(id);}
</script>
{#if offer}
  <section class="reward" aria-label="三选一卡牌奖励"><small>CHOOSE ONE</small><h2>选择一张新卡牌</h2><p>收入共享收藏，再决定如何加入你的牌组。</p>
    <div class="choices">{#each offer.choices as id,index}{@const card=getDuelCard(id)!}<button class:selected={selected===id} style={`--reward-angle:${(index-1)*3}deg`} onclick={()=>pick(id)} aria-label={`选择${card.name}`} title={card.desc}><DuelCard {card}/><span class="pick-label">选择这张牌</span></button>{/each}</div>
    {#if selected&&isMobileLayout()}<div class="mobile-choice"><div><DuelCard card={getDuelCard(selected)!}/></div><button onclick={()=>choose(selected)}>将「{getDuelCard(selected)!.name}」收入收藏</button></div>{/if}
    <button class="skip" onclick={()=>choose(null)}>跳过本次选牌</button>
  </section>
{:else if message}<p role="status">{message}</p>{/if}
<style>
.reward{color:#e9e1cc;text-align:center;padding:16px 10px 25px}small{font:10px Georgia,serif;letter-spacing:4px;color:#b6d7e4}h2{font:500 29px Georgia,'SimSun',serif;letter-spacing:3px;margin:12px 0}.reward>p{color:#aebcaf;font-size:12px}.choices{display:flex;align-items:center;justify-content:center;gap:36px;max-width:900px;margin:32px auto 25px;padding:8px 8px 25px}.choices>button{position:relative;width:230px;max-width:28%;padding:0!important;min-height:0!important;border:0!important;outline-offset:7px;background:none!important;cursor:pointer;flex:none;transform:rotate(var(--reward-angle));transition:transform .18s,filter .18s;overflow:visible}.choices>button:hover,.choices>button.selected{transform:translateY(-13px) rotate(0);filter:drop-shadow(0 0 9px #a5d6e477);z-index:2}.pick-label{display:block;margin-top:18px;font-size:12px;color:#c7e1e9;letter-spacing:3px}.skip{background:#11253088;color:#b9c6b5;border:1px solid #c2b38355;border-radius:6px;padding:11px 24px;cursor:pointer;font-size:12px}.mobile-choice{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;margin:15px 0 25px}.mobile-choice>div{width:210px}.mobile-choice>button{border:1px solid #c3e3e8;border-radius:6px;background:#a9d7df;color:#162a2d;padding:13px 20px;font-weight:700}.mobile-choice~.skip{margin-top:5px}
@media(max-width:600px){h2{font-size:22px}.choices{gap:13px;padding:10px 0 16px;margin:25px auto 16px}.choices>button{max-width:29%;width:180px}.pick-label{font-size:9px;letter-spacing:1px;margin-top:12px}.reward{padding:12px 0}.mobile-choice>div{width:195px}}
@media(max-height:550px) and (min-width:601px){.choices{margin:15px auto;gap:30px}.choices>button{width:175px}.reward{padding-top:6px}h2{font-size:23px;margin:8px 0}}
</style>
