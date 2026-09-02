/**
 * 装备系统（v0.95 物品/背包升级）。
 * 有 slot（clothes/accessory/furniture）的物品可「装备/摆放」：
 * 装备时把 bonus 叠加到属性（clamp 0-100），卸下时撤销——持续生效，不随结算累积。
 * 装备同时置 item_<id> flag（消费 unlocks 的 actions/jobs flag 门槛）。
 * 纯逻辑层。
 */
import type { GameState, ItemSlot, SurvivalAttrs, GrowthStats } from "../types";
import { getItem } from "./items";
import { pushLog } from "../engine";

export const SLOT_NAMES: Record<ItemSlot, string> = {
  clothes: "衣服",
  accessory: "配饰",
  furniture: "家具",
};

export const SLOT_ICONS: Record<ItemSlot, string> = {
  clothes: "👕",
  accessory: "💍",
  furniture: "🛋️",
};

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** 是否已装备 */
export function isEquipped(state: GameState, itemId: string): boolean {
  return Object.values(state.equipped).includes(itemId);
}

/** 装备加成聚合（bonus 字段求和） */
export function equipBonus(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const itemId of Object.values(state.equipped)) {
    const item = getItem(itemId);
    if (item?.bonus) {
      for (const [k, v] of Object.entries(item.bonus)) {
        out[k] = (out[k] ?? 0) + (v ?? 0);
      }
    }
  }
  return out;
}

/** 把 bonus 应用到属性（sign=+1 装备 / -1 卸下） */
function applyBonus(state: GameState, bonus: Record<string, number>, sign: 1 | -1): void {
  const p = state.player;
  const a = p.attrs;
  const stats = p.stats as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(bonus)) {
    const delta = sign * (v ?? 0);
    if (k in a) (a as unknown as Record<string, number>)[k] = clamp((a as unknown as Record<string, number>)[k] + delta);
    else if (k in stats) stats[k] = clamp(stats[k] + delta);
  }
}

/** 装备物品：校验持有与槽位 → 同槽自动替换 → 应用 bonus + 置 flag */
export function equipItem(state: GameState, itemId: string): { ok: boolean; reason?: string } {
  const item = getItem(itemId);
  if (!item || !item.slot) return { ok: false, reason: "这件物品不能装备" };
  if ((state.inventory[itemId] ?? 0) < 1) return { ok: false, reason: "背包里没有这件物品" };
  const slot = item.slot;
  const prev = state.equipped[slot];
  if (prev === itemId) return { ok: false, reason: "已经装备着这件了" };

  // 同槽旧物卸下（撤销其加成）
  if (prev) {
    const old = getItem(prev);
    if (old?.bonus) applyBonus(state, old.bonus, -1);
  }
  state.equipped[slot] = itemId;
  state.flags[`item_${itemId}`] = true; // 消费 unlocks flag 门槛
  if (item.bonus) applyBonus(state, item.bonus, 1);
  pushLog(state, item.icon, prev ? `换下${SLOT_NAMES[slot]}，装备了「${item.name}」` : `装备了「${item.name}」`);
  return { ok: true };
}

/** 卸下装备：撤销加成 */
export function unequipItem(state: GameState, slot: ItemSlot): { ok: boolean; reason?: string } {
  const itemId = state.equipped[slot];
  if (!itemId) return { ok: false, reason: "这个槽位没有装备" };
  const item = getItem(itemId);
  if (item?.bonus) applyBonus(state, item.bonus, -1);
  delete state.equipped[slot];
  pushLog(state, "📦", `卸下了「${item?.name ?? slot}」`);
  return { ok: true };
}

/** 装备摘要（UI 用）：slot → { item, bonus } | null */
export function equippedSummary(state: GameState): Array<{ slot: ItemSlot; itemId?: string; bonus: Record<string, number> }> {
  const slots: ItemSlot[] = ["clothes", "accessory", "furniture"];
  return slots.map((slot) => {
    const itemId = state.equipped[slot];
    const item = itemId ? getItem(itemId) : undefined;
    return { slot, itemId, bonus: item?.bonus ?? {} };
  });
}

export type { SurvivalAttrs, GrowthStats };
