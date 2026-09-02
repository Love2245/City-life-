<script lang="ts">
  import { onMount } from "svelte";
  import type { WhackCfg } from "../../../game/core/minigame";
  import { scaleTimeLimit } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 反应点击引擎：目标随机出现，点好货得分、避开坏目标；装卸工 / 市场清洁 / 信号灯 */
  let { cfg, onFinish }: { cfg: WhackCfg; onFinish: (ratio: number) => void } = $props();

  const targets = cfg.targets;
  const timeLimit = cfg.timeLimit ? scaleTimeLimit(cfg.timeLimit) : null;

  interface Spawn {
    cell: number;
    good: boolean;
    key: number;
    id: number;
  }

  let spawned = $state<Spawn[]>([]);
  let hitGood = $state(0);
  let hitBad = $state(0);
  let timeLeft = $state(timeLimit ?? 0);
  let done = $state(false);
  let totalGood = $state(0);
  let spawnCount = $state(0);
  let started = $state(false);

  const CELLS = 9;

  function begin(): void {
    started = true;
    playSound("game");
  }

  function spawnOne(): void {
    if (done || spawnCount >= targets) return;
    const cell = Math.floor(Math.random() * CELLS);
    const good = Math.random() > 0.28; // ~28% 坏目标
    if (good) totalGood++;
    spawnCount++;
    const spawn: Spawn = { cell, good, key: Date.now() + Math.random(), id: spawnCount };
    spawned = [...spawned, spawn];
    setTimeout(() => {
      spawned = spawned.filter((s) => s !== spawn); // 消失（漏点不计分）
    }, 850);
  }

  function tapCell(i: number): void {
    if (done || !started) return;
    const s = spawned.find((sp) => sp.cell === i);
    if (!s) return;
    if (s.good) {
      hitGood++;
      playSound("game");
    } else {
      hitBad++;
      playSound("error");
    }
    spawned = spawned.filter((sp) => sp !== s);
  }

  function finish(): void {
    if (done) return;
    done = true;
    const ratio = totalGood > 0 ? hitGood / totalGood : 0;
    onFinish(Math.max(0, Math.min(1, ratio)));
  }

  onMount(() => {
    begin();
    // v0.965：目标出现节奏随机化（650-1150ms），不再死板
    let spawnTimer: ReturnType<typeof setTimeout>;
    function schedule(): void {
      if (done) return;
      spawnOne();
      spawnTimer = setTimeout(schedule, 650 + Math.random() * 500);
    }
    schedule();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (timeLimit != null) {
      timer = setInterval(() => {
        if (done) return;
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }, 100);
    }
    return () => {
      clearTimeout(spawnTimer);
      if (timer) clearInterval(timer);
    };
  });
</script>

<div class="whack">
  <div class="wh-head">
    <span class="wh-title">{cfg.icon} {cfg.title}</span>
    {#if timeLimit != null}
      <span class="wh-timer" class:danger={timeLeft <= 3}>⏱ {timeLeft.toFixed(1)}s</span>
    {/if}
  </div>
  <p class="wh-desc">{cfg.desc}</p>

  {#if !started}
    <button class="wh-start" onclick={begin}>▶ 开始</button>
  {:else}
    <div class="wh-grid">
      {#each Array(CELLS) as _, i}
        {@const s = spawned.find((sp) => sp.cell === i)}
        <div class="wh-cell" onclick={() => tapCell(i)}>
          {#if s}
            <span class="wh-target" class:bad={!s.good}>{s.good ? cfg.goodIcon : cfg.badIcon}</span>
          {/if}
        </div>
      {/each}
    </div>
    <p class="wh-score">
      ✅ {cfg.goodLabel} {hitGood}/{totalGood}
      {#if hitBad > 0}<span class="bad-count"> · ❌ 碰坏 {hitBad}</span>{/if}
    </p>
  {/if}

  <p class="wh-foot dim">💡 点中{cfg.goodLabel}得分，别点{cfg.badLabel}（容错 {cfg.wrongLimit ?? 2} 次），失败无惩罚。</p>
</div>

<style>
  .whack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .wh-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .wh-title {
    font-size: 15px;
    font-weight: 800;
  }
  .wh-timer {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .wh-timer.danger {
    color: #ff8a7a;
  }
  .wh-desc {
    font-size: 12px;
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .wh-start {
    margin: 12px auto;
    padding: 10px 28px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.15);
    color: var(--accent, #ffd166);
    border: 1px solid rgba(255, 209, 102, 0.4);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }
  .wh-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .wh-cell {
    height: 64px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.1s;
  }
  .wh-cell:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .wh-target {
    font-size: 32px;
    animation: popIn 0.15s ease;
  }
  .wh-target.bad {
    filter: hue-rotate(60deg);
  }
  .wh-score {
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    color: #7bd88f;
  }
  .bad-count {
    color: #ff8a7a;
  }
  .wh-foot {
    font-size: 11px;
    text-align: center;
    margin: 0;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
