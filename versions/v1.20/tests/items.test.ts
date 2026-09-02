import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyItem, getItem, ITEMS, ITEM_POINT_COST } from "../src/game/core/items";

describe("物品系统：数据", () => {
  it("2 点换 1 件", () => {
    expect(ITEM_POINT_COST).toBe(2);
  });

  it("50 件物品齐全（v1.20 新增摆摊小车）", () => {
    const ids = ITEMS.map((i) => i.id);
    expect(ids).toContain("driving_license");
    expect(ids).toContain("bicycle");
    expect(ids).toContain("laptop");
    expect(ids).toContain("certificate");
    expect(ids).toContain("e_bike");
    // 消耗品
    expect(ids).toContain("phone");
    expect(ids).toContain("medicine");
    expect(ids).toContain("bandage");
    expect(ids).toContain("noodles");
    expect(ids).toContain("fruit");
    expect(ids).toContain("salad");
    expect(ids).toContain("bento");
    expect(ids).toContain("drink");
    // 载具
    expect(ids).toContain("tricycle");
    expect(ids).toContain("car");
    // v0.92 新增：生食材（蔬菜/肉类）+ 便利店三明治 + 健身月卡
    expect(ids).toContain("vegetable");
    expect(ids).toContain("meat");
    expect(ids).toContain("sandwich");
    expect(ids).toContain("gym_card");
    // v0.94 新增：奢侈品（名牌店出售）
    expect(ids).toContain("luxury_coat");
    expect(ids).toContain("luxury_watch");
    expect(ids).toContain("luxury_bag");
    // v0.95 新增：装备（衣服/家具）+ 解锁道具
    expect(ids).toContain("shirt");
    expect(ids).toContain("suit");
    expect(ids).toContain("lamp");
    expect(ids).toContain("sofa");
    expect(ids).toContain("plant");
    expect(ids).toContain("kitchen_set");
    expect(ids).toContain("gym_equipment");
    expect(ids).toContain("item_manuscript");
    // v0.981 新增：郊区农牧产出（自产自销 / 可食用）
    expect(ids).toContain("farm_vegetable");
    expect(ids).toContain("farm_egg");
    expect(ids).toContain("farm_milk");
    expect(ids).toContain("farm_fruit");
    // v1.10 百货商场新增 9 件：办公笔记本/专业厨具/豪华厨具/杠铃套装/健身套装/三档手机/摄像机
    expect(ids).toContain("laptop_mid");
    expect(ids).toContain("cook_set_mid");
    expect(ids).toContain("cook_set_high");
    expect(ids).toContain("gym_mid");
    expect(ids).toContain("gym_high");
    expect(ids).toContain("phone_rice");
    expect(ids).toContain("phone_flower");
    expect(ids).toContain("phone_fruit");
    expect(ids).toContain("camera");
    expect(ids.length).toBe(50);
  });
});

describe("物品系统：应用", () => {
  it("applyItem 设置 flag", () => {
    const s = createInitialState();
    applyItem(s, "driving_license");
    expect(s.flags["item_driving_license"]).toBe(true);
    expect(getItem("driving_license")).toBeDefined();
  });

  it("未知物品无副作用", () => {
    const s = createInitialState();
    const before = JSON.stringify(s.flags);
    applyItem(s, "nonexistent");
    expect(JSON.stringify(s.flags)).toBe(before);
  });
});
