import { describe, expect, it } from "vitest";
import type { WorkSession } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { getJobDef } from "../src/game/core/jobs";
import { creditWorkedShift, getWorkShift, hireJob, processWorkCalendar, resignJob, salarySummary } from "../src/game/core/career";
import { advanceHours } from "../src/game/core/time";
import { gameDay } from "../src/game/core/calendar";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { scheduledWorkShift, standardWorkMinutes, workMinute } from "../src/game/core/workSchedule";

const job = getJobDef("job_convenience_clerk")!;
function stateAt(day: number, hour = 7) {
  const state = createInitialState(46);
  advanceHours(state, day * 24 + hour - 7);
  state.player.attrs.health = 100;
  state.player.attrs.stamina = 100;
  state.flags.item_certificate = true;
  state.player.skills.service = 2;
  return state;
}
function attendedSession(day: number, id: string, minutes = standardWorkMinutes(job)): WorkSession {
  const shift = scheduledWorkShift(job, day);
  return { id, jobId: job.id, kind: "formal", source: "formal", day, startMinute: shift.startMinute,
    endMinute: shift.endMinute, workedMinutes: minutes, standardMinutes: standardWorkMinutes(job),
    baseWage: 80, effects: {}, seed: 5, canSkip: false, status: "settling" };
}

