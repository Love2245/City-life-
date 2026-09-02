/**
 * 行动 / 地点 / 移动系统（纯逻辑层）。
 *
 * 职责：
 * 1. 地点数据（locations.json）与行动数据（actions.json）的加载与索引；
 * 2. 营业时间判定（isLocationOpen / locationOpenPhase / closedReason / hoursUntilOpen / canArriveEarly）；
 * 3. 行动可用性校验（canPerform / checkRequirements）与执行（performAction，含各 handler 分支）；
 * 4. 出行（travelPlan / regionTravelPlan / travelHours / travelText）与移动（moveTo / travelToRegion / exitLocation）；
 * 5. 原地等待（waitHere / waitOptions）。
 *
 * 约束：本文件属 core 纯逻辑层，不得引入 DOM / Svelte / Tauri。
 */
import type {
  ActionDef,
  ActionRequirements,
  ActionResult,
  Effects,
  Facility,
  GameState,
  LocationDef,
  ResultDelta,
  SkillKey,
  StatusId,
} from "../types";
import actionsData from "../data/actions.json";
import locationsData from "../data/locations.json";

import { applyEffects, collectDeltas, pickVerdict, pushLog, triggerCollapse } from "../engine";
import { advanceHours } from "./time";
import { gameDay, WEEKDAY_LABEL, weekdayOf } from "./calendar";
import { scaleCost } from "./difficulty";
import { currentWeather, isRainy } from "./weather";
import { getMaxStamina } from "./stats";
import { guardCollapse } from "./fatigue";
import { reconcileStatuses, hasStatus, STATUS_NAMES } from "./statuses";
import { isDepressed, cureDepression } from "./survival";
import { buyProperty, currentRegion, hasFacility, selectLodging, signLease } from "./housing";
import { addItem, applyItem, getItem } from "./items";
import { recordFoodEaten, recordLocationVisited } from "./achievements";
import { canCook, consumeIngredients } from "./cooking";
import { buyMembership, isMembershipActive, membershipDaysLeft, MEMBERSHIPS } from "./membership";
import { buyVehicle, rentVehicle } from "./vehicle";
import { getProject, isProjectDone, workOnProject } from "./projects";
import { resignJob } from "./career";
import { refreshLaborMarket } from "./jobs";
import { isReferred } from "./contacts";
import { afterChurchMass, afterTempleVolunteer, religionBlockReason } from "./religion";
import { enterRegion, getRegion, goToMap, locationsOfRegion, topRegionOf } from "./regions";
import { hoursLabel, planLabel, planTransit, type TransitPlan, type TransitTier } from "./transit";

/* ------------------------------------------------------------------ *
 * 数据与索引
 * ------------------------------------------------------------------ */

export const LOCATIONS: LocationDef[] = locationsData as LocationDef[];
export const ACTIONS: ActionDef[] = actionsData as ActionDef[];

const actionMap = new Map<string, ActionDef>(ACTIONS.map((a) => [a.id, a]));
const locationMap = new Map<string, LocationDef>(LOCATIONS.map((l) => [l.id, l]));

/** 属性/能力中文名（校验失败文案用） */
export const ATTR_NAME_MAP: Record<string, string> = {
  stamina: "体力",
  health: "健康",
  mood: "心情",
  hygiene: "干净度",
  satiety: "饱腹",
  intelligence: "智力",
  charm: "魅力",
  fitness: "体质",
  fame: "影响力",
};

/** 住处设施中文名 */
export const FACILITY_NAME: Record<Facility, string> = {
  rest: "休息的地方",
  shower: "洗澡设施",
  cook: "做饭条件",
};

/** 高强度行动：体力归零时执行会直接晕倒 */
export const HIGH_COST_ACTIONS = new Set<string>(["exercise_gym", "exercise_park", "internet_play"]);

/** 星期 key（与 ActionRequirements.weekday / JobDef.restDays 同格式） */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** 堂食额外耗时（小时）：在店里吃比打包多花的时间 */
export const DINE_IN_EXTRA_HOURS = 0.5;

/** 等待上限（小时） */
export const WAIT_MAX_HOURS = 6;
/** 提前到岗候场窗口（小时）：距开门 ≤ 该值可提前抵达等候 */
export const EARLY_ARRIVAL_WINDOW = 2;
/** 干等每小时的心情惩罚 */
export const WAIT_MOOD_PER_HOUR = -1;

