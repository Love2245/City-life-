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
import { advanceHours, sleepSettlement } from "./time";
import { gameDay, WEEKDAY_LABEL, weekdayOf } from "./calendar";
import { scaleCost } from "./difficulty";
import { currentWeather, isRainy } from "./weather";
import { getMaxStamina, fameIncomeMult } from "./stats";
import { guardCollapse } from "./fatigue";
import { reconcileStatuses, hasStatus, STATUS_NAMES } from "./statuses";
import { isDepressed, cureDepression } from "./survival";
import { buyProperty, currentRegion, getLodging, hasFacility, selectLodging, signLease } from "./housing";
import { addItem, applyItem, getItem } from "./items";
import { recordFoodEaten, recordLocationVisited } from "./achievements";
import { canCook, consumeIngredients } from "./cooking";
import { buyMembership, isMembershipActive, membershipDaysLeft, MEMBERSHIPS } from "./membership";
import { buyVehicle, rentVehicle, returnVehicle, VEHICLE_NAMES } from "./vehicle";
import { recordMoney } from "./weekly"; // v1.215：车费等裸扣款计入周记（P1-10）
import { getProject, isProjectDone, workOnProject } from "./projects";
import { SHOP_CATALOG } from "./shop";
import { getBook, bookReadCount } from "../data/books";
import { chance, randomInt } from "../rng";
import { resignJob } from "./career";
import { maybeMeetNpc, npcDisplayName } from "./romance";
import { ensureRelationship, addAffinity, findRelationship } from "./relationships";
import { allNpcs } from "./npcs";
import { refreshLaborMarket } from "./jobs";
import { isReferred } from "./contacts";
import { afterChurchMass, afterTempleVolunteer, religionBlockReason } from "./religion";
import { enterRegion, getRegion, goToMap, locationsOfRegion, topRegionOf } from "./regions";
import { hoursLabel, planLabel, planTransit, type TransitPlan, type TransitTier } from "./transit";
import { activePetOf, getPet, feedCat, cleanCat, playWithCat, trainCat, buyCatItem, treatInjury, restoreCatHp, type CatActionResult } from "./catCare";
import { buyAccessory } from "./catAccessory";
import { getTournamentDef, getOpponentDef } from "./catBattle"; // v1.4 P4 对决信息查询
import { enterTournamentArena } from "./tournament"; // v1.33 P4d 游乐场赛场进入对决赛
import { SKILL_NAMES } from "../../lib/icons"; // v1.33-hotfix：收益标签的技能中文名（纯常量表，无 DOM）
import { formatMoney } from "../../lib/format"; // v1.33-hotfix：金额展示与 UI 保持一致（纯函数，无 DOM）

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

/** v1.3b2 便利店盲盒抽奖池（供盲盒行动与便利店下班随机福利共用） */
const BLIND_BOX_POOL = ["bento", "noodles", "sandwich", "salad", "drink", "vegetable", "meat", "fruit", "farm_egg", "farm_milk"];
/** 随机抽取盲盒两个内容（互不相同） */
export function rollBlindBox(state: GameState): { a: string; b: string } {
  let a = BLIND_BOX_POOL[randomInt(state.rng, 0, BLIND_BOX_POOL.length - 1)];
  let b = BLIND_BOX_POOL[randomInt(state.rng, 0, BLIND_BOX_POOL.length - 1)];
  if (BLIND_BOX_POOL.length > 1 && b === a) b = BLIND_BOX_POOL[(BLIND_BOX_POOL.indexOf(b) + 1) % BLIND_BOX_POOL.length];
  return { a, b };
}

/** 某地点下的全部行动 */
export function actionsOf(locationId: string): ActionDef[] {
  return ACTIONS.filter((a) => a.locationId === locationId);
}

/**
 * v1.33-hotfix：安全取行动的 effects。
 * 配置里允许「纯入口型」行动（如赛场入口：只跳转不结算属性），这类行动可以不写 effects。
 * 此前 UI 直接读 action.effects.money，遇到无 effects 的行动会抛 TypeError，
 * 导致整个场景面板渲染中断——表现为「背景切到游乐场，但地点内容一片空白，像进不去」。
 * 统一兜底成空对象，UI 一律用本函数取 effects。
 */
