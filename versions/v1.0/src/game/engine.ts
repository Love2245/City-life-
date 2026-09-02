/**
 * GameEngine 门面：所有游戏状态变更的唯一入口（纯逻辑）。
 * 注意：applyEffects/advanceTime 为"原地突变"模式（store 持有同一引用）。
 */
import type { GameState, SurvivalAttrs, Skills, Effects, ResultDelta } from "./types";
import { createInitialState } from "./core/state";
import { advanceHours, periodOfHour } from "./core/time";
import { getMaxStamina } from "./core/stats";
import { applyStatuses, cureStatuses } from "./core/statuses";
import { weightedDraw } from "./rng";
import {
  evaluateTarot,
  tarotCard,
  recordNightAction,
  recordCollapsedThenActed,
  markCollapsed,
  markMajorCrisis,
  checkCrisisRecovered,
} from "./core/tarot";
import { checkTutorialProgress, currentTutorialStep, TUTORIAL_STEPS } from "./core/tutorial";

/** 收集效果的非零增量（供结算弹窗展示，带中文标签） */
export function collectDeltas(effects: Effects): ResultDelta[] {
  const out: ResultDelta[] = [];
  const push = (key: string, label: string, value: number | undefined) => {
    if (value && value !== 0) out.push({ key, label, value });
  };
  push("money", "金钱", effects.money);
  push("stamina", "体力", effects.stamina);
  push("health", "健康", effects.health);
  push("mood", "心情", effects.mood);
  push("hygiene", "干净度", effects.hygiene);
  push("satiety", "饱腹", effects.satiety);
  push("intelligence", "智力", effects.intelligence);
  push("charm", "魅力", effects.charm);
  push("fitness", "体质", effects.fitness);
  push("fame", "影响力", effects.fame);
  push("stress", "压力", effects.stress);
  if (effects.skills) {
    const names: Record<string, string> = {
      programming: "编程", design: "设计", writing: "文案", operation: "运营",
      cooking: "厨艺", service: "服务", driving: "驾驶", management: "管理",
    };
    for (const [k, v] of Object.entries(effects.skills)) {
      push(k, names[k] ?? k, v);
    }
  }
  return out;
}

/** 从 verdicts 随机抽 1 条评价 */
export function pickVerdict(state: GameState, verdicts?: string[]): string {
  if (!verdicts || verdicts.length === 0) return "今天也努力了。";
  const picked = weightedDraw(state.rng, verdicts.map((v) => ({ item: v, weight: 1 })));
  return picked ?? "今天也努力了。";
}

/** 结算效果（供行动/事件/背景/工作/家庭共用） */
export function applyEffects(state: GameState, effects: Effects, icon = "📝"): void {
  const p = state.player;
  const a = p.attrs;

  if (effects.money) p.money += effects.money;
  if (effects.debt) p.debt += effects.debt;
  // 体力上限可超 100（属性点/家庭修正），其余属性 clamp 0-100
  if (effects.stamina) a.stamina = clampStamina(a.stamina + effects.stamina, getMaxStamina(state));
  if (effects.health) a.health = clamp(a.health + effects.health);
  if (effects.mood) a.mood = clamp(a.mood + effects.mood);
  if (effects.hygiene) a.hygiene = clamp(a.hygiene + effects.hygiene);
  if (effects.satiety) {
    a.satiety = clamp(a.satiety + effects.satiety);
    if (effects.satiety > 0) state.flags["ateToday"] = true; // v0.936：标记当日进食，供饥饿计数
  }
  if (effects.intelligence) p.stats.intelligence = clamp(p.stats.intelligence + effects.intelligence);
  if (effects.charm) p.stats.charm = clamp(p.stats.charm + effects.charm);
  if (effects.fitness) p.stats.fitness = clamp(p.stats.fitness + effects.fitness);
  if (effects.fame) p.stats.fame = clamp(p.stats.fame + effects.fame);
  if (effects.stress) p.stress = clamp(p.stress + effects.stress);

  if (effects.skills) {
    for (const [k, v] of Object.entries(effects.skills)) {
      const key = k as keyof Skills;
      p.skills[key] = clampSkill(p.skills[key] + (v ?? 0));
    }
  }
  if (effects.flags) {
    Object.assign(state.flags, effects.flags);
  }
  // 移除 flag（v0.89：考驾照后清除报名标记等）
  if (effects.cureFlags) {
    for (const k of effects.cureFlags) delete state.flags[k];
  }
  if (effects.statuses) {
    applyStatuses(state, effects.statuses);
  }
  if (effects.cureStatuses) {
    cureStatuses(state, effects.cureStatuses);
  }
  if (effects.log) {
    pushLog(state, icon, effects.log);
  }
  // v0.981 事件选项的额外时间开销（如错过末班车多走一小时）
  if (effects.hours && effects.hours > 0) {
    advanceHours(state, effects.hours);
  }
  // v0.985：夜间行动计数（月亮）与「晕倒后未睡继续行动」判定（倒吊人），需在评估之前记录
  recordNightAction(state);
  recordCollapsedThenActed(state);
  checkCrisisRecovered(state); // 高塔：危机后各项指标回到安全线即判定存活
  // v0.985：每次结算后评估塔罗牌（解锁写入 state.tarot.unlocked，UI 监听 pendingTarot 弹窗）
  const newly = evaluateTarot(state);
  for (const id of newly) {
    const card = tarotCard(id);
    if (card) pushLog(state, "🔮", `翻开塔罗牌「${id}·${card.name}」——${card.symbol}`);
  }
  // v0.94：新手引导自动推进（吃到饭/入职/赚到钱/睡过觉等条件满足即完成对应步骤）
  const tnew = checkTutorialProgress(state);
  if (tnew.length > 0) {
    const cur = currentTutorialStep(state);
    const step = TUTORIAL_STEPS.find((s) => s.id === tnew[tnew.length - 1]);
    if (step) pushLog(state, step.icon, `✔ 新手目标完成「${step.title}」`);
    if (cur) {
      pushLog(state, "🎯", `下一步：${cur.def.title} —— ${cur.def.desc}`);
    } else {
      pushLog(state, "🎉", "新手引导全部完成，都市生活正式开始！");
    }
  }
}

