/**
 * 家庭条件系统：数据加载、开局应用、属性分配、校验。
 * 纯逻辑层。
 */
import type { GameState, FamilyConfig, FamilyData, Allocation, ItemDef } from "../types";
import { applyEffects } from "../engine";
import { getItem, startCostOf } from "./items";
import familyData from "../data/families.json";

export const FAMILY_DATA: FamilyData = familyData as FamilyData;
export const FAMILIES: FamilyConfig[] = FAMILY_DATA.families;
export const DEFAULT_FAMILY = "ordinary";

const familyMap = new Map(FAMILIES.map((f) => [f.id, f]));

export function getFamily(id: string): FamilyConfig | undefined {
  return familyMap.get(id);
}

/** 应用家庭条件（newGame 中 createInitialState 之后调用） */
export function applyFamily(state: GameState, familyId: string): void {
  const f = getFamily(familyId);
  if (!f) return;
  state.family = f.id;
  state.player.money = f.initialMoney;
  if (f.attrMods) {
    applyEffects(state, f.attrMods, f.icon);
  }
  // 住房：免费住宿晚数 >0 → gov；否则（富裕）直接进入按天住宿（第一天就要找地方睡）
  state.living.mode = f.freeHousingNights > 0 ? "gov" : "nightly";
  state.living.govDaysLeft = f.freeHousingNights;
  state.living.nightly = null;
  state.living.lease = null;
}

/** 应用属性点分配（金钱/魅力/智力直接加成；体力走 maxStamina 派生；物品点数不在此结算） */
export function applyAllocation(state: GameState, alloc: Allocation): void {
  const rates = FAMILY_DATA.allocationRates;
  state.allocation = { ...alloc };
  state.player.money += alloc.money * rates.moneyPerPoint;
  state.player.stats.charm = clamp(state.player.stats.charm + alloc.charm * rates.charmPerPoint);
  state.player.stats.intelligence = clamp(
    state.player.stats.intelligence + alloc.intelligence * rates.intelligencePerPoint,
  );
  // stamina 加点由 getMaxStamina 派生，不改 attrs.stamina
}

/** 新游戏设置校验（纯函数）：配额/去向/物品换算/物品 id 合法性 */
export function validateNewGameSetup(
  familyId: string,
  alloc: Allocation,
  ownedItems: string[],
): { ok: boolean; reason?: string } {
  const f = getFamily(familyId);
  if (!f) return { ok: false, reason: "未知家庭" };
  const sum = alloc.money + alloc.charm + alloc.stamina + alloc.intelligence + alloc.items;
  if (sum > f.pointQuota) return { ok: false, reason: `点数超出配额（${f.pointQuota}）` };
  for (const k of ["money", "charm", "stamina", "intelligence", "items"] as const) {
    if (alloc[k] < 0) return { ok: false, reason: "点数不能为负" };
  }
  const itemCostSum = ownedItems.reduce((s, id) => s + startCostOf(getItem(id) as ItemDef | undefined), 0);
  if (alloc.items !== itemCostSum) {
    return { ok: false, reason: "物品点数与所选物品不符" };
  }
  return { ok: true };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}