import type { GameState, ItemDef } from "../types";
import { inventoryGroupOf, inventoryList } from "./items";

/** 所有物品沿用原有所有权记录，仅改变展示和管理位置。 */
export function storageLocationOf(item: ItemDef): "backpack" | "wardrobe" | "credentials" | "home" {
  const group = inventoryGroupOf(item);
  if (group === "consumables" || group === "documents" || group === "collectibles" || group === "quest_items") return "backpack";
  if (group === "credentials") return "credentials";
  if (item.slot && ["hat", "clothes", "underlayer", "pants", "accessory"].includes(item.slot)) return "wardrobe";
  return "home";
}

export function storedItems(state: GameState, location: ReturnType<typeof storageLocationOf>) {
  return inventoryList(state).filter(({ item, qty }) => item.id !== "doc_church_gospel_box" && qty > 0 && storageLocationOf(item) === location);
}
