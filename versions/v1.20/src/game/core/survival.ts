/**
 * 生存指标惩罚体系 v0.92：把「属性数值」真正转化为可感知的生存压力。
 * 纯逻辑层，不依赖 DOM/Svelte/engine（晕倒结算通过回调注入，避免循环依赖）。
 *
 * 规则总览
 * ┌────────────┬──────────────────────────────────────────────┐
 * │ 体力 = 0   │ 强行高强度活动/工作 → 晕倒（engine.triggerCollapse）│
 * │ 饱腹 = 0   │ 强行活动/工作 → 低血糖晕倒（同上，另附健康损失）    │
 * │ 干净度 <15 │ 无法上班（形象太差被劝返）                        │
 * │ 心情 <30   │ 连续 7 天 → 抑郁症，无法工作，需去医院就医         │
 * │ 健康 <25   │ 生病（statuses.sick，已有）                      │
 * │ 健康 = 0   │ 连续 3 天未治 → 猝死，游戏结束                    │
 * └────────────┴──────────────────────────────────────────────┘
 */
import type { GameState } from "../types";
import { markMajorCrisis, checkCrisisRecovered, onRecoveredDepressionOrInjury } from "./tarot";

// ---------- 阈值常量（UI 与逻辑共用，避免魔法数字散落） ----------

/** 干净度低于此值无法上班 */
export const HYGIENE_WORK_MIN = 15;
/** 干净度警告线（UI 高亮，不阻断） */
export const HYGIENE_WARN = 30;

/** 抑郁判定：心情低于此值算「低落」 */
export const MOOD_DEPRESSION_THRESHOLD = 30;
/** 抑郁判定：连续低落天数达到此值触发抑郁症 */
export const DEPRESSION_DAYS = 7;

/** 健康归零后可撑的天数，超过即猝死 */
export const DEAD_HEALTH_GRACE_DAYS = 3;

/** 饱腹危险线（UI 高亮） */
export const SATIETY_WARN = 25;
/** 健康危险线（UI 高亮） */
export const HEALTH_WARN = 30;
/** 心情危险线（UI 高亮） */
export const MOOD_WARN = 30;
/** 体力危险线（与 fatigue.FATIGUE_WARN_THRESHOLD 对齐） */
export const STAMINA_WARN = 20;

// ---------- 查询 ----------

/** 饱腹是否耗尽 */
export function isStarving(state: GameState): boolean {
  return state.player.attrs.satiety <= 0;
}

/** 是否处于抑郁症（无法工作，需就医） */
export function isDepressed(state: GameState): boolean {
  return state.statuses.some((s) => s.id === "depressed");
}

/** 干净度是否低到无法工作 */
export function isTooDirtyToWork(state: GameState): boolean {
  return state.player.attrs.hygiene < HYGIENE_WORK_MIN;
}

/**
 * 工作准入统一校验：上班/接零工前调用。
 * 返回第一条不满足的原因（按严重程度排序），全部满足返回 ok。
 */
export function canWork(state: GameState): { ok: boolean; reason?: string } {
  if (isDepressed(state)) {
    return {
      ok: false,
      reason: "重度抑郁，根本爬不起来。先去医院看心理门诊吧",
    };
  }
  if (isTooDirtyToWork(state)) {
    return {
      ok: false,
      reason: `太邋遢了（干净度 ${Math.round(state.player.attrs.hygiene)}／需 ${HYGIENE_WORK_MIN}），这形象没法上班，先去洗个澡`,
    };
  }
  return { ok: true };
}

/**
 * 高强度行为前的生存兜底：体力或饱腹归零 → 晕倒并阻断。
 * @param triggerCollapse engine 注入的晕倒结算
 */
export function guardSurvival(
  state: GameState,
  why: string,
  triggerCollapse: (s: GameState, reason: string) => void,
): { ok: boolean; reason?: string } {
  if (state.player.attrs.stamina <= 0) {
    triggerCollapse(state, why);
    return { ok: false, reason: "体力透支晕倒了！" };
  }
  if (isStarving(state)) {
    // 低血糖晕倒：额外扣健康，区别于单纯体力透支
    state.player.attrs.health = Math.max(0, state.player.attrs.health - 5);
    triggerCollapse(state, `${why}（已经饿到眼前发黑）`);
    return { ok: false, reason: "饿到低血糖晕倒了！" };
  }
  return { ok: true };
}

