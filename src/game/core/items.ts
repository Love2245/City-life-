/**
 * 物品系统：数据加载、兑换应用、背包管理。
 * 纯逻辑层。
 * - 背包：GameState.inventory（itemId → 数量）
 * - 消耗品：购买入包（buy_item handler 调 addItem）、背包使用（useItem）
 * - 车钥匙：e_bike/bicycle 在背包显示 keyDisplay
 */
import type { Effects, GameState, ItemData, ItemDef, ResultDelta } from "../types";
import { applyEffects, collectDeltas } from "../engine";
import { recordFoodEaten } from "./achievements";
import { adoptCat } from "./cat";
import { hasLongTermResidence } from "./residence";
import itemData from "../data/items.json";
import { syncAutoHomeEquipment } from "./equipment";
import { HOME_ITEM_IDS } from "./homeFurniture";
import { NPC_TASK_ITEMS } from "../data/npcTaskData";
import { INTERIOR_ITEMS } from '../data/interiorActivities';

export const ITEM_DATA: ItemData = { ...(itemData as unknown as ItemData), items: [...(itemData as unknown as ItemData).items, ...NPC_TASK_ITEMS, ...INTERIOR_ITEMS] };
export const ITEMS: ItemDef[] = ITEM_DATA.items;
export const ITEM_POINT_COST: number = ITEM_DATA.pointCost;

/** v0.935：开局「起步装备」可点数兑换的物品（不含零食/生鲜等低价值项） */
export const START_ITEMS: ItemDef[] = ITEMS.filter((i) => i.startOffer === true);

/** v0.935：开局兑换时该物品实际消耗的点数（缺省用顶层 pointCost） */
export function startCostOf(item?: ItemDef): number {
  return item?.startCost ?? ITEM_POINT_COST;
}

const itemMap = new Map(ITEMS.map((i) => [i.id, i]));

export type InventoryGroup = "consumables" | "equipment" | "credentials" | "ingredients" | "documents" | "collectibles" | "quest_items" | "other";

export const INVENTORY_GROUP_LABELS: Record<InventoryGroup, string> = {
  consumables: "消耗品",
  equipment: "装备",
  credentials: "证照卡券",
  ingredients: "食材",
  documents: "书籍与文书",
  collectibles: "收藏",
  quest_items: "任务物品",
  other: "其他",
};

const CREDENTIAL_ITEM_IDS = new Set([
  "driving_license",
  "certificate",
  "gym_card",
  "cat_ticket_primary",
  "cat_ticket_mid",
  "cat_ticket_advanced",
  "cat_ticket_ultimate",
]);

// 这些非槽位物品仍是明确的随身/功能装备；宠物和纪念物则保留在「其他」。
const FUNCTIONAL_EQUIPMENT_IDS = new Set(["phone", "camera", "gym_mid", "gym_high", "fishing_rod", "fishing_bait", "fishing_bucket"]);

/** 按既有物品字段稳定归组，不写入存档；未知旧物默认留在「其他」。 */
export function inventoryGroupOf(item: ItemDef): InventoryGroup {
  if (item.tags?.includes("任务物品")) return "quest_items";
  if (item.id.startsWith("plush_") || item.id.startsWith("fish_specimen_")) return "collectibles";
  if (item.tags?.includes("书籍与文书")) return "documents";
  if (
    CREDENTIAL_ITEM_IDS.has(item.id) ||
    item.tags?.some((tag) => /证照|会籍|门票|邀请函|对决赛|卡券/.test(tag))
  ) {
    return "credentials";
  }
  // 生鲜可作为烹饪原料，也可能直接食用；优先保证能直接使用的食物留在背包。
  if (item.consumable) return "consumables";
  if (item.cookingCategory || item.tags?.some((tag) => /生鲜食材|需烹饪/.test(tag))) {
    return "ingredients";
  }
  if (
    item.slot || item.luxury || item.keyDisplay || item.unlocks || item.phoneSkin ||
    item.fridgeTier || item.homeSurface || item.facilityBonus || FUNCTIONAL_EQUIPMENT_IDS.has(item.id)
  ) {
    return "equipment";
  }
  return "other";
}

