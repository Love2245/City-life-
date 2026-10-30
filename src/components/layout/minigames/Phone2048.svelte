<!-- v1.20 手机游戏：2048。合成出 2048 即「满分」 -->
<script lang="ts">
  import PhoneGameStage from "./PhoneGameStage.svelte";
  import { onMount } from "svelte";
  import { miniGameRandom } from "../../../lib/minigameRandom";
  import { playSound } from "../../../lib/audio";
  let { onPerfect = () => {}, paused = false }: { onPerfect?: (gameId: string) => void; paused?: boolean } = $props();
  const random = miniGameRandom();

  const SIZE = 4, WIN_TILE = 2048;
  let grid = $state<number[][]>([]);
  let score = $state(0);
  let over = $state(false);
  let won = $state(false);
  let perfectSent = false;

  function emptyGrid(): number[][] {
    return Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
  }

  function addTile(): void {
    const empty: Array<[number, number]> = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) empty.push([r, c]);
      }
    }
    if (empty.length === 0) return;
    const [r, c] = empty[Math.floor(random() * empty.length)];
    grid[r][c] = random() < 0.9 ? 2 : 4;
  }

  function reset(): void {
    grid = emptyGrid();
    score = 0;
    over = false;
    won = false;
    addTile();
    addTile();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (paused) return;
    const directions: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  /** 返回滑动后的行/列结果与得分增量 */
  function slideLine(line: number[]): { line: number[]; gain: number } {
    const arr = line.filter((v) => v !== 0);
    const out: number[] = [];
    let gain = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
        const merged = arr[i] * 2;
        out.push(merged);
        gain += merged;
        i++;
      } else {
        out.push(arr[i]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gain };
  }

  function move(dir: "up" | "down" | "left" | "right"): void {
    if (paused || over || won) return;
    const before = JSON.stringify(grid);
    let gain = 0;
    const ng = emptyGrid();
    for (let i = 0; i < SIZE; i++) {
      const col = dir === "left" || dir === "right" ? grid[i].slice() : [0, 1, 2, 3].map((r) => grid[r][i]);
      if (dir === "right") col.reverse();
      if (dir === "down") col.reverse();
      const r = slideLine(col);
      const out = dir === "right" || dir === "down" ? r.line.reverse() : r.line;
      gain += r.gain;
      for (let j = 0; j < SIZE; j++) {
        if (dir === "left" || dir === "right") ng[i][j] = out[j];
        else ng[j][i] = out[j];
      }
    }
    if (JSON.stringify(ng) === before) return; // 没动
    grid = ng;
    score += gain;
    if (gain > 0) playSound("coin");
    addTile();
    check();
  }

  function check(): void {
    if (grid.flat().includes(WIN_TILE)) {
      won = true;
      playSound("success");
      if (!perfectSent) {
        perfectSent = true;
        onPerfect("2048");
      }
      return;
    }
    if (grid.flat().includes(0)) return;
    // 是否有相邻可合并
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (r + 1 < SIZE && grid[r + 1][c] === v) return;
        if (c + 1 < SIZE && grid[r][c + 1] === v) return;
      }
    }
    over = true;
  }

  onMount(() => reset());
</script>

<svelte:window onkeydown={onKeydown} />

<div class="g2"><PhoneGameStage title="2048" description="相同数字合并，向2048前进。每次有效移动后会出现一个新数字。">
 {#snippet hud()}  <div class="g2-head">
    <span>🎯 分数 {score}</span>
    <button type="button" class="g2-btn" onclick={reset}>重新开始</button>
  </div>
{/snippet}
 {#snippet boardView()}  <div class="g2-board">
    {#each grid as row}
      <div class="g2-row">
        {#each row as v}
          <div class={`g2-cell tile-${Math.min(v, 2048)}`}>
            {v || ""}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/snippet}
 {#snippet feedback()}  {#if won}
    <div class="g2-msg ok">🎉 合成 2048，满分！</div>
  {:else if over}
    <div class="g2-msg bad">😵 没有空格了，再来一局？</div>
  {:else}
    <div class="g2-tip dim">方向键 / 屏幕按钮滑动，合成出 2048 即满分</div>
  {/if}
{/snippet}
 {#snippet controls()}  <div class="g2-pad">
    <button type="button" class="g2-btn" onclick={() => move("up")}>↑</button>
    <div class="g2-pad-row">
      <button type="button" class="g2-btn" onclick={() => move("left")}>←</button>
      <button type="button" class="g2-btn" onclick={() => move("down")}>↓</button>
      <button type="button" class="g2-btn" onclick={() => move("right")}>→</button>
    </div>
  </div>
{/snippet}
</PhoneGameStage></div>

<style>
.g2{height:100%;min-height:0}.g2-board{display:grid;grid-template-rows:repeat(4,minmax(0,1fr));gap:7px;padding:9px;border:2px solid #b0a07b;border-radius:16px;background:#857654;box-shadow:0 12px 28px #0004}.g2-board .g2-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;min-height:0}.g2-cell{display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;border-radius:9px;background:#c0b395;font-size:clamp(18px,10cqw,46px);font-weight:800;color:#4d483e;line-height:1;box-shadow:inset 0 2px #fff2}.g2-msg,.g2-tip{margin:0}  .g2-cell.tile-2 { background: #eee4da; }
  .g2-cell.tile-4 { background: #ede0c8; }
  .g2-cell.tile-8 { background: #f2b179; color: #f9f6f2; }
  .g2-cell.tile-16 { background: #f59563; color: #f9f6f2; }
  .g2-cell.tile-32 { background: #f67c5f; color: #f9f6f2; }
  .g2-cell.tile-64 { background: #f65e3b; color: #f9f6f2; }
  .g2-cell.tile-128 { background: #edcf72; color: #f9f6f2; }
  .g2-cell.tile-256 { background: #edcc61; color: #f9f6f2; }
  .g2-cell.tile-512 { background: #edc850; color: #f9f6f2; }
  .g2-cell.tile-1024 { background: #edc53f; color: #f9f6f2; font-size:clamp(16px,8cqw,36px); animation: tile-pop 0.2s ease; }
  .g2-cell.tile-2048 { background: #edc22e; color: #f9f6f2; font-size:clamp(16px,8cqw,36px); box-shadow: 0 0 14px rgba(237, 194, 46, 0.7); animation: tile-pop 0.25s ease; }
  @keyframes tile-pop {
    0% { transform: scale(0.85); }
    60% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }

</style>
