import { PLAYER_OUTFIT_SETS, playerOutfitSet, outfitSetForItem, LEGACY_OUTFIT_ITEM, outfitParts } from "./playerOutfitSets";
/**
 * v1.45 穿搭系统。
 *
 * 服装仍然使用 inventory + equipped 这套现有状态，不额外复制一份玩家穿搭状态。
 * 本文件只负责服装识别、衣柜数据、服装店事务和基础服装兜底；渲染资源由
 * npcPortraits / PortraitStack 负责解析。
 */
import type { GameState, ItemDef } from "../types";
import { applyEffects, pushLog } from "../engine";
import { addItem, applyItem, getItem, ITEMS } from "./items";
import { equipItem, unequipItem } from "./equipment";
import { scaleCost } from "./difficulty";
import {
  CLOTHING_SLOTS,
  VISIBLE_CLOTHING_SLOTS,
  DEFAULT_WARDROBE,
  STARTER_WARDROBE_ITEMS,
  isClothingSlot,
  type ClothingSlot,
} from "./clothingConstants";

export { CLOTHING_SLOTS, VISIBLE_CLOTHING_SLOTS, DEFAULT_WARDROBE, STARTER_WARDROBE_ITEMS, isClothingSlot };
export type { ClothingSlot };

export interface ClothingCheckoutResult {
  ok: boolean;
  reason?: string;
  purchasedIds: string[];
  equippedIds: string[];
  total: number;
}

export function isClothingItem(item?: ItemDef): item is ItemDef & { slot: ClothingSlot } {
  return !!item && isClothingSlot(item.slot) && !!item.outfitLayer;
}

/** 全部服装目录，包含商店服装和工作奖励服装，供衣柜使用。 */
export function clothingCatalog(): ItemDef[] {
  return ITEMS.filter((item) => isClothingItem(item));
}

export function clothingItemsForSlot(slot: ClothingSlot): ItemDef[] {
  return clothingCatalog().filter((item) => item.slot === slot);
}

export const CLOTHING_STORES = {
  boyue_sports_store: { name: "奥林匹克体育用品店", description: "运动球衣套装" },
  clothing_store: { name: "街角衣橱", description: "衬衫与针织休闲套装" },
  budget_clothing_store: { name: "布衣小铺", description: "实惠的日常基础套装" },
  luxury_store: { name: "名牌店", description: "正装与羊绒大衣套装" },
} as const;
export type ClothingStoreId = keyof typeof CLOTHING_STORES;

export function isClothingStoreId(id: string): id is ClothingStoreId {
  return Object.prototype.hasOwnProperty.call(CLOTHING_STORES, id);
}

const LUXURY_CLOTHING = new Set(["suit", "taupe_double_suit", "taupe_suit_trousers", "luxury_coat"]);
const BUDGET_CLOTHING = new Set([
  "white_vest", "black_pants", "underlayer_white", "underlayer_black", "underlayer_gray",
  "plain_white_tee", "plain_black_tee", "plain_gray_tee", "plain_gray_pants",
]);

export function clothingVendor(item: ItemDef): ClothingStoreId | undefined {
  if (!isClothingItem(item) || item.shopPrice === undefined || item.id === "cyan_jacket") return undefined;
  if (["football_jersey", "basketball_jersey", "sports_shorts"].includes(item.id)) return "boyue_sports_store";
  if (LUXURY_CLOTHING.has(item.id)) return "luxury_store";
  return BUDGET_CLOTHING.has(item.id) ? "budget_clothing_store" : "clothing_store";
}

/** 无参数保留全店目录查询；结算始终以实际所在地的供应目录校验。 */
export function clothingStoreCatalog(storeId?: string): ItemDef[] {
  return clothingCatalog().filter((item) => {
    const vendor = clothingVendor(item);
    return !!vendor && (storeId === undefined || vendor === storeId);
  });
}

export function clothingStoreItemsForSlot(slot: ClothingSlot, storeId?: string): ItemDef[] {
  return clothingStoreCatalog(storeId).filter((item) => item.slot === slot);
}

/** 其他店买到或工作获得的自有服装也能在试衣间搭配。 */
export function clothingTryOnItemsForSlot(state: GameState, slot: ClothingSlot): ItemDef[] {
  return clothingItemsForSlot(slot).filter((item) =>
    isOwnedClothing(state, item.id) || clothingVendor(item) === state.locationId,
  );
}

