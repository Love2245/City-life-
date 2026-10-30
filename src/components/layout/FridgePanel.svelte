<script lang="ts">
  import FridgeContents from './FridgeContents.svelte';
  import { gameState } from '../../stores/gameStore.svelte';
  import { closeModal, openModal } from '../../stores/uiStore.svelte';
  import { canUseCookingWorkbench, pendingCookOf } from '../../game/core/cooking';
  import {playInteractionSound} from '../../lib/audio';
  const kitchen = $derived(canUseCookingWorkbench(gameState));
  const pending = $derived(pendingCookOf(gameState));
  function close(){playInteractionSound('fridge_close');closeModal();}
</script>

<div class="fridge-overlay" role="dialog" aria-modal="true" aria-label="查看冰箱">
  <div class="fridge-panel">
    <header><div><span class="eyebrow">家中储藏</span><h2>冰箱里有什么</h2><p>查看做好的菜、品质和每份效果，也可以直接食用。</p></div><button class="close" aria-label="关闭冰箱" onclick={close}>✕</button></header>
    <FridgeContents />
    <footer><button onclick={close}>返回房间</button><button disabled={!kitchen.ok && !pending} title={kitchen.ok || pending ? '' : kitchen.reason} onclick={() => {playInteractionSound('fridge_close');openModal('cooking');}}>{pending ? '处理刚做好的菜' : '去厨房做饭'}</button></footer>
  </div>
</div>

<style>
  .fridge-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:max(16px,var(--sai-top,0px)) max(16px,var(--sai-right,0px)) max(16px,var(--sai-bottom,0px)) max(16px,var(--sai-left,0px));background:#070b16c9;backdrop-filter:blur(8px)}.fridge-panel{box-sizing:border-box;width:min(740px,100%);max-height:100%;max-height:92dvh;overflow:auto;overscroll-behavior:contain;min-width:0;padding:24px;border:1px solid #95d7d044;border-radius:20px;background:linear-gradient(145deg,#1d293d,#111929);color:#edf3ff;box-shadow:0 24px 80px #0007}header{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}h2{font-size:25px;margin:5px 0 8px}header p{font-size:13px;line-height:1.7;color:#acbad6;margin:0 0 20px}.eyebrow{font-size:11px;letter-spacing:.15em;color:#96dcd5}button{font:inherit;cursor:pointer;min-height:42px;border:1px solid #ffffff26;background:#ffffff0b;color:#edf3ff;padding:10px 16px;border-radius:10px}.close{flex-shrink:0;width:42px;padding:8px}button:disabled{opacity:.45;cursor:not-allowed}footer{margin-top:22px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}footer button:last-child{border-color:#ffd16666;color:#ffe0a0}@media(max-width:600px){.fridge-overlay{padding:10px}.fridge-panel{padding:17px;border-radius:15px;max-height:96dvh}h2{font-size:22px}footer button{flex:1}}@media(max-height:500px){.fridge-panel{max-height:96dvh;padding:16px}}
</style>
