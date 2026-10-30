<script lang="ts">
  import { gameState } from '../../stores/gameStore.svelte';
  import { companyCommuteQuote } from '../../game/core/companyCommute';
  import { cityHotelGuest } from '../../game/core/cityHotels';
  let { onExit, onCompany, onClose, onDining, align = 'right' }: {
    onExit: () => void; onCompany: () => void; onClose: () => void; onDining?: () => void; align?: 'left' | 'right';
  } = $props();
  const quote = $derived(gameState.company ? companyCommuteQuote(gameState) : null);
</script>

<div class="departure-menu" class:left={align === 'left'} role="group" aria-label={cityHotelGuest(gameState) ? '酒店出门选项' : '出门选项'}>
  {#if cityHotelGuest(gameState) && onDining}<button onclick={onDining}>下楼用餐</button>{/if}
  {#if quote}<button class="company-route" data-home-company-commute disabled={!quote.ok} onclick={onCompany}>
    <strong>去公司</strong><span>{gameState.company?.name} · {quote.destinationName}</span>
    <small>{quote.detail}</small>{#if !quote.ok}<small class="reason">{quote.reason}</small>{/if}
  </button>{/if}
  <button data-home-normal-exit onclick={onExit}>{cityHotelGuest(gameState) ? '离开酒店' : '出门逛逛 / 回地图'}</button>
  <button onclick={onClose}>收起</button>
</div>

<style>
  .departure-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:35;display:grid;gap:7px;box-sizing:border-box;width:min(330px,calc(100vw - 32px));padding:12px;border:1px solid var(--home-border,var(--hud-border));border-radius:12px;background:var(--home-solid,var(--hud-surface-solid));box-shadow:0 8px 25px #0005;color:var(--hud-text);}
  .departure-menu.left{left:0;right:auto;}
  button{font:inherit;text-align:left;cursor:pointer;min-height:44px;border:1px solid var(--home-border,var(--hud-border));border-radius:8px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);color:inherit;padding:10px 12px;line-height:1.45;}
  button:hover:not(:disabled){border-color:var(--accent);}
  .company-route{display:grid;gap:3px;}
  strong{font-size:14px;}span,small{font-size:12px;overflow-wrap:anywhere;}
  small{color:var(--home-muted,var(--hud-text-dim));}.reason{color:var(--danger,#c86963);}
  button:disabled{opacity:.65;cursor:default;}
</style>
