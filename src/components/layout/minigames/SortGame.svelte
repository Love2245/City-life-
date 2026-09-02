<script lang="ts">
  /**
   * v1.25 工序排序（sort）：把打乱的步骤按正确顺序依次点选。
   * 键盘：数字键 1-N 依次点选对应条目。
   *
   * v1.3b2 改造：
   * - 支持 rounds 多轮循环（单轮只要 5~8 秒，靠多轮把单局填到 30 秒基准）；
   * - 支持 timeLimit 全局倒计时（时间到按已完成轮数 + 当前轮进度折算得分）。
   */
  import { onMount, onDestroy } from "svelte";
  import type { SortCfg } from "../../../game/core/minigame";

  let { cfg, onFinish }: { cfg: SortCfg; onFinish: (ratio: number) => void } = $props();

  const rounds = Math.max(1, cfg.rounds ?? 1);
  /** 全局限时（秒）。0 = 不限时 */
  const timeLimit = cfg.timeLimit ?? 0;

  function shuffled<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deal() {
    return shuffled(cfg.items.map((it, i) => ({ ...it, uid: i })));
  }

  let items = $state(deal());
  let nextIdx = $state(0);
  let tries = $state(0);
  let flash = $state(false);
  let done = $state(false);
  let round = $state(1);
  let timeLeft = $state(timeLimit);
  /** 已完成各轮的得分（每轮 0~1） */
  let roundScores = $state<number[]>([]);
  let clockId: ReturnType<typeof setInterval> | null = null;

  /** 当前轮得分（每次点错 -0.12） */
  function currentScore(): number {
    return Math.max(0, Math.min(1, 1 - tries * 0.12));
  }

  function end(): void {
    if (done) return;
    done = true;
    if (clockId) {
      clearInterval(clockId);
      clockId = null;
    }
    // 未完成的当前轮按进度折算，避免时间到时白干
    const partial = nextIdx > 0 ? (nextIdx / cfg.order.length) * currentScore() : 0;
    const sum = roundScores.reduce((a, b) => a + b, 0) + partial;
    onFinish(Math.max(0, Math.min(1, sum / rounds)));
  }

  function pick(uid: number): void {
    if (done) return;
    const it = items.find((x) => x.uid === uid);
    if (!it) return;
    if (it.label === cfg.order[nextIdx]) {
      nextIdx++;
      if (nextIdx >= cfg.order.length) {
        roundScores = [...roundScores, currentScore()];
        if (round >= rounds) {
          end();
          return;
        }
        // 进入下一轮：重新打乱、清空进度与失误
        round++;
        items = deal();
        nextIdx = 0;
        tries = 0;
      }
    } else {
      tries++;
      flash = true;
      setTimeout(() => (flash = false), 500);
    }
  }

  function onKey(e: KeyboardEvent): void {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) {
      const it = items[n - 1];
      if (it) pick(it.uid);
    }
  }

  onMount(() => {
    if (timeLimit > 0) {
      clockId = setInterval(() => {
        if (done) return;
        timeLeft--;
        if (timeLeft <= 0) end();
      }, 1000);
    }
  });
  onDestroy(() => {
    if (clockId) clearInterval(clockId);
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="sort-wrap">
  <div class="sort-head">
    {#if rounds > 1}
      <span class="sort-round">🔄 第 {round}/{rounds} 轮</span>
    {/if}
    {#if timeLimit > 0}
      <span class="sort-time" class:urgent={timeLeft <= 5}>⏱ {timeLeft}s</span>
    {/if}
  </div>
  <div class="sort-progress">
    按正确顺序点选（第 {Math.min(nextIdx + 1, cfg.order.length)}/{cfg.order.length} 步）· 数字键 1-{items.length} 快捷选择
  </div>
  <div class="sort-list" class:flash>
    {#each items as it, i}
      <button class="sort-item" class:used={i < nextIdx} onclick={() => pick(it.uid)}>
        <span class="s-icon">{it.icon ?? "▪️"}</span>
        <span class="s-label">{it.label}</span>
        <span class="s-num">{i + 1}</span>
      </button>
    {/each}
  </div>
  {#if done}
    <p class="sort-done">✅ 收工！完成 {roundScores.length}/{rounds} 轮工序</p>
  {/if}
</div>

<style>
  .sort-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 0;
    width: 300px;
    max-width: 92vw;
  }
  .sort-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 800;
  }
  .sort-round {
    color: var(--text-main, #eef1ff);
  }
  .sort-time {
    color: var(--accent, #ffd166);
  }
  .sort-time.urgent {
    color: #ef5350;
    animation: sortpulse 0.7s ease-in-out infinite;
  }
  @keyframes sortpulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .sort-progress {
    font-size: 12px;
    color: var(--text-dim, #9aa3c0);
    text-align: center;
  }
  .sort-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sort-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-main, #eef1ff);
    cursor: pointer;
    font-size: 13px;
    text-align: left;
  }
  .sort-item:active {
    transform: scale(0.98);
  }
  .sort-item.used {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .s-icon {
    font-size: 18px;
  }
  .s-num {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-dim, #9aa3c0);
  }
  .sort-done {
    text-align: center;
    color: #7dd87d;
    font-size: 13px;
  }
  .sort-list.flash .sort-item {
    animation: sortshake 0.3s ease;
  }
  @keyframes sortshake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
</style>
