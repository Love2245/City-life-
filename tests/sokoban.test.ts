import { describe, it, expect } from "vitest";
import {
  LEVELS,
  GOAL,
  parseLevel,
  cellAt,
  cellChar,
  isWin,
  moveState,
  fingerprint,
  BOX,
  PLAYER,
} from "../src/game/core/sokoban";

const DIRS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** BFS 求最短解；无解返回 null。关卡都很小，状态空间可穷举 */
function solve(level: string[], maxStates = 300_000): number | null {
  const start = parseLevel(level);
  if (isWin(start)) return 0;
  const seen = new Set<string>([fingerprint(start)]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0 && seen.size < maxStates) {
    depth++;
    const next: Array<ReturnType<typeof parseLevel>> = [];
    for (const s of frontier) {
      for (const [dx, dy] of DIRS) {
        const r = moveState(s, dx, dy);
        if (!r.moved) continue;
        const fp = fingerprint(r.state);
        if (seen.has(fp)) continue;
        seen.add(fp);
        if (isWin(r.state)) return depth;
        next.push(r.state);
      }
    }
    frontier = next;
  }
  return null;
}

describe("推箱子核心逻辑", () => {
  it("每一关都必须可解（BFS 求解，防止再出现死局关卡）", () => {
    LEVELS.forEach((level, i) => {
      const steps = solve(level);
      expect(steps, `第 ${i + 1} 关无解`).not.toBeNull();
      expect(steps).toBeGreaterThan(0);
    });
  });

  it("第 1 关是「一步推」教学关", () => {
    expect(LEVELS[0][2]).toBe("#@o.#");
    expect(solve(LEVELS[0])).toBe(1);
  });

  it("历史坏布局 #o@.# 确实是死局（箱子被锁死在最左列，整个小游戏无法通关）", () => {
    const broken = ["#####", "#   #", "#o@.#", "#   #", "#####"];
    expect(solve(broken)).toBeNull();
  });

  it("parseLevel 正确登记玩家位置与目标点，并把网格归一化", () => {
    const s = parseLevel(LEVELS[0]);
    expect({ x: s.px, y: s.py }).toEqual({ x: 1, y: 2 });
    expect(s.goals.has("3,2")).toBe(true);
    expect(s.goals.size).toBe(1);
    expect(cellAt(s, 2, 2)).toBe(BOX);
    expect(cellChar(s, 1, 2)).toBe(PLAYER);
  });

  it("撞墙不移动，且状态对象不被修改", () => {
    const s = parseLevel(LEVELS[0]);
    const before = JSON.stringify(s.grid);
    const r = moveState(s, -1, 0); // 玩家左边是墙
    expect(r.moved).toBe(false);
    expect(r.state).toBe(s);
    expect(JSON.stringify(s.grid)).toBe(before);
  });

  it("箱子后面是墙时推不动", () => {
    const blocked = ["#####", "#o@ #", "#####"];
    const s = parseLevel(blocked);
    expect(moveState(s, -1, 0).moved).toBe(false);
  });

  it("moveState 不会原地修改传入状态（纯函数）", () => {
    const s = parseLevel(LEVELS[0]);
    const before = JSON.stringify(s.grid);
    const r = moveState(s, 1, 0);
    expect(r.moved).toBe(true);
    expect(JSON.stringify(s.grid)).toBe(before);
    expect(r.state).not.toBe(s);
  });

  it("箱子 / 玩家离开目标点后，目标标记仍然保留（v1.20 回归）", () => {
    const custom = ["#######", "#@o.  #", "#######"];
    let s = parseLevel(custom);
    s = moveState(s, 1, 0).state; // 箱子推到目标点 → 通关
    expect(isWin(s)).toBe(true);
    s = moveState(s, 1, 0).state; // 箱子被推离目标点
    expect(isWin(s)).toBe(false);
    s = moveState(s, 1, 0).state; // 玩家也离开目标点
    expect(cellChar(s, 3, 1)).toBe(GOAL);
  });

  it("fingerprint 对同一局面稳定、对不同局面不同", () => {
    const a = parseLevel(LEVELS[1]);
    const b = parseLevel(LEVELS[1]);
    expect(fingerprint(a)).toBe(fingerprint(b));
    const moved = moveState(a, -1, 0);
    expect(moved.moved).toBe(true);
    expect(fingerprint(moved.state)).not.toBe(fingerprint(a));
  });
});
