import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import { nap } from "../src/game/core/time";
import { napWindowOpen, NAP_WINDOW_START, NAP_WINDOW_END } from "../src/game/core/actions";

describe("小睡窗口（v1.43 放宽到 07:00–22:00）", () => {
  it("NAP_WINDOW_START=7，NAP_WINDOW_END=22", () => {
    expect(NAP_WINDOW_START).toBe(7);
    expect(NAP_WINDOW_END).toBe(22);
  });

  it("07:00 与 22:00 可用；06:00 与 23:00 不可用", () => {
    expect(napWindowOpen(7)).toBe(true);
    expect(napWindowOpen(22)).toBe(true);
    expect(napWindowOpen(6)).toBe(false);
    expect(napWindowOpen(23)).toBe(false);
    expect(napWindowOpen(12)).toBe(true);
    expect(napWindowOpen(18)).toBe(true);
  });
});

describe("小睡机制：固定 2h、恢复上限 30%、不结算自然衰减", () => {
  it("12 点小睡 2h 到 14 点，体力 +30% 上限，健康不变", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 12;
    s.player.attrs.stamina = 30;
    const health0 = s.player.attrs.health;
    nap(s, 2);
    expect(s.time.hour).toBe(14);
    expect(s.player.attrs.stamina).toBeCloseTo(30 + 100 * 0.3, 5); // v0.93：小睡恢复 30%
    expect(s.player.attrs.health).toBe(health0); // 无自然衰减
  });

  it("窗口边界 07:00 与 22:00 仍可小睡（nap 函数本身不受窗口限制，窗口由 UI 门控）", () => {
    for (const h of [7, 22]) {
      const s = createInitialState();
      applyFamily(s, "ordinary");
      s.time.hour = h;
      s.player.attrs.stamina = 10;
      nap(s, 2);
      expect(s.player.attrs.stamina).toBeCloseTo(10 + 100 * 0.3, 5);
    }
  });
});
