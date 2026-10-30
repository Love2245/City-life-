import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours } from "../src/game/core/time";
import {
  applyForJob, checkJobRequirements, completeWork, deliveryParttimeBasePay,
  getJobDef, getTodayOffers, JOB_DEFS, mergedJobEffects, performJob,
  refreshLaborMarket, resolveVehicle, settleJobEffects, takeJobOffer,
} from "../src/game/core/jobs";

describe("labor market v1.465", () => {
  it("generates three to six reproducible day offers and refreshes once per date", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = createInitialState(seed), b = createInitialState(seed);
      refreshLaborMarket(a); refreshLaborMarket(b);
      expect(a.laborMarket.offers.map(o => o.jobId)).toEqual(b.laborMarket.offers.map(o => o.jobId));
      expect(a.laborMarket.offers.length).toBeGreaterThanOrEqual(3);
      expect(a.laborMarket.offers.length).toBeLessThanOrEqual(6);
      expect(getTodayOffers(a).every(({ def }) => def.kind === "day")).toBe(true);
      const before = a.laborMarket.offers.map(o => o.uid);
      refreshLaborMarket(a);
      expect(a.laborMarket.offers.map(o => o.uid)).toEqual(before);
      advanceHours(a, 24);
      expect(a.laborMarket.generatedDay).toBeGreaterThan(0);
    }
  });

  it("checks every configured job requirement before formal hiring", () => {
    expect(JOB_DEFS).toHaveLength(36);
    for (const job of JOB_DEFS) {
      const state = createInitialState(1);
      state.player.attrs.health = 100;
      state.player.attrs.stamina = 100;
      state.player.stats.intelligence = 100;
      state.player.stats.charm = 100;
      for (const key of Object.keys(state.player.skills) as Array<keyof typeof state.player.skills>) {
        state.player.skills[key] = 10;
      }
      if (job.requirements?.flag) state.flags[job.requirements.flag] = true;
      state.flags.item_training_cert = true;
      expect(checkJobRequirements(state, job).ok, job.id).toBe(true);
      if (job.kind === "formal") {
        expect(applyForJob(state, job).ok, job.id).toBe(true);
        expect(state.career.jobId).toBe(job.id);
      }
    }

    const blocked = createInitialState(2);
    const cafe = getJobDef("job_cafe_staff")!;
    expect(checkJobRequirements(blocked, cafe).ok).toBe(false);
    expect(applyForJob(blocked, cafe).ok).toBe(false);
    expect(blocked.career.jobId).toBeNull();
  });

  it("starts a market day job immediately but consumes time and pays only after completion", () => {
    const state = createInitialState(22);
    state.time.day = 3;
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "one", jobId: "job_express", quota: 1 }];
    const cash = state.player.money, time = state.time.hour;
    const start = takeJobOffer(state, "one");
    expect(start.ok).toBe(true);
    expect(start.mode).toBe("worked");
    expect(state.laborMarket.offers[0].quota).toBe(0);
    expect(state.time.hour).toBe(time);
    expect(state.player.money).toBe(cash);
    expect(state.quests.some(q => q.jobId === "job_express")).toBe(false);
    expect(completeWork(state, start.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBeGreaterThan(cash);
    expect(state.time.hour).not.toBe(time);
    expect(takeJobOffer(state, "one").ok).toBe(false);
  });

  it.each([
    ["D", 0.2, 0], ["C", 0.4, 0.5], ["B", 0.6, 0.85], ["A", 0.8, 1], ["S", 0.95, 1],
  ] as const)("%s 级工作表现按比例结算基础工资", (_grade, score, multiplier) => {
    const state = createInitialState(220 + Math.round(score * 100));
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "quality-job", jobId: "job_factory_line", quota: 1 }];
    const started = takeJobOffer(state, "quality-job");
    expect(started.ok, started.reason).toBe(true);
    const quotedBase = started.session!.baseWage;
    expect(completeWork(state, started.session!.id, score).ok).toBe(true);
    expect(state.work!.wageRecords.at(-1)?.base).toBe(Math.round(quotedBase * multiplier));
  });

  it("on-site day job is limited to once per date", () => {
    const state = createInitialState(23);
    state.locationId = "farm";
    const started = performJob(state, "job_farm_hand");
    expect(started.ok).toBe(true);
    expect(completeWork(state, started.session!.id, 1).ok).toBe(true);
    expect(performJob(state, "job_farm_hand").ok).toBe(false);
  });

  it("formal work requires hiring and workplace, then credits the weekly ledger", () => {
    const state = createInitialState(24);
    state.time.day = 3;
    state.time.hour = 5;
    const job = getJobDef("job_cafe_staff")!;
    expect(performJob(state, job.id).ok).toBe(false);
    state.flags.item_training_cert = true;
    expect(applyForJob(state, job).ok).toBe(true);
    expect(performJob(state, job.id).ok).toBe(false);
    state.locationId = job.locationId!;
    const cash = state.player.money;
    const started = performJob(state, job.id);
    expect(started.ok).toBe(true);
    expect(completeWork(state, started.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(cash);
    expect(state.career.accruedWages).toBeGreaterThan(0);
  });

  it("an owned vehicle is a bonus; employer's supplied equipment never lowers the listed base pay", () => {
    const state = createInitialState(25);
    const job = getJobDef("job_delivery")!;
    expect(resolveVehicle(state)).toBe("none");
    const baseline = mergedJobEffects(state, job).money!;
    expect(baseline).toBe(job.effects.money);
    state.flags.item_bicycle = true;
    expect(resolveVehicle(state)).toBe("bicycle");
    expect(mergedJobEffects(state, job).money!).toBeGreaterThan(baseline);
    state.flags.item_e_bike = true;
    expect(resolveVehicle(state)).toBe("e_bike");
    expect(mergedJobEffects(state, job).money!).toBeGreaterThan(baseline);
    expect(settleJobEffects(state, job).money!).toBeGreaterThanOrEqual(baseline);
  });

  it("phone delivery part-time retains the existing vehicle-tier base pay", () => {
    const state = createInitialState(26);
    expect(deliveryParttimeBasePay(state)).toBe(15);
    state.flags.item_bicycle = true;
    expect(deliveryParttimeBasePay(state)).toBe(19);
    state.flags.item_e_bike = true;
    expect(deliveryParttimeBasePay(state)).toBe(25);
    state.flags.item_car = true;
    expect(deliveryParttimeBasePay(state)).toBe(28);
  });
});
