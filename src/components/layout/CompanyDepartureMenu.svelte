<script lang="ts">
  import {gameState} from '../../stores/gameStore.svelte';
  import {companyReturnHomeQuote} from '../../game/core/companyReturnHome';
  let {onHome,onExit,onClose}:{onHome:()=>void;onExit:()=>void;onClose:()=>void}=$props();
  const quote=$derived(companyReturnHomeQuote(gameState));
</script>
<div class="company-departure-menu" role="group" aria-label="公司出门选项">
  <button class="home-route" data-company-return-home disabled={!quote.ok} onclick={onHome}><strong>回家</strong><span>{quote.destinationName}</span><small>{quote.detail}</small>{#if !quote.ok}<small class="reason">{quote.reason}</small>{/if}</button>
  <button data-company-normal-exit onclick={onExit}>出门逛逛 / 回地图</button>
  <button onclick={onClose}>收起</button>
</div>
<style>
  .company-departure-menu{display:grid;gap:7px;box-sizing:border-box;width:min(320px,calc(100vw - 32px));padding:12px;border:1px solid var(--hud-border);border-radius:12px;background:var(--hud-surface-solid);box-shadow:0 8px 25px #0005;color:var(--hud-text)}
  button{font:inherit;text-align:left;cursor:pointer;min-height:44px;border:1px solid var(--hud-border);border-radius:8px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);color:inherit;padding:10px 12px;line-height:1.45}button:hover:not(:disabled){border-color:var(--accent)}button:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px}.home-route{display:grid;gap:3px}strong{font-size:14px}span,small{font-size:12px;overflow-wrap:anywhere}small{color:var(--hud-text-dim)}.reason{color:var(--danger,#c86963)}button:disabled{opacity:.65;cursor:default}
</style>