// ---------- 每日结算 ----------

export interface DailySurvivalResult {
  /** 本次结算新触发的抑郁症 */
  depressionTriggered?: boolean;
  /** 猝死（游戏结束） */
  suddenDeath?: boolean;
  /** 健康归零已持续天数 */
  criticalHealthDays?: number;
}

/**
 * 每日生存结算（sleepSettlement 内调用，位于属性衰减之后、结局判定之前）。
 * 只负责计数与状态标记，具体结局由 endings.checkEnding 依据 flags/streak 触发。
 */
export function dailySurvivalSettlement(
  state: GameState,
  hooks?: {
    upsertStatus?: (id: "depressed", severity?: number) => void;
    log?: (icon: string, text: string) => void;
  },
): DailySurvivalResult {
  const p = state.player;
  const out: DailySurvivalResult = {};
  const log = hooks?.log ?? (() => {});

  // ---- 1) 抑郁：心情连续 < 30 达 7 天 ----
  if (p.attrs.mood < MOOD_DEPRESSION_THRESHOLD) {
    p.depressionStreak = (p.depressionStreak ?? 0) + 1;
    const left = DEPRESSION_DAYS - p.depressionStreak;
    if (p.depressionStreak >= DEPRESSION_DAYS) {
      if (!isDepressed(state)) {
        hooks?.upsertStatus?.("depressed", 2);
        out.depressionTriggered = true;
        log("🫥", "连续多日情绪低落，你被确诊为抑郁症——干不了活，需要去医院接受治疗");
      }
    } else if (left <= 3 && left > 0) {
      log("😞", `情绪持续低落已 ${p.depressionStreak} 天，再撑 ${left} 天可能会抑郁，找点开心事吧`);
    }
  } else {
    if ((p.depressionStreak ?? 0) > 0 && p.attrs.mood >= MOOD_DEPRESSION_THRESHOLD + 10) {
      // 心情明显回升才清零，避免在阈值边缘反复横跳
      p.depressionStreak = 0;
    } else if (p.attrs.mood >= MOOD_DEPRESSION_THRESHOLD) {
      p.depressionStreak = Math.max(0, (p.depressionStreak ?? 0) - 1);
    }
  }

  // ---- 2) 健康归零：连续 3 天未救治 → 猝死 ----
  const prevCritical = p.criticalHealthStreak ?? 0;
  if (p.attrs.health <= 0) {
    markMajorCrisis(state); // v0.985 高塔前置：跌入健康归零倒计时
    p.criticalHealthStreak = (p.criticalHealthStreak ?? 0) + 1;
    out.criticalHealthDays = p.criticalHealthStreak;
    if (p.criticalHealthStreak > DEAD_HEALTH_GRACE_DAYS) {
      out.suddenDeath = true;
      state.flags["sudden_death"] = true;
      log("💀", "身体彻底垮了……你在睡梦中失去了意识。");
    } else {
      const left = DEAD_HEALTH_GRACE_DAYS - p.criticalHealthStreak + 1;
      log(
        "🚨",
        `健康已经归零！身体在报警——再拖 ${left} 天不去医院，随时可能猝死！`,
      );
    }
  } else {
    // v0.985 力量：曾经健康归零、如今养回 60 以上 —— 算「从重伤中完全恢复」
    if (prevCritical > 0 && p.attrs.health >= 60) onRecoveredDepressionOrInjury(state);
    p.criticalHealthStreak = 0;
    state.flags["sudden_death"] = false;
  }

  // ---- 3) 极度邋遢：额外健康与心情惩罚 ----
  if (p.attrs.hygiene < HYGIENE_WORK_MIN) {
    p.attrs.health = Math.max(0, p.attrs.health - 1);
    p.attrs.mood = Math.max(0, p.attrs.mood - 2);
    log("🦠", "身上都馊了，皮肤开始不舒服（健康 -1 心情 -2）");
  }

  // ---- 4) v0.985 高塔：濒临破产也算重大危机；各项指标回到安全线则判定「挺过来了」----
  if ((p.negativeMoneyStreak ?? 0) >= 3) markMajorCrisis(state);
  checkCrisisRecovered(state);

  return out;
}