export function getLocation(id: string): LocationDef | undefined {
  return locationMap.get(id);
}

export function getAction(id: string): ActionDef | undefined {
  return actionMap.get(id);
}

/** 某地点下的全部行动 */
export function actionsOf(locationId: string): ActionDef[] {
  return ACTIONS.filter((a) => a.locationId === locationId);
}

/* ------------------------------------------------------------------ *
 * 营业时间
 * ------------------------------------------------------------------ */

/** 该地点在 hour 点是否营业（end 不含；start>end 支持跨夜；缺省=全天） */
export function isLocationOpen(loc: LocationDef | undefined, hour: number): boolean {
  if (!loc) return false;
  if (!loc.openHours) return true;
  const { start, end } = loc.openHours;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** 营业阶段：open=营业中 / before=还没开门 / after=已打烊 */
export function locationOpenPhase(
  loc: LocationDef | undefined,
  hour: number,
): "open" | "before" | "after" {
  if (!loc || !loc.openHours || isLocationOpen(loc, hour)) return "open";
  const { start, end } = loc.openHours;
  if (start < end) return hour < start ? "before" : "after";
  // 跨夜营业：比较"距开门"与"距打烊"哪个更近
  const toOpen = (start - hour + 24) % 24;
  const sinceClose = (hour - end + 24) % 24;
  return toOpen <= sinceClose ? "before" : "after";
}

/** 打烊原因文案（营业中返回空串） */
export function closedReason(loc: LocationDef | undefined, hour: number): string {
  const phase = locationOpenPhase(loc, hour);
  if (phase === "open") return "";
  const oh = loc?.openHours;
  if (!oh) return "该地点已打烊";
  return phase === "before"
    ? `还没开门（${oh.start}:00 开门，${oh.end}:00 关门）`
    : `已经打烊（次日 ${oh.start}:00 开门）`;
}

/** 距离开门还有几小时（已营业返回 0，保留两位小数） */
export function hoursUntilOpen(loc: LocationDef | undefined, hour: number, minute = 0): number {
  if (!loc?.openHours) return 0;
  const now = hour + minute / 60;
  if (isLocationOpen(loc, Math.floor(now))) return 0;
  const wait = (loc.openHours.start - now + 24) % 24;
  return Math.round(wait * 100) / 100;
}

/** v0.935：未开门但距开门 ≤ EARLY_ARRIVAL_WINDOW，可提前抵达候场 */
export function canArriveEarly(loc: LocationDef | undefined, hour: number): boolean {
  if (!loc?.openHours || isLocationOpen(loc, Math.floor(hour))) return true;
  if (locationOpenPhase(loc, Math.floor(hour)) !== "before") return false;
  return hoursUntilOpen(loc, Math.floor(hour), (hour % 1) * 60) <= EARLY_ARRIVAL_WINDOW;
}

/* ------------------------------------------------------------------ *
 * 原地等待
 * ------------------------------------------------------------------ */

export interface WaitOption {
  hours: number;
  label: string;
  /** 智能档：等到最近的开门时刻 */
  smart?: boolean;
}

export interface WaitResult {
  ok: boolean;
  reason?: string;
  result?: ActionResult;
}

/** 原地等待指定小时数（0.5 ~ WAIT_MAX_HOURS） */
export function waitHere(state: GameState, hours: number): WaitResult {
  const h = Math.round(Math.min(Math.max(hours, 0.5), WAIT_MAX_HOURS) * 100) / 100;
  if (state.flags.hospitalized) return { ok: false, reason: "正在住院，安心养病吧" };
  if (state.player.attrs.stamina <= 0) {
    return { ok: false, reason: "已经站不住了，先找地方休息" };
  }
  const moodDelta = Math.round(h) * WAIT_MOOD_PER_HOUR;
  const eff: Effects = moodDelta ? { mood: moodDelta } : {};
  applyEffects(state, eff);
  advanceHours(state, h);
  reconcileStatuses(state);
  const label = h >= 1 ? `${h} 小时` : `${Math.round(h * 60)} 分钟`;
  pushLog(state, "⏳", `你在原地等了 ${label}`);
  return {
    ok: true,
    result: {
      actionId: "wait_here",
      icon: "⏳",
      name: `等待 ${label}`,
      duration: h,
      deltas: collectDeltas(eff),
      verdict: pickVerdict(state, ["时间一点点过去了", "无所事事地看着人来人往", "干等着也是熬"]),
    },
  };
}

/** 可选等待档位：固定 30 分钟 / 1 小时 / 2 小时，外加"等到开门"智能档 */
export function waitOptions(state: GameState): WaitOption[] {
  const tiers: WaitOption[] = [
    { hours: 0.5, label: "等 30 分钟" },
    { hours: 1, label: "等 1 小时" },
    { hours: 2, label: "等 2 小时" },
  ];

  const locId = state.locationId;
  if (locId && locId !== "map") {
    const loc = getLocation(locId);
    if (loc && locationOpenPhase(loc, state.time.hour) === "before") {
      const need = hoursUntilOpen(loc, state.time.hour, state.time.minute);
      if (need > 0 && need <= WAIT_MAX_HOURS) {
        tiers.unshift({ hours: need, label: `等到 ${loc.openHours?.start}:00 开门`, smart: true });
      }
    }
    return tiers;
  }

  // 区域视图：找该区内最快开门的地点
  if (state.region) {
    let best: { need: number; loc: LocationDef } | undefined;
    for (const loc of locationsOfRegion(state.region)) {
      if (loc.locked || locationOpenPhase(loc, state.time.hour) !== "before") continue;
      const need = hoursUntilOpen(loc, state.time.hour, state.time.minute);
      if (need > 0 && need <= WAIT_MAX_HOURS && (!best || need < best.need)) {
        best = { need, loc };
      }
    }
    if (best) {
      tiers.unshift({
        hours: best.need,
        label: `等到 ${best.loc.openHours?.start}:00（${best.loc.name}开门）`,
        smart: true,
      });
    }
  }
  return tiers;
}

/* ------------------------------------------------------------------ *
 * 需求校验
 * ------------------------------------------------------------------ */

export interface CheckResult {
  ok: boolean;
  reason?: string;
}

export interface RequirementOptions {
  /** 难度递增：门槛统一加成 */
  reqBonus?: number;
  /** 跳过属性门槛（高消耗行动体力归零时交由 guardCollapse 处理） */
  skipAttr?: boolean;
  /** 岗位 id：命中内推可免证书 flag */
  jobId?: string;
}

function attrOf(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

/** 通用需求校验（行动 / 工作共用） */
export function checkRequirements(
  state: GameState,
  req?: ActionRequirements,
  opts?: RequirementOptions,
): CheckResult {
  const bonus = opts?.reqBonus ?? 0;

  if (req?.attr && !opts?.skipAttr) {
    for (const [key, need] of Object.entries(req.attr)) {
      const cur = attrOf(state, key);
      const threshold = (need ?? 0) + bonus;
      if (cur < threshold) {
        return { ok: false, reason: `${ATTR_NAME_MAP[key] ?? key}不足（需 ${threshold}）` };
      }
    }
  }

  if (req?.attrMax) {
    for (const [key, cap] of Object.entries(req.attrMax)) {
      if (attrOf(state, key) > (cap ?? 0)) {
        return { ok: false, reason: `${ATTR_NAME_MAP[key] ?? key}需低于 ${cap} 才能进行` };
      }
    }
  }

  if (req?.skill) {
    for (const [key, need] of Object.entries(req.skill)) {
      const threshold = (need ?? 0) + bonus;
      if (state.player.skills[key as SkillKey] < threshold) {
        return { ok: false, reason: `技能不足（需 ${threshold}）` };
      }
    }
  }

  if (req?.money && state.player.money < req.money) {
    return { ok: false, reason: `金钱不足（需 ${req.money}）` };
  }

  if (req?.flag && !state.flags[req.flag]) {
    // v0.978：命中内推的岗位可免证书
    if (opts?.jobId && isReferred(state, opts.jobId)) return { ok: true };
    return { ok: false, reason: "条件未满足" };
  }

  if (req?.membership && !isMembershipActive(state, req.membership)) {
    const m = MEMBERSHIPS[req.membership];
    return {
      ok: false,
      reason: m
        ? `需要有效的${m.name}（前台可办理，${m.price} 元/${m.days} 天）`
        : "会籍无效",
    };
  }

  if (req?.weekday && req.weekday.length > 0) {
    const today = WEEKDAY_KEYS[weekdayOf(state.time)];
    if (!req.weekday.includes(today)) {
      const days = req.weekday
        .map((k) => WEEKDAY_LABEL[WEEKDAY_KEYS.indexOf(k as (typeof WEEKDAY_KEYS)[number])] ?? k)
        .join("、");
      return { ok: false, reason: `只在${days}举行（今天${WEEKDAY_LABEL[weekdayOf(state.time)]}）` };
    }
  }

  if (req?.hourRange) {
    const hour = state.time.hour;
    const { start, end } = req.hourRange;
    const inRange = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (!inRange) {
      return { ok: false, reason: `只在 ${start}:00–${end}:00 进行（现在 ${hour}:00）` };
    }
  }

  if (req?.flagAtLeast) {
    const raw = state.flags[req.flagAtLeast.flag];
    const cur = typeof raw === "number" ? raw : raw ? 1 : 0;
    if (cur < req.flagAtLeast.value) {
      return { ok: false, reason: "尚未获得寺中允许，先去做些事吧" };
    }
  }

  if (req?.oncePerDay) {
    const raw = state.flags[req.oncePerDay];
    if (typeof raw === "number" && raw === gameDay(state.time)) {
      return { ok: false, reason: "今天已经做过一次了，明天再来吧" };
    }
  }

  return { ok: true };
}

/** 行动可用性：营业时间 + 设施 + 状态 + 专项前置 + 通用需求 */
export function canPerform(state: GameState, action: ActionDef): CheckResult {
  const loc = getLocation(action.locationId);
  if (!isLocationOpen(loc, state.time.hour)) {
    return { ok: false, reason: closedReason(loc, state.time.hour) || "该地点已打烊" };
  }

  if (action.requiresFacility && !hasFacility(state, action.requiresFacility)) {
    return { ok: false, reason: `当前住处没有${FACILITY_NAME[action.requiresFacility]}` };
  }

  if (action.requirements?.noStatus) {
    for (const id of action.requirements.noStatus) {
      if (hasStatus(state, id)) {
        return { ok: false, reason: `【${STATUS_NAMES[id]}】状态下不适合做这个` };
      }
    }
  }

  if (action.handler === "work_project" && action.projectId) {
    const proj = getProject(action.projectId);
    if (proj && isProjectDone(state, proj.id)) {
      return { ok: false, reason: "这个项目已经完成了" };
    }
  }

  if (action.handler === "cook_item" && action.recipeId) {
    const cook = canCook(state, action.recipeId);
    if (!cook.ok) return cook;
  }

  // 高消耗行动体力归零：跳过属性门槛，交给 guardCollapse 触发晕倒
  return HIGH_COST_ACTIONS.has(action.id) && state.player.attrs.stamina <= 0
    ? checkRequirements(state, action.requirements, { skipAttr: true })
    : checkRequirements(state, action.requirements);
}

/* ------------------------------------------------------------------ *
 * 行动执行
 * ------------------------------------------------------------------ */

/** 堂食 / 打包 */
export type DineMode = "eat" | "pack";

export interface PerformOptions {
  dine?: DineMode;
}

export interface PerformResult {
  ok: boolean;
  reason?: string;
  crossedDay?: boolean;
  result?: ActionResult;
}

/** 通胀后的效果（仅金钱受物价指数影响） */
function inflatedEffects(state: GameState, action: ActionDef): Effects {
  return { ...(action.effects ?? {}), money: scaleCost(state, action.effects?.money ?? 0) };
}

/** 打烊自动踢出：在地点内待到打烊则退回街上 / 主地图 */
function autoExitIfClosed(state: GameState): void {
  if (state.locationId === "map") return;
  const loc = getLocation(state.locationId);
  if (!loc || isLocationOpen(loc, state.time.hour)) return;
  // 尚在候场窗口内（如 7:30 到岗等 8:00 开门）不踢出
  if (canArriveEarly(loc, state.time.hour)) return;
  if (state.region) {
    enterRegion(state, state.region);
    pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了街上");
  } else {
    goToMap(state);
    pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了主地图");
  }
}

function done(
  _state: GameState,
  action: ActionDef,
  duration: number,
  deltas: ResultDelta[],
  verdict: string,
  crossedDay: boolean,
): PerformResult {
  return {
    ok: true,
    crossedDay,
    result: {
      actionId: action.id,
      icon: action.icon,
      name: action.name,
      duration,
      deltas,
      sound: action.sound,
      verdict,
    },
  };
}

/** 执行行动：按 handler 分派，缺省走通用效果结算 */
export function performAction(
  state: GameState,
  actionId: string,
  opts?: PerformOptions,
): PerformResult {
  const action = getAction(actionId);
  if (!action) return { ok: false, reason: "未知行动" };

  // 宗教排他 + 弥撒时段
  if (actionId === "church_mass" || actionId === "temple_volunteer") {
    const blocked = religionBlockReason(state, action.locationId ?? "");
    if (blocked) return { ok: false, reason: blocked };
    if (
      actionId === "church_mass" &&
      (weekdayOf({ year: state.time.year, month: state.time.month, day: state.time.day }) !== 5 ||
        state.time.hour < 15 ||
        state.time.hour >= 18)
    ) {
      return { ok: false, reason: "弥撒仅在每周六 15:00–18:00 举行" };
    }
  }

  // ---- 签约月租 ----
  if (action.handler === "sign_lease") {
    const r = signLease(state, action.housingId ?? "old_apartment");
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 睡觉：交由弹窗处理 ----
  if (action.handler === "sleep_modal") {
    return { ok: false, reason: "请点击行动卡弹出睡眠设置" };
  }

  // ---- 洗浴中心一条龙 ----
  if (action.handler === "wash_center") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 24);
    state.player.attrs.satiety = 100;
    state.player.attrs.stamina = getMaxStamina(state);
    state.player.attrs.mood = Math.min(100, state.player.attrs.mood + 10);
    state.player.attrs.hygiene = 100;
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 24,
      [
        { key: "money", label: "金钱", value: -(action.effects.money ?? 0) },
        { key: "satiety", label: "饱腹", value: 100 },
        { key: "stamina", label: "体力", value: 100 },
        { key: "hygiene", label: "干净度", value: 100 },
        { key: "mood", label: "心情", value: 10 },
      ],
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 按晚开房 / 禅房过夜 ----
  if (action.handler === "stay_hotel") {
    if (state.living.mode !== "nightly") {
      return { ok: false, reason: "已有固定住处，不需要另找地方过夜" };
    }
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, action.effects, action.icon);
    selectLodging(state, action.housingId ?? "hotel");
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 租用载具 ----
  if (action.handler === "rent_vehicle" && action.vehicleType) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = rentVehicle(state, action.vehicleType);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 买断载具 ----
  if (action.handler === "buy_vehicle" && action.vehicleType) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = buyVehicle(state, action.vehicleType);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      r.price !== undefined
        ? [{ key: "money", label: "金钱", value: -r.price }]
        : collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 买断产权房 ----
  if (action.handler === "buy_property" && action.housingId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = buyProperty(state, action.housingId);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      r.price !== undefined
        ? [{ key: "money", label: "金钱", value: -r.price }]
        : collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 购买物品入包（可装备则自动装备） ----
  if (action.handler === "buy_item" && action.itemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, inflatedEffects(state, action), action.icon);
    addItem(state, action.itemId);
    const item = getItem(action.itemId);
    if (item?.luxury && !state.economy.ownedLuxury.includes(item.id)) {
      state.economy.ownedLuxury.push(item.id);
    }
    if (item && !item.consumable) applyItem(state, action.itemId);
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 熟食 / 水果：堂食或打包 ----
  if ((action.handler === "buy_food" || action.handler === "buy_fresh") && action.itemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const item = getItem(action.itemId);
    if (!item) return { ok: false, reason: "货架上暂时没有这件商品" };

    const dine: DineMode = opts?.dine ?? "pack";
    const buyEffects = inflatedEffects(state, action);
    applyEffects(state, buyEffects, action.icon);
    const deltas = collectDeltas(buyEffects);
    let duration = action.duration ?? 0.5;
    let verdict: string;

    if (dine === "eat") {
      const useEff = item.useEffects ?? {};
      applyEffects(state, useEff, item.icon);
      recordFoodEaten(state, action.itemId);
      deltas.push(...collectDeltas(useEff));
      duration += DINE_IN_EXTRA_HOURS;
      verdict = `在店里把${item.name}解决掉了，一身轻松地出门。`;
    } else {
      addItem(state, action.itemId);
      pushLog(state, item.icon, `${item.name}打包带走，装进了背包`);
      verdict = `${item.name}已打包，饿的时候从背包里拿出来吃。`;
    }

    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, deltas, verdict, crossedDay);
  }

  // ---- 生鲜食材：只入包，需带回去做熟 ----
  if (action.handler === "buy_ingredient" && action.itemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, inflatedEffects(state, action), action.icon);
    addItem(state, action.itemId);
    const item = getItem(action.itemId);
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 0.5,
      collectDeltas(action.effects),
      `${item?.name ?? "食材"}是生的，得带回有厨房的住处做熟才能吃。`,
      crossedDay,
    );
  }

  // ---- 下厨 ----
  if (action.handler === "cook_item" && action.recipeId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const cook = canCook(state, action.recipeId);
    if (!cook.ok) return { ok: false, reason: cook.reason };
    const consumed = consumeIngredients(state, action.recipeId);
    if (!consumed.ok || !consumed.recipe) return { ok: false, reason: consumed.reason };
    const recipe = consumed.recipe;

    applyEffects(state, action.effects, action.icon);
    applyEffects(state, recipe.effects, recipe.icon);
    recordFoodEaten(state, "recipe_" + action.recipeId);

    const duration = recipe.duration ?? action.duration ?? 1;
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return {
      ok: true,
      crossedDay,
      result: {
        actionId,
        icon: recipe.icon,
        name: recipe.name,
        duration,
        deltas: [...collectDeltas(action.effects), ...collectDeltas(recipe.effects)],
        sound: action.sound,
        verdict: `自己做的${recipe.name}，比外面买的踏实。`,
      },
    };
  }

  // ---- 办理会籍 ----
  if (action.handler === "buy_membership" && action.membershipId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = buyMembership(state, action.membershipId);
    if (!r.ok) return { ok: false, reason: r.reason };
    const def = MEMBERSHIPS[action.membershipId];
    applyEffects(state, action.effects, action.icon);
    const deltas = collectDeltas(action.effects);
    if (def) deltas.unshift({ key: "money", label: "金钱", value: -scaleCost(state, def.price) });
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 0.5,
      deltas,
      `${def?.name ?? "会籍"}已生效，剩余 ${r.daysLeft ?? membershipDaysLeft(state, action.membershipId)} 天。`,
      crossedDay,
    );
  }

  // ---- 心理门诊 ----
  if (action.handler === "treat_depression") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (!isDepressed(state)) return { ok: false, reason: "目前没有抑郁症状，不需要做这个治疗" };
    applyEffects(state, action.effects, action.icon);
    cureDepression(state);
    state.flags.depressed_cured = true;
    pushLog(state, "🫂", "抑郁状态已解除，你重新有了上班的力气");
    const { crossedDay } = advanceHours(state, action.duration ?? 2);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 2,
      [...collectDeltas(action.effects), { key: "mood", label: "心情", value: 15 }],
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 办理住院 ----
  if (action.handler === "hospitalize") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (state.flags.hospitalized) return { ok: false, reason: "已经在住院了，先办理出院" };
    state.flags.hospitalized = true;
    state.flags.hospitalNights = 0;
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 办理出院 ----
  if (action.handler === "discharge") {
    if (!state.flags.hospitalized) return { ok: false, reason: "当前没有住院" };
    state.flags.hospitalized = false;
    state.flags.hospitalNights = 0;
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 办理离职 ----
  if (action.handler === "resign") {
    const r = resignJob(state);
    if (!r.ok) return { ok: false, reason: r.text };
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      collectDeltas(action.effects),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 创业项目推进 ----
  if (action.handler === "work_project" && action.projectId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = workOnProject(state, action.projectId);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      r.deltas ?? [],
      r.completed ? "项目完成！你的努力终于开花结果了。" : pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 通用行动 ----
  const check = canPerform(state, action);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (HIGH_COST_ACTIONS.has(action.id)) {
    const guard = guardCollapse(state, action.name, triggerCollapse);
    if (!guard.ok) return { ok: false, reason: guard.reason };
  }

  if (action.requirements?.oncePerDay) {
    state.flags[action.requirements.oncePerDay] = gameDay(state.time);
  }

  applyEffects(state, action.effects, action.icon);

  // 热浪：体力消耗额外 +25%
  if (currentWeather(state) === "heatwave" && (action.effects.stamina ?? 0) < 0) {
    const extra = Math.round(-(action.effects.stamina ?? 0) * 0.25);
    state.player.attrs.stamina = Math.max(0, state.player.attrs.stamina - extra);
  }

  if (action.effects.satiety && action.effects.satiety > 0) {
    recordFoodEaten(state, action.id);
  }

  const { crossedDay } = advanceHours(state, action.duration ?? 1);
  reconcileStatuses(state, {
    heavyWork: action.id === "exercise_gym" || action.id === "exercise_park",
    staminaCost: -(action.effects.stamina ?? 0),
  });
  autoExitIfClosed(state);

  if (actionId === "church_mass") afterChurchMass(state);
  else if (actionId === "temple_volunteer") afterTempleVolunteer(state);

  return done(
    state,
    action,
    action.duration ?? 1,
    collectDeltas(action.effects),
    pickVerdict(state, action.verdicts),
    crossedDay,
  );
}

/* ------------------------------------------------------------------ *
 * 出行与移动
 * ------------------------------------------------------------------ */

/** 进入地点时推断来源区域：优先沿用当前 region（同 id 可跨多区） */
export function inferSourceRegion(state: GameState, loc: LocationDef): string | undefined {
  if (state.region && loc.regions?.includes(state.region)) return state.region;
  return loc.regions?.[0];
}

/** 当前物理所在的二级区域：region 优先，主地图态回退 area */
export function currentArea(state: GameState): string | undefined {
  const region = state.region;
  return region && getRegion(region)?.parent ? region : state.area;
}

/** 地点归属区域（住处随住宿动态归属） */
function regionsOfLocation(state: GameState, loc: LocationDef): string[] | undefined {
  return loc.id === "home" ? [currentRegion(state)] : loc.regions;
}

/** 目标地点是否与当前物理区域同区 */
export function isSameArea(state: GameState, loc: LocationDef): boolean {
  const area = currentArea(state);
  const regions = regionsOfLocation(state, loc);
  return !!area && (regions?.includes(area) ?? false);
}

/** 当前所在的一级区域（市区 / 郊区） */
function topAreaOfState(state: GameState): string | undefined {
  if (state.region && getRegion(state.region)) return topRegionOf(state.region);
  return state.area ? topRegionOf(state.area) : undefined;
}

/** 出行层级：同区 / 同城跨区 / 跨一级区（市区↔郊区） */
function tierOf(state: GameState, loc: LocationDef | undefined): TransitTier {
  if (!loc) return "local";
  if (isSameArea(state, loc)) return "same";
  const from = topAreaOfState(state);
  const to = loc.regions?.[0] ? topRegionOf(loc.regions[0]) : undefined;
  return from && to && from !== to ? "intercity" : "local";
}

/** 雨天减速：地铁 / 步行耗时 ×1.5 */
function weatherAdjust(state: GameState, plan: TransitPlan): TransitPlan {
  return plan.hours > 0 && (plan.mode === "subway" || plan.mode === "walk") && isRainy(state)
    ? { ...plan, hours: plan.hours * 1.5 }
    : plan;
}

/** 前往某地点的出行方案 */
export function travelPlan(state: GameState, loc: LocationDef | undefined): TransitPlan {
  return weatherAdjust(state, planTransit(state, tierOf(state, loc)));
}

/** 前往某区域的出行方案 */
export function regionTravelPlan(state: GameState, regionId: string): TransitPlan {
  const region = getRegion(regionId);
  // 一级区域（市区 / 郊区）：按一级区是否相同决定跨城
  if (!region?.parent) {
    const from = topAreaOfState(state);
    const to = topRegionOf(regionId);
    return weatherAdjust(state, planTransit(state, from && to && from !== to ? "intercity" : "same"));
  }
  if (currentArea(state) === regionId) return weatherAdjust(state, planTransit(state, "same"));
  const from = topAreaOfState(state);
  const to = topRegionOf(regionId);
  return weatherAdjust(state, planTransit(state, from && to && from !== to ? "intercity" : "local"));
}

/** 前往某地点需要的小时数 */
export function travelHours(state: GameState, loc: LocationDef | undefined): number {
  return travelPlan(state, loc).hours;
}

/** 耗时文案：0 → "即刻到达" */
export function travelLabel(hours: number): string {
  return hoursLabel(hours);
}

/** 出行方式 + 耗时文案（如"地铁 · 约 30 分钟"） */
export function travelText(state: GameState, loc: LocationDef | undefined): string {
  return planLabel(travelPlan(state, loc));
}

/** 车费不足的拦截文案 */
function fareBlockReason(state: GameState, plan: TransitPlan): string | undefined {
  if (plan.mode === "bus" && state.player.money < plan.fare) {
    return `身上不够 ${plan.fare} 元长途车费，攒点钱或者搞辆车再来吧`;
  }
  return undefined;
}

/** 扣车费 + 出行日志 */
function payAndLogTravel(state: GameState, plan: TransitPlan): void {
  if (plan.mode === "same") return;
  if (plan.fare > 0) {
    state.player.money -= plan.fare;
    const how = plan.mode === "bus" ? "坐长途巴士跨区" : "坐地铁跨区";
    pushLog(state, plan.icon, `${how}，车费 ${plan.fare} 元（${hoursLabel(plan.hours)}）`);
    return;
  }
  if (plan.mode === "walk") {
    pushLog(state, "🚶", `${walkReasonText(state)}，只能走过去，路上花了 ${hoursLabel(plan.hours)}`);
    return;
  }
  pushLog(state, plan.icon, `${plan.name}过去，${hoursLabel(plan.hours)}就到了`);
}

/** 同步物理区域：站在二级区域时记录 area */
function syncArea(state: GameState): void {
  const region = state.region;
  if (region && getRegion(region)?.parent) state.area = region;
}

/** 前往区域（含出行结算） */
export function travelToRegion(state: GameState, regionId: string): CheckResult {
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: "未知区域" };
  if (region.locked) return { ok: false, reason: "该区域暂未开放，下次更新推出" };

  const plan = regionTravelPlan(state, regionId);
  const blocked = fareBlockReason(state, plan);
  if (blocked) return { ok: false, reason: blocked };

  const entered = enterRegion(state, regionId);
  if (!entered.ok) return entered;

  syncArea(state);
  if (plan.hours > 0) {
    payAndLogTravel(state, plan);
    advanceHours(state, plan.hours);
  }
  return { ok: true };
}

/** 进入地点（含出行结算 + 打烊投影判定） */
function enterLocation(state: GameState, loc: LocationDef): CheckResult {
  if (loc.locked) return { ok: false, reason: "暂未开放" };

  const plan = travelPlan(state, loc);
  const blocked = fareBlockReason(state, plan);
  if (blocked) return { ok: false, reason: blocked };

  const hours = plan.hours;
  if (hours > 0) {
    // 打烊投影：按抵达时刻判定，赶不上就别白跑
    const arrive = (state.time.hour + state.time.minute / 60 + hours) % 24;
    if (!isLocationOpen(loc, Math.floor(arrive)) && !canArriveEarly(loc, arrive)) {
      const phase = locationOpenPhase(loc, Math.floor(arrive));
      const cost = `过去要${hoursLabel(hours).replace("约 ", "")}`;
      return {
        ok: false,
        reason:
          phase === "before"
            ? `${cost}，那时还没开门（${loc.openHours?.start}:00 营业）`
            : `${cost}，到那时已经打烊了`,
      };
    }
  }

  payAndLogTravel(state, plan);
  state.locationId = loc.id;
  recordLocationVisited(state, loc.id);
  state.region = loc.id === "home" ? currentRegion(state) : inferSourceRegion(state, loc);
  syncArea(state);
  state.navStack = [];
  if (loc.id === "labor_market") refreshLaborMarket(state);
  advanceHours(state, hours);
  return { ok: true };
}

/** 统一移动入口：区域 id / 地点 id / "map" 都走这里 */
export function moveTo(state: GameState, targetId: string): CheckResult {
  const blocked = religionBlockReason(state, targetId);
  if (blocked) return { ok: false, reason: blocked };

  if (getRegion(targetId)) return travelToRegion(state, targetId);
  if (targetId === "map") {
    goToMap(state);
    return { ok: true };
  }
  const loc = locationMap.get(targetId);
  return loc ? enterLocation(state, loc) : { ok: false, reason: "未知地点" };
}

/** 出门按钮：地点态回到所属区域视图，无归属则回主地图 */
export function exitLocation(state: GameState): CheckResult {
  if (state.locationId === "map") return { ok: false, reason: "已经在地图上了" };
  const region = state.region;
  if (region && getRegion(region)) return enterRegion(state, region);
  goToMap(state);
  return { ok: true };
}

/** 步行原因文案（无车 / 地铁停运 / 钱不够） */
function walkReasonText(state: GameState): string {
  return walkReasonImpl(state);
}

// 由 transit 提供，单独包一层避免命名遮蔽
import { walkReason as walkReasonImpl } from "./transit";

export type { ActionDef, ActionRequirements, LocationDef, StatusId };
