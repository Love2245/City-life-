<!-- v1.20 手机游戏：推箱子。通关全部关卡即「满分」 -->
<script lang="ts">
  let { onPerfect = () => {} }: { onPerfect?: (gameId: string) => void } = $props();

  const LEVELS: string[][] = [
    [
      "#####",
      "#   #",
      "#o@.#",
      "#   #",
      "#####",
    ],
    [
      "######",
      "#    #",
      "# @  #",
      "#o o #",
      "#. . #",
      "######",
    ],
    [
      "########",
      "#      #",
      "# oo   #",
      "#  @   #",
      "# ..   #",
      "########",
    ],
    [
      "#########",
      "#       #",
      "# o o o #",
      "# @     #",
      "# . . . #",
      "#########",
    ],
  ];

  const EMPTY = " ", WALL = "#", BOX = "o", GOAL = ".", PLAYER = "@", BOX_ON = "*", PLAYER_ON = "+";

  function parseLevel(level: string[]): {
    grid: string[][];
    px: number;
    py: number;
    goals: Array<[number, number]>;
  } {
    const grid = level.map((row) => row.split(""));
    let px = 0, py = 0;
    const goals: Array<[number, number]> = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const ch = grid[y][x];
        if (ch === PLAYER || ch === PLAYER_ON) {
          px = x; py = y;
          if (ch === PLAYER_ON) goals.push([x, y]);
        } else if (ch === GOAL || ch === BOX_ON) {
          goals.push([x, y]);
          if (ch === BOX_ON) grid[y][x] = BOX;
        }
        if (ch === PLAYER) grid[y][x] = EMPTY;
        if (ch === PLAYER_ON) grid[y][x] = GOAL;
      }
    }
    return { grid, px, py, goals };
  }

  let levelIdx = $state(0);
  let level = $state(parseLevel(LEVELS[0]));
  let moves = $state(0);
  let message = $state("");
  let perfectSent = false;

  function cellAt(x: number, y: number): string {
    return level.grid[y]?.[x] ?? WALL;
  }

  function isWin(): boolean {
    return level.goals.every(([x, y]) => cellAt(x, y) === BOX);
  }

  function move(dx: number, dy: number): void {
    if (message.includes("通关")) return;
    const nx = level.px + dx, ny = level.py + dy;
    const target = cellAt(nx, ny);
    if (target === WALL) return;
    if (target === BOX) {
      const bx = nx + dx, by = ny + dy;
      const beyond = cellAt(bx, by);
      if (beyond === WALL || beyond === BOX) return;
      level.grid[by][bx] = BOX;
      level.grid[ny][nx] = EMPTY;
    }
    level.grid[level.py][level.px] = EMPTY;
    level.px = nx;
    level.py = ny;
    level.grid[ny][nx] = PLAYER;
    moves++;
    if (isWin()) {
      if (levelIdx < LEVELS.length - 1) {
        levelIdx++;
        level = parseLevel(LEVELS[levelIdx]);
        moves = 0;
        message = `第 ${levelIdx + 1} 关！继续加油`;
      } else {
        message = "🎉 全部通关，满分！";
        if (!perfectSent) {
          perfectSent = true;
          onPerfect("sokoban");
        }
      }
    }
  }

  function restartLevel(): void {
    level = parseLevel(LEVELS[levelIdx]);
    moves = 0;
    message = "";
  }
</script>

<svelte:window onkeydown={(e) => {
  const k = e.key;
  if (k === "ArrowUp") move(0, -1);
  else if (k === "ArrowDown") move(0, 1);
  else if (k === "ArrowLeft") move(-1, 0);
  else if (k === "ArrowRight") move(1, 0);
}} />

<div class="sk">
  <div class="sk-head">
    <span>📦 第 {levelIdx + 1}/{LEVELS.length} 关</span>
    <span>步数 {moves}</span>
    <button class="sk-btn" onclick={restartLevel}>重开本关</button>
  </div>
  <div class="sk-board" style="grid-template-columns: repeat({level.grid[0].length}, 1fr);">
    {#each level.grid as row, y}
      {#each row as ch, x}
        <div class="sk-cell" class:goal={ch === GOAL} class:box={ch === BOX} class:player={ch === PLAYER}>
          {ch === WALL ? "▧" : ch === BOX ? "📦" : ch === GOAL ? "○" : ch === PLAYER ? "🧍" : ""}
        </div>
      {/each}
    {/each}
  </div>
  {#if message}<div class="sk-msg">{message}</div>{/if}
  <div class="sk-pad">
    <button class="sk-btn" onclick={() => move(0, -1)}>↑</button>
    <div class="sk-row">
      <button class="sk-btn" onclick={() => move(-1, 0)}>←</button>
      <button class="sk-btn" onclick={() => move(0, 1)}>↓</button>
      <button class="sk-btn" onclick={() => move(1, 0)}>→</button>
    </div>
  </div>
</div>

<style>
  .sk {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .sk-head {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12.5px;
    font-weight: 700;
    width: 100%;
    justify-content: space-between;
  }
  .sk-btn {
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.35);
    color: var(--accent, #ffd166);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    min-width: 34px;
  }
  .sk-board {
    display: grid;
    gap: 2px;
    background: #1d2434;
    border: 1px solid #2f3a52;
    border-radius: 8px;
    padding: 6px;
  }
  .sk-cell {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #c8d4f0;
    border-radius: 3px;
  }
  .sk-cell.goal {
    background: rgba(108, 198, 255, 0.15);
  }
  .sk-cell.box {
    background: rgba(255, 209, 102, 0.18);
    border-radius: 5px;
  }
  .sk-cell.player {
    background: rgba(123, 216, 143, 0.22);
    border-radius: 50%;
  }
  .sk-msg {
    font-size: 13px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
  }
  .sk-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .sk-row {
    display: flex;
    gap: 6px;
  }
</style>
