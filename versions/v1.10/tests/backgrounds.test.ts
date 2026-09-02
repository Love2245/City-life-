import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyBackgrounds, BACKGROUNDS } from "../src/game/core/backgrounds";

describe("背景选择：应用经历", () => {
  it("空选择无副作用", () => {
    const s = createInitialState();
    const money0 = s.player.money;
    applyBackgrounds(s, {});
    expect(s.player.money).toBe(money0);
  });

  it("未知维度/选项无副作用", () => {
    const s = createInitialState();
    const before = JSON.stringify(s);
    applyBackgrounds(s, { nonExistent: "x", family: "nonExistentOpt" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("应用已知选项：金钱 +200（占位 A）", () => {
    const s = createInitialState();
    const money0 = s.player.money;
    applyBackgrounds(s, { family: "family_placeholder_a" });
    expect(s.player.money).toBe(money0 + 200);
  });

  it("应用已知选项：体质 +3（占位 B）", () => {
    const s = createInitialState();
    applyBackgrounds(s, { family: "family_placeholder_b" });
    expect(s.player.stats.fitness).toBeGreaterThan(30); // 默认 30 + 3
  });

  it("BACKGROUNDS 数据至少 1 个维度", () => {
    expect(BACKGROUNDS.dimensions.length).toBeGreaterThan(0);
  });
});