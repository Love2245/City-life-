<script lang="ts">
  /**
   * v1.25 记忆配对（memory）：先展示全部卡牌几秒，翻面后按记忆两两配对。
   * 键盘：数字键 1-8 依次翻开对应卡牌。
   */
  import { onMount } from "svelte";
  import type { MemoryCfg } from "../../../game/core/minigame";

  let { cfg, onFinish }: { cfg: MemoryCfg; onFinish: (ratio: number) => void } = $props();

  const PAIRS = 4;
  const icons = cfg.icons.slice(0, PAIRS);
  const showMs = cfg.showMs ?? 3500;
  /** v1.3b2：全局限时（秒）。0 = 不限时（旧行为，配完才结束） */
  const timeLimit = cfg.timeLimit ?? 0;

  function shuffled<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let deck = $state(
    shuffled([...icons, ...icons].map((icon, i) => ({ icon, uid: i }))).map((c, i) => ({ ...c, idx: i })),
  );
  let flipped = $state<number[]>([]);
  let matchedIdx = $state<number[]>([]);
  let tries = $state(0);
  let memorizing = $state(true);
  let flash = $state(false); // 配错闪烁
  let done = $state(false);
  let timeLeft = $state(timeLimit);
  let clockId: ReturnType<typeof setInterval> | null = null;

  /** 时间到：按已配对进度折算得分（每对 1/PAIRS），并扣除失误 */
  function timeUp(): void {
    if (done) return;
    done = true;
    if (clockId) {
      clearInterval(clockId);
      clockId = null;
    }
    const progress = matchedIdx.length / deck.length;
    onFinish(Math.max(0, Math.min(1, progress * Math.max(0, 1 - tries * 0.15))));
  }

  onMount(() => {
    const t = setTimeout(() => (memorizing = false), showMs);
    if (timeLimit > 0) {
      clockId = setInterval(() => {
        if (done) return;
        timeLeft--;
        if (timeLeft <= 0) timeUp();
      }, 1000);
    }
    return () => {
      clearTimeout(t);
      if (clockId) clearInterval(clockId);
    };
  });

  function flip(idx: number): void {
    if (done || memorizing || flipped.includes(idx) || matchedIdx.includes(idx) || flipped.length >= 2) return;
    flipped = [...flipped, idx];
    if (flipped.length === 2) {
      const [a, b] = flipped;
      if (deck[a].icon === deck[b].icon) {
        matchedIdx = [...matchedIdx, a, b];
        flipped = [];
        if (matchedIdx.length === deck.length) {
          done = true;
          if (clockId) {
            clearInterval(clockId);
            clockId = null;
          }
          onFinish(Math.max(0, Math.min(1, 1 - tries * 0.15)));
        }
      } else {
        tries++;
        flash = true;
        setTimeout(() => {
          flipped = [];
          flash = false;
        }, 700);
      }
    }
  }

  function onKey(e: KeyboardEvent): void {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= deck.length) flip(n - 1);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="mem-wrap">
  {#if memorizing}
    <p class="mem-hint">👀 记住卡牌位置…（{Math.ceil(showMs / 1000)} 秒）</p>
  {:else if done}
    <p class="mem-hint">🎉 全部配对成功！</p>
  {:else}
    <p class="mem-hint">
      {#if timeLimit > 0}<b class="mem-time" class:urgent={timeLeft <= 5}>⏱ {timeLeft}s</b> · {/if}配对相同的卡牌（已尝试
      {tries} 次）· 数字键 1-8 可快捷翻牌
    </p>
  {/if}
  <div class="mem-grid" class:flash>
    {#each deck as card, i}
      <button
        class="mem-card"
        class:up={memorizing || flipped.includes(i) || matchedIdx.includes(i)}
        onclick={() => flip(i)}
      >
        {memorizing || flipped.includes(i) || matchedIdx.includes(i) ? card.icon : "❓"}
      </button>
    {/each}
  </div>
</div>

<style>
  .mem-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }
  .mem-hint {
    font-size: 12px;
    color: var(--text-dim, #9aa3c0);
    text-align: center;
  }
  .mem-time {
    color: var(--accent, #ffd166);
  }
  .mem-time.urgent {
    color: #ef5350;
    animation: mempulse 0.7s ease-in-out infinite;
  }
  @keyframes mempulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .mem-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    width: 260px;
    max-width: 90vw;
  }
  .mem-card {
    aspect-ratio: 1;
    font-size: 30px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-main, #eef1ff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
  }
  .mem-card.up {
    background: rgba(90, 140, 255, 0.28);
  }
  .mem-card:active {
    transform: scale(0.92);
  }
  .mem-grid.flash .mem-card {
    animation: memshake 0.3s ease;
  }
  @keyframes memshake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
</style>
