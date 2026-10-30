import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { getMaxStamina, fameIncomeMult } from "../src/game/core/stats";
import { completeWork, deliveryParttimeBasePay, deliveryParttime } from "../src/game/core/jobs";
import { workOnProject, getProject } from "../src/game/core/projects";
import { addItem, itemCount } from "../src/game/core/items";
import { generateDailyGoals, tickDailyGoals } from "../src/game/core/quests";

describe("v1.25 能力成长 → 基础属性加成", () => {
  it("体质分档加成体力上限（40/60/80 → +20/+40/+70）", () => {
    const base = createInitialState();
    const baseMax = getMaxStamina(base);
    const s30 = createInitialState();
    s30.player.stats.fitness = 30;
    expect(getMaxStamina(s30)).toBe(baseMax);
    const s50 = createInitialState();
    s50.player.stats.fitness = 50;
    expect(getMaxStamina(s50)).toBe(baseMax + 20);
    const s70 = createInitialState();
    s70.player.stats.fitness = 70;
    expect(getMaxStamina(s70)).toBe(baseMax + 40);
    const s85 = createInitialState();
    s85.player.stats.fitness = 85;
    expect(getMaxStamina(s85)).toBe(baseMax + 70);
  });

  it("影响力收入加成系数分档", () => {
    const s = createInitialState();
    s.player.stats.fame = 20;
    expect(fameIncomeMult(s)).toBe(1);
    s.player.stats.fame = 40;
    expect(fameIncomeMult(s)).toBe(1.1);
    s.player.stats.fame = 60;
    expect(fameIncomeMult(s)).toBe(1.25);
    s.player.stats.fame = 80;
    expect(fameIncomeMult(s)).toBe(1.4);
    s.player.stats.fame = 95;
    expect(fameIncomeMult(s)).toBe(1.6);
  });
});

describe("v1.25 兼职外卖（手机 App）", () => {
  it("按交通工具分档基础收入", () => {
    const s = createInitialState();
    expect(deliveryParttimeBasePay(s)).toBe(15); // 步行
    s.flags["item_bicycle"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(19);
    s.flags["item_e_bike"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(25);
    s.flags["item_car"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(28);
  });

  it("未下载外卖 App 时无法接单", () => {
    const s = createInitialState();
    const r = deliveryParttime(s);
    expect(r.ok).toBe(false);
  });

  it("下载后接单：小游戏完成才到账、计时和标记干过活", () => {
    const s = createInitialState();
    s.flags["app_delivery"] = true;
    s.flags["item_e_bike"] = true;
    s.player.stats.fame = 60;
    const before = s.player.money;
    const startHour = s.time.hour;
    const r = deliveryParttime(s);
    expect(r.ok).toBe(true);
    expect(r.pay).toBe(0);
    expect(r.session).toBeDefined();
    expect(s.player.money).toBe(before);
    expect(s.flags["goal_worked"]).toBeFalsy();
    r.session!.completedOrders = 3;
    r.session!.deliveryEarnedFare = 48.75;
    expect(completeWork(s, r.session!.id, 0).ok).toBe(true);
    expect(s.player.money - before).toBe(48.75);
    expect(s.flags["goal_worked"]).toBeUndefined();
    expect(s.time.hour).toBe(startHour + 8);
  });
});

describe("v1.25 摆摊：按次正收入 + 需食材", () => {
  it("背包缺食材时无法出摊", () => {
    const s = createInitialState();
    s.player.skills.cooking = 3;
    const r = workOnProject(s, "street_stall");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("缺少食材");
  });

  it("备好食材后出摊：消耗食材、推进项目并获得按次基础收入", () => {
    const s = createInitialState();
    s.player.skills.cooking = 3;
    addItem(s, "vegetable", 2);
    addItem(s, "meat", 2);
    s.player.stats.fame = 50; // ×1.25
    const money0 = s.player.money;
    const r = workOnProject(s, "street_stall");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "vegetable")).toBe(1);
    expect(itemCount(s, "meat")).toBe(1);
    // v1.455：项目按次收入作为基础营收结算；小游戏仍可在此基础上按服务人数追加收入。
    expect(s.player.money - money0).toBe(Math.round(30 * 1.25));
  });

  it("摆摊项目可重复推进（repeatable）", () => {
    const p = getProject("street_stall");
    expect(p?.repeatable).toBe(true);
  });
});

describe("retired contact daily goal", () => {
  it("does not generate or pay a contact daily goal", () => {
    const s = createInitialState();const mood=s.player.attrs.mood,rewards:number[]=[];
    expect(generateDailyGoals(s)).toEqual([]);s.flags.contacted_today=true;
    expect(tickDailyGoals(s,m=>rewards.push(m))).toBe(0);expect(rewards).toEqual([]);
    expect(s.dailyGoals).toBeUndefined();expect(s.flags.contacted_today).toBeUndefined();expect(s.player.attrs.mood).toBe(mood);
  });
});
