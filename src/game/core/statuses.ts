/**
 * Debuff 状态系统：触发/升级/解除规则与睡眠惩罚系数。
 * 纯逻辑层。在 sleepSettlement/performAction/performJob/nap 结算末尾调用 reconcileStatuses。
 */
import type { GameState, StatusId } from "../types";
import { pushLog } from "../engine";
import { chance } from "../rng";

/** 各状态的睡眠恢复惩罚系数 */
export const STATUS_PENALTY: Record<StatusId, number> = {
  exhausted: 0.7,
  muscle_strain: 0.8,
  sleep_disorder: 0.85,
  sick: 0.8,
  hungry: 0.9,
  depressed: 0.75,
  insomnia: 0.85,
  cold: 0.8,
  lucky: 1,
  unlucky: 1,
};

export const STATUS_NAMES: Record<StatusId, string> = {
  exhausted: "疲惫",
  muscle_strain: "肌肉劳损",
  sleep_disorder: "作息混乱",
  sick: "生病",
  hungry: "饥饿",
  depressed: "抑郁症",
  insomnia: "失眠",
  cold: "感冒",
  lucky: "好运",
  unlucky: "霉运",
};

export const STATUS_ICONS: Record<StatusId, string> = {
  exhausted: "😮‍💨",
  muscle_strain: "💪",
  sleep_disorder: "🌒",
  sick: "🤒",
  hungry: "🍽️",
  depressed: "🫥",
  insomnia: "🌙",
  cold: "🤧",
  lucky: "🍀",
  unlucky: "☔",
};

/** 判定上下文（由各结算点传入） */
export interface ReconcileCtx {
  /** 本次是否入睡结算 */
  slept?: boolean;
  /** 本次睡眠小时数 */
  hoursSlept?: number;
  /** 本次是否熬夜（跨午夜或 23 点后入睡） */
  stayedUp?: boolean;
  /** 本次是否执行了重体力工作 */
  heavyWork?: boolean;
  /** 本次行动/工作体力消耗（绝对值） */
  staminaCost?: number;
  /** 本次是否休息（躺平） */
  rested?: boolean;
}

/** 查询是否有某状态 */
export function hasStatus(state: GameState, id: StatusId): boolean {
  return state.statuses.some((s) => s.id === id);
}

/** 施加/升级状态（v0.92 导出，供 survival 抑郁判定复用） */
export function upsertStatus(state: GameState, id: StatusId, severityUp = 1): void {
  const existing = state.statuses.find((s) => s.id === id);
  if (existing) {
    existing.severity = Math.min(3, existing.severity + severityUp);
    existing.count++;
  } else {
    state.statuses.push({ id, severity: Math.min(3, severityUp), count: 1 });
    pushLog(state, STATUS_ICONS[id], `获得了【${STATUS_NAMES[id]}】状态！`);
  }
}

/** 移除状态 */
function remove(state: GameState, id: StatusId): void {
  const idx = state.statuses.findIndex((s) => s.id === id);
  if (idx >= 0) {
    state.statuses.splice(idx, 1);
    pushLog(state, "✅", `${STATUS_NAMES[id]}状态解除了`);
  }
}

/** 睡眠惩罚系数（各状态惩罚连乘） */
export function statusSleepPenalty(state: GameState): number {
  let penalty = 1;
  for (const s of state.statuses) {
    penalty *= STATUS_PENALTY[s.id] ?? 1;
  }
  return penalty;
}

/**
 * 状态调和：根据上下文触发/解除/升级 debuff。
 * 调用时机固定（结算末尾）保证可复现。
 */
