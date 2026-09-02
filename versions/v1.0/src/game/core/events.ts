/**
 * 随机事件引擎：条件过滤 + 权重抽签 + 选项结算。
 * 纯逻辑层。剧情事件后续扩展只需补充 events.json（conditions 组合式）。
 */
import type { GameState, EventDef, EventData, EventConditions, Period } from "../types";
import { chance, weightedDraw } from "../rng";
import { applyEffects, collectDeltas } from "../engine";
import type { ResultDelta } from "../types";
import { checkRequirements, ATTR_NAME_MAP } from "./actions";
import { onEventTriggered, onEventChoice } from "./tarot";
import { periodOfHour } from "./time";
import { absoluteDay } from "./membership";
import { difficultyLevel, eventProbability, negativeWeightBoost } from "./difficulty";
import { hasStatus } from "./statuses";
import { seasonOf, isWeekend } from "./calendar";
import { holidayOf } from "./weather";
import { addContact } from "./contacts";
import { regionPathOf } from "./regions";
import eventsData from "../data/events.json";

export const EVENT_DATA: EventData = eventsData as unknown as EventData;
export const EVENTS: EventDef[] = EVENT_DATA.events;

/** 检查事件是否满足条件（全部满足才进候选池） */
export function checkEventConditions(state: GameState, ev: EventDef): boolean {
  const c = ev.conditions;
  if (!c) return true;

  if (c.locationId && state.locationId !== c.locationId) return false;

  // v0.981 多地点过滤：任一命中即可
  if (c.locationIn && c.locationIn.length > 0 && !c.locationIn.includes(state.locationId ?? "")) return false;

  // v0.981 区域过滤：按玩家所在二级区的整条区域路径匹配（支持一级区与二级区）
  if (c.region && c.region.length > 0) {
    const area = state.area ?? (state.region ? state.region : undefined);
    const path = area ? regionPathOf(area) : [];
    if (!c.region.some((r) => path.includes(r))) return false;
  }

  if (c.period && !c.period.includes(periodOfHour(state.time.hour))) return false;

  if (c.hourRange) {
    const h = state.time.hour;
    const { start, end } = c.hourRange;
    if (start < end) {
      if (h < start || h >= end) return false;
    } else if (h < start && h >= end) return false;
  }

  if (c.attr) {
    for (const [k, need] of Object.entries(c.attr)) {
      const cur = getAttrValue(state, k);
      if (cur < (need ?? 0)) return false;
    }
  }

  if (c.skill) {
    for (const [k, need] of Object.entries(c.skill)) {
      const key = k as keyof typeof state.player.skills;
      if (state.player.skills[key] < (need ?? 0)) return false;
    }
  }

  if (c.flag && !state.flags[c.flag]) return false;
  if (c.notFlag && state.flags[c.notFlag]) return false;

  if (c.minMoney != null && state.player.money < c.minMoney) return false;

  // v0.95 季节/天气/节假日过滤
  if (c.season && c.season.length > 0 && !c.season.includes(seasonOf(state.time.month))) return false;
  if (c.weather && c.weather.length > 0 && !c.weather.includes(state.weather?.id ?? "sunny")) return false;
  if (c.holiday && c.holiday.length > 0) {
    const h = holidayOf(state);
    if (!h || !c.holiday.includes(h.id)) return false;
  }
  // v0.97 周末/工作日过滤
  if (c.weekend === true && !isWeekend(state.time)) return false;
  if (c.weekend === false && isWeekend(state.time)) return false;

  // 冷却（v0.936：改用绝对日差值，避免跨月 time.day 回绕导致整月不进候选池）
  if (ev.cooldown && ev.cooldown > 0) {
    const last = state.flags[`ev_${ev.id}_last`];
    if (typeof last === "number" && absoluteDay(state.time) - last < ev.cooldown) return false;
  }
  // 一次性
  if (ev.once && state.flags[`ev_${ev.id}_done`]) return false;

  // v0.94 难度递增：事件难度区间门控
  if (c.difficulty) {
    const lvl = difficultyLevel(state);
    if (c.difficulty.min != null && lvl < c.difficulty.min) return false;
    if (c.difficulty.max != null && lvl > c.difficulty.max) return false;
  }

  return true;
}

