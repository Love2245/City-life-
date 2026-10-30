import type { ItemDef } from "../types";
import { inventoryGroupOf } from "./items";
import { HOME_ITEM_IDS } from "./homeFurniture";

export const DEVELOPER_ITEM_CATEGORIES: Record<string,string> = {
  all:"全部",quest_items:"任务物品",consumables:"消耗品",ingredients:"食材",
  clothing:"服装与配饰",furniture:"家具与家装",electronics:"电子设备",transport:"交通工具",
  credentials:"证照卡券",documents:"书籍与文书",collectibles:"收藏",equipment:"其他装备",other:"其他",
};
export function developerItemCategory(item: ItemDef): string {
  const group = inventoryGroupOf(item);
  if (["quest_items","consumables","ingredients","credentials","documents","collectibles"].includes(group)) return group;
  if (item.slot && ["hat","clothes","underlayer","pants","accessory"].includes(item.slot)) return "clothing";
  if (item.phoneSkin || /^(?:phone|laptop|camera|gaming_)/.test(item.id)) return "electronics";
  if (HOME_ITEM_IDS.has(item.id) || item.homeSurface || item.fridgeTier || item.slot && ["furniture","appliance"].includes(item.slot)) return "furniture";
  if (item.keyDisplay || item.slot === "transport" || ["bicycle","e_bike","tricycle","car"].includes(item.id)) return "transport";
  return group;
}
export function developerItemMatchesCategory(item: ItemDef, category: string): boolean { return category === "all" || developerItemCategory(item) === category; }
