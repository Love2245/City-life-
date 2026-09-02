import { describe, it, expect } from "vitest";
import {
  initialBoard,
  movesOf,
  legalMoves,
  kingOf,
  isInCheck,
  applyMove,
  type Board,
  type Piece,
  type PieceType,
  type Side,
} from "../src/game/core/xiangqi";

function boardWith(pieces: Array<[number, number, PieceType, Side]>): Board {
  const b: Board = Array.from({ length: 10 }, () => Array<Piece | null>(9).fill(null));
  for (const [r, c, type, side] of pieces) b[r][c] = { type, side };
  return b;
}

describe("xiangqi 引擎（公园象棋大爷）", () => {
  it("初始局面：32 子，两将位置正确", () => {
    const b = initialBoard();
    let count = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (b[r][c]) count++;
    expect(count).toBe(32);
    expect(kingOf(b, 0)).toEqual({ r: 9, c: 4 }); // 红帅
    expect(kingOf(b, 1)).toEqual({ r: 0, c: 4 }); // 黑将
  });

  it("【bug#1 回归】黑马在棋盘顶边（第 0 行）求走法不抛异常（蹩马腿边界兜底）", () => {
    const b = initialBoard();
    // 黑马初始在 [0][1] 与 [0][7]，马腿会指向第 -1 行；旧实现会越界崩溃
    expect(() => movesOf(b, 0, 1)).not.toThrow();
    expect(() => movesOf(b, 0, 7)).not.toThrow();
    expect(movesOf(b, 0, 1).length).toBeGreaterThan(0);
  });

  it("炮：隔山打牛（越过一枚炮架吃子）走法正确", () => {
    // 红炮 [7][1]，黑炮架 [7][4] 后黑子 [7][7] 应可被吃
    const b = boardWith([
      [9, 4, "k", 0],
      [0, 4, "k", 1],
      [7, 1, "c", 0],
      [7, 4, "p", 1],
      [7, 7, "r", 1],
    ]);
    const caps = movesOf(b, 7, 1).filter((m) => m.r === 7 && m.c === 7);
    expect(caps.length).toBe(1);
  });

  it("飞将：两将同列且中间无子 → 被将", () => {
    const b = boardWith([
      [9, 4, "k", 0],
      [0, 4, "k", 1],
    ]);
    expect(isInCheck(b, 0)).toBe(true);
    expect(isInCheck(b, 1)).toBe(true);
  });

  it("初始局面无人被将", () => {
    const b = initialBoard();
    expect(isInCheck(b, 0)).toBe(false);
    expect(isInCheck(b, 1)).toBe(false);
  });

  it("legalMoves 过滤掉「走完让自己被将军」的着法（不能送将）", () => {
    // 红帅 [9][4]，黑车 [9][0] 将军；红兵 [6][4] 若后退会暴露？构造：红车被钉死
    const b = boardWith([
      [9, 4, "k", 0],
      [0, 4, "k", 1],
      [9, 0, "r", 1], // 沿第 9 行将军
      [8, 4, "r", 0], // 红车，若它离开第 4 列则飞将/被将
    ]);
    // 红车在 [8][4] 若横向移动会暴露红帅（第 4 列无子遮挡 → 飞将），故横向均非法
    const redMoves = legalMoves(b, 0);
    const rookMoves = redMoves.filter((m) => m.from.r === 8 && m.from.c === 4);
    // 红车只能在第 4 列上下移动（保持遮挡），不能横向
    for (const m of rookMoves) {
      expect(m.to.c).toBe(4);
    }
  });

  it("【将死】红帅被四车围死且无合法着法 → legalMoves 为空且 isInCheck 为真", () => {
    const mate = boardWith([
      [9, 4, "k", 0],
      [9, 0, "r", 1], // 第 9 行将军
      [7, 4, "r", 1], // 第 4 列将军 + 行 7
      [8, 0, "r", 1], // 第 8 行封 [8][3]/[8][5]
      [7, 8, "r", 1], // 防守 [7][4]，使红帅不能吃子解将
    ]);
    expect(kingOf(mate, 0)).toEqual({ r: 9, c: 4 });
    expect(isInCheck(mate, 0)).toBe(true);
    expect(legalMoves(mate, 0).length).toBe(0); // 将死
  });

  it("正常对弈可产生合法着法（非将死局面）", () => {
    const b = initialBoard();
    expect(legalMoves(b, 0).length).toBeGreaterThan(0);
    expect(legalMoves(b, 1).length).toBeGreaterThan(0);
    // 走一步后仍可继续
    const m = legalMoves(b, 0)[0];
    const nb = applyMove(b, m);
    expect(legalMoves(nb, 1).length).toBeGreaterThan(0);
  });
});
