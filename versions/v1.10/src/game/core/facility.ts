/**
 * v1.05 设施效率系统：聚合住房设施 + 装备物品的 facilityBonus。
 * 纯逻辑层：读 state 聚合各系数，供 time/cooking/projects 结算时相乘。
 */
import type { GameState } from '../types';

type FacilityType = 'rest' | 'cook' | 'dev';

/** 聚合某类设施的总效率系数（基础 1.0 → 装备 bonus 累乘） */
export function facilityEfficiency(state: GameState, type: FacilityType): number {
  let eff = 1;
  for (const itemId of Object.values(state.equipped)) {
    const bonus = getFacilityBonus(state, itemId);
    const val = bonus?.[type];
    if (val && val > 0) eff *= val;
  }
  // 租房自带的 cook 设施基础 1.0，无额外加成也是 1.0
  return Math.max(0.5, Math.min(3, +eff.toFixed(3)));
}

function getFacilityBonus(_state: GameState, itemId: string): Record<string,number>|undefined {
  // 从 items 数据库读 facilityBonus
  const item = getFromRegistry(itemId);
  return item?.facilityBonus;
}

/** 物品注册表（轻量内联，避免循环依赖） */
import itemsRaw from '../data/items.json';
const ITEM_REGISTRY = new Map((itemsRaw as { items: Array<{ id: string; facilityBonus?: Record<string,number> }> }).items.map(i => [i.id, i]));
function getFromRegistry(id: string) { return ITEM_REGISTRY.get(id); }
