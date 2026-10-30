<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { uiState, closeModal } from "../stores/uiStore.svelte";
  import PhoneScreen from "./PhoneScreen.svelte";

  let { underlay = false }: { underlay?: boolean } = $props();

  /** 全屏手机弹窗：仅作为 PhoneScreen 的「全屏」外壳，关闭即关弹窗。
   *  手机的全部功能（App 网格 / 通信 / 游戏小游戏 / 资产 / 设置 / 塔罗 / 关系 等）
   *  都集中在 PhoneScreen，与右侧常驻面板共用同一套实现，避免重复。 */
  const initialApp = untrack(() => uiState.phoneStartApp);
  onMount(() => { uiState.phoneStartApp = "home"; });
  function close(): void {
    closeModal();
  }
</script>

<div class="overlay hud-scope" class:underlay onclick={close}>
  <PhoneScreen {initialApp} variant="full" onClose={close} />
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--bg-deep) 55%, rgba(0, 0, 0, 0.55));
    backdrop-filter: blur(10px) saturate(1.08);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    padding: 16px;
    animation: fadeIn 0.22s ease;
  }
  .overlay.underlay { visibility: hidden; pointer-events: none; }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
