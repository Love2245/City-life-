<script lang="ts">
  import { onMount } from "svelte";
  import { completeDeviceSetup, isAndroidApp } from "../stores/uiStore.svelte";
  import type { GameMode } from "../lib/mobileLayout";

  let firstChoice = $state<HTMLButtonElement>();
  function chooseLayout(mode: Exclude<GameMode, 'mobile'>) { completeDeviceSetup(mode); }

  onMount(() => firstChoice?.focus());
</script>

<div class="device-setup-overlay" role="presentation">
  <div class="device-setup" role="dialog" aria-modal="true" aria-labelledby="device-setup-title">
    <div class="eyebrow">首次启动设置</div>
    <h1 id="device-setup-title">你正在使用哪种设备？</h1>
    <p>我们会据此选择更合适的界面。之后可以随时在设置中切换。</p>

    <div class="device-options">
      <button bind:this={firstChoice} class="device-choice phone" onclick={() => chooseLayout("pe")}>
        <span class="device-icon" aria-hidden="true">📱</span>
        <span class="device-title">手机</span>
        <span class="device-desc">开启 PE 手游模式，横屏游玩</span>
      </button>
      <button class="device-choice tablet" onclick={() => chooseLayout("tablet")}>
        <span class="device-icon" aria-hidden="true">▭</span>
        <span class="device-title">平板</span>
        <span class="device-desc">使用 PC 布局，隐藏底部行动日志</span>
      </button>
      <button class="device-choice computer" onclick={() => chooseLayout("pc")}>
        <span class="device-icon" aria-hidden="true">🖥️</span>
        <span class="device-title">电脑</span>
        <span class="device-desc">开启 PC 模式，保留桌面布局</span>
      </button>
    </div>
    <button class="setup-skip" onclick={() => chooseLayout(isAndroidApp() ? 'pe' : 'pc')}>使用推荐布局并继续</button>
    <small>开始新生活时，可以对照游戏截图选择 3D 或 2D 画面。界面布局与场景画质分别设置。</small>

  </div>
</div>

<style>
  .device-setup-overlay { position: fixed; inset: 0; z-index: 2200; display: grid; place-items: center; overflow-y: auto; padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); box-sizing: border-box; background: #080b15ed; }
  .device-setup { width: min(680px, 100%); box-sizing: border-box; padding: clamp(22px, 5vw, 38px); border: 1px solid #53627d; border-radius: 20px; color: #eef2ff; background: linear-gradient(145deg, #202a43, #111827 75%); box-shadow: 0 24px 90px #000a; }
  .eyebrow { color: #ffd166; font-size: 12px; font-weight: 700; letter-spacing: .12em; }
  h1 { margin: 8px 0; font-size: clamp(22px, 4vw, 30px); }
  p { margin: 0 0 22px; color: #b9c4d8; line-height: 1.6; }
  .device-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .setup-skip { min-height: 44px; margin-top: 14px; padding: 9px 16px; border: 1px solid #65728a; border-radius: 10px; color: #eef2ff; background: #ffffff0d; cursor: pointer; }
  .device-choice { min-width: 0; min-height: 172px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 16px; border: 1px solid #46536b; border-radius: 14px; color: inherit; text-align: left; background: #ffffff09; cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
  .device-choice:hover, .device-choice:focus-visible { transform: translateY(-2px); border-color: #ffd166; outline: none; background: #ffd16614; }
  .device-icon { font-size: 32px; line-height: 1; }
  .device-title { font-size: 17px; font-weight: 800; }
  .device-desc { color: #bdc8da; font-size: 13px; line-height: 1.5; }
  small { display: block; margin-top: 18px; color: #8997ae; line-height: 1.5; }
  @media (max-width: 560px) {
    .device-setup-overlay { place-items: start center; }
    .device-setup { margin: auto 0; padding: 20px; border-radius: 16px; }
    .device-options { grid-template-columns: 1fr; gap: 8px; }
    .device-choice { min-height: 0; display: grid; grid-template-columns: 38px 1fr; column-gap: 10px; row-gap: 3px; padding: 12px; }
    .device-icon { grid-row: span 2; align-self: center; font-size: 28px; }
    .device-title, .device-desc { grid-column: 2; }
  }
  @media (prefers-reduced-motion: reduce) { .device-choice { transition: none; } }
</style>
