import { describe, expect, it } from "vitest";
import type { WorkSession } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { getJobDef, performJob } from "../src/game/core/jobs";
import { creditWorkedShift, hireJob, processWorkCalendar } from "../src/game/core/career";
import { advanceHours } from "../src/game/core/time";
import { scheduledWorkShift, standardWorkMinutes, workMinute } from "../src/game/core/workSchedule";
import { gameDay } from "../src/game/core/calendar";

const job = getJobDef("job_factory_qc")!;
function attendUntil(state: ReturnType<typeof createInitialState>, untilDay: number): void {
  while (state.career.nextShiftDay! < untilDay) {
    const day = state.career.nextShiftDay!;
    const shift = scheduledWorkShift(job, day);
    const session: WorkSession = {
      id: "cross-month-" + day, jobId: job.id, kind: "formal", source: "formal", day,
      ...shift, workedMinutes: standardWorkMinutes(job), standardMinutes: standardWorkMinutes(job),
      baseWage: 80, effects: {}, seed: 1, canSkip: false, status: "settling",
    };
    state.work!.active = session;
    advanceHours(state, (shift.endMinute - workMinute(state)) / 60);
    creditWorkedShift(state, session, 80, 0);
    delete state.work!.active;
    processWorkCalendar(state);
  }
}
describe("正式工跨月七日发薪", () => {
  it("正式班次晚于排班开始时间到岗会记录迟到供皇帝塔罗判定", () => {
    const state = createInitialState(146);
    Object.assign(state.time, { day: 3, hour: 7, minute: 0 }); // 周一，早于首班
    expect(hireJob(state, job).ok).toBe(true);
    state.time.hour = (job.startHour ?? 9) + 1;
    state.locationId = job.locationId;
    expect(performJob(state, job.id).ok).toBe(true);
    expect(state.flags.wasLateToday).toBe(true);
  });

  it("连续四个完整七日账期按时全勤后只发一张优秀员工奖状", () => {
    const state = createInitialState(147);
    expect(hireJob(state, job).ok).toBe(true);
    const firstDue = state.career.nextPayDay!;
    for (let week = 0; week < 5; week++) {
      const due = firstDue + week * 7;
      attendUntil(state, due);
      advanceHours(state, (due * 1440 - workMinute(state)) / 60);
      expect(state.inventory.doc_employee_award ?? 0).toBe(week < 3 ? 0 : 1);
    }
  });
  it("有一次迟到就从下个完整账期重新累计", () => {
    const state = createInitialState(148);
    hireJob(state, job);
    const firstDue = state.career.nextPayDay!;
    for (let week = 0; week < 5; week++) {
      const due = firstDue + week * 7;
      attendUntil(state, due);
      if (week === 1) state.career.periodAttended = state.career.periodScheduled! - 0.5;
      advanceHours(state, (due * 1440 - workMinute(state)) / 60);
      expect(state.inventory.doc_employee_award ?? 0).toBe(0);
    }
    const sixthDue = firstDue + 5 * 7;
    attendUntil(state, sixthDue);
    advanceHours(state, (sixthDue * 1440 - workMinute(state)) / 60);
    expect(state.inventory.doc_employee_award).toBe(1);
  });
  it("每个七日账期从录用日算，跨 30 天月份连续发薪并单列满勤奖金", () => {
    const state = createInitialState(99);
    state.time = { ...state.time, month: 8, day: 26, hour: 7, minute: 0 };
    expect(hireJob(state, job).ok).toBe(true);
    const firstDue = state.career.nextPayDay!;
    expect(firstDue).toBe(gameDay(state.time) + 7);
    for (const due of [firstDue, firstDue + 7]) {
      attendUntil(state, due);
      advanceHours(state, (due * 1440 - workMinute(state)) / 60);
      const records = state.work!.wageRecords.filter(row => row.kind === "weekly");
      expect(records).toHaveLength(due === firstDue ? 1 : 2);
      const latest = records.at(-1)!;
      expect(latest.day).toBe(due);
      expect(latest.base).toBeGreaterThan(0);
      expect(latest.attendanceBonus).toBe(Math.round(latest.base * .1));
      expect(latest.total).toBe(latest.base + latest.attendanceBonus);
      const money = state.player.money;
      processWorkCalendar(state);
      expect(state.player.money).toBe(money);
    }
    expect(state.career.nextPayDay).toBe(firstDue + 14);
    expect(state.time.month).toBe(9);
  });
  it("不同录用日的首个发薪日不同，休息日录用首班顺延但不改发薪锚点", () => {
    const saturday = createInitialState();
    saturday.time = { ...saturday.time, day: 1, hour: 7 };
    hireJob(saturday, job);
    expect(saturday.career.firstShiftDay).toBe(2);
    expect(saturday.career.nextPayDay).toBe(7);
    const sunday = createInitialState();
    sunday.time = { ...sunday.time, day: 2, hour: 7 };
    hireJob(sunday, job);
    expect(sunday.career.firstShiftDay).toBe(2);
    expect(sunday.career.nextPayDay).toBe(8);
  });
});
