import type { ItemSlot } from "../types";

/** v1.45 可视穿搭槽位；鞋子不进入本系统。 */
export const CLOTHING_SLOTS = ["hat", "clothes", "underlayer", "pants"] as const;
export type ClothingSlot = (typeof CLOTHING_SLOTS)[number];

/** 玩家可见的穿搭分类；underlayer 只作为旧存档/透明叠层的内部兼容层。 */
export const VISIBLE_CLOTHING_SLOTS = ["clothes", "hat"] as const;

export const DEFAULT_WARDROBE: Readonly<Record<Exclude<ClothingSlot, "hat">, string>> = {
  clothes: "white_vest",
  underlayer: "underlayer_white",
  pants: "black_pants",
};

export const STARTER_WARDROBE_ITEMS = ["white_vest", "underlayer_white", "black_pants", "cyan_jacket"] as const;

export function isClothingSlot(slot: ItemSlot | string | undefined): slot is ClothingSlot {
  return slot === "hat" || slot === "clothes" || slot === "underlayer" || slot === "pants";
}
