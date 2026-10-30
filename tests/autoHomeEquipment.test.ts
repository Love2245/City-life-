import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { addItem, ITEMS } from "../src/game/core/items";
import { syncAutoHomeEquipment, equipItem, equippedSummary } from "../src/game/core/equipment";
import { facilityEfficiency } from "../src/game/core/facility";

describe("家中设备自动选用", () => {
  it("购入自动升级，较低档和重复同步不会降级或重复加成", () => {
    const s = createInitialState();
    addItem(s, "laptop_pro");
    expect(s.equipped.tool).toBe("laptop_pro");
    const attrs = JSON.stringify(s.player);
    addItem(s, "laptop");
    syncAutoHomeEquipment(s);
    expect(s.equipped.tool).toBe("laptop_pro");
    expect(JSON.stringify(s.player)).toBe(attrs);
    expect(equipItem(s, "laptop").ok).toBe(false);
    expect(equippedSummary(s).every(row => !["tool", "appliance", "furniture"].includes(row.slot))).toBe(true);
  });

  it("旧档已安装冰箱保留，不丢食物", () => {
    const s = createInitialState();
    s.fridge = { tier: "large", items: { egg: 3 } };
    addItem(s, "fridge_small");
    expect(s.fridge.tier).toBe("large");
    expect(s.fridge.items).toEqual({ egg: 3 });
    expect(s.equipped.appliance).toBe("fridge_large");
  });

  it("烹饪和开发各自使用最佳设施，不用在同一工具槽来回切换", () => {
    const s = createInitialState();
    const cook = ITEMS.filter(item => item.facilityBonus?.cook).sort((a,b) => b.facilityBonus!.cook! - a.facilityBonus!.cook!)[0];
    addItem(s, cook.id);
    addItem(s, "laptop_pro");
    expect(facilityEfficiency(s, "cook")).toBe(cook.facilityBonus!.cook);
    expect(facilityEfficiency(s, "dev")).toBe(2);
  });
});
