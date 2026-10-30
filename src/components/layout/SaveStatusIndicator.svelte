<script lang="ts">
  import {gameState,autoSaveStatus,checkpointAutoSave} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {exportCurrentSavePayload} from '../../lib/save';
  import {saveFailureCopy} from '../../lib/saveStatus';
  let {compact=false}:{compact?:boolean}=$props();
  let detailsOpen=$state(false);
  const failure=$derived(saveFailureCopy(autoSaveStatus.error));
  $effect(()=>{if(autoSaveStatus.status==='saved')detailsOpen=false;});
  function exportProgress(){
    try{const url=URL.createObjectURL(new Blob([exportCurrentSavePayload(gameState)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`都市生活_当前进度_${gameState.time.year}-${gameState.time.month}-${gameState.time.day}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){showToast(error instanceof Error?error.message:'进度导出失败，请保留旧存档');}
  }
</script>
{#if autoSaveStatus.status!=='idle'}<div class="save-indicator" class:compact>
  {#if autoSaveStatus.status==='failed'}<button class="save-status save-failed" title={autoSaveStatus.error} aria-expanded={detailsOpen} onclick={()=>detailsOpen=!detailsOpen}>{failure.label}</button>
  {:else}<span class="save-status" aria-live="polite">{autoSaveStatus.status==='saving'?'保存中…':'已保存'}</span>{/if}
  {#if detailsOpen}<div class="save-details" role="alert"><strong>{failure.headline}</strong><p>{autoSaveStatus.error}</p><div><button onclick={()=>checkpointAutoSave()}>重试保存</button><button onclick={exportProgress}>导出当前进度</button><button aria-label="关闭保存提示" onclick={()=>detailsOpen=false}>关闭</button></div></div>{/if}
</div>{/if}
<style>
  .save-indicator{position:absolute;right:20px;bottom:-18px;z-index:20}.save-status{display:inline-block;padding:2px 6px;border-radius:0 0 5px 5px;font-size:9px;white-space:nowrap;color:var(--text-dim);background:var(--hud-surface-solid)}.save-failed{color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);cursor:pointer;font:inherit;font-size:10px}.save-details{position:absolute;right:0;top:calc(100% + 8px);z-index:200;width:min(380px,calc(100vw - 28px));padding:16px;border:1px solid color-mix(in srgb,var(--danger) 55%,var(--hud-border));border-radius:14px;background:var(--hud-surface-solid);color:var(--text-main);box-shadow:0 18px 44px #0007;font-size:12px;line-height:1.6;text-shadow:none}.save-details p{margin:8px 0 14px;color:var(--text-dim);overflow-wrap:anywhere}.save-details>div{display:flex;flex-wrap:wrap;gap:7px}.save-details button{padding:7px 10px;border:1px solid var(--hud-border);border-radius:7px;background:color-mix(in srgb,var(--hud-text) 7%,transparent);color:var(--text-main);font:inherit;cursor:pointer;min-height:36px}.compact{position:relative;right:auto;bottom:auto;margin-left:auto}.compact .save-status{background:none;border-radius:5px;font-size:10px}.compact .save-details{right:auto;left:0;width:min(340px,calc(100vw - 40px))}
  :global(:root[data-game-mode="mobile"]) .save-indicator:not(.compact){position:static;display:inline-flex;align-items:center;flex:0 0 auto}:global(:root[data-game-mode="mobile"]) .save-status{min-height:calc(var(--m-tap) - 8px);padding:2px 5px;border-radius:5px;font-size:var(--m-fs-xs);display:inline-flex;align-items:center}:global(:root[data-game-mode="mobile"]) .compact .save-status{min-height:0}:global(:root[data-game-mode="mobile"]) .save-details button{min-height:var(--m-tap)}
</style>
