import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";
import {advanceHours} from '../src/game/core/time';
import {developmentWorkBudget} from '../src/game/core/developmentWork';
import {
  workOnProject,
  startNextProgrammingProject,
  projectProgress,
  isProjectDone,
  projectsDoneCount,
  programmingWeeklyTier,
  designBonusTier,
  designProgressOf,
  developmentProductivity,
  stallIngredientCheck,
  buyStallPrepKit,
  stallPrepKitCount,
} from "../src/game/core/projects";

function freshState() {
  const s = createInitialState();
  s.player.skills.programming = 5;
  s.player.skills.cooking = 5;
  s.flags["item_laptop"] = true;
  s.time.hour=9;
  return s;
}
/** 这些测试校验作品权益；按真实开发命令跨日，生活恢复由受控夹具提供。 */
function developmentDay(s:ReturnType<typeof freshState>,id:string){
  if(developmentWorkBudget(s).remainingMinutes<480)advanceHours(s,24-s.time.hour+9-s.time.minute/60,false,true);
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:80,satiety:100});
  return workOnProject(s,id);
}

describe("projects 创业项目系统", () => {
  it('完成作品后可开始下一部，但重开不发版税、不消耗时间，也不重复完成计数', () => {
    const s = freshState(); s.career.projects.indie_game = 100; s.career.passiveIncome = 180;
    const before = { money: s.player.money, time: JSON.stringify(s.time) };
    expect(startNextProgrammingProject(s, 'indie_game').ok).toBe(true);
    expect(projectProgress(s, 'indie_game')).toBe(0); expect(projectsDoneCount(s)).toBe(1);
    expect(startNextProgrammingProject(s, 'indie_game').ok).toBe(false);
    expect(s.career.passiveIncome).toBe(180); expect(s.player.money).toBe(before.money); expect(JSON.stringify(s.time)).toBe(before.time);
    for (let i = 0; i < 30; i++) if (developmentDay(s, 'indie_game').completed) break;
    expect(s.career.passiveIncome).toBe(200); expect(projectsDoneCount(s)).toBe(1);
    expect(workOnProject(s, 'indie_game').ok).toBe(false);
    expect(startNextProgrammingProject(s, 'not-a-project').ok).toBe(false);
  });
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

  it("缺少电脑时无法推进（三档电脑均可）", () => {
    const s = freshState();
    s.flags["item_laptop"] = false;
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("电脑");
  });

  it("个人正常8小时按统一的基础、技能和设备累计", () => {
    const s = freshState();
    const r = workOnProject(s, "indie_game");
    expect(r.ok).toBe(true);
    expect(r.completed).toBe(false);
    expect(projectProgress(s, "indie_game")).toBeCloseTo(6.11111111);
  });

  it("编程作品完成后只上线一次，并按编程等级累加每周版税（40/80/150）", () => {
    const s = freshState();
    const moneyBefore = s.player.money;
    let r;
    for (let i = 0; i < 30; i++) {
      r = developmentDay(s, "indie_game");
      if (r.completed) break;
    }
    expect(r!.completed).toBe(true);
    expect(projectProgress(s, "indie_game")).toBe(100);
    expect(isProjectDone(s, "indie_game")).toBe(true);
    // 不发完成奖金，收益来自有上限且逐周衰减的版税
    expect(s.player.money).toBe(moneyBefore);
    expect(s.career.passiveIncome).toBe(80); // 编程 5 级 → 80 元/周
    expect(s.player.stats.fame).toBeGreaterThanOrEqual(10);
  });

  it("同一编程作品完成后不能重复开发刷版税", () => {
    const s = freshState();
    for (let i = 0; i < 30; i++) {
      const r = developmentDay(s, "indie_game");
      if (r.completed) break;
    }
    const r2 = workOnProject(s, "indie_game");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("已经完成");
    expect(projectProgress(s, "indie_game")).toBe(100);
  });

  it("projectsDoneCount 只统计已完成项目", () => {
    const s = freshState();
    expect(projectsDoneCount(s)).toBe(0);
    for (let i = 0; i < 30; i++) {
      const r = developmentDay(s, "indie_game");
      if (r.completed) break;
    }
    expect(projectsDoneCount(s)).toBe(1);
  });

  it("编程与设计技能门槛为3，个人设计短单按300/450/600收款", () => {
    expect(programmingWeeklyTier(3)).toBe(40);
    expect(programmingWeeklyTier(5)).toBe(80);
    expect(programmingWeeklyTier(8)).toBe(150);
    expect(designBonusTier(3)).toBe(300);
    expect(designBonusTier(5)).toBe(450);
    expect(designBonusTier(8)).toBe(600);
    expect(developmentProductivity(1)).toBe(1);
    expect(developmentProductivity(3)).toBeCloseTo(1.11111111);
    expect(developmentProductivity(6)).toBeCloseTo(1.27777778);
    expect(developmentProductivity(7)).toBeCloseTo(1.33333333);
    expect(developmentProductivity(9)).toBeCloseTo(1.44444444);
    expect(developmentProductivity(10)).toBe(1.5);
  });

  it("居家设计：电脑进度乘技能效率，完成按设计等级发奖金并清零", () => {
    const s = createInitialState();
    s.player.skills.design = 5;
    s.player.skills.cooking = 5;
    s.flags["item_laptop"] = true;
    s.player.money = 1000;
    expect(designProgressOf(s)).toBeCloseTo(6.11111111);
    // 普通电脑、技能5：标准日约6.11点，20点短单在第4个正常工作日收尾。
    let r;
    for (let i = 0; i < 20; i++) {
      r = developmentDay(s, "home_design");
      if (r.completed) break;
    }
    expect(r!.completed).toBe(true);
    expect(s.player.money).toBe(1000 + 450); // 设计 5 级 → 450 元
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

  it("从场景行动进入摆摊小游戏时不重复结算项目收入、体力和时长", () => {
    const s = freshState();
    s.locationId = "street";
    s.player.money = 500;
    s.player.attrs.stamina = 90;
    s.inventory.vegetable = 1;
    s.inventory.meat = 1;
    const before = { money: s.player.money, stamina: s.player.attrs.stamina, time: structuredClone(s.time) };

    expect(performAction(s, "stall_street_night").ok).toBe(true);
    expect(s.player.money).toBe(before.money);
    expect(s.player.attrs.stamina).toBe(before.stamina);
    expect(s.time).toEqual(before.time);
    expect(projectProgress(s, "street_stall")).toBeGreaterThan(0);
  });

  it("摆摊允许具体蔬菜和肉类互相替代，并在出摊时消耗", () => {
    const s = freshState();
    s.flags["item_stall_cart"] = true;
    s.inventory["tomato"] = 1;
    s.inventory["pork"] = 1;

    expect(stallIngredientCheck(s, "street_stall")).toEqual({ ok: true, missing: [] });
    expect(workOnProject(s, "street_stall").ok).toBe(true);
    expect(s.inventory["tomato"]).toBeUndefined();
    expect(s.inventory["pork"]).toBeUndefined();
  });

  it("食材不齐时可花20元购买预制料理包，并在本次出摊消耗", () => {
    const s = freshState();
    s.flags["item_stall_cart"] = true;
    s.player.money = 100;

    expect(stallIngredientCheck(s, "street_stall").ok).toBe(false);
    expect(buyStallPrepKit(s, "street_stall").ok).toBe(true);
    expect(s.player.money).toBe(80);
    expect(s.weekly.spent).toBe(20);
    expect(stallPrepKitCount(s, "street_stall")).toBe(1);

    expect(workOnProject(s, "street_stall").ok).toBe(true);
    expect(stallPrepKitCount(s, "street_stall")).toBe(0);
  });

  it("推进消耗体力并产生日志", () => {
    const s = freshState();
    const staminaBefore = s.player.attrs.stamina;
    workOnProject(s, "indie_game");
    expect(s.player.attrs.stamina).toBeLessThan(staminaBefore);
    expect(s.log.length).toBeGreaterThan(0);
  });

});
