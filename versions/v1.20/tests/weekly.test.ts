import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { initWeekly, recordMoney, recordInteraction, recordJob, weeklySettlement } from "../src/game/core/weekly";
import { sleep } from "../src/game/core/time";
import { startStory } from "../src/game/core/story";
import { applyNewGameSetup } from "../src/game/core/profile";
import { STORY_DEFAULT_ALLOCATION } from "../src/game/core/story";
import type { GameState } from "../src/game/types";

/** 构造指定星期的状态（0=周一 … 6=周日）。开局 2026-08-01=周六=5，用 day 偏移逼近目标星期 */
function stateOnWeekday(target: number, seed = 1): GameState {
  const s = createInitialState(seed);
  // 2026-08-01 是周六（weekdayOf=5）；day 从 1 开始，weekdayOf(day) = (day+4) % 7
  // 需 weekdayOf === target → day = ((target - 5) % 7 + 7) % 7 + 1
  const day = ((target - 5 + 7) % 7) + 1;
  s.time.day = day;
  return s;
}

describe("v1.10 周记统计", () => {
  it("initWeekly 返回空统计", () => {
    const w = initWeekly();
    expect(w.earned).toBe(0);
    expect(w.spent).toBe(0);
    expect(w.pending).toBe(false);
    expect(w.report).toBeNull();
  });

  it("recordMoney 按正负分桶", () => {
    const s = createInitialState(1);
    recordMoney(s, 100);
    recordMoney(s, 50);
    recordMoney(s, -30);
    expect(s.weekly.earned).toBe(150);
    expect(s.weekly.spent).toBe(30);
  });

  it("recordInteraction / recordJob 累计", () => {
    const s = createInitialState(1);
    recordInteraction(s, "npc_chen_jie");
    recordInteraction(s, "npc_chen_jie");
    recordInteraction(s, "npc_wang_lei");
    recordJob(s);
    recordJob(s);
    expect(s.weekly.interactions["npc_chen_jie"]).toBe(2);
    expect(s.weekly.interactions["npc_wang_lei"]).toBe(1);
    expect(s.weekly.jobsDone).toBe(2);
  });

  it("周日结算：生成 report + pending，清零累计", () => {
    const s = stateOnWeekday(6); // 周日
    recordMoney(s, 200);
    recordMoney(s, -50);
    recordInteraction(s, "npc_chen_jie");
    recordJob(s);
    weeklySettlement(s);
    expect(s.weekly.pending).toBe(true);
    expect(s.weekly.report).not.toBeNull();
    expect(s.weekly.report!.earned).toBe(200);
    expect(s.weekly.report!.spent).toBe(50);
    expect(s.weekly.report!.interactions).toEqual([{ npcId: "npc_chen_jie", count: 1 }]);
    expect(s.weekly.report!.jobsDone).toBe(1);
    // 清零
    expect(s.weekly.earned).toBe(0);
    expect(s.weekly.spent).toBe(0);
    expect(s.weekly.interactions).toEqual({});
    expect(s.weekly.jobsDone).toBe(0);
  });

  it("v1.20 周日结算发放编程周入（计入本周收入）", () => {
    const s = stateOnWeekday(6); // 周日
    s.career.passiveIncome = 200;
    const m0 = s.player.money;
    weeklySettlement(s);
    expect(s.player.money).toBe(m0 + 200);
    expect(s.weekly.report!.earned).toBe(200);
  });

  it("非周日结算不动累计", () => {
    const s = stateOnWeekday(1); // 周一
    recordMoney(s, 100);
    weeklySettlement(s);
    expect(s.weekly.pending).toBe(false);
    expect(s.weekly.report).toBeNull();
    expect(s.weekly.earned).toBe(100);
  });

  it("剧情模式：report 含目标缺口", () => {
    const s = createInitialState(2);
    applyNewGameSetup(s, "destitute", STORY_DEFAULT_ALLOCATION, [], { fatePoints: 0, unlocked: { eternal: true, story: true }, boosts: {}, memoirs: [] }, "story");
    startStory(s, "repay_debt");
    s.story.goalFund = 5000;
    s.time.day = ((6 - 5 + 7) % 7) + 1; // 周日
    weeklySettlement(s);
    expect(s.weekly.report!.goalGap).toContain("15000");
  });

  it("sleep 周日晚触发结算（集成）", () => {
    const s = stateOnWeekday(6);
    s.time.hour = 23;
    s.player.money = 100;
    sleep(s, 8);
    expect(s.weekly.pending).toBe(true);
    expect(s.weekly.report).not.toBeNull();
  });
});
