<!-- v1.20 手机游戏：扫雷（9×9 / 10 雷）。全部非雷格翻开即「满分」 -->
<script lang="ts">
  let { onPerfect = () => {} }: { onPerfect?: (gameId: string) => void } = $props();

  const ROWS = 9, COLS = 9, MINES = 10;
  interface Cell {
    mine: boolean;
    revealed: boolean;
    flagged: boolean;
    near: number;
  }

  function newBoard(seedR: number, seedC: number): Cell[][] {
    const cells: Cell[][] = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => ({ mine: false, revealed: false, flagged: false, near: 0 })),
    );
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if ((r === seedR && c === seedC) || cells[r][c].mine) continue;
      cells[r][c].mine = true;
      placed++;
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (cells[r][c].mine) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && cells[nr][nc].mine) n++;
          }
        }
        cells[r][c].near = n;
      }
    }
    return cells;
  }

  let board = $state<Cell[][]>(newBoard(-1, -1));
  let over = $state<"play" | "win" | "lose">("play");
  let flagMode = $state(false);
  let seconds = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let perfectSent = false;

  function startTimer(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (over === "play") seconds++;
    }, 1000);
  }

  function reveal(r: number, c: number): void {
    if (over !== "play") return;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;
    startTimer();
    cell.revealed = true;
    if (cell.mine) {
      over = "lose";
      return;
    }
    if (cell.near === 0) {
      const stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const t = board[nr][nc];
            if (t.revealed || t.flagged || t.mine) continue;
            t.revealed = true;
            if (t.near === 0) stack.push([nr, nc]);
          }
        }
      }
    }
    checkWin();
  }

  function checkWin(): void {
    const revealed = board.flat().filter((c) => c.revealed).length;
    if (revealed === ROWS * COLS - MINES) {
      over = "win";
      stopTimer();
      if (!perfectSent) {
        perfectSent = true;
        onPerfect("minesweeper");
      }
    }
  }

  function toggleFlag(r: number, c: number): void {
    if (over !== "play") return;
    const cell = board[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
  }

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function restart(): void {
    board = newBoard(-1, -1);
    over = "play";
    seconds = 0;
    perfectSent = false;
    stopTimer();
  }
</script>

<div class="ms">
  <div class="ms-head">
    <span>💣 {board.flat().filter((c) => c.flagged).length}/{MINES}</span>
    <span class="ms-time">⏱ {seconds}s</span>
    <button class="ms-btn" class:on={flagMode} onclick={() => (flagMode = !flagMode)}>🚩 插旗</button>
  </div>
  <div class="ms-board">
    {#each board as row, r}
      <div class="ms-row">
        {#each row as cell, c}
          <button
            class="ms-cell"
            class:revealed={cell.revealed}
            class:mine={cell.revealed && cell.mine}
            class:boom={over === "lose" && cell.mine && cell.revealed}
            onclick={() => (flagMode ? toggleFlag(r, c) : reveal(r, c))}
            oncontextmenu={(e) => { e.preventDefault(); toggleFlag(r, c); }}
          >
            {#if cell.revealed && cell.mine}
              💣
            {:else if cell.revealed && cell.near > 0}
              {cell.near}
            {:else if cell.flagged}
              🚩
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
  <div class="ms-foot">
    {#if over === "win"}
      <span class="ms-ok">🎉 满分通关！用时 {seconds}s</span>
    {:else if over === "lose"}
      <span class="ms-bad">💥 踩雷了，再来一局？</span>
    {:else}
      <span class="dim">翻开所有非雷格即满分（支持右键/插旗模式标雷）</span>
    {/if}
    <button class="ms-btn" onclick={restart}>重新开始</button>
  </div>
</div>

<style>
  .ms {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ms-head, .ms-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    font-weight: 700;
  }
  .ms-head {
    justify-content: space-between;
  }
  .ms-time {
    font-variant-numeric: tabular-nums;
  }
  .ms-btn {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.35);
    color: var(--accent, #ffd166);
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .ms-btn.on {
    background: rgba(255, 209, 102, 0.3);
  }
  .ms-board {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: #232b3d;
    border: 1px solid #2f3a52;
    border-radius: 8px;
    padding: 4px;
  }
  .ms-row {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 2px;
  }
  .ms-cell {
    aspect-ratio: 1;
    border: none;
    border-radius: 3px;
    background: #3a4a6b;
    color: #dce6ff;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .ms-cell.revealed {
    background: #1a2131;
    color: #8fd0ff;
  }
  .ms-cell.mine {
    background: #4a1d2a;
  }
  .ms-ok {
    color: var(--ok, #7bd88f);
  }
  .ms-bad {
    color: var(--danger, #ff6b6b);
  }
</style>
