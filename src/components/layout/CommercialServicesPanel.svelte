<script lang="ts">
 import {overlayPortal} from '../../lib/overlayPortal';
 import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
 import {ensureStockMarket,stockTimeLabel} from '../../game/core/stockMarket';
 import {STOCKS} from '../../game/data/stocks';
 import ShunshunhuaWorkspace from '../ShunshunhuaWorkspace.svelte';
 import {enterRegion} from '../../game/core/regions';
 import {showToast} from '../../stores/uiStore.svelte';
 import {computerClicks} from '../../lib/computerClicks';
 let terminal=$state(false),quotes=$state(false);
 const market=$derived(gameState.economy.stockMarket);
 const available=$derived(gameState.time.hour>=8&&gameState.time.hour<20);
 $effect(()=>{if(gameState.locationId==='commercial_exchange'&&!gameState.economy.stockMarket){ensureStockMarket(gameState);markSessionDirty();}});
 $effect(()=>{gameState.locationId;terminal=false;quotes=false;});
 $effect(()=>{if(terminal&&!available){terminal=false;enterRegion(gameState,'downtown_commercial');markSessionDirty();showToast('证券交易所打烊了，已退出公用电脑');}});
 const portal=overlayPortal;
</script>
{#if gameState.locationId==='commercial_exchange'}
 <section class="exchange" aria-label="证券交易大厅" use:computerClicks><h3>证券交易大厅</h3><p>大厅公用电脑免费使用，打开后即可进入顺顺花。</p><div class="controls"><button disabled={!available} onclick={()=>terminal=true}>使用免费电脑</button><button aria-expanded={quotes} onclick={()=>quotes=!quotes}>{quotes?'收起行情':'查看行情公告屏'}</button></div>
 {#if quotes&&market}<p>更新于 {stockTimeLabel(market.lastQuoteMinute)}</p><div class="quotes">{#each STOCKS as stock}{@const q=market.quotes[stock.id]}<div><strong>{stock.name}</strong><span>¥ {(q.priceCents/100).toFixed(2)}</span></div>{/each}</div>{/if}
 </section>
 {#if terminal&&market}<div class="terminal-overlay hud-scope" use:portal><div class="terminal" role="dialog" aria-modal="true" aria-label="交易所公用电脑"><ShunshunhuaWorkspace onclose={()=>terminal=false}/></div></div>{/if}
{/if}
<style>
 .exchange{background:var(--hud-surface-solid,var(--bg-card));color:var(--hud-text,var(--text-main));padding:22px;border-radius:12px;border:1px solid var(--hud-border,var(--border))}.exchange h3{margin:0 0 12px}.exchange p{font-size:13px;line-height:1.7}.controls{display:flex;gap:10px}.controls button{font:inherit;padding:12px 18px;min-height:44px;background:var(--bg-card);border:1px solid var(--hud-border,var(--border));color:var(--hud-text,var(--text-main));border-radius:8px;cursor:pointer}.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.quotes>div{display:flex;justify-content:space-between;gap:12px;padding:12px;background:var(--bg-soft);border-radius:6px;font-size:13px}.terminal-overlay{position:fixed;inset:0;z-index:1700;background:#08111cf5;padding:8px;box-sizing:border-box}.terminal{width:100%;height:100%;overflow:hidden;background:#111820;display:flex;flex-direction:column}
</style>
