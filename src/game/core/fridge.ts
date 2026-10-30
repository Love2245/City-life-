/**
 * v1.42 冰箱与烹饪物品存储。
 * 这是独立家电槽，不复用家具装备槽；所有购买/取料操作先做容量预检，
 * 保证冰箱满时不会出现扣钱后才发现无法入库的半完成状态。
 */
import type { GameState, ItemDef } from "../types";
import { getItem } from "./items";
import { recordMoney } from "./weekly";

export const FRIDGE_TIERS = {
  small: { id: "small", name: "小冰箱", icon: "🧊", capacity: 20, price: 300 },
  medium: { id: "medium", name: "中冰箱", icon: "🧊", capacity: 40, price: 700 },
  large: { id: "large", name: "大冰箱", icon: "🧊", capacity: 100, price: 1200 },
} as const;

export type FridgeTier = keyof typeof FRIDGE_TIERS;

const TIER_ORDER: FridgeTier[] = ["small", "medium", "large"];

/**
 * 只读访问冰箱快照。
 *
 * 组件中的 `$derived` 会在渲染阶段执行。旧版存档可能还没有 fridge
 * 字段，之前的读取函数会在 derived 内调用 ensureFridge 并写回 state，
 * 这会让 Svelte 认为派生计算正在修改依赖，严重时直接中断烹饪弹窗的
 * 首次渲染。读取路径现在保持纯函数，只有真正的写操作才会补字段。
 */
function readFridge(state: GameState): { tier: FridgeTier | null; items: Record<string, number> } {
  const raw = state.fridge;
  if (!raw || typeof raw !== "object") return { tier: null, items: {} };
  const tier = typeof raw.tier === "string" && FRIDGE_TIERS[raw.tier as FridgeTier]
    ? raw.tier as FridgeTier
    : null;
  const items = raw.items && typeof raw.items === "object" ? raw.items : {};
  return { tier, items };
}

/** 旧存档/外部调用的安全兜底。不会覆盖已有库存。 */
export function ensureFridge(state: GameState): NonNullable<GameState["fridge"]> {
  if (!state.fridge || typeof state.fridge !== "object") state.fridge = { tier: null, items: {} };
  if (!state.fridge.items || typeof state.fridge.items !== "object") state.fridge.items = {};
  if (!FRIDGE_TIERS[state.fridge.tier as FridgeTier]) state.fridge.tier = null;
  return state.fridge;
}

export function fridgeCapacity(state: GameState): number {
  const tier = readFridge(state).tier;
  return tier ? FRIDGE_TIERS[tier].capacity : 0;
}

/** 成品占 2 格，其余烹饪物品（食材/调料）占 1 格。 */
export function storageSlotsOf(itemId: string, item?: ItemDef): number {
  if (itemId.startsWith("cooked:")) return 2;
  if (item?.cookingCategory === "prepared") return 2;
  return 1;
}

export function fridgeUsedSlots(state: GameState): number {
  const fridge = readFridge(state);
  return Object.entries(fridge.items).reduce((sum, [id, qty]) => {
    const count = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
    return sum + count * storageSlotsOf(id, getItem(id));
  }, 0);
}

export function fridgeRemainingSlots(state: GameState): number {
  return Math.max(0, fridgeCapacity(state) - fridgeUsedSlots(state));
}

export function hasFridge(state: GameState): boolean {
  return readFridge(state).tier !== null;
}

export function canInstallFridge(state: GameState, tier?: FridgeTier): { ok: boolean; reason?: string; price?: number; tier?: FridgeTier } {
  if (!tier || !FRIDGE_TIERS[tier]) return { ok: false, reason: "未知冰箱型号" };
  if (state.living.mode !== "lease" && state.living.mode !== "own") {
    return { ok: false, reason: "冰箱只能安装在月租房或产权房" };
  }
  // 报价用于卡片渲染时必须保持纯读，不能在 derived 计算中写回旧存档字段。
  const current = readFridge(state).tier;
  if (current === tier) return { ok: false, reason: "已经安装了同档冰箱" };
  if (current && TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(current)) {
    return { ok: false, reason: "冰箱只允许升级，不能降级" };
  }
  const price = FRIDGE_TIERS[tier].price - (current ? FRIDGE_TIERS[current].price : 0);
  if (state.player.money < price) return { ok: false, reason: `金钱不足（需要 ${price} 元）` };
  return { ok: true, price, tier };
}

/** 安装或升级冰箱；不会清空已有库存。 */
export function installFridge(state: GameState, tier: FridgeTier): { ok: boolean; reason?: string; price?: number } {
  const check = canInstallFridge(state, tier);
  if (!check.ok || !check.price && check.price !== 0) return { ok: false, reason: check.reason };
  state.player.money -= check.price;
  recordMoney(state, -check.price);
  ensureFridge(state).tier = tier;
  // 冰箱使用独立家电槽，不会替换床、沙发、灯等家具装备。
  state.equipped ??= {};
  state.equipped.appliance = `fridge_${tier}`;
  return { ok: true, price: check.price };
}

export function fridgeCount(state: GameState, itemId: string): number {
  return readFridge(state).items[itemId] ?? 0;
}

