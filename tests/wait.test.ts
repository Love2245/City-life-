import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  waitHere,
  waitOptions,
  getLocation,
  WAIT_MAX_HOURS,
  SMART_WAIT_HOURS_CAP,
} from "../src/game/core/actions";

function moodDeltaOf(r: ReturnType<typeof waitHere>): number {
  return r.result?.deltas.find((d) => d.key === "mood")?.value ?? 0;
}

describe("等待系统：固定档位与上限（v1.43）", () => {
  it("WAIT_MAX_HOURS 提升到 12", () => {
    expect(WAIT_MAX_HOURS).toBe(12);
  });

  it("waitOptions 提供分钟微调和常用小时档（地点营业中无智能档）", () => {
    const s = createInitialState();
    s.locationId = "library"; // 7-18 营业，hour=12 在营业中
    s.time.hour = 12;
    const tiers = waitOptions(s);
    expect(tiers.map((t) => t.hours)).toEqual([1 / 60, 5 / 60, 0.5, 1, 2, 3, 6, 12]);
    expect(tiers.every((t) => !t.smart)).toBe(true);
  });

  it("普通等待被 clamp 到 12h 上限", () => {
    const s = createInitialState();
    const r = waitHere(s, 20); // 超过 12h 的普通等待请求
    expect(r.ok).toBe(true);
    expect(r.result?.duration).toBe(12);
  });

  it("半小时不计心情惩罚", () => {
    const s = createInitialState();
    s.player.attrs.mood = 50;
    const r = waitHere(s, 0.5);
    expect(r.result?.duration).toBe(0.5);
    expect(moodDeltaOf(r)).toBe(0);
  });

  it("等待结果文案说明心情消耗", () => {
    const s = createInitialState();
    s.player.attrs.mood = 50;
    const r = waitHere(s, 12);
    const log = s.log[s.log.length - 1];
    expect(log.text).toContain("消耗了 4 点心情");
    expect(r.result?.verdict).toContain("耗了 4 点心情");
  });
});

describe("等待系统：心情惩罚封顶（单次最多 -4）", () => {
  it("12h 等待心情只扣 4（不再扣 12）", () => {
    const s = createInitialState();
    s.player.attrs.mood = 50;
    const r = waitHere(s, 12);
    expect(moodDeltaOf(r)).toBe(-4);
    expect(s.player.attrs.mood).toBe(46);
  });
  it("6h 等待心情从 -6 封顶到 -4", () => {
    const s = createInitialState();
    s.player.attrs.mood = 50;
    const r = waitHere(s, 6);
    expect(moodDeltaOf(r)).toBe(-4);
  });
  it("3h 等待心情扣 3（未触顶）", () => {
    const s = createInitialState();
    s.player.attrs.mood = 50;
    const r = waitHere(s, 3);
    expect(moodDeltaOf(r)).toBe(-3);
  });
});

describe("等待系统：智能档与上限解耦", () => {
  it("开门前提供「等到开门」智能档（缺口 2h）", () => {
    const s = createInitialState();
    s.locationId = "library"; // 7 点开门
    s.time.hour = 5;
    const smart = waitOptions(s).find((t) => t.smart);
    expect(smart).toBeDefined();
    expect(smart?.hours).toBe(2); // (7-5)
  });

  it("缺口超过 12h（≤18h）仍提供智能档，且可突破 12h 上限等到开门", () => {
    const lib = getLocation("library")!;
    const orig = lib.openHours;
    lib.openHours = { start: 14, end: 22 }; // 14 点开门
    try {
      const s = createInitialState();
      s.locationId = "library";
      s.time.hour = 1; // 缺口 (14-1+24)%24 = 13h
      const smart = waitOptions(s).find((t) => t.smart);
      expect(smart).toBeDefined();
      expect(smart?.hours).toBe(13);
      expect(smart!.hours).toBeGreaterThan(WAIT_MAX_HOURS);
      // 智能档允许等到 13h（放开默认上限）
      s.player.attrs.mood = 50;
      const r = waitHere(s, smart!.hours, { max: 24 });
      expect(r.ok).toBe(true);
      expect(r.result?.duration).toBe(13);
      expect(s.time.hour).toBe(14);
    } finally {
      lib.openHours = orig;
    }
  });

  it("缺口超过 18h 不提供智能档（避免等到隔日深夜）", () => {
    const lib = getLocation("library")!;
    const orig = lib.openHours;
    lib.openHours = { start: 23, end: 24 }; // 23 点才开门
    try {
      const s = createInitialState();
      s.locationId = "library";
      s.time.hour = 4; // 缺口 (23-4+24)%24 = 19h > 18
      const smart = waitOptions(s).find((t) => t.smart);
      expect(smart).toBeUndefined();
      expect(SMART_WAIT_HOURS_CAP).toBe(18);
    } finally {
      lib.openHours = orig;
    }
  });
});
