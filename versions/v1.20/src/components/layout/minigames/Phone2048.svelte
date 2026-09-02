<!-- v1.20 手机游戏：2048。合成出 2048 即「满分」 -->
<script lang="ts">
  let { onPerfect = () => {} }: { onPerfect?: (gameId: string) => void } = $props();

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
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function reset(): void {
    grid = emptyGrid();
    score = 0;
    over = false;
    won = false;
    addTile();
    addTile();
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
    if (over || won) return;
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
    addTile();
    check();
  }

  function check(): void {
    if (grid.flat().includes(WIN_TILE)) {
      won = true;
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
</script>

<svelte:window onkeydown={(e) => {
  const k = e.key;
  if (k === "ArrowUp") move("up");
  else if (k === "ArrowDown") move("down");
  else if (k === "ArrowLeft") move("left");
  else if (k === "ArrowRight") move("right");
}} />

<div class="g2">
  <div class="g2-head">
    <span>🎯 分数 {score}</span>
    <button class="g2-btn" onclick={reset}>重新开始</button>
  </div>
  <div class="g2-board">
    {#each grid as row, r}
      <div class="g2-row">
        {#each row as v, c}
          <div class={`g2-cell tile-${Math.min(v, 2048)}`}>
            {v || ""}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if won}
    <div class="g2-msg ok">🎉 合成 2048，满分！</div>
  {:else if over}
    <div class="g2-msg bad">😵 没有空格了，再来一局？</div>
  {:else}
    <div class="g2-tip dim">方向键 / 下方按钮滑动，合成出 2048 即满分</div>
  {/if}
  <div class="g2-pad">
    <button class="g2-btn" onclick={() => move("up")}>↑</button>
    <div class="g2-pad-row">
      <button class="g2-btn" onclick={() => move("left")}>←</button>
      <button class="g2-btn" onclick={() => move("down")}>↓</button>
      <button class="g2-btn" onclick={() => move("right")}>→</button>
    </div>
  </div>
</div>

<style>
  .g2 {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .g2-head {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    font-weight: 700;
  }
  .g2-btn {
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
  .g2-board {
    background: #b78e5e;
    border-radius: 10px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 280px;
  }
  .g2-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .g2-cell {
    aspect-ratio: 1;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 800;
    color: #5a3d1e;
  }
  .g2-cell.tile-2 { background: #eee4da; }
  .g2-cell.tile-4 { background: #ede0c8; }
  .g2-cell.tile-8 { background: #f2b179; color: #f9f6f2; }
  .g2-cell.tile-16 { background: #f59563; color: #f9f6f2; }
  .g2-cell.tile-32 { background: #f67c5f; color: #f9f6f2; }
  .g2-cell.tile-64 { background: #f65e3b; color: #f9f6f2; }
  .g2-cell.tile-128 { background: #edcf72; color: #f9f6f2; }
  .g2-cell.tile-256 { background: #edcc61; color: #f9f6f2; }
  .g2-cell.tile-512 { background: #edc850; color: #f9f6f2; }
  .g2-cell.tile-1024 { background: #edc53f; color: #f9f6f2; font-size: 16px; }
  .g2-cell.tile-2048 { background: #edc22e; color: #f9f6f2; font-size: 16px; box-shadow: 0 0 12px rgba(237, 194, 46, 0.6); }
  .g2-msg { font-size: 13px; font-weight: 800; }
  .g2-msg.ok { color: var(--ok, #7bd88f); }
  .g2-msg.bad { color: var(--danger, #ff6b6b); }
  .g2-tip { font-size: 11px; text-align: center; }
  .g2-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .g2-pad-row {
    display: flex;
    gap: 6px;
  }
</style>