/** 推进时间（行动后调用） */
export function advanceTime(state: GameState, hours: number): { crossedDay: boolean } {
  return advanceHours(state, hours);
}

/**
 * 晕倒结算（v0.91 体力惩罚）：
 * 1. 按余额比例收医药费（20%，至少 30 元）
 * 2. 强制回家
 * 3. 恢复一半体力，健康/心情小幅受损
 * 4. 时间跳过 12 小时（跨天自动走任务栏/劳务市场刷新）
 * 5. 解除疲惫/作息混乱状态 + 日志
 * 实现在 engine（避免 fatigue → time → jobs → fatigue 重环）。
 */
export function triggerCollapse(state: GameState, why: string): void {
  const fee = Math.max(30, Math.round(state.player.money * 0.2));
  state.player.money -= fee;
  state.flags["collapsed_once"] = true; // v0.94：「死里逃生」标记
  markCollapsed(state); // v0.985：置位「已晕倒未睡」，若醒后不睡直接行动则解锁倒吊人
  markMajorCrisis(state); // v0.985：晕倒计入重大危机，日后重新站起来解锁高塔
  pushLog(state, "🚑", `${why}，体力透支晕倒了！被好心人送回家，医药费 -${fee} 元`);

  // 强制回家
  state.locationId = "home";
  state.region = "downtown_residential";
  state.navStack = [];

  // 恢复一半体力
  const max = getMaxStamina(state);
  state.player.attrs.stamina = Math.round(max * 0.5);
  state.player.attrs.health = Math.max(0, state.player.attrs.health - 2);
  state.player.attrs.mood = Math.max(0, state.player.attrs.mood - 5);
  state.player.stress = Math.min(100, state.player.stress + 5);

  // 时间跳过 12 小时（v0.936：昏迷跳过不扣饱腹，与睡眠/小睡一致；资金为负的连续天数由每晚结算统一计算）
  advanceHours(state, 12, false);

  // 疲惫状态解除（睡了 12 小时）
  cureStatuses(state, ["exhausted", "sleep_disorder"]);
}

/** 写入日志（导出供 housing/jobs/backgrounds 复用；自动派生时段与时刻） */
export function pushLog(state: GameState, icon: string, text: string): void {
  state.log.push({
    day: state.time.day,
    period: periodOfHour(state.time.hour),
    hour: state.time.hour,
    icon,
    text,
  });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
function clampStamina(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}
function clampSkill(v: number): number {
  return Math.max(0, Math.min(10, v));
}

export { createInitialState };
export type { Effects };

/** 仅供测试/调试：读取属性快照 */
export function snapshot(state: GameState) {
  return {
    time: { ...state.time },
    attrs: { ...state.player.attrs },
    stats: { ...state.player.stats },
    money: state.player.money,
    rent: state.living.lease?.rent ?? 0,
    stress: state.player.stress,
    livingMode: state.living.mode,
  };
}

/** 从外部读取状态类型别名 */
export type { GameState, SurvivalAttrs };
