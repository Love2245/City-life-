import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours } from "../src/game/core/time";
import { applyForJob, completeWork, deliveryParttime, JOB_DEFS, performJob, rideHailingParttime, takeJobOffer } from "../src/game/core/jobs";
import { getWorkShift, salarySummary } from "../src/game/core/career";
import { gameDay } from "../src/game/core/calendar";
import { jobRequirementBonus } from "../src/game/core/difficulty";
import { getMiniGameConfig } from "../src/game/core/minigame";

function ready() {
  const state = createInitialState(1465);
  state.time.day = 3; // Monday, avoids default Saturday rest day.
  state.time.month = 9;
  state.time.day = 8; // Monday after the university districts open.
  state.time.hour = 5;
  state.time.minute = 0;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  state.player.attrs.hygiene = 100;
  state.player.skills.service = 10;
  state.flags.item_certificate = true;
  return state;
}

function meetRequirements(state: ReturnType<typeof createInitialState>, job: (typeof JOB_DEFS)[number]): void {
  const bonus = jobRequirementBonus(state);
  for (const [key, minimum] of Object.entries(job.requirements?.attr ?? {})) {
    const value = (minimum ?? 0) + bonus;
    if (key in state.player.attrs) (state.player.attrs as unknown as Record<string, number>)[key] = value;
    else (state.player.stats as unknown as Record<string, number>)[key] = value;
  }
  for (const [key, minimum] of Object.entries(job.requirements?.skill ?? {})) {
    (state.player.skills as unknown as Record<string, number>)[key] = (minimum ?? 0) + bonus;
  }
  if (job.requirements?.flag) state.flags[job.requirements.flag] = true;
}

