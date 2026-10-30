import { describe, expect, it } from "vitest";
import type { WorkSession } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { getJobDef } from "../src/game/core/jobs";
import { creditWorkedShift, getWorkShift, hireJob, processWorkCalendar, resignJob, resignationSalaryPreview, salarySummary } from "../src/game/core/career";
import { scheduledWorkShift, standardWorkMinutes, workMinute } from "../src/game/core/workSchedule";
import { advanceHours } from "../src/game/core/time";

const job = getJobDef("job_factory_qc")!;
const other = getJobDef("job_convenience_clerk")!;
function ready() {
  const s = createInitialState(55);
  s.time.day = 3; // 周一
  s.time.hour = 7;
  return s;
}
function worked(day: number, id: string, minutes = standardWorkMinutes(job)): WorkSession {
  const shift = scheduledWorkShift(job, day);
  return { id, jobId: job.id, kind: "formal", source: "formal", day,
    startMinute: shift.startMinute, endMinute: shift.endMinute, workedMinutes: minutes,
    standardMinutes: standardWorkMinutes(job), baseWage: 80, effects: {}, seed: 1,
    canSkip: false, status: "settling" };
}
describe("正式工合同", () => {
  it("满足质检岗属性要求即可入职；录用不会提前算出勤或发工资", () => {
    const s = ready();
    expect(hireJob(s, job)).toMatchObject({ ok: true, newlyHired: true });
    expect(s.career).toMatchObject({ jobId: job.id, kind: "weekly", workedDays: 0,
      firstShiftDay: 2, nextPayDay: 9 });
    expect(s.player.money).toBe(500);
    expect(salarySummary(s).pending).toBe(0);
  });
  it("直接调用 hireJob 也会拦截不满足的岗位属性要求", () => {
    const s = ready();
    const skilled = getJobDef("job_factory_tech")!;
    s.player.stats.intelligence = 0;
    expect(hireJob(s, skilled)).toMatchObject({ ok: false, reason: "智力不足（需 40）" });
    expect(s.career.jobId).toBeNull();
  });
  it("不合格换岗不会先解除当前合同", () => {
    const s = ready();
    expect(hireJob(s, job).ok).toBe(true);
    const skilled = getJobDef("job_factory_tech")!;
    s.player.stats.intelligence = 0;
    const cash = s.player.money;
    expect(hireJob(s, skilled, true).ok).toBe(false);
    expect(s.career.jobId).toBe(job.id);
    expect(s.player.money).toBe(cash);
  });
  it("同岗重复应聘幂等；换岗一次结清并建立新合同", () => {
    const s = ready();
    hireJob(s, job);
    expect(hireJob(s, job)).toMatchObject({ ok: true, newlyHired: false });
    expect(hireJob(s, other).ok).toBe(false);
    creditWorkedShift(s, worked(2, "earned"), 80, 4);
    expect(resignationSalaryPreview(s)).toBe(84);
    s.flags.item_training_cert = true;
    expect(hireJob(s, other, true)).toMatchObject({ ok: true, newlyHired: true });
    expect(s.career.jobId).toBe(other.id);
    expect(s.player.money).toBe(584);
    expect(s.work!.wageRecords.at(-1)?.kind).toBe("resign");
  });
  it("位置、提前到岗、迟到一分钟都以同一班次绝对分钟显示", () => {
    const s = ready();
    hireJob(s, job);
    expect(getWorkShift(s, job).phase).toBe("travel");
    s.locationId = job.locationId!;
    expect(getWorkShift(s, job).phase).toBe("early");
    const start = getWorkShift(s, job).startMinute;
    advanceHours(s, (start - workMinute(s)) / 60 + 1 / 60);
    const shift = getWorkShift(s, job);
    expect(shift.phase).toBe("working");
    expect(shift.endMinute - workMinute(s)).toBe(standardWorkMinutes(job) - 1);
  });
});
describe("工资、满勤和缺勤", () => {
  it("完成才记待发，重复回调幂等；迟到两小时只算部分出勤", () => {
    const s = ready();
    hireJob(s, job);
    const session = worked(2, "one", standardWorkMinutes(job) - 120);
    creditWorkedShift(s, session, 60, 3);
    creditWorkedShift(s, session, 60, 3);
    expect(s.career.workedDays).toBe(1);
    expect(s.career.periodScheduled).toBe(1);
    expect(s.career.periodAttended).toBeCloseTo(.8);
    expect(salarySummary(s).pending).toBe(63);
    expect(s.player.money).toBe(500);
    resignJob(s);
    expect(s.player.money).toBe(563);
    expect(s.work!.wageRecords.at(-1)).toMatchObject({ base: 60, gameBonus: 3, attendanceBonus: 0 });
  });
  it("只在班末累计缺勤；第三班后自动解约且不罚钱包", () => {
    const s = ready();
    hireJob(s, job);
    advanceHours(s, 11); // 十小时班次从 8:00 持续到 18:00。
    expect(s.career.consecutiveAbsences).toBe(1);
    advanceHours(s, 24);
    expect(s.career.consecutiveAbsences).toBe(2);
    advanceHours(s, 24);
    expect(s.career.jobId).toBeNull();
    expect(s.player.money).toBe(500);
    expect(s.work!.wageRecords.filter(r => r.kind === "dismissal")).toHaveLength(1);
    processWorkCalendar(s);
    expect(s.work!.wageRecords.filter(r => r.kind === "dismissal")).toHaveLength(1);
  });
  it("实际出勤重置缺勤，休息日不产生新的缺勤", () => {
    const s = ready();
    hireJob(s, job);
    advanceHours(s, 11); // 越过 18:00 班末后才记缺勤。
    expect(s.career.consecutiveAbsences).toBe(1);
    const day = s.career.nextShiftDay!;
    const session = worked(day, "return");
    s.work!.active = session;
    advanceHours(s, (session.endMinute - workMinute(s)) / 60);
    creditWorkedShift(s, session, 80, 0);
    delete s.work!.active;
    processWorkCalendar(s);
    expect(s.career.consecutiveAbsences).toBe(0);
    expect(s.player.money).toBe(500);
  });
  it("七日发薪一次；同一零点重复刷新不会重发", () => {
    const s = ready();
    hireJob(s, job);
    const due = s.career.nextPayDay!;
    creditWorkedShift(s, worked(s.career.hiredDay, "period"), 80, 4);
    s.career.nextShiftDay = due + 1; // 隔离本用例中的未出勤班次
    advanceHours(s, (due * 1440 - workMinute(s)) / 60);
    expect(s.player.money).toBe(592); // 80 基础 + 4 表现 + 8 满勤
    const count = s.work!.wageRecords.length;
    processWorkCalendar(s);
    expect(s.work!.wageRecords).toHaveLength(count);
    expect(s.career.nextPayDay).toBe(due + 7);
  });
});