export function getItem(id: string): ItemDef | undefined {
  return itemMap.get(id);
}

/** 应用物品：设置 flag + 可选 effects（占位）；v1.32 带 cat 字段的物品同时收养对应猫咪 */
export function applyItem(state: GameState, itemId: string): void {
  const item = getItem(itemId);
  if (!item) return;
  // A new pet needs a stable home; pets already in an old save are never removed or penalized.
  if (item.cat && !hasLongTermResidence(state)) return;
  state.flags[`item_${itemId}`] = true;
  if (item.cat) {
    adoptCat(state, item.cat);
  }
  if (item.effects) {
    applyEffects(state, item.effects, item.icon);
  }
}

/** 背包数量 */
export function itemCount(state: GameState, itemId: string): number {
  return state.inventory[itemId] ?? 0;
}

/** 入包（购买） */
export function addItem(state: GameState, itemId: string, qty = 1): void {
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + qty;
  if (itemId === "fishing_rod" && qty > 0) state.flags.fishing_rod_owned = true;
  if (itemId === "fishing_bucket" && qty > 0) state.flags.fishing_bucket_owned = true;
  if (HOME_ITEM_IDS.has(itemId) || (getItem(itemId)?.slot && ["furniture", "appliance", "tool"].includes(getItem(itemId)!.slot!))) syncAutoHomeEquipment(state);
}

const ITEM_ACQUISITION_APPLIED_PREFIX = "item_acquisition_applied_";

/**
 * 商城实物获得：增加库存、登记奢侈品，并只在首次获得时应用一次性属性效果。
 * 手机主题仍会随当前领取的机型切换；重复领取不会重复刷名表属性。
 */
export function acquireShopItem(state: GameState, itemId: string): boolean {
  const item = getItem(itemId);
  if (!item) return false;
  addItem(state, itemId, 1);
  state.economy.ownedLuxury ??= [];
  if (item.luxury && !state.economy.ownedLuxury.includes(itemId)) {
    state.economy.ownedLuxury.push(itemId);
  }
  if (!state.flags[`${ITEM_ACQUISITION_APPLIED_PREFIX}${itemId}`]) {
    // 旧版线下购买用 item_<id> 标记表示其一次性 effects 已发放。
    if (!state.flags[`item_${itemId}`]) applyItem(state, itemId);
    state.flags[`${ITEM_ACQUISITION_APPLIED_PREFIX}${itemId}`] = true;
  }
  if (item.phoneSkin) state.phoneSkin = item.phoneSkin;
  return true;
}

/**
 * 幂等修复旧存档中已拥有、但未登记完整效果的功能物品。
 * migrateSave 在返回任何版本的状态前调用；只处理笔记本和有获取副作用的商城物品。
 */
