/** 可播种、可继续的 PRNG：内部游标随每次抽取推进并随存档持久化。 */
import type { RngState } from "./types";

function mulberry32Step(state: number): number {
  const a = state | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 给旧存档补充游标时，按旧版 seed/calls 序列定位到下一次抽取。 */
export function ensureRngState(rng: RngState): number {
  if (!Number.isFinite(rng.state)) {
    const calls = Number.isFinite(rng.calls) ? Math.max(0, Math.trunc(rng.calls)) : 0;
    rng.state = (rng.seed + Math.imul(calls + 1, 0x6d2b79f5)) >>> 0;
  }
  return rng.state!;
}

/** 从 RNG 状态取出一个 [0,1) 随机数并推进调用计数 */
export function nextRandom(rng: RngState): number {
  rng.state = (ensureRngState(rng) + 0x6d2b79f5) >>> 0;
  rng.calls++;
  return mulberry32Step(rng.state);
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
  const resolvedSeed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
  return { seed: resolvedSeed, calls: 0, state: resolvedSeed >>> 0 };
}
