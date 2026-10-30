import type { GameState, GrowthStats } from "../types";
import itemData from "../data/items.json";

const KEYS = ["intelligence", "charm", "fitness", "fame"] as const;
const ITEMS = new Map(itemData.items.map(item => [item.id, item]));
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function bonuses(state: GameState): GrowthStats {
  const result: GrowthStats = { intelligence: 0, charm: 0, fitness: 0, fame: 0 };
  for (const id of Object.values(state.equipped ?? {})) {
    const bonus = ITEMS.get(id!)?.bonus as Partial<GrowthStats> | undefined;
    for (const key of KEYS) result[key] += bonus?.[key] ?? 0;
  }
  return result;
}

/** Old snapshots stored effective values. Preserve their recorded applied bonus
 * when deriving the base once; future snapshots carry the base explicitly. */
export function ensureBaseStats(state: GameState): GrowthStats {
  const existing = state.player.baseStats;
  if (existing && KEYS.every(key => Number.isFinite(existing[key]))) return existing;
  const base = { ...state.player.stats };
  for (const [slot, id] of Object.entries(state.equipped ?? {})) {
    const bonus = ITEMS.get(id!)?.bonus as Partial<GrowthStats> | undefined;
    for (const key of KEYS) {
      if (!bonus?.[key]) continue;
      const recorded = state.flags[`equip_bonus_applied_${slot}_${id}_${key}`];
      const applied = typeof recorded === "number" && Number.isFinite(recorded) ? recorded : bonus[key]!;
      base[key] -= applied;
    }
  }
  for (const key of KEYS) base[key] = clamp(base[key]);
  state.player.baseStats = base;
  return base;
}

export function refreshGrowthStats(state: GameState): void {
  const base = ensureBaseStats(state);
  const extra = bonuses(state);
  for (const key of KEYS) state.player.stats[key] = clamp(base[key] + extra[key]);
}

/** Growth and penalties affect the base; gear only changes the effective value. */
export function changeGrowthStat(state: GameState, key: keyof GrowthStats, delta: number): void {
  const base = ensureBaseStats(state);
  base[key] = clamp(base[key] + delta);
  refreshGrowthStats(state);
}

/**
 * 能力属性拆解（UI 悬浮提示用，只读不迁移）：
 * 基值 + 装备加成 = 现值。缺 baseStats 的旧快照用「现值 − 装备加成」回推，
 * 不写 state，避免渲染期 mutation 触发响应式回路。
 */
export function growthStatBreakdown(
  state: GameState,
  key: keyof GrowthStats,
): { base: number; bonus: number; effective: number } {
  const bonus = bonuses(state)[key];
  const existing = state.player.baseStats;
  const base = existing && KEYS.every((k) => Number.isFinite(existing[k]))
    ? existing[key]
    : clamp(state.player.stats[key] - bonus);
  return { base: Math.round(base), bonus, effective: Math.round(state.player.stats[key]) };
}
