import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyJob, resignJob, paycheck, checkAutoQuit, isWeeklyPayday, isMonthlyPayday } from "../src/game/core/career";
import { getJobDef } from "../src/game/core/jobs";

function hiredWeekly(seed = 1) {
  const s = createInitialState(seed);
  s.player.stats.intelligence = 40;
  s.player.attrs.stamina = 80;
  const job = getJobDef("job_factory_qc")!;
  const r = applyJob(s, job);
  return { s, job, r };
}

describe("入职", () => {
  it("周结岗入职成功", () => {
    const { s, r } = hiredWeekly();
    expect(r.ok).toBe(true);
    expect(s.career.jobId).toBe("job_factory_qc");
    expect(s.career.kind).toBe("weekly");
    expect(s.career.workedDays).toBe(1);
  });

  it("已有工作入职他岗拒绝", () => {
    const { s } = hiredWeekly();
    const other = getJobDef("job_loading")!;
    const r = applyJob(s, other);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("离职");
  });

  it("同日重复上班拒绝", () => {
    const { s, job } = hiredWeekly();
    const r = applyJob(s, job);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("上过班");
  });

  it("次日上班累计天数", () => {
    const { s, job } = hiredWeekly();
    s.time.day = 2;
    const r = applyJob(s, job);
    expect(r.ok).toBe(true);
    expect(s.career.workedDays).toBe(2);
  });
});

describe("发薪", () => {
  it("周结发薪日 7/14/21/28", () => {
    expect([7, 14, 21, 28].every(isWeeklyPayday)).toBe(true);
    expect(isWeeklyPayday(6)).toBe(false);
    expect(isMonthlyPayday(30)).toBe(true);
  });

  it("发薪日 paycheck 发放累计工资", () => {
    const { s } = hiredWeekly();
    // 上满 4 天班（day1 入职 + 3 天上班）
    const job = getJobDef("job_factory_qc")!;
    for (const d of [2, 3, 4]) {
      s.time.day = d;
      applyJob(s, job);
    }
    const moneyBefore = s.player.money;
    s.time.day = 7; // 周结日
    const r = paycheck(s);
    expect(r.ok).toBe(true);
    // 日薪 75 × 4 天 = 300
    expect(s.player.money - moneyBefore).toBe(300);
    expect(s.career.workedDays).toBe(0);
  });

  it("满勤奖励 +10%（周结 6 天）", () => {
    const { s } = hiredWeekly();
    const job = getJobDef("job_factory_qc")!;
    for (const d of [2, 3, 4, 5, 6]) {
      s.time.day = d;
      applyJob(s, job);
    }
    const moneyBefore = s.player.money;
    s.time.day = 7;
    const r = paycheck(s);
    expect(r.bonus).toBe(true);
    // 75 × 6 × 1.1 = 495
    expect(s.player.money - moneyBefore).toBe(495);
  });

  it("月结岗 30 号发薪", () => {
    const s = createInitialState(2);
    s.player.stats.intelligence = 60;
    s.flags["item_laptop"] = true;
    const job = getJobDef("job_office_assistant")!;
    applyJob(s, job);
    const moneyBefore = s.player.money;
    s.time.day = 30;
    const r = paycheck(s);
    expect(r.ok).toBe(true);
    expect(s.player.money - moneyBefore).toBe(100); // 日薪 100 × 1 天
  });
});

describe("离职", () => {
  it("连续 3 天未上班自动离职", () => {
    const { s } = hiredWeekly();
    s.time.day = 5; // lastWorkDay=1，差 4 天
    checkAutoQuit(s);
    expect(s.career.jobId).toBeNull();
  });

  it("2 天未上班不离职", () => {
    const { s } = hiredWeekly();
    s.time.day = 3; // lastWorkDay=1，差 2 天
    checkAutoQuit(s);
    expect(s.career.jobId).toBe("job_factory_qc");
  });

  it("辞职", () => {
    const { s } = hiredWeekly();
    const r = resignJob(s);
    expect(r.ok).toBe(true);
    expect(s.career.jobId).toBeNull();
    expect(s.career.kind).toBeNull();
  });
});