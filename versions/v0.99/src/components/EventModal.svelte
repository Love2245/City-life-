<script lang="ts">
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { applyEventChoice } from "../game/core/events";
  import { checkRequirements } from "../game/core/actions";
  import { randomSlogan } from "../game/core/slogan";
  import { playSound } from "../lib/audio";
  import type { EventDef, EventChoice, ResultDelta } from "../game/types";

  const payload = $derived(uiState.eventPayload as EventDef | null);

  /** 弹窗出现时播放事件音效 */
  $effect(() => {
    if (payload?.sound) playSound(payload.sound);
  });

  /** 已选择选项 → 显示结算阶段 */
  let resolved = $state<{ deltas: ResultDelta[]; gambleResult?: "win" | "lose"; outcome?: string | null; slogan?: string | null } | null>(null);

  function close(): void {
    uiState.modal = null;
    uiState.eventPayload = null;
    resolved = null;
  }

  function pick(idx: number): void {
    if (!payload) return;
    const r = applyEventChoice(gameState, payload.id, idx);
    if (!r.ok && r.reason) {
      showToast(r.reason);
      return;
    }
    const outcome = r.outcome ?? null;
    resolved = {
      deltas: r.deltas ?? [],
      gambleResult: r.gambleResult,
      outcome,
      slogan: outcome ? null : randomSlogan(gameState.rng),
    };
    if (r.gambleResult) playSound(r.gambleResult === "win" ? "success" : "error");
  }

  function choiceCheck(choice: EventChoice): { ok: boolean; reason?: string } {
    return checkRequirements(gameState, choice.requires);
  }

  function fmtDelta(d: ResultDelta): string {
    const icons: Record<string, string> = {
      money: "💰", stamina: "⚡", health: "❤️", mood: "😊", hygiene: "🫧",
      satiety: "🍚", intelligence: "🧠", charm: "💄", fitness: "💪", fame: "🌟", stress: "🔥",
    };
    const icon = icons[d.key] ?? "";
    const sign = d.value > 0 ? "+" : "";
    return `${icon} ${sign}${d.value}`;
  }
</script>

{#if payload}
  <div class="overlay hud-scope" onclick={() => (resolved ? close() : null)}>
    <div class="modal event-modal" onclick={(e) => e.stopPropagation()}>
      {#if !resolved}
        <!-- 阶段 1：选择 -->
        <div class="e-head">
          <span class="e-icon">{payload.icon}</span>
          <div class="e-title">{payload.title}</div>
        </div>
        <p class="e-text">{payload.text}</p>

        <div class="e-choices">
          {#each payload.choices as choice, idx}
            {@const check = choiceCheck(choice)}
            <button class="e-choice" class:disabled={!check.ok} onclick={() => pick(idx)}>
              {choice.label}
              {#if choice.gamble}
                <span class="e-gamble">🎲 押 {choice.gamble.cost} 元，中 {choice.gamble.win} / 输 {choice.gamble.lose}（{Math.round(choice.gamble.winChance * 100)}%）</span>
              {/if}
              {#if !check.ok}
                <span class="e-lock">🔒 {check.reason}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <!-- 阶段 2：结算 -->
        <div class="e-head">
          <span class="e-icon">{payload.icon}</span>
          <div class="e-title">{payload.title}</div>
        </div>
        {#if resolved.gambleResult}
          <div class="gamble-result" class:win={resolved.gambleResult === "win"} class:lose={resolved.gambleResult === "lose"}>
            {resolved.gambleResult === "win" ? "🎉 手气不错，赢了！" : "😞 运气不佳，亏了…"}
          </div>
        {/if}
        <div class="e-deltas">
          {#each resolved.deltas as d}
            <div class="e-delta" class:gain={d.value > 0} class:cost={d.value < 0}>
              <span>{d.label}</span>
              <span class="dv">{fmtDelta(d)}</span>
            </div>
          {/each}
          {#if resolved.deltas.length === 0}
            <div class="e-delta dim">没有明显变化</div>
          {/if}
        </div>
        {#if resolved.outcome}
          <div class="e-outcome">{resolved.outcome}</div>
        {:else if resolved.slogan}
          <div class="e-slogan">「{resolved.slogan}」</div>
        {/if}
        <button class="btn btn-primary e-done" onclick={() => close()}>确定</button>
      {/if}
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
    z-index: 110;
    animation: fadeIn 0.15s ease;
  }
  .event-modal {
    width: 420px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .e-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .e-icon {
    font-size: 26px;
  }
  .e-title {
    font-size: 16px;
    font-weight: 700;
  }
  .e-text {
    font-size: 13.5px;
    line-height: 1.7;
    color: var(--text-main);
    margin-bottom: 14px;
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
    padding: 11px 14px;
    border-radius: 10px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    font-size: 13.5px;
    transition: all 0.15s ease;
  }
  .e-choice:hover:not(.disabled) {
    border-color: var(--accent);
    background: rgba(255, 209, 102, 0.07);
  }
  .e-choice.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .e-gamble {
    font-size: 11px;
    color: var(--warn);
  }
  .e-lock {
    font-size: 11px;
    color: var(--warn);
  }
  .gamble-result {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    padding: 10px;
    border-radius: 10px;
    margin-bottom: 10px;
  }
  .gamble-result.win {
    background: rgba(123, 216, 143, 0.15);
    color: var(--ok);
  }
  .gamble-result.lose {
    background: rgba(255, 107, 107, 0.15);
    color: var(--danger);
  }
  .e-deltas {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .e-delta {
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 13px;
  }
  .e-delta.gain .dv {
    color: var(--ok);
    font-weight: 700;
  }
  .e-delta.cost .dv {
    color: var(--danger);
    font-weight: 700;
  }
  .e-done {
    width: 100%;
    padding: 10px;
  }
  .e-outcome {
    font-size: 13px;
    line-height: 1.75;
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.05);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    padding: 11px 13px;
    margin-bottom: 14px;
    white-space: pre-line;
  }
  .e-slogan {
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--text-dim);
    text-align: center;
    font-style: italic;
    margin-bottom: 14px;
  }
</style>
