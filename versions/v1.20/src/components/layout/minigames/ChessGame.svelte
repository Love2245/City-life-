<!--
  v1.20 公园「象棋大爷」：内置简易中国象棋。
  玩家执红先行，吃光对方的「将」即胜；大爷执黑，简单 AI（吃子优先 + 随机性）。
  胜 / 和 / 负结算奖励后回调 onFinish(得分比例)。
-->
<script lang="ts">
  import { gameState } from "../../../stores/gameStore.svelte";
  import { applyEffects, pushLog } from "../../../game/engine";
  import { playSound } from "../../../lib/audio";

  type Side = 0 | 1; // 0=红 1=黑
  type PieceType = "k" | "a" | "b" | "n" | "r" | "c" | "p";
  interface Piece {
    type: PieceType;
    side: Side;
  }
  type Board = (Piece | null)[][]; // [row][col]  row0=黑方底线

  let {
    cfg = {},
    onFinish = () => {},
  }: {
    cfg?: { winMoney?: number; drawMoney?: number; desc?: string };
    onFinish?: (ratio: number) => void;
  } = $props();

  const PIECE_CHAR: Record<PieceType, [string, string]> = {
    k: ["帥", "將"],
    a: ["仕", "士"],
    b: ["相", "象"],
    n: ["馬", "馬"],
    r: ["車", "車"],
    c: ["炮", "炮"],
    p: ["兵", "卒"],
  };
  const VALUE: Record<PieceType, number> = { k: 10000, r: 9, c: 4.5, n: 4, b: 2, a: 2, p: 1 };

  function initialBoard(): Board {
    const b: Board = Array.from({ length: 10 }, () => Array<Piece | null>(9).fill(null));
    const back: PieceType[] = ["r", "n", "b", "a", "k", "a", "b", "n", "r"];
    for (let c = 0; c < 9; c++) {
      b[0][c] = { type: back[c], side: 1 };
      b[9][c] = { type: back[c], side: 0 };
    }
    b[2][1] = { type: "c", side: 1 };
    b[2][7] = { type: "c", side: 1 };
    b[7][1] = { type: "c", side: 0 };
    b[7][7] = { type: "c", side: 0 };
    for (const c of [0, 2, 4, 6, 8]) {
      b[3][c] = { type: "p", side: 1 };
      b[6][c] = { type: "p", side: 0 };
    }
    return b;
  }

  let board = $state<Board>(initialBoard());
  let selected = $state<{ r: number; c: number } | null>(null);
  let legalTargets = $state<Array<{ r: number; c: number }>>([]);
  let turn = $state<Side>(0); // 红先行
  let finished = $state(false);
  let resultText = $state("");
  let aiThinking = $state(false);
  let stats = $state({ win: 0, lose: 0, draw: 0 });

  const inBoard = (r: number, c: number) => r >= 0 && r < 10 && c >= 0 && c < 9;
  const pieceAt = (r: number, c: number) => (inBoard(r, c) ? board[r][c] : null);

  function inPalace(r: number, c: number, side: Side): boolean {
    if (c < 3 || c > 5) return false;
    return side === 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
  }
  function crossedRiver(r: number, side: Side): boolean {
    return side === 0 ? r <= 4 : r >= 5;
  }

  /** 计算某方某子的合法走法（不含将军规则，简单版：吃掉对方将即胜） */
  function movesOf(board: Board, r: number, c: number): Array<{ r: number; c: number }> {
    const p = board[r][c];
    if (!p) return [];
    const out: Array<{ r: number; c: number }> = [];
    const add = (nr: number, nc: number) => {
      if (!inBoard(nr, nc)) return;
      const t = board[nr][nc];
      if (t && t.side === p.side) return;
      out.push({ r: nr, c: nc });
    };
    const walk = (dr: number, dc: number, max = 9) => {
      for (let i = 1; i <= max; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (!inBoard(nr, nc)) break;
        const t = board[nr][nc];
        if (t) {
          if (t.side !== p.side) out.push({ r: nr, c: nc });
          break;
        }
        out.push({ r: nr, c: nc });
      }
    };
    switch (p.type) {
      case "k":
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (inPalace(nr, nc, p.side)) add(nr, nc);
        }
        break;
      case "a":
        for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (inPalace(nr, nc, p.side)) add(nr, nc);
        }
        break;
      case "b":
        for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const nr = r + dr, nc = c + dc;
          if (!inBoard(nr, nc)) continue;
          if (p.side === 0 ? nr < 5 : nr > 4) continue; // 不过河
          if (board[r + dr / 2][c + dc / 2]) continue; // 象眼被堵
          add(nr, nc);
        }
        break;
      case "n":
        for (const [dr, dc, legR, legC] of [
          [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0],
          [1, 2, 0, 1], [1, -2, 0, -1], [-1, 2, 0, 1], [-1, -2, 0, -1],
        ] as Array<[number, number, number, number]>) {
          if (board[r + legR][c + legC]) continue; // 蹩马腿
          add(r + dr, c + dc);
        }
        break;
      case "r":
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) walk(dr, dc);
        break;
      case "c":
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let jumped = false;
          for (let i = 1; i < 9; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (!inBoard(nr, nc)) break;
            const t = board[nr][nc];
            if (!jumped) {
              if (t) jumped = true; // 炮架
            } else {
              if (t) {
                if (t.side !== p.side) out.push({ r: nr, c: nc });
                break;
              }
            }
          }
        }
        break;
      case "p":
        const f = p.side === 0 ? -1 : 1;
        add(r + f, c);
        if (crossedRiver(r, p.side)) {
          add(r, c + 1);
          add(r, c - 1);
        }
        break;
    }
    return out;
  }

  function allMoves(side: Side): Array<{ from: { r: number; c: number }; to: { r: number; c: number } }> {
    const out: Array<{ from: { r: number; c: number }; to: { r: number; c: number } }> = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p || p.side !== side) continue;
        for (const to of movesOf(board, r, c)) out.push({ from: { r, c }, to });
      }
    }
    return out;
  }

  function applyMove(b: Board, m: { from: { r: number; c: number }; to: { r: number; c: number } }): Board {
    const nb = b.map((row) => row.map((x) => (x ? { ...x } : null)));
    nb[m.to.r][m.to.c] = nb[m.from.r][m.from.c];
    nb[m.from.r][m.from.c] = null;
    return nb;
  }

  function kingOf(b: Board, side: Side): { r: number; c: number } | null {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c]?.type === "k" && b[r][c]?.side === side) return { r, c };
      }
    }
    return null;
  }

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
    const moves = allMoves(1);
    if (moves.length === 0) {
      endGame("draw");
      return;
    }
    // 若黑方已被吃掉将 → 玩家胜（防御）
    if (!kingOf(board, 1)) {
      endGame("win");
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
    if (!kingOf(board, 0)) {
      endGame("lose");
      return;
    }
    if (!kingOf(board, 1)) {
      endGame("win");
      return;
    }
    turn = turn === 0 ? 1 : 0;
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
        afterMove();
        return;
      }
    }
    if (p && p.side === 0) {
      selected = { r, c };
      legalTargets = movesOf(board, r, c);
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
      resultText = `你赢了！大爷笑着递来 ${winMoney} 元彩头`;
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
  }
