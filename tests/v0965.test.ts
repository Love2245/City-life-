import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { checkAutoQuit } from "../src/game/core/career";
import { applyForJob, completeWork, getJobDef, performJob } from "../src/game/core/jobs";
import { refreshDailyQuests, questIdOf } from "../src/game/core/quests";
import { fromLinearDay, gameDay, START_EPOCH } from "../src/game/core/calendar";
import { workDialogue, qualityOf, QUALITY_LABEL } from "../src/game/core/workDialogue";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import type { GameState } from "../src/game/types";

describe("v0.965 工作标记与绝对日回归", () => {
  it("同一正式班重复点击复用班次，结算后无法再上一次", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!;
    s.time = { ...s.time, day: 3, hour: 8, minute: 0 };
    s.locationId = "electronics_factory";
    expect(applyForJob(s, job).ok).toBe(true);
    expect(s.career.workedDays).toBe(0);
    const first = performJob(s, job.id);
    expect(first.ok).toBe(true);
    expect(performJob(s, job.id).session?.id).toBe(first.session?.id);
    expect(completeWork(s, first.session!.id, 1).ok).toBe(true);
    expect(s.career.workedDays).toBe(1);
    expect(performJob(s, job.id).ok).toBe(false);
    expect(completeWork(s, first.session!.id, 1).ok).toBe(false);
    expect(s.career.workedDays).toBe(1);
  });

  it("跨月相同日号的日结工作保留不同绝对日标记", () => {
    const s = createInitialState();
    s.locationId = "electronics_factory";
    s.time = { ...s.time, day: 3, hour: 8, minute: 0 };
    s.player.attrs.stamina = 100;
    s.player.attrs.satiety = 100;
    const firstDay = gameDay(s.time);
    const first = performJob(s, "job_factory_line");
    expect(first.ok).toBe(true);
    expect(completeWork(s, first.session!.id, 1).ok).toBe(true);
    s.time = { ...s.time, month: 9, day: 3, hour: 8, minute: 0 };
    s.player.attrs.stamina = 100;
    s.player.attrs.satiety = 100;
    const secondDay = gameDay(s.time);
    const second = performJob(s, "job_factory_line");
    expect(second.ok).toBe(true);
    expect(completeWork(s, second.session!.id, 1).ok).toBe(true);
    expect(secondDay - firstDay).toBe(30);
    expect(s.flags[`worked_job_factory_line_${firstDay}`]).toBe(true);
    expect(s.flags[`worked_job_factory_line_${secondDay}`]).toBe(true);
    expect(s.work?.wageRecords.filter((row) => row.jobId === "job_factory_line")).toHaveLength(2);
  });

  it("连续三天完成日结班分别计薪和积累熟练工时", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_line")!;
    s.locationId = "electronics_factory";
    const initialMoney = s.player.money;
    for (const day of [3, 4, 5]) {
      s.time = { ...s.time, day, hour: 8, minute: 0 };
      s.player.attrs.stamina = 100;
      s.player.attrs.satiety = 100;
      const workDay = gameDay(s.time);
      const started = performJob(s, job.id);
      expect(started.ok).toBe(true);
      expect(completeWork(s, started.session!.id, 1).ok).toBe(true);
      expect(s.flags[`worked_${job.id}_${workDay}`]).toBe(true);
    }
    expect(s.player.money).toBeGreaterThan(initialMoney);
    expect(s.work?.wageRecords.filter((row) => row.jobId === job.id)).toHaveLength(3);
    expect(s.work?.masteryMinutes[job.id]).toBe(job.duration * 60 * 3);
  });

  it("跨月按三个实际应出勤班次解除合同，不把周末算缺勤", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!;
    s.time = { ...s.time, month: 8, day: 29, hour: 8 };
    expect(applyForJob(s, job).ok).toBe(true);
    expect(s.career.firstShiftDay).toBe(gameDay({ ...s.time, month: 9, day: 1 }));
    s.time = { ...s.time, month: 9, day: 3, hour: 18 };
    checkAutoQuit(s);
    expect(s.career.jobId).toBeNull();
    const s2 = createInitialState();
    s2.time = { ...s2.time, month: 8, day: 29, hour: 8 };
    expect(applyForJob(s2, job).ok).toBe(true);
    s2.time = { ...s2.time, month: 9, day: 2, hour: 18 };
    checkAutoQuit(s2);
    expect(s2.career.jobId).toBe(job.id);
    expect(s2.career.consecutiveAbsences).toBe(2);
  });

  it("任务栏同日幂等 id 使用绝对日（跨月不撞）", () => {
    const s = createInitialState();
    const id1 = questIdOf(gameDay(s.time), "job_factory_qc"); // day 0
    s.time = { ...s.time, month: 9, day: 1 }; // gameDay 30
    const id2 = questIdOf(gameDay(s.time), "job_factory_qc");
    expect(id1).not.toBe(id2); // 旧逻辑月内日 1 vs 1 相同
  });

  it("refreshDailyQuests 跨月正常刷新", () => {
    const s = createInitialState();
    refreshDailyQuests(s);
    expect(s.questsGeneratedDay).toBe(0);
    // 推进一天（绝对日 1）
    s.time = { ...s.time, day: 2 };
    refreshDailyQuests(s);
    expect(s.questsGeneratedDay).toBe(1);
  });
});