export function clothingPrice(state: GameState, itemOrId: ItemDef | string): number {
  const item = typeof itemOrId === "string" ? getItem(itemOrId) : itemOrId;
  if (!item || item.shopPrice === undefined) return 0;
  return Math.max(0, scaleCost(state, item.shopPrice));
}

export function isOwnedClothing(state: GameState, itemId: string): boolean {
  return (state.inventory?.[itemId] ?? 0) > 0;
}

/** 确保新档和迁移档都有基础服装及初始青色外套。不会覆盖已有装备。 */
export function ensureWardrobeDefaults(state: GameState): void {
  if (!state.inventory || typeof state.inventory !== "object") state.inventory = {};
  for (const itemId of STARTER_WARDROBE_ITEMS) {
    if ((state.inventory[itemId] ?? 0) < 1) state.inventory[itemId] = 1;
  }
  if (!state.equipped || typeof state.equipped !== "object") state.equipped = {};

  for (const slot of ["clothes", "underlayer", "pants"] as const) {
    const current = state.equipped[slot];
    const currentItem = current ? getItem(current) : undefined;
    if (current && isClothingItem(currentItem) && currentItem.slot === slot) {
      // 旧档若只保存了 equipped 而库存缺失，补回一件避免出现“已穿但无法再次装备”的坏状态。
      if ((state.inventory[current] ?? 0) < 1) state.inventory[current] = 1;
      continue;
    }
    state.equipped[slot] = DEFAULT_WARDROBE[slot];
  }

  // Convert only the items actually held before migration. Granted matching
  // trousers must never unlock other outfits on the next load.
  if (state.flags.outfit_sets_v1 !== true) {
    const legacyOwned = Object.keys(state.inventory).filter(id => state.inventory[id] > 0);
    for (const id of legacyOwned) {
      const mapped = LEGACY_OUTFIT_ITEM[id];
      if (mapped && (state.inventory[mapped] ?? 0) < 1) state.inventory[mapped] = 1;
    }
    state.flags.outfit_sets_v1 = true;
  }
  for (const set of PLAYER_OUTFIT_SETS) if ((state.inventory[set.id] ?? 0) > 0) {
    for (const [, id] of outfitParts(set)) if ((state.inventory[id] ?? 0) < 1) state.inventory[id] = 1;
  }
  if (!playerOutfitSet(state.equipped.clothes)) state.equipped.clothes = DEFAULT_WARDROBE.clothes;
  equipItem(state, state.equipped.clothes!);

  const hat = state.equipped.hat;
  if (hat) {
    const hatItem = getItem(hat);
    if (!isClothingItem(hatItem) || hatItem.slot !== "hat") delete state.equipped.hat;
    else if ((state.inventory[hat] ?? 0) < 1) state.inventory[hat] = 1;
  }
}

/** 进入电子厂时领取一次厂服；领取服装不会强制覆盖玩家当前穿搭。 */
export function onEnterClothingLocation(state: GameState, locationId: string): void {
  if (locationId !== "electronics_factory" || isOwnedClothing(state, "factory_uniform")) return;
  addItem(state, "factory_uniform", 1);
  state.flags["factory_uniform_received"] = true;
  pushLog(state, "🏭", "进电子厂登记时领到了一套厂服，已经放进衣柜");
}

const RURAL_WORK_LOCATIONS = new Set(["farm", "pasture", "orchard"]);

function queueClothingReward(state: GameState, readyFlag: string, eventId: string): void {
  if (state.flags[readyFlag] === true || state.flags[`ev_${eventId}_done`] === true) return;
  state.flags[readyFlag] = true;
  if (!state.pendingEvents) state.pendingEvents = [];
  if (!state.pendingEvents.includes(eventId)) state.pendingEvents.push(eventId);
}

/** 工作完成后累计场景经验，并在达到阈值时排队发放对应的非商店服装。 */
export function recordClothingWorkMilestone(state: GameState, locationId: string): void {
  if (RURAL_WORK_LOCATIONS.has(locationId)) {
    const count = (typeof state.flags.rural_work_count === "number" ? state.flags.rural_work_count : 0) + 1;
    state.flags.rural_work_count = count;
    if (count > 3 && !isOwnedClothing(state, "farm_workwear")) {
      queueClothingReward(state, "rural_workwear_event_ready", "ev_rural_workwear_gift");
    }
    return;
  }

  if (locationId === "cafe" || locationId === "fast_food") {
    const count = (typeof state.flags.service_work_count === "number" ? state.flags.service_work_count : 0) + 1;
    state.flags.service_work_count = count;
    if (count >= 3 && !isOwnedClothing(state, "service_apron")) {
      queueClothingReward(state, "service_apron_event_ready", "ev_service_apron_gift");
    }
    return;
  }

  if (locationId === "logistics_center") {
    const count = (typeof state.flags.delivery_work_count === "number" ? state.flags.delivery_work_count : 0) + 1;
    state.flags.delivery_work_count = count;
    if (count >= 3 && !isOwnedClothing(state, "delivery_vest")) {
      queueClothingReward(state, "delivery_vest_event_ready", "ev_delivery_vest_gift");
    }
  }
}