</script>

<div class="chess">
  <div class="c-head">
    <span class="c-status">
      {#if finished}
        {resultText}
      {:else if turn === 0}
        轮到你走（红方）
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
          <button
            class="cell"
            class:sel={isSel}
            class:target={isTarget}
            class:has={!!p}
            class:red={p?.side === 0}
            class:black={p?.side === 1}
            onclick={() => onCell(r, c)}
          >
            {#if p}
              {PIECE_CHAR[p.type][p.side]}
            {:else if isTarget}
              ·
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>

  <p class="c-tip dim">{cfg.desc ?? "点击选中棋子，再点击高亮格落子；吃掉对方的「將」即胜"}</p>
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
    display: flex;
    flex-direction: column;
    border: 2px solid #8a6b3a;
    background: #d9b878;
    border-radius: 6px;
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
  }
  .row.river {
    border-top: 2px dashed rgba(138, 107, 58, 0.7);
    border-bottom: 2px dashed rgba(138, 107, 58, 0.7);
  }
  .cell {
    aspect-ratio: 1;
    border: none;
    background: transparent;
    font-size: 17px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    color: #3a2c14;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "KaiTi", "STKaiti", "SimSun", serif;
  }
  .cell.red {
    color: #c22a2a;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
  }
  .cell.black {
    color: #222;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .cell.sel {
    background: rgba(255, 209, 102, 0.65);
    border-radius: 4px;
  }
  .cell.target {
    background: rgba(123, 216, 143, 0.55);
    border-radius: 4px;
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
  }
  .c-btn:hover {
    background: rgba(255, 209, 102, 0.24);
  }
</style>
