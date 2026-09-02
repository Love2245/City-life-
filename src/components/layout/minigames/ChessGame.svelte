<!--
  v1.215 公园「象棋大爷」：复用 game/core/xiangqi 纯逻辑引擎。
  玩家执红先行，将死对方即胜；大爷执黑，简单 AI（吃子优先 + 随机性 + 避亏）。
  胜 / 和 / 负结算奖励后回调 onFinish(得分比例)。
  UI：楚河汉界、选中金框、合法落点标记、被将军警示、落子动效。
-->
<script lang="ts">
  import { gameState } from "../../../stores/gameStore.svelte";
  import { applyEffects, pushLog } from "../../../game/engine";
  import { playSound } from "../../../lib/audio";
  import {
    initialBoard,
    legalMoves,
    movesOf,
    applyMove,
    isInCheck,
    type Board,
    type Move,
    type PieceType,
    type Side,
  } from "../../../game/core/xiangqi";

  let {
    cfg = {},
    onFinish = () => {},
  }: {
    cfg?: { winMoney?: number; drawMoney?: number; desc?: string };
    onFinish?: (ratio: number) => void;
  } = $props();

  // v1.215：棋种标识与引擎一致（象用 "e"，旧组件曾用 "b"）
  const PIECE_CHAR: Record<PieceType, [string, string]> = {
    k: ["帥", "將"],
    a: ["仕", "士"],
    e: ["相", "象"],
    n: ["馬", "馬"],
    r: ["車", "車"],
    c: ["炮", "炮"],
    p: ["兵", "卒"],
  };
  const VALUE: Record<PieceType, number> = { k: 10000, r: 9, c: 4.5, n: 4, e: 2, a: 2, p: 1 };

  let board = $state<Board>(initialBoard());
  let selected = $state<{ r: number; c: number } | null>(null);
  let legalTargets = $state<Array<{ r: number; c: number }>>([]);
  let turn = $state<Side>(0); // 红先行
  let finished = $state(false);
  let resultText = $state("");
  let aiThinking = $state(false);
  let lastMove = $state<Move | null>(null);
  let stats = $state({ win: 0, lose: 0, draw: 0 });

  const crossedRiver = (r: number, side: Side) => (side === 0 ? r <= 4 : r >= 5);

  // v1.215：将军警示（轮到谁走就警示谁的将）
  const redInCheck = $derived(!finished && turn === 0 && isInCheck(board, 0));
  const blackInCheck = $derived(!finished && turn === 1 && isInCheck(board, 1));

  function boardEval(b: Board): number {
    let score = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (!p) continue;
        let v = VALUE[p.type];
        if (p.type === "p" && crossedRiver(r, p.side)) v = 2;
        score += p.side === 1 ? v : -v;
      }
    }
    return score;
  }

  /** 简易 AI：黑方走棋。吃子优先 + 躲开白吃的亏，带随机性（让大爷不至于无敌） */
  function aiMove(): void {
    const moves = legalMoves(board, 1);
    if (moves.length === 0) {
      endGame(isInCheck(board, 1) ? "lose" : "draw");
      return;
    }
    let scored = moves.map((m) => {
      const nb = applyMove(board, m);
      let s = boardEval(nb) + Math.random() * 0.8;
      const target = board[m.to.r][m.to.c];
      if (target) s += target.side === 0 ? VALUE[target.type] * 2 : 0;
      // 轻微惩罚：落点会被红方免费吃掉
      const moved = nb[m.to.r][m.to.c];
      if (moved && moved.type !== "k") {
        const reds = allMovesRedAgainst(nb, m.to);
        if (reds && reds.value >= VALUE[moved.type]) s -= VALUE[moved.type] * 0.8;
      }
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    // 20% 随机一步，让大爷偶尔放水
    const pick = Math.random() < 0.2 ? moves[Math.floor(Math.random() * moves.length)] : scored[0].m;
    board = applyMove(board, pick);
    lastMove = pick;
    afterMove();
  }

  /** 红方能否在该位置立即吃到某黑子（粗略，用于 AI 避亏） */
  function allMovesRedAgainst(b: Board, pos: { r: number; c: number }): { value: number } | null {
    let best = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (!p || p.side !== 0) continue;
        for (const to of movesOf(b, r, c)) {
          if (to.r === pos.r && to.c === pos.c) best = Math.max(best, VALUE[p.type]);
        }
      }
    }
    return best > 0 ? { value: best } : null;
  }

  function afterMove(): void {
    if (finished) return;
    const mover = turn; // 刚走完的一方
    const opp: Side = mover === 0 ? 1 : 0;
    const oppLegal = legalMoves(board, opp);
    if (oppLegal.length === 0) {
      // 将死 → 走子方胜；逼和（无着可走但不被将）→ 和棋
      endGame(isInCheck(board, opp) ? (mover === 0 ? "win" : "lose") : "draw");
      return;
    }
    turn = opp;
    selected = null;
    legalTargets = [];
    if (turn === 1) {
      aiThinking = true;
      setTimeout(() => {
        aiThinking = false;
        aiMove();
      }, 450);
    }
  }

  function onCell(r: number, c: number): void {
    if (finished || turn !== 0 || aiThinking) return;
    const p = board[r][c];
    if (selected) {
      const target = legalTargets.find((t) => t.r === r && t.c === c);
      if (target) {
        board = applyMove(board, { from: selected, to: target });
        lastMove = { from: selected, to: target };
        afterMove();
        return;
      }
    }
    if (p && p.side === 0) {
      selected = { r, c };
      legalTargets = legalMoves(board, 0)
        .filter((m) => m.from.r === r && m.from.c === c)
        .map((m) => m.to);
    } else {
      selected = null;
      legalTargets = [];
    }
  }

  function endGame(result: "win" | "lose" | "draw"): void {
    if (finished) return;
    finished = true;
    stats[result]++;
    const winMoney = cfg.winMoney ?? 20;
    const drawMoney = cfg.drawMoney ?? 5;
    if (result === "win") {
      applyEffects(gameState, { money: winMoney, mood: 4 }, "♟️");
      pushLog(gameState, "♟️", `你赢了象棋大爷，彩头 +${winMoney} 元`);
      resultText = `将死了大爷的「將」！他笑着递来 ${winMoney} 元彩头`;
      playSound("success");
      onFinish(0.9);
    } else if (result === "draw") {
      applyEffects(gameState, { money: drawMoney, mood: 2 }, "♟️");
      pushLog(gameState, "♟️", `和象棋大爷下成和棋，彩头 +${drawMoney} 元`);
      resultText = `和棋！大爷说棋逢对手，塞给你 ${drawMoney} 元`;
      playSound("coin");
      onFinish(0.6);
    } else {
      applyEffects(gameState, { mood: 2 }, "♟️");
      pushLog(gameState, "♟️", "输给了象棋大爷，不过学到了几手");
      resultText = "你输了。大爷拍拍你的肩：小伙子，回去练练再来！";
      playSound("coin");
      onFinish(0.3);
    }
  }

  function restart(): void {
    board = initialBoard();
    selected = null;
    legalTargets = [];
    turn = 0;
    finished = false;
    resultText = "";
    aiThinking = false;
    lastMove = null;
  }
