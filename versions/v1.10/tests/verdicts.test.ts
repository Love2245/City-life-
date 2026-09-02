import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { ACTIONS } from "../src/game/core/actions";
import { JOB_DEFS } from "../src/game/core/jobs";
import { pickVerdict } from "../src/game/engine";

describe("评价文案：数据完整性", () => {
  it("每个行动 verdicts ≥ 6 条", () => {
    for (const a of ACTIONS) {
      expect(a.verdicts?.length ?? 0, `${a.id} verdicts 不足 6 条`).toBeGreaterThanOrEqual(6);
    }
  });

  it("每个工作 verdicts ≥ 6 条", () => {
    for (const j of JOB_DEFS) {
      expect(j.verdicts?.length ?? 0, `${j.id} verdicts 不足 6 条`).toBeGreaterThanOrEqual(6);
    }
  });

  it("同 seed 抽签可复现", () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    const va = pickVerdict(a, ["x", "y", "z"]);
    const vb = pickVerdict(b, ["x", "y", "z"]);
    expect(va).toBe(vb);
  });

  it("无 verdicts 时返回通用文案", () => {
    const s = createInitialState();
    expect(pickVerdict(s)).toBe("今天也努力了。");
  });
});