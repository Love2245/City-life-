<!-- v1.20 手机游戏：贪吃蛇。吃到 20 个食物即「满分」 -->
<script lang="ts">
  import PhoneGameStage from "./PhoneGameStage.svelte";
  import { onDestroy } from "svelte";
  import { miniGameRandom } from "../../../lib/minigameRandom";
  import { playSound } from "../../../lib/audio";
  let { onPerfect = () => {}, paused = false }: { onPerfect?: (gameId: string) => void; paused?: boolean } = $props();
  const random = miniGameRandom();

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

  $effect(() => {
    if (paused || !running || over) return;
    timer = setInterval(tick, 140);
    return () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
  });

  function spawnFood(): void {
    const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
    const free: Pt[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    food = free[Math.floor(random() * free.length)] ?? { x: 0, y: 0 };
  }

  function tick(): void {
    if (over) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      endGame();
      return;
    }
    const growing = head.x === food.x && head.y === food.y;
    const collisionBody = growing ? snake : snake.slice(0, -1);
    if (collisionBody.some((p) => p.x === head.x && p.y === head.y)) {
      endGame();
      return;
    }
    snake = [head, ...snake];
    if (head.x === food.x && head.y === food.y) {
      score++;
      playSound("coin");
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
  }

  function endGame(): void {
    over = true;
    running = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (score >= PERFECT_SCORE) playSound("success"); else playSound("error");
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

  function onKeydown(event: KeyboardEvent): void {
    const directions: Record<string, Pt> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    setDir(direction);
  }

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sn"><PhoneGameStage title="贪吃蛇" description="吃到20个食物即可满分。避开边界与自己的身体，先选方向再出发。">
 {#snippet hud()}  <div class="sn-head">
    <span>🐍 分数 {score}/{PERFECT_SCORE}</span>
    {#if !running && !over}
      <button type="button" class="sn-btn" onclick={start}>开始</button>
    {:else if over}
      <button type="button" class="sn-btn" onclick={restart}>再来一局</button>
    {/if}
  </div>
{/snippet}
 {#snippet boardView()}  <div class="sn-board">
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
{/snippet}
 {#snippet feedback()}  {#if over}
    <div class="sn-msg">
      {score >= PERFECT_SCORE ? "🎉 满分！20 个食物全部吃到！" : "💀 撞了……再试一次"}
    </div>
  {:else}
    <div class="sn-tip dim">方向键 / 屏幕按钮控制方向，吃到 {PERFECT_SCORE} 个食物即满分</div>
  {/if}
{/snippet}
 {#snippet controls()}  <div class="sn-pad">
    <button type="button" class="sn-btn" onclick={() => setDir({ x: 0, y: -1 })}>↑</button>
    <div class="pad-row">
      <button type="button" class="sn-btn" onclick={() => setDir({ x: -1, y: 0 })}>←</button>
      <button type="button" class="sn-btn" onclick={() => setDir({ x: 0, y: 1 })}>↓</button>
      <button type="button" class="sn-btn" onclick={() => setDir({ x: 1, y: 0 })}>→</button>
    </div>
  </div>
{/snippet}
</PhoneGameStage></div>

<style>
.sn{height:100%;min-height:0}.sn-board{display:grid;grid-template-rows:repeat(14,minmax(0,1fr));width:min(100cqw,calc(100cqh * 18 / 14),660px)!important;aspect-ratio:18 / 14!important;padding:8px;gap:1px;border:3px solid #648c7d;border-radius:15px;background:#102932;box-shadow:0 12px 28px #0004}.sn-row{display:grid;grid-template-columns:repeat(18,minmax(0,1fr));gap:1px;min-height:0}.sn-cell{display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;line-height:1;border-radius:3px;background:#a5bfab0b}.sn-cell.head{background:#c2ef9e;border-radius:35%;color:#234737;font-size:clamp(7px,3.2cqw,19px)}.sn-cell.body{background:#79bd90;box-shadow:inset 0 1px #d3f4cb55}.sn-cell.food{font-size:clamp(9px,4cqw,23px)}.sn-msg,.sn-tip{margin:0;min-height:24px}.sn-head{min-height:44px}
</style>
