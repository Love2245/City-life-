import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { workOnProject, projectProgress, isProjectDone, projectsDoneCount } from "../src/game/core/projects";

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

  it("缺少物品 flag 时无法推进", () => {
    const s = freshState();
    s.flags["item_laptop"] = false;
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("物品");
  });

  it("推进一次按 progressPerAction 累计", () => {
    const s = freshState();
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(true);
    expect(r.completed).toBe(false);
    expect(projectProgress(s, "indie_game")).toBe(8);
  });

  it("多次推进直至完成，触发奖励", () => {
    const s = freshState();
    const moneyBefore = s.player.money;
    let r;
    for (let i = 0; i < 20; i++) {
      r = workOnProject(s, "indie_game");
      if (r.completed) break;
    }
    expect(r!.completed).toBe(true);
    expect(projectProgress(s, "indie_game")).toBe(100);
    expect(isProjectDone(s, "indie_game")).toBe(true);
    // 完成奖励 +5000
    expect(s.player.money).toBe(moneyBefore + 5000);
    expect(s.player.stats.fame).toBeGreaterThanOrEqual(20);
  });

  it("已完成项目再推进被拒绝", () => {
    const s = freshState();
    for (let i = 0; i < 20; i++) {
      const r = workOnProject(s, "indie_game");
      if (r.completed) break;
    }
    const r2 = workOnProject(s, "indie_game");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("完成");
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

  it("推进消耗体力并产生日志", () => {
    const s = freshState();
    const staminaBefore = s.player.attrs.stamina;
    workOnProject(s, "indie_game");
    expect(s.player.attrs.stamina).toBeLessThan(staminaBefore);
    expect(s.log.length).toBeGreaterThan(0);
  });

  it("摆摊创业需要厨艺", () => {
    const s = freshState();
    s.player.skills.cooking = 1;
    const r = workOnProject(s, "street_stall");
    expect(r.ok).toBe(false);
    s.player.skills.cooking = 2;
    const r2 = workOnProject(s, "street_stall");
    expect(r2.ok).toBe(true);
  });
});
