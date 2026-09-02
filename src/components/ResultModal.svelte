<script lang="ts">
  import { uiState, showEvent } from "../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { playSound } from "../lib/audio";
  import type { ActionResult } from "../game/types";

  const payload = $derived(uiState.resultPayload as ActionResult | null);

  /** 弹窗出现时播放结算音效（无指定时按损益兜底 success/error） */
  $effect(() => {
    if (!payload) return;
    const sum = payload.deltas.reduce((acc, d) => acc + d.value, 0);
    playSound(payload.sound ?? (sum >= 0 ? "success" : "error"));
  });

  /** 关闭结算弹窗；若有排队的事件则弹出 */
  function close(): void {
    uiState.modal = null;
    uiState.resultPayload = null;
    uiState.workDialogue = null; // v0.965 负责人对话随弹窗关闭清空
    const pending = uiState.pendingEvent;
    if (pending) {
      uiState.pendingEvent = null;
      showEvent(pending);
    }
  }

  function fmt(v: number, key: string): string {
    const icon =
      key === "money" ? "💰" :
      key === "stamina" ? "⚡" :
      key === "health" ? "❤️" :
      key === "mood" ? "😊" :
      key === "hygiene" ? "🫧" :
      key === "satiety" ? "🍚" :
      key === "intelligence" ? "🧠" :
      key === "charm" ? "💄" :
      key === "fitness" ? "💪" :
      key === "fame" ? "🌟" :
      key === "stress" ? "🔥" : "";
    const prefix = v > 0 ? "+" : "";
    return `${icon} ${prefix}${v}`;
  }
</script>

  {#if payload}
  <div class="overlay hud-scope" onclick={() => close()} transition:fade={{ duration: 150 }}>
    <div class="modal result-modal" onclick={(e) => e.stopPropagation()}>
      <button class="r-close" onclick={() => close()}>✕</button>
      <!-- v0.965 工作负责人对话 -->
      {#if uiState.workDialogue}
        <div class="r-dialogue" class:bad={uiState.workDialogue.quality === "bad"} class:great={uiState.workDialogue.quality === "great"}>
          <span class="d-avatar">{uiState.workDialogue.speaker.icon}</span>
          <div class="d-body">
            <div class="d-who">
              <b>{uiState.workDialogue.speaker.name}</b>
              <span class="d-role dim">{uiState.workDialogue.speaker.role}的评价</span>
            </div>
            <div class="d-text">“{uiState.workDialogue.text}”</div>
          </div>
        </div>
      {/if}

      <div class="r-head">
        <span class="gi-emoji" style="font-size:38px;line-height:1">{payload.icon}</span>
        <div class="r-title">{payload.name}</div>
      </div>

      <div class="r-time dim">用时 {payload.duration} 小时</div>

      <div class="r-deltas">
        {#each payload.deltas as d, i}
          <div
            class="r-delta"
            class:gain={d.value > 0}
            class:cost={d.value < 0}
            style="animation-delay:{i * 40}ms"
          >
            <span class="d-label">{d.label}</span>
            <span class="d-value">{fmt(d.value, d.key)}</span>
          </div>
        {/each}
        {#if payload.deltas.length === 0}
          <div class="r-delta dim">没有明显变化</div>
        {/if}
      </div>

      <div class="r-verdict">"{payload.verdict}"</div>

      <button class="btn btn-primary r-continue" onclick={() => close()}>继续 →</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .result-modal {
    width: 360px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    position: relative;
  }
  .r-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    font-size: 14px;
    color: var(--text-dim, #9aa3c7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .r-close:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
  .r-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .r-icon {
    font-size: 28px;
  }
  .r-title {
    font-size: 17px;
    font-weight: 700;
  }
  .r-time {
    font-size: 12px;
    margin-bottom: 12px;
  }
  .r-deltas {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .r-delta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 13px;
    opacity: 0;
    animation: deltaIn 0.25s ease forwards;
  }
  .r-delta.gain .d-value {
    color: var(--ok);
    font-weight: 700;
  }
  .r-delta.cost .d-value {
    color: var(--danger);
    font-weight: 700;
  }
  @keyframes deltaIn {
    from { opacity: 0; transform: translateX(14px); }
    to { opacity: 1; transform: none; }
  }
  .r-verdict {
    font-size: 13.5px;
    color: var(--text-dim);
    font-style: italic;
    padding: 10px 14px;
    background: rgba(255, 209, 102, 0.06);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    margin-bottom: 16px;
    line-height: 1.6;
  }
  .r-dialogue {
    display: flex;
    gap: 10px;
    background: rgba(108, 198, 255, 0.08);
    border: 1px solid rgba(108, 198, 255, 0.25);
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .r-dialogue.great {
    background: rgba(255, 209, 102, 0.1);
    border-color: rgba(255, 209, 102, 0.4);
  }
  .r-dialogue.bad {
    background: rgba(255, 107, 107, 0.08);
    border-color: rgba(255, 107, 107, 0.35);
  }
  .d-avatar {
    font-size: 26px;
    flex-shrink: 0;
  }
  .d-body {
    min-width: 0;
    flex: 1;
  }
  .d-who {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .d-role {
    font-size: 10.5px;
  }
  .d-text {
    font-size: 13px;
    line-height: 1.5;
  }
  .r-continue {
    width: 100%;
    padding: 11px;
    font-size: 14px;
  }
</style>