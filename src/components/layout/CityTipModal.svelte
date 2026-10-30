<script lang="ts">
  import {onMount} from 'svelte';
  import {uiState,closeModal} from '../../stores/uiStore.svelte';
  import {nextCityTip} from '../../lib/cityTips';
  import {gameState} from '../../stores/gameStore.svelte';
  import {financialAlertActive} from '../../game/core/financialRisk';
  import {FINANCIAL_ALERT_TIPS} from '../../game/data/loadingTips';
  $effect(()=>{const alert=financialAlertActive(gameState);if(uiState.modal==='city_tip'&&alert!==(FINANCIAL_ALERT_TIPS as readonly string[]).includes(uiState.cityTip??''))nextCityTip();});
  let panel:HTMLDivElement;
  onMount(()=>{const previous=document.activeElement as HTMLElement|null;panel.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};});
  function keydown(event:KeyboardEvent){
    event.stopPropagation();if(event.key==='Escape'){event.preventDefault();closeModal();return;}
    if(event.key!=='Tab')return;const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button')];
    if(document.activeElement===panel||event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();}
    else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0].focus();}
  }
</script>
<div class="tip-shade" role="presentation" onclick={(event)=>{if(event.target===event.currentTarget)closeModal();}}>
  <div class="tip-paper" data-city-tip role="dialog" aria-modal="true" aria-labelledby="city-tip-title" tabindex="-1" bind:this={panel} onkeydown={keydown}>
    <span class="tip-icon" aria-hidden="true">🗑️</span><h2 id="city-tip-title">垃圾桶里的一张纸条</h2><small>都市小知识</small>
    <p data-city-tip-text>{uiState.cityTip}</p>
    <div class="tip-actions"><button onclick={nextCityTip}>再翻一条</button><button class="primary" onclick={closeModal}>收起来</button></div>
  </div>
</div>
<style>
  .tip-shade{position:fixed;inset:0;z-index:1600;background:#17221b99;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(5px)}.tip-paper{box-sizing:border-box;width:min(420px,100%);max-height:calc(100% - 16px);overflow:auto;padding:26px 28px;border:1px solid #d0c8b5;border-radius:16px;background:#f5f1e7;color:#34483d;box-shadow:0 18px 65px #14251a55;outline:none}.tip-icon{font-size:25px}h2{font-size:19px;font-weight:600;margin:12px 0 7px}small{font-size:11px;letter-spacing:.12em;color:#8a795b}p{font-size:15px;line-height:1.9;margin:18px 0 24px;overflow-wrap:anywhere}.tip-actions{display:flex;justify-content:flex-end;gap:9px}button{font:inherit;font-size:13px;padding:10px 15px;min-height:42px;border:1px solid #a6b1a0;background:transparent;color:#34483d;border-radius:8px;cursor:pointer}button.primary{background:#405944;color:#fff8e9;border-color:#405944}button:focus-visible{outline:2px solid #b28b52;outline-offset:3px}@media(max-height:450px){.tip-paper{padding:16px 22px;width:min(540px,100%)}.tip-icon{display:none}h2{margin-top:0}p{margin:12px 0 16px;font-size:14px;line-height:1.7}}:global(:root[data-game-mode="mobile"]) button{min-height:var(--m-tap,44px);font-size:var(--m-fs-md,14px)}
</style>
