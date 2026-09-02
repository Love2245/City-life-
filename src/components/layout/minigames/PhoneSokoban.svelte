<!--
  v1.215 手机游戏：推箱子（复用 game/core/sokoban 纯逻辑引擎）。
  引擎修复了 v1.20 第 1 关死局（#o@.# → #@o.#），关卡经 BFS 校验全部可解。
  通关全部关卡即「满分」。
-->
<script lang="ts">
  import {
    LEVELS,
    parseLevel,
    moveState,
    isWin,
    cellChar,
    BOX,
    PLAYER,
    WALL,
  } from "../../../game/core/sokoban";
  import type { SokobanState } from "../../../game/core/sokoban";

  let { onPerfect = () => {} }: { onPerfect?: (gameId: string) => void } = $props();

  let levelIdx = $state(0);
  let level = $state<SokobanState>(parseLevel(LEVELS[0]));
  let moves = $state(0);
  let message = $state("");
  let perfectSent = false;

  function move(dx: number, dy: number): void {
    if (message.includes("通关")) return;
    const r = moveState(level, dx, dy);
    if (!r.moved) return;
    level = r.state;
    moves++;
    if (isWin(level)) {
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
    {#each Array.from({ length: level.grid.length }) as _, y}
      {#each Array.from({ length: level.grid[0].length }) as _, x}
        {@const isGoal = level.goals.has(`${x},${y}`)}
        {@const ch = cellChar(level, x, y)}
        <div
          class="sk-cell"
          class:goal={isGoal}
          class:box={ch === BOX}
          class:player={ch === PLAYER}
        >
          {ch === WALL ? "▧" : ch === BOX ? "📦" : ch === PLAYER ? "🧍" : isGoal ? "○" : ""}
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
    transition: background 0.18s ease, transform 0.15s ease;
  }
  .sk-btn:hover {
    background: rgba(255, 209, 102, 0.24);
    transform: translateY(-1px);
  }
  .sk-board {
    display: grid;
    gap: 2px;
    background: #1d2434;
    border: 1px solid #2f3a52;
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  }
  .sk-cell {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #c8d4f0;
    border-radius: 4px;
    transition: background 0.15s ease;
  }
  .sk-cell.goal {
    background: rgba(108, 198, 255, 0.15);
    box-shadow: inset 0 0 0 1px rgba(108, 198, 255, 0.35);
  }
  .sk-cell.box {
    background: rgba(255, 209, 102, 0.18);
    border-radius: 6px;
  }
  .sk-cell.box.goal {
    background: rgba(123, 216, 143, 0.22);
    box-shadow: inset 0 0 0 1px rgba(123, 216, 143, 0.5);
  }
  .sk-cell.player {
    border-radius: 50%;
  }
  .sk-msg {
    font-size: 13px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
    animation: msg-in 0.3s ease;
  }
  @keyframes msg-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
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
