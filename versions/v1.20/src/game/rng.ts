/**
 * 可播种 PRNG：mulberry32。
 * 同一 seed + 同一调用序列 → 完全一致的结果，保证游戏可复现、可测试。
 */
import type { RngState } from "./types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从 RNG 状态取出一个 [0,1) 随机数并推进调用计数 */
export function nextRandom(rng: RngState): number {
  rng.calls++;
  return mulberry32(rng.seed + rng.calls * 2654435761)();
}

/** 从 RNG 状态取出 [min, max] 区间整数（含两端） */
export function randomInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextRandom(rng) * (max - min + 1));
}

/** 按权重抽签：items = [{item, weight}]，返回被选中的 item */
export function weightedDraw<T>(rng: RngState, items: Array<{ item: T; weight: number }>): T | null {
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let roll = nextRandom(rng) * total;
  for (const { item, weight } of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1].item;
}

/** 以概率 p（0-1）返回 true */
export function chance(rng: RngState, p: number): boolean {
  return nextRandom(rng) < p;
}

/** 创建初始 RNG 状态（seed 可由调用方注入） */
export function createRng(seed?: number): RngState {
  return {
    seed: seed ?? ((Math.random() * 0xffffffff) >>> 0),
    calls: 0,
  };
}