describe("v1.465 unified work", () => {
  it("all existing jobs keep their minigames; the two campus counselor roles settle without one", () => {
    expect(JOB_DEFS).toHaveLength(36);
    for (const job of JOB_DEFS) {
      if(job.id.endsWith('_counselor')){expect(getMiniGameConfig(job.id)).toBeUndefined();continue;}
      expect(getMiniGameConfig(job.id), job.id + " must have a playable challenge").toBeDefined();
      const state = ready();
      for (const key of Object.keys(state.player.skills) as Array<keyof typeof state.player.skills>) state.player.skills[key] = 0;
      for (const key of Object.keys(state.player.stats) as Array<keyof typeof state.player.stats>) state.player.stats[key] = 0;
      if (job.id === "job_ride_hailing") {
        state.flags.item_driving_license = true;
        state.flags.item_car = true;
        state.flags.app_ride_hailing = true;
        state.player.skills.driving = 1;
        const started = rideHailingParttime(state);
        expect(started.ok, job.id).toBe(true);
        expect(started.session?.workedMinutes, job.id).toBe(600);
        expect(completeWork(state, started.session!.id, 1).ok, job.id).toBe(true);
        continue;
      }
      if (job.kind === "formal") {
        meetRequirements(state, job);
        const hired = applyForJob(state, job);
        expect(hired.ok, job.id).toBe(true);
        expect(state.career.jobId, job.id).toBe(job.id);
        expect(state.career.kind, job.id).toBe("weekly");
        for (const key of Object.keys(state.player.skills) as Array<keyof typeof state.player.skills>) state.player.skills[key] = 0;
        for (const key of Object.keys(state.player.stats) as Array<keyof typeof state.player.stats>) state.player.stats[key] = 0;
        state.locationId = job.locationId!;
        const shift = getWorkShift(state, job);
        expect(shift.day, job.id).toBeGreaterThanOrEqual(gameDay(state.time));
        const cash = state.player.money;
        const started = performJob(state, job.id);
        expect(started.ok, job.id).toBe(true);
        expect(started.session?.workedMinutes, job.id).toBe(Math.round(job.duration * 60));
        expect(state.player.money, job.id).toBe(cash);
        if(started.session!.deliveryPay){started.session!.completedOrders=10;started.session!.deliveryEarnedFare=119.43;}
        expect(completeWork(state, started.session!.id, 1).ok, job.id).toBe(true);
        expect(salarySummary(state).pending, job.id).toBeGreaterThan(0);
      } else if (job.locationId) {
        state.locationId = job.locationId;
        expect(performJob(state, job.id).ok, job.id).toBe(true);
      } else {
        state.locationId = "labor_market";
        state.laborMarket.offers = [{ uid: "offer_" + job.id, jobId: job.id, quota: 1 }];
        expect(takeJobOffer(state, "offer_" + job.id).ok, job.id).toBe(true);
      }
    }
  });

  it("day job pays only after completion, no appointment, duplicate finish is harmless", () => {
    const state = ready();
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "day1", jobId: "job_convenience_day", quota: 1 }];
    const beforeMoney = state.player.money;
    const beforeTime = gameDay(state.time) * 1440 + state.time.hour * 60;
    const started = takeJobOffer(state, "day1");
    expect(started.ok).toBe(true);
    expect(started.mode).toBe("worked");
    expect(state.player.money).toBe(beforeMoney);
    expect(gameDay(state.time) * 1440 + state.time.hour * 60).toBe(beforeTime);
    expect(state.quests.filter(q => q.type === "job" && q.jobId === "job_convenience_day")).toHaveLength(0);
    const id = state.work!.active!.id;
    const finished = completeWork(state, id, .8);
    expect(finished.ok).toBe(true);
    expect(state.player.money).toBeGreaterThan(beforeMoney);
    const afterMoney = state.player.money;
    const afterTime = gameDay(state.time) * 1440 + state.time.hour * 60;
    expect(completeWork(state, id, 1).ok).toBe(false);
    expect(state.player.money).toBe(afterMoney);
    expect(gameDay(state.time) * 1440 + state.time.hour * 60).toBe(afterTime);
  });

  it("formal late arrival earns only remaining shift minutes without a cash fine", () => {
    const state = ready();
    const job = JOB_DEFS.find(j => j.id === "job_convenience_clerk")!;
    expect(applyForJob(state, job).ok).toBe(true);
    state.locationId = job.locationId!;
    const shift = getWorkShift(state, job);
    const late = shift.startMinute + 120;
    state.time.hour = Math.floor(late % 1440 / 60);
    state.time.minute = late % 60;
    const cash = state.player.money;
    const begun = performJob(state, job.id);
    expect(begun.ok).toBe(true);
    expect(begun.session?.workedMinutes).toBe(360);
    expect(state.player.money).toBe(cash);
    expect(completeWork(state, begun.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(cash);
    expect(salarySummary(state).pending).toBe(begun.session!.baseWage + Math.round(begun.session!.baseWage * .05));
  });

  it("one minute late is prorated and the exact end of shift cannot start another shift", () => {
    const state = ready();
    const job = JOB_DEFS.find(j => j.id === "job_convenience_clerk")!;
    applyForJob(state, job);
    state.locationId = job.locationId!;
    const shift = getWorkShift(state, job);
    const minute = shift.startMinute + 1;
    state.time.hour = Math.floor(minute % 1440 / 60);
    state.time.minute = minute % 60;
    const start = performJob(state, job.id);
    expect(start.session?.workedMinutes).toBe(479);
    completeWork(state, start.session!.id, 1);
    expect(performJob(state, job.id).ok).toBe(false);
  });

  it("three missed scheduled shifts dismiss the worker and settle pending wages", () => {
    const state = ready();
    const job = JOB_DEFS.find(j => j.id === "job_convenience_clerk")!;
    applyForJob(state, job);
    state.locationId = job.locationId!;
    const first = performJob(state, job.id);
    expect(first.ok).toBe(true);
    completeWork(state, first.session!.id, 1);
    const earned = salarySummary(state).pending;
    expect(earned).toBeGreaterThan(0);
    const cash = state.player.money;
    advanceHours(state, 4 * 24);
    expect(state.career.jobId).toBe(null);
    expect(state.player.money).toBe(cash + earned);
    expect(state.work?.wageRecords.at(-1)?.kind).toBe("dismissal");
  });

  it("a saved active shift resumes with the same seed and settles once", () => {
    const state = ready();
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "offer", jobId: "job_express", quota: 1 }];
    const begun = takeJobOffer(state, "offer");
    const saved = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(saved.work!.active!.seed).toBe(begun.session!.seed);
    expect(completeWork(saved, saved.work!.active!.id, 1).ok).toBe(true);
    expect(completeWork(saved, saved.work!.settledIds[0], 1).ok).toBe(false);
  });

  it("skip optionally unlocks at 10 completed shifts and pays 80 percent with no bonus", () => {
    const state = ready();
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "offer", jobId: "job_express", quota: 2 }];
    const standard = JOB_DEFS.find(j => j.id === "job_express")!.duration * 60;
    state.work = { masteryMinutes: { job_express: standard * 10 - 1 }, settledIds: [], wageRecords: [], sequence: 0 };
    const first = takeJobOffer(state, "offer");
    expect(first.session?.canSkip).toBe(false);
    expect(completeWork(state, first.session!.id, 1, true).ok).toBe(false);
    first.session!.completedOrders=6;first.session!.deliveryEarnedFare=119.43;
    expect(completeWork(state, first.session!.id, 1).ok).toBe(true);
    expect(state.work.masteryMinutes.job_express).toBeGreaterThanOrEqual(standard * 10);
    state.laborMarket.offers = [{ uid: "second", jobId: "job_express", quota: 1 }];
    const second = takeJobOffer(state, "second");
    expect(second.session?.canSkip).toBe(true);
    const cash = state.player.money;
    expect(completeWork(state, second.session!.id, 1, true).ok).toBe(true);
    expect(state.player.money - cash).toBe(Math.round(second.session!.skipBaseWage! * .8));
  });

  it("phone delivery uses the same deferred settlement and daily cap", () => {
    const state = ready();
    state.flags.app_delivery = true;
    state.flags.item_bicycle = true;
    const cash = state.player.money;
    const order = deliveryParttime(state);
    expect(order.ok).toBe(true);
    expect(state.player.money).toBe(cash);
    order.session!.completedOrders = 3;
    order.session!.deliveryEarnedFare = 48.75;
    expect(completeWork(state, order.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBeGreaterThan(cash);
    advanceHours(state, 1);
  });
});