/** 抑郁症治疗（医院就诊调用）：清除状态并重置计数 */
export function cureDepression(state: GameState): boolean {
  const idx = state.statuses.findIndex((s) => s.id === "depressed");
  if (idx < 0) return false;
  state.statuses.splice(idx, 1);
  state.player.depressionStreak = 0;
  state.player.attrs.mood = Math.max(state.player.attrs.mood, 45);
  onRecoveredDepressionOrInjury(state); // v0.985 力量：从抑郁中完全恢复
  return true;
}

// ---------- UI 辅助 ----------

export type SurvivalSeverity = "ok" | "warn" | "danger" | "critical";

/** 单项属性的告警等级（UI 用于分级高亮/脉冲/震动） */
export function attrSeverity(key: string, value: number): SurvivalSeverity {
  const table: Record<string, [warn: number, danger: number]> = {
    stamina: [STAMINA_WARN, 8],
    satiety: [SATIETY_WARN, 10],
    health: [HEALTH_WARN, 12],
    mood: [MOOD_WARN, 12],
    hygiene: [HYGIENE_WARN, HYGIENE_WORK_MIN],
  };
  const t = table[key];
  if (!t) return "ok";
  if (value <= 0) return "critical";
  if (value < t[1]) return "danger";
  if (value < t[0]) return "warn";
  return "ok";
}

/** 当前最严重的生存告警（驱动整屏红色 vignette） */
export function worstSeverity(state: GameState): SurvivalSeverity {
  const a = state.player.attrs as unknown as Record<string, number>;
  const order: SurvivalSeverity[] = ["ok", "warn", "danger", "critical"];
  let worst: SurvivalSeverity = "ok";
  for (const k of ["stamina", "satiety", "health", "mood", "hygiene"]) {
    const s = attrSeverity(k, a[k] ?? 100);
    if (order.indexOf(s) > order.indexOf(worst)) worst = s;
  }
  return worst;
}

/** 生成当前需要向玩家播报的生存警告文案（按严重度降序，最多 n 条） */
export function survivalWarnings(
  state: GameState,
  n = 3,
): Array<{ key: string; label: string; text: string; severity: SurvivalSeverity; icon: string }> {
  const a = state.player.attrs;
  const list: Array<{
    key: string;
    label: string;
    text: string;
    severity: SurvivalSeverity;
    icon: string;
  }> = [];

  const push = (key: string, label: string, icon: string, value: number, text: string) => {
    const sev = attrSeverity(key, value);
    if (sev !== "ok") list.push({ key, label, icon, severity: sev, text });
  };

  push("satiety", "饱腹", "🍽️", a.satiety, a.satiety <= 0 ? "饿到眼前发黑，再不吃就要晕倒了！" : "肚子在叫，该吃点东西了");
  push("stamina", "体力", "😮‍💨", a.stamina, a.stamina <= 0 ? "体力见底，强行活动会直接晕倒！" : "累得不行，需要休息");
  push("health", "健康", "🤒", a.health, a.health <= 0 ? "健康归零！随时可能猝死，立刻去医院！" : "身体状况很差，考虑就医");
  push("mood", "心情", "🫥", a.mood, `情绪低落（已连续 ${state.player.depressionStreak ?? 0} 天），当心抑郁`);
  push("hygiene", "干净度", "🚿", a.hygiene, a.hygiene < HYGIENE_WORK_MIN ? "太脏了，这形象没法上班！" : "该洗澡了");

  const order: SurvivalSeverity[] = ["ok", "warn", "danger", "critical"];
  return list.sort((x, y) => order.indexOf(y.severity) - order.indexOf(x.severity)).slice(0, n);
}
