<script lang="ts">
  import DuelCard from "../DuelCard.svelte";
  import DuelCardArt from "../DuelCardArt.svelte";
  import { gameState } from '../../stores/gameStore.svelte';
  import { uiState,closeModal } from '../../stores/uiStore.svelte';
  import { openDuelPractice } from '../../stores/catDuelStore.svelte';
  import { duelStateOf } from '../../game/core/catDuelCollection';
  import { getDuelCard } from '../../game/core/catDuelCards';
  import { specialTrainCard,canTrainCardAtHospital,hospitalWeeklyUsed,hospitalPrice,HOSPITAL_WEEK_LIMIT } from '../../game/core/cardPack';
  import CatDuelDeck from '../CatDuelDeck.svelte';
  const mode=$derived(uiState.hospitalTrainMode);
  const pet=$derived(gameState.pets.find(p=>p.uid===gameState.activePet));
  const data=$derived(duelStateOf(gameState));
  const normals=$derived(data.collection.filter(c=>!c.upgraded));
  let selected=$state(''),message=$state('');
  const entry=$derived(data.collection.find(c=>c.uid===selected)??normals[0]);
  const before=$derived(entry?getDuelCard(entry.cardId):undefined);
  const after=$derived(entry?getDuelCard(entry.cardId+'_plus'):undefined);
  const used=$derived(hospitalWeeklyUsed(gameState,'special'));
  const access=$derived(canTrainCardAtHospital(gameState,'special'));
  function train():void{if(!pet||!entry)return;selected=entry.uid;const r=specialTrainCard(gameState,pet.uid,entry.uid);message=r.ok?`强化成功，已扣 ${r.cost} 元、耗时1小时。引用这张牌的牌组已自动更新。`:r.reason??'无法强化';}
  function practice():void{closeModal();openDuelPractice(gameState);}
</script>
<div class="hospital-cards hud-scope" role="dialog" aria-modal="true" aria-label={mode==='special'?'医院卡牌强化':'免费卡组指导'}>
  <header><div><small>PET HOSPITAL / 卡牌训练室</small><h1>{mode==='special'?'把这一张，练得更好。':'整理牌组，试一试新打法。'}</h1></div><button aria-label="关闭卡牌训练" onclick={()=>closeModal()}>✕</button></header>
  <main>{#if mode==='focus'}<p class="tip">配牌与试打免费，不销毁收藏卡、不扣款、不消耗时间。</p><button class="practice" onclick={practice}>进入无奖励试打 →</button><CatDuelDeck session={gameState} petUid={pet?.uid??''}/>
  {:else}
    <p class="tip">共享收藏 · 单张永久强化一次 · 本周已用 {used} / {HOSPITAL_WEEK_LIMIT} 次 · {used<3?`本次 ${hospitalPrice(used)} 元，1小时`:'本周额度已用完'}</p>
    {#if !access.ok}<p class="warning" role="status">{access.reason}</p>{/if}{#if message}<p class="tip" role="status">{message}</p>{/if}
    <div class="training-layout"><section class="card-list" aria-label="选择一张普通卡">{#each normals as c,index (c.uid)}{@const def=getDuelCard(c.cardId)!}<button class:active={entry?.uid===c.uid} onclick={()=>selected=c.uid}><span class="card-thumb"><DuelCardArt card={def}/></span><div><strong>{def.name}</strong><small>普通 · 收藏第 {index+1} 张{c.legacy?' · 旧版继承':''}</small></div><b>{def.cost}</b></button>{/each}{#if !normals.length}<p>现有收藏卡均已强化。通过对战收集新的普通牌后再来。</p>{/if}</section>
    <section class="upgrade-preview" aria-label="强化前后完整预览">{#if before&&after}<small>UPGRADE / 只强化选中的这一张</small><h2>{before.name} → {after.name}</h2><div class="upgrade-cards"><article><span>强化前</span><DuelCard card={before}/></article><article class="plus"><span>强化后</span><DuelCard card={after}/></article></div><p class="explanation">原卡的收藏编号保持不变。引用它的牌组会自动使用“＋”效果，同名其他副本不受影响。</p><button class="upgrade" onclick={train} disabled={!access.ok||used>=3||!pet||entry?.upgraded||gameState.player.money<hospitalPrice(used)}>{entry?.upgraded?"本张已强化＋":`支付 ${hospitalPrice(used)} 元，永久强化＋`}</button>{:else}<h2>没有待强化的普通卡</h2>{/if}</section></div>
  {/if}</main>
</div>
<style>
  .hospital-cards{position:fixed;inset:0;z-index:145;background:radial-gradient(ellipse at 80% 0,#31423d70,transparent 60%),#111c25;color:#e9e5d9;display:flex;flex-direction:column;padding:max(18px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom));box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #ffffff18;padding-bottom:15px}small{font-size:10px;letter-spacing:2px;color:#c9b27c}h1{font-size:25px;font-weight:550;margin:8px 0 0}header button{background:#ffffff08;color:#eee;border:1px solid #ffffff25;border-radius:7px;width:38px;height:38px;cursor:pointer}main{overflow:auto;min-height:0;padding-top:10px}.tip,.warning{background:#cba96912;border:1px solid #cba96940;padding:11px;font-size:13px;line-height:1.7}.warning{color:#f2b2a1}.training-layout{display:grid;grid-template-columns:minmax(250px,1fr) minmax(300px,1.3fr);gap:24px;max-width:1100px;margin:20px auto}.card-list{display:flex;flex-direction:column;gap:7px;max-height:65vh;overflow:auto;padding-right:6px}.card-list>button{display:flex;gap:12px;align-items:center;min-height:60px;background:#ffffff05;color:#e9e5da;border:1px solid #ffffff17;border-radius:8px;padding:11px;cursor:pointer;text-align:left}.card-list button.active{border-color:#c7ac72;background:#c7ac7214}.card-list>button>span{font-size:26px}.card-list strong{font-size:14px}.card-list small{display:block;font-size:10px;letter-spacing:0;margin-top:6px;color:#aaa}.card-list b{margin-left:auto;border-radius:50%;background:#31524e;width:25px;height:25px;display:grid;place-items:center}.upgrade-preview{background:#ffffff04;border:1px solid #ffffff1c;border-radius:11px;padding:24px;align-self:start;position:sticky;top:0}.upgrade-preview h2{font-size:21px;font-weight:550;line-height:1.6}.upgrade-preview article{min-width:0;margin:12px 0}.upgrade-cards{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card-thumb{width:56px;height:44px;border:1px solid #aa9365;border-radius:4px;overflow:hidden;flex:none}.upgrade-preview article span{font-size:11px;color:#c0b9a7}.upgrade-preview article>span{display:block;margin-bottom:10px;text-align:center}.explanation{font-size:12px;line-height:1.9;color:#a9b6b1}.upgrade,.practice{background:#c7aa6b;border:1px solid #e8cc8d;border-radius:7px;color:#172128;font-weight:750;font-size:14px;padding:13px 20px;cursor:pointer}.upgrade{width:100%}.upgrade:disabled{opacity:.35;cursor:default}.practice{margin:0 0 18px}
  @media(max-width:650px){.hospital-cards{padding:14px 12px}h1{font-size:19px}.training-layout{grid-template-columns:1fr;gap:14px;margin:15px 0}.card-list{max-height:210px}.upgrade-preview{padding:16px;position:static}.upgrade-preview h2{font-size:18px}.upgrade-cards{gap:12px}.tip,.warning{font-size:11px}}
</style>