export function canStoreInFridge(state: GameState, itemId: string, qty = 1): boolean {
  if (!hasFridge(state) || qty <= 0) return false;
  const slots = storageSlotsOf(itemId, getItem(itemId)) * qty;
  return fridgeRemainingSlots(state) >= slots;
}

export function storeInFridge(state: GameState, itemId: string, qty = 1): boolean {
  if (!canStoreInFridge(state, itemId, qty)) return false;
  const fridge = ensureFridge(state);
  fridge.items[itemId] = (fridge.items[itemId] ?? 0) + qty;
  return true;
}

export function removeFromFridge(state: GameState, itemId: string, qty = 1): boolean {
  const fridge = ensureFridge(state);
  const cur = fridge.items[itemId] ?? 0;
  if (qty <= 0 || cur < qty) return false;
  if (cur === qty) delete fridge.items[itemId];
  else fridge.items[itemId] = cur - qty;
  return true;
}

/** 购买烹饪物品的统一入库入口。满格时返回失败且不改动任何状态。 */
export function routeCookingPurchase(state: GameState, itemId: string, qty = 1): { ok: boolean; stored: "fridge" | "inventory"; reason?: string } {
  if (hasFridge(state)) {
    if (!canStoreInFridge(state, itemId, qty)) {
      return { ok: false, stored: "fridge", reason: "冰箱空间不足，请先在厨房用掉一些库存后再试" };
    }
    storeInFridge(state, itemId, qty);
    return { ok: true, stored: "fridge" };
  }
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + qty;
  return { ok: true, stored: "inventory" };
}

/** 从背包和冰箱混合取料，背包优先，调用前应先用 cookingItemCount 预检。 */
export function removeCookingItem(state: GameState, itemId: string, qty = 1): boolean {
  if (qty <= 0) return true;
  const inventoryQty = state.inventory?.[itemId] ?? 0;
  const fridgeQty = fridgeCount(state, itemId);
  if (inventoryQty + fridgeQty < qty) return false;
  const fromInventory = Math.min(inventoryQty, qty);
  if (fromInventory > 0) {
    const left = inventoryQty - fromInventory;
    if (left > 0) state.inventory[itemId] = left;
    else delete state.inventory[itemId];
  }
  const fromFridge = qty - fromInventory;
  if (fromFridge > 0) removeFromFridge(state, itemId, fromFridge);
  return true;
}

export function cookingItemCount(state: GameState, itemId: string): number {
  return (state.inventory?.[itemId] ?? 0) + fridgeCount(state, itemId);
}

/** 保留旧库存的原始 id；只在烹饪时把旧泛称归入具体食材。 */
export function canonicalCookingItemId(itemId: string): string {
  return ({ vegetable: "cabbage", farm_vegetable: "cabbage", meat: "pork", farm_egg: "egg", farm_milk: "milk" } as Record<string, string>)[itemId] ?? itemId;
}

/** 旧食材 id 与新扩展包统一为可匹配的烹饪类别。 */
export function cookingCategoryOf(itemId: string): string | undefined {
  const canonicalId = canonicalCookingItemId(itemId);
  // 泡面仍是可直接食用的成品，也允许在厨房作为原料加热。
  if (canonicalId === "noodles") return "noodles";
  const item = getItem(canonicalId);
  if (item?.cookingCategory) return item.cookingCategory;
  return undefined;
}

export function isCookingItem(itemId: string): boolean {
  return cookingCategoryOf(itemId) !== undefined;
}

export function fridgeList(state: GameState): Array<{ id: string; qty: number; slots: number; item?: ItemDef }> {
  return Object.entries(readFridge(state).items)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty, slots: storageSlotsOf(id, getItem(id)) * qty, item: getItem(id) }))
    .sort((a, b) => (a.item?.name ?? a.id).localeCompare(b.item?.name ?? b.id, "zh"));
}

/** 按具体食材汇总背包和冰箱，仍记录实际来源，以便扣料时不改写旧库存。 */
export function cookingStock(state: GameState): Array<{ id: string; qty: number; sources: Array<{ id: string; qty: number }> }> {
  const ids = new Set([...Object.keys(state.inventory ?? {}), ...Object.keys(readFridge(state).items)]);
  const groups = new Map<string, { id: string; qty: number; sources: Array<{ id: string; qty: number }> }>();
  for (const id of ids) {
    if (!isCookingItem(id)) continue;
    const qty = Math.max(0, Math.floor(cookingItemCount(state, id)));
    if (!Number.isFinite(qty) || qty === 0) continue;
    const canonical = canonicalCookingItemId(id);
    const group = groups.get(canonical) ?? { id: canonical, qty: 0, sources: [] };
    group.qty += qty;
    group.sources.push({ id, qty });
    groups.set(canonical, group);
  }
  for (const group of groups.values()) {
    group.sources.sort((a, b) => Number(b.id === group.id) - Number(a.id === group.id) || a.id.localeCompare(b.id));
  }
  return [...groups.values()].sort((a, b) => (getItem(a.id)?.name ?? a.id).localeCompare(getItem(b.id)?.name ?? b.id, "zh"));
}
