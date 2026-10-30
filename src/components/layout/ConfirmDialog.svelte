<script lang="ts">
  /**
   * v1.43.1 应用内确认弹窗。
   * 用于替代 `window.confirm`——Tauri/WebView2 不支持 JS 原生确认框，
   * 不弹框且静默返回 false，会让存档覆盖/删除、返回主菜单等操作直接失效。
   */
  import { uiState, resolveConfirm } from "../../stores/uiStore.svelte";

  const req = $derived(uiState.confirmRequest);
</script>

{#if req}
  <div
    class="confirm-overlay"
    role="presentation"
    onclick={() => resolveConfirm(false)}
    onkeydown={(event) => {
      if (event.key === "Escape") resolveConfirm(false);
    }}
  >
    <div
      class="confirm-card"
      role="alertdialog"
      aria-modal="true"
      aria-label="请确认"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
    >
      <p class="confirm-text">{req.message}</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn" onclick={() => resolveConfirm(false)}>{req.cancelLabel}</button>
        <button
          type="button"
          class="confirm-btn primary"
          class:danger={req.danger}
          onclick={() => resolveConfirm(true)}
        >{req.confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 420;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.46);
    backdrop-filter: blur(2px);
  }

  .confirm-card {
    width: min(92vw, 380px);
    padding: 20px 20px 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(18, 22, 32, 0.97), rgba(10, 12, 18, 0.97));
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.46);
    color: #f1eee6;
  }

  .confirm-text {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.7;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .confirm-btn {
    min-height: 36px;
    padding: 8px 16px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.32);
    color: rgba(255, 255, 255, 0.78);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .confirm-btn:hover {
    border-color: rgba(255, 218, 146, 0.6);
    color: #fff3d0;
  }

  .confirm-btn.primary {
    border-color: rgba(255, 218, 146, 0.5);
    background: rgba(120, 86, 32, 0.5);
    color: #ffeccb;
  }

  .confirm-btn.primary.danger {
    border-color: rgba(255, 128, 128, 0.55);
    background: rgba(122, 32, 32, 0.52);
    color: #ffd9d9;
  }

  .confirm-btn:focus-visible {
    outline: 2px solid #fff1b3;
    outline-offset: 2px;
  }
</style>
