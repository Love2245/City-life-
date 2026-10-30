<!--
  v1.215 手机游戏：推箱子（复用 game/core/sokoban 纯逻辑引擎）。
  引擎修复了 v1.20 第 1 关死局（#o@.# → #@o.#），关卡经 BFS 校验全部可解。
  通关全部关卡即「满分」。
-->
<script lang="ts">
  import PhoneGameStage from "./PhoneGameStage.svelte";
  import { playSound } from "../../../lib/audio";
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

  let { onPerfect = () => {}, paused = false }: { onPerfect?: (gameId: string) => void; paused?: boolean } = $props();

  let levelIdx = $state(0);
  let level = $state<SokobanState>(parseLevel(LEVELS[0]));
  let moves = $state(0);
  let message = $state("");
  let perfectSent = false;

  function move(dx: number, dy: number): void {
    if (paused || message.includes("通关")) return;
    const r = moveState(level, dx, dy);
    if (!r.moved) return;
    level = r.state;
    moves++;
    if (isWin(level)) {
      playSound("success");
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

  function onKeydown(event: KeyboardEvent): void {
    if (paused) return;
    const directions: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    move(...direction);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sk"><PhoneGameStage title="推箱子" description="把所有箱子推到圆形目标点。箱子只能推动，留意墙角与身后的空间。">
 {#snippet hud()}  <div class="sk-head">
    <span>📦 第 {levelIdx + 1}/{LEVELS.length} 关</span>
    <span>步数 {moves}</span>
    <button type="button" class="sk-btn" onclick={restartLevel}>重开本关</button>
  </div>
{/snippet}
 {#snippet boardView()}  <div class="sk-board" style={`--sk-cols:${level.grid[0].length};--sk-rows:${level.grid.length};grid-template-columns:repeat(${level.grid[0].length},minmax(0,1fr))`}>
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
{/snippet}
 {#snippet feedback()}  <div class="sk-msg" class:sk-msg-empty={!message} aria-hidden={!message}>{message}</div>
{/snippet}
 {#snippet controls()}  <div class="sk-pad">
    <button type="button" class="sk-btn" onclick={() => move(0, -1)}>↑</button>
    <div class="sk-row">
      <button type="button" class="sk-btn" onclick={() => move(-1, 0)}>←</button>
      <button type="button" class="sk-btn" onclick={() => move(0, 1)}>↓</button>
      <button type="button" class="sk-btn" onclick={() => move(1, 0)}>→</button>
    </div>
  </div>
{/snippet}
</PhoneGameStage></div>

<style>
.sk{height:100%;min-height:0}.sk-board{display:grid;grid-template-rows:repeat(var(--sk-rows),minmax(0,1fr));gap:3px;padding:9px;border:3px solid #8b9d8b;border-radius:15px;background:#142b34;box-shadow:0 12px 28px #0004;width:min(100cqw,calc(100cqh * var(--sk-cols) / var(--sk-rows)),600px)!important;aspect-ratio:var(--sk-cols) / var(--sk-rows)!important}.sk-cell{display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;font-size:clamp(18px,7cqw,42px);color:#9aafae;border-radius:6px;background:#aac1af10}.sk-cell.goal{background:#ecc77725;box-shadow:inset 0 0 0 2px #d4b37666;color:#f5d68e}.sk-cell.box{background:linear-gradient(135deg,#c69a64,#856040);box-shadow:inset 0 0 0 3px #dfbf8d55,0 3px 5px #0004}.sk-cell.box.goal{background:#537e62;box-shadow:inset 0 0 0 3px #abdd9a}.sk-cell.player{background:#91c5b838;border-radius:40%}.sk-msg{font-size:13px;font-weight:700;color:#9cdda6;min-height:20px}.sk-msg-empty{visibility:hidden}
</style>
