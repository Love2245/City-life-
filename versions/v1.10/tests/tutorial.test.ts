import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  completeTutorialStep,
  currentTutorialStep,
  isTutorialDone,
  checkTutorialProgress,
  TUTORIAL_STEPS,
} from "../src/game/core/tutorial";
import { applyEffects } from "../src/game/engine";
import { sleepSettlement } from "../src/game/core/time";

describe("新手引导 v0.94", () => {
  it("初始状态：引导未完成，第一步是「熟悉手机」", () => {
    const s = createInitialState();
    expect(isTutorialDone(s)).toBe(false);
    expect(s.tutorial.done.length).toBe(0);
    const cur = currentTutorialStep(s);
    expect(cur?.index).toBe(0);
    expect(cur?.def.id).toBe("open_phone");
  });

  it("completeTutorialStep：完成一步、幂等拒绝、未知 id 拒绝", () => {
    const s = createInitialState();
    expect(completeTutorialStep(s, "open_phone")).toBe(true);
    expect(s.tutorial.done).toContain("open_phone");
    expect(completeTutorialStep(s, "open_phone")).toBe(false); // 已存在
    expect(completeTutorialStep(s, "unknown_step")).toBe(false);
    expect(currentTutorialStep(s)?.def.id).toBe("eat_meal");
  });

  it("条件链：未完成前置步骤时，即使条件满足也不推进", () => {
    const s = createInitialState();
    s.flags["ateToday"] = true; // 吃了饭，但没打开过手机
    const newly = checkTutorialProgress(s);
    expect(newly).toEqual([]);
    expect(s.tutorial.done).toEqual([]);
  });

  it("按序自动推进：吃饭 → 入职 → 第一笔收入 → 睡觉", () => {
    const s = createInitialState();
    completeTutorialStep(s, "open_phone");

    // 吃饭（applyEffects satiety>0 写 ateToday，并触发 checkTutorialProgress）
    applyEffects(s, { satiety: 30 }, "🍜");
    expect(s.tutorial.done).toContain("eat_meal");

    // 入职（ever_worked 或 career.jobId）
    s.flags["ever_worked"] = true;
    checkTutorialProgress(s);
    expect(s.tutorial.done).toContain("find_job");

    // 第一笔收入（jobs_done_count ≥ 1）
    s.flags["jobs_done_count"] = 1;
    checkTutorialProgress(s);
    expect(s.tutorial.done).toContain("work_once");

    // 睡觉（sleepSettlement 写 slept_once；进度检查由下次 applyEffects 触发）
    sleepSettlement(s, { stayedUp: false, hours: 8 });
    expect(s.flags["slept_once"]).toBe(true);
    applyEffects(s, { mood: 1 });
    expect(s.tutorial.done).toContain("rest_well");
  });

  it("全部完成后 isTutorialDone=true 且 activeStep=-1", () => {
    const s = createInitialState();
    for (const step of TUTORIAL_STEPS) completeTutorialStep(s, step.id);
    expect(isTutorialDone(s)).toBe(true);
    expect(currentTutorialStep(s)).toBeNull();
    expect(s.tutorial.activeStep).toBe(TUTORIAL_STEPS.length); // 最后一轮推进后 +1
  });

  it("applyEffects 集成：正常路径逐步推进到全部完成", () => {
    const s = createInitialState();
    completeTutorialStep(s, "open_phone");
    applyEffects(s, { satiety: 30 }, "🍜"); // eat
    s.flags["ever_worked"] = true;
    s.flags["jobs_done_count"] = 1;
    s.flags["slept_once"] = true;
    applyEffects(s, { mood: 1 }); // 一次结算链式推进 find_job → work_once → rest_well
    expect(isTutorialDone(s)).toBe(true);
  });

  it("TUTORIAL_STEPS 覆盖五步首日引导", () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      "open_phone",
      "eat_meal",
      "find_job",
      "work_once",
      "rest_well",
    ]);
  });
});
