import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyJob, checkAutoQuit } from "../src/game/core/career";
import { getJobDef } from "../src/game/core/jobs";
import { refreshDailyQuests, questIdOf } from "../src/game/core/quests";
import { gameDay } from "../src/game/core/calendar";
import { workDialogue, qualityOf, QUALITY_LABEL } from "../src/game/core/workDialogue";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import type { GameState } from "../src/game/types";

describe("v0.965 Bug 回归：连续工作后『今天已上过班』误判", () => {
  it("同一天重复上班仍被拒绝（幂等保留）", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!; // weekly 正式工
    expect(applyJob(s, job).ok).toBe(true); // 入职 = 上班第 1 天
    const r2 = applyJob(s, job);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("今天已经上过班");
  });

  it("跨月同日上班不再误判（核心 bug）", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!;
    expect(applyJob(s, job).ok).toBe(true); // 2026-08-01 上班（gameDay 0）
    // 下月 1 号（2026-09-01，gameDay 30）：旧逻辑 lastWorkDay=1 === day=1 误判
    s.time = { ...s.time, month: 9, day: 1 };
    const r = applyJob(s, job);
    expect(r.ok).toBe(true); // 新的一天，应能上班
    expect(s.career.workedDays).toBe(2);
  });

  it("连续上班 3 天仍可上班（不因月内日撞号被拒）", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!;
    applyJob(s, job); // day0
    s.time = { ...s.time, day: 2 }; // gameDay 1
    expect(applyJob(s, job).ok).toBe(true);
    s.time = { ...s.time, day: 3 }; // gameDay 2
    expect(applyJob(s, job).ok).toBe(true);
    expect(s.career.workedDays).toBe(3);
  });

  it("自动离职判定跨月正确（绝对日差值）", () => {
    const s = createInitialState();
    const job = getJobDef("job_factory_qc")!;
    applyJob(s, job); // lastWorkDay = gameDay 0
    // 跨月 + 3 天（2026-09-04，gameDay 33 ≥ 3）
    s.time = { ...s.time, month: 9, day: 4 };
    checkAutoQuit(s);
    expect(s.career.jobId).toBeNull();
    // 未满 3 天不离职
    const s2 = createInitialState();
    applyJob(s2, job);
    s2.time = { ...s2.time, day: 2 }; // gameDay 1 < 3
    checkAutoQuit(s2);
    expect(s2.career.jobId).not.toBeNull();
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

  it("月内日字段置 -1（哨兵/强制刷新），任务栏清空", () => {
    const m = migrateSave(makeV13());
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.career.lastWorkDay).toBe(-1);
    expect(m.career.hiredDay).toBe(-1);
    expect(m.questsGeneratedDay).toBe(-1);
    expect(m.laborMarket.generatedDay).toBe(-1);
    expect(m.quests).toEqual([]);
  });

  it("绝对日大值（>30）不受迁移影响", () => {
    const s = makeV13();
    s.career.lastWorkDay = 400; // 已按新语义记录的档
    const m = migrateSave(s);
    expect(m.career.lastWorkDay).toBe(400);
  });
});
