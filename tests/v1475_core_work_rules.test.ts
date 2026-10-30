import {completeWork} from '../src/game/core/jobs';
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction, waitHere } from "../src/game/core/actions";
import { gameDay } from "../src/game/core/calendar";
import { nap, settlementAnchorKey } from "../src/game/core/time";

describe("v1.475 industrial work completion", () => {
  it.each([
    ["steel_shift", "steel_factory"],
    ["glass_quality_shift", "glass_factory"],
    ["aluminum_recycle_shift", "aluminum_factory"],
  ])("%s enters shared work records without retired daily goals", (actionId, locationId) => {
    const state = createInitialState(1475);
    state.locationId = locationId;
    state.time.hour = 12;
    state.flags.route_heavy_industry = true;
    state.player.attrs.health = 100;
    state.player.attrs.stamina = 100;
    state.player.attrs.satiety = 100;
    state.player.attrs.hygiene = 100;
    state.player.stats.intelligence = 100;
    state.player.skills.operation = 5;
    state.flags.goal_worked = false;
    const moneyBefore = state.player.money;

    const result = performAction(state, actionId);

    expect(result.ok, result.reason).toBe(true);
    completeWork(state,state.work!.active!.id,1);
    expect(state.player.money).toBeGreaterThan(moneyBefore);
    expect(state.flags.goal_worked).toBeUndefined();
    expect(state.flags.ever_worked).toBe(true);
    expect(state.flags.jobs_done_count).toBe(1);
    expect(state.weekly.jobsDone).toBe(1);
    expect(state.career.experience?.operation).toBe(1);
    expect(state.work?.wageRecords.at(-1)).toMatchObject({ jobId: actionId, kind: "day" });
  });
});

describe("v1.475 wage action admission", () => {
  it("internet night work rejects depression and dirt before marking the daily shift", () => {
    for (const blocked of ["depressed", "dirty"] as const) {
      const state = createInitialState(1475);
      state.locationId = "internet_cafe";
      state.time.hour = 12;
      state.player.attrs.health = 100;
      state.player.attrs.stamina = 100;
      state.player.attrs.satiety = 100;
      state.player.attrs.hygiene = blocked === "dirty" ? 14 : 100;
      if (blocked === "depressed") state.statuses.push({ id: "depressed", severity: 2, count: 7 });
      const moneyBefore = state.player.money;

      const result = performAction(state, "internet_night_job");

      expect(result.ok).toBe(false);
      expect(state.player.money).toBe(moneyBefore);
      expect(state.flags.internet_night_job_day).toBeUndefined();
      expect(state.weekly.jobsDone).toBe(0);
    }
  });

  it("exhaustion or starvation cannot pay the shift wage", () => {
    const state = createInitialState(1475);
    state.locationId = "internet_cafe";
    state.time.hour = 12;
    state.player.attrs.health = 100;
    state.player.attrs.hygiene = 100;
    state.player.attrs.stamina = 0;
    state.player.attrs.satiety = 0;
    const wageBefore = state.player.money;

    const result = performAction(state, "internet_night_job");

    expect(result.ok).toBe(false);
    expect(state.player.money).toBeLessThanOrEqual(wageBefore);
    expect(state.flags.internet_night_job_day).toBeUndefined();
    expect(state.weekly.jobsDone).toBe(0);
    expect(state.work?.wageRecords ?? []).toHaveLength(0);
  });
});

describe("v1.475 calendar-day settlement during awake time", () => {
  function leaseState() {
    const state = createInitialState(1475);
    state.time.day = 2;
    state.time.hour = 20;
    state.living.mode = "lease";
    state.living.lease = {
      housingId: "old_apartment",
      rent: 1000,
      rentGrowthCount: 12,
      nextRentDay: gameDay(state.time),
    };
    state.player.money = 5000;
    state.player.attrs.health = 80;
    state.player.attrs.hygiene = 70;
    state.player.attrs.stamina = 40;
    state.player.attrs.satiety = 100;
    return state;
  }

  it("waiting across midnight applies one day of survival decay and due rent", () => {
    const state = leaseState();

    const result = waitHere(state, 12);

    expect(result.ok).toBe(true);
    expect(state.time.day).toBe(3);
    expect(state.time.hour).toBe(8);
    expect(state.player.money).toBe(4000);
    expect(state.player.attrs.health).toBeCloseTo(78.5, 5);
    expect(state.player.attrs.hygiene).toBe(64);
    expect(state.flags.settledAnchor).toBe(settlementAnchorKey(2026, 8, 2));

    waitHere(state, 2); // 同一自然日继续活动不能重复结算
    expect(state.player.money).toBe(4000);
    expect(state.player.attrs.health).toBeCloseTo(78.5, 5);
    expect(state.player.attrs.hygiene).toBe(64);
  });

  it("a nap that crosses midnight settles the previous date without sleep recovery effects", () => {
    const state = leaseState();
    state.player.attrs.mood = 50;
    state.time.hour = 22;

    const beforeMood = state.player.attrs.mood;
    const beforeHealth = state.player.attrs.health;
    const beforeHygiene = state.player.attrs.hygiene;
    nap(state, 2);

    expect(state.time.day).toBe(3);
    expect(state.time.hour).toBe(0);
    expect(state.player.money).toBe(4000);
    expect(state.player.attrs.health).toBeCloseTo(beforeHealth - 1.5, 5);
    expect(state.player.attrs.hygiene).toBe(beforeHygiene - 6);
    expect(state.player.attrs.mood).toBe(beforeMood + 3); // 只有小睡加成，无睡眠恢复/惩罚
    expect(state.player.attrs.stamina).toBe(70); // 原本 40，小睡恢复 30%；结算本身不额外恢复
  });
});
