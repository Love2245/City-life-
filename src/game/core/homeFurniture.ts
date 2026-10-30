import type { GameState } from "../types";
import itemData from "../data/items.json";

/** Independent furniture families. The highest owned tier is used within each family. */
export const HOME_FURNITURE = {
  bed: { name: "床与寝具", items: ["bed_basic", "bed_standard", "bed_premium"], sprites: ["bed-basic", "bed-standard", "bed-premium"], slot: "home_bed" },
  computer: { name: "书桌与电脑", items: ["laptop", "laptop_mid", "laptop_pro"], sprites: ["computer-basic", "computer-standard", "computer-premium"], slot: "tool" },
  fridge: { name: "冰箱", items: ["fridge_small", "fridge_medium", "fridge_large"], sprites: ["fridge-small", "fridge-medium", "fridge-large"], slot: "appliance" },
  sofa: { name: "沙发", items: ["sofa"], sprites: ["sofa"], slot: "home_sofa" },
  lamp: { name: "灯光", items: ["lamp"], sprites: ["lamp"], slot: "home_lamp" },
  plant: { name: "绿植", items: ["plant"], sprites: ["plant"], slot: "home_plant" },
  shower: { name: "浴室", items: ["shower_basic", "shower_premium"], sprites: ["shower", "shower"], slot: "home_shower" },
  kitchen: { name: "厨房", items: ["kitchen_set", "cook_set_mid", "cook_set_high"], sprites: ["stove", "stove", "stove"], slot: "home_kitchen" },
  gym: { name: "锻炼角", items: ["gym_equipment", "gym_mid", "gym_high"], sprites: ["gym", "gym", "gym"], slot: "home_gym" },
} as const;
export type HomeFurnitureKind = keyof typeof HOME_FURNITURE;
export const HOME_KINDS = Object.keys(HOME_FURNITURE) as HomeFurnitureKind[];
export const HOME_ITEM_IDS: ReadonlySet<string> = new Set(HOME_KINDS.flatMap(key => [...HOME_FURNITURE[key].items]));
const registry = new Map(itemData.items.map(item => [item.id, item]));

export function homeFurnitureKind(itemId: string): HomeFurnitureKind | undefined {
  return HOME_KINDS.find(key => (HOME_FURNITURE[key].items as readonly string[]).includes(itemId));
}
export function bestHomeItem(state: GameState, kind: HomeFurnitureKind): string | undefined {
  const items = HOME_FURNITURE[kind].items as readonly string[];
  for (let i = items.length - 1; i >= 0; i--) {
    if ((state.inventory?.[items[i]] ?? 0) > 0) return items[i];
    if (kind === "fridge" && state.fridge?.tier === ["small", "medium", "large"][i]) return items[i];
  }
  return undefined;
}
export function homeSprite(state: GameState, kind: HomeFurnitureKind): string | undefined {
  const item = bestHomeItem(state, kind);
  const index = item ? (HOME_FURNITURE[kind].items as readonly string[]).indexOf(item) : -1;
  return index < 0 ? undefined : HOME_FURNITURE[kind].sprites[index];
}
export function homeItemName(state: GameState, kind: HomeFurnitureKind): string {
  const id = bestHomeItem(state, kind);
  return id ? registry.get(id)?.name ?? HOME_FURNITURE[kind].name : "尚未购置";
}
