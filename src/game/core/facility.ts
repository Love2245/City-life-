/**
 * v1.05 设施效率系统：聚合住房设施 + 装备物品的 facilityBonus。
 * 纯逻辑层：读 state 聚合各系数，供 time/cooking/projects 结算时相乘。
 */
import type { GameState } from '../types';
import {currentResidence} from './residence';
import {HOME_ITEM_IDS,homeFurnitureKind} from './homeFurniture';
import {FIXED_STAY_ITEMS} from './homeStay';

type FacilityType = 'rest' | 'cook' | 'dev';

/** 聚合某类设施的总效率系数（基础 1.0 → 装备 bonus 累乘） */
export function facilityEfficiency(state: GameState, type: FacilityType): number {
  let eff = 1;
  const installed = new Set([...Object.keys(state.inventory ?? {}).filter(id => state.inventory[id] > 0), ...Object.values(state.equipped)]);
  const lodging=currentResidence(state),fixed=Object.prototype.hasOwnProperty.call(FIXED_STAY_ITEMS,lodging.id);
  if(fixed){
    // A carried laptop remains usable. Beds, cookers and other furniture stay at home.
    for(const itemId of installed)if(HOME_ITEM_IDS.has(itemId)&&homeFurnitureKind(itemId)!=='computer')installed.delete(itemId);
  }
  for (const itemId of installed) {
    const bonus = getFacilityBonus(state, itemId);
    const val = bonus?.[type];
    if (val && val > 0) eff = Math.max(eff, val);
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
