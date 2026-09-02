<script lang="ts">
  /**
   * v0.92 堂食 / 打包 选择弹窗。
   * 便利店与水果摊购买时由店员询问：当场吃掉（效果立即生效、不占背包），
   * 还是打包带走（入背包，之后在背包里使用）。
   */
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showResult, showToast } from "../../stores/uiStore.svelte";
  import { performAction, getAction, DINE_IN_EXTRA_HOURS, type DineMode } from "../../game/core/actions";
  import { rollEvent } from "../../game/core/events";
  import { playSound } from "../../lib/audio";

  const payload = $derived(uiState.dinePayload);

  function close(): void {
    uiState.modal = null;
    uiState.dinePayload = null;
  }

  function choose(dine: DineMode): void {
    const p = uiState.dinePayload;
    if (!p) return close();
    const action = getAction(p.actionId);
    const r = performAction(gameState, p.actionId, { dine });
    close();
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "买不了"}`);
      return;
    }
    playSound(dine === "eat" ? "eat" : "coin");
    if (r.result) {
      const ev = rollEvent(gameState, action?.eventChance);
      if (ev) uiState.pendingEvent = ev;
      showResult(r.result);
    }
  }
</script>

{#if payload}
  <div class="overlay hud-scope" onclick={close}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-title">{payload.actionIcon} {payload.actionName}</div>
      <p class="hint">
        店员抬头问了一句：<b>「在这儿吃还是打包带走？」</b>
        <br />
        {payload.itemIcon} {payload.itemName} · {payload.price} 元
      </p>

      <div class="opts">
        <button class="opt primary" onclick={() => choose("eat")}>
          <span class="o-icon">🍽️</span>
          <div class="o-info">
            <div class="o-name">在这儿吃</div>
            <div class="o-desc dim">
              当场吃完，{payload.effectText || "效果立即生效"}；额外花 {DINE_IN_EXTRA_HOURS} 小时，不占背包
            </div>
          </div>
        </button>

        <button class="opt" onclick={() => choose("pack")}>
          <span class="o-icon">🥡</span>
          <div class="o-info">
            <div class="o-name">打包带走</div>
            <div class="o-desc dim">放进背包，饿的时候再从背包里拿出来吃</div>
          </div>
        </button>

        <button class="opt ghost" onclick={close}>
          <span class="o-icon">↩️</span>
          <div class="o-info">
            <div class="o-name">算了，不买了</div>
            <div class="o-desc dim">放回货架，一分钱不花</div>
          </div>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 420px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: popIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .modal-title {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .hint {
    font-size: 12.5px;
    color: var(--text-dim);
    line-height: 1.7;
    margin-bottom: 14px;
  }
  .hint b {
    color: var(--text);
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .opt.primary {
    border-color: var(--accent);
  }
  .opt:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .opt.ghost {
    opacity: 0.75;
  }
  .o-icon {
    font-size: 22px;
  }
  .o-name {
    font-size: 14px;
    font-weight: 700;
  }
  .o-desc {
    font-size: 11.5px;
    line-height: 1.5;
  }
  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