export function repairOwnedItemAcquisitionState(state: GameState): void {
  state.inventory ??= {};
  state.flags ??= {};
  state.economy.ownedLuxury ??= [];

  // 旧版开局选择物品只留下 item_laptop flag。补回实体后由常规自动装备刷新应用属性与设施效果。
  const laptopOwned = (state.inventory.laptop ?? 0) > 0 || state.flags.item_laptop === true;
  if (laptopOwned) {
    if ((state.inventory.laptop ?? 0) <= 0) state.inventory.laptop = 1;
    state.flags.item_laptop = true;
    state.flags[`${ITEM_ACQUISITION_APPLIED_PREFIX}laptop`] = true;
  }

  const phoneIds = ITEMS.filter((item) => !!item.phoneSkin).map((item) => item.id);
  const eligible = ITEMS.filter((item) => !!item.phoneSkin || !!item.luxury);
  for (const item of eligible) {
    const owned = (state.inventory[item.id] ?? 0) > 0
      || state.flags[`item_${item.id}`] === true
      || (item.luxury && state.economy.ownedLuxury.includes(item.id));
    if (!owned) continue;

    if (item.luxury && !state.economy.ownedLuxury.includes(item.id)) {
      state.economy.ownedLuxury.push(item.id);
    }
    if (!state.flags[`${ITEM_ACQUISITION_APPLIED_PREFIX}${item.id}`]) {
      // 有旧版 item_<id> flag 的物品已在旧线下购买流程发过 effects；没有 flag 的订单领取则需补发。
      if (!state.flags[`item_${item.id}`]) applyItem(state, item.id);
      state.flags[`${ITEM_ACQUISITION_APPLIED_PREFIX}${item.id}`] = true;
    }
  }

  // 手机皮肤缺失时，优先用存档中最后列出的已拥有手机恢复；不覆盖玩家已有主题。
  if (!state.phoneSkin) {
    const ownedPhones = Object.keys(state.inventory).filter((id) => phoneIds.includes(id) && state.inventory[id] > 0);
    const lastOwnedPhone = ownedPhones[ownedPhones.length - 1];
    const ownedFlagPhone = Object.keys(state.flags).filter((key) => key.startsWith("item_") && phoneIds.includes(key.slice(5)));
    const latestOwnedPhone = lastOwnedPhone ?? ownedFlagPhone[ownedFlagPhone.length - 1]?.slice(5);
    const skin = latestOwnedPhone ? getItem(latestOwnedPhone)?.phoneSkin : undefined;
    if (skin) state.phoneSkin = skin;
  }
  syncAutoHomeEquipment(state);
}

/** 消耗；数量不足返回 false。v1.39 加 inventory 守卫防止 corrupted save 崩溃 */
export function removeItem(state: GameState, itemId: string, qty = 1): boolean {
  if (!state.inventory) return false;
  const cur = state.inventory[itemId] ?? 0;
  if (cur < qty) return false;
  const next = cur - qty;
  if (next <= 0) delete state.inventory[itemId];
  else state.inventory[itemId] = next;
  return true;
}

export interface UseItemResult {
  ok: boolean;
  text: string;
  reason?: string;
  deltas?: ResultDelta[];
}

/** 使用消耗品：检查数量与可用性 → 应用效果 → 消耗 */
export function useItem(state: GameState, itemId: string): UseItemResult {
  const item = getItem(itemId);
  if (!item) return { ok: false, text: "未知物品", reason: "未知物品" };
  if (!item.consumable) {
    return { ok: false, text: "这件物品不能使用", reason: "这件物品不能直接使用" };
  }
  if (!removeItem(state, itemId, 1)) {
    return { ok: false, text: "背包里没有这件物品了", reason: "背包里没有这件物品了" };
  }
  const eff: Effects = item.useEffects ?? {};
  applyEffects(state, eff, item.icon);
  if (eff.satiety && eff.satiety > 0) recordFoodEaten(state, itemId); // v0.94 收集成就
  return {
    ok: true,
    text: item.useEffects?.log ?? `使用了${item.name}`,
    deltas: collectDeltas(eff),
  };
}

/** 背包完整清单（含车钥匙显示名） */
export function inventoryList(state: GameState): Array<{ item: ItemDef; qty: number; displayName: string }> {
  const out: Array<{ item: ItemDef; qty: number; displayName: string }> = [];
  // 老档若缺少 inventory 子对象，按空背包显示，不因打开背包崩溃。
  for (const [id, qty] of Object.entries(state.inventory ?? {})) {
    const item = getItem(id);
    if (!item) continue;
    out.push({ item, qty, displayName: item.keyDisplay ?? item.name });
  }
  out.sort((a, b) => a.item.name.localeCompare(b.item.name, "zh"));
  return out;
}
