import { describe, it, expect } from "vitest";
import { createRng, nextRandom, randomInt, weightedDraw, chance } from "../src/game/rng";

describe("RNG：确定性", () => {
  it("同一 seed 产生相同序列", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(nextRandom(a)).toBe(nextRandom(b));
    }
  });

  it("不同 seed 产生不同序列", () => {
    const a = createRng(1);
    const b = createRng(2);
    const va = nextRandom(a);
    const vb = nextRandom(b);
    expect(va).not.toBe(vb);
  });

  it("调用计数递增", () => {
    const r = createRng(7);
    expect(r.calls).toBe(0);
    nextRandom(r);
    nextRandom(r);
    expect(r.calls).toBe(2);
  });

  it("旧存档缺少游标时从既有调用位置继续，不重置随机序列", () => {
    const seed = 317;
    const calls = 12;
    const legacy = { seed, calls };
    const expectedGenerator = legacyMulberry32(seed + (calls + 1) * 0x6d2b79f5);
    expect(nextRandom(legacy)).toBe(expectedGenerator());
    expect(legacy.calls).toBe(calls + 1);
    expect(legacy.state).toBeDefined();
  });

  it("randomInt 在闭区间内", () => {
    const r = createRng(99);
    for (let i = 0; i < 200; i++) {
      const v = randomInt(r, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("weightedDraw 尊重权重分布（大样本下高权重更常出现）", () => {
    const r = createRng(123);
    const items = [
      { item: "common", weight: 90 },
      { item: "rare", weight: 10 },
    ];
    let common = 0;
    for (let i = 0; i < 1000; i++) {
      if (weightedDraw(r, items) === "common") common++;
    }
    expect(common).toBeGreaterThan(800);
    expect(common).toBeLessThan(1000);
  });

  it("chance(1) 恒真，chance(0) 恒假", () => {
    const r = createRng(5);
    expect(chance(r, 1)).toBe(true);
    expect(chance(r, 0)).toBe(false);
  });
});

function legacyMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    let t = a += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
