/**
 * v1.215 推箱子纯逻辑引擎（手机小游戏）。
 * 与 tests/sokoban.test.ts 对齐的行为规格：
 * - 坐标：x=列、y=行；grid[y][x]
 * - parseLevel：归一化网格（玩家从网格移除），goals 存 "x,y" 键
 * - moveState：纯函数——未移动返回原引用，移动返回新状态（不改传入对象）
 * - cellChar：玩家/箱/目标标记分层，离开目标点后目标标记仍保留
 * - 关卡 LEVELS 全部经 BFS 校验可解（第 1 关为「一步推」教学关 #@o.#）
 * 纯逻辑层，不依赖 DOM / engine。
 */
export const GOAL = ".";
export const BOX = "o";
export const PLAYER = "@";
export const WALL = "#";
export const EMPTY = " ";

export interface SokobanState {
  /** 网格（墙/箱/空地），不包含玩家；目标点单独记录 */
  grid: string[][];
  /** 玩家列 */
  px: number;
  /** 玩家行 */
  py: number;
  /** 目标点集合，键为 "x,y" */
  goals: Set<string>;
}

/** 关卡：第 1 关为一步推教学关；其余沿用 v1.20 历史关卡（已修正死局） */
export const LEVELS: string[][] = [
  // 第 1 关：教学「一步推」——原 #o@.# 是死局（箱子被锁死），已替换
  ["#####", "#   #", "#@o.#", "#   #", "#####"],
  // 双箱双点
  ["######", "#    #", "# @  #", "#o o #", "#. . #", "######"],
  // 双箱连排
  ["########", "#      #", "# oo   #", "#  @   #", "# ..   #", "########"],
  // 三箱三点
  ["#########", "#       #", "# o o o #", "# @     #", "# . . . #", "#########"],
];

/** 解析关卡：归一化网格、登记玩家位置与目标点 */
export function parseLevel(level: string[]): SokobanState {
  const grid: string[][] = [];
  const goals = new Set<string>();
  let px = 0;
  let py = 0;
  for (let y = 0; y < level.length; y++) {
    const row: string[] = [];
    const chars = level[y].split("");
    for (let x = 0; x < chars.length; x++) {
      const ch = chars[x];
      if (ch === WALL) {
        row.push(WALL);
      } else if (ch === PLAYER) {
        px = x;
        py = y;
        row.push(EMPTY);
      } else if (ch === BOX) {
        row.push(BOX);
      } else if (ch === GOAL) {
        row.push(EMPTY);
        goals.add(`${x},${y}`);
      } else {
        row.push(EMPTY);
      }
    }
    grid.push(row);
  }
  return { grid, px, py, goals };
}

/** 取网格字符；越界返回墙 */
export function cellAt(state: SokobanState, x: number, y: number): string {
  return state.grid[y]?.[x] ?? WALL;
}

/** 显示字符：玩家 > 箱子 > 目标标记 > 原始格子（目标点离开后标记仍保留） */
export function cellChar(state: SokobanState, x: number, y: number): string {
  if (x === state.px && y === state.py) return PLAYER;
  const cell = cellAt(state, x, y);
  if (cell === BOX) return BOX;
  if (state.goals.has(`${x},${y}`)) return GOAL;
  return cell;
}

/** 是否通关：所有目标点都被箱子占据 */
export function isWin(state: SokobanState): boolean {
  for (const key of state.goals) {
    const [x, y] = key.split(",").map(Number);
    if (cellAt(state, x, y) !== BOX) return false;
  }
  return true;
}

/**
 * 移动玩家（dx,dy 为列/行增量）。纯函数：
 * - 撞墙/箱子推不动 → { moved:false, state: 原引用 }
 * - 正常移动/推箱 → { moved:true, state: 新状态 }
 */
export function moveState(
  state: SokobanState,
  dx: number,
  dy: number,
): { moved: boolean; state: SokobanState } {
  const nx = state.px + dx;
  const ny = state.py + dy;
  const cell = cellAt(state, nx, ny);
  if (cell === WALL) return { moved: false, state };
  const grid = state.grid.map((row) => row.slice());
  if (cell === BOX) {
    const bx = nx + dx;
    const by = ny + dy;
    const beyond = cellAt(state, bx, by);
    if (beyond === WALL || beyond === BOX) return { moved: false, state };
    grid[by][bx] = BOX;
    grid[ny][nx] = EMPTY;
  }
  return { moved: true, state: { grid, px: nx, py: ny, goals: state.goals } };
}

/** 局面指纹：网格 + 玩家位置（BFS 去重用） */
export function fingerprint(state: SokobanState): string {
  return `${state.grid.map((row) => row.join("")).join("|")}@${state.px},${state.py}`;
}
