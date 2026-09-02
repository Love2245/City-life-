/**
 * 工作小游戏引擎（v0.96）：每份工作各具特色的迷你玩法。
 * 纯逻辑层：配置读取、难度系数、音游判定、评分奖励。
 *
 * 玩法类型（按引擎分派）：
 * - sequence：顺序点击（流水线多轮乱序 / 咖啡配方 / 配送路线 / 巡逻打点 / 记忆复现 / 摆摊）
 * - quiz：快速判断（收银找零 / 质检 / 分拣 / 话术 / 配餐）
 * - whack：反应点击（打地鼠式：点目标避开坏目标 / 信号灯）
 * - rhythm：音游（下落音符 + 判定线，锻炼 / 卖唱）
 *
 * 全局难度系数 DIFFICULTY = 0.965：作为判定窗与限时/下落速度的缩放基础值（<1 → 略严格）。
 * 设计原则：无压力无惩罚——非完美不扣数值；得分比例映射为工资加成（0~5%）。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";
import minigameData from "../data/minigames.json";

/** 全局难度系数（判定阈值 / 速度 / 容错调整的基础值） */

/** v1.05 难度分级（可在设置中选择，替代全局 DIFFICULTY） */
export type DifficultyTier = 'easy' | 'normal' | 'hard';
export const DIFF_TIER_SCALE: Record<DifficultyTier, number> = { easy: 1.15, normal: 0.965, hard: 0.78 };
export function getDifficulty(state: import('../types').GameState): DifficultyTier {
  const v = state.flags['difficulty_tier'];
  if (typeof v === 'string' && (v === 'easy' || v === 'normal' || v === 'hard')) return v;
  return 'normal';
}
export function scaledDifficulty(state: import('../types').GameState): number {
  return DIFF_TIER_SCALE[getDifficulty(state)];
}

export const DIFFICULTY = (minigameData as { difficulty: number }).difficulty;

// ---- 配置类型 ----

export interface SequenceCfg {
  type: "sequence";
  title: string;
  icon: string;
  desc: string;
  steps: string[];
  stepIcons?: string[];
  /** 循环轮数（流水线 3-5 次；每轮开始前按钮乱序） */
  rounds?: number;
  /** 每轮开始前是否打乱按钮顺序 */
  shuffleEachRound?: boolean;
  /** 记忆模式：先亮序展示，再按记忆复点 */
  memory?: boolean;
  /** 配方表（咖啡师）：顶部展示，每轮从表中随机选一杯 */
  recipeTable?: { name: string; recipe: string[] }[];
  /** 限时（秒），缺省不限 */
  timeLimit?: number;
  /** 失误容忍次数（点错扣一次，超出判非完美） */
  wrongLimit?: number;
  perfectBonusRate?: number;
}

export interface QuizCfg {
  type: "quiz";
  title: string;
  icon: string;
  desc: string;
  questions: { q: string; options: string[]; answer: number }[];
  timeLimit?: number;
  wrongLimit?: number;
  perfectBonusRate?: number;
}

export interface WhackCfg {
  type: "whack";
  title: string;
  icon: string;
  desc: string;
  /** 出现的目标总数（好+坏） */
  targets: number;
  timeLimit?: number;
  wrongLimit?: number;
  goodLabel: string;
  goodIcon: string;
  badLabel: string;
  badIcon: string;
  perfectBonusRate?: number;
}

export interface RhythmCfg {
  type: "rhythm";
  title: string;
  icon: string;
  desc: string;
  /** 轨道数（1-3） */
  tracks: number;
  /** 音符总数 */
  notes: number;
  /** 相邻音符间隔（ms） */
  intervalMs: number;
  /** 音符下落时长（ms） */
  fallMs: number;
  perfectBonusRate?: number;
}

/** v1.20 中国象棋（公园「象棋大爷」）：内置简易对弈，胜/负/和由组件自行判定 */
export interface ChessCfg {
  type: "chess";
  title: string;
  icon: string;
  desc: string;
  /** 胜局奖金（元） */
  winMoney?: number;
  /** 和局奖金（元） */
  drawMoney?: number;
  perfectBonusRate?: number;
}

export type MiniGameConfig = SequenceCfg | QuizCfg | WhackCfg | RhythmCfg | ChessCfg;

// ---- 配置读取 ----

const GAMES = (minigameData as { games: Record<string, MiniGameConfig> }).games;

