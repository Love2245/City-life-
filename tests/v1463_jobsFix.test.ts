import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { salarySummary } from "../src/game/core/career";
import { applyForJob, completeWork, getJobDef, JOB_DEFS, performJob } from "../src/game/core/jobs";

describe("formal work compatibility in v1.465", () => {
  it("keeps 36 jobs, with 23 formal jobs including the commercial office", () => {
    expect(JOB_DEFS).toHaveLength(36);
    expect(JOB_DEFS.filter(j => j.kind === "day")).toHaveLength(13);
    expect(JOB_DEFS.filter(j => j.kind === "formal")).toHaveLength(23);
    expect(JOB_DEFS.every(j => j.kind === "day" || j.kind === "formal")).toBe(true);
    expect(JOB_DEFS.filter(j => j.kind === "formal").every(j => !!j.locationId)).toBe(true);
  });

  it("formerly fixed convenience clerk requires its listed skills and certificate, without recording attendance or pay", () => {
    const state = createInitialState(1463);
    state.time.day = 3;
    state.time.hour = 5;
    const job = getJobDef("job_convenience_clerk")!;
    state.player.skills.service = 2;
    state.flags.item_certificate = true;
    const cash = state.player.money;
    expect(job.kind).toBe("formal");
    expect(applyForJob(state, job).ok).toBe(true);
    expect(state.career.jobId).toBe(job.id);
    expect(state.career.kind).toBe("weekly");
    expect(state.career.workedDays).toBe(0);
    expect(salarySummary(state).pending).toBe(0);
    expect(state.player.money).toBe(cash);
    expect(state.career.nextPayDay).toBe(gameDay(state.time) + 7);
  });

  it("wages enter the ledger only after completing a real shift", () => {
    const state = createInitialState(1464);
    state.time.day = 3;
    state.time.hour = 5;
    const job = getJobDef("job_convenience_clerk")!;
    state.player.skills.service = 2;
    state.flags.item_certificate = true;
    applyForJob(state, job);
    state.locationId = job.locationId!;
    const cash = state.player.money;
    const start = performJob(state, job.id);
    expect(start.ok).toBe(true);
    expect(salarySummary(state).pending).toBe(0);
    expect(completeWork(state, start.session!.id, 1).ok).toBe(true);
    expect(state.career.workedDays).toBe(1);
    expect(salarySummary(state).pending).toBeGreaterThan(0);
    expect(state.player.money).toBe(cash);
  });

  it("driving tutor hiring requires a driving license and never awards one automatically", () => {
    const state = createInitialState(1465);
    state.time.day = 3;
    state.time.hour = 5;
    const job = getJobDef("job_driving_tutor")!;
    expect(applyForJob(state, job).ok).toBe(false);
    expect(Boolean(state.flags.item_driving_license)).toBe(false);
    state.flags.item_driving_license = true;
    expect(applyForJob(state, job).ok).toBe(true);
    state.locationId = job.locationId!;
    const start = performJob(state, job.id);
    expect(start.ok).toBe(true);
    expect(start.session?.baseWage).toBeGreaterThanOrEqual(job.effects.money ?? 0);
    completeWork(state, start.session!.id, 1);
    expect(Boolean(state.flags.item_driving_license)).toBe(true);
  });
});