</script>

<div class="chess">
  <div class="c-head">
    <span class="c-status">
      {#if finished}
        {resultText}
      {:else if turn === 0}
        {redInCheck ? "⚠ 你被将军了！" : "轮到你走（红方）"}
      {:else}
        {aiThinking ? "大爷正在琢磨…" : "大爷走棋"}
      {/if}
    </span>
    <span class="c-stats">胜 {stats.win} / 和 {stats.draw} / 负 {stats.lose}</span>
  </div>

  <div class="board">
    {#each Array.from({ length: 10 }) as _, r}
      <div class="row" class:river={r === 4}>
        {#each Array.from({ length: 9 }) as _, c}
          {@const p = board[r][c]}
          {@const isSel = selected?.r === r && selected?.c === c}
          {@const isTarget = legalTargets.some((t) => t.r === r && t.c === c)}
          {@const isCheckKing = p?.type === "k" && ((p.side === 0 && redInCheck) || (p.side === 1 && blackInCheck))}
          {@const isLast = lastMove !== null && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))}
          <button
            class="cell"
            class:sel={isSel}
            class:target={isTarget}
            class:capture={isTarget && !!p}
            class:check-king={isCheckKing}
            class:last={isLast}
            class:has={!!p}
            class:red={p?.side === 0}
            class:black={p?.side === 1}
            onclick={() => onCell(r, c)}
          >
            {#if p}
              <span class="disc">{PIECE_CHAR[p.type][p.side]}</span>
            {:else if isTarget}
              <span class="dot" />
            {/if}
          </button>
        {/each}
      </div>
      {#if r === 4}
        <div class="river"><span>楚&nbsp;河</span><span>漢&nbsp;界</span></div>
      {/if}
    {/each}
  </div>

  <p class="c-tip dim">{cfg.desc ?? "点击选中棋子，再点击高亮格落子；将死对方的「將」即胜"}</p>
  <div class="c-actions">
    <button class="c-btn" onclick={restart}>重新开局</button>
  </div>
</div>

<style>
  .chess {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .c-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    font-weight: 700;
  }
  .c-status {
    color: var(--accent, #ffd166);
  }
  .c-stats {
    color: var(--text-dim, #9aa3c7);
    font-weight: 600;
  }
  .board {
    /* v1.33 P6：棋盘 9×10、棋子等方。宽度同时受容器与视口高度约束，
       避免全屏舞台下棋盘超高导致 .board 纵向被裁剪（只能看到半边棋盘）。 */
    width: min(100%, 640px, calc((100dvh - 240px) * 9 / 10));
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    border: 2px solid #8a6b3a;
    background:
      linear-gradient(rgba(138, 107, 58, 0.06) 1px, transparent 1px),
      #d9b878;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  }
  .row {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
  }
  .row.river {
    border-top: 2px dashed rgba(138, 107, 58, 0.55);
    border-bottom: 2px dashed rgba(138, 107, 58, 0.55);
  }
  .river {
    display: flex;
    justify-content: space-between;
    padding: 1px 8px;
    font-family: "KaiTi", "STKaiti", serif;
    font-size: 11px;
    font-weight: 700;
    color: rgba(90, 64, 26, 0.75);
    letter-spacing: 3px;
    line-height: 1;
  }
  .cell {
    position: relative;
    aspect-ratio: 1;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .cell:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  .disc {
    width: 78%;
    height: 78%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 800;
    line-height: 1;
    font-family: "KaiTi", "STKaiti", "SimSun", serif;
    background: radial-gradient(circle at 32% 28%, #fdf0d0, #e7c889 60%, #c9a45f);
    color: #3a2c14;
    box-shadow: 0 2px 4px rgba(60, 40, 10, 0.35);
  }
  .cell.red .disc {
    color: #b01818;
  }
  .cell.black .disc {
    color: #1f1f1f;
  }
  .cell.sel .disc {
    outline: 3px solid rgba(255, 209, 102, 0.9);
    outline-offset: 1px;
    transform: scale(1.08);
    box-shadow: 0 0 10px rgba(255, 209, 102, 0.7);
  }
  .cell.target {
    background: rgba(93, 200, 120, 0.16);
  }
  .cell.capture .disc {
    outline: 2px solid rgba(220, 80, 80, 0.85);
    outline-offset: 0;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgba(46, 96, 54, 0.85);
    box-shadow: 0 0 4px rgba(46, 96, 54, 0.5);
  }
  .cell.check-king .disc {
    animation: danger-pulse 0.9s ease-in-out infinite;
    outline: 3px solid rgba(220, 50, 50, 0.95);
  }
  .cell.last .disc {
    animation: pop 0.28s ease;
  }
  @keyframes danger-pulse {
    0%, 100% { box-shadow: 0 0 4px rgba(220, 50, 50, 0.4); }
    50% { box-shadow: 0 0 14px rgba(220, 50, 50, 0.95); }
  }
  @keyframes pop {
    0% { transform: scale(1); }
    50% { transform: scale(1.22); }
    100% { transform: scale(1); }
  }
  .c-tip {
    font-size: 11.5px;
    line-height: 1.5;
    margin: 0;
  }
  .c-actions {
    display: flex;
    gap: 8px;
  }
  .c-btn {
    padding: 7px 16px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.14);
    border: 1px solid rgba(255, 209, 102, 0.4);
    color: var(--accent, #ffd166);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.18s ease, transform 0.15s ease;
  }
  .c-btn:hover {
    background: rgba(255, 209, 102, 0.24);
    transform: translateY(-1px);
  }
</style>
