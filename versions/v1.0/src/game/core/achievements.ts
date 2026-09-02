/**
 * 收集追踪（v0.94 遗留模块，v0.985 瘦身）。
 *
 * v0.985 起「成就系统」整体由 core/tarot.ts 的 22 张塔罗牌接管，
 * 原本的 achievements.json 定义、checkAchievements 求值、成就图鉴分组全部下线。
 *
 * 本文件仅保留两个收集追踪写入器：state.seen.itemsEaten / state.seen.locationsVisited。
 * 它们仍被 items.ts（吃到新食物）与 actions.ts（到访新地点）调用，
 * 并作为塔罗牌与统计面板的数据来源，因此保留原文件名与导出签名，避免调用方改动。
 */
import type { GameState } from "../types";

/** 记录吃过的食物/物品（items.ts 在饱腹类效果生效时调用） */
export function recordFoodEaten(state: GameState, id: string): void {
  if (!state.seen.itemsEaten.includes(id)) state.seen.itemsEaten.push(id);
}

/** 记录到访过的地点（actions.ts 在进入地点时调用） */
export function recordLocationVisited(state: GameState, id: string): void {
  if (!state.seen.locationsVisited.includes(id)) state.seen.locationsVisited.push(id);
}

/** 已吃过的不同食物数（统计面板用） */
export function eatenCount(state: GameState): number {
  return state.seen.itemsEaten.length;
}

/** 已到访的不同地点数（统计面板用） */
export function visitedCount(state: GameState): number {
  return state.seen.locationsVisited.length;
}
