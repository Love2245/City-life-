<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceCfg } from "../../../game/core/minigame";
  import { scaleTimeLimit } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 顺序点击引擎：流水线多轮乱序 / 咖啡配方 / 配送路线 / 巡逻打点 / 记忆复现 / 摆摊 */
  let { cfg, onFinish }: { cfg: SequenceCfg; onFinish: (ratio: number) => void } = $props();

  const rounds = cfg.rounds ?? 1;
  const stepsPerRound = cfg.steps.length;
  const totalSteps = stepsPerRound * rounds;
  const timeLimit = cfg.timeLimit ? scaleTimeLimit(cfg.timeLimit) : null;

  // 记忆模式：先亮序展示，再复点
  const memoryMode = cfg.memory ?? false;
  // 咖啡配方：每轮随机一杯
  const recipeMode = !!cfg.recipeTable && cfg.recipeTable.length > 0;

  let round = $state(1);
  let idx = $state(0);
  let wrongTotal = $state(0);
  let timeLeft = $state(timeLimit ?? 0);
  let done = $state(false);
  // 当前轮的目标顺序
  let targetSteps = $state<string[]>([]);
  // 当前显示的按钮顺序（每轮乱序）
  let buttons = $state<string[]>([]);
  // 记忆亮序阶段
  let revealing = $state(false);
  let revealIdx = $state(0);
  let currentOrder = $state<string>("");
  // v0.965 反馈：本轮无失误（流畅）提示 + 点错按钮抖动
  let roundClean = $state(true);
  let flowMsg = $state(false);
  let shakeStep = $state<string | null>(null);
  let totalFlow = $state(0);

  const curTarget = $derived(targetSteps[idx]);

  /** 准备一轮：决定目标顺序 + 按钮乱序 */
  function setupRound(): void {
    let steps: string[];
    if (recipeMode) {
      const order = cfg.recipeTable![Math.floor(Math.random() * cfg.recipeTable!.length)];
      currentOrder = `${order.name}（${order.recipe.join(" → ")}）`;
      steps = [...order.recipe];
    } else {
      steps = [...cfg.steps];
      currentOrder = cfg.steps.join(" → ");
    }
    targetSteps = steps;
    idx = 0;
    roundClean = true;
    // 按钮 = 本轮涉及的全部步骤（去重），随机打乱
    const uniq = [...new Set(steps)];
    buttons = shuffle(uniq);
    if (memoryMode) {
      startReveal();
    }
  }

  function startReveal(): void {
    revealing = true;
    revealIdx = 0;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function tap(step: string): void {
    if (done || revealing) return;
    if (step === curTarget) {
      idx++;
      playSound("game");
      if (idx >= targetSteps.length) {
        // 本轮完成：全程无失误 → 流畅提示
        if (roundClean) {
          totalFlow++;
          flowMsg = true;
          setTimeout(() => (flowMsg = false), 900);
        }
        if (round >= rounds) {
          finish();
        } else {
          round++;
          if (cfg.shuffleEachRound) buttons = shuffle(buttons);
          setupRound();
        }
      }
    } else {
      wrongTotal++;
      roundClean = false;
      shakeStep = step;
      setTimeout(() => (shakeStep = null), 300);
      playSound("error");
    }
  }

  function finish(): void {
    if (done) return;
    done = true;
    // 得分比例 = (完成步数 - 失误) / 总步数，最低 0
    const correct = Math.max(0, totalSteps - wrongTotal);
    const ratio = Math.max(0, correct / totalSteps);
    onFinish(ratio);
  }

  onMount(() => {
    setupRound();
    if (timeLimit != null) {
      const timer = setInterval(() => {
        if (done) return;
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }, 100);
      return () => clearInterval(timer);
    }
  });

  // 记忆亮序推进
  $effect(() => {
    if (!revealing) return;
    if (revealIdx >= targetSteps.length) {
      revealing = false;
      return;
    }
    const t = setTimeout(() => {
      revealIdx++;
    }, 480);
    return () => clearTimeout(t);
  });
</script>

<div class="seq">
  <div class="seq-head">
    <span class="seq-title">{cfg.icon} {cfg.title}</span>
    {#if timeLimit != null}
      <span class="seq-timer" class:danger={timeLeft <= 3}>⏱ {timeLeft.toFixed(1)}s</span>
    {/if}
  </div>
  <p class="seq-desc">{cfg.desc}</p>

  {#if recipeMode}
    <div class="recipe">
      <div class="recipe-title">📋 今日配方</div>
      {#each cfg.recipeTable ?? [] as r}
        <div class="recipe-line">{r.name}：{r.recipe.join(" → ")}</div>
      {/each}
    </div>
  {/if}

  <div class="order-line">
    <span class="order-now">本轮 {round}/{rounds}：{currentOrder}</span>
    <span class="order-progress dim">已完成 {Math.min(totalSteps, (round - 1) * stepsPerRound + idx)}/{totalSteps} · 失误 {wrongTotal}</span>
  </div>
  {#if flowMsg}
    <div class="flow">✨ 这轮行云流水，一次没错！</div>
  {/if}

  {#if revealing}
    <div class="reveal">
      <span class="reveal-step">{targetSteps[revealIdx] ?? ""}</span>
      <p class="dim">记住顺序，马上复点</p>
    </div>
  {:else}
    <div class="steps-grid">
      {#each buttons as b}
        <button class="seq-btn" class:shake={shakeStep === b} disabled={done} onclick={() => tap(b)}>
          <span class="seq-btn-icon">{cfg.stepIcons?.[cfg.steps.indexOf(b)] ?? "🔘"}</span>
          <span>{b}</span>
        </button>
      {/each}
    </div>
    <p class="cur-target">➡️ 下一个：<b>{curTarget}</b></p>
  {/if}

  <p class="seq-foot dim">💡 点错计一次失误（容错 {cfg.wrongLimit ?? 3} 次），表现越好加成越高，失败无惩罚。</p>
</div>

<style>
  .seq {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .seq-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .seq-title {
    font-size: 15px;
    font-weight: 800;
  }
  .seq-timer {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .seq-timer.danger {
    color: #ff8a7a;
  }
  .seq-desc {
    font-size: 12px;
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .recipe {
    background: rgba(255, 209, 102, 0.07);
    border: 1px solid rgba(255, 209, 102, 0.2);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 11px;
  }
  .recipe-title {
    font-weight: 700;
    margin-bottom: 4px;
  }
  .recipe-line {
    color: var(--text-dim, #9aa3c7);
  }
  .order-line {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .order-now {
    font-weight: 700;
  }
  .order-progress {
    font-size: 11px;
  }
  .flow {
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
    animation: pulse 0.4s ease;
  }
  .seq-btn.shake {
    animation: shake 0.3s ease;
    border-color: #ff8a7a;
  }
  .reveal {
    text-align: center;
    padding: 18px 0;
  }
  .reveal-step {
    font-size: 26px;
    font-weight: 800;
    color: var(--accent, #ffd166);
  }
  .steps-grid {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .seq-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    color: var(--text-main);
    border: 1px solid rgba(255, 209, 102, 0.3);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .seq-btn:hover {
    transform: scale(1.05);
  }
  .seq-btn-icon {
    font-size: 22px;
  }
  .cur-target {
    text-align: center;
    font-size: 14px;
    margin: 2px 0 0;
  }
  .seq-foot {
    font-size: 11px;
    text-align: center;
    margin: 0;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
