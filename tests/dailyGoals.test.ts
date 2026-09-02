import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  generateDailyGoals,
  markGoalWorked,
  tickDailyGoals,
} from "../src/game/core/quests";
import { performJob } from "../src/game/core/jobs";
import { advanceHours, sleep } from "../src/game/core/time";
import { gameDay } from "../src/game/core/calendar";

/** 与 quests.test.ts 同款：切到周一、补满体力健康，避免上班被拦 */
function ready(seed = 1) {
  const s = createInitialState(seed);
  s.time = { ...s.time, day: 3, hour: 8 }; // 2026-08-03 周一 08:00
  s.player.attrs.health = 90;
  s.player.attrs.stamina = 90;
  s.player.money = 1000;
  return s;
}

describe("v1.05 每日小目标（P1-1 接线）", () => {
  it("generateDailyGoals 生成 2 条且同日幂等", () => {
    const s = ready();
    const g1 = generateDailyGoals(s);
    expect(g1.length).toBe(2);
    expect(s.flags.goal_day).toBe(gameDay(s.time));
    const g2 = generateDailyGoals(s);
    expect(g2).toBe(g1); // 同日返回同一引用，不重复生成
    // 跨天应刷新
    advanceHours(s, 24);
    expect(s.flags.goal_day).toBe(gameDay(s.time));
    const g3 = generateDailyGoals(s);
    expect(g3.length).toBe(2);
  });

  it("advanceHours 跨天自动生成次日目标", () => {
    const s = ready();
    expect(s.dailyGoals).toBeUndefined();
    advanceHours(s, 24); // 08:00 -> 次日 08:00
    expect(s.flags.goal_day).toBe(gameDay(s.time));
    expect(Array.isArray(s.dailyGoals) && s.dailyGoals!.length).toBe(2);
  });

  it("markGoalWorked 标记今日干过活", () => {
    const s = ready();
    expect(s.flags.goal_worked).toBeFalsy();
    markGoalWorked(s);
    expect(s.flags.goal_worked).toBe(true);
  });

  it("performJob 上班后标记 work_once 目标", () => {
    const s = ready();
    s.time.hour = 9;
    generateDailyGoals(s);
    const r = performJob(s, "job_warehouse");
    expect(r.ok).toBe(true);
    expect(s.flags.goal_worked).toBe(true);
  });

  it("tickDailyGoals 结算已达成目标并发放心情奖励", () => {
    const s = ready();
    const rewards: number[] = [];
    s.dailyGoals = [
      { id: "t1", text: "测试达成", reward: { mood: 5 }, done: false, check: () => true },
      { id: "t2", text: "未达成", reward: { mood: 3 }, done: false, check: () => false },
    ] as any;
    const completed = tickDailyGoals(s, (m) => rewards.push(m));
    expect(completed).toBe(1);
    expect(rewards).toEqual([5]);
    expect((s.dailyGoals as any)[0].done).toBe(true);
    expect((s.dailyGoals as any)[1].done).toBe(false);
  });

  it("sleepSettlement 睡前结算已达成目标（不跨天，验证 tick 真正被调用）", () => {
    const s = ready();
    s.flags.goal_day = 3;
    s.dailyGoals = [
      { id: "t", text: "x", reward: { mood: 4 }, done: false, check: () => true },
    ] as any;
    sleep(s, 4); // 08:00 -> 12:00，不跨天，dailyGoals 不被 regeneration 覆盖
    const t = (s.dailyGoals as any).find((g: any) => g.id === "t");
    expect(t.done).toBe(true);
  });
});