describe("v1.465 合同与工资日历", () => {
  it("应聘立即入职；早到、迟到按完整班次显示，录用前的休息日不记缺勤", () => {
    const state = stateAt(2, 7); // 周一
    state.locationId = job.locationId!;
    const result = hireJob(state, job);
    expect(result).toMatchObject({ ok: true, newlyHired: true });
    expect(state.career.jobId).toBe(job.id);
    expect(state.career.accruedWages).toBe(0);
    expect(getWorkShift(state, job).phase).toBe("early");
    advanceHours(state, 3); // 10:00
    expect(getWorkShift(state, job).phase).toBe("working");
    expect(state.career.consecutiveAbsences).toBe(0);
  });

  it("重复记班次只算一次；次日缺勤与第七日发薪按各自游标处理", () => {
    const state = stateAt(2, 7);
    hireJob(state, job);
    const shift = attendedSession(2, "same-shift");
    state.work!.active = shift;
    advanceHours(state, 10);
    creditWorkedShift(state, shift, 80, 4);
    creditWorkedShift(state, shift, 80, 4);
    delete state.work!.active;
    processWorkCalendar(state);
    expect(salarySummary(state).pending).toBe(84);
    expect(state.career.workedDays).toBe(1);
    advanceHours(state, 24); // 跳过下一班
    expect(state.career.consecutiveAbsences).toBe(1);
    expect(state.player.money).toBe(500);
    advanceHours(state, 5 * 24);
    const payroll = state.work!.wageRecords.filter((row) => row.kind === "weekly");
    expect(payroll).toHaveLength(0); // 连续三次缺勤先解除合同并结清
    expect(state.work!.wageRecords.filter((row) => row.kind === "dismissal")).toHaveLength(1);
    expect(state.player.money).toBe(584);
  });

  it("七日跨月发薪，不睡觉也自动到账；重复刷新不重复发放", () => {
    const state = stateAt(25, 8); // 八月二十六日
    hireJob(state, job);
    const shiftDay = state.career.firstShiftDay!;
    // 逐班出勤，避免触发三连缺勤。
    for (let day = shiftDay; day < state.career.hiredDay + 7; day++) {
      if (day < state.career.nextShiftDay!) continue;
      const target = scheduledWorkShift(job, day);
      const session = attendedSession(day, "attend-" + day);
      state.work!.active = session;
      advanceHours(state, (target.endMinute - workMinute(state)) / 60);
      creditWorkedShift(state, session, 80, 0);
      delete state.work!.active;
      processWorkCalendar(state);
    }
    const due = state.career.nextPayDay!;
    advanceHours(state, (due * 1440 - workMinute(state)) / 60);
    const before = state.player.money;
    expect(state.work!.wageRecords.filter((row) => row.kind === "weekly")).toHaveLength(1);
    processWorkCalendar(state);
    expect(state.player.money).toBe(before);
    expect(state.career.nextPayDay).toBe(due + 7);
  });

  it("离职结清待发工资并保留岗位熟练度", () => {
    const state = stateAt(2);
    hireJob(state, job);
    creditWorkedShift(state, attendedSession(2, "work-1"), 60, 3);
    state.work!.masteryMinutes[job.id] = 480;
    expect(resignJob(state)).toMatchObject({ ok: true });
    expect(state.player.money).toBe(563);
    expect(state.career.jobId).toBeNull();
    expect(state.work!.masteryMinutes[job.id]).toBe(480);
    expect(state.work!.wageRecords.at(-1)?.kind).toBe("resign");
  });

  it("正在结算的班次若恰好在发薪零点结束，先记本班工资再发薪", () => {
    const state = stateAt(6, 16);
    hireJob(state, job);
    // 构造读取旧存档后仍在进行的跨午夜班次，验证时钟事件的先后顺序。
    state.career.hiredDay = 0;
    state.career.firstShiftDay = 6;
    state.career.nextShiftDay = 6;
    state.career.nextPayDay = 7;
    const session = attendedSession(6, "midnight-pay");
    session.startMinute = workMinute(state);
    session.endMinute = 7 * 1440;
    state.work!.active = session;
    advanceHours(state, 8);
    expect(state.player.money).toBe(500);
    expect(state.career.consecutiveAbsences).toBe(0);
    expect(state.work!.wageRecords.filter((row) => row.kind === "weekly")).toHaveLength(0);
    creditWorkedShift(state, session, 80, 0);
    delete state.work!.active;
    processWorkCalendar(state);
    expect(state.player.money).toBe(588); // 本班基础工资 80 + 满勤 8
    expect(state.work!.wageRecords.filter((row) => row.kind === "weekly")).toHaveLength(1);
  });

  it("31→32 有限零欠薪优先，历史出勤导入熟练度，次日预约恢复合同且只迁移一次", () => {
    const state = stateAt(2);
    state.version = 31;
    state.career.jobId = job.id;
    state.career.kind = "weekly";
    state.career.hiredDay = 0;
    state.career.workedDays = 4;
    state.career.accruedWages = 0;
    state.flags["worked_" + job.id + "_1"] = true;
    state.flags["worked_" + job.id + "_2"] = true;
    const migrated = migrateSave(state);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.player.money).toBe(500);
    expect(migrated.work!.masteryMinutes[job.id]).toBe(2 * standardWorkMinutes(job));
    expect(migrated.career.nextPayDay).toBe(gameDay(state.time) + 7);
    expect(migrateSave(migrated).player.money).toBe(500);
  });

  it("31→32 选择最早未执行正式预约，并独立迁移电脑软件标记", () => {
    const state = stateAt(2);
    state.version = 31;
    state.flags.app_shop = true; // 手机应用原样保留
    state.flags.app_live = false;
    state.quests.push(
      { id: "later", type: "job", title: "便利店", icon: "🏪", desc: "", day: 4, status: "pending", jobId: "job_convenience_clerk" },
      { id: "earlier", type: "job", title: "质检", icon: "🏭", desc: "", day: 3, status: "pending", jobId: job.id },
      { id: "daily", type: "job", title: "日结", icon: "🛵", desc: "", day: 2, status: "pending", jobId: "job_delivery" },
    );
    const migrated = migrateSave(state);
    expect(migrated.career.jobId).toBe(job.id);
    expect(migrated.career.nextShiftDay).toBe(3);
    expect(migrated.quests.filter((quest) => quest.type === "job")).toHaveLength(0);
    for (const app of ["dev", "forum", "shop", "takeout", "live", "invest"])
      expect(migrated.flags["laptop_app_" + app]).toBe(true);
    expect(migrated.flags.app_shop).toBe(true);
    expect(migrated.flags.app_live).toBe(false);
    const reread = migrateSave(migrated);
    expect(reread.career.jobId).toBe(job.id);
    expect(reread.work!.wageRecords).toHaveLength(0);
  });

  it("31→32 欠薪金额字段缺失时才按旧出勤和小游戏表现恢复", () => {
    const state = stateAt(2);
    state.version = 31;
    state.career.jobId = job.id;
    state.career.kind = "weekly";
    state.career.hiredDay = 0;
    state.career.workedDays = 2;
    delete state.career.accruedWages;
    state.career.miniGameScoreTotal = 1;
    state.career.miniGameScoreCount = 2;
    const migrated = migrateSave(state);
    const record = migrated.work!.wageRecords.find((row) => row.kind === "migration")!;
    expect(record.base).toBeGreaterThan(0);
    expect(record.gameBonus).toBeGreaterThan(0);
    expect(record.total).toBe(record.base + record.gameBonus + record.attendanceBonus);
    expect(migrated.player.money).toBe(500 + record.total);
    expect(migrateSave(migrated).player.money).toBe(migrated.player.money);
  });
});
