import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours } from "../src/game/core/time";
import { completeWork, takeJobOffer, workQuestJob } from "../src/game/core/jobs";
import { gameDay } from "../src/game/core/calendar";

function marketAt(hour: number) {
  const state = createInitialState(11);
  state.time.hour = hour;
  state.time.minute = 0;
  state.locationId = "labor_market";
  state.laborMarket.offers = [{ uid: "convenience", jobId: "job_convenience_day", quota: 1 }];
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  return state;
}

describe("v1.465 day work starts immediately", () => {
  it("22:00 starts this job now, reserves one quota and creates no next-day booking", () => {
    const state = marketAt(22);
    const day = gameDay(state.time);
    const cash = state.player.money;
    const result = takeJobOffer(state, "convenience");
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("worked");
    expect(result.session?.day).toBe(day);
    expect(result.session?.startMinute).toBe(day * 1440 + 22 * 60);
    expect(state.player.money).toBe(cash);
    expect(state.laborMarket.offers[0].quota).toBe(0);
    expect(state.quests.some(q => q.jobId === "job_convenience_day")).toBe(false);
  });

  it("early hour behaves the same and repeat click resumes the reserved shift", () => {
    const state = marketAt(7);
    const first = takeJobOffer(state, "convenience");
    expect(first.ok).toBe(true);
    const again = takeJobOffer(state, "convenience");
    expect(again.ok).toBe(true);
    expect(again.session?.id).toBe(first.session?.id);
    expect(state.laborMarket.offers[0].quota).toBe(0);
  });

  it("after-hours daily work has no late cash fine or booking", () => {
    const state = marketAt(13);
    const before = state.player.money;
    const started = takeJobOffer(state, "convenience");
    expect(started.ok).toBe(true);
    expect(state.player.money).toBe(before);
    const finished = completeWork(state, started.session!.id, 1);
    expect(finished.ok).toBe(true);
    expect(state.player.money).toBeGreaterThan(before);
    expect(state.quests.some(q => q.jobId === "job_convenience_day")).toBe(false);
  });

  it("crossing midnight during an active shift does not charge or reopen the same quota", () => {
    const state = marketAt(22);
    const started = takeJobOffer(state, "convenience");
    const cash = state.player.money;
    completeWork(state, started.session!.id, 1);
    expect(gameDay(state.time)).toBeGreaterThan(started.session!.day);
    expect(state.player.money).toBeGreaterThan(cash);
    const after = state.player.money;
    expect(completeWork(state, started.session!.id, 1).ok).toBe(false);
    expect(state.player.money).toBe(after);
  });

  it("an obsolete future daily quest cannot start work before its saved date", () => {
    const state = marketAt(7);
    const future = gameDay(state.time) + 1;
    const result = workQuestJob(state, { jobId: "job_convenience_day", offerUid: "convenience", day: future });
    expect(result.ok).toBe(false);
    expect(state.work?.active).toBeUndefined();
    advanceHours(state, 24);
    expect(gameDay(state.time)).toBe(future);
  });
});
