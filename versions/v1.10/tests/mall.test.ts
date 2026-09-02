import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";
import { getItem, itemCount, addItem } from "../src/game/core/items";
import { facilityEfficiency } from "../src/game/core/facility";
import { canCook } from "../src/game/core/cooking";
import { equipItem } from "../src/game/core/equipment";

function shopper(money = 10000): ReturnType<typeof createInitialState> {
  const s = createInitialState(1);
  s.time.hour = 12; // 商场营业中
  s.player.money = money;
  s.locationId = "electronics_store";
  return s;
}

describe("v1.10 百货商场：电子城", () => {
  it("买办公笔记本 → 入包 + 装备后开发效率提升", () => {
    const s = shopper();
    const r = performAction(s, "buy_laptop_mid");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "laptop_mid")).toBe(1);
    expect(s.flags["item_laptop_mid"]).toBe(true);
    // 手动装备后开发效率提升（base 1.0 × 1.5）
    const eq = equipItem(s, "laptop_mid");
    expect(eq.ok).toBe(true);
    expect(s.equipped.tool).toBe("laptop_mid");
    expect(facilityEfficiency(s, "dev")).toBeGreaterThan(1.4);
  });

  it("笔记本档位效率递增（老旧 < 办公 < 电竞）", () => {
    const base = facilityEfficiency(shopper(), "dev");
    const s1 = shopper();
    addItem(s1, "laptop", 1);
    equipItem(s1, "laptop");
    const d1 = facilityEfficiency(s1, "dev");
    const s2 = shopper();
    addItem(s2, "laptop_mid", 1);
    equipItem(s2, "laptop_mid");
    const d2 = facilityEfficiency(s2, "dev");
    const s3 = shopper();
    addItem(s3, "laptop_pro", 1);
    equipItem(s3, "laptop_pro");
    const d3 = facilityEfficiency(s3, "dev");
    expect(d1).toBeGreaterThan(base);
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });

  it("买大米手机 → phoneSkin 变 rice", () => {
    const s = shopper();
    const r = performAction(s, "buy_phone_rice");
    expect(r.ok).toBe(true);
    expect(s.phoneSkin).toBe("rice");
    expect(s.flags["item_phone_rice"]).toBe(true);
  });

  it("买摄像机 → item_camera flag", () => {
    const s = shopper();
    const r = performAction(s, "buy_camera");
    expect(r.ok).toBe(true);
    expect(s.flags["item_camera"]).toBe(true);
  });
});

describe("v1.10 烹饪门槛", () => {
  it("无厨具（出租屋）不能做饭", () => {
    const s = createInitialState(1);
    s.living.mode = "lease";
    s.living.lease = {
      housingId: "old_apartment",
      monthlyRent: 1200,
      paidUntil: { year: 2026, month: 9, day: 1 },
    } as never;
    const r = canCook(s, "dish_veg");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("厨具");
  });

  it("持基础厨具 + 非流浪（租约）可做饭", () => {
    const s = createInitialState(1);
    s.flags["cook_utensil"] = true;
    s.flags["ateToday"] = true;
    addItem(s, "vegetable", 1);
    s.living.mode = "lease";
    s.living.lease = {
      housingId: "old_apartment",
      monthlyRent: 1200,
      paidUntil: { year: 2026, month: 9, day: 1 },
    } as never;
    const r = canCook(s, "dish_veg");
    expect(r.ok).toBe(true);
  });

  it("持厨具但 gov 流浪仍禁", () => {
    const s = createInitialState(1);
    s.flags["cook_utensil"] = true;
    s.living.mode = "gov";
    const r = canCook(s, "dish_veg");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("流浪");
  });

  it("便利店买熟食不受影响（buy_food 不依赖 cook_utensil）", () => {
    const s = createInitialState(1);
    s.time.hour = 12;
    s.locationId = "convenience_store";
    s.player.money = 500;
    const r = performAction(s, "buy_lunch_convenience");
    expect(r.ok).toBe(true);
  });
});

describe("v1.10 物品数据", () => {
  it("三档厨具共享 cook_utensil flag", () => {
    for (const id of ["kitchen_set", "cook_set_mid", "cook_set_high"]) {
      const it = getItem(id);
      expect(it).toBeDefined();
      expect(it!.effects?.flags?.cook_utensil).toBe(true);
    }
  });

  it("三档健身器材共享 item_gym_equipment flag", () => {
    for (const id of ["gym_equipment", "gym_mid", "gym_high"]) {
      const it = getItem(id);
      expect(it).toBeDefined();
      expect(it!.effects?.flags?.item_gym_equipment).toBe(true);
    }
  });

  it("三档手机带 phoneSkin 字段", () => {
    expect(getItem("phone_rice")!.phoneSkin).toBe("rice");
    expect(getItem("phone_flower")!.phoneSkin).toBe("flower");
    expect(getItem("phone_fruit")!.phoneSkin).toBe("fruit");
  });
});
