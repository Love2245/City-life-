<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { FactoryCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 工厂流水线 / 物流分拣模板（B）：传送带零件按工单顺序抓取组装，错抓/漏抓目标扣血，完成升级加速。
   *  适用于电子厂(产线零件)/物流分拣(包裹按单归位) —— 同一引擎，仅零件池与文案不同。 */
  let { cfg, onFinish }: { cfg: FactoryCfg; onFinish: (ratio: number) => void } = $props();

  const lives0 = cfg.lives ?? 3;
  const productsToWin = cfg.productsToWin ?? 15;
  const spawnMs0 = cfg.spawnMs ?? 1100;
  /** v1.3b2：全局限时（秒）。0 = 不限时（旧行为，仅达标产量/血量结束） */
  const timeLimit = cfg.timeLimit ?? 0;
  const recipeMin = cfg.recipeMin ?? 3;
  const recipeMax = cfg.recipeMax ?? 6;
  const targetWeight = cfg.targetWeight ?? 0.4;

  interface Part {
    id: number;
    typeId: string;
    x: number;
    y: number;
    node: HTMLDivElement | null;
  }

  let recipe = $state<string[]>([]);
  let collectedIndex = $state(0);
  let parts = $state<Part[]>([]);
  let areaEl: HTMLDivElement | null = null;
  let partSeq = 0;

  let products = $state(0);
  let score = $state(0);
  let level = $state(1);
  let lives = $state(lives0);
  let finished = $state(false);
  let shake = $state(false);
  let timeLeft = $state(timeLimit);
  let clockId: ReturnType<typeof setInterval> | null = null;

  let baseSpeed = 3.0;
  let spawnInterval = spawnMs0;
  let lastTime = 0;
  let spawnTimer = 0;
  let rafId = 0;

  function partIcon(id: string): string {
    return cfg.parts.find((p) => p.id === id)?.icon ?? "🔘";
  }
  function partName(id: string): string {
    return cfg.parts.find((p) => p.id === id)?.name ?? "";
  }

  function genRecipe(): string[] {
    const len = recipeMin + Math.floor(Math.random() * (recipeMax - recipeMin + 1));
    const r: string[] = [];
    for (let i = 0; i < len; i++) {
      r.push(cfg.parts[Math.floor(Math.random() * cfg.parts.length)].id);
    }
    return r;
  }

  function spawnPart(): void {
    const target = recipe[collectedIndex];
    let typeId: string;
    if (Math.random() < targetWeight) {
      typeId = target;
    } else {
      typeId = cfg.parts[Math.floor(Math.random() * cfg.parts.length)].id;
    }
    const areaW = areaEl?.clientWidth ?? 380;
    const p: Part = { id: ++partSeq, typeId, x: areaW + 60, y: 6 + Math.random() * 18, node: null };
    parts = [...parts, p];
  }

  function clickPart(p: Part): void {
    if (finished) return;
    const target = recipe[collectedIndex];
    if (p.typeId === target) {
      if (p.node) p.node.classList.add("correct");
      playSound("game");
      collectedIndex++;
      const id = p.id;
      setTimeout(() => {
        parts = parts.filter((x) => x.id !== id);
      }, 150);
      if (collectedIndex >= recipe.length) completeAssembly();
    } else {
      if (p.node) {
        p.node.classList.add("wrong");
        setTimeout(() => p.node?.classList.remove("wrong"), 350);
      }
      playSound("error");
      loseHp();
    }
  }

  function completeAssembly(): void {
    products++;
    score++;
    collectedIndex = 0;
    const newLevel = Math.floor(products / 5) + 1;
    if (newLevel > level) {
      level = newLevel;
      baseSpeed += 0.5;
      spawnInterval = Math.max(500, spawnInterval - 80);
    }
    recipe = genRecipe();
    if (products >= productsToWin) finishGame();
  }

  function loseHp(): void {
    lives--;
    shake = true;
    setTimeout(() => (shake = false), 350);
    if (lives <= 0) finishGame();
  }

  function finishGame(): void {
    if (finished) return;
    finished = true;
    if (clockId) {
      clearInterval(clockId);
      clockId = null;
    }
    const ratio = Math.min(1, products / productsToWin);
    onFinish(ratio);
  }

  function loop(ts: number): void {
    if (finished) return;
    if (!lastTime) lastTime = ts;
    const delta = ts - lastTime;
    lastTime = ts;
    spawnTimer += delta;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnPart();
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x -= baseSpeed * (delta / 16.67);
      if (p.node) p.node.style.left = p.x + "px";
      if (p.x < -60) {
        if (p.typeId === recipe[collectedIndex]) loseHp();
        const id = p.id;
        parts = parts.filter((x) => x.id !== id);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  onMount(() => {
    recipe = genRecipe();
    rafId = requestAnimationFrame(loop);
    if (timeLimit > 0) {
      clockId = setInterval(() => {
        if (finished) return;
        timeLeft--;
        if (timeLeft <= 0) finishGame();
      }, 1000);
    }
  });
  onDestroy(() => {
    cancelAnimationFrame(rafId);
    if (clockId) clearInterval(clockId);
  });
</script>

<div class="fg" class:shake={shake}>
  <div class="fg-top">
    {#if timeLimit > 0}
      <span class="fg-stat fg-time" class:urgent={timeLeft <= 5}>⏱ {timeLeft}s</span>
    {/if}
    <span class="fg-stat">📦 {products}/{productsToWin}</span>
    <span class="fg-stat">⚙️ Lv.{level}</span>
    <span class="fg-stat">✅ {score}</span>
    <span class="fg-lives">
      {#each Array(lives0) as _, i}
        <span class:lost={i >= lives}>❤️</span>
      {/each}
    </span>
  </div>

  <div class="fg-order">
    <div class="fg-order-title">当前工单 · 按顺序抓取</div>
    <div class="fg-recipe">
      {#each recipe as id, i}
        <div class="fg-slot" class:active={i === collectedIndex} class:filled={i < collectedIndex}>
          <span class="fg-num">{i + 1}</span>
          {partIcon(id)}
        </div>
        {#if i < recipe.length - 1}<span class="fg-arrow">→</span>{/if}
      {/each}
    </div>
  </div>

  <div class="fg-conveyor" bind:this={areaEl}>
    {#each parts as p (p.id)}
      <div
        class="fg-part"
        bind:this={p.node}
        style="left:{p.x}px;bottom:{p.y}px"
        onclick={() => clickPart(p)}
        title={partName(p.typeId)}
      >
        {partIcon(p.typeId)}
      </div>
    {/each}
    <div class="fg-belt"></div>
  </div>

  <div class="fg-hint">点击传送带上<b>高亮顺序</b>的零件进行组装 · 错抓或漏抓目标扣 1 血</div>
</div>

<style>
  .fg {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fg.shake {
    animation: fgshake 0.35s ease;
  }
  @keyframes fgshake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
  .fg-top {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 800;
    flex-wrap: wrap;
  }
  .fg-stat {
    color: var(--text-main, #e0e6ed);
  }
  .fg-time {
    color: var(--accent, #ffd166);
  }
  .fg-time.urgent {
    color: #ef5350;
    animation: fgpulse 0.7s ease-in-out infinite;
  }
  @keyframes fgpulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .fg-lives {
    margin-left: auto;
    letter-spacing: 1px;
  }
  .fg-lives .lost {
    opacity: 0.25;
  }
  .fg-order {
    background: rgba(0, 0, 0, 0.25);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .fg-order-title {
    font-size: 0.6rem;
    color: var(--text-dim, #9aa3c7);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }
  .fg-recipe {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .fg-slot {
    width: 38px;
    height: 38px;
    background: var(--bg-card, #222842);
    border: 2px dashed rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    position: relative;
  }
  .fg-slot.active {
    border-style: solid;
    border-color: var(--accent, #ffd166);
    box-shadow: 0 0 8px rgba(255, 209, 102, 0.5);
  }
  .fg-slot.filled {
    border-style: solid;
    border-color: var(--ok, #7bd88f);
    opacity: 0.7;
  }
  .fg-num {
    position: absolute;
    top: -6px;
    left: -6px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #3a4d66;
    font-size: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .fg-slot.active .fg-num { background: var(--accent, #ffd166); color: #1a120a; }
  .fg-slot.filled .fg-num { background: var(--ok, #7bd88f); }
  .fg-arrow { color: rgba(255, 255, 255, 0.3); font-size: 0.75rem; }
  .fg-conveyor {
    position: relative;
    height: 110px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }
  .fg-part {
    position: absolute;
    width: 46px;
    height: 46px;
    background: linear-gradient(145deg, #2a3a50, #1e2a3a);
    border: 2px solid #4a5d75;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    cursor: pointer;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s;
    z-index: 2;
  }
  .fg-part:hover {
    transform: translateY(-3px) scale(1.05);
    border-color: var(--accent, #ffd166);
    z-index: 10;
  }
  .fg-part.wrong { animation: fgwrong 0.35s; border-color: #ef5350; }
  .fg-part.correct { animation: fgcorrect 0.25s; border-color: #66bb6a; }
  @keyframes fgwrong {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
  @keyframes fgcorrect {
    0% { box-shadow: 0 0 0 0 rgba(102, 187, 106, 0.7); }
    100% { box-shadow: 0 0 0 16px rgba(102, 187, 106, 0); }
  }
  .fg-belt {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 26px;
    background: repeating-linear-gradient(90deg, #2d3e55 0px, #2d3e55 24px, #3a4d66 24px, #3a4d66 48px);
    animation: fgbelt 1.2s linear infinite;
    border-top: 2px solid #4a5d75;
  }
  @keyframes fgbelt {
    0% { background-position: 0 0; }
    100% { background-position: -48px 0; }
  }
  .fg-hint {
    font-size: 0.62rem;
    color: var(--text-dim, #9aa3c7);
    text-align: center;
  }
  .fg-hint b { color: var(--accent, #ffd166); }
  @media (max-width: 480px) {
    .fg-conveyor { height: 96px; }
    .fg-slot { width: 32px; height: 32px; font-size: 1rem; }
  }
</style>
