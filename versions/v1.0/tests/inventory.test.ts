import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { addItem, removeItem, useItem, itemCount, inventoryList, getItem } from "../src/game/core/items";
import { performAction } from "../src/game/core/actions";
import { applyFamily } from "../src/game/core/families";

describe("背包：默认与增删", () => {
  it("开局默认持有手机", () => {
    const s = createInitialState();
    expect(s.inventory["phone"]).toBe(1);
    expect(itemCount(s, "phone")).toBe(1);
  });

  it("addItem 累计数量", () => {
    const s = createInitialState();
    addItem(s, "medicine", 2);
    addItem(s, "medicine", 1);
    expect(itemCount(s, "medicine")).toBe(3);
  });

  it("removeItem 消耗后归零移除", () => {
    const s = createInitialState();
    addItem(s, "medicine", 1);
    expect(removeItem(s, "medicine", 1)).toBe(true);
    expect(itemCount(s, "medicine")).toBe(0);
    expect(s.inventory["medicine"]).toBeUndefined();
  });

  it("数量不足 removeItem 失败", () => {
    const s = createInitialState();
    expect(removeItem(s, "medicine", 1)).toBe(false);
  });

  it("inventoryList 含车钥匙显示名", () => {
    const s = createInitialState();
    s.flags["item_e_bike"] = true;
    s.inventory["e_bike"] = 1;
    const list = inventoryList(s);
    const ebike = list.find((x) => x.item.id === "e_bike");
    expect(ebike?.displayName).toBe("电动车钥匙");
  });
});

describe("背包：购买入包", () => {
  it("小诊所买药入包扣钱", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 10;
    s.player.money = 100;
    s.locationId = "clinic";
    const r = performAction(s, "buy_medicine_clinic");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(80);
    expect(itemCount(s, "medicine")).toBe(1);
  });

  it("菜市场买水果入包", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.time.hour = 10;
    s.player.money = 100;
    s.locationId = "market";
    const r = performAction(s, "buy_fruit_market");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "fruit")).toBe(1);
    expect(s.player.money).toBe(95); // 菜市场水果 -5（v0.935 平衡：原价 -8）
  });
});

describe("背包：使用消耗", () => {
  it("吃药恢复健康并治病", () => {
    const s = createInitialState();
    s.inventory["medicine"] = 1;
    s.player.attrs.health = 50;
    s.statuses.push({ id: "sick", severity: 1, count: 1 });
    const r = useItem(s, "medicine");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.health).toBe(65); // +15
    expect(s.statuses.find((st) => st.id === "sick")).toBeUndefined();
    expect(itemCount(s, "medicine")).toBe(0);
  });

  it("吃盒饭解饿 + 消耗", () => {
    const s = createInitialState();
    s.inventory["bento"] = 1;
    s.player.attrs.satiety = 20;
    s.statuses.push({ id: "hungry", severity: 1, count: 1 });
    const r = useItem(s, "bento");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.satiety).toBe(54); // 20 + 34（v0.935 盒饭饱腹 30→34）
    expect(s.statuses.find((st) => st.id === "hungry")).toBeUndefined();
  });

  it("手机不可使用", () => {
    const s = createInitialState();
    const r = useItem(s, "phone");
    expect(r.ok).toBe(false);
  });

  it("数量不足使用失败", () => {
    const s = createInitialState();
    const r = useItem(s, "medicine");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没有");
  });
});

describe("物品数据", () => {
  it("消耗品都有 useEffects", () => {
    const consumables = ["medicine", "bandage", "noodles", "fruit", "salad", "bento", "drink"];
    for (const id of consumables) {
      const item = getItem(id);
      expect(item, `缺物品 ${id}`).toBeDefined();
      expect(item!.consumable).toBe(true);
      expect(item!.useEffects).toBeDefined();
    }
  });

  it("食物类 cure hungry", () => {
    for (const id of ["noodles", "fruit", "salad", "bento"]) {
      expect(getItem(id)!.useEffects!.cureStatuses).toContain("hungry");
    }
  });
});