/** 按 key（jobId 或 actionId）取小游戏配置；无配置返回 undefined（该工作不弹小游戏） */
export function getMiniGameConfig(key: string): MiniGameConfig | undefined {
  return GAMES[key];
}

/** 所有已配置的小游戏 key（测试完整性用） */
export function configuredMiniGameKeys(): string[] {
  return Object.keys(GAMES);
}

// ---- 音游判定 ----

export type TimingJudge = "perfect" | "good" | "ok" | "miss";

/**
 * 判定窗口（ms，基础值 × 难度系数）。
 * v0.965 调宽基准（90→110 / 150→185 / 230→280），整体更宽松、容错更高。
 */
export const JUDGE_WINDOW = {
  perfect: Math.round(110 * DIFFICULTY),
  good: Math.round(185 * DIFFICULTY),
  ok: Math.round(280 * DIFFICULTY),
};

export const JUDGE_SCORE: Record<TimingJudge, number> = {
  perfect: 100,
  good: 70,
  ok: 40,
  miss: 0,
};

export const JUDGE_LABEL: Record<TimingJudge, string> = {
  perfect: "完美",
  good: "良好",
  ok: "普通",
  miss: "失误",
};

/** 根据按键时刻与理想时刻的偏差（ms）判定 */
export function judgeTiming(offsetMs: number): TimingJudge {
  const abs = Math.abs(offsetMs);
  if (abs <= JUDGE_WINDOW.perfect) return "perfect";
  if (abs <= JUDGE_WINDOW.good) return "good";
  if (abs <= JUDGE_WINDOW.ok) return "ok";
  return "miss";
}

/**
 * 限时（秒）按难度系数缩放。
 * v0.965：改为放宽（×1.15），给玩家更充裕的时间，降低压力。
 */
export function scaleTimeLimit(baseSec: number): number {
  return Math.max(4, Math.round(baseSec * 1.15 * 10) / 10);
}

/** 失误容忍（v0.965：下限提升到 2，更宽容） */
export function scaleWrongLimit(base: number): number {
  return Math.max(2, Math.floor(base * DIFFICULTY));
}

// ---- 表现评级（v0.965 玩法反馈） ----

export type GameGrade = "S" | "A" | "B" | "C" | "D";

export const GRADE_LABEL: Record<GameGrade, string> = {
  S: "神级表现",
  A: "干得漂亮",
  B: "中规中矩",
  C: "勉强过关",
  D: "有待努力",
};

/** 得分比例 → 评级 */
export function gradeOf(ratio: number): GameGrade {
  if (ratio >= 0.95) return "S";
  if (ratio >= 0.8) return "A";
  if (ratio >= 0.6) return "B";
  if (ratio >= 0.3) return "C";
  return "D";
}

// ---- 评分与奖励 ----

export const MINIGAME_REWARD = {
  /** 完美表现的最高工资加成比例 */
  maxBonusRate: 0.05,
  /** 无工资来源（实习/零薪）时的心情补偿 */
  moodFallback: 1,
};

/**
 * 结算小游戏奖励（按得分比例 0-1 给工资加成，失败/低分无惩罚）。
 * @param key 工作/行动 id（仅日志用）
 * @param scoreRatio 得分比例 0-1（miss 不计分，完美=1）
 * @param todayPay 本次结算的工资基数
 */
export function applyMiniGameReward(
  state: GameState,
  key: string,
  scoreRatio: number,
  todayPay = 0,
): { rewarded: boolean; bonus?: number; ratio: number } {
  const ratio = Math.max(0, Math.min(1, scoreRatio));
  const cfg = getMiniGameConfig(key);
  const maxRate = cfg?.perfectBonusRate ?? MINIGAME_REWARD.maxBonusRate;
  if (ratio <= 0) return { rewarded: false, ratio };
  const bonus = Math.max(1, Math.round((todayPay || 0) * maxRate * ratio));
  if (todayPay > 0) {
    state.player.money += bonus;
    pushLog(state, "🎮", `小游戏表现 ${Math.round(ratio * 100)} 分！工作加成 +${bonus} 元`);
    return { rewarded: true, bonus, ratio };
  }
  // 工资为 0（实习/无薪）：给心情小补偿（表现越好心情越高）
  const moodGain = Math.round(MINIGAME_REWARD.moodFallback * ratio);
  state.player.attrs.mood = Math.min(100, state.player.attrs.mood + moodGain);
  pushLog(state, "🎮", `小游戏表现 ${Math.round(ratio * 100)} 分！心情 +${moodGain}`);
  return { rewarded: true, bonus: 0, ratio };
}
