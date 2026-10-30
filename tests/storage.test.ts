import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { ITEMS, getItem, inventoryList, inventoryGroupOf } from "../src/game/core/items";
import { storedItems, storageLocationOf } from "../src/game/core/storage";
import { equipItem } from "../src/game/core/equipment";

describe("物品管理位置", () => {
  it("旧物品全部有唯一管理位置，分区不改变存档数量和装备加成", () => {
    const state = createInitialState(811);
    for (const item of ITEMS) state.inventory[item.id] = 2;
    equipItem(state, "shirt");
    const before = JSON.stringify({ inventory: state.inventory, equipped: state.equipped, player: state.player });
    const views = ["backpack", "wardrobe", "credentials", "home"] as const;
    const entries = views.flatMap(view => storedItems(state, view));
    expect(new Set(entries.map(entry => entry.item.id)).size).toBe(inventoryList(state).filter(entry => entry.item.id !== "doc_church_gospel_box").length);
    expect(entries).toHaveLength(inventoryList(state).filter(entry => entry.item.id !== "doc_church_gospel_box").length);
    expect(JSON.stringify({ inventory: state.inventory, equipped: state.equipped, player: state.player })).toBe(before);
    expect(storedItems(state, "backpack").every(({ item }) => item.consumable || item.tags?.includes("书籍与文书") || ['collectibles', 'quest_items'].includes(inventoryGroupOf(item)))).toBe(true);
  });

  it("服装归衣柜、证照归夹、设备归收纳；空数量不展示", () => {
    expect(storageLocationOf(getItem("shirt")!)).toBe("wardrobe");
    expect(storageLocationOf(getItem("driving_license")!)).toBe("credentials");
    expect(storageLocationOf(getItem("phone")!)).toBe("home");
    expect(storageLocationOf(getItem("bento")!)).toBe("backpack");
    expect(storageLocationOf(getItem("plush_bear")!)).toBe("backpack");
    const state = createInitialState(812);
    state.inventory.bento = 0;
    expect(storedItems(state, "backpack").some(entry => entry.item.id === "bento")).toBe(false);
  });
});
