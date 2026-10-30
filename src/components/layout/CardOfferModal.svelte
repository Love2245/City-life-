<script lang="ts">
  import { gameState } from '../../stores/gameStore.svelte';
  import { uiState,closeModal } from '../../stores/uiStore.svelte';
  import { chooseDuelOffer } from '../../game/core/catDuelCollection';
  import CatDuelReward from '../CatDuelReward.svelte';
  function done():void{uiState.cardOfferPayload=null;closeModal();}
  function skip():void{const offer=gameState.catDuel?.offer;if(offer)chooseDuelOffer(gameState,offer.id,null);done();}
  function key(event:KeyboardEvent):void{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();skip();}}
</script>
<svelte:window onkeydown={key}/>
<div class="offer-overlay hud-scope" role="dialog" aria-modal="true" aria-label="选择对决奖励卡牌"><div class="offer-panel"><button class="close" aria-label="跳过并关闭选牌" onclick={skip}>✕</button><CatDuelReward session={gameState} onDone={done}/>{#if !gameState.catDuel?.offer}<button onclick={done}>返回</button>{/if}</div></div>
<style>.offer-overlay{position:fixed;inset:0;z-index:155;background:#09131be8;display:grid;place-items:center;padding:20px;box-sizing:border-box}.offer-panel{background:#14212c;border:1px solid #d2b16c50;border-radius:15px;width:min(100%,1050px);max-height:95vh;overflow:auto;padding:20px;position:relative;box-sizing:border-box}.close{position:absolute;right:14px;top:14px;width:35px;height:35px;background:#ffffff08;color:#eee;border:1px solid #ffffff30;border-radius:7px;cursor:pointer}</style>
