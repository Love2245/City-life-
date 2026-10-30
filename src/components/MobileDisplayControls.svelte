<script lang="ts">
  import { mobileDisplay, setMobileEdge, setMobileBottom, resetMobileInsets, toggleMobileFullscreen } from '../stores/mobileDisplay.svelte';
  let message = $state('');
  async function fullscreen() {
    message = await toggleMobileFullscreen() ? '' : '当前容器未允许全屏，可调节下方留白避开系统按钮。';
  }
</script>

<section class="mobile-display-controls" aria-label="手机屏幕适配">
  <strong>手机屏幕适配</strong>
  {#if mobileDisplay.nativeManaged}
    <p>游戏会自动隐藏系统栏，边缘滑动可临时唤出。</p>
  {:else if mobileDisplay.fullscreenSupported}
    <p>进入游玩时自动尝试全屏。系统栏重新出现时，可在这里再次开启。</p>
    <button class="btn fullscreen-button" onclick={fullscreen}>{mobileDisplay.fullscreen ? '退出全屏' : '全屏游玩'}</button>
  {:else}
    <p>当前容器不支持网页全屏，可调节下方留白避开系统按钮。</p>
  {/if}
  {#if message}<p role="status">{message}</p>{/if}
  <p>边缘适配：仅在按钮仍被遮挡时增加，左右横屏均生效。</p>
  <label><span>左右边缘留白 <b>{mobileDisplay.edge} px</b></span><input aria-label="左右边缘留白" type="range" min="0" max="80" step="4" value={mobileDisplay.edge} oninput={(e) => setMobileEdge(Number(e.currentTarget.value))}/></label>
  <label><span>底部留白 <b>{mobileDisplay.bottom} px</b></span><input aria-label="底部留白" type="range" min="0" max="80" step="4" value={mobileDisplay.bottom} oninput={(e) => setMobileBottom(Number(e.currentTarget.value))}/></label>
  <div class="display-buttons">
    <button class="btn" onclick={resetMobileInsets}>恢复默认留白</button>
  </div>
</section>

<style>
  .mobile-display-controls{display:grid;gap:12px;min-width:0;color:var(--text-main);font-size:var(--m-fs-sm,13px)}
  strong{font-size:var(--m-fs-md,15px)}p{margin:0;color:var(--text-dim);font-size:var(--m-fs-xs,12px);line-height:1.6}
  label{display:grid;grid-template-columns:minmax(130px,1fr) minmax(120px,1fr);gap:12px;align-items:center}
  label span{display:flex;flex-wrap:wrap;gap:6px;align-items:center}b{font-size:var(--m-fs-xs,12px);font-weight:500;color:var(--accent)}
  input{width:100%;min-width:0;min-height:var(--m-tap,44px)}.display-buttons{display:flex;flex-wrap:wrap;gap:8px}.display-buttons button,.fullscreen-button{min-height:var(--m-tap,44px)}.fullscreen-button{justify-self:start}
  @media(max-width:420px){label{grid-template-columns:1fr;gap:4px}}
</style>