export function effectsOf(action: ActionDef | undefined): Effects {
  return action?.effects ?? {};
}

/** 效果对象 → 收益标签（纯函数，effects 缺失时返回空数组，绝不抛错） */
export function effectTagsOf(e: Effects | undefined): Array<{ text: string; cls: "gain" | "cost" | "info" }> {
  const tags: Array<{ text: string; cls: "gain" | "cost" | "info" }> = [];
  if (!e) return tags;
  if (e.money && e.money > 0) tags.push({ text: `+${formatMoney(e.money)}💰`, cls: "gain" });
  if (e.money && e.money < 0) tags.push({ text: `-${formatMoney(-e.money)}💰`, cls: "cost" });
  if (e.stamina && e.stamina < 0) tags.push({ text: `-${-e.stamina}⚡`, cls: "cost" });
  if (e.stamina && e.stamina > 0) tags.push({ text: `+${e.stamina}⚡`, cls: "gain" });
  if (e.health && e.health < 0) tags.push({ text: `-${-e.health}❤️`, cls: "cost" });
  if (e.stress && e.stress > 0) tags.push({ text: `+${e.stress}🔥`, cls: "cost" });
  if (e.stress && e.stress < 0) tags.push({ text: `-${-e.stress}🔥`, cls: "gain" });
  if (e.fame && e.fame > 0) tags.push({ text: `+${e.fame}🌟`, cls: "info" });
  if (e.skills) {
    for (const [k, v] of Object.entries(e.skills)) {
      if (v && v > 0) tags.push({ text: `+${v}${SKILL_NAMES[k as keyof typeof SKILL_NAMES] ?? k}`, cls: "info" });
    }
  }
  return tags;
}

/**
 * v1.33-hotfix：行动收益标签（含限时折扣折算），供 UI 直接渲染。
 * 无 effects 的行动返回空数组，绝不抛错。
 */
