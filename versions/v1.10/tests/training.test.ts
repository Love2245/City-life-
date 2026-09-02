import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";
import { getJobDef, performJob } from "../src/game/core/jobs";

function student(): ReturnType<typeof createInitialState> {
  const s = createInitialState(1);
  s.time.hour = 10; // 培训学校营业
  s.locationId = "training_school";
  s.player.money = 500;
  s.player.attrs.stamina = 80;
  return s;
}

describe("v1.10 培训学校", () => {
  it("每天限上 1 次课，重复被拦", () => {
    const s = student();
    s.time.day = 5;
    const r1 = performAction(s, "train_study_course");
    expect(r1.ok).toBe(true);
    const r2 = performAction(s, "train_study_course");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("今天已经上过");
  });

  it("连续 3 天上课 → 领培训证书", () => {
    const s = student();
    // time.day 1/2/3 → gameDay 0/1/2，天然连续
    for (let i = 1; i <= 3; i++) {
      s.time.day = i;
      const r = performAction(s, "train_study_course");
      expect(r.ok).toBe(true);
    }
    expect(s.flags["item_training_cert"]).toBe(true);
  });

  it("断档后重新计数：累计 5 次也可领证", () => {
    const s = student();
    s.flags["train_total"] = 3;
    s.flags["train_streak"] = 1; // 断档（上次间隔 >1 天）
    s.flags["train_last_day"] = 1;
    // 第 5、6 天各上一节 → 累计 5 次
    s.time.day = 5;
    let r = performAction(s, "train_study_course");
    expect(r.ok).toBe(true);
    s.flags["train_total"] = 4;
    s.flags["train_last_day"] = 5;
    s.flags["train_streak"] = 1;
    s.time.day = 6;
    r = performAction(s, "train_study_course");
    expect(r.ok).toBe(true);
    s.flags["train_total"] = 5;
    expect(s.flags["item_training_cert"]).toBe(true);
  });

  it("上课加智力", () => {
    const s = student();
    const before = s.player.stats.intelligence;
    performAction(s, "train_study_course");
    expect(s.player.stats.intelligence).toBe(before + 1);
  });

  it("助教岗需培训证书（无证不可上班）", () => {
    const s = student();
    const job = getJobDef("job_training_assistant")!;
    expect(job).toBeDefined();
    expect(job.requirements?.flag).toBe("item_training_cert");
    // 无证 → 上班被拦
    s.locationId = "training_school";
    const r = performJob(s, "job_training_assistant");
    expect(r.ok).toBe(false);
    // 有证 → 可上班
    s.flags["item_training_cert"] = true;
    s.player.attrs.stamina = 90;
    const r2 = performJob(s, "job_training_assistant");
    expect(r2.ok).toBe(true);
  });
});
