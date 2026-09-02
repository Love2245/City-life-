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
 * 100 + 体力加点 × 每点值 + 家庭体力上限修正 + 命运加成（底子好）
 */
export function getMaxStamina(state: GameState): number {
  const perPoint = FAMILY_DATA.allocationRates.staminaPerPoint;
  const capMod = familyMap.get(state.family)?.staminaCapMod ?? 0;
  const bonus = (state.allocation?.stamina ?? 0) * perPoint;
  // v0.992 命运加成「底子好」：staminaCapBonus 直接提升上限
  const fateCap = state.player.staminaCapBonus ?? 0;
  // v1.25 体质分档加成体力上限：40/60/80 → +20/+40/+70
  const fit = state.player.stats.fitness;
  const fitBonus = fit >= 80 ? 70 : fit >= 60 ? 40 : fit >= 40 ? 20 : 0;
  return Math.max(20, Math.min(999, 100 + bonus + capMod + fateCap + fitBonus));
}

/**
 * v1.25 影响力(fame)收入加成系数（分档，供卖唱/摆摊/兼职外卖等自由收入使用）：
 * <30 ×1 · ≥30 ×1.1 · ≥50 ×1.25 · ≥70 ×1.4 · ≥90 ×1.6
 */
export function fameIncomeMult(state: GameState): number {
  const f = state.player.stats.fame;
  if (f >= 90) return 1.6;
  if (f >= 70) return 1.4;
  if (f >= 50) return 1.25;
  if (f >= 30) return 1.1;
  return 1;
}
