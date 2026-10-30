/**
 * 随机事件引擎：条件过滤 + 权重抽签 + 选项结算。
 * 纯逻辑层。剧情事件后续扩展只需补充 events.json（conditions 组合式）。
 */
import type { GameState, EventDef, EventData, EventConditions, Period, EventChoice, Effects } from "../types";
import { chance, weightedDraw } from "../rng";
import { applyEffects, collectDeltas, pushLog } from "../engine";
import type { ResultDelta } from "../types";
import { checkRequirements, ATTR_NAME_MAP } from "./actions";
import { onEventTriggered, onEventChoice } from "./tarot";
import { periodOfHour } from "./time";
import { absoluteDay } from "./membership";
import { difficultyLevel, eventProbability, negativeWeightBoost } from "./difficulty";
import { hasStatus } from "./statuses";
import { seasonOf, isWeekend, weekdayOf } from "./calendar";
import { holidayOf } from "./weather";
import { addContact } from "./contacts";
import { recordMoney } from "./weekly"; // v1.43.x：集市特卖扣款计入周记（与 weekly 的依赖环均在函数内访问，ESM 下安全）
import { addItem, applyItem, getItem } from "./items";
import { SHOP_CATALOG } from "./shop";
import { ensureRelationship, addAffinity } from "./relationships";
import { allNpcs, npcNick, getNpcDef, npcAtLocation } from "./npcs";
import { npcOrdinaryAppearanceUnlocked } from '../data/npcIntroductionProgress';
import { regionPathOf } from "./regions";
import { adoptCat } from "./cat";
import { activePetOf, tickCatAutoFeeder } from "./catCare";
import eventsData from "../data/events.json";
import { hasLongTermResidence, isResidenceLocation } from "./residence";

export const EVENT_DATA: EventData = eventsData as unknown as EventData;
export const EVENTS: EventDef[] = EVENT_DATA.events;

/** 未标 tone 的事件按其选项效果补判，覆盖花钱、损失属性和负面风险分支。 */
export function isNegativeEvent(event: EventDef): boolean {
  if (event.tone) return event.tone === "negative";
  return event.choices.some((choice) => {
    const effect = choice.effects as Effects;
    const numeric = [effect.money, effect.stamina, effect.health, effect.mood, effect.hygiene,
      effect.satiety, effect.intelligence, effect.charm, effect.fitness, effect.fame]
      .some((value) => typeof value === "number" && value < 0);
    const debtOrStress = (effect.debt ?? 0) > 0 || (effect.stress ?? 0) > 0 || (effect.hours ?? 0) > 0;
    const skillLoss = Object.values(effect.skills ?? {}).some((value) => typeof value === "number" && value < 0);
    const gambleLoss = !!choice.gamble && choice.gamble.lose < choice.gamble.cost;
    return numeric || debtOrStress || skillLoss || gambleLoss;
  });
}

