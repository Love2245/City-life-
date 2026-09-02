import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { equipItem, unequipItem, isEquipped, equipBonus } from "../src/game/core/equipment";
import { addItem } from "../src/game/core/items";
import { performAction, canPerform } from "../src/game/core/actions";
import { getAction } from "../src/game/core/actions";

describe("v0.95 装备系统", () => {
  it("装备衬衫：魅力 +2、置 flag", () => {
    const s = createInitialState();
    addItem(s, "shirt");
    const charm0 = s.player.stats.charm;
    const r = equipItem(s, "shirt");
    expect(r.ok).toBe(true);
    expect(s.player.stats.charm).toBe(charm0 + 2);
    expect(s.flags["item_shirt"]).toBe(true);
    expect(isEquipped(s, "shirt")).toBe(true);
    expect(equipBonus(s).charm).toBe(2);
  });

  it("未持有 / 无 slot / 重复装备拒绝", () => {
    const s = createInitialState();
    expect(equipItem(s, "shirt").ok).toBe(false); // 背包没有
    addItem(s, "shirt");
    addItem(s, "lamp");
    expect(equipItem(s, "shirt").ok).toBe(true);
    expect(equipItem(s, "shirt").ok).toBe(false); // 已装备
    expect(equipItem(s, "medicine").ok).toBe(false); // 无 slot（消耗品）
  });

  it("同槽替换：穿西装卸衬衫，加成只算一件", () => {
    const s = createInitialState();
    addItem(s, "shirt");
    addItem(s, "suit");
    equipItem(s, "shirt");
    const afterShirt = s.player.stats.charm;
    const r = equipItem(s, "suit");
    expect(r.ok).toBe(true);
    expect(isEquipped(s, "shirt")).toBe(false);
    expect(isEquipped(s, "suit")).toBe(true);
    expect(s.player.stats.charm).toBe(afterShirt - 2 + 5); // 撤销衬衫 +2，穿上西装 +5
    expect(equipBonus(s).charm).toBe(5);
  });

  it("卸下撤销加成", () => {
    const s = createInitialState();
    addItem(s, "lamp");
    equipItem(s, "lamp");
    const afterEquip = s.player.attrs.mood;
    expect(afterEquip).toBeGreaterThan(70); // 初始 mood 70 + 2
    const r = unequipItem(s, "furniture");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(afterEquip - 2);
    expect(isEquipped(s, "lamp")).toBe(false);
  });

  it("多槽位互不影响（衣服+家具加成叠加）", () => {
    const s = createInitialState();
    addItem(s, "shirt");
    addItem(s, "sofa");
    equipItem(s, "shirt");
    equipItem(s, "sofa");
    expect(equipBonus(s)).toEqual({ charm: 2, mood: 4 });
    expect(s.player.stats.charm).toBe(32);
    expect(s.player.attrs.mood).toBe(74);
  });
});

describe("v0.95 物品购买与解锁", () => {
  it("名牌店买西装：入包 + 效果应用（buy_item 死代码修复）", () => {
    const s = createInitialState();
    s.player.money = 10000;
    s.time = { ...s.time, hour: 12, minute: 0 }; // 名牌店 10-22 点
    const r = performAction(s, "buy_suit");
    expect(r.ok).toBe(true);
    expect(s.inventory["suit"]).toBe(1);
    expect(s.flags["item_suit"]).toBe(true); // 非消耗品购买置 flag
  });

  it("奢侈品购买效果生效（buy_luxury_watch → 心情+10）", () => {
    const s = createInitialState();
    s.player.money = 30000;
    s.time = { ...s.time, hour: 12, minute: 0 };
    const mood0 = s.player.attrs.mood;
    const r = performAction(s, "buy_luxury_watch");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(mood0 + 10); // item.effects 被应用
    expect(s.economy.ownedLuxury).toContain("luxury_watch");
  });

  it("买厨具解锁煎牛排行动（flag 门槛）", () => {
    const s = createInitialState();
    s.player.money = 10000;
    s.time = { ...s.time, hour: 12, minute: 0 };
    s.living = { mode: "lease", govDaysLeft: 0, nightly: null, lease: { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 } }; // 月租房有灶台
    const action = getAction("cook_steak_home")!;
    // 未买厨具前，行动需求不满足
    expect(canPerform(s, action).ok).toBe(false);
    const r = performAction(s, "buy_kitchen_set");
    expect(r.ok).toBe(true);
    expect(s.flags["item_kitchen_set"]).toBe(true);
    // 厨具后补足食材与厨艺 → 可执行（canCook 校验：食材 ×1 + 厨艺 2 + 灶台）
    s.inventory["meat"] = 1;
    s.player.skills.cooking = 2;
    expect(canPerform(s, action).ok).toBe(true);
  });

  it("买家用健身器材解锁在家锻炼", () => {
    const s = createInitialState();
    s.player.money = 10000;
    s.time = { ...s.time, hour: 12, minute: 0 };
    const action = getAction("exercise_home_equip")!;
    expect(canPerform(s, action).ok).toBe(false);
    performAction(s, "buy_gym_equipment");
    expect(s.flags["item_gym_equipment"]).toBe(true);
    expect(canPerform(s, action).ok).toBe(true);
  });
});
