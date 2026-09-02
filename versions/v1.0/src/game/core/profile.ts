/**
 * 都市生活 v0.991 — 多周目档案（纯逻辑层）
 * 命运点数 / 永久加成 / 回忆录 / 模式解锁。
 * 纯函数与数据定义：不直接读写存储（存储由 src/lib/profile.ts 负责）。
 * 命运点数需多次游玩累积——单局表现只给少量，兑换永久加成消耗点数。
 */
import type { GameState, GameMode, Allocation } from "../types";
import { gameDay } from "./calendar";
import type { EndingDef } from "./endings";
import { getMaxStamina } from "./stats";
import { applyFamily, applyAllocation } from "./families";
import { applyItem } from "./items";
import { isProjectDone } from "./projects";

/** 回忆录条目（每次结局结算追加一条） */
export interface MemoirEntry {
  /** 唯一 id（时间戳） */
  id: string;
  endingId: string;
  endingName: string;
  tier: "bad" | "good" | "secret";
  /** 存活天数（gameDay，开局=0） */
  survivedDays: number;
  /** 结算时的余额 */
  money: number;
  /** 本局模式 */
  mode: GameMode;
  /** 本局获得的命运点数 */
  fatePoints: number;
  /** 结局原因（简短摘要） */
  reason: string;
  /** 现实时间（展示用） */
  at: string;
}

/** 跨存档持久化的多周目档案 */
export interface ProfileState {
  /** 累计命运点数（可兑换永久加成） */
  fatePoints: number;
  /** 已解锁模式 */
  unlocked: { eternal: boolean; story: boolean };
  /** 已购永久加成：boostId → 档位（0=未购买） */
  boosts: Record<string, number>;
  /** 历次生平记录 */
  memoirs: MemoirEntry[];
}

export interface BoostDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 基础价格 */
  cost: number;
  /** 是否可叠档（如体力 +10 → +20 → +30），null 表示一次性 */
  stackable?: boolean;
}

/** 永久加成兑换表（命运商店） */
export const BOOST_DEFS: BoostDef[] = [
  {
    id: "boost_driving_license",
    name: "自带驾照",
    icon: "🚗",
    desc: "开局自带驾驶本，直接解锁驾驶类岗位",
    cost: 6,
  },
  {
    id: "boost_stamina",
    name: "底子好",
    icon: "⚡",
    desc: "初始体力上限 +10（可叠 3 档）",
    cost: 4,
    stackable: true,
  },
  {
    id: "boost_money",
    name: "手头宽裕",
    icon: "💰",
    desc: "开局多 200 元启动资金（可叠 3 档）",
    cost: 3,
    stackable: true,
  },
  {
    id: "boost_charm",
    name: "讨人喜欢",
    icon: "✨",
    desc: "初始魅力 +5，更容易认识新朋友",
    cost: 5,
    stackable: true,
  },
  {
    id: "boost_lucky",
    name: "运气不错",
    icon: "🍀",
    desc: "开局自带一件小礼物（水果×2）",
    cost: 2,
  },
];

export function emptyProfile(): ProfileState {
  return { fatePoints: 0, unlocked: { eternal: false, story: false }, boosts: {}, memoirs: [] };
}

/** 结局 tier → 命运点基础奖励（多次游玩累积，单局给得克制） */
function tierBase(tier: EndingDef["tier"]): number {
  return tier === "good" ? 5 : tier === "secret" ? 8 : 2;
}

/** 按表现计算本局命运点数：结局好坏 + 存活天数 + 剩余资产 */
export function calcFatePoints(state: GameState, ending: EndingDef): number {
  const base = tierBase(ending.tier);
  const days = gameDay(state.time);
  const dayBonus = Math.min(6, Math.floor(days / 10)); // 每活 10 天 +1，封顶 +6
  const moneyBonus = state.player.money >= 1000 ? 2 : state.player.money >= 300 ? 1 : 0;
  return base + dayBonus + moneyBonus;
}

