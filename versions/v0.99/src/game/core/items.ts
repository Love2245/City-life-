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
import itemData from "../data/items.json";

export const ITEM_DATA: ItemData = itemData as unknown as ItemData;
export const ITEMS: ItemDef[] = ITEM_DATA.items;
export const ITEM_POINT_COST: number = ITEM_DATA.pointCost;

/** v0.935：开局「起步装备」可点数兑换的物品（不含零食/生鲜等低价值项） */
export const START_ITEMS: ItemDef[] = ITEMS.filter((i) => i.startOffer === true);

/** v0.935：开局兑换时该物品实际消耗的点数（缺省用顶层 pointCost） */
export function startCostOf(item?: ItemDef): number {
  return item?.startCost ?? ITEM_POINT_COST;
}

const itemMap = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef | undefined {
  return itemMap.get(id);
}

/** 应用物品：设置 flag + 可选 effects（占位） */
export function applyItem(state: GameState, itemId: string): void {
  const item = getItem(itemId);
  if (!item) return;
  state.flags[`item_${itemId}`] = true;
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
}

/** 消耗；数量不足返回 false */
export function removeItem(state: GameState, itemId: string, qty = 1): boolean {
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
  for (const [id, qty] of Object.entries(state.inventory)) {
    const item = getItem(id);
    if (!item) continue;
    out.push({ item, qty, displayName: item.keyDisplay ?? item.name });
  }
  out.sort((a, b) => a.item.name.localeCompare(b.item.name, "zh"));
  return out;
}