<script lang="ts">
  // v1.0 剧情模式：意外卡 / 差事卡弹窗
  // 展示进行中的故事卡，玩家从 2~4 个解法（屈服 / 砸钱 / 无视 / 特殊）中选择。
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { activeStoryCards, resolveStoryCard, solutionFeasible } from "../../game/core/story";
  import { gameDay } from "../../game/core/calendar";
  import type { ResultDelta } from "../../game/types";

  const payload = $derived(uiState.storyCardPayload);
  const entry = $derived(
    payload ? activeStoryCards(gameState).find((x) => x.act.cardId === payload.cardId) : undefined,
  );
  const card = $derived(entry?.def);

  let resolved = $state<{ deltas: ResultDelta[]; completed: boolean } | null>(null);

  const daysLeft = $derived(
    entry ? Math.max(0, entry.act.deadlineDay - gameDay(gameState.time)) : 0,
  );

  function close(): void {
    uiState.modal = null;
    uiState.storyCardPayload = null;
    resolved = null;
  }

  function pick(idx: number): void {
    if (!payload) return;
    const r = resolveStoryCard(gameState, payload.cardId, idx);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在做不了"}`);
      return;
    }
    resolved = { deltas: r.deltas ?? [], completed: !!r.completed };
  }

  const KIND_LABEL: Record<string, string> = {
    yield: "屈从",
    money: "砸钱",
    ignore: "视而不见",
    special: "特殊解法",
  };

  function fmt(d: ResultDelta): string {
    const icons: Record<string, string> = {
      money: "💰", stamina: "⚡", health: "❤️", mood: "😊", hygiene: "🫧",
      satiety: "🍚", intelligence: "🧠", charm: "💄", fitness: "💪",
      fame: "🌟", stress: "🔥", goal: "📦", conscience: "⚖️",
    };
    const icon = icons[d.key] ?? "";
    const sign = d.value > 0 ? "+" : "";
    return `${icon} ${sign}${d.value}`;
  }
</script>

{#if payload}
  <div class="overlay hud-scope" onclick={() => (resolved ? close() : null)}>
    <div class="modal story-modal" onclick={(e) => e.stopPropagation()}>
      {#if !card || !entry}
        <div class="e-head">
          <span class="e-icon">📜</span>
          <div class="e-title">这件事已经过去了</div>
        </div>
        <button class="btn btn-primary e-done" onclick={close}>知道了</button>
      {:else if !resolved}
        <div class="e-head">
          <span class="e-icon">{card.icon}</span>
          <div class="e-title">{card.title}</div>
        </div>
        <div class="deadline {daysLeft <= 2 ? "urgent" : ""}">
          ⏳ {daysLeft === 0 ? "今天必须处理！" : `还剩 ${daysLeft} 天`}
        </div>
        <p class="e-text">{card.text}</p>

        <div class="e-choices">
          {#each card.solutions as sol, idx}
            {@const check = solutionFeasible(gameState, card, sol)}
            <button class="e-choice" class:disabled={!check.ok} onclick={() => pick(idx)}>
              <span class="c-kind kind-{sol.kind}">{KIND_LABEL[sol.kind]}</span>
              <span class="c-label">{sol.label}</span>
              <span class="c-desc dim">{sol.desc}</span>
              {#if !check.ok}
                <span class="e-lock">🔒 {check.reason}</span>
              {/if}
            </button>
          {/each}
        </div>
        <p class="dim tip">到期未处理将按「视而不见」结算，并记一次失约。</p>
      {:else}
        <div class="e-head">
          <span class="e-icon">{card.icon}</span>
          <div class="e-title">{card.title}</div>
        </div>
        <div class="e-deltas">
          {#each resolved.deltas as d}
            <div class="e-delta" class:gain={d.value > 0} class:cost={d.value < 0}>
              <span>{d.label}</span>
              <span class="dv">{fmt(d)}</span>
            </div>
          {/each}
          {#if resolved.deltas.length === 0}
            <div class="e-delta dim">事情办妥了，没有明显变化</div>
          {/if}
        </div>
        {#if resolved.completed}
          <div class="final-hint">🎬 主线进入终局——去手机「人情债」查看，完成来城里时的那件事。</div>
        {/if}
        <button class="btn btn-primary e-done" onclick={close}>继续 →</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.68);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 125;
    animation: fadeIn 0.15s ease;
  }
  .story-modal {
    width: 440px;
    max-height: 82vh;
    overflow-y: auto;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  }
  .e-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .e-icon {
    font-size: 28px;
  }
  .e-title {
    font-size: 17px;
    font-weight: 800;
  }
  .deadline {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    color: var(--warn, #ffb347);
    background: rgba(255, 179, 71, 0.12);
    border: 1px solid rgba(255, 179, 71, 0.35);
    padding: 2px 10px;
    border-radius: 999px;
    margin-bottom: 8px;
  }
  .deadline.urgent {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.15);
    border-color: rgba(255, 107, 107, 0.45);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .e-text {
    font-size: 13.5px;
    line-height: 1.75;
    color: var(--text-main, #e8ecf5);
    margin: 4px 0 12px;
    white-space: pre-line;
  }
  .e-choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .e-choice {
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-soft, #1e2636);
    border: 1px solid var(--line, #2c3650);
    font-size: 13px;
    transition: all 0.15s ease;
  }
  .e-choice:hover:not(.disabled) {
    border-color: var(--accent, #5b8cff);
    background: rgba(91, 140, 255, 0.08);
  }
  .e-choice.disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .c-kind {
    align-self: flex-start;
    font-size: 10.5px;
    font-weight: 800;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .kind-yield { background: rgba(255, 107, 107, 0.15); color: #ff8a7a; }
  .kind-money { background: rgba(255, 179, 71, 0.15); color: #ffc46a; }
  .kind-ignore { background: rgba(147, 160, 191, 0.14); color: #a8b2d6; }
  .kind-special { background: rgba(123, 216, 143, 0.15); color: #7ee0a0; }
  .c-label {
    font-size: 14px;
    font-weight: 700;
  }
  .c-desc {
    font-size: 12px;
    line-height: 1.5;
  }
  .e-lock {
    font-size: 11px;
    color: var(--warn, #ffb347);
  }
  .tip {
    font-size: 11px;
    margin-top: 8px;
  }
  .e-deltas {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 10px 0;
  }
  .e-delta {
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 13px;
  }
  .e-delta.gain .dv { color: var(--ok, #7bd88f); font-weight: 700; }
  .e-delta.cost .dv { color: #ff6b6b; font-weight: 700; }
  .final-hint {
    font-size: 12.5px;
    color: var(--accent, #5b8cff);
    background: rgba(91, 140, 255, 0.1);
    border-left: 3px solid var(--accent, #5b8cff);
    border-radius: 8px;
    padding: 10px 12px;
    margin: 4px 0 10px;
    line-height: 1.6;
  }
  .e-done {
    width: 100%;
    padding: 10px;
  }
  .dim { opacity: 0.7; }
</style>
