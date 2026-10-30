// @vitest-environment node
/**
 * 岗位准入由 jobRequirements 校验；相关技能每级增加 1.5% 工资，封顶 30%。
 */
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { jobSkillWageMultiplier, settleJobEffects, type JobDef } from "../src/game/core/jobs";

function jobWith(skill?: Record<string, number>): JobDef {
  return {
    id: "test_job",
    name: "测试岗",
    requirements: skill ? { skill } : undefined,
    effects: { money: 100 },
  } as unknown as JobDef;
}

describe("v1.465 技能工资加成", () => {
  it("岗位无技能要求时不加成", () => {
    const s = createInitialState(1);
    expect(jobSkillWageMultiplier(s, jobWith())).toBe(1);
  });

  it("未达到旧岗位技能要求仍可获得已练等级的收益", () => {
    const s = createInitialState(1);
    s.player.skills.service = 1;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 5 }))).toBeCloseTo(1.015, 5);
  });

  it("每增加一级相关技能，工资系数增加 1.5%", () => {
    const s = createInitialState(1);
    s.player.skills.service = 5;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 5 }))).toBeCloseTo(1.075, 5);
    s.player.skills.service = 6;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 5 }))).toBeCloseTo(1.09, 5);
  });

  it("加成封顶 +30%（超出 20 级以上不再增加）", () => {
    const s = createInitialState(1);
    s.player.skills.service = 25;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 5 }))).toBeCloseTo(1.3, 5);
    s.player.skills.service = 99;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 5 }))).toBeCloseTo(1.3, 5);
  });

  it("多项相关技能取玩家最高等级，不再扣除旧门槛等级", () => {
    const s = createInitialState(1);
    s.player.skills.service = 10;
    s.player.skills.programming = 7;
    expect(jobSkillWageMultiplier(s, jobWith({ service: 1, programming: 5 }))).toBeCloseTo(1.15, 5);
  });

  it("岗位工资上限随物价指数上浮，避免通胀只涨支出不涨收入", () => {
    const state = createInitialState(2);
    state.economy.priceIndex = 1.5;
    const job = { ...jobWith(), kind: "day", effects: { money: 300 } } as JobDef;
    expect(settleJobEffects(state, job).money).toBe(270);
  });
});
