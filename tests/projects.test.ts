import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  workOnProject,
  projectProgress,
  isProjectDone,
  projectsDoneCount,
  programmingWeeklyTier,
  designBonusTier,
  designProgressOf,
} from "../src/game/core/projects";

function freshState() {
  const s = createInitialState();
  s.player.skills.programming = 5;
  s.player.skills.cooking = 5;
  s.flags["item_laptop"] = true;
  return s;
}

describe("projects 创业项目系统", () => {
  it("未开始的项目进度为 0", () => {
    const s = freshState();
    expect(projectProgress(s, "indie_game")).toBe(0);
    expect(isProjectDone(s, "indie_game")).toBe(false);
  });

  it("技能不足时无法推进", () => {
    const s = freshState();
    s.player.skills.programming = 2;
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("编程");
  });

  it("缺少笔记本电脑时无法推进（v1.20 任意笔记本均可）", () => {
    const s = freshState();
    s.flags["item_laptop"] = false;
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("笔记本");
  });

  it("推进一次按 progressPerAction 累计", () => {
    const s = freshState();
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(true);
    expect(r.completed).toBe(false);
    expect(projectProgress(s, "indie_game")).toBe(8);
  });

  it("编程作品完成：不再发一次性奖金，改为累加每周版税（按编程等级 100/200/500）", () => {
    const s = freshState();
    const moneyBefore = s.player.money;
    let r;
    for (let i = 0; i < 20; i++) {
      r = workOnProject(s, "indie_game");
      if (r.completed) break;
    }
    expect(r!.completed).toBe(true);
    // v1.20：进度清零，可继续开发下一部作品
    expect(projectProgress(s, "indie_game")).toBe(0);
    expect(isProjectDone(s, "indie_game")).toBe(false);
    // 不发现金，改为周入
    expect(s.player.money).toBe(moneyBefore);
    expect(s.career.passiveIncome).toBe(200); // 编程 5 级 → 200 元/周
    expect(s.player.stats.fame).toBeGreaterThanOrEqual(10);
  });

  it("编程作品完成后可继续推进下一部", () => {
    const s = freshState();
    for (let i = 0; i < 20; i++) {
      const r = workOnProject(s, "indie_game");
      if (r.completed) break;
    }
    const r2 = workOnProject(s, "indie_game");
    expect(r2.ok).toBe(true);
    expect(projectProgress(s, "indie_game")).toBe(8);
  });

  it("projectsDoneCount 只统计已完成项目", () => {
    const s = freshState();
    expect(projectsDoneCount(s)).toBe(0);
    for (let i = 0; i < 20; i++) {
      const r = workOnProject(s, "indie_game");
      if (r.completed) break;
    }
    expect(projectsDoneCount(s)).toBe(1);
  });

  it("编程/设计周入档位：100/200/500 与 100/300/800", () => {
    expect(programmingWeeklyTier(3)).toBe(100);
    expect(programmingWeeklyTier(5)).toBe(200);
    expect(programmingWeeklyTier(8)).toBe(500);
    expect(designBonusTier(3)).toBe(100);
    expect(designBonusTier(5)).toBe(300);
    expect(designBonusTier(8)).toBe(800);
  });

  it("居家设计：进度按电脑档次 10/15/25%，完成按设计等级发奖金并清零", () => {
    const s = createInitialState();
    s.player.skills.design = 5;
    s.player.skills.cooking = 5;
    s.flags["item_laptop"] = true;
    s.player.money = 1000;
    expect(designProgressOf(s)).toBe(10);
    // 低档电脑：推进 10 次完成
    let r;
    for (let i = 0; i < 10; i++) {
      r = workOnProject(s, "home_design");
      if (r.completed) break;
    }
    expect(r!.completed).toBe(true);
    expect(s.player.money).toBe(1000 + 300); // 设计 5 级 → 300 元
    expect(projectProgress(s, "home_design")).toBe(0);
  });

  it("摆摊创业需要厨艺；有摆摊小车可免除", () => {
    const s = freshState();
    s.player.skills.cooking = 1;
    const r = workOnProject(s, "street_stall");
    expect(r.ok).toBe(false);
    s.flags["item_stall_cart"] = true;
    const r2 = workOnProject(s, "street_stall");
    expect(r2.ok).toBe(false); // v1.25：还需背包备好蔬菜与肉
    s.inventory["vegetable"] = 1;
    s.inventory["meat"] = 1;
    const r3 = workOnProject(s, "street_stall");
    expect(r3.ok).toBe(true);
  });

  it("推进消耗体力并产生日志", () => {
    const s = freshState();
    const staminaBefore = s.player.attrs.stamina;
    workOnProject(s, "indie_game");
    expect(s.player.attrs.stamina).toBeLessThan(staminaBefore);
    expect(s.log.length).toBeGreaterThan(0);
  });

});