/**
 * 行动结算后调用：概率 + 条件过滤 + 权重抽签。
 * 只读 rng，结果交由 UI 层存入 pendingEvent。
 */
/** v0.981 排队一个必定触发的事件（下一次 rollEvent 优先弹出） */
export function queueEvent(state: GameState, eventId: string): void {
  if (!state.pendingEvents) state.pendingEvents = [];
  if (!state.pendingEvents.includes(eventId)) state.pendingEvents.push(eventId);
}

export function rollEvent(state: GameState, probability = eventProbability(state)): EventDef | null {
  // v0.981 剧情强制事件优先（绕过概率与条件），弹出即消费
  while (state.pendingEvents && state.pendingEvents.length > 0) {
    const id = state.pendingEvents.shift()!;
    const forced = EVENTS.find((e) => e.id === id);
    if (forced) {
      onEventTriggered(state, forced.id); // v0.985 命运之轮：不同事件去重累计
      return forced;
    }
  }
  if (!chance(state.rng, probability)) return null;
  const pool = EVENTS.filter((e) => checkEventConditions(state, e));
  if (pool.length === 0) return null;
  // v0.94 难度递增：负面事件随难度放大权重
  // v0.95 霉运 buff：负面事件权重再放大 1.5 倍（良性循环的反面）
  let boost = negativeWeightBoost(state);
  if (hasStatus(state, "unlucky")) boost *= 1.5;
  const weighted = pool.map((e) => ({
    item: e,
    weight: e.tone === "negative" ? e.weight * boost : e.weight,
  }));
  const drawn = weightedDraw(state.rng, weighted);
  if (drawn) onEventTriggered(state, drawn.id); // v0.985 命运之轮：不同事件去重累计
  return drawn;
}

/** 选择事件选项：校验 requires → 处理 gamble → applyEffects → 写 cooldown/once flag */
export function applyEventChoice(
  state: GameState,
  eventId: string,
  choiceIdx: number,
): { ok: boolean; deltas?: ResultDelta[]; reason?: string; gambleResult?: "win" | "lose"; outcome?: string } {
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) return { ok: false, reason: "未知事件" };
  const choice = ev.choices[choiceIdx];
  if (!choice) return { ok: false, reason: "未知选项" };

  const check = checkRequirements(state, choice.requires);
  if (!check.ok) return { ok: false, reason: check.reason };

  let eff = choice.effects;
  let gambleResult: "win" | "lose" | undefined;
  if (choice.gamble) {
    const g = choice.gamble;
    const won = chance(state.rng, g.winChance); // 可播种可复现
    gambleResult = won ? "win" : "lose";
    eff = {
      ...eff,
      money: (eff.money ?? 0) + (won ? g.win : g.lose) - g.cost,
    };
  }

  applyEffects(state, eff, ev.icon);
  // v0.978：选择触发新增联系人（幂等；内部发欢迎短信 + onAdd 效果）
  if (choice.addContact) addContact(state, choice.addContact);
  // 冷却/一次性标记（v0.936：存绝对日，配合冷却比较）
  if (ev.cooldown && ev.cooldown > 0) {
    state.flags[`ev_${ev.id}_last`] = absoluteDay(state.time);
  }
  if (ev.once) {
    state.flags[`ev_${ev.id}_done`] = true;
  }
  // v0.985 节制：登记在册的「助人」选项计一次善举
  onEventChoice(state, ev.id, choiceIdx);
  return { ok: true, deltas: collectDeltas(eff), gambleResult, outcome: choice.outcome };
}

function getAttrValue(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

export type { EventConditions, Period };
export { ATTR_NAME_MAP };
