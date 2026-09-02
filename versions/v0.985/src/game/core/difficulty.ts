/**
 * 难度递增系统（v0.94 / R3）。
 * 纯计算层（不依赖 engine，避免 time→engine 环形依赖）。
 * 难度随「存活天数 + 净资产」爬升，驱动：
 *  - 通胀：economy.priceIndex 跨月上涨，购买成本随之放大；
 *  - 工作要求加成：就职门槛随难度提高；
 *  - 事件压力：随机事件概率上升 + 负面事件权重放大 + 高难专属事件解锁。
 * 具体「写入 state」由 time.ts（通胀）与 events.ts（概率/权重）负责，本文件只算数值。
 */
import type { GameState } from "../types";
import balanceData from "../data/balance.json";
import { gameDay } from "./calendar";

interface DifficultyBalance {
  daysPerLevel: number;
  maxLevel: number;
  inflationStep: number;
  inflationRateScale: number;
  inflationCap: number;
  reqBonusPerLevel: number;
  reqBonusCap: number;
  eventProbBase: number;
  eventProbPerLevel: number;
  eventProbCap: number;
  negativeWeightStep: number;
  netWorthTier: number;
}

const B: DifficultyBalance = (balanceData as unknown as { difficulty: DifficultyBalance }).difficulty;

/** 存活绝对天数（以开局 2026-08-01 = 第 0 天为纪元，统一走 calendar.gameDay） */
export function daysSurvived(state: GameState): number {
  return gameDay(state.time);
}

/** 净资产 = 现金 + 投资组合市值 */
export function netWorth(state: GameState): number {
  const inv = state.economy.investments.reduce((s, i) => s + i.value, 0);
  return state.player.money + inv;
}

/** 当前难度等级 0..maxLevel（天数为主，净资产为辅） */
export function difficultyLevel(state: GameState): number {
  const byDays = Math.floor(daysSurvived(state) / B.daysPerLevel);
  const byWealth = Math.floor(netWorth(state) / B.netWorthTier);
  return Math.min(B.maxLevel, byDays + byWealth);
}

/** 物价倍率（priceIndex 即倍率，初始 1，随通胀上升） */
export function priceMultiplier(state: GameState): number {
  return state.economy.priceIndex;
}

/** 按当前物价倍率缩放一笔购买花费（向下取整到整数元） */
export function scaleCost(state: GameState, base: number): number {
  return Math.round((base ?? 0) * priceMultiplier(state));
}

/** 就职要求加成：随难度线性增加，封顶 */
export function jobRequirementBonus(state: GameState): number {
  return Math.min(B.reqBonusCap, difficultyLevel(state) * B.reqBonusPerLevel);
}

/** 随机事件触发概率（随难度上升，封顶） */
export function eventProbability(state: GameState): number {
  return Math.min(B.eventProbCap, B.eventProbBase + difficultyLevel(state) * B.eventProbPerLevel);
}

/** 负面事件权重放大系数（随难度上升） */
export function negativeWeightBoost(state: GameState): number {
  return 1 + difficultyLevel(state) * B.negativeWeightStep;
}

/**
 * 本月通胀速率（用于 time.ts 跨月时乘到 priceIndex 上）。
 * 难度越高，通胀越快；整体倍率封顶于 1 + inflationCap。
 */
export function monthlyInflationRate(state: GameState): number {
  return B.inflationStep * (1 + difficultyLevel(state) * B.inflationRateScale);
}

/** priceIndex 上限（含通胀上限） */
export function priceIndexCap(): number {
  return 1 + B.inflationCap;
}

/** UI 用：等级中文标签 */
export function difficultyLabel(level: number): string {
  const names = ["新手", "适应", "扎根", "打拼", "老练", "高压", "都市生存家"];
  return names[Math.min(level, names.length - 1)];
}
