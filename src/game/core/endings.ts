/**
 * 结局系统（v0.9）：每晚睡眠结算自动判定，bad → good → secret 优先级。
 * 纯逻辑层：JSON 数据 + 引擎结算。
 * 挂载点：core/time.ts 的 sleepSettlement 末尾调用 checkEnding。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";
import { projectsDoneCount } from "./projects";
import { gameDay } from "./calendar";
import endingsData from "../data/endings.json";

/** 结局定义（endings.json 数据） */
export interface EndingDef {
  id: string;
  name: string;
  icon: string;
  /** bad=失败 / good=成功 / secret=隐藏 */
  tier: "bad" | "good" | "secret";
  desc: string;
  text: string;
  condition: {
    negativeMoneyStreak?: number;
    /** 连续仍有逾期债务的日结天数 */
    debtStreakMin?: number;
    financialDefault?: boolean;
    lowMoodStreak?: number;
    hungryStreak?: number;
    healthMin?: number;
    projectsDone?: number;
    moneyMin?: number;
    fameMin?: number;
    dayMin?: number;
    /** v0.92：健康归零已持续天数（猝死判定） */
    criticalHealthStreak?: number;
    /** 生存结算写入的猝死标记，确保结局与实际死亡原因一致。 */
    suddenDeath?: boolean;
    /** v0.92：连续心情 <30 天数（抑郁相关结局） */
    depressionStreak?: number;
    /** v1.0 剧情模式：需置位的 story 结局 flag（仅剧情模式写入） */
    story?: string;
  };
}

export const ENDINGS: EndingDef[] = endingsData as EndingDef[];

const endingMap = new Map(ENDINGS.map((e) => [e.id, e]));

export function getEnding(id: string): EndingDef | undefined {
  return endingMap.get(id);
}

/** 单条结局条件是否满足 */
export function checkEndingCondition(state: GameState, e: EndingDef): boolean {
  const c = e.condition;
  if (c.financialDefault && !state.flags.financial_default) return false;
  const s = state.player;
  // 破产：连续入不敷出七天，或债务连续存在三个完整日结周期，任一满足即可离场。
  if (c.negativeMoneyStreak != null && c.debtStreakMin != null) {
    const streakMet = s.negativeMoneyStreak >= c.negativeMoneyStreak;
    const debtMet = (s.debtStreak ?? 0) >= c.debtStreakMin;
    if (!streakMet && !debtMet) return false;
  } else {
    if (c.negativeMoneyStreak != null && s.negativeMoneyStreak < c.negativeMoneyStreak) return false;
    if (c.debtStreakMin != null && (s.debtStreak ?? 0) < c.debtStreakMin) return false;
  }
  if (c.lowMoodStreak != null && s.lowMoodStreak < c.lowMoodStreak) return false;
  if (c.hungryStreak != null && s.hungryStreak < c.hungryStreak) return false;
  if (c.healthMin != null && s.attrs.health > c.healthMin) return false;
  if (c.projectsDone != null && projectsDoneCount(state) < c.projectsDone) return false;
  if (c.moneyMin != null && s.money < c.moneyMin) return false;
  if (c.fameMin != null && s.stats.fame < c.fameMin) return false;
  // v0.95：dayMin 为「相对存活天数」语义（活满 N 天），用 gameDay（开局=0），不能用 absoluteDay（2026 纪元大数）
  if (c.dayMin != null && gameDay(state.time) < c.dayMin) return false;
  if (c.criticalHealthStreak != null && (s.criticalHealthStreak ?? 0) < c.criticalHealthStreak) return false;
  if (c.suddenDeath && state.flags.sudden_death !== true) return false;
  if (c.depressionStreak != null && (s.depressionStreak ?? 0) < c.depressionStreak) return false;
  // v1.0 剧情结局：由剧情系统在终局判定时置位 flag
  if (c.story && !state.flags[c.story]) return false;
  return true;
}

/**
 * 结局自动判定（每晚睡眠结算后调用）：
 * - 已触发结局 → 直接返回当前结局
 * - v1.44 规则：只有坏结局（bad，含剧情失败线）会结束游戏；
 *   good / secret 结局条件达成时仅解锁图鉴 + 推送里程碑日志，生活无限继续。
 * - 剧情模式终局结局（condition.story）由剧情系统置位 flag 收尾，保持原判定语义。
 */
export function checkEnding(state: GameState): EndingDef | null {
  if (state.endingId) return getEnding(state.endingId) ?? null;
  const tiers: EndingDef["tier"][] = ["bad", "good", "secret"];
  for (const tier of tiers) {
    for (const e of ENDINGS) {
      if (e.tier === tier && checkEndingCondition(state, e)) {
        // v1.44：非坏结局（且非剧情终局）不结束游戏——只解锁图鉴，一次性的里程碑日志
        if (tier !== "bad" && !e.condition.story) {
          if (!state.unlockedEndings.includes(e.id)) {
            state.unlockedEndings.push(e.id);
            pushLog(state, e.icon, `【里程碑达成】${e.name}：${e.desc}——生活还在继续`);
          }
          continue;
        }
        state.endingId = e.id;
        if (!state.unlockedEndings.includes(e.id)) state.unlockedEndings.push(e.id);
        pushLog(state, e.icon, `【结局】${e.name}：${e.desc}`);
        return e;
      }
    }
  }
  return null;
}

/** 结局图鉴：全部结局 + 是否已解锁 */
export function endingGallery(
  state: Pick<GameState, "unlockedEndings">,
  profileEndings: readonly string[] = [],
): Array<{ ending: EndingDef; unlocked: boolean }> {
  const unlocked = new Set([...state.unlockedEndings, ...profileEndings]);
  return ENDINGS.map((e) => ({ ending: e, unlocked: unlocked.has(e.id) }));
}

/**
 * v1.43 修复：剧情模式专属结局（由 story 模式终局写 flag，普通模式默认玩家永远拿不到）。
 * 这些结局不是 bug 缺失——图鉴里应明确标注，避免玩家以为是数据损坏。
 * 注意：只做"标注"，绝不删除条目（保留 13 结局判定与测试完整性）。
 */
export const STORY_EXCLUSIVE_ENDING_IDS: readonly string[] = ENDINGS.filter(
  (e) => !!e.condition?.story,
).map((e) => e.id);

export function isStoryExclusiveEnding(id: string): boolean {
  const e = endingMap.get(id);
  return !!e?.condition?.story;
}
