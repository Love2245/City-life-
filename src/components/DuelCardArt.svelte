<script lang="ts">
  import type {DuelCardDef} from '../game/catDuelTypes';
  import {catCardEffectArt} from '../lib/catCardArt';
  let {card}=$props<{card:DuelCardDef}>();
  const baseId=$derived(card.baseId??card.id.replace(/_plus$/,''));
  const art=$derived(catCardEffectArt(baseId));
</script>
<div class="card-effect-art" class:upgraded={card.upgraded} data-art-style="abstract-effect" data-art-card={baseId} aria-hidden="true">
  {#if art}<img src={art} alt="" draggable="false" decoding="async"/>{/if}
  <div class="edge-light"></div>
</div>
<style>
.card-effect-art{position:relative;width:100%;height:100%;overflow:hidden;background:#18303a;isolation:isolate}.card-effect-art img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;user-select:none;pointer-events:none}.edge-light{position:absolute;inset:0;box-shadow:inset 0 0 14px #06162250;pointer-events:none}.upgraded .edge-light{box-shadow:inset 0 0 12px #efd48d24}
</style>