/** 检查事件是否满足条件（全部满足才进候选池） */
export function checkEventConditions(state: GameState, ev: EventDef): boolean {
  if (ev.mode && ev.mode !== "any" && ev.mode !== state.mode) return false;
  const c = ev.conditions;
  // 收养猫咪需要有可长期照料它的住所；已有猫咪仍照常触发养成事件。
  if (ev.choices.some((choice) => !!choice.adoptCat) && !hasLongTermResidence(state)) return false;
  // v1.43：住处是「安全区」——街头 / 户外类偶发事件不在家触发。
  // 旧版在家吃饭时也会弹出「捡钱包」「周末零工」，既不合场合，又能反复白拿钱。
  // 例外：事件显式声明可在家中发生（locationId / locationIn 含 home），或属于节假日事件。
  if (isResidenceLocation(state)) {
    const allowsHome = c?.locationId === "home" || (c?.locationIn ?? []).includes("home") || !!c?.holiday;
    if (!allowsHome) return false;
  }
  if (!c) return true;

  if (c.locationId && state.locationId !== c.locationId && !(c.locationId === "home" && isResidenceLocation(state))) return false;

  // v0.981 多地点过滤：任一命中即可
  if (c.locationIn && c.locationIn.length > 0 && !c.locationIn.includes(state.locationId ?? "")
    && !(c.locationIn.includes("home") && isResidenceLocation(state))) return false;

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

  // v1.4 P2 携带猫咪过滤
  if (c.hasActivePet === true && !activePetOf(state)) return false;
  // v1.42：已拥有任意猫咪后不再出现重复收养类事件；与 activePet 解耦，收起猫咪也算已拥有
  if (c.hasPet === false && state.pets.some((pet) => !!pet?.catId)) return false;

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

/** v1.43：两次随机事件之间的最小游戏时间间隔（分钟）。只约束随机抽取，不影响强制剧情事件。 */
export const RANDOM_EVENT_MIN_GAP_MINUTES = 90;

export function rollEvent(state: GameState, probability = eventProbability(state)): EventDef | null {
  // v0.981 剧情强制事件优先（绕过概率与条件），弹出即消费
  while (state.pendingEvents && state.pendingEvents.length > 0) {
    const id = state.pendingEvents.shift()!;
    const forced = EVENTS.find((e) => e.id === id);
    if (forced) {
      state.flags["last_random_event_minute"] = absoluteDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
      onEventTriggered(state, forced.id); // v0.985 命运之轮：不同事件去重累计
      return forced;
    }
  }
  // v1.43：随机事件之间至少间隔 90 分钟游戏时间。
  // 旧版每次行动 / 吃饭 / 看手机都会独立掷点，一天能连出好几个事件，体感是「弹窗刷屏」。
  const nowMinute = absoluteDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
  const lastMinute = typeof state.flags["last_random_event_minute"] === "number"
    ? (state.flags["last_random_event_minute"] as number)
    : Number.NEGATIVE_INFINITY;
  if (nowMinute - lastMinute < RANDOM_EVENT_MIN_GAP_MINUTES) return null;

  if (!chance(state.rng, probability)) return null;
  const pool = EVENTS.filter((e) => checkEventConditions(state, e));
  if (pool.length === 0) return null;
  // v0.94 难度递增：负面事件随难度放大权重
  // v0.95 霉运 buff：负面事件权重再放大 1.5 倍（良性循环的反面）
  let boost = negativeWeightBoost(state);
  if (hasStatus(state, "unlucky")) boost *= 1.5;
  const weighted = pool.map((e) => ({
    item: e,
    weight: isNegativeEvent(e) ? e.weight * boost : e.weight,
  }));
  const drawn = weightedDraw(state.rng, weighted);
  if (drawn) {
    state.flags["last_random_event_minute"] = nowMinute;
    onEventTriggered(state, drawn.id); // v0.985 命运之轮：不同事件去重累计
  }
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
  if (choice.adoptCat && !hasLongTermResidence(state)) {
    return { ok: false, reason: "先有自己的出租屋或产权住房，再把猫咪接回家吧" };
  }

  const check = checkRequirements(state, choice.requires);
  if (!check.ok) return { ok: false, reason: check.reason };

  // v1.3b9 集市七五折特卖：选项 0 动态结算（商品索引/价格由 market_browse 行动写入 flags）
  if (ev.id === "ev_market_fair_deal" && choiceIdx === 0) {
    const idx = typeof state.flags.fair_deal_idx === "number" ? state.flags.fair_deal_idx : -1;
    const price = typeof state.flags.fair_deal_price === "number" ? state.flags.fair_deal_price : 0;
    const deal = SHOP_CATALOG[idx];
    if (!deal || price <= 0) return { ok: false, reason: "你走近一看，特卖摊已经收了" };
    if (state.player.money < price) return { ok: false, reason: `现金不够（需 ${price} 元），只好放回去了` };
    state.player.money -= price;
    recordMoney(state, -price); // 周记：集市特卖计入支出
    addItem(state, deal.id, 1);
    pushLog(state, deal.icon, `集市特卖：七五折 ¥${price} 淘到「${deal.name}」`);
    // 消费后清掉 flags，防止重复购买同一单
    delete state.flags.fair_deal_idx;
    delete state.flags.fair_deal_price;
    return {
      ok: true,
      deltas: [{ key: "money", label: "金钱", value: -price }],
      outcome: `七五折 ¥${price} 买下了「${deal.name}」，比店里省了 ¥${Math.round(price / 0.75) - price}，已经装进背包。`,
    };
  }

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
  // v1.45：场景奖励服装/物品在效果结算后一次性入包，事件 JSON 不直接承担背包逻辑。
  if (choice.items) {
    for (const [itemId, quantity] of Object.entries(choice.items)) {
      const item = getItem(itemId);
      const count = Math.floor(Number(quantity));
      if (!item || !Number.isFinite(count) || count <= 0) continue;
      addItem(state, itemId, count);
      applyItem(state, itemId);
      pushLog(state, item.icon, `获得「${item.name}」×${count}`);
    }
  }
  // v0.978：选择触发新增联系人（幂等；内部发欢迎短信 + onAdd 效果）
  if (choice.addContact) addContact(state, choice.addContact);
  // v1.01：选择触发结识 NPC（具体 id 或 "any" = 随机结识当前地点常驻的未认识 NPC）
  if (choice.addNpc) {
    const met = meetNpcByEvent(state, choice.addNpc);
    if (met) pushLog(state, "🤝", met);
  }
  // v1.4：选择触发收养猫咪（写入 state.pets + 图鉴解锁）
  if (choice.adoptCat) {
    const pet = adoptCat(state, choice.adoptCat);
    if (pet) {
      pushLog(state, pet.icon, `你收养了「${pet.name}」，它成了你的伙伴`);
      // v1.38 P7：流浪猫全局去重——一旦收养过任意流浪猫，街区/公园/便利店都不再刷同类收养事件
      state.flags["stray_adopted"] = true;
    }
  }
  // v1.4 P2：猫咪效果作用于当前携带猫咪（activePet）的生存状态
  if (choice.catEffect) {
    const pet = activePetOf(state);
    if (pet) {
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      if (choice.catEffect.satiety) pet.care.satiety = clamp(pet.care.satiety + choice.catEffect.satiety);
      if (choice.catEffect.mood) pet.care.mood = clamp(pet.care.mood + choice.catEffect.mood);
      if (choice.catEffect.hygiene) pet.care.hygiene = clamp(pet.care.hygiene + choice.catEffect.hygiene);
    }
  }
  // 事件选项也可能降低猫咪饱食度；在状态变更后立即检查已安装的自动喂食机。
  for (const msg of tickCatAutoFeeder(state)) pushLog(state, "🤖", msg);
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

/**
 * v1.01 事件相识：结识指定 NPC（id 或 "any"）。
 * "any" 从当前地点常驻且尚未认识的 NPC 中随机挑一个（排除仅在职可遇的同事类）。
 * 返回相识提示文案（供 pushLog），未结识返回 null。
 */
function meetNpcByEvent(state: GameState, ref: string): string | null {
  let npcId = ref;
  if (ref === "any") {
    const time = { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), hour: state.time.hour, minute: state.time.minute, regionId: state.region };
    const here = allNpcs().filter(
      (n) =>
        npcOrdinaryAppearanceUnlocked(state, n.id) && npcAtLocation(n, state.locationId, time) &&
        !state.relationships.some((r) => r.npcId === n.id) &&
        !n.meetConditions?.requireEmployed,
    );
    if (here.length === 0) return null;
    const picked = weightedDraw(state.rng, here.map((n) => ({ item: n.id, weight: 1 })));
    if (!picked) return null;
    npcId = picked;
  }
  if (state.relationships.some((r) => r.npcId === npcId)) return null; // 已认识
  const def = getNpcDef(npcId);
  if (!def || !npcOrdinaryAppearanceUnlocked(state, npcId)) return null;
  ensureRelationship(state, npcId);
  addAffinity(state, npcId, 3, "event");
  return def.metText ?? `机缘之下，你结识了${npcNick(npcId)}`;
}

function getAttrValue(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

/**
 * v1.43 修复：事件选项净效果预览（纯函数，便于测试 / UI 风险提示使用）。
 * 把金钱与主要生存属性（饱食 / 精力 / 心情 / 健康 / 干净）按符号加权求和，
 * 得到一个「综合分」：
 *  - 净效果为负 → 该选项大概率坑人（如花钱买罪受、白送钱还掉属性），UI 提示「⚠ 有风险」
 *  - 净效果为正 → 稳妥（可给玩家一个克制的「＋」暗示，也可不显示以保持探索感）
 *  - 含运气选项（gamble）时按「期望收益」估算（成本 + 期望输赢），因为结果随机不暴露具体数值
 * 设计取舍：生存属性权重高于金钱，避免「花 10 元换 5 点心情」这类公平交易被误判为风险。
 */
export interface ChoiceNetEffect {
  /** 净金钱变化（含 gamble 期望值） */
  money: number;
  /** 加权后的生存属性净变化 */
  attrs: number;
  /** 综合分 = money + attrs */
  net: number;
  tone: "positive" | "negative" | "neutral";
}

/** 参与净效果的主要生存属性（与任务1三项核心数值一致） */
const NET_ATTR_KEYS = ["satiety", "stamina", "mood", "health", "hygiene"] as const;
/** 每个生存属性点折合的分值（>1 让小额消费不被误判为风险） */
const NET_ATTR_WEIGHT = 3;

export function eventChoiceNetEffect(choice: EventChoice): ChoiceNetEffect {
  const eff = choice.effects ?? {};
  let money = typeof eff.money === "number" ? eff.money : 0;
  let attrs = 0;
  const rec = eff as unknown as Record<string, number | undefined>;
  for (const k of NET_ATTR_KEYS) {
    const v = rec[k];
    if (typeof v === "number") attrs += v * NET_ATTR_WEIGHT;
  }
  if (choice.gamble) {
    const g = choice.gamble;
    const expected = g.win * g.winChance + g.lose * (1 - g.winChance) - g.cost;
    money += expected;
  }
  const net = Math.round((money + attrs) * 100) / 100;
  const tone: ChoiceNetEffect["tone"] = net < 0 ? "negative" : net > 0 ? "positive" : "neutral";
  return { money: Math.round(money * 100) / 100, attrs: Math.round(attrs * 100) / 100, net, tone };
}

export type { EventConditions, Period };
export { ATTR_NAME_MAP };
