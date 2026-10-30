<!--
  v1.215 公园「象棋大爷」：复用 game/core/xiangqi 纯逻辑引擎。
  玩家执红先行，将死对方即胜；大爷执黑，简单 AI（吃子优先 + 随机性 + 避亏）。
  胜 / 和 / 负结算奖励后回调 onFinish(得分比例)。
  UI：楚河汉界、选中金框、合法落点标记、被将军警示、落子动效。
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { miniGameRandom } from "../../../lib/minigameRandom";
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
    practice = false,
    paused = false,
    onFinish = () => {},
  }: {
    practice?: boolean;
    paused?: boolean;
    cfg?: { winMoney?: number; drawMoney?: number; desc?: string };
    onFinish?: (ratio: number) => void;
  } = $props();
  const random = miniGameRandom();

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
  let aiTimer: ReturnType<typeof setTimeout>;
  onDestroy(() => clearTimeout(aiTimer));
  function aiMove(): void {
    if (finished || turn !== 1) return;
    const moves = legalMoves(board, 1);
    if (moves.length === 0) {
      endGame(isInCheck(board, 1) ? "win" : "draw");
      return;
    }
    let scored = moves.map((m) => {
      const nb = applyMove(board, m);
      let s = boardEval(nb) + random() * 0.8;
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
    const pick = random() < 0.2 ? moves[Math.floor(random() * moves.length)] : scored[0].m;
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
      aiThink();
    }
  }

  /** AI 思考定时器：暂停期间不落子（到点续等），恢复后自然继续。 */
  function aiThink(): void {
    aiThinking = true;
    aiTimer = setTimeout(() => {
      if (paused) { aiThink(); return; }
      aiThinking = false;
      aiMove();
    }, 450);
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
      if (!practice) applyEffects(gameState, { money: winMoney, mood: 4 }, "♟️");
      if (!practice) pushLog(gameState, "♟️", `你赢了象棋大爷，彩头 +${winMoney} 元`);
      resultText = `将死了大爷的「將」！他笑着递来 ${winMoney} 元彩头`;
      playSound("success");
      onFinish(0.9);
    } else if (result === "draw") {
      if (!practice) applyEffects(gameState, { money: drawMoney, mood: 2 }, "♟️");
      if (!practice) pushLog(gameState, "♟️", `和象棋大爷下成和棋，彩头 +${drawMoney} 元`);
      resultText = `和棋！大爷说棋逢对手，塞给你 ${drawMoney} 元`;
      playSound("coin");
      onFinish(0.6);
    } else {
      if (!practice) applyEffects(gameState, { mood: 2 }, "♟️");
      if (!practice) pushLog(gameState, "♟️", "输给了象棋大爷，不过学到了几手");
      resultText = "你输了。大爷拍拍你的肩：小伙子，回去练练再来！";
      playSound("coin");
      onFinish(0.3);
    }
  }

  function restart(): void {
    clearTimeout(aiTimer);
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
    <span class="c-status" aria-live="polite">
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

  <div class="c-main">
    <div class="board" role="group" aria-label="象棋棋盘，红方在下">
      <svg class="board-lines" viewBox="0 0 900 1060" preserveAspectRatio="none" aria-hidden="true">
        <g stroke="currentColor" stroke-width="2" fill="none">
          {#each Array.from({length:10}) as _,r}<path d={`M50 ${50+r*100+(r>=5?60:0)}H850`}/>{/each}
          <path d="M50 50V1010M850 50V1010"/>
          {#each Array.from({length:7}) as _,c}<path d={`M${150+c*100} 50V450M${150+c*100} 610V1010`}/>{/each}
          <path d="M350 50L550 250M550 50L350 250M350 810L550 1010M550 810L350 1010"/>
        </g>
      </svg>
    {#each Array.from({ length: 10 }) as _, r}
      <div class="row">
        {#each Array.from({ length: 9 }) as _, c}
          {@const p = board[r][c]}
          {@const isSel = selected?.r === r && selected?.c === c}
          {@const isTarget = legalTargets.some((t) => t.r === r && t.c === c)}
          {@const isCheckKing = p?.type === "k" && ((p.side === 0 && redInCheck) || (p.side === 1 && blackInCheck))}
          {@const isLast = lastMove !== null && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))}
          <button
            type="button"
            class="cell"
            aria-label={`${p?(p.side===0?'红方':'黑方')+PIECE_CHAR[p.type][p.side]:'空位'}，第${r+1}行第${c+1}列${isTarget?'，可落子':''}`}
            aria-pressed={isSel}
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
              <span class="dot"></span>
            {/if}
          </button>
        {/each}
      </div>
      {#if r === 4}
        <div class="river"><span>楚&nbsp;河</span><span>漢&nbsp;界</span></div>
      {/if}
    {/each}
  </div>

  <div class="c-side">
    <div class="c-seats"><span class="black-seat">● 象棋大爷 · 执黑</span><span class="red-seat">● 你 · 执红先行</span></div>
    <div class="c-guide"><small>公园里的慢时光</small><h3>楚河汉界</h3><p class="c-tip">先点己方棋子，再点高亮位置落子。将死对方即可获胜。</p></div>
    <p class="c-selection" aria-live="polite">{selected?`已选${PIECE_CHAR[board[selected.r][selected.c]!.type][0]} · ${legalTargets.length}处可落子`:finished?resultText:'选中棋子后，可走的位置会亮起'}</p>
    <div class="c-actions">
      <button type="button" class="chess-restart" onclick={restart}>重新开局</button>
    </div>
  </div>
  </div>
</div>

<style>
 .chess{box-sizing:border-box;width:100%;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;gap:10px;padding:12px 16px;border-radius:16px;color:#eee5cf;background:radial-gradient(ellipse at 20% 0,#385249,#142f30 72%);box-shadow:inset 0 0 0 1px #c5cd9c22}
 .c-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex:none;font-size:13px;min-height:26px}.c-status{color:#f6dca5;font-weight:700}.c-stats{font-size:11px;color:#b3c4b5;font-variant-numeric:tabular-nums}
 .c-main{container-type:size;display:flex;align-items:center;justify-content:center;gap:clamp(18px,4vw,52px);flex:1;min-height:0;min-width:0}
 .board{position:relative;isolation:isolate;box-sizing:border-box;flex:none;width:min(64%,640px,calc(100cqh * 9 / 10.6));aspect-ratio:9/10.6;display:flex;flex-direction:column;border:clamp(5px,1.2vw,10px) solid #7a5737;border-radius:10px;overflow:hidden;color:#715539;background:repeating-linear-gradient(3deg,#c99e6510 0px,#f5dbaa30 3px,#c99e6510 8px),linear-gradient(130deg,#ead2a1,#cba56c);box-shadow:0 14px 22px #0006,inset 0 0 16px #6a451533;container-type:inline-size}
 .board-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;color:#705336}
 .row{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));flex:1;min-height:0;position:relative}.river{height:6%;flex:none;display:flex;align-items:center;justify-content:space-around;color:#785738;font:800 clamp(10px,4.4cqw,26px)/1 'KaiTi','STKaiti',serif;letter-spacing:.3em}
 .chess .board .cell{box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0;min-width:0;padding:0;border:0;background:transparent;cursor:pointer;touch-action:manipulation}.cell:hover{background:#fff8cd35}.cell.last:after{content:'';position:absolute;inset:5%;border:2px solid #675b4555;border-radius:6px;pointer-events:none}.cell:focus-visible{outline:2px solid #a03c2a;outline-offset:-3px}
 .disc{width:81%;height:81%;box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ad8855;color:#2a302b;font:900 clamp(12px,6cqw,38px)/1 'KaiTi','STKaiti','SimSun',serif;background:radial-gradient(circle at 30% 25%,#fff4d9,#ecd09c 67%,#d2b17c);box-shadow:0 2px 3px #68442260,inset 0 0 0 2px #fdf2d07d;z-index:1}.cell.red .disc{color:#a92d27}.cell.sel .disc{outline:3px solid #f5f0b0;outline-offset:1px;box-shadow:0 0 0 4px #597e58,0 3px 6px #45321f70;transform:scale(1.06)}.cell.capture .disc{outline:3px solid #dc795d;outline-offset:1px}.cell.check-king .disc{outline:3px solid #d6563e;animation:chess-danger 1.2s ease-in-out infinite}.dot{width:23%;height:23%;border-radius:50%;background:#47694ccc;box-shadow:0 0 0 4px #688c5e24}.cell.target{background:#507c4920}
 .c-side{display:flex;flex-direction:column;justify-content:center;gap:18px;min-width:0;width:clamp(190px,24vw,290px);flex:none;max-height:100%;overflow:auto;padding:12px 0}.c-seats{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:700}.black-seat{color:#c7d4c1}.red-seat{color:#f1b19d}.c-guide{padding:17px 18px;border:1px solid #becb9d33;border-radius:12px;background:#102c2c88}.c-guide small{font-size:9px;letter-spacing:2px;color:#b6bd9a}.c-guide h3{margin:6px 0 12px;font:700 clamp(24px,3vw,34px) 'KaiTi','STKaiti',serif;color:#eed8aa}.c-tip{font-size:13px;line-height:1.9;margin:0;color:#ced2bc}.c-selection{min-height:35px;margin:0;font-size:12px;line-height:1.7;color:#dccb9e}.c-actions{display:flex}.chess-restart{min-height:44px;padding:9px 20px;border:1px solid #c8af7799;border-radius:9px;background:#dcc18b;color:#213932;font-weight:700;cursor:pointer}
 @keyframes chess-danger{50%{box-shadow:0 0 14px #cf5d42bb}}
 @media(max-height:520px) and (orientation:landscape){.chess{padding:7px 12px;gap:5px}.c-head{min-height:22px;font-size:12px}.c-side{gap:10px;padding:4px 0;width:clamp(175px,24vw,250px)}.c-guide{padding:10px 13px}.c-guide h3{font-size:25px;margin:3px 0 7px}.c-guide small{display:none}.c-tip{font-size:11px;line-height:1.65}.c-selection{font-size:11px;min-height:30px}.c-seats{gap:4px;font-size:10px}.c-main{gap:24px}}
 @media(orientation:portrait){.c-main{flex-direction:column;gap:10px}.board{width:min(94%,calc((100cqh - 150px) * 9 / 10.6),560px)}.c-side{width:100%;max-height:140px;display:grid;grid-template-columns:1fr auto;gap:8px;padding:0}.c-guide,.c-selection{display:none}.c-seats{grid-row:1}.c-actions{grid-column:2;grid-row:1}}
 @media(prefers-reduced-motion:reduce){.cell.check-king .disc{animation:none}}
</style>
