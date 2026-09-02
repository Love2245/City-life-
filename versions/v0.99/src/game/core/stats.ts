/**
 * 派生属性计算（只 import types + JSON 数据，避免 engine ↔ families 循环依赖）。
 * 纯逻辑层。
 */
import type { GameState, FamilyData } from "../types";
import familyData from "../data/families.json";

const FAMILY_DATA = familyData as FamilyData;
const familyMap = new Map(FAMILY_DATA.families.map((f) => [f.id, f]));

/**
 * 体力上限（可超 100）：
 * 100 + 体力加点 × 每点值 + 家庭体力上限修正
 */
export function getMaxStamina(state: GameState): number {
  const perPoint = FAMILY_DATA.allocationRates.staminaPerPoint;
  const capMod = familyMap.get(state.family)?.staminaCapMod ?? 0;
  const bonus = (state.allocation?.stamina ?? 0) * perPoint;
  return Math.max(20, Math.min(999, 100 + bonus + capMod));
}
