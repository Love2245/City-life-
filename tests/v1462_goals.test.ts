import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  claimNextGrowthHint,
  completeTutorialStep,
  getLongTermGoals,
  TUTORIAL_STEPS,
} from "../src/game/core/tutorial";

function finishTutorial(state: ReturnType<typeof createInitialState>): void {
  for (const step of TUTORIAL_STEPS) completeTutorialStep(state, step.id);
}

describe("v1.462 教程与人生目标", () => {
  it("保留原有九个生存教程步骤及顺序", () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      "open_phone",
      "eat_meal",
      "commute_once",
      "find_job",
      "work_once",
      "save_game",
      "care_cat",
      "socialize",
      "rest_well",
    ]);
  });

  it("人生阶段目标从现有状态动态计算进度", () => {
    const state = createInitialState();

    let goals = getLongTermGoals(state);
    expect(goals.map((goal) => goal.id)).toEqual(["settle", "roots", "career", "life"]);
    expect(goals.find((goal) => goal.id === "settle")?.progress).toBe(0);
    expect(goals.find((goal) => goal.id === "career")?.progress).toBe(0);

    state.career.jobId = "service_assistant";
    state.living.mode = "lease";
    expect(getLongTermGoals(state).find((goal) => goal.id === "settle")?.progress).toBe(1);
    state.player.skills.programming = 5;
    state.flags["project_completed_indie_game"] = true;
    state.living.mode = "own";
    state.relationships = [
      { npcId: "friend_a", affinity: 75, state: "close_friend" },
      { npcId: "friend_b", affinity: 72, state: "close_friend" },
      { npcId: "friend_c", affinity: 71, state: "close_friend" },
    ];
    state.player.money = 6000;
    state.player.stats.fame = 50;

    goals = getLongTermGoals(state);
    expect(goals.find((goal) => goal.id === "settle")?.progress).toBe(1);
    expect(goals.find((goal) => goal.id === "roots")?.progress).toBe(1);
    expect(goals.find((goal) => goal.id === "career")?.progress).toBe(1);
    expect(goals.find((goal) => goal.id === "life")?.progress).toBeCloseTo(0.55);
    expect(state).not.toHaveProperty("longTermGoals");
  });

  it("成长提示受九步教程门控，且一次只认领一条并只记录一次", () => {
    const state = createInitialState();
    state.player.money = 1500;
    expect(claimNextGrowthHint(state)).toBeNull();

    finishTutorial(state);
    const first = claimNextGrowthHint(state);
    expect(first?.id).toBe("growth_cash_1000");
    expect(state.flags["growth_hint_seen_growth_cash_1000"]).toBe(true);
    expect(claimNextGrowthHint(state)).toBeNull();
  });

  it("五类成长条件逐条解锁，市中心旧到访记录可识别", () => {
    const currentVisit = createInitialState();
    finishTutorial(currentVisit);
    currentVisit.area = "downtown_center";
    expect(claimNextGrowthHint(currentVisit)?.id).toBe("growth_downtown_center");

    const state = createInitialState();
    finishTutorial(state);

    // 共享地点的历史记录无法说明所在区域，不应误判成进入过市中心。
    state.seen.locationsVisited = ["convenience_store"];
    expect(claimNextGrowthHint(state)).toBeNull();

    state.player.money = 1000;
    state.seen.locationsVisited.push("library");
    state.player.skills.design = 3;
    state.relationships = [{ npcId: "friend_a", affinity: 40, state: "friend" }];
    state.unlockedEndings = ["ending_rich"];

    const claimed: string[] = [];
    let next = claimNextGrowthHint(state);
    while (next) {
      claimed.push(next.id);
      next = claimNextGrowthHint(state);
    }

    expect(claimed).toEqual([
      "growth_cash_1000",
      "growth_downtown_center",
      "growth_skill_3",
      "growth_friend",
      "growth_ending",
    ]);
    expect(claimNextGrowthHint(state)).toBeNull();
    expect(state).not.toHaveProperty("growthHints");
  });
});
