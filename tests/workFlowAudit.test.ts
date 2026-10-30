import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours } from "../src/game/core/time";
import { gameDay } from "../src/game/core/calendar";
import { getWorkShift, resignationSalaryPreview, resignJob, salarySummary } from "../src/game/core/career";
import { applyForJob, checkJobRequirements, completeWork, getJobDef, performJob, settleJobEffects, takeJobOffer } from "../src/game/core/jobs";

const clerk = getJobDef("job_convenience_clerk")!;
const cafe = getJobDef("job_cafe_staff")!;
function morning(day = 3) {
  const state = createInitialState(318);
  state.time.day = day;
  state.time.hour = 5;
  state.time.minute = 0;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  state.player.attrs.hygiene = 100;
  state.flags.item_certificate = true;
  state.player.skills.service = 3;
  return state;
}
function workOne(state: ReturnType<typeof morning>, job = clerk) {
  state.locationId = job.locationId!;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  const started = performJob(state, job.id);
  expect(started.ok, started.reason).toBe(true);
  expect(completeWork(state, started.session!.id, 1).ok).toBe(true);
}

describe("v1.465 work flow regression", () => {
  it("resignation pays accrued wages once; switching settles old job and hires new one atomically", () => {
    const state = morning();
    applyForJob(state, clerk);
    workOne(state);
    const accrued = resignationSalaryPreview(state);
    expect(accrued).toBeGreaterThan(0);
    const before = state.player.money;
    expect(applyForJob(state, cafe, false).ok).toBe(false);
    expect(state.career.jobId).toBe(clerk.id);
    expect(applyForJob(state, cafe, true).ok).toBe(true);
    expect(state.player.money).toBe(before + accrued);
    expect(state.career.jobId).toBe(cafe.id);
    expect(resignationSalaryPreview(state)).toBe(0);
    expect(resignJob(state).ok).toBe(true);
    expect(resignJob(state).ok).toBe(false);
  });

  it("early arrival waits once and still ends at scheduled end", () => {
    const state = morning();
    applyForJob(state, clerk);
    state.locationId = clerk.locationId!;
    const shift = getWorkShift(state, clerk);
    expect(shift.phase).toBe("early");
    const start = performJob(state, clerk.id);
    expect(start.ok).toBe(true);
    expect(start.session?.startMinute).toBe(shift.startMinute);
    expect(start.session?.endMinute).toBe(shift.endMinute);
    const same = performJob(state, clerk.id);
    expect(same.session?.id).toBe(start.session?.id);
    completeWork(state, start.session!.id, 1);
    expect(state.career.workedDays).toBe(1);
  });

  it("late work pays by actual minutes, never deducts existing wallet cash", () => {
    const state = morning();
    applyForJob(state, clerk);
    state.locationId = clerk.locationId!;
    const shift = getWorkShift(state, clerk);
    state.time.hour = Math.floor((shift.startMinute + 120) % 1440 / 60);
    state.time.minute = 0;
    const cash = state.player.money;
    const start = performJob(state, clerk.id);
    expect(start.session?.workedMinutes).toBe(360);
    expect(start.session?.baseWage).toBe(Math.round(settleJobEffects(state, clerk).money! * .75));
    completeWork(state, start.session!.id, 1);
    expect(state.player.money).toBe(cash);
    expect(salarySummary(state).pending).toBe(start.session!.baseWage + Math.round(start.session!.baseWage * .05));
  });

  it("three scheduled absences dismiss and settle wages, with rest days ignored", () => {
    const state = morning();
    applyForJob(state, clerk);
    workOne(state);
    const accrued = resignationSalaryPreview(state);
    const cash = state.player.money;
    advanceHours(state, 5 * 24);
    expect(state.career.jobId).toBe(null);
    expect(state.player.money).toBe(cash + accrued);
    expect(state.work?.wageRecords.at(-1)?.kind).toBe("dismissal");
  });

  it("reapplying to the same job is idempotent and cannot double its current shift", () => {
    const state = morning();
    expect(applyForJob(state, clerk).ok).toBe(true);
    const hiredDay = state.career.hiredDay;
    expect(applyForJob(state, clerk).newlyHired).toBe(false);
    expect(state.career.hiredDay).toBe(hiredDay);
    workOne(state);
    expect(performJob(state, clerk.id).ok).toBe(false);
  });

  it("formal hiring honors configured requirements and work still checks survival state", () => {
    const state = morning();
    const advanced = getJobDef("job_factory_tech")!;
    state.player.stats.intelligence = 40;
    for (const key of Object.keys(state.player.skills) as Array<keyof typeof state.player.skills>) state.player.skills[key] = 0;
    expect(checkJobRequirements(state, advanced).ok).toBe(true);
    expect(applyForJob(state, advanced).ok).toBe(true);
    state.locationId = advanced.locationId!;
    state.player.attrs.hygiene = 0;
    expect(performJob(state, advanced.id).ok).toBe(false);
  });

  it("market day work does not reserve a future date even when accepted late at night", () => {
    const state = morning();
    state.time.hour = 22;
    state.locationId = "labor_market";
    state.laborMarket.offers = [{ uid: "day", jobId: "job_convenience_day", quota: 1 }];
    const day = gameDay(state.time);
    const started = takeJobOffer(state, "day");
    expect(started.ok).toBe(true);
    expect(started.session?.day).toBe(day);
    expect(state.quests.some(q => q.jobId === "job_convenience_day")).toBe(false);
  });

  it("seven-day payday stays aligned across 30-day month boundary and records attendance bonus", () => {
    const state = morning(25);
    expect(applyForJob(state, clerk).ok).toBe(true);
    state.locationId = clerk.locationId!;
    const firstPayday = state.career.nextPayDay!;
    const before = state.player.money;
    let accrued = 0;
    while (true) {
      const shift = getWorkShift(state, clerk);
      if (shift.day >= firstPayday) break;
      const now = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
      advanceHours(state, (shift.startMinute - now) / 60);
      workOne(state);
      state.flags.ateToday = true; // 本用例隔离发薪日历；假定角色每天吃到一顿员工餐
      accrued = salarySummary(state).pending;
    }
    const midnight = firstPayday * 1440;
    const now = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
    advanceHours(state, (midnight - now) / 60);
    expect(state.time.month).toBe(9);
    expect(state.career.jobId).toBe(clerk.id);
    expect(state.player.money).toBeGreaterThan(before);
    expect(state.work?.wageRecords.at(-1)?.kind).toBe("weekly");
    expect(state.work?.wageRecords.at(-1)?.base).toBeGreaterThan(0);
    expect(state.work?.wageRecords.at(-1)?.attendanceBonus).toBeGreaterThan(0);
    expect(state.career.nextPayDay).toBe(firstPayday + 7);
    expect(accrued).toBeGreaterThan(0);
  });
});
