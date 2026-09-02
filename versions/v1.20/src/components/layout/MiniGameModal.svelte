<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showResult, showToast } from "../../stores/uiStore.svelte";
  import { applyMiniGameReward, gradeOf, GRADE_LABEL } from "../../game/core/minigame";
  import { workDialogue } from "../../game/core/workDialogue";
  import { playSound } from "../../lib/audio";
  import SequenceGame from "./minigames/SequenceGame.svelte";
  import RhythmGame from "./minigames/RhythmGame.svelte";
  import QuizGame from "./minigames/QuizGame.svelte";
  import WhackGame from "./minigames/WhackGame.svelte";
  import ChessGame from "./minigames/ChessGame.svelte";

  const payload = uiState.minigamePayload;
  const cfg = payload?.config;

  let finished = false;

  /** 各引擎完成回调：按得分比例结算奖励 → 弹回工作/行动结算窗 */
  function finish(scoreRatio: number): void {
    if (finished) return;
    finished = true;
    if (payload && cfg) {
      const ratio = Math.max(0, Math.min(1, scoreRatio));
      const g = gradeOf(ratio);
      const r = applyMiniGameReward(gameState, payload.key, ratio, payload.todayPay);
      // v0.965：按小游戏表现生成负责人对话（结算窗顶部展示）
      uiState.workDialogue = workDialogue(payload.key, ratio, gameState.rng);
      if (ratio > 0) {
        showToast(`🎮 表现 ${g} 级（${GRADE_LABEL[g]}，${Math.round(ratio * 100)} 分）！${r.bonus ? `加成 +${r.bonus} 元` : "心情 +1"} `);
        playSound("success");
      } else {
        showToast("🎮 完成！下次更准一些~");
      }
    }
    // 弹回结算窗（其关闭时再弹随机事件，保持原链路）
    uiState.modal = null;
    const pending = uiState.resultPayload;
    uiState.resultPayload = null;
    if (pending) showResult(pending);
  }

  /** 跳过（视为 0 分，不卡流程） */
  function skip(): void {
    finish(0);
  }
</script>

<div class="overlay hud-scope">
  <div class="mg-card" onclick={(e) => e.stopPropagation()}>
    <div class="mg-head">
      <div class="mg-title">{payload?.icon} {payload?.title} · 迷你挑战</div>
      <button class="mg-close" onclick={skip}>✕</button>
    </div>

    {#if cfg?.type === "sequence"}
      <SequenceGame cfg={cfg} onFinish={finish} />
    {:else if cfg?.type === "quiz"}
      <QuizGame cfg={cfg} onFinish={finish} />
    {:else if cfg?.type === "whack"}
      <WhackGame cfg={cfg} onFinish={finish} />
    {:else if cfg?.type === "rhythm"}
      <RhythmGame cfg={cfg} onFinish={finish} />
    {:else if cfg?.type === "chess"}
      <ChessGame cfg={cfg} onFinish={finish} />
    {:else}
      <p class="dim">这个小游戏还在打磨中…</p>
      <button class="mg-skip" onclick={skip}>跳过</button>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.72);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 130;
    animation: fadeIn 0.2s ease;
  }
  .mg-card {
    width: min(92vw, 430px);
    max-height: 86vh;
    overflow-y: auto;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 18px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  .mg-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mg-title {
    font-size: 15px;
    font-weight: 800;
  }
  .mg-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 13px;
    color: var(--text-dim, #9aa3c7);
  }
  .mg-skip {
    padding: 8px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-dim);
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 13px;
    cursor: pointer;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
