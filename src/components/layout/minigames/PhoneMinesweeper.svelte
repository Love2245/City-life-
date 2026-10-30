<!-- v1.20 手机游戏：扫雷（9×9 / 10 雷）。全部非雷格翻开即「满分」 -->
<script lang="ts">
  import PhoneGameStage from "./PhoneGameStage.svelte";
  import { onDestroy } from "svelte";
  import { miniGameRandom } from "../../../lib/minigameRandom";
  import { playSound } from "../../../lib/audio";
  let { onPerfect = () => {}, paused = false }: { onPerfect?: (gameId: string) => void; paused?: boolean } = $props();
  const random = miniGameRandom();

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
      const r = Math.floor(random() * ROWS);
      const c = Math.floor(random() * COLS);
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
  let hasStarted = $state(false);

  $effect(() => {
    if (paused) {
      stopTimer();
    } else if (hasStarted && over === "play") {
      startTimer();
    }
  });

  function startTimer(): void {
    if (paused || timer) return;
    timer = setInterval(() => {
      if (over === "play") seconds++;
    }, 1000);
  }

  function reveal(r: number, c: number): void {
    if (over !== "play") return;
    if (board[r][c].revealed || board[r][c].flagged) return;
    // Preserve the classic first-click guarantee. The seed arguments on
    // newBoard keep the first revealed cell clear while the rest stays random.
    if (!hasStarted) {
      board = newBoard(r, c);
      hasStarted = true;
    }
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;
    startTimer();
    cell.revealed = true;
    if (cell.mine) {
      over = "lose";
      stopTimer();
      playSound("error");
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
      playSound("success");
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
    hasStarted = false;
    stopTimer();
  }

  onDestroy(stopTimer);
</script>

<div class="ms"><PhoneGameStage title="扫雷" description="翻开所有非雷格。首步安全，右键或切换插旗模式来标记可疑位置。">
 {#snippet hud()}  <div class="ms-head">
    <span>💣 {board.flat().filter((c) => c.flagged).length}/{MINES}</span>
    <span class="ms-time">⏱ {seconds}s</span>
    <button type="button" class="ms-btn" class:on={flagMode} aria-pressed={flagMode} onclick={() => (flagMode = !flagMode)}>🚩 插旗</button>
  </div>
{/snippet}
 {#snippet boardView()}  <div class="ms-board">
    {#each board as row, r}
      <div class="ms-row">
        {#each row as cell, c}
          <button
            type="button"
            class="ms-cell" aria-label={`第${r+1}行第${c+1}列${cell.flagged?"，已插旗":cell.revealed?"，已翻开":""}`}
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
{/snippet}
 {#snippet feedback()}  <div class="ms-foot">
    {#if over === "win"}
      <span class="ms-ok">🎉 满分通关！用时 {seconds}s</span>
    {:else if over === "lose"}
      <span class="ms-bad">💥 踩雷了，再来一局？</span>
    {:else}
      <span class="dim">翻开所有非雷格即满分（支持右键/插旗模式标雷）</span>
    {/if}

  </div>
{/snippet}
 {#snippet controls()}<button type="button" class="ms-btn" onclick={restart}>重新开始</button>{/snippet}
</PhoneGameStage></div>
<style>
.ms{height:100%;min-height:0}.ms-board{display:grid;grid-template-rows:repeat(9,minmax(0,1fr));gap:3px;padding:7px;border:3px solid #849c8e;border-radius:15px;background:#17313a;box-shadow:0 12px 28px #0004}.ms-row{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:3px;min-height:0}.ms-cell{min-width:0;min-height:0;width:100%;padding:0;border:1px solid #b0cbb455;border-radius:5px;background:linear-gradient(145deg,#6a9383,#486d67);color:#183830;font:800 clamp(12px,5cqw,29px)/1 system-ui;cursor:pointer;box-shadow:inset 0 2px #bfd9bd33,0 2px #0e242a}.ms-cell.revealed{background:#b7c6af;border-color:#93a58b;box-shadow:inset 0 1px 3px #1e3b2922;color:#214e67}.ms-cell.mine{background:#875b54;color:white}.ms-cell.boom{background:#bc705e}.ms-foot{display:flex;align-items:center;justify-content:center;min-height:22px}.ms-time{font-variant-numeric:tabular-nums}.ms-ok{color:#9cdda6}.ms-bad{color:#ffb7a4}
</style>