export function actionTagsOf(
  action: ActionDef,
  state?: GameState,
): Array<{ text: string; cls: "gain" | "cost" | "info" }> {
  const base = effectsOf(action);
  if (action.discount && base.money && base.money < 0 && state) {
    return effectTagsOf({ ...base, money: discountPrice(state, action, base.money) });
  }
  return effectTagsOf(base);
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
  // v0.99 修复：按小时比例取整（向零）——30 分钟等待不再误扣 1 点心情（原 Math.round(0.5)=1）
  const moodDelta = Math.trunc(h * WAIT_MOOD_PER_HOUR);
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
  // v1.20 万能证书：持有培训结业证书 → 所有需要技能证书的岗位完全解锁（含技能门槛）
  const masterCert = req?.flag === "item_certificate" && state.flags["item_training_cert"];

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

  if (req?.skill && !masterCert) {
    for (const [key, need] of Object.entries(req.skill)) {
      const threshold = (need ?? 0) + bonus;
      if (state.player.skills[key as SkillKey] < threshold) {
        return { ok: false, reason: `技能不足（需 ${threshold}）` };
      }
    }
  }

  if (req?.money && state.player.money < scaleCost(state, req.money)) {
    return { ok: false, reason: `金钱不足（需 ${scaleCost(state, req.money)}）` };
  }

  if (req?.flag && !masterCert && !state.flags[req.flag]) {
    // v0.978：命中内推的岗位可免证书
    if (opts?.jobId && isReferred(state, opts.jobId)) return { ok: true };
    return { ok: false, reason: "条件未满足" };
  }

  // v1.4：未持有该 flag 才可进行（如已收养某猫后不再出现收养选项）
  if (req?.notFlag && state.flags[req.notFlag]) {
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

  // v1.33 需携带猫咪才可进行（如公园户外训练）
  if (req?.hasActivePet && !activePetOf(state)) {
    return { ok: false, reason: "需要先携带一只猫咪（在猫咪面板里切换携带）" };
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

  // v1.20 摆摊小车：拥有小车可免除摆摊类行动的厨艺门槛
  if ((action.id === "stall_street_night" || action.id === "stall_market_fair") && state.flags["item_stall_cart"]) {
    const req = action.requirements ? { ...action.requirements, skill: undefined } : action.requirements;
    return HIGH_COST_ACTIONS.has(action.id) && state.player.attrs.stamina <= 0
      ? checkRequirements(state, req, { skipAttr: true })
      : checkRequirements(state, req);
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
  /** v1.4 P2 猫咪操作：目标猫 uid（缺省用当前携带猫 activePet） */
  catUid?: string;
  /** v1.38 猫粮打包购买：小/中/大包 */
  catFoodSize?: "small" | "medium" | "large";
}

export interface PerformResult {
  ok: boolean;
  reason?: string;
  crossedDay?: boolean;
  result?: ActionResult;
}

/** 通胀后的效果（仅金钱受物价指数影响；v1.3b2 叠加限时折扣） */
function inflatedEffects(state: GameState, action: ActionDef): Effects {
  const inflated = scaleCost(state, action.effects?.money ?? 0);
  return { ...(action.effects ?? {}), money: discountPrice(state, action, inflated) };
}

/**
 * v1.3b2 限时折扣：夜间（afterHour 起）菜市场等按比例打折，向上取整到整元。
 * 仅对「扣钱」类效果生效；已过折扣时刻才打折。
 */
export function discountPrice(state: GameState, action: ActionDef, rawMoney: number): number {
  if (rawMoney >= 0) return rawMoney;
  const d = action.discount;
  if (!d) return rawMoney;
  if (state.time.hour < d.afterHour) return rawMoney;
  return -Math.ceil(Math.abs(rawMoney) * d.rate);
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
  // v1.34：路边随机遭遇野生对决已移除，改为公园「猫咪自由锻炼」/ 游乐场「喵喵娱乐赛」入口
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

  // v1.3：使用笔记本（打开全屏桌面，由 UI 层捕获 reason === "laptop" 触发）
  if (action.handler === "use_laptop") {
    return { ok: false, reason: "laptop" };
  }

  // ---- 洗浴中心一条龙 ----
  if (action.handler === "wash_center") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 24);
    // v1.065：24h必跨一晚→补结算（月租/发薪/经济/生存/结局），再设满恢复
    if (crossedDay) {
      sleepSettlement(state, { stayedUp: true, hours: 0 });
    }
    // v1.066：deltas 用实际增益而非固定 +100（接近满值时实际增量很小）
    const prevSat = state.player.attrs.satiety;
    const prevHyg = state.player.attrs.hygiene;
    const prevMood = state.player.attrs.mood;
    const prevSta = state.player.attrs.stamina;
    const maxSta = getMaxStamina(state);
    state.player.attrs.satiety = 100;
    state.player.attrs.stamina = maxSta;
    state.player.attrs.mood = Math.min(100, state.player.attrs.mood + 10);
    state.player.attrs.hygiene = 100;
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 24,
      [
        { key: "money", label: "金钱", value: action.effects.money ?? 0 }, // v1.215 修复（P2-3）：泡澡 -300 不再显示成 +300
        { key: "satiety", label: "饱腹", value: Math.round(100 - prevSat) },
        { key: "stamina", label: "体力", value: Math.round(maxSta - prevSta) },
        { key: "hygiene", label: "干净度", value: Math.round(100 - prevHyg) },
        { key: "mood", label: "心情", value: Math.min(10, Math.round(100 - prevMood)) },
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
      r.price !== undefined
        ? [{ key: "money", label: "金钱", value: -r.price }]
        : collectDeltas(action.effects),
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

  // ---- v1.20 退租载具：退押金并回收 ----
  if (action.handler === "return_vehicle" && action.vehicleType) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = returnVehicle(state, action.vehicleType);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      r.price !== undefined && r.price > 0
        ? [{ key: "money", label: "金钱", value: r.price }]
        : [],
      `押金 ${r.price ?? 0} 元已退回，${VEHICLE_NAMES[action.vehicleType] ?? "车辆"}还给租赁行了。`,
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
    // v1.10：购买带 phoneSkin 的品质手机 → 永久更换手机外观
    if (item?.phoneSkin) state.phoneSkin = item.phoneSkin;
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      // v0.99 修复：弹窗展示与实扣一致的缩放价（原为原始价，通胀时虚报低价）
      collectDeltas(inflatedEffects(state, action)),
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
      // v1.3b2：deltas 用含折扣/通胀的实扣，保证结算窗与实扣一致（菜市场夜间 7.5 折）
      collectDeltas(inflatedEffects(state, action)),
      `${item?.name ?? "食材"}是生的，得带回有厨房的住处做熟才能吃。`,
      crossedDay,
    );
  }

  // ---- v1.10 培训学校：免费上课（每天 1 次，连续 3 天或累计 5 次领证书） ----
  if (action.handler === "train_study") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const today = gameDay(state.time);
    if (state.flags[`trained_${today}`]) {
      return { ok: false, reason: "今天已经上过课了，明天再来（连续 3 天或累计 5 次领证书）" };
    }
    state.flags[`trained_${today}`] = true;
    const last = typeof state.flags["train_last_day"] === "number" ? (state.flags["train_last_day"] as number) : -1;
    let streak = typeof state.flags["train_streak"] === "number" ? (state.flags["train_streak"] as number) : 0;
    streak = last === today - 1 ? streak + 1 : 1;
    state.flags["train_last_day"] = today;
    state.flags["train_streak"] = streak;
    state.flags["train_total"] = ((state.flags["train_total"] as number) ?? 0) + 1;
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 2);
    autoExitIfClosed(state);
    // 结业判定
    const total = state.flags["train_total"] as number;
    if (streak >= 3 || total >= 5) {
      if (!state.flags["item_training_cert"]) {
        state.flags["item_training_cert"] = true;
        pushLog(state, "🎓", "培训结业！拿到结业证书，可以去培训学校应聘助教了");
      }
    }
    return done(
      state,
      action,
      action.duration ?? 2,
      collectDeltas(action.effects).concat([{ key: "flag", label: "培训", value: 0 }]),
      pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 下厨 ----
  if (action.handler === "cook_item" && action.recipeId) {    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const cook = canCook(state, action.recipeId);
    if (!cook.ok) return { ok: false, reason: cook.reason };
    const consumed = consumeIngredients(state, action.recipeId);
    if (!consumed.ok || !consumed.recipe) return { ok: false, reason: consumed.reason };
    const recipe = consumed.recipe;

    applyEffects(state, action.effects, action.icon);
    applyEffects(state, recipe.effects, recipe.icon);
    recordFoodEaten(state, "recipe_" + action.recipeId);
    state.flags["cooked_today"] = true; // v1.25：每日目标「做一道菜」

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

  // ---- v1.25 主动搭话：结识新朋友（每日最多 2 次） ----
  if (action.handler === "meet_someone") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const today = gameDay(state.time);
    const sameDay = state.flags["meet_day"] === today;
    const meetCount = sameDay && typeof state.flags["meet_count_today"] === "number" ? (state.flags["meet_count_today"] as number) : 0;
    if (meetCount >= 2) return { ok: false, reason: "今天搭话次数用完了，明天再来吧" };
    const candidates = allNpcs().filter((n) => n.meetLocation === state.locationId && !findRelationship(state, n.id));
    if (candidates.length === 0) return { ok: false, reason: "这里没有想认识的人，换个地方试试" };
    const npc = candidates[randomInt(state.rng, 0, candidates.length - 1)];
    ensureRelationship(state, npc.id);
    addAffinity(state, npc.id, 3, "meet");
    state.flags["meet_day"] = today;
    state.flags["meet_count_today"] = meetCount + 1;
    pushLog(state, "👋", `你主动上前搭话，认识了${npcDisplayName(state, npc.id)}`);
    const duration = action.duration ?? 0.5;
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, [], `主动搭话认识了新朋友：${npcDisplayName(state, npc.id)}`, crossedDay);
  }

  // ---- v1.25 酒店前台：房型与早餐咨询 ----
  if (action.handler === "hotel_frontdesk") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const deal = getLodging("minsu");
    const lux = getLodging("hotel");
    const text = `前台介绍：特惠间 ${deal?.price ?? 40} 元/晚（原民宿档并入），豪华间 ${lux?.price ?? 150} 元/晚；入住期间可另购自助早餐 20 元。`;
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 0.5, [], text, crossedDay);
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
    // v0.992：弹窗展示与实扣一致——会籍按固定价 def.price 扣款（不随通胀缩放）
    if (def) deltas.unshift({ key: "money", label: "金钱", value: -def.price });
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

  // ---- v1.20 街头卖艺：影响力+魅力决定打赏（10-200 元），太低只加属性；极小概率 666 元特殊打赏 ----
  if (actionId === "street_perform") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const fame = state.player.stats.fame;
    const charm = state.player.stats.charm;
    const total = fame + charm;
    let money = 0;
    let verdict: string;
    if (chance(state.rng, 0.015)) {
      money = 666;
      verdict = "人群里突然有人扫码打了 666 元——全场轰动，掌声经久不息！";
    } else if (total >= 30) {
      // v1.25 影响力分档加成打赏（fameIncomeMult）
      money = Math.min(200, Math.round((10 + Math.round(total * 1.5)) * fameIncomeMult(state)));
      verdict = `唱了几首歌，琴盒里多出了 ${money} 元打赏，还有人记住了你的名字。`;
    } else {
      verdict = "围观的人不少，但打赏寥寥——今天只攒了点名气，没收到钱。";
    }
    const eff: Effects = {
      fame: 2,
      mood: 5,
      stress: -5,
      stamina: -12,
      money,
      log: money > 0 ? `街头卖艺赚了 ${money} 元打赏` : "街头卖艺攒了名气，没有收到打赏",
    };
    applyEffects(state, eff, action.icon);
    if (currentWeather(state) === "heatwave") {
      state.player.attrs.stamina = Math.max(0, state.player.attrs.stamina - 3);
    }
    const { crossedDay } = advanceHours(state, action.duration ?? 2);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 2, collectDeltas(eff), verdict, crossedDay);
  }

  // ---- v1.20 图书馆读书：读完弹出书中片段；提升属性的书累计读满 10 次后不再提升 ----
  if (action.handler === "read_book" && action.bookId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const book = getBook(action.bookId);
    if (!book) return { ok: false, reason: "这本书暂时借不到了" };
    const count = bookReadCount(state, book.id);
    state.flags[`book_${book.id}_count`] = count + 1;
    // 摆摊小技巧：每读一次 +1 级（封顶 5 级，每级摆摊收入 +10%），不参与 10 次后无效
    if (book.id === "book_stall_tips") {
      const cur = typeof state.flags["stall_tip_level"] === "number" ? (state.flags["stall_tip_level"] as number) : 0;
      state.flags["stall_tip_level"] = Math.min(5, cur + 1);
    }
    const capped = !!book.attrBook && count >= 10;
    const eff: Effects = capped ? { stamina: book.effects.stamina ?? 0, mood: 2 } : book.effects;
    applyEffects(state, eff, book.icon);
    // 片段随机抽取（记录上次下标，尽量不重复）
    const pool = book.snippets;
    let idx = randomInt(state.rng, 0, pool.length - 1);
    const last = typeof state.flags[`book_${book.id}_last`] === "number" ? (state.flags[`book_${book.id}_last`] as number) : -1;
    if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
    state.flags[`book_${book.id}_last`] = idx;
    const snippet = pool[idx];
    const { crossedDay } = advanceHours(state, book.duration);
    autoExitIfClosed(state);
    state.flags["read_today"] = true; // v1.25：每日目标「阅读一次」
    return done(state, action, book.duration, collectDeltas(eff), snippet, crossedDay);
  }

  // ---- v1.20 便利店盲盒：晚 10 点后 10 元随机两个食物/食材 ----
  if (action.handler === "blind_box") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = -(action.effects.money ?? -10);
    if (state.player.money < price) {
      return { ok: false, reason: `买不起盲盒了（需 ${price} 元）` };
    }
    const { a, b } = rollBlindBox(state);
    addItem(state, a, 1);
    addItem(state, b, 1);
    const defA = getItem(a);
    const defB = getItem(b);
    applyEffects(
      state,
      { money: -price, log: `拆开便利店盲盒，开出了「${defA?.name ?? a}」和「${defB?.name ?? b}」` },
      action.icon,
    );
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 0.5,
      [
        { key: "money", label: "金钱", value: -price },
        { key: "item", label: "盲盒", value: 2 },
      ],
      `盲盒里是「${defA?.name ?? a}」和「${defB?.name ?? b}」，已经装进背包。`,
      crossedDay,
    );
  }

  // ---- v1.4 P2 猫咪养成：喂食 / 清洁 / 玩耍 / 训练（目标猫由 opts.catUid 指定，缺省用携带猫） ----
  // v1.39：在家照顾类动作（喂食/洗澡/玩耍）未携带猫咪时，直接照顾家里第一只猫，免去先携带的麻烦
  if (action.handler === "cat_care" && action.catAction) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const pet = opts?.catUid ? getPet(state, opts.catUid) : activePetOf(state) ?? state.pets[0];
    if (!pet) return { ok: false, reason: "还没有猫咪，先去收养一只吧" };
    let r: CatActionResult;
    switch (action.catAction) {
      case "feed":
        r = feedCat(state, pet);
        break;
      case "clean":
        r = cleanCat(state, pet);
        break;
      case "play":
        r = playWithCat(state, pet);
        break;
      case "train":
        r = trainCat(state, pet, action.trainType ?? "atk");
        break;
      default:
        return { ok: false, reason: "未知的猫咪操作" };
    }
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 0.5, r.deltas ?? [], r.verdict ?? "猫咪照顾好了", crossedDay);
  }

  // ---- v1.4 P2 购买猫咪用品（catItemId → catItems.json，入背包，开销计入周记） ----
  if (action.handler === "buy_cat_item" && action.catItemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = buyCatItem(state, action.catItemId, { size: opts?.catFoodSize });
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 0.5, r.deltas ?? [], r.verdict ?? "购买成功", crossedDay);
  }

  // ---- v1.38 购买饰品（accessoryId → catAccessories.json，入 ownedAccessories） ----
  if (action.handler === "buy_accessory" && action.accessoryId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = buyAccessory(state, action.accessoryId);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 0.5);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 0.5, [], "饰品已入手，在猫咪面板可以佩戴", crossedDay);
  }

  // ---- v1.33 P3 宠物医院：治疗携带猫咪伤势（目标猫由 opts.catUid 指定，缺省用携带猫） ----
  if (action.handler === "treat_injury") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const pet = opts?.catUid ? getPet(state, opts.catUid) : activePetOf(state);
    if (!pet) return { ok: false, reason: "还没有猫咪，先收养一只吧" };
    const r = treatInjury(state, pet);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 1, r.deltas ?? [], r.verdict ?? "治疗完成", crossedDay);
  }

  // ---- v1.39 宠物医院：恢复猫咪生命值（缺省用携带猫，未携带时照顾家里第一只） ----
  if (action.handler === "cat_restore_hp") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const pet = opts?.catUid ? getPet(state, opts.catUid) : activePetOf(state) ?? state.pets[0];
    if (!pet) return { ok: false, reason: "还没有猫咪，先收养一只吧" };
    const r = restoreCatHp(state, pet);
    if (!r.ok) return { ok: false, reason: r.reason };
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 1, r.deltas ?? [], r.verdict ?? "治疗完成", crossedDay);
  }

  // ---- v1.33 P4d 游乐场赛场：进入对决赛（开赛 + 开战，不推进时间） ----
  if (action.handler === "tournament_arena") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = enterTournamentArena(state);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.battleStarted) {
      state.flags["cat_battle_pending"] = true; // GameView 捕获后弹出战斗界面
    }
    const t = state.catTournament?.entry ? getTournamentDef(state.catTournament.entry.tierId) : undefined;
    const oppId = state.catTournament?.entry?.queue[state.catTournament.entry.roundIndex];
    const opp = oppId ? getOpponentDef(oppId) : undefined;
    return {
      ok: true,
      result: {
        actionId: action.id,
        icon: "🏆",
        name: action.name,
        duration: 0,
        deltas: [],
        verdict: `「${t?.name ?? "对决赛"}」开战！对阵${opp?.name ?? "对手"}，连赢 ${state.catTournament?.entry?.queue.length ?? 3} 场即可夺冠`,
      },
    };
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

  // ---- v1.3b9 周末集市特卖：逛集市必遇一件随机商品七五折（写入 flags，由 ev_market_fair_deal 事件弹窗承接购买） ----
  if (actionId === "market_browse") {
    // flags 值类型为 number|boolean：只存 SHOP_CATALOG 索引与价格，名称/图标在结算时反查
    const idx = randomInt(state.rng, 0, SHOP_CATALOG.length - 1);
    const price = Math.round((SHOP_CATALOG[idx].offline * 0.75) / 10) * 10;
    state.flags.fair_deal_idx = idx;
    state.flags.fair_deal_price = price;
    // 强制排队特卖事件（下一次 rollEvent 优先弹出；内联实现避免与 events.ts 循环依赖）
    if (!state.pendingEvents) state.pendingEvents = [];
    if (!state.pendingEvents.includes("ev_market_fair_deal")) state.pendingEvents.push("ev_market_fair_deal");
  }

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
    recordMoney(state, -plan.fare); // v1.215 修复（P1-10）：车费计入周记支出
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
/** v1.38 携带猫咪时禁止进入的地点（医院/工作/洗浴/餐厅/便利店等，促使玩家把猫放家里） */
export const NO_PET_LOCATIONS = new Set([
  "hospital",
  "bathhouse",
  "fast_food",
  "western_restaurant",
  "convenience_store",
  "electronics_factory",
  "logistics_center",
  "steel_factory",
  "glass_factory",
  "aluminum_factory",
  "labor_company",
  "driving_school",
  "training_school",
  "internet_cafe",
  "market",
  "housing_agency",
  "labor_market",
]);

