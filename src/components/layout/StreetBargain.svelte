<script lang="ts">
 import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
 import {streetBargain,buyStreetBargain} from '../../game/core/streetBargains';
 import {showToast} from '../../stores/uiStore.svelte';
 const offer=$derived(streetBargain(gameState));
 function buy(){const result=buyStreetBargain(gameState);if(result.ok)markSessionDirty();showToast(result.reason);}
</script>
{#if offer}<section class="bargain" aria-label="逛街特价"><strong>路边清货小摊</strong><p>{offer.icon} {offer.name} <del>{offer.original} 元</del> <b>{offer.price.toFixed(2)} 元</b></p><button onclick={buy}>买一份</button><small>本次清货，售完即止。</small></section>{/if}
<style>.bargain{padding:20px;background:#35473de8;color:#f9efce;border:1px solid #c8b58566;border-radius:12px}.bargain button{min-height:44px;padding:10px 22px;background:#d5b46d;color:#292f25;border:0;border-radius:6px;font:inherit;cursor:pointer}.bargain del{font-size:12px;color:#d5d1c0;margin:0 10px}.bargain small{margin-left:12px;font-size:11px}</style>