/** 当前实际穿着的服装 id；用于预览和立绘层解析。 */
export function equippedClothing(state: GameState): Record<ClothingSlot, string | undefined> {
  return {
    hat: state.equipped?.hat,
    clothes: state.equipped?.clothes ?? DEFAULT_WARDROBE.clothes,
    underlayer: state.equipped?.underlayer ?? DEFAULT_WARDROBE.underlayer,
    pants: state.equipped?.pants ?? DEFAULT_WARDROBE.pants,
  };
}

/**
 * 服装店结算：先完整校验，再统一扣款、入包、应用一次性效果并穿上。
 * selectedIds 每个槽位最多一个；已拥有商品不重复收费。
 */
/** Full-outfit catalogue; old separate pieces stay in inventory for compatibility. */
export function outfitCatalogFor(state: GameState, storeId?: string) {
  return PLAYER_OUTFIT_SETS.filter(set => isOwnedClothing(state, set.id) || (storeId && clothingVendor(getItem(set.id)!) === storeId))
    .map(set => ({ ...getItem(set.id)!, name: set.name, pants: set.pants }));
}
export function outfitPrice(state: GameState, id: string): number {
  const set = playerOutfitSet(id);
  if (!set || isOwnedClothing(state, id)) return 0;
  return [set.id, set.pants].reduce((sum, part) => sum + (isOwnedClothing(state, part) ? 0 : clothingPrice(state, part)), 0);
}

/** Validate the whole transaction before changing inventory, attributes or cash. */
export function checkoutClothing(state: GameState, selectedIds: string[], options: { removeHat?: boolean } = {}): ClothingCheckoutResult {
  const fail = (reason: string, total = 0): ClothingCheckoutResult => ({ ok: false, reason, total, purchasedIds: [], equippedIds: [] });
  const ids = [...new Set(selectedIds)], sets = new Set<string>(), hats: string[] = [];
  if (!ids.length) return fail("请先选择套装");
  for (const id of ids) {
    const item = getItem(id);
    if (!isClothingItem(item)) return fail("服装数据异常，请重新选择");
    if (item.slot === 'hat') hats.push(id);
    else { const set = outfitSetForItem(id); if (!set) return fail("请选择完整套装"); sets.add(set.id); }
  }
  if (sets.size > 1 || hats.length > 1 || (options.removeHat && hats.length)) return fail("请选择一套服装和一顶帽子");
  const set = playerOutfitSet([...sets][0]);
  if (set && !isOwnedClothing(state, set.id) && clothingVendor(getItem(set.id)!) !== state.locationId) return fail("当前店铺不出售这套服装");
  const hat = hats[0];
  if (hat && !isOwnedClothing(state, hat) && clothingVendor(getItem(hat)!) !== state.locationId) return fail("当前店铺不出售这顶帽子");
  const parts = [...(set ? [set.id, set.pants] : []), ...hats];
  const toBuy = parts.filter(id => !isOwnedClothing(state, id));
  const total = (set ? outfitPrice(state, set.id) : 0) + (hat && !isOwnedClothing(state, hat) ? clothingPrice(state, hat) : 0);
  if (state.player.money < total) return fail(`金钱不足（需要 ${total} 元）`, total);
  if (total > 0) applyEffects(state, { money: -total }, "🛍️");
  for (const id of toBuy) {
    const item = getItem(id)!;
    addItem(state, id, 1); applyItem(state, id);
    if (item.luxury && !state.economy.ownedLuxury.includes(id)) state.economy.ownedLuxury.push(id);
  }
  if (set) equipItem(state, set.id);
  if (hat) equipItem(state, hat);
  if (options.removeHat && state.equipped.hat) unequipItem(state, 'hat');
  pushLog(state, '🛍️', total > 0 ? '买下并换上了新穿搭' : '换上了已拥有的穿搭');
  return { ok: true, total, purchasedIds: toBuy, equippedIds: [...(set ? [set.id] : []), ...hats] };
}