describe("v0.965 人物对话系统", () => {
  it("质量档位：great/good/ok/bad 阈值", () => {
    expect(qualityOf(0.9)).toBe("great");
    expect(qualityOf(0.85)).toBe("great");
    expect(qualityOf(0.7)).toBe("good");
    expect(qualityOf(0.5)).toBe("ok");
    expect(qualityOf(0.2)).toBe("bad");
  });

  it("工厂工作：组长按质量给出夸奖/批评", () => {
    const good = workDialogue("job_factory_line", 0.95);
    expect(good?.speaker.role).toBe("车间组长");
    expect(good?.quality).toBe("great");
    expect(good?.text.length).toBeGreaterThan(0);
    const bad = workDialogue("job_factory_line", 0.1);
    expect(bad?.quality).toBe("bad");
  });

  it("便利店：店长对话", () => {
    const d = workDialogue("job_convenience_day", 0.7);
    expect(d?.speaker.role).toBe("店长");
    expect(d?.quality).toBe("good");
  });

  it("审查报告列出的 11 个岗位都有负责人点评", () => {
    const missingJobs = [
      "job_convenience_clerk", "job_netbar_admin", "job_training_assistant", "job_delivery_fulltime", "job_school_tutor",
      "job_boyue_cafe_staff", "job_boyue_convenience_clerk", "job_boyue_waiter_fast", "job_boyue_waiter_west",
      "job_boyue_netbar_admin", "job_boyue_bartender",
    ];
    for (const jobId of missingJobs) expect(workDialogue(jobId, 0.7)).not.toBeNull();
  });

  it("街头卖艺：观众对话；摆摊用 _stall 专属文案", () => {
    const busk = workDialogue("street_perform", 0.9);
    expect(busk?.speaker.role).toBe("围观群众");
    // v0.981：修正死键 street_stall → 真实行动 id stall_street_night
    const stall = workDialogue("stall_street_night", 0.1);
    expect(stall?.quality).toBe("bad");
    expect(typeof stall?.text).toBe("string");
    expect(stall!.text.length).toBeGreaterThan(0);
    // 摆摊文案取自 _stall 子集，与卖艺主文案互不重合
    const buskBad = workDialogue("street_perform", 0.1);
    expect(stall?.text).not.toBe(buskBad?.text);
  });

  it("无场景配置的 key 返回 null", () => {
    expect(workDialogue("job_nonexistent", 0.9)).toBeNull();
  });

  it("QUALITY_LABEL 覆盖四档", () => {
    expect(QUALITY_LABEL.great).toBe("备受夸赞");
    expect(QUALITY_LABEL.bad).toBe("挨了批评");
  });
});

describe("v0.965 存档迁移 v13 → v14", () => {
  function makeV13(): GameState {
    const s = createInitialState();
    s.version = 13;
    // 旧档月内日语义：lastWorkDay=30（上月 30 号上过班）
    s.career.lastWorkDay = 30;
    s.career.hiredDay = 15;
    s.questsGeneratedDay = 20;
    s.laborMarket.generatedDay = 10;
    s.quests = [{ id: "q_20_job_x", type: "job", title: "x", icon: "💼", desc: "", day: 20, status: "pending", jobId: "job_x" }];
    return s;
  }

  it("月内日旧字段清除；无在职合同的新账期从当天建立", () => {
    const m = migrateSave(makeV13());
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.career.lastWorkDay).toBe(-1);
    expect(m.career.hiredDay).toBe(0);
    expect(m.questsGeneratedDay).toBe(-1);
    expect(m.laborMarket.generatedDay).toBe(-1);
    expect(m.quests).toEqual([]);
  });

  it("在职旧档的有效绝对日出勤记录在新账期迁移中保留", () => {
    const s = makeV13();
    s.time = { ...s.time, ...fromLinearDay(START_EPOCH + 420) };
    s.career.jobId = "job_factory_qc";
    s.career.kind = "weekly";
    s.career.lastWorkDay = 400;
    const m = migrateSave(s);
    expect(m.career.lastWorkDay).toBe(400);
    expect(m.career.jobId).toBe("job_factory_qc");
    expect(m.career.nextPayDay).toBe(gameDay(m.time) + 7);
  });
});
