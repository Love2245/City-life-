/**
 * v1.215 象棋纯逻辑引擎（公园象棋大爷）。
 * 与 tests/xiangqi.test.ts 对齐的行为规格：
 * - Board 10×9，[row][col]，row0=黑方底线、row9=红方底线；Side 0=红 1=黑
 * - initialBoard：32 子标准开局，红帅 [9][4]、黑将 [0][4]
 * - movesOf：伪走法（越界安全，含蹩马腿/塞象眼/炮架/过河兵规则，-1 行必须守卫）
 * - isInCheck：含「飞将」（两将同列且中间无子 → 双方皆被将）
 * - legalMoves：过滤「走完自己仍被将」的着法（不能送将）
 * - applyMove：纯函数深拷贝
 * 纯逻辑层，不依赖 DOM / engine。
 */
export type Side = 0 | 1;
export type PieceType = "k" | "r" | "n" | "c" | "a" | "e" | "p";

/** 对手方（红↔黑） */
export function opponentOf(side: Side): Side {
  return (1 - side) as Side;
}
export interface Piece {
  type: PieceType;
  side: Side;
}
export type Board = (Piece | null)[][];
export type Move = { from: { r: number; c: number }; to: { r: number; c: number } };

/** 标准开局（红下黑上） */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: 10 }, () => Array<Piece | null>(9).fill(null));
  const back: PieceType[] = ["r", "n", "e", "a", "k", "a", "e", "n", "r"];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { type: back[c], side: 1 }; // 黑底线
    b[9][c] = { type: back[c], side: 0 }; // 红底线
  }
  b[2][1] = { type: "c", side: 1 };
  b[2][7] = { type: "c", side: 1 };
  b[7][1] = { type: "c", side: 0 };
  b[7][7] = { type: "c", side: 0 };
  for (const c of [0, 2, 4, 6, 8]) {
    b[3][c] = { type: "p", side: 1 }; // 黑卒
    b[6][c] = { type: "p", side: 0 }; // 红兵
  }
  return b;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 10 && c >= 0 && c < 9;
}

function inPalace(r: number, c: number, side: Side): boolean {
  const top = side === 0 ? 7 : 0;
  return c >= 3 && c <= 5 && r >= top && r <= top + 2;
}

/** 已过河（红向下走，越过中线 r<=4；黑向上走，越过中线 r>=5） */
function crossedRiver(r: number, side: Side): boolean {
  return side === 0 ? r <= 4 : r >= 5;
}

/** 查找某方将/帅位置 */
export function kingOf(board: Board, side: Side): { r: number; c: number } | null {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.type === "k" && p.side === side) return { r, c };
    }
  }
  return null;
}

function pushStep(board: Board, fromR: number, fromC: number, out: Array<{ r: number; c: number }>, tr: number, tc: number): void {
  if (!inBounds(tr, tc)) return;
  const target = board[tr][tc];
  if (!target || target.side !== board[fromR][fromC]!.side) out.push({ r: tr, c: tc });
}

