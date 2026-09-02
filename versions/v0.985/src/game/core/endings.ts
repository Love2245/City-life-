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
    lowMoodStreak?: number;
    hungryStreak?: number;
    healthMin?: number;
    projectsDone?: number;
    moneyMin?: number;
    fameMin?: number;
    dayMin?: number;
    /** v0.92：健康归零已持续天数（猝死判定） */
    criticalHealthStreak?: number;
    /** v0.92：连续心情 <30 天数（抑郁相关结局） */
    depressionStreak?: number;
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
  const s = state.player;
  if (c.negativeMoneyStreak != null && s.negativeMoneyStreak < c.negativeMoneyStreak) return false;
  if (c.lowMoodStreak != null && s.lowMoodStreak < c.lowMoodStreak) return false;
  if (c.hungryStreak != null && s.hungryStreak < c.hungryStreak) return false;
  if (c.healthMin != null && s.attrs.health > c.healthMin) return false;
  if (c.projectsDone != null && projectsDoneCount(state) < c.projectsDone) return false;
  if (c.moneyMin != null && s.money < c.moneyMin) return false;
  if (c.fameMin != null && s.stats.fame < c.fameMin) return false;
  // v0.95：dayMin 为「相对存活天数」语义（活满 N 天），用 gameDay（开局=0），不能用 absoluteDay（2026 纪元大数）
  if (c.dayMin != null && gameDay(state.time) < c.dayMin) return false;
  if (c.criticalHealthStreak != null && (s.criticalHealthStreak ?? 0) < c.criticalHealthStreak) return false;
  if (c.depressionStreak != null && (s.depressionStreak ?? 0) < c.depressionStreak) return false;
  return true;
}

/**
 * 结局自动判定（每晚睡眠结算后调用）：
 * - 已触发结局 → 直接返回当前结局
 * - 按 bad → good → secret 优先级检查，命中即写入 endingId + 解锁图鉴
 */
export function checkEnding(state: GameState): EndingDef | null {
  if (state.endingId) return getEnding(state.endingId) ?? null;
  const tiers: EndingDef["tier"][] = ["bad", "good", "secret"];
  for (const tier of tiers) {
    for (const e of ENDINGS) {
      if (e.tier === tier && checkEndingCondition(state, e)) {
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
export function endingGallery(state: GameState): Array<{ ending: EndingDef; unlocked: boolean }> {
  return ENDINGS.map((e) => ({ ending: e, unlocked: state.unlockedEndings.includes(e.id) }));
}