export function reconcileStatuses(state: GameState, ctx: ReconcileCtx = {}): void {
  const health = state.player.attrs.health;

  // ---- 疲惫 ----
  if (ctx.slept) {
    const h = ctx.hoursSlept ?? 0;
    if (h >= 8) {
      remove(state, "exhausted");
      remove(state, "sleep_disorder");
    } else if (h >= 4) {
      // 睡 4-8 小时：疲惫降级
      const ex = state.statuses.find((s) => s.id === "exhausted");
      if (ex) ex.severity = Math.max(1, ex.severity - 1);
    } else {
      // 睡 <4 小时：疲惫升级 + 作息混乱累积
      upsertStatus(state, "exhausted");
      upsertStatus(state, "sleep_disorder");
    }
  } else {
    // 清醒期间：体力耗尽 → 疲惫
    if (state.player.attrs.stamina <= 0) {
      upsertStatus(state, "exhausted");
    }
  }

  // ---- 作息混乱：熬夜累积 ----
  if (ctx.stayedUp && !ctx.slept) {
    registerNightOwl(state);
  }

  // ---- 肌肉劳损：体力不足干重活 ----
  if (ctx.heavyWork && (state.player.attrs.stamina < 30 || (ctx.staminaCost ?? 0) >= 60)) {
    upsertStatus(state, "muscle_strain");
  }
  if (ctx.rested) {
    // 躺平休息 2 次 → 劳损解除（count 累积）
    const ms = state.statuses.find((s) => s.id === "muscle_strain");
    if (ms) {
      ms.count++;
      if (ms.count >= 2) {
        remove(state, "muscle_strain");
      }
    }
  }

  // ---- 生病：健康过低 ----
  if (health < 25) {
    upsertStatus(state, "sick");
  } else if (health >= 60) {
    remove(state, "sick");
  }

  // ---- 饥饿：饱腹过低（≤30/15/5 三级，≥50 解除）----
  const satiety = state.player.attrs.satiety;
  const hungry = state.statuses.find((st) => st.id === "hungry");
  if (satiety <= 5) {
    upsertStatus(state, "hungry", 3);
  } else if (satiety <= 15) {
    upsertStatus(state, "hungry", 2);
  } else if (satiety <= 30) {
    upsertStatus(state, "hungry", 1);
  } else if (satiety >= 50 && hungry) {
    remove(state, "hungry");
  }

  // ---- v0.95 失眠：短睡累积、长睡解除 ----
  if (ctx.slept) {
    const h = ctx.hoursSlept ?? 0;
    if (h < 4) {
      upsertStatus(state, "insomnia");
    } else if (h >= 8) {
      remove(state, "insomnia");
    }
  }

  // ---- v0.95 恶性循环：失眠(≥2级) → 感冒（每晚概率触发；雨天概率翻倍）----
  if (ctx.slept) {
    const ins = state.statuses.find((s) => s.id === "insomnia");
    if (ins && ins.severity >= 2 && !hasStatus(state, "cold")) {
      const rainy = state.weather?.id === "rain" || state.weather?.id === "snow";
      if (chance(state.rng, rainy ? 0.5 : 0.2)) {
        upsertStatus(state, "cold");
      }
    }
  }

  // ---- v0.95 感冒恶化：小病拖成大病（感冒 + 健康<40 → 升级为生病）----
  if (hasStatus(state, "cold") && state.player.attrs.health < 40) {
    state.statuses = state.statuses.filter((s) => s.id !== "cold"); // 静默转化
    upsertStatus(state, "sick");
    pushLog(state, "🤒", "感冒拖成了大病，必须尽快就医！");
  }

  // ---- v0.95 好运/霉运自然衰减（每晚 1 次，3 晚后消失）----
  if (ctx.slept) {
    for (const id of ["lucky", "unlucky"] as const) {
      const st = state.statuses.find((s) => s.id === id);
      if (st) {
        st.count++;
        if (st.count >= 4) {
          remove(state, id);
        }
      }
    }
  }
}

/** 熬夜登记：累积作息混乱计数（首次熬夜记 count=1，累计 ≥2 升级状态）。
 *  v0.99 修复：原先该逻辑只在 reconcileStatuses 的 `stayedUp && !slept` 分支，
 *  但睡眠结算传 slept:true，分支永不执行——熬夜只掉心情/体力，作息混乱永远无法触发。
 *  现在由 sleep() 在熬夜时显式调用，保证熬夜真的会积累作息混乱。 */
export function registerNightOwl(state: GameState): void {
  const sd = state.statuses.find((s) => s.id === "sleep_disorder");
  if (sd) {
    sd.count++;
    if (sd.count >= 2) upsertStatus(state, "sleep_disorder");
  } else {
    state.statuses.push({ id: "sleep_disorder", severity: 1, count: 1 });
  }
}

/** 施加状态（Effects.statuses 用，applyEffects 调用） */
export function applyStatuses(state: GameState, list: Array<{ id: StatusId; severity?: number }>): void {
  for (const st of list) {
    upsertStatus(state, st.id, st.severity ?? 1);
  }
}

/** 移除状态（Effects.cureStatuses 用） */
export function cureStatuses(state: GameState, ids: StatusId[]): void {
  for (const id of ids) {
    remove(state, id);
  }
}