/** 走法生成（伪走法：不过滤「走完被将」），[r][c] 越界/空格返回 [] */
export function movesOf(board: Board, r: number, c: number): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  if (!inBounds(r, c)) return out;
  const p = board[r][c];
  if (!p) return out;
  const side = p.side;
  switch (p.type) {
    case "k": {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tr = r + dr;
        const tc = c + dc;
        if (inPalace(tr, tc, side)) pushStep(board, r, c, out, tr, tc);
      }
      break;
    }
    case "a": {
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const tr = r + dr;
        const tc = c + dc;
        if (inPalace(tr, tc, side)) pushStep(board, r, c, out, tr, tc);
      }
      break;
    }
    case "e": {
      // 象：斜走 2 格 + 塞象眼（中点被占则不能走）+ 不过河
      for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        if (side === 0 && tr < 5) continue; // 红象不下河（r>=5）
        if (side === 1 && tr > 4) continue; // 黑象不过河（r<=4）
        const midR = r + dr / 2;
        const midC = c + dc / 2;
        if (board[midR][midC]) continue; // 塞象眼
        pushStep(board, r, c, out, tr, tc);
      }
      break;
    }
    case "n": {
      // 马：8 个 L 位 + 蹩马腿（相邻直位被占则挡）——对 -1 行越界必须守卫
      const legs: Array<[number, number, number, number]> = [
        [1, 2, 0, 1],
        [1, -2, 0, -1],
        [-1, 2, 0, 1],
        [-1, -2, 0, -1],
        [2, 1, 1, 0],
        [2, -1, 1, 0],
        [-2, 1, -1, 0],
        [-2, -1, -1, 0],
      ];
      for (const [dr, dc, lr, lc] of legs) {
        const legR = r + lr;
        const legC = c + lc;
        if (!inBounds(legR, legC)) continue; // 蹩马腿越界（如黑马在顶边）→ 该方向不可走
        if (board[legR][legC]) continue; // 蹩马腿
        pushStep(board, r, c, out, r + dr, c + dc);
      }
      break;
    }
    case "r": {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let tr = r + dr;
        let tc = c + dc;
        while (inBounds(tr, tc)) {
          const t = board[tr][tc];
          if (!t) {
            out.push({ r: tr, c: tc });
          } else {
            if (t.side !== side) out.push({ r: tr, c: tc });
            break;
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    }
    case "c": {
      // 炮：移动同车（不可吃子）；吃子须隔一炮架（跳过一个子吃其后第一个敌子）
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let tr = r + dr;
        let tc = c + dc;
        let jumped = false;
        while (inBounds(tr, tc)) {
          const t = board[tr][tc];
          if (!jumped) {
            if (!t) {
              out.push({ r: tr, c: tc });
            } else {
              jumped = true; // 遇到炮架，跳过
            }
          } else {
            if (t) {
              if (t.side !== side) out.push({ r: tr, c: tc }); // 隔山打牛：吃炮架后第一个子
              break;
            }
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    }
    case "p": {
      // 兵卒：过河前只能前进一步；过河后可横移；永不后退
      const fwd = side === 0 ? -1 : 1;
      pushStep(board, r, c, out, r + fwd, c);
      if (crossedRiver(r, side)) {
        pushStep(board, r, c, out, r, c + 1);
        pushStep(board, r, c, out, r, c - 1);
      }
      break;
    }
  }
  return out;
}

/** 一方所有伪走法 */
export function allMoves(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p || p.side !== side) continue;
      for (const to of movesOf(board, r, c)) {
        out.push({ from: { r, c }, to });
      }
    }
  }
  return out;
}

/** 深拷贝并落子（纯函数） */
export function applyMove(board: Board, move: Move): Board {
  const nb: Board = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  const piece = nb[move.from.r][move.from.c];
  if (!piece) return nb;
  nb[move.from.r][move.from.c] = null;
  nb[move.to.r][move.to.c] = piece;
  return nb;
}

/** 是否被将军：飞将（两将同列无遮挡 → 双方皆被将）或对方任一伪走法能吃将 */
export function isInCheck(board: Board, side: Side): boolean {
  const k = kingOf(board, side);
  if (!k) return true;
  const oppKing = kingOf(board, opponentOf(side));
  if (oppKing && oppKing.c === k.c) {
    let blocked = false;
    for (let r = Math.min(oppKing.r, k.r) + 1; r < Math.max(oppKing.r, k.r); r++) {
      if (board[r][k.c]) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return true; // 飞将
  }
  return allMoves(board, opponentOf(side)).some((m) => m.to.r === k.r && m.to.c === k.c);
}

/** 合法走法：过滤「走完自己仍被将」（不能送将） */
export function legalMoves(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (const m of allMoves(board, side)) {
    const nb = applyMove(board, m);
    if (!isInCheck(nb, side)) out.push(m);
  }
  return out;
}
