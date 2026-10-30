import { outfitSetForItem, outfitParts } from "./playerOutfitSets";
/**
 * 装备系统（v0.95 物品/背包升级）。
 * 有 slot（clothes/accessory/furniture）的物品可「装备/摆放」：
 * 装备时把 bonus 叠加到属性（clamp 0-100），卸下时撤销——持续生效，不随结算累积。
 * 装备同时置 item_<id> flag（消费 unlocks 的 actions/jobs flag 门槛）。
 * 纯逻辑层。
 */
import type { GameState, ItemSlot, SurvivalAttrs, GrowthStats } from "../types";
import { getItem, ITEMS } from "./items";
import { pushLog } from "../engine";
import { ensureBaseStats, refreshGrowthStats } from "./growthStats";
import { hasLongTermResidence } from "./residence";
import { HOME_KINDS, HOME_FURNITURE, bestHomeItem } from "./homeFurniture";

export const SLOT_NAMES: Record<ItemSlot, string> = {
  hat: "帽子",
  clothes: "套装",
  underlayer: "内搭",
  pants: "裤子",
  accessory: "配饰",
  furniture: "家具",
  transport: "载具",
  tool: "工具",
  appliance: "家电",
};

export const SLOT_ICONS: Record<ItemSlot, string> = {
  hat: "🧢",
  clothes: "👕",
  underlayer: "👚",
  pants: "👖",
  accessory: "💍",
  furniture: "🛋️",
  transport: "🚲",
  tool: "💻",
  appliance: "🧊",
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

function bonusTarget(state: GameState, key: string): Record<string, number> | undefined {
  if (key in state.player.attrs) return state.player.attrs as unknown as Record<string, number>;
  if (key in state.player.stats) return state.player.stats as unknown as Record<string, number>;
  return undefined;
}

function appliedBonusFlag(slot: string, itemId: string, key: string): string {
  return `equip_bonus_applied_${slot}_${itemId}_${key}`;
}

/** 装备时记录实际生效的加成，卸下时只撤销这部分，避免属性封顶时丢掉原值。 */
function applyItemBonus(state: GameState, slot: string, itemId: string, bonus: Record<string, number>): void {
  for (const [key, raw] of Object.entries(bonus)) {
    if (key in state.player.stats) continue;
    const target = bonusTarget(state, key);
    if (!target) continue;
    const before = target[key];
    target[key] = clamp(before + (raw ?? 0));
    state.flags[appliedBonusFlag(slot, itemId, key)] = target[key] - before;
  }
}

/** 旧存档没有实际加成快照时，沿用旧值回退；新装备使用精确记录。 */
function removeItemBonus(state: GameState, slot: string, itemId: string, bonus: Record<string, number>): void {
  for (const [key, raw] of Object.entries(bonus)) {
    if (key in state.player.stats) {
      delete state.flags[appliedBonusFlag(slot, itemId, key)];
      continue;
    }
    const target = bonusTarget(state, key);
    if (!target) continue;
    const flag = appliedBonusFlag(slot, itemId, key);
    const saved = state.flags[flag];
    const applied = typeof saved === "number" && Number.isFinite(saved) ? saved : raw ?? 0;
    target[key] = clamp(target[key] - applied);
    delete state.flags[flag];
  }
}

export function isAutoHomeSlot(slot: ItemSlot | undefined): boolean {
  return slot === "furniture" || slot === "appliance" || slot === "tool";
}

/** 沿用原有槽位与加成，不叠加同槽效果。设施档位优先，购入、领取与读档自动升级。 */
export function syncAutoHomeEquipment(state: GameState): void {
  if (!state.equipped || !state.player) return;
  ensureBaseStats(state);
  if (state.fridge?.tier) {
    const installed = `fridge_${state.fridge.tier}`;
    state.inventory[installed] = Math.max(1, state.inventory[installed] ?? 0);
  }
  if (hasLongTermResidence(state) || state.flags.home_equipment_v1 === true) {
    // Convert the legacy mutually exclusive home slots once. Clothing bonuses and
    // their recorded base values are not touched; every home family then has one tier.
    if (state.flags.home_equipment_v1 !== true) {
      for (const slot of ["furniture", "appliance", "tool"]) {
        const id = state.equipped[slot];
        if (id) removeItemBonus(state, slot, id, getItem(id)?.bonus ?? {});
        delete state.equipped[slot];
      }
      state.flags.home_equipment_v1 = true;
    }
    for (const kind of HOME_KINDS) {
      const slot = HOME_FURNITURE[kind].slot;
      const best = bestHomeItem(state, kind);
      if (kind === "fridge" && best) {
        const tier = getItem(best)?.fridgeTier;
        if (tier) {
          state.fridge ??= { tier: null, items: {} };
          if (state.fridge.tier !== tier) state.fridge.tier = tier;
        }
      }
      const previous = state.equipped[slot];
      if (previous === best) continue;
      if (previous) removeItemBonus(state, slot, previous, getItem(previous)?.bonus ?? {});
      if (best) {
        state.equipped[slot] = best;
        applyItemBonus(state, slot, best, getItem(best)?.bonus ?? {});
        state.flags[`item_${best}`] = true;
      } else delete state.equipped[slot];
    }
    refreshGrowthStats(state);
    return;
  }
  for (const slot of ["furniture", "appliance", "tool"] as const) {
    const owned = ITEMS.filter(item => item.slot === slot && (state.inventory?.[item.id] ?? 0) > 0);
    const quality = (item: (typeof ITEMS)[number]) => {
      const tier = item.fridgeTier ? ["small", "medium", "large"].indexOf(item.fridgeTier) + 1 : 0;
      const facility = Math.max(0, ...Object.values(item.facilityBonus ?? {}).map(Number));
      return tier * 10000 + facility * 1000 + Object.values(item.bonus ?? {}).reduce((sum, value) => sum + Number(value), 0);
    };
    owned.sort((a, b) => quality(b) - quality(a) || a.id.localeCompare(b.id));
    const best = owned[0];
    const previous = state.equipped[slot];
    if (best?.id === previous) continue;
    if (previous) removeItemBonus(state, slot, previous, getItem(previous)?.bonus ?? {});
    if (best?.bonus) applyItemBonus(state, slot, best.id, best.bonus);
    if (best) { state.equipped[slot] = best.id; state.flags[`item_${best.id}`] = true; }
    else delete state.equipped[slot];
    if (slot === "appliance" && best?.fridgeTier) {
      state.fridge ??= { tier: null, items: {} };
      state.fridge.tier = best.fridgeTier;
    }
  }
  refreshGrowthStats(state);
}

/** 装备物品：校验持有与槽位 → 同槽自动替换 → 应用 bonus + 置 flag */
export function equipItem(state: GameState, itemId: string): { ok: boolean; reason?: string } {
  const set = outfitSetForItem(itemId);
  if (!set) return equipSingleItem(state, itemId);
  if ((state.inventory[itemId] ?? 0) < 1 || (state.inventory[set.id] ?? 0) < 1) return { ok: false, reason: "请先拥有对应的完整套装" };
  const parts = outfitParts(set);
  if (parts.every(([slot, id]) => state.equipped[slot] === id)) return { ok: false, reason: "已穿着这套服装" };
  // Gift outfits include their matching base pieces, without a shop transaction.
  for (const [, id] of parts) if ((state.inventory[id] ?? 0) < 1) state.inventory[id] = 1;
  for (const [, id] of parts) equipSingleItem(state, id);
  return { ok: true };
}

function equipSingleItem(state: GameState, itemId: string): { ok: boolean; reason?: string } {
  const item = getItem(itemId);
  if (!item || !item.slot) return { ok: false, reason: "这件物品不能装备" };
  if ((state.inventory[itemId] ?? 0) < 1) return { ok: false, reason: "尚未拥有这件物品" };
  if (isAutoHomeSlot(item.slot)) {
    syncAutoHomeEquipment(state);
    return isEquipped(state, itemId) ? { ok: true } : { ok: false, reason: "家中设备自动使用已拥有的最佳档位，无需手动装备" };
  }
  const slot = item.slot;
  const prev = state.equipped[slot];
  if (prev === itemId) return { ok: false, reason: "已经装备着这件了" };
  ensureBaseStats(state);

  // 同槽旧物卸下（撤销其加成）
  if (prev) {
    const old = getItem(prev);
    if (old?.bonus) removeItemBonus(state, slot, prev, old.bonus);
  }
  state.equipped[slot] = itemId;
  state.flags[`item_${itemId}`] = true; // 消费 unlocks flag 门槛
  if (item.bonus) applyItemBonus(state, slot, itemId, item.bonus);
  refreshGrowthStats(state);
  pushLog(state, item.icon, prev ? `换下${SLOT_NAMES[slot]}，装备了「${item.name}」` : `装备了「${item.name}」`);
  return { ok: true };
}

/** 卸下装备：撤销加成 */
export function unequipItem(state: GameState, slot: ItemSlot): { ok: boolean; reason?: string } {
  if (isAutoHomeSlot(slot)) return { ok: false, reason: "家中设备自动使用最佳档位，无需卸下" };
  const itemId = state.equipped[slot];
  if (!itemId) return { ok: false, reason: "这个槽位没有装备" };
  ensureBaseStats(state);

  if (slot === "clothes" || slot === "underlayer" || slot === "pants") {
    if (!state.inventory.white_vest) state.inventory.white_vest = 1;
    return equipItem(state, "white_vest");
  }

  const item = getItem(itemId);
  if (item?.bonus) removeItemBonus(state, slot, itemId, item.bonus);
  delete state.equipped[slot];
  refreshGrowthStats(state);
  pushLog(state, "📦", `卸下了「${item?.name ?? slot}」`);
  return { ok: true };
}

/** 装备摘要（UI 用）：slot → { item, bonus } | null */
export function equippedSummary(state: GameState): Array<{ slot: ItemSlot; itemId?: string; bonus: Record<string, number> }> {
  // underlayer 是透明叠层的旧存档兼容字段，不作为玩家可见装备槽显示。
  const slots: ItemSlot[] = ["hat", "clothes", "accessory"];
  return slots.map((slot) => {
    const itemId = state.equipped[slot];
    const item = itemId ? getItem(itemId) : undefined;
    return { slot, itemId, bonus: item?.bonus ?? {} };
  });
}

export type { SurvivalAttrs, GrowthStats };
