<!-- v1.20 手机游戏：贪吃蛇。吃到 20 个食物即「满分」 -->
<script lang="ts">
  let { onPerfect = () => {} }: { onPerfect?: (gameId: string) => void } = $props();

  const COLS = 18, ROWS = 14, PERFECT_SCORE = 20;
  interface Pt { x: number; y: number }

  let snake = $state<Pt[]>([{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }]);
  let dir = $state<Pt>({ x: 1, y: 0 });
  let nextDir = $state<Pt>({ x: 1, y: 0 });
  let food = $state<Pt>({ x: 10, y: 7 });
  let score = $state(0);
  let over = $state(false);
  let running = $state(false);
  let perfectSent = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function spawnFood(): void {
    const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
    const free: Pt[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    food = free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
  }

  function tick(): void {
    if (over) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      endGame();
      return;
    }
    if (snake.some((p) => p.x === head.x && p.y === head.y)) {
      endGame();
      return;
    }
    snake = [head, ...snake];
    if (head.x === food.x && head.y === food.y) {
      score++;
      spawnFood();
      if (score >= PERFECT_SCORE) {
        endGame();
        return;
      }
    } else {
      snake = snake.slice(0, -1);
    }
  }

  function setDir(d: Pt): void {
    if (d.x === -dir.x && d.y === -dir.y) return; // 不允许掉头
    nextDir = d;
  }

  function start(): void {
    if (running) return;
    running = true;
    over = false;
    timer = setInterval(tick, 140);
  }

  function endGame(): void {
    over = true;
    running = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (score >= PERFECT_SCORE && !perfectSent) {
      perfectSent = true;
      onPerfect("snake");
    }
  }

  function restart(): void {
    snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    over = false;
    running = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    spawnFood();
  }
</script>

<svelte:window onkeydown={(e) => {
  const k = e.key;
  if (k === "ArrowUp") setDir({ x: 0, y: -1 });
  else if (k === "ArrowDown") setDir({ x: 0, y: 1 });
  else if (k === "ArrowLeft") setDir({ x: -1, y: 0 });
  else if (k === "ArrowRight") setDir({ x: 1, y: 0 });
}} />

<div class="sn">
  <div class="sn-head">
    <span>🐍 分数 {score}/{PERFECT_SCORE}</span>
    {#if !running && !over}
      <button class="sn-btn" onclick={start}>开始</button>
    {:else if over}
      <button class="sn-btn" onclick={restart}>再来一局</button>
    {/if}
  </div>
  <div class="sn-board">
    {#each Array.from({ length: ROWS }) as _, y}
      <div class="sn-row">
        {#each Array.from({ length: COLS }) as _, x}
          {@const isHead = snake[0]?.x === x && snake[0]?.y === y}
          {@const isBody = !isHead && snake.some((p) => p.x === x && p.y === y)}
          <div class="sn-cell" class:head={isHead} class:body={isBody} class:food={food.x === x && food.y === y}>
            {#if isHead}◉{:else if food.x === x && food.y === y}🍎{/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if over}
    <div class="sn-msg">
      {score >= PERFECT_SCORE ? "🎉 满分！20 个食物全部吃到！" : "💀 撞了……再试一次"}
    </div>
  {:else}
    <div class="sn-tip dim">方向键 / 下方按钮控制方向，吃到 {PERFECT_SCORE} 个食物即满分</div>
  {/if}
  <div class="sn-pad">
    <button class="sn-btn" onclick={() => setDir({ x: 0, y: -1 })}>↑</button>
    <div class="pad-row">
      <button class="sn-btn" onclick={() => setDir({ x: -1, y: 0 })}>←</button>
      <button class="sn-btn" onclick={() => setDir({ x: 0, y: 1 })}>↓</button>
      <button class="sn-btn" onclick={() => setDir({ x: 1, y: 0 })}>→</button>
    </div>
  </div>
</div>

<style>
  .sn {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .sn-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    font-weight: 700;
  }
  .sn-btn {
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.35);
    color: var(--accent, #ffd166);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    min-width: 32px;
  }
  .sn-board {
    background: #111a2a;
    border: 1px solid #2f3a52;
    border-radius: 8px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sn-row {
    display: grid;
    grid-template-columns: repeat(18, 1fr);
    gap: 1px;
  }
  .sn-cell {
    aspect-ratio: 1;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    line-height: 1;
  }
  .sn-cell.head {
    background: #7bd88f;
    color: #123;
    border-radius: 50%;
    font-size: 7px;
  }
  .sn-cell.body {
    background: #2f8f52;
    border-radius: 2px;
  }
  .sn-cell.food {
    background: transparent;
    font-size: 11px;
  }
  .sn-msg {
    font-size: 13px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
  }
  .sn-tip {
    font-size: 11px;
    text-align: center;
  }
  .sn-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .pad-row {
    display: flex;
    gap: 6px;
  }
</style>