/** 生成回忆录条目（含结局原因摘要） */
export function buildMemoirEntry(state: GameState, ending: EndingDef, points: number): MemoirEntry {
  const t = state.time;
  const reason = endingReason(state, ending);
  return {
    id: `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    endingId: ending.id,
    endingName: ending.name,
    tier: ending.tier,
    survivedDays: gameDay(state.time),
    money: state.player.money,
    mode: state.mode,
    fatePoints: points,
    reason,
    at: `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`,
  };
}

/** 结局原因摘要（按触发条件生成一句话） */
export function endingReason(state: GameState, ending: EndingDef): string {
  const c = ending.condition;
  const s = state.player;
  const parts: string[] = [];
  if (c.negativeMoneyStreak != null) parts.push(`连续 ${s.negativeMoneyStreak} 天负债`);
  if (c.lowMoodStreak != null) parts.push(`心情低落 ${s.lowMoodStreak} 天`);
  if (c.hungryStreak != null) parts.push(`挨饿 ${s.hungryStreak} 天`);
  if (c.healthMin != null) parts.push(`健康跌破 ${s.attrs.health}`);
  if (c.projectsDone != null) parts.push(`完成 ${projectsOf(state)} 个项目`);
  if (c.moneyMin != null) parts.push(`攒到 ${s.money} 元`);
  if (c.fameMin != null) parts.push(`影响力 ${s.stats.fame}`);
  if (c.dayMin != null) parts.push(`活到第 ${gameDay(state.time)} 天`);
  if (c.criticalHealthStreak != null) parts.push(`健康归零 ${s.criticalHealthStreak} 天`);
  if (c.depressionStreak != null) parts.push(`抑郁 ${s.depressionStreak} 天`);
  return parts.length > 0 ? parts.join("，") : "在都市里走完了一段路";
}

function projectsOf(state: GameState): number {
  // v0.992 修复：只统计真正完成（进度 ≥ 上限）的项目，不再把进行中的算进去
  return Object.keys(state.career.projects ?? {}).filter((id) => isProjectDone(state, id)).length;
}

/** 开局应用永久加成（createInitialState 后、applyFamily 之后调用——applyFamily 会覆盖初始资金） */
export function applyBoosts(state: GameState, profile: ProfileState): void {
  const tier = (id: string): number => profile.boosts[id] ?? 0;
  if (tier("boost_driving_license") > 0) {
    state.flags["item_driving_license"] = true;
    state.inventory["driving_license"] = (state.inventory["driving_license"] ?? 0) + 1;
  }
  const staminaBoost = tier("boost_stamina");
  if (staminaBoost > 0) {
    // v0.992 修复：加的是「上限」不是当前体力（原实现加当前值且被 clamp 100 吃掉，叠满 3 档无意义）
    state.player.staminaCapBonus = 10 * staminaBoost;
    state.player.attrs.stamina = Math.min(
      state.player.attrs.stamina + 10 * staminaBoost,
      getMaxStamina(state),
    );
  }
  const moneyBoost = tier("boost_money");
  if (moneyBoost > 0) {
    state.player.money += 200 * moneyBoost;
  }
  const charmBoost = tier("boost_charm");
  if (charmBoost > 0) {
    state.player.stats.charm = Math.min(100, state.player.stats.charm + 5 * charmBoost);
  }
  if (tier("boost_lucky") > 0) {
    state.inventory["fruit"] = (state.inventory["fruit"] ?? 0) + 2;
  }
}

/** v0.992 模式差异：永恒模式 = 挑战自我（物价上浮 30% + 免费住房补贴减半），剧情分支留待 1.0 */
export function applyModeEffects(state: GameState, mode: GameMode): void {
  if (mode === "eternal") {
    state.economy.priceIndex = Math.round(state.economy.priceIndex * 1.3 * 10) / 10;
    if (state.living.mode === "gov") {
      state.living.govDaysLeft = Math.floor(state.living.govDaysLeft / 2);
    }
  }
  // story：1.0 版本再注入剧情分支差异（本版仅标签）
}

/**
 * v0.992 开局全流程（家庭 → 属性分配 → 开局物品 → 永久加成 → 模式差异）。
 * 顺序铁律：applyFamily 必须在 applyBoosts 之前（applyFamily 会覆盖初始资金，顺序反了加成丢失）。
 * 由 store.newGame 调用，并直接暴露给测试做集成断言（顺序类 bug 单测可抓）。
 */
export function applyNewGameSetup(
  state: GameState,
  familyId: string,
  allocation: Allocation,
  ownedItems: string[],
  profile: ProfileState,
  mode: GameMode,
): void {
  state.mode = mode;
  applyFamily(state, familyId);
  applyAllocation(state, allocation);
  for (const itemId of ownedItems) {
    applyItem(state, itemId);
  }
  applyBoosts(state, profile);
  applyModeEffects(state, mode);
}

/** 命运商店：检查是否可购买（点数足够 + 未满档） */
export function canBuyBoost(profile: ProfileState, boostId: string): { ok: boolean; reason?: string } {
  const def = BOOST_DEFS.find((b) => b.id === boostId);
  if (!def) return { ok: false, reason: "未知加成" };
  const cur = profile.boosts[boostId] ?? 0;
  if (def.stackable && cur >= 3) return { ok: false, reason: "已满档" };
  if (!def.stackable && cur >= 1) return { ok: false, reason: "已购买" };
  const price = def.cost * (def.stackable ? cur + 1 : 1);
  if (profile.fatePoints < price) return { ok: false, reason: `命运点不足（需 ${price}）` };
  return { ok: true };
}

/** 购买加成：扣点 + 升档（原地突变） */
export function buyBoost(profile: ProfileState, boostId: string): { ok: boolean; reason?: string } {
  const check = canBuyBoost(profile, boostId);
  if (!check.ok) return check;
  const def = BOOST_DEFS.find((b) => b.id === boostId)!;
  const cur = profile.boosts[boostId] ?? 0;
  const price = def.cost * (def.stackable ? cur + 1 : 1);
  profile.fatePoints -= price;
  profile.boosts[boostId] = cur + 1;
  return { ok: true };
}

/** 结局结算：发放命运点 + 写回忆录 + 解锁永恒/剧情模式（返回本局点数） */
export function settleProfile(profile: ProfileState, state: GameState, ending: EndingDef): number {
  const points = calcFatePoints(state, ending);
  profile.fatePoints += points;
  profile.memoirs = [buildMemoirEntry(state, ending, points), ...profile.memoirs].slice(0, 50);
  profile.unlocked.eternal = true;
  profile.unlocked.story = true;
  return points;
}

export type { EndingDef };
