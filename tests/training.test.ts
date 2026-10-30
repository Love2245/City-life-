import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { canPerform, getAction, performAction } from "../src/game/core/actions";
import { applyForJob, checkJobRequirements, completeWork, getJobDef, performJob, settleJobEffects, skillCertificateWageMultiplier } from "../src/game/core/jobs";
import { trainingProgressLabel } from "../src/game/core/training";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";

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
    expect(s.flags["skill_certificate_level"]).toBe(1);
    expect(s.inventory.training_certificate).toBe(1);
    expect(skillCertificateWageMultiplier(s)).toBe(1.05);
  });

  it("证书逐级提高到 20%，满级后每轮课程奖励 200 元", () => {
    const s = student();
    for (let level = 1; level <= 3; level++) {
      for (let lesson = 1; lesson <= 3; lesson++) {
        s.time.day = (level - 1) * 3 + lesson;
        s.time.hour = 10;
        expect(performAction(s, "train_study_course").ok).toBe(true);
      }
      expect(s.flags["skill_certificate_level"]).toBe(level);
      expect(skillCertificateWageMultiplier(s)).toBe([0, 1.05, 1.1, 1.2][level]);
      expect(s.inventory.training_certificate).toBe(1);
    }
    const moneyBefore = s.player.money;
    for (let lesson = 1; lesson <= 3; lesson++) {
      s.time.day = 9 + lesson;
      s.time.hour = 10;
      expect(performAction(s, "train_study_course").ok).toBe(true);
    }
    expect(s.flags["skill_certificate_level"]).toBe(3);
    expect(s.player.money).toBe(moneyBefore + 200);
  });

  it("满级结业奖励显示在课程结算明细里", () => {
    const s = student();
    s.flags.item_training_cert = true;
    s.flags.skill_certificate_level = 3;
    s.flags.train_cycle_total = 4;
    const moneyBefore = s.player.money;

    const result = performAction(s, "train_study_course");
    expect(result.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore + 200);
    expect(result.result?.deltas).toContainEqual({ key: "money", label: "金钱", value: 200 });
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
    expect(s.inventory.training_certificate).toBe(1);
  });

  it("课程卡展示真实剩余课时，今天上过课后禁用重复操作", () => {
    const s = student();
    const action = getAction("train_study_course")!;
    expect(trainingProgressLabel(s)).toContain("累计还需 5 堂、10 小时");
    expect(canPerform(s, action).ok).toBe(true);
    const result = performAction(s, action.id);
    expect(result.ok).toBe(true);
    // 进度文案改由 UI 单独一行渲染（ScenePanel 的 trainingProgressLabel），
    // 动作 verdict 已改为数据层风味文本，不再拼接进度。
    expect(result.result?.verdict).toBeTruthy();
    expect(trainingProgressLabel(s)).toContain("累计还需 4 堂、8 小时");
    expect(canPerform(s, action)).toMatchObject({ ok: false, reason: expect.stringContaining("今天已经上过课") });
  });

  it("当前版本旧存档仅有结业flags时补一张证书且重复读取不增加数量", () => {
    const legacy = student();
    legacy.version = SAVE_VERSION;
    legacy.flags.item_training_cert = true;
    legacy.flags.skill_certificate_level = 2;
    delete legacy.inventory.training_certificate;
    expect(legacy.version).toBe(SAVE_VERSION);
    const once = migrateSave(structuredClone(legacy));
    const twice = migrateSave(structuredClone(once));
    expect(once.inventory.training_certificate).toBe(1);
    expect(twice.inventory.training_certificate).toBe(1);
    expect(twice.flags.skill_certificate_level).toBe(2);

    const alreadyIssued = structuredClone(legacy);
    alreadyIssued.inventory.training_certificate = 1;
    expect(migrateSave(alreadyIssued).inventory.training_certificate).toBe(1);

    const uncertified = student();
    uncertified.version = SAVE_VERSION;
    delete uncertified.inventory.training_certificate;
    expect(migrateSave(uncertified).inventory.training_certificate).toBeUndefined();
  });

  it("上课加智力", () => {
    const s = student();
    const before = s.player.stats.intelligence;
    performAction(s, "train_study_course");
    expect(s.player.stats.intelligence).toBe(before + 1);
  });

  it("助教岗需要培训证书才能录用；证书也会提高工资", () => {
    const s = student();
    s.time.day = 3;
    s.time.hour = 8;
    const job = getJobDef("job_training_assistant")!;
    expect(job).toBeDefined();
    expect(job.requirements?.flag).toBe("item_training_cert");
    expect(checkJobRequirements(s, job).ok).toBe(false);
    const baseWage = settleJobEffects(s, job).money;
    s.flags.item_training_cert = true;
    expect(checkJobRequirements(s, job)).toMatchObject({ ok: true, intern: false });
    const certifiedWage = settleJobEffects(s, job).money!;
    expect(certifiedWage).toBe(Math.round(baseWage! * 1.05) + 10);
    expect(applyForJob(s, job).ok).toBe(true);
    expect(s.career.jobId).toBe(job.id);
    const r = performJob(s, "job_training_assistant");
    expect(r.ok).toBe(true);
    expect(r.session?.baseWage).toBe(certifiedWage);
    expect(s.career.accruedWages).toBe(0);
    expect(completeWork(s, r.session!.id, 1).ok).toBe(true);
    expect(s.career.accruedWages).toBe(certifiedWage + Math.round(certifiedWage * 0.05));

    const certified = student();
    certified.flags.item_training_cert = true; // 旧档案迁移为第一级证书
    expect(settleJobEffects(certified, job).money).toBe(certifiedWage);
  });

  it("咖啡厅录用会校验健康、服务技能和证书，到岗完成班次后才记工资", () => {
    const s = student();
    s.player.attrs.health = 80;
    s.player.attrs.stamina = 80;
    s.time.day = 3;
    s.time.hour = 8;
    const job = getJobDef("job_cafe_staff")!;
    expect(checkJobRequirements(s, job).ok).toBe(false);
    s.player.skills.service = 3;
    s.flags.item_certificate = true;
    expect(checkJobRequirements(s, job)).toMatchObject({ ok: true, intern: false });
    expect(applyForJob(s, job).ok).toBe(true);
    s.locationId = "cafe";
    const r = performJob(s, "job_cafe_staff");
    expect(r.ok).toBe(true);
    expect(r.session).toBeDefined();
    expect(completeWork(s, r.session!.id, 1).ok).toBe(true);
    expect(s.career.accruedWages).toBeGreaterThan(0);
  });
});
