import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { getMaxStamina, fameIncomeMult } from "../src/game/core/stats";
import { deliveryParttimeBasePay, deliveryParttime } from "../src/game/core/jobs";
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
    expect(deliveryParttimeBasePay(s)).toBe(35); // 步行
    s.flags["item_bicycle"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(50);
    s.flags["item_e_bike"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(70);
    s.flags["item_car"] = true;
    expect(deliveryParttimeBasePay(s)).toBe(90);
  });

  it("未下载外卖 App 时无法接单", () => {
    const s = createInitialState();
    const r = deliveryParttime(s);
    expect(r.ok).toBe(false);
  });

  it("下载后接单：收入 = 档位 × 影响力加成，并标记干过活", () => {
    const s = createInitialState();
    s.flags["app_delivery"] = true;
    s.flags["item_e_bike"] = true;
    s.player.stats.fame = 60; // ×1.25
    const before = s.player.money;
    const r = deliveryParttime(s);
    expect(r.ok).toBe(true);
    expect(r.pay).toBe(Math.round(70 * 1.25));
    expect(s.player.money - before).toBe(r.pay);
    expect(s.flags["goal_worked"]).toBe(true);
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

  it("备好食材后出摊：消耗食材、推进项目；收入改由摆摊小游戏按服务人头发放（v1.3b2 不再直接发 perActionIncome）", () => {
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
    // v1.3b2：摆摊收入 = 服务人数 × stallPerCustomerPay（多劳多得），由 MiniGameModal 结算；
    // workOnProject 本身不再发固定 perActionIncome
    expect(s.player.money - money0).toBe(0);
  });

  it("摆摊项目可重复推进（repeatable）", () => {
    const p = getProject("street_stall");
    expect(p?.repeatable).toBe(true);
  });
});

describe("v1.25 每日目标：联系联系人可主动完成", () => {
  it("contact_someone 目标绑定 contacted_today 标志", () => {
    const s = createInitialState();
    s.player.money = 500;
    const goals = generateDailyGoals(s);
    const contact = goals.find((g) => g.id === "contact_someone");
    if (!contact) return; // 随机抽取不保证出现
    const rewards: number[] = [];
    s.flags["contacted_today"] = true;
    const n = tickDailyGoals(s, (m) => rewards.push(m));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(contact.done).toBe(true);
  });
});