/** 该地点是否禁止携带猫咪进入（UI 据此隐藏猫咪互动入口） */
export function isPetForbiddenLocation(locId: string): boolean {
  return NO_PET_LOCATIONS.has(locId);
}

/** 携带猫咪进入禁止场所时的拦截提示 */
function petCarryBlockReason(state: GameState, loc: LocationDef): string | null {
  const pet = activePetOf(state);
  if (!pet || loc.id === "home") return null;
  if (NO_PET_LOCATIONS.has(loc.id)) {
    // v1.395 修正文案：禁猫场所「送回家」按钮在非 home 时禁用，指引要点回家后操作
    return `你还带着「${pet.name}」，这类地方不方便带猫咪进入。先回家，再在猫咪面板点「送回家」把它留在家里`;
  }
  return null;
}

function enterLocation(state: GameState, loc: LocationDef): CheckResult {
  if (loc.locked) return { ok: false, reason: "暂未开放" };

  // v1.38 携带猫咪时，部分场所禁止进入（促进默认把猫放家里）
  const carry = petCarryBlockReason(state, loc);
  if (carry) return { ok: false, reason: carry };

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
  if (!loc) return { ok: false, reason: "未知地点" };
  const r = enterLocation(state, loc);
  maybeMeetNpc(state, targetId); // v0.99 偶遇：进入地点按 NPC meetChance 建立关系
  return r;
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
