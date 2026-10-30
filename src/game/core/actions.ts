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
import {financialRiskAccess} from './financialRisk';
import type {
  ActionDef,
  ActionRequirements,
  ActionResult,
  Effects,
  Facility,
  GameState,
  IntercityTicket,
  LocationDef,
  ResultDelta,
  SkillKey,
  StatusId,
} from "../types";
import actionsData from "../data/actions.json";
import {cityHotelGuest} from './cityHotels';
import {rollStreetBargain} from './streetBargains';
import {INTERIOR_ACTIONS,isSofaAction} from '../data/interiorActivities';
import {bestHomeItem} from './homeFurniture';
import locationsData from "../data/locations.json";
import { recordRemasterAction } from "../data/npcDialogueRemaster";

import { applyEffects, collectDeltas, pickVerdict, pushLog, triggerCollapse } from "../engine";
import { advanceHours } from "./time";
import { beginStreetPerformance, pendingStreetPerformance, streetPerformanceCheck } from './streetPerformance';
import { fromLinearDay, gameDay, isWeekend, linearDay, WEEKDAY_LABEL, weekdayOf } from "./calendar";
import { scaleCost } from "./difficulty";
import { currentWeather, isRainy } from "./weather";
import { getMaxStamina } from "./stats";
import { guardCollapse } from "./fatigue";
import { reconcileStatuses, hasStatus, STATUS_NAMES } from "./statuses";
import { canWork, guardSurvival, isDepressed, cureDepression } from "./survival";
import { buyProperty, canSleepHere, currentRegion, getLodging, hasFacility, hasOwnedProperty, selectLodging, signLease } from "./housing";
import { currentResidence, isResidenceLocation, residenceLocationId, isResidenceBuildingVisible, hasTempleStay, hasWorkerDormStay, grantWorkerDormStay } from "./residence";
import {FIXED_STAY_ITEMS} from "./homeStay";
  import { addItem, applyItem, getItem, itemCount } from "./items";
import { clothingVendor, isClothingItem, onEnterClothingLocation, checkoutClothing } from "./clothing";
import { canStoreInFridge, hasFridge, installFridge, canInstallFridge, FRIDGE_TIERS, isCookingItem, routeCookingPurchase } from "./fridge";
import {isFacilityProduct,productRepeatable,productFamily,productOwnershipReason,shoppingDuration,type ShoppingLine} from './facilityShopping';
import { recordFoodEaten, recordLocationVisited } from "./achievements";
import { getRecipe, recipeList } from "./cooking";
import { buyMembership, isMembershipActive, membershipDaysLeft, MEMBERSHIPS } from "./membership";
import { buyVehicle, rentVehicle, returnVehicle, VEHICLE_NAMES } from "./vehicle";
import { recordMoney } from "./weekly"; // v1.215：车费等裸扣款计入周记（P1-10）
import { checkProjectRequirements, getProject, isProjectDone, isStallProject, workOnProject, endNetbarSession, hasLaptop } from "./projects";
import { SHOP_CATALOG } from "./shop";
import { BOOK_READING_CLOSINGS, getBook, bookReadCount } from "../data/books";
import { randomInt } from "../rng";
import { getWorkShift, resignJob } from "./career";
import { formatDuration } from "./quests";
import { maybeMeetNpc, npcDisplayName } from "./romance";
import { ensureRelationship, addAffinity, findRelationship } from "./relationships";
import { allNpcs, npcAtLocation } from "./npcs";
import { npcOrdinaryAppearanceUnlocked } from '../data/npcIntroductionProgress';
import { refreshLaborMarket, getJobDef, performWageAction, recordWageActionCompletion, skillCertificateWageMultiplier, resolveVehicle } from "./jobs";
import { isReferred } from "./contacts";
import { afterChurchCatechumen, afterChurchMass, afterChurchMeal, afterChurchGospelBox, afterTempleVolunteer, religionBlockReason } from "./religion";
import { enterRegion, getRegion, goToMap, isRegionUnlocked, locationsOfRegion, regionPathOf, topRegionOf, regionLockReason } from "./regions";
import { checkDistrictService, performDistrictService, isDistrictService } from "./districtServices";
import {
  boardIntercityTicket,
  buyIntercityTicket,
  counterpartStationOf,
  developmentBusPlan as previewDevelopmentBus,
  expireMissedTicket,
  formatDeparture,
  hoursLabel,
  isDevelopmentRoute,
  networkTransitPlan as previewNetworkTransit,
  planLabel,
  planTransit,
  privateIntercityPlan,
  type IntercityMode,
  type NetworkTransitPlan,
  type DevelopmentBusPlan,
  type TicketOperation,
  type TransitPlan,
  type TransitTier,
} from "./transit";
import { AUTO_FEEDER_ITEM_ID, availableCatsOf, activePetOf, getPet, feedCat, cleanCat, playWithCat, trainCat, buyCatItem, treatInjury, restoreCatHp, type CatActionResult } from "./catCare";
import { adoptSmallPet, checkupSmallPet, comfortSmallPet, feedSmallPet } from "./smallPets";
import { buyAccessory } from "./catAccessory";
import { getTournamentDef, getOpponentDef } from "./catBattle"; // v1.4 P4 对决信息查询
import { enterTournamentArena } from "./tournament"; // v1.33 P4d 游乐场赛场进入对决赛
import { SKILL_NAMES } from "../../lib/icons"; // v1.33-hotfix：收益标签的技能中文名（纯常量表，无 DOM）
import { formatMoney } from "../../lib/format"; // v1.33-hotfix：金额展示与 UI 保持一致（纯函数，无 DOM）

/* ------------------------------------------------------------------ *
 * 数据与索引
 * ------------------------------------------------------------------ */

export const LOCATIONS: LocationDef[] = locationsData as LocationDef[];
export const ACTIONS: ActionDef[] = [...actionsData as ActionDef[], ...INTERIOR_ACTIONS];

/** Keep action admission independent of rendering plans and their startup indexes. */
function homeSofaAvailable(state:GameState):boolean {
  const fixed=FIXED_STAY_ITEMS[currentResidence(state).id];
  return fixed?!!fixed.sofa:!!bestHomeItem(state,'sofa');
}

const actionMap = new Map<string, ActionDef>(ACTIONS.map((a) => [a.id, a]));
const locationMap = new Map<string, LocationDef>(LOCATIONS.map((l) => [l.id, l]));
const WORK_WAGE_ACTIONS = new Set([
  "internet_night_job",
  "boyue_internet_night_job",
  "market_help_stand",
  "steel_shift",
  "glass_quality_shift",
  "aluminum_recycle_shift",
  "bus_station_gig",
  "development_bus_station_gig",
]);

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
// v1.43：网吧「上网打游戏」已改造为「上机」（付费上机、不再直接消耗体力），故从高耗清单移除。
export const HIGH_COST_ACTIONS = new Set<string>(["exercise_gym", "exercise_park", "boyue_exercise_gym", "treasure_lake_run", "boyue_football_run", "moon_hike"]);

/** 星期 key（与 ActionRequirements.weekday / JobDef.restDays 同格式） */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** 堂食额外耗时（小时）：在店里吃比打包多花的时间 */
export const DINE_IN_EXTRA_HOURS = 0.5;

/** 单次等待上限（小时） */
export const WAIT_MAX_HOURS = 12;
/** 智能档（等到开门）可用的最大缺口小时数：只要当天还有开门时刻（缺口 ≤ 该值）就提供这一档，
 *  即使缺口超过 WAIT_MAX_HOURS 也允许——它本质是"等到指定时刻"，不受单次上限绑死。 */
export const SMART_WAIT_HOURS_CAP = 18;
/** 提前到岗候场窗口（小时）：距开门 ≤ 该值可提前抵达等候 */
export const EARLY_ARRIVAL_WINDOW = 2;
/** 干等每小时的心情惩罚 */
export const WAIT_MOOD_PER_HOUR = -1;
/** 单次等待的心情惩罚上限（绝对值）：避免长等待把心情直接打崩 */
export const WAIT_MOOD_CAP = 4;

/** 小睡可用时段（小时）：07:00–22:00（v1.43 放宽，原 10:00–18:00） */
export const NAP_WINDOW_START = 7;
export const NAP_WINDOW_END = 22;
/** 当前小时是否处于小睡可用窗口（纯函数，供 UI 与测试复用） */
export function napWindowOpen(hour: number): boolean {
  return hour >= NAP_WINDOW_START && hour <= NAP_WINDOW_END;
}

export function getLocation(id: string): LocationDef | undefined {
  return locationMap.get(id);
}

/** 周末夜场以开始营业的夜晚判定星期，凌晨仍属于前一晚。 */
function weekendNightOpen(state: GameState, hour = state.time.hour + state.time.minute / 60): boolean {
  if (hour >= 6 && hour < 18) return false;
  const nightDate = hour < 6 ? fromLinearDay(linearDay(state.time) - 1) : state.time;
  return isWeekend(nightDate);
}

function isNightVenue(loc: LocationDef | undefined): boolean {
  return !!loc && loc.id.startsWith("boyue_") && loc.openHours?.start === 18 && loc.openHours.end === 6;
}

/** 地图和实际进入共用的可见性；周末夜场在其它日期与日间完全隐藏。 */
export function isLocationVisible(state: GameState, locationOrId: string | LocationDef | undefined): boolean {
  const loc = typeof locationOrId === "string" ? getLocation(locationOrId) : locationOrId;
  if (loc?.id.startsWith('company_office_') && (!state.company || state.company.status==='closed' || ['dev_incubator','company_office_single','company_office_large','company_office_floor'][state.company.stage - 1] !== loc.id)) return false;
  if (!loc || !isResidenceBuildingVisible(state, loc.id)) return false;
  if (loc.weekendNightOnly) return weekendNightOpen(state);
  return !loc.weekendOnly || isWeekend(state.time);
}

/** Map destinations can be child regions or facilities; region portals must reach region travel checks. */
export function isNavigationTargetVisible(state: GameState, targetId: string): boolean {
  return !!getRegion(targetId) || isLocationVisible(state, targetId);
}

/** 预计抵达的完整日期与分钟，避免跨午夜营业规则借用出发日。 */
function stateAfterTravel(state: GameState, hours: number): GameState {
  const totalMinutes = state.time.hour * 60 + state.time.minute + Math.round(hours * 60);
  const minuteOfDay = totalMinutes % 1440;
  return { ...state, time: { ...state.time, ...fromLinearDay(linearDay(state.time) + Math.floor(totalMinutes / 1440)),
    hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 } };
}

/** 路线解锁后的地点可进入性（旧地点 locked=true 且无 flag 仍保持锁定）。 */
export function isLocationUnlocked(state: GameState, loc: LocationDef | undefined): boolean {
  if (loc?.id.startsWith('company_office_') && !isLocationVisible(state, loc)) return false;
  if (loc && !isResidenceBuildingVisible(state, loc.id) && loc.id !== "home") return false;
  if (loc && ["dev_university", "boyue_engineering_college"].includes(loc.id) && state.flags.item_student_pass !== true) return false;
  if (loc?.regions?.length && !loc.regions.some(id => isRegionUnlocked(state, getRegion(id)))) return false;
  if (!loc?.locked) return true;
  return !!loc.unlockFlag && state.flags[loc.unlockFlag] === true;
}

export function locationLockReason(state: GameState, loc: LocationDef | undefined): string {
  if (loc && ["dev_university", "boyue_engineering_college"].includes(loc.id) && state.flags.item_student_pass !== true) return "需要学生通行证";
  const lockedRegion = loc?.regions?.map(getRegion).find(r => !isRegionUnlocked(state, r));
  return lockedRegion ? regionLockReason(state, lockedRegion) : loc?.unlockFlag ? "路线尚未解锁，请先办理对应通行证" : "尚未开放";
}

export function getAction(id: string): ActionDef | undefined {
  return actionMap.get(id);
}

/** v1.3b2 便利店盲盒抽奖池（供盲盒行动与便利店下班随机福利共用） */
const BLIND_BOX_POOL = ["bento", "noodles", "sandwich", "salad", "drink", "cabbage", "pork", "fruit", "farm_egg", "farm_milk"];
/** 随机抽取盲盒两个内容（互不相同） */
export function rollBlindBox(state: GameState): { a: string; b: string } {
  let a = BLIND_BOX_POOL[randomInt(state.rng, 0, BLIND_BOX_POOL.length - 1)];
  let b = BLIND_BOX_POOL[randomInt(state.rng, 0, BLIND_BOX_POOL.length - 1)];
  if (BLIND_BOX_POOL.length > 1 && b === a) b = BLIND_BOX_POOL[(BLIND_BOX_POOL.indexOf(b) + 1) % BLIND_BOX_POOL.length];
  return { a, b };
}

// Historical IDs remain recognizable to old saves, but all home cooking must
// go through the workbench's equipment, ingredient and quality checks.
const LEGACY_HOME_COOK_ACTIONS = new Set([
  'eat_noodles_home', 'cook_practice_home', 'cook_dish_veg', 'cook_dish_salad',
  'cook_dish_meat', 'cook_full_meal', 'cook_steak_home',
]);
const LEGACY_COOK_REASON = '请在厨房打开正式烹饪工作台';
function isLegacyCookAction(action: ActionDef): boolean {
  return LEGACY_HOME_COOK_ACTIONS.has(action.id) || action.handler === 'cook_item';
}

/** 某地点下的全部行动 */
export function actionsOf(locationId: string): ActionDef[] {
  return actionsAtLocation(locationId);
}

/**
 * v1.4：宠物用品店/宠物医院的旧行动 id 保留，但入口迁入花鸟市场。
 * 原始配置不改，避免猫咪旧逻辑和旧测试丢失；UI 与新地图统一通过此索引读取。
 */
export function actionsAtLocation(locationId: string): ActionDef[] {
  return ACTIONS.filter((a) => {
    // v1.44：NPC 由场景里的「这里的人」按作息进入对话，不再显示泛化的搭话行动卡。
    if (a.handler === "meet_someone") return false;
    if (a.locationId === locationId) return true;
    if (locationId !== "flower_market") return false;
    return a.locationId === "pet_store" || a.locationId === "pet_hospital";
  });
}

/** 场景面板可见行动：隐藏未开放占位入口和未开放住房，并按日历过滤周末摊位。 */
export function visibleActionsAtLocation(state: GameState, locationId: string): ActionDef[] {
  const weekday = weekdayOf(state.time);
  const atResidence = isResidenceLocation(state, locationId);
  const buildingId = locationId === "home" ? residenceLocationId(state) : locationId;
  const native = actionsAtLocation(buildingId).filter((a) =>
    !atResidence || !["stay_hotel", "sign_lease", "buy_property"].includes(a.handler ?? ""));
  const actions = atResidence ? [...actionsAtLocation("home"), ...native] : native;
  return actions.filter((a) => {
    if (isLegacyCookAction(a)) return false;
    if(a.locationId==='home'&&isSofaAction(a.id)&&!homeSofaAvailable(state))return false;
    if (a.handler === "district_placeholder") return false;
    return !a.weekendOnly || weekday === 4 || weekday === 5 || weekday === 6;
  });
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
  // Keep the action-card money tag in lockstep with inflatedEffects(), which
  // applies the existing economy price index and then any eligible discount.
  if (state && typeof base.money === "number") {
    return effectTagsOf(inflatedEffects(state, action));
  }
  return effectTagsOf(base);
}

/* ------------------------------------------------------------------ *
 * 营业时间
 * ------------------------------------------------------------------ */

/** 该地点在 hour 点是否营业（end 不含；start>end 支持跨夜；缺省=全天） */
export function isLocationOpen(loc: LocationDef | undefined, hour: number, state?: GameState): boolean {
  if (!loc) return false;
  if (loc.weekendNightOnly && (!state || !weekendNightOpen(state, hour))) return false;
  if (loc.weekendOnly && state && !isWeekend(state.time)) return false;
  if (!loc.openHours) return true;
  const { start, end } = loc.openHours;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** 营业阶段：open=营业中 / before=还没开门 / after=已打烊 */
export function locationOpenPhase(
  loc: LocationDef | undefined,
  hour: number,
  state?: GameState,
): "open" | "before" | "after" {
  if (loc?.weekendNightOnly && (!state || !weekendNightOpen(state, hour))) {
    return state && isWeekend(state.time) && hour >= 6 && hour < 18 ? "before" : "after";
  }
  if (loc?.weekendOnly && state && !isWeekend(state.time)) return "after";
  if (!loc || !loc.openHours || isLocationOpen(loc, hour, state)) return "open";
  const { start, end } = loc.openHours;
  if (start < end) return hour < start ? "before" : "after";
  // 跨夜营业：比较"距开门"与"距打烊"哪个更近
  const toOpen = (start - hour + 24) % 24;
  const sinceClose = (hour - end + 24) % 24;
  return toOpen <= sinceClose ? "before" : "after";
}

/** 打烊原因文案（营业中返回空串） */
export function closedReason(loc: LocationDef | undefined, hour: number, state?: GameState): string {
  const phase = locationOpenPhase(loc, hour, state);
  if (phase === "open") return "";
  if (loc?.weekendNightOnly) return "仅周六、周日 18:00 至次日 06:00 开放";
  if (loc?.weekendOnly && state && !isWeekend(state.time)) return "仅周末开放";
  const oh = loc?.openHours;
  if (!oh) return "该地点已打烊";
  return phase === "before"
    ? `还没开门（${oh.start}:00 开门，${oh.end}:00 关门）`
    : `已经打烊（次日 ${oh.start}:00 开门）`;
}

/** 距离开门还有几小时（已营业返回 0，保留两位小数） */
export function hoursUntilOpen(loc: LocationDef | undefined, hour: number, minute = 0, state?: GameState): number {
  if (!loc?.openHours) return 0;
  const now = hour + minute / 60;
  if (isLocationOpen(loc, now, state)) return 0;
  if (loc.weekendNightOnly) {
    if (!state) return Infinity;
    for (let days = 0; days <= 7; days++) {
      const date = fromLinearDay(linearDay(state.time) + days);
      if (isWeekend(date) && days * 24 + 18 > now) return days * 24 + 18 - now;
    }
    return Infinity;
  }
  const wait = (loc.openHours.start - now + 24) % 24;
  return Math.round(wait * 100) / 100;
}

/** v0.935：未开门但距开门 ≤ EARLY_ARRIVAL_WINDOW，可提前抵达候场 */
export function canArriveEarly(loc: LocationDef | undefined, hour: number, state?: GameState): boolean {
  if (loc?.weekendNightOnly || isNightVenue(loc)) return isLocationOpen(loc, hour, state);
  if (loc?.weekendOnly && state && !isWeekend(state.time)) return false;
  if (!loc?.openHours || isLocationOpen(loc, hour, state)) return true;
  if (locationOpenPhase(loc, hour, state) !== "before") return false;
  return hoursUntilOpen(loc, Math.floor(hour), (hour % 1) * 60, state) <= EARLY_ARRIVAL_WINDOW;
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

/** 按整分钟等待（1 分钟 ~ max；max 默认 WAIT_MAX_HOURS）。智能档可放开上限。 */
export function waitHere(state: GameState, hours: number, opts?: { max?: number }): WaitResult {
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  const cap = opts?.max ?? WAIT_MAX_HOURS;
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(cap) || cap < 1 / 60)
    return { ok: false, reason: "请选择有效的等待时长" };
  const minutes = Math.max(1, Math.round(Math.min(hours, cap) * 60));
  const h = minutes / 60;
  if (state.flags.hospitalized) return { ok: false, reason: "正在住院，安心养病吧" };
  const waitingLocation = getLocation(state.locationId);
  if ((waitingLocation?.weekendNightOnly || isNightVenue(waitingLocation))
    && !isLocationOpen(waitingLocation, state.time.hour + state.time.minute / 60, state)) {
    return { ok: false, reason: closedReason(waitingLocation, state.time.hour, state) };
  }
  if (state.player.attrs.stamina <= 0) {
    return { ok: false, reason: "已经站不住了，先找地方休息" };
  }
  // v0.99 修复：按小时比例取整（向零）——30 分钟等待不再误扣 1 点心情（原 Math.round(0.5)=1）
  // v1.43：单次等待心情惩罚封顶（默认最多 -WAIT_MOOD_CAP），避免长等待直接打崩心情。
  const rawMood = Math.trunc(h * WAIT_MOOD_PER_HOUR);
  const moodDelta = Math.max(rawMood, -WAIT_MOOD_CAP);
  const eff: Effects = moodDelta ? { mood: moodDelta } : {};
  applyEffects(state, eff);
  advanceHours(state, h);
  if (waitingLocation?.weekendNightOnly || isNightVenue(waitingLocation)) autoExitIfClosed(state);
  reconcileStatuses(state);
  const label = formatDuration(h);
  const moodText = moodDelta < 0 ? `，消耗了 ${-moodDelta} 点心情` : "";
  pushLog(state, "⏳", `你在原地等了 ${label}${moodText}`);
  return {
    ok: true,
    result: {
      actionId: "wait_here",
      icon: "⏳",
      name: `等待 ${label}`,
      duration: h,
      deltas: collectDeltas(eff),
      // v1.43.1：有心情消耗时必须明确说明（不能靠随机文案碰运气），
      // 无消耗时才随机挑选中性文案。
      verdict: moodDelta < 0
        ? `干等着也是熬，耗了 ${-moodDelta} 点心情`
        : pickVerdict(state, [
          "时间一点点过去了",
          "无所事事地看着人来人往",
          "干等着也是熬",
        ]),
    },
  };
}

/** 常用等待档包含 1、5 分钟，以及等到开门 / 上班的智能档。 */
export function waitOptions(state: GameState): WaitOption[] {
  const tiers: WaitOption[] = [
    { hours: 1 / 60, label: "等 1 分钟" },
    { hours: 5 / 60, label: "等 5 分钟" },
    { hours: 0.5, label: "等 30 分钟" },
    { hours: 1, label: "等 1 小时" },
    { hours: 2, label: "等 2 小时" },
    { hours: 3, label: "等 3 小时" },
    { hours: 6, label: "等 6 小时" },
    { hours: 12, label: "等 12 小时" },
  ];

  const locId = state.locationId;
  if (locId && locId !== "map") {
    const loc = getLocation(locId);
    if ((loc?.weekendNightOnly || isNightVenue(loc)) && !isLocationOpen(loc, state.time.hour, state)) return [];
    if (loc && locationOpenPhase(loc, state.time.hour, state) === "before") {
      const need = hoursUntilOpen(loc, state.time.hour, state.time.minute, state);
      // v1.43：智能档与单次上限解耦——只要当天还有开门时刻（缺口 ≤ SMART_WAIT_HOURS_CAP）就提供，
      // 即使缺口超过 WAIT_MAX_HOURS 也允许这一档（它本质是"等到指定时刻"，waitHere 会放开上限）。
      if (need > 0 && need <= SMART_WAIT_HOURS_CAP) {
        tiers.unshift({ hours: need, label: `等到 ${loc.openHours?.start}:00 开门`, smart: true });
      }
    }
    const job = state.career.jobId ? getJobDef(state.career.jobId) : undefined;
    if (job?.locationId === locId) {
      const shift = getWorkShift(state, job);
      const needMinutes = shift.startMinute - (gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute);
      if (shift.phase === "early" && needMinutes > 0 && needMinutes <= SMART_WAIT_HOURS_CAP * 60) {
        const clockMinute = shift.startMinute % 1440;
        const clock = `${String(Math.floor(clockMinute / 60)).padStart(2, "0")}:${String(clockMinute % 60).padStart(2, "0")}`;
        tiers.unshift({ hours: needMinutes / 60, label: `等到 ${clock} 上班`, smart: true });
      }
    }
    return tiers;
  }

  // 区域视图：找该区内最快开门的地点
  if (state.region) {
    let best: { need: number; loc: LocationDef } | undefined;
    for (const loc of locationsOfRegion(state.region)) {
      if (loc.locked || !isLocationVisible(state, loc) || locationOpenPhase(loc, state.time.hour, state) !== "before") continue;
      const need = hoursUntilOpen(loc, state.time.hour, state.time.minute, state);
      if (need > 0 && need <= SMART_WAIT_HOURS_CAP && (!best || need < best.need)) {
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
  if (req?.notFlags?.some((flag) => state.flags[flag])) {
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
      const reason = req.flagAtLeast.flag === "temple_volunteered"
        ? "需先在寺庙做过义工并获得允许"
        : req.flagAtLeast.flag === "industrial_dorm_qualified"
          ? "需先完成重工业区任一工厂班次，取得工人集体宿舍资格"
        : "尚未满足所需条件";
      return { ok: false, reason };
    }
  }

  if (req?.oncePerDay) {
    const raw = state.flags[req.oncePerDay];
    if (typeof raw === "number" && raw === gameDay(state.time)) {
      return { ok: false, reason: "今天已经做过一次了，明天再来吧" };
    }
  }

  if (req?.dailyLimit) {
    const { dayFlag, countFlag, limit } = req.dailyLimit;
    const used = state.flags[dayFlag] === gameDay(state.time) ? Number(state.flags[countFlag] ?? 0) : 0;
    if (Number.isFinite(limit) && limit > 0 && used >= limit) {
      return { ok: false, reason: `今天最多${limit}次，明天再来吧` };
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
  if (isLegacyCookAction(action)) return { ok: false, reason: LEGACY_COOK_REASON };
  if (action.id === "municipal_apply_student_pass" && state.flags.item_student_pass) {
    return { ok: false, reason: "已持有学生通行证" };
  }
  if (action.id === "municipal_apply_industry_pass") {
    if (state.flags.route_heavy_industry) return { ok: false, reason: "已持有工业通行证" };
    if (Number(state.flags.jobs_done_count ?? 0) < 2) return { ok: false, reason: `需完成两次工作（已完成 ${Number(state.flags.jobs_done_count ?? 0)} 次）` };
  }
  if(isSofaAction(action.id)&&action.locationId==='home'){
    if(!canSleepHere(state))return {ok:false,reason:'请先回到当前入住的住处休息'};
    if(!homeSofaAvailable(state))return {ok:false,reason:'当前住处没有沙发'};
  }
  if (pendingStreetPerformance(state)) return { ok: false, reason: '请先完成本次街头演出' };
  if (action.id === 'street_perform') {
    const performance = streetPerformanceCheck(state);
    if (!performance.ok) return performance;
  }
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if(['mooncourt_dining','hotel_resident_dining'].includes(action.id)&&!cityHotelGuest(state))return {ok:false,reason:'请先入住本酒店，住客用餐包含在房费中'};
  if (["dev_incubator", "dev_university", "boyue_engineering_college"].includes(action.locationId)
    && !isLocationUnlocked(state, getLocation(action.locationId))) {
    return { ok: false, reason: locationLockReason(state, getLocation(action.locationId)) };
  }
  if (action.handler === "train_study" && state.flags[`trained_${gameDay(state.time)}`]) {
    return { ok: false, reason: "今天已经上过课了，明天再来；课程进度会保留在卡片上" };
  }
  if (isDistrictService(action)) {
    const check = checkDistrictService(state, action);
    if (!check.ok) return check;
  }
  if (action.handler === "sleep_modal" && !canSleepHere(state)) {
    return {
      ok: false,
      reason: state.flags["hospitalized"] ? "住院期间只能在医院休息" : "请先回到当前入住的住宿再休息",
    };
  }
  if (WORK_WAGE_ACTIONS.has(action.id)) {
    const workAdmission = canWork(state);
    if (!workAdmission.ok) return workAdmission;
  }
  if (["church_meal", "church_gospel_box"].includes(action.id)) {
    if (state.locationId !== "church") return { ok: false, reason: "请先前往教堂" };
    const blocked = religionBlockReason(state, "church");
    if (blocked) return { ok: false, reason: blocked };
    const dailyFlag = action.id === "church_meal" ? "church_meal_day" : "church_gospel_box_day";
    if (state.flags[dailyFlag] === gameDay(state.time)) return { ok: false, reason: action.id === "church_meal" ? "今天已经参加过聚餐，明天再来吧" : "今天已经抽过福音，明天再来吧" };
  }
  if (action.id === "sign_driving_course") {
    if (state.flags.item_driving_license) return { ok: false, reason: "你已经取得驾驶证，无需再次报名" };
    if (state.flags.item_driving_course) return { ok: false, reason: "你已报名学车，请直接参加驾照考试，不必重复缴报名费" };
  }
  if (action.id === "driving_exam") {
    if (state.flags.item_driving_license) return { ok: false, reason: "你已经取得驾驶证，无需重复考试" };
    if (!state.flags.item_driving_course) return { ok: false, reason: "请先报名学车，再参加驾照考试" };
    const intelligence = state.player.stats.intelligence;
    if (intelligence < 40) return { ok: false, reason: `智力不足（需 40，当前 ${intelligence}）；先去图书馆学习后再考试` };
  }
  if (["temple_lodging", "temple_vegetarian"].includes(action.id) && !hasTempleStay(state)) {
    return { ok: false, reason: "请先完成寺庙义工，取得禅房住宿资格" };
  }
  if (action.housingId === "worker_dorm" && !hasWorkerDormStay(state)) {
    return { ok: false, reason: "完成工厂班次后可直接入住重工业工人集体宿舍" };
  }
  if (action.locationId === "home" && !isResidenceLocation(state)
    && !(action.handler === "sleep_modal" && canSleepHere(state))) {
    return { ok: false, reason: "请先前往当前入住的住宿，再使用居家功能" };
  }
  if (action.handler === "sign_lease" && hasOwnedProperty(state)) {
    return { ok: false, reason: "已有产权住房，不能再签普通租约" };
  }
  if (action.handler === "buy_item" && action.itemId) {
    const item = getItem(action.itemId);
    if(item?.homeSurface&&(state.inventory[action.itemId]??0)>0)return {ok:false,reason:'已经拥有这款材料，可以回家更换'};
    if (isClothingItem(item) && clothingVendor(item) !== action.locationId) {
      return { ok: false, reason: "这家店不出售这件服装" };
    }
  }
  if (action.handler === "buy_cat_item" && action.catItemId === AUTO_FEEDER_ITEM_ID) {
    if (state.pets.length === 0) return { ok: false, reason: "先领养至少一只猫咪，才能购买自动照料机" };
    if (itemCount(state, AUTO_FEEDER_ITEM_ID) > 0) {
      return { ok: false, reason: "已经有一台自动照料机了，无需重复购买" };
    }
  }
  if (action.handler === "buy_item" && ["fishing_rod", "fishing_bucket"].includes(action.itemId ?? "")
    && (state.flags[`${action.itemId}_owned`] || itemCount(state, action.itemId!) > 0)) {
    return { ok: false, reason: action.itemId === "fishing_rod" ? "已经有鱼竿了，无需重复购买" : "已经有鱼桶了，无需重复购买" };
  }
  const readingBook = action.handler === "read_book" && !!action.bookId;
  const readingBorrowedBookAtHome =
    readingBook && isResidenceLocation(state) && itemCount(state, action.bookId!) > 0;
  const homeService = action.locationId === "home" && isResidenceLocation(state);
  const sleepAtCurrentLodging = action.handler === "sleep_modal" && canSleepHere(state);
  const petFacilityAtFlowerMarket = state.locationId === "flower_market"
    && ["pet_store", "pet_hospital"].includes(action.locationId ?? "");
  if (action.locationId && state.locationId !== action.locationId && !petFacilityAtFlowerMarket && !homeService && !readingBorrowedBookAtHome && !sleepAtCurrentLodging) {
    return { ok: false, reason: "请先前往对应地点再进行此操作" };
  }
  if (readingBook && state.locationId !== action.locationId && !readingBorrowedBookAtHome) {
    return { ok: false, reason: "请在图书馆阅读，或借回家中再读" };
  }
  // 借阅的图书可在家中阅读，属性、时间和读书次数仍走原 read_book 结算。
  const loc = getLocation(readingBorrowedBookAtHome ? "home" : action.locationId);
  if (!isLocationUnlocked(state, loc)) {
    return { ok: false, reason: locationLockReason(state, loc) };
  }
  if (!isLocationOpen(loc, state.time.hour + state.time.minute / 60, state)) {
    return { ok: false, reason: closedReason(loc, state.time.hour, state) || "该地点已打烊" };
  }

  if (action.requiresFacility && !hasFacility(state, action.requiresFacility)) {
    return { ok: false, reason: `当前住处没有${FACILITY_NAME[action.requiresFacility]}` };
  }
  if(action.id==='exercise_home_equip'){
    const fixed=FIXED_STAY_ITEMS[currentResidence(state).id];
    if(fixed&&!fixed.gym)return {ok:false,reason:'当前客房没有健身器材，家中的器材不能在这里使用'};
  }

  // 先检查每日限次，再检查项目食材；否则同日第二次点击摆摊会先报“缺食材”，
  // 把真正的业务限制掩盖掉，也让有足够食材的存档可以绕过日限。
  if (action.requirements?.oncePerDay) {
    const raw = state.flags[action.requirements.oncePerDay];
    if (typeof raw === "number" && raw === gameDay(state.time)) {
      return { ok: false, reason: "今天已经做过一次了，明天再来吧" };
    }
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
    // 项目自身的食材需求不能只等到执行时才报错，否则行动卡看似可用，
    // 点击后才失败；摆摊缺料由界面据此打开预制料理包购买弹窗。
    if (proj?.needs) {
      const projectCheck = checkProjectRequirements(state, proj);
      if (!projectCheck.ok) return projectCheck;
    }
  }

  // v1.20 摆摊小车：拥有小车可免除摆摊类行动的厨艺门槛
  if (action.handler === "work_project" && ["snack_stall", "street_stall", "market_stall"].includes(action.projectId ?? "") && state.flags["item_stall_cart"]) {
    const req = action.requirements ? { ...action.requirements, skill: undefined } : action.requirements;
    const result = HIGH_COST_ACTIONS.has(action.id) && state.player.attrs.stamina <= 0
      ? checkRequirements(state, req, { skipAttr: true })
      : checkRequirements(state, req);
    if (!result.ok) return result;
    return affordableActionResult(state, action);
  }

  // 高消耗行动体力归零：跳过属性门槛，交给 guardCollapse 触发晕倒
  const result = HIGH_COST_ACTIONS.has(action.id) && state.player.attrs.stamina <= 0
    ? checkRequirements(state, action.requirements, { skipAttr: true })
    : checkRequirements(state, action.requirements);
  if (!result.ok) return result;
  return affordableActionResult(state, action);
}

/* ------------------------------------------------------------------ *
 * 行动执行
 * ------------------------------------------------------------------ */

/** 堂食 / 打包 */
export type DineMode = "eat" | "pack";

export interface PerformOptions {
  dine?: DineMode;
  /** 购物车内部使用：先结算多件商品，再统一推进一次游戏时间。 */
  deferTime?: boolean;
  /** v1.4 P2 猫咪操作：目标猫 uid（缺省用当前携带猫 activePet） */
  catUid?: string;
  /** v1.4 花鸟市场：目标小宠物 uid */
  smallPetUid?: string;
  /** v1.38 猫粮打包购买：小/中/大包 */
  catFoodSize?: "small" | "medium" | "large";
}

/**
 * 计算行动实际推进的基础时长，供界面预告与结算共用。
 * 购买熟食时默认按打包计算；堂食额外增加 DINE_IN_EXTRA_HOURS。
 */
export function actionDurationHours(action: ActionDef, options?: Pick<PerformOptions, "dine">): number {
  if (action.handler === "buy_food" || action.handler === "buy_fresh") {
    // 购买本身不推进时间；只有选择堂食时才计算用餐时间。
    const base = action.duration ?? 0;
    return base + (options?.dine === "eat" ? DINE_IN_EXTRA_HOURS : 0);
  }
  if (action.handler === "cook_item" && action.recipeId) {
    return getRecipe(action.recipeId)?.duration ?? action.duration ?? 1;
  }
  if (action.handler === "read_book" && action.bookId) {
    return getBook(action.bookId)?.duration ?? action.duration ?? 1;
  }
  return action.duration ?? 1;
}

export interface PerformResult {
  ok: boolean;
  reason?: string;
  crossedDay?: boolean;
  result?: ActionResult;
}

/** 通胀后的效果（仅金钱受物价指数影响；v1.3b2 叠加限时折扣） */
function inflatedEffects(state: GameState, action: ActionDef): Effects {
  if(action.id==='eat_simple_meal_home')return {...action.effects,money:-5};
  const inflated = scaleCost(state, action.effects?.money ?? 0);
  return { ...(action.effects ?? {}), money: discountPrice(state, action, inflated) };
}

/** 当前地点购买行动的实际实扣金额（含物价与限时折扣），供采购清单预览共用。 */
export function purchasePriceOf(state: GameState, action: ActionDef): number {
  const tier=action.itemId?getItem(action.itemId)?.fridgeTier:undefined;
  if(tier)return canInstallFridge(state,tier).price??Math.max(0,FRIDGE_TIERS[tier].price-(state.fridge?.tier?FRIDGE_TIERS[state.fridge.tier].price:0));
  return Math.abs(inflatedEffects(state, action).money ?? 0);
}

/** Shared retail admission for catalog previews and the atomic checkout. */
export function facilityPurchaseCheck(state:GameState,action:ActionDef):CheckResult {
  if(!isFacilityProduct(action))return {ok:false,reason:'这件商品不属于当前采购目录'};
  const reason=productOwnershipReason(state,action);if(reason)return {ok:false,reason};
  const check=canPerform(state,action);if(!check.ok)return check;
  const tier=action.itemId?getItem(action.itemId)?.fridgeTier:undefined;
  return tier?canInstallFridge(state,tier):check;
}

/** 所有带现金支出的行动统一做余额校验，避免执行后出现负数余额。 */
function affordableActionResult(state: GameState, action: ActionDef): CheckResult {
  const money = inflatedEffects(state, action).money ?? 0;
  if (money < 0 && state.player.money + money < 0) {
    return { ok: false, reason: `金钱不足（需 ${Math.abs(money)}）` };
  }
  return { ok: true };
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
export function autoExitIfClosed(state: GameState): void {
  if (state.locationId === "map" || isResidenceLocation(state)) return;
  const loc = getLocation(state.locationId);
  if (!loc || isLocationOpen(loc, state.time.hour + state.time.minute / 60, state)) return;
  // 尚在候场窗口内（如 7:30 到岗等 8:00 开门）不踢出
  if (canArriveEarly(loc, state.time.hour + state.time.minute / 60, state)) return;
  if (state.region) {
    enterRegion(state, state.region);
    pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了街上");
  } else {
    goToMap(state);
    pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了主地图");
  }
}

function done(
  state: GameState,
  action: ActionDef,
  duration: number,
  deltas: ResultDelta[],
  verdict: string,
  crossedDay: boolean,
): PerformResult {
  if(action.id==='commercial_street_stroll')rollStreetBargain(state);
  // v1.34：路边随机遭遇野生对决已移除，改为公园「猫咪自由锻炼」/ 游乐场「喵喵娱乐赛」入口
  // v1.41：动作型城市委托复用现有行动结算，不改变动作数据或旧任务逻辑。

  // 只记录已成功结算的消费；使用行动所属地点，避免打烊自动离场漏记。
  if (action.locationId === "snack_street" && action.handler === "buy_food" && action.itemId) {
    recordRemasterAction(state, { kind: "snack_order", itemId: action.itemId });
  }
  if (action.locationId === "flower_market" && action.handler === "buy_item" && action.itemId) {
    recordRemasterAction(state, { kind: "flower_market_purchase", actionId: action.id, itemId: action.itemId });
  }
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
  if (isLegacyCookAction(action)) return { ok: false, reason: LEGACY_COOK_REASON };
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if (isDistrictService(action)) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const outcome = performDistrictService(state, action);
    if (!outcome.ok) return outcome;
    autoExitIfClosed(state);
    return done(state, action, outcome.duration, collectDeltas(outcome.effects), outcome.verdict, outcome.crossedDay);
  }

  // 宗教排他 + 弥撒时段
  if (actionId === "church_mass" || actionId === "church_catechumen" || actionId === "temple_volunteer") {
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
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
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
  // v1.43：网吧上机期间同样算「有电脑可用」（按办公本档位）。
  if (action.handler === "use_laptop") {
    if (!hasLaptop(state)) return { ok: false, reason: "需要一台电脑（也可以去网吧上机）" };
    return { ok: false, reason: "laptop" };
  }

  // ---- 洗浴中心一条龙 ----
  if (action.handler === "wash_center") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 24);
    // advanceHours already consumes each ended calendar day exactly once.
    if (crossedDay) {
      // 洗浴中心已完成跨夜结算，避免后续正常睡眠再次套用熬夜惩罚。
      state.time.stayedUp = false;
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
    const templeLodging = action.housingId === "temple";
    if (templeLodging && state.locationId !== "temple") {
      return { ok: false, reason: "禅房只在寺庙登记，先前往寺庙办理挂单" };
    }
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const beforeMoney=state.player.money;
    if (!selectLodging(state, action.housingId ?? "hotel")) {
      return { ok: false, reason: templeLodging ? "需先做过寺庙义工并获得今晚挂单资格" : "房源不可用或现金不足" };
    }
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 1);
    autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      [...collectDeltas(action.effects),...(state.player.money!==beforeMoney?[{key:'money',label:'金钱',value:state.player.money-beforeMoney}]:[])],
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
      r.text ?? pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // ---- 购买物品入包（可装备则自动装备） ----
  if (action.handler === "buy_item" && action.itemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const item = getItem(action.itemId);
    if (!item) return { ok: false, reason: "货架上暂时没有这件商品" };
    if (isClothingItem(item) && itemCount(state, item.id) > 0) {
      return { ok: false, reason: `你已经拥有「${item.name}」，可以去衣柜重新穿上` };
    }
    if (isClothingItem(item)) {
      const purchase = checkoutClothing(state, [item.id]);
      if (!purchase.ok) return { ok: false, reason: purchase.reason };
      const { crossedDay } = opts?.deferTime ? { crossedDay: false } : advanceHours(state, action.duration ?? 1);
      if (!opts?.deferTime) autoExitIfClosed(state);
      return done(state, action, action.duration ?? 1, [{ key: 'money', label: '金钱', value: -purchase.total }], '新穿搭已换上。', crossedDay);
    }
    // v1.42 冰箱是独立家电槽；升级只扣当前档位到目标档位的差价，库存原样保留。
    if (item.fridgeTier) {
      const installed = installFridge(state, item.fridgeTier);
      if (!installed.ok) return { ok: false, reason: installed.reason };
      const { crossedDay } = opts?.deferTime ? { crossedDay: false } : advanceHours(state, action.duration ?? 1);
      if (!opts?.deferTime) autoExitIfClosed(state);
      return done(
        state,
        action,
        action.duration ?? 1,
        [{ key: "money", label: "金钱", value: -(installed.price ?? 0) }],
        `${item.name}已安装，烹饪食材会自动送入冰箱。`,
        crossedDay,
      );
    }
    const purchaseEffects = inflatedEffects(state, action);
    const purchasePrice = Math.abs(purchaseEffects.money ?? 0);
    if (state.player.money < purchasePrice) return { ok: false, reason: `金钱不足（需要 ${purchasePrice} 元）` };
    if (isCookingItem(action.itemId) && hasFridge(state) && !canStoreInFridge(state, action.itemId, 1)) {
      return { ok: false, reason: "冰箱空间不足，请先在厨房用掉一些库存后再试" };
    }
    applyEffects(state, purchaseEffects, action.icon);
    const routed: { ok: boolean; stored: "fridge" | "inventory"; reason?: string } = isCookingItem(action.itemId)
      ? routeCookingPurchase(state, action.itemId, 1)
      : (() => { addItem(state, action.itemId!, Math.max(1, Math.floor(action.itemQuantity ?? 1))); return { ok: true, stored: "inventory" as const }; })();
    if (!routed.ok) return { ok: false, reason: routed.reason };
    if (item?.luxury && !state.economy.ownedLuxury.includes(item.id)) {
      state.economy.ownedLuxury.push(item.id);
    }
    if (item && !item.consumable) applyItem(state, action.itemId);
    // v1.45：服装购买沿用普通装备加成，但买下后立即换上；其他可装备物品仍保持原有手动装备行为。
    // v1.10：购买带 phoneSkin 的品质手机 → 永久更换手机外观
    if (item?.phoneSkin) state.phoneSkin = item.phoneSkin;
    const { crossedDay } = opts?.deferTime ? { crossedDay: false } : advanceHours(state, action.duration ?? 1);
    if (!opts?.deferTime) autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 1,
      // v0.99 修复：弹窗展示与实扣一致的缩放价（原为原始价，通胀时虚报低价）
      collectDeltas(purchaseEffects),
      isCookingItem(action.itemId)
        ? `${item.name}已购买并${routed.stored === "fridge" ? "自动放入冰箱" : "装进背包"}。`
        : pickVerdict(state, action.verdicts),
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
    const duration = actionDurationHours(action, { dine });
    let verdict: string;

    if (dine === "eat") {
      const useEff = item.useEffects ?? {};
      applyEffects(state, useEff, item.icon);
      recordFoodEaten(state, action.itemId);
      deltas.push(...collectDeltas(useEff));
      verdict = `在店里把${item.name}解决掉了，一身轻松地出门。`;
    } else {
      addItem(state, action.itemId);
      pushLog(state, item.icon, `${item.name}打包带走，装进了背包`);
      verdict = `${item.name}已打包，饿的时候从背包里拿出来吃。`;
    }

    const { crossedDay } = opts?.deferTime ? { crossedDay: false } : advanceHours(state, duration);
    if (!opts?.deferTime) autoExitIfClosed(state);
    return done(state, action, duration, deltas, verdict, crossedDay);
  }

  // ---- 生鲜食材：只入包，需带回去做熟 ----
  if (action.handler === "buy_ingredient" && action.itemId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const item = getItem(action.itemId);
    if (!item) return { ok: false, reason: "货架上暂时没有这件商品" };
    const purchaseEffects = inflatedEffects(state, action);
    const purchasePrice = Math.abs(purchaseEffects.money ?? 0);
    if (state.player.money < purchasePrice) return { ok: false, reason: `金钱不足（需要 ${purchasePrice} 元）` };
    if (hasFridge(state) && !canStoreInFridge(state, action.itemId, 1)) return { ok: false, reason: "冰箱空间不足，请先在厨房用掉一些库存后再试" };
    applyEffects(state, purchaseEffects, action.icon);
    const routed = routeCookingPurchase(state, action.itemId, 1);
    if (!routed.ok) return { ok: false, reason: routed.reason };
    const { crossedDay } = opts?.deferTime ? { crossedDay: false } : advanceHours(state, action.duration ?? 0.5);
    if (!opts?.deferTime) autoExitIfClosed(state);
    return done(
      state,
      action,
      action.duration ?? 0.5,
      // v1.3b2：deltas 用含折扣/通胀的实扣，保证结算窗与实扣一致（菜市场夜间 7.5 折）
      collectDeltas(purchaseEffects),
      `${item?.name ?? "食材"}已${routed.stored === "fridge" ? "自动放入冰箱" : "装进背包"}，可在厨房自由烹饪。`,
      crossedDay,
    );
  }

  // ---- v1.10 培训学校：免费上课（每天 1 次，连续 3 天或累计 5 次领证书） ----
  if (action.handler === "train_study") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const today = gameDay(state.time);
    if (state.flags[`trained_${today}`]) {
      return { ok: false, reason: "今天已经上过课了，明天再来（每级连续 3 天或累计 5 次结业）" };
    }
    const totalBefore = typeof state.flags["train_total"] === "number" ? state.flags["train_total"] as number : 0;
    const rawLevel = state.flags["skill_certificate_level"];
    const levelBefore = Math.max(
      typeof rawLevel === "number" && Number.isFinite(rawLevel) ? Math.max(0, Math.min(3, Math.floor(rawLevel))) : 0,
      state.flags["item_training_cert"] ? 1 : 0,
    );
    const hasCycleCounter = typeof state.flags["train_cycle_total"] === "number";
    const legacyCertified = levelBefore > 0 && !hasCycleCounter;
    const cycleBefore = hasCycleCounter
      ? Math.max(0, state.flags["train_cycle_total"] as number)
      : legacyCertified ? 0 : totalBefore;
    const last = typeof state.flags["train_last_day"] === "number" ? (state.flags["train_last_day"] as number) : -1;
    const priorStreak = legacyCertified ? 0 : typeof state.flags["train_streak"] === "number" ? state.flags["train_streak"] as number : 0;
    const streak = last === today - 1 ? priorStreak + 1 : 1;
    let completionBonus = 0;
    let certificateLevelGained = 0;
    state.flags[`trained_${today}`] = true;
    for (const key of Object.keys(state.flags)) {
      const trainedDay = /^trained_(-?\d+)$/.exec(key);
      if (trainedDay && Number(trainedDay[1]) !== today) delete state.flags[key];
    }
    state.flags["train_last_day"] = today;
    state.flags["train_streak"] = streak;
    state.flags["train_total"] = totalBefore + 1;
    const cycleTotal = cycleBefore + 1;
    state.flags["train_cycle_total"] = cycleTotal;
    applyEffects(state, action.effects, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 2);
    autoExitIfClosed(state);
    // 每级独立累计：连续 3 天或本级 5 次。旧存档已有证书时从下一等级重新计数。
    if (streak >= 3 || cycleTotal >= 5) {
      if (levelBefore < 3) {
        const level = levelBefore + 1;
        const bonus = [0, 5, 10, 20][level];
        state.flags["item_training_cert"] = true;
        state.flags["skill_certificate_level"] = level;
        certificateLevelGained = level;
        if (!(state.inventory.training_certificate > 0)) addItem(state, "training_certificate", 1);
        state.flags["train_cycle_total"] = 0;
        state.flags["train_streak"] = 0;
        pushLog(state, "🎓", `培训结业！技能证书升至 ${level} 级，普通工作收入提高 ${bonus}%${level === 1 ? "，也可应聘培训学校助教" : ""}`);
      } else {
        completionBonus = 200;
        applyEffects(state, { money: completionBonus }, "🎓");
        state.flags["train_cycle_total"] = 0;
        state.flags["train_streak"] = 0;
        pushLog(state, "🎓", "技能证书已达最高等级；本轮结业奖励 200 元，培训进度已重置");
      }
    }
    const deltas = collectDeltas(action.effects).concat([{ key: "flag", label: "培训", value: 0 }]);
    if (certificateLevelGained > 0) deltas.push({ key: "item", label: `培训结业证书更新至 ${certificateLevelGained} 级`, value: 1 });
    if (completionBonus > 0) deltas.push({ key: "money", label: "金钱", value: completionBonus });
    const courseVerdict = certificateLevelGained > 0
      ? `培训结业，证书升至 ${certificateLevelGained} 级。`
      : completionBonus > 0
        ? "本轮培训完成，结业奖励已发放。"
        : "本堂课完成。";
    return done(
      state,
      action,
      action.duration ?? 2,
      deltas,
      `${pickVerdict(state, action.verdicts)} ${courseVerdict}`,
      crossedDay,
    );
  }

  // ---- v1.25 主动搭话：结识新朋友（每日最多 2 次） ----
  if (action.handler === "meet_someone") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const today = gameDay(state.time);
    const sameDay = state.flags["meet_day"] === today;
    const meetCount = sameDay && typeof state.flags["meet_count_today"] === "number" ? (state.flags["meet_count_today"] as number) : 0;
    if (meetCount >= 2) return { ok: false, reason: "今天搭话次数用完了，明天再来吧" };
    const time = { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), hour: state.time.hour, minute: state.time.minute, regionId: state.region };
    const candidates = allNpcs().filter(
      (n) => npcOrdinaryAppearanceUnlocked(state, n.id) && npcAtLocation(n, state.locationId, time) && !findRelationship(state, n.id),
    );
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
    const deal = getLodging("hotel_budget");
    const lux = getLodging("hotel");
    const text = `前台介绍：特惠间 ${deal?.price ?? 40} 元/晚，豪华间 ${lux?.price ?? 150} 元/晚；入住期间可另购自助早餐 20 元。民宿是住宅区的独立住宿。`;
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
      `${r.text}。${pickVerdict(state, action.verdicts)}`,
      crossedDay,
    );
  }

  // ---- 创业项目推进 ----
  if (action.handler === "work_project" && action.projectId) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    // 创业/摆摊分支提前 return，成功后在此写入日限；
    // 个人开发由核心结算工时，不能再按行动配置重复推进时间。
    const stallMinigame = isStallProject(action.projectId);
    const r = workOnProject(state, action.projectId, { deferStallSettlement: stallMinigame });
    if (!r.ok) return { ok: false, reason: r.reason };
    if (action.requirements?.oncePerDay) state.flags[action.requirements.oncePerDay] = gameDay(state.time);
    const duration = r.elapsedHours ?? (stallMinigame ? 0 : action.duration ?? 1);
    const { crossedDay } = r.elapsedHours!==undefined ? {crossedDay:r.crossedDay??false} : duration > 0 ? advanceHours(state, duration) : { crossedDay: false };
    autoExitIfClosed(state);
    return done(
      state,
      action,
      duration,
      r.deltas ?? [],
      r.completed ? "项目完成！你的努力终于开花结果了。" : pickVerdict(state, action.verdicts),
      crossedDay,
    );
  }

  // Street tips are paid only after the saved performance is judged.
  if (actionId === "street_perform") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const performance = beginStreetPerformance(state);
    const eff: Effects = { stamina: currentWeather(state) === "heatwave" ? -15 : -12 };
    applyEffects(state, eff, action.icon);
    const { crossedDay } = advanceHours(state, action.duration ?? 2);
    autoExitIfClosed(state);
    return done(state, action, action.duration ?? 2, collectDeltas(eff),
      `本场打赏上限 ¥${performance.quote}；达到 60 分后按表现结算，提前结束无打赏。每日最多两场，第二场观众减少。`, crossedDay);
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
    const hasGrowthEffect = !!book.attrBook || !!book.effects.skills ||
      Object.keys(book.effects).some((key) => ["intelligence", "charm", "fitness", "fame", "programming", "design", "writing", "operation", "cooking", "service", "driving", "management"].includes(key));
    const capped = hasGrowthEffect && count >= 10;
    const eff: Effects = capped ? { stamina: book.effects.stamina ?? 0, mood: 2 } : book.effects;
    applyEffects(state, eff, book.icon);
    // 片段随机抽取（记录上次下标，尽量不重复）
    const pool = book.snippets;
    let idx = randomInt(state.rng, 0, pool.length - 1);
    const last = typeof state.flags[`book_${book.id}_last`] === "number" ? (state.flags[`book_${book.id}_last`] as number) : -1;
    if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
    state.flags[`book_${book.id}_last`] = idx;
    const snippet = pool[idx];
    let verdict = snippet;
    // v1.42：每次阅读烹饪食谱都从完整菜谱池抽取一张卡片。
    // 抽到未掌握的菜谱时永久解锁；抽到已掌握的菜谱仍结算厨艺属性，但不重复写入存档。
    if (book.id === "book_cooking") {
      const recipes = recipeList();
      const picked = recipes.length > 0 ? recipes[randomInt(state.rng, 0, recipes.length - 1)] : undefined;
      if (picked) {
        state.cooking ??= { unlockedRecipeIds: [] };
        state.cooking.unlockedRecipeIds ??= [];
        const alreadyKnown = state.cooking.unlockedRecipeIds.includes(picked.id);
        if (!alreadyKnown) {
          state.cooking.unlockedRecipeIds.push(picked.id);
          pushLog(state, picked.icon, `读完烹饪食谱，解锁「${picked.name}」`);
          verdict = `${snippet}\n📖 随机菜谱：解锁「${picked.name}」`;
        } else {
          verdict = `${snippet}\n📖 随机菜谱：你已经掌握「${picked.name}」，本次只获得厨艺提升`;
        }
      }
    }
    const closing = BOOK_READING_CLOSINGS[book.id];
    if (closing) verdict = `${verdict}\n\n读后小结：${closing}`;
    const duration = actionDurationHours(action);
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, collectDeltas(eff), verdict, crossedDay);
  }

  // ---- v1.20 便利店盲盒：晚 10 点后 10 元随机两个食物/食材 ----
  if (action.handler === "blind_box") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = Math.abs(inflatedEffects(state, action).money ?? -10);
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
    const pet = opts?.catUid ? getPet(state, opts.catUid) : activePetOf(state) ?? availableCatsOf(state)[0];
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

  // ---- v1.4 车站：车票购买与检票由 UI 面板调用，行动本身只作为入口 ----
  if (action.handler === "intercity_station") {
    return { ok: false, reason: "请打开车站交通面板购票或检票" };
  }

  // ---- v1.4 花鸟市场：轻量小宠物（与猫咪 PetState 完全分离） ----
  if (action.handler === "small_pet_adopt" && action.smallPetKind) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = Math.abs(inflatedEffects(state, action).money ?? 0);
    const r = adoptSmallPet(state, action.smallPetKind, price);
    if (!r.ok) return { ok: false, reason: r.reason };
    const duration = action.duration ?? 0.5;
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, r.deltas ?? [], r.message ?? "小宠物已带回家", crossedDay);
  }

  if (action.handler === "small_pet_care" && action.smallPetAction) {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const cost = action.effects?.money && action.effects.money < 0 ? Math.abs(inflatedEffects(state, action).money ?? 0) : undefined;
    const r =
      action.smallPetAction === "feed"
        ? feedSmallPet(state, opts?.smallPetUid, cost)
        : comfortSmallPet(state, opts?.smallPetUid);
    if (!r.ok) return { ok: false, reason: r.reason };
    const duration = action.duration ?? 0.5;
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, r.deltas ?? [], r.message ?? "照料完成", crossedDay);
  }

  if (action.handler === "small_pet_checkup") {
    const check = canPerform(state, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const price = Math.abs(inflatedEffects(state, action).money ?? 0);
    const r = checkupSmallPet(state, opts?.smallPetUid, price);
    if (!r.ok) return { ok: false, reason: r.reason };
    const duration = action.duration ?? 0.5;
    const { crossedDay } = advanceHours(state, duration);
    autoExitIfClosed(state);
    return done(state, action, duration, r.deltas ?? [], r.message ?? "体检完成", crossedDay);
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
    const pet = opts?.catUid ? getPet(state, opts.catUid) : activePetOf(state) ?? availableCatsOf(state)[0];
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
  if (WORK_WAGE_ACTIONS.has(action.id)) return performWageAction(state,action.id);

  if (WORK_WAGE_ACTIONS.has(action.id)) {
    const survival = guardSurvival(state, "强行工作", triggerCollapse);
    if (!survival.ok) return { ok: false, reason: survival.reason };
  }

  if (actionId === "church_meal") {
    const meal = afterChurchMeal(state);
    if (!meal.ok) return { ok: false, reason: meal.reason };
    state.flags.church_meal_action_day = gameDay(state.time);
    return done(state, action, 0, collectDeltas({ satiety: 55, mood: 12, stress: -10, health: 2, fame: 1 }), "和教友们一起吃了顿免费的热饭。今天的聚餐已参加，周六、周日各可参加一次。", false);
  }
  if (actionId === "church_gospel_box") {
    const excerpt = afterChurchGospelBox(state);
    if (!excerpt.ok) return { ok: false, reason: excerpt.reason };
    state.flags.church_gospel_box_action_day = gameDay(state.time);
    return done(state, action, 0, [], `${excerpt.quote.text}\n\n——《思高圣经·新约》${excerpt.quote.bookName} 第${excerpt.quote.chapter}章`, false);
  }

  if (HIGH_COST_ACTIONS.has(action.id)) {
    const guard = guardCollapse(state, action.name, triggerCollapse);
    if (!guard.ok) return { ok: false, reason: guard.reason };
  }

  if (action.requirements?.oncePerDay) {
    state.flags[action.requirements.oncePerDay] = gameDay(state.time);
  }
  if (action.requirements?.dailyLimit) {
    const { dayFlag, countFlag } = action.requirements.dailyLimit;
    const today = gameDay(state.time);
    const used = state.flags[dayFlag] === today ? Math.max(0, Math.floor(Number(state.flags[countFlag] ?? 0))) : 0;
    state.flags[dayFlag] = today;
    state.flags[countFlag] = used + 1;
  }

  const eff = inflatedEffects(state, action);
  if (WORK_WAGE_ACTIONS.has(action.id) && (eff.money ?? 0) > 0) {
    eff.money = Math.round((eff.money ?? 0) * skillCertificateWageMultiplier(state));
  }
  applyEffects(state, eff, action.icon);
  if (WORK_WAGE_ACTIONS.has(actionId)) {
    recordWageActionCompletion(state, actionId, eff.money ?? 0);
  }
  // 考试同时发放资格标记和可在背包中查看的实体驾驶本。
  if (actionId === "driving_exam" && (state.inventory.driving_license ?? 0) < 1) {
    addItem(state, "driving_license");
  }

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
    heavyWork: HIGH_COST_ACTIONS.has(action.id),
    staminaCost: -(action.effects.stamina ?? 0),
  });
  // 先完成入住登记，避免傍晚做完义工被公共营业时间提前赶出自己的禅房。
  if (actionId === "temple_volunteer") afterTempleVolunteer(state);
  autoExitIfClosed(state);

  // ---- v1.3b9 周末集市特卖：逛集市必遇一件随机商品七五折（写入 flags，由 ev_market_fair_deal 事件弹窗承接购买） ----
  if (actionId === "market_browse") {
    // 每天只刷新一次，避免反复进出集市无限刷新同一类优惠。
    const today = gameDay(state.time);
    if (state.flags.fair_deal_day !== today) {
      // flags 值类型为 number|boolean：只存 SHOP_CATALOG 索引与价格，名称/图标在结算时反查
      const idx = randomInt(state.rng, 0, SHOP_CATALOG.length - 1);
      const price = Math.max(1, Math.round((SHOP_CATALOG[idx].offline * 0.75) / 10) * 10);
      state.flags.fair_deal_day = today;
      state.flags.fair_deal_idx = idx;
      state.flags.fair_deal_price = price;
      // 强制排队特卖事件（下一次 rollEvent 优先弹出；内联实现避免与 events.ts 循环依赖）
      if (!state.pendingEvents) state.pendingEvents = [];
      if (!state.pendingEvents.includes("ev_market_fair_deal")) state.pendingEvents.push("ev_market_fair_deal");
    }
  }

  let catechumenRewardText = "";
  if (actionId === "church_catechumen") {
    const rewards = afterChurchCatechumen(state);
    catechumenRewardText = rewards.length ? `本次获得：\n${rewards.join("\n")}` : "本次慕道班已完成。纪念卡已全部收齐，本次没有新增礼品。";
  }
  else if (actionId === "church_mass") afterChurchMass(state);

  // 重工业工厂班次结算后立即开通两天临时住宿；新班次从完成日刷新期限。
  if (["steel_shift", "glass_quality_shift", "aluminum_recycle_shift"].includes(actionId)) {
    grantWorkerDormStay(state);
  }

  return done(
    state,
    action,
    action.duration ?? 1,
    // 工业行动小游戏以实际到账工资计算表现奖金，包含现有物价与证书倍率。
    collectDeltas(["steel_shift", "glass_quality_shift", "aluminum_recycle_shift"].includes(actionId) ? eff : action.effects),
    catechumenRewardText || pickVerdict(state, action.verdicts),
    crossedDay,
  );
}

/**
 * 购物车结算：商品逐项沿用原购买逻辑，全部成功后一次性推进时间。
 * 先在序列化副本上执行，任何一项失败都不会留下扣款或库存残留。
 */
export function performShoppingCart(state: GameState, selection: string[]|ShoppingLine[], options?:Pick<PerformOptions,'dine'>): PerformResult {
  const quantities=new Map<string,number>();
  for(const line of selection){
    const id=typeof line==='string'?line:line?.actionId,quantity=typeof line==='string'?1:line?.quantity;
    if(!id||!Number.isInteger(quantity)||quantity<1||quantity>99)return {ok:false,reason:'商品数量须为 1—99 的整数'};
    quantities.set(id,typeof line==='string'?1:(quantities.get(id)??0)+quantity);
  }
  const units=[...quantities.values()].reduce((a,b)=>a+b,0);
  if(units>99)return {ok:false,reason:'一次采购最多 99 件，请分次购买'};
  const ids=[...quantities.keys()];
  if (ids.length === 0) return { ok: false, reason: "请先选择要购买的商品" };
  const actions = ids.map(getAction);
  if (actions.some(action => !action)) return { ok: false, reason: "购物车中有商品已下架，请重新选择" };
  const selected = actions as ActionDef[];
  if (selected.some(action =>
    action.locationId !== state.locationId || !isFacilityProduct(action)
  )) {
    return { ok: false, reason: "购物车只支持当前商店里的商品" };
  }
  const families=new Set<string>();
  for(const action of selected){
    if(!productRepeatable(action)&&quantities.get(action.id)!>1)return {ok:false,reason:'耐用品一次只能购买一件'};
    const family=productFamily(action);if(family&&families.has(family))return {ok:false,reason:'同一类家具或设备一次请选择一个档位'};if(family)families.add(family);
  }

  const draft = JSON.parse(JSON.stringify(state)) as GameState;
  const results: ActionResult[] = [];
  for (const action of selected) {
    for(let n=0;n<quantities.get(action.id)!;n++){
      const check=facilityPurchaseCheck(draft,action);if(!check.ok)return {ok:false,reason:check.reason};
      const result = performAction(draft, action.id, { dine: options?.dine??'pack', deferTime: true });
      if (!result.ok) return { ok: false, reason: result.reason };
      if (result.result) results.push(result.result);
    }
  }

  const duration = shoppingDuration(selected,units)+(options?.dine==='eat'&&selected.some(a=>['buy_food','buy_fresh'].includes(a.handler??''))?DINE_IN_EXTRA_HOURS:0);
  const { crossedDay } = advanceHours(draft, duration);
  autoExitIfClosed(draft);
  Object.assign(state, draft);

  const combined = new Map<string, ResultDelta>();
  for (const result of results) {
    for (const delta of result.deltas) {
      const current = combined.get(delta.key);
      if (current) current.value += delta.value;
      else combined.set(delta.key, { ...delta });
    }
  }
  const deltas = [...combined.values()].filter(delta => delta.value !== 0);
  const spent = Math.abs(deltas.find(delta => delta.key === "money")?.value ?? 0);
  return {
    ok: true,
    crossedDay,
    result: {
      actionId: "shopping_cart",
      icon: "🛒",
      name: "集中采购",
      duration,
      deltas,
      sound: "coin",
      verdict: `已购买 ${selected.length} 种、共 ${units} 件商品，合计支出 ${formatMoney(spent)} 元。`,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 出行与移动
 * ------------------------------------------------------------------ */

/** 进入地点时推断来源区域：优先沿用当前 region（同 id 可跨多区） */
export function inferSourceRegion(state: GameState, loc: LocationDef): string | undefined {
  const regions = regionsOfLocation(state, loc);
  if (state.region && regions?.includes(state.region)) return state.region;
  const nearby = regions?.find((id) => physicalDistrict(id) === currentArea(state));
  if (nearby) return nearby;
  return regions?.[0];
}

/** Nested atlas pages share their enclosing district's travel costs. */
function physicalDistrict(regionId: string | undefined): string | undefined {
  const path = regionId ? regionPathOf(regionId) : [];
  return path[1] ?? regionId;
}

/** 当前物理所在的二级区域：region 优先，主地图态回退 area */
export function currentArea(state: GameState): string | undefined {
  const region = state.region;
  return physicalDistrict(region && getRegion(region)?.parent ? region : state.area);
}

/** 地点归属区域（住处随住宿动态归属） */
function regionsOfLocation(state: GameState, loc: LocationDef): string[] | undefined {
  return loc.id === "home" ? [currentRegion(state)] : loc.regions;
}

/** 目标地点是否与当前物理区域同区 */
export function isSameArea(state: GameState, loc: LocationDef): boolean {
  const area = currentArea(state);
  const regions = regionsOfLocation(state, loc);
  return !!area && (regions?.some((id) => physicalDistrict(id) === area) ?? false);
}

/** 当前所在的一级区域（市区 / 郊区 / 开发区） */
function topAreaOfState(state: GameState): string | undefined {
  if (state.region && getRegion(state.region)) return topRegionOf(state.region);
  return state.area ? topRegionOf(state.area) : undefined;
}

/** 出行层级：先判断一级边界，再判断物理子区，避免旧 area 免除跨区路费。 */
function tierOf(state: GameState, loc: LocationDef | undefined): TransitTier {
  if (!loc) return "local";
  const from = topAreaOfState(state);
  const targetRegion = regionsOfLocation(state, loc)?.[0];
  const to = targetRegion ? topRegionOf(targetRegion) : undefined;
  if (from && to && from !== to) return "intercity";
  return isSameArea(state, loc) ? "same" : "local";
}

/** 雨天减速：地铁 / 步行耗时 ×1.5 */
function weatherAdjust(state: GameState, plan: TransitPlan): TransitPlan {
  return plan.hours > 0 && (plan.mode === "subway" || plan.mode === "walk") && isRainy(state)
    ? { ...plan, hours: plan.hours * 1.5 }
    : plan;
}

/** 前往某地点的出行方案 */
export function travelPlan(state: GameState, loc: LocationDef | undefined): TransitPlan {
  const targetRegion = loc ? regionsOfLocation(state, loc)?.[0] : undefined;
  const targetTop = targetRegion ? topRegionOf(targetRegion) : undefined;
  return weatherAdjust(state, planTransit(state, tierOf(state, loc), targetTop, topAreaOfState(state)));
}

/** 前往某区域的出行方案 */
export function regionTravelPlan(state: GameState, regionId: string): TransitPlan {
  if (isFreeDistrictBorder(state, regionId)) return { mode: "same", hours: 0, fare: 0, icon: "🚶", name: "相邻区域道路 · 免费" };
  const region = getRegion(regionId);
  if (!region) return planTransit(state, "local");
  if (regionId === "development_airport") return travelPlan(state, getLocation("airport"));
  // 一级区域（市区 / 郊区）：按一级区是否相同决定跨城
  if (!region?.parent) {
    const from = topAreaOfState(state);
    const to = topRegionOf(regionId);
    return weatherAdjust(state, planTransit(state, from && to && from !== to ? "intercity" : "same", to, from));
  }
  const from = topAreaOfState(state);
  const to = topRegionOf(regionId);
  if (from === to && currentArea(state) === physicalDistrict(regionId)) return weatherAdjust(state, planTransit(state, "same"));
  return weatherAdjust(state, planTransit(state, from && to && from !== to ? "intercity" : "local", to, from));
}

export function regionAvailabilityAtArrival(state: GameState, regionId: string): { unlocked: boolean; reason: string } {
  const projected = stateAfterTravel(state, regionTravelPlan(state, regionId).hours);
  const region = getRegion(regionId);
  return { unlocked: isRegionUnlocked(projected, region), reason: regionLockReason(projected, region) };
}

/** 仅两区总览道路入口免费，设施之间仍沿用城区交通。 */
export function isFreeDistrictBorder(state: GameState, target: string): boolean {
  return state.locationId === "map" && ((state.region === "development" && target === "boyue") || (state.region === "boyue" && target === "development"));
}

/** 前往某地点需要的小时数 */
export function travelHours(state: GameState, loc: LocationDef | undefined): number {
  return travelPlan(state, loc).hours;
}

/** 按预计抵达时刻计算地图地点的营业状态，与实际移动校验使用同一时间基准。 */
export function locationAvailabilityAtArrival(
  state: GameState,
  loc: LocationDef | undefined,
): { arrivalHour: number; unlocked: boolean; open: boolean; early: boolean; phase: "open" | "before" | "after"; closedText: string } {
  const arrivalState = stateAfterTravel(state, travelHours(state, loc));
  const arrivalHour = arrivalState.time.hour + arrivalState.time.minute / 60;
  const open = isLocationOpen(loc, arrivalHour, arrivalState);
  const early = !open && canArriveEarly(loc, arrivalHour, arrivalState);
  return {
    arrivalHour,
    unlocked: isLocationUnlocked(arrivalState, loc),
    open,
    early,
    phase: locationOpenPhase(loc, arrivalHour, arrivalState),
    closedText: !isLocationUnlocked(arrivalState, loc) ? locationLockReason(arrivalState, loc) : open ? "" : closedReason(loc, arrivalHour, arrivalState),
  };
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
  if (plan.requiresTicket) return "跨城公共交通必须前往对应车站购买车票并按班次上车";
  if (plan.fare > 0 && state.player.money < plan.fare) {
    return `身上不够 ${plan.fare} 元车费，先攒点钱再出发吧`;
  }
  return undefined;
}

/** 扣车费 + 出行日志 */
function payAndLogTravel(state: GameState, plan: TransitPlan): void {
  if (plan.mode === "same") return;
  if (plan.fare > 0) {
    state.player.money -= plan.fare;
    recordMoney(state, -plan.fare); // v1.215 修复（P1-10）：车费计入周记支出
    const how = plan.mode === "suburb_bus" ? "坐紫羊区巴士跨区" : plan.mode === "development_subway" ? "坐长途地铁跨区" : "坐地铁跨区";
    pushLog(state, plan.icon, `${how}，车费 ${plan.fare} 元（${hoursLabel(plan.hours)}）`);
    return;
  }
  if (plan.mode === "walk") {
    pushLog(state, "🚶", `${walkReasonText(state)}，只能走过去，路上花了 ${hoursLabel(plan.hours)}`);
    return;
  }
  pushLog(state, plan.icon, `${plan.name}过去，${hoursLabel(plan.hours)}就到了`);
}

/** 日历结算可能结束本局或由系统改变位置，抵达不能覆盖这些结果。 */
function travelInterruptionReason(state: GameState, originLocationId: string): string | undefined {
  if (state.endingId) return "本局生活已结束，行程中止";
  if (state.flags.hospitalized) return "正在住院，行程中止";
  if (state.locationId !== originLocationId) return "当前位置发生变化，行程已中止";
  return undefined;
}

/** 开发区交通在午夜后重新确认状态，再继续路程与提交目的地。 */
function advanceDevelopmentTravel(state: GameState, hours: number, onArrival: () => CheckResult): CheckResult {
  const originLocationId = state.locationId;
  let remainingHours = hours;
  const untilMidnight = (1440 - state.time.hour * 60 - state.time.minute) / 60;
  if (remainingHours >= untilMidnight) {
    advanceHours(state, untilMidnight);
    const interrupted = travelInterruptionReason(state, originLocationId);
    if (interrupted) return { ok: false, reason: interrupted };
    remainingHours -= untilMidnight;
  }
  if (remainingHours > 0 || hours === 0) advanceHours(state, remainingHours);
  const interrupted = travelInterruptionReason(state, originLocationId);
  return interrupted ? { ok: false, reason: interrupted } : onArrival();
}

/** 同步物理区域：站在二级区域时记录 area */
function syncArea(state: GameState): void {
  const region = state.region;
  if (region && getRegion(region)?.parent) state.area = physicalDistrict(region);
}

/** 进入具体地点后保留完整的地图导航路径，避免三级页面失去二级面包屑。 */
function setLocationNavigationPath(state: GameState, regionId = state.region): void {
  state.navStack = regionId ? ["map", ...regionPathOf(regionId)] : ["map"];
}

/** 城市边缘是公共交通和私人交通抵达后的统一落点。 */
const CITY_EDGE_REGION: Record<string, string> = {
  downtown: "downtown_station",
  suburb: "suburban_edge",
};

function cityEdgeOf(topRegion: string | undefined): string | undefined {
  return topRegion ? CITY_EDGE_REGION[topRegion] : undefined;
}

/** 私人交通跨城后抵达目标城市边缘；不允许直接跳进目标城市任意地点。 */
function arriveAtCityEdge(state: GameState, targetTop: string | undefined, plan: TransitPlan): CheckResult {
  const edge = cityEdgeOf(targetTop);
  if (!edge) return { ok: false, reason: "未知的目标城市" };
  const entered = enterRegion(state, edge);
  if (!entered.ok) return entered;

  syncArea(state);
  payAndLogTravel(state, plan);
  advanceHours(state, plan.hours);
  state.flags["commuted_once"] = true;
  // L7 修复（v1.43）：私人交通只能停在目标城市的边缘，必须明确告诉玩家
  // 「已抵达 XX，还要再进城」，否则玩家会停在一张边缘地图上不知道发生了什么。
  const cityName = getRegion(targetTop ?? "")?.name ?? "目标城市";
  const edgeName = getRegion(edge)?.name ?? "城市边缘";
  pushLog(state, "📍", `你抵达了${cityName}的${edgeName}，还得再往城里走一段`);
  return { ok: true };
}

/** 前往区域（含出行结算） */
export function travelToRegion(state: GameState, regionId: string): CheckResult {
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if (state.flags["hospitalized"]) return { ok: false, reason: "正在住院，请先在医院办理出院" };
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: "未知区域" };
  const plan = regionTravelPlan(state, regionId);
  const arrivalState = stateAfterTravel(state, plan.hours);
  if (!isRegionUnlocked(arrivalState, region)) {
    return { ok: false, reason: regionLockReason(arrivalState, region) };
  }
  if (isFreeDistrictBorder(state, regionId)) {
    const entered = enterRegion(state, regionId);
    if (entered.ok) state.area = regionId;
    return entered;
  }
  // 机场区域只有机场设施；查询与执行共用地点通行校验，不能免费跳过路程。
  if (regionId === "development_airport") {
    const airport = getLocation("airport");
    return airport ? enterLocation(state, airport) : { ok: false, reason: "机场数据缺失" };
  }

  const fromTop = topAreaOfState(state);
  const toTop = topRegionOf(regionId);
  const crossCity = !!fromTop && !!toTop && fromTop !== toTop;

  // 市区↔郊区保留车站购票与边缘落点；开发区使用地图直达方案。
  if (crossCity && !isDevelopmentRoute(fromTop, toTop)) {
    const privatePlan = privateIntercityPlan(state);
    if (!privatePlan) {
      return { ok: false, reason: "跨城不能从地图直接进入：请前往巴士站/火车站购票乘车，或使用汽车、电动车、三轮车" };
    }
    return arriveAtCityEdge(state, toTop, privatePlan);
  }

  const blocked = fareBlockReason(state, plan);
  if (blocked) return { ok: false, reason: blocked };

  if ([fromTop, toTop].some((id) => id === "development" || id === "boyue")) {
    const interrupted = travelInterruptionReason(state, state.locationId);
    if (interrupted) return { ok: false, reason: interrupted };
    payAndLogTravel(state, plan);
    return advanceDevelopmentTravel(state, plan.hours, () => {
      const entered = enterRegion(state, regionId);
      if (!entered.ok) return entered;
      syncArea(state);
      if (crossCity && !region.parent) state.area = regionId;
      state.flags.commuted_once = true;
      return { ok: true };
    });
  }

  const entered = enterRegion(state, regionId);
  if (!entered.ok) return entered;

  syncArea(state);
  if (crossCity && !region.parent) state.area = regionId;
  if (plan.hours > 0) {
    payAndLogTravel(state, plan);
    advanceHours(state, plan.hours);
  }
  state.flags["commuted_once"] = true;
  return { ok: true };
}

/** 巴士面板预览：所有阻断条件在扣费与推进时间前检查。 */
export function developmentBusPlan(state: GameState): DevelopmentBusPlan {
  const plan = previewDevelopmentBus(state);
  if (!plan.ok) return plan;
  const destination = getLocation(plan.destinationStationId);
  const region = getRegion(plan.destinationRegion);
  if (!destination || !region || !destination.regions?.includes(plan.destinationRegion)) {
    return { ...plan, ok: false, reason: "目标车站数据缺失，未扣款" };
  }
  if (!isLocationUnlocked(state, destination) || !isRegionUnlocked(state, region)) {
    return { ...plan, ok: false, reason: "目标区域尚未开放，未扣款" };
  }
  return plan;
}

/** 开发区直达巴士：即时付费、候车、乘车并落在对侧巴士站，不创建存档票据。 */
export function rideDevelopmentBus(state: GameState): CheckResult & { plan?: DevelopmentBusPlan } {
  const plan = developmentBusPlan(state);
  if (!plan.ok) return { ok: false, reason: plan.reason, plan };
  state.player.money -= plan.fare;
  recordMoney(state, -plan.fare);
  endNetbarSession(state);
  const departureText = formatDeparture(plan.departure);
  pushLog(state, "🚌", `${plan.routeLabel}直达巴士，车费 ${plan.fare} 元；${departureText} 发车${plan.waitMinutes > 0 ? `，候车 ${plan.waitMinutes} 分钟` : "，搭乘当前班次"}`);
  const interruptedReason = (): string | undefined => travelInterruptionReason(state, plan.fromStationId);
  // 候车跨午夜会发生生存与结局结算，先完成候车，再确认仍能登车。
  if (plan.waitHours > 0) advanceHours(state, plan.waitHours);
  const interrupted = interruptedReason();
  if (interrupted) return { ok: false, reason: interrupted, plan };
  let arrived = false;
  advanceHours(state, plan.travelHours, true, false, () => {
    if (interruptedReason()) return;
    state.locationId = plan.destinationStationId;
    state.region = plan.destinationRegion;
    syncArea(state);
    setLocationNavigationPath(state);
    recordLocationVisited(state, plan.destinationStationId);

    arrived = true;
  });
  if (!arrived) return { ok: false, reason: interruptedReason() ?? "行程已中止", plan };
  state.flags.commuted_once = true;
  pushLog(state, "📍", `直达巴士行驶 ${hoursLabel(plan.travelHours).replace("约 ", "") }，已抵达${getLocation(plan.destinationStationId)?.name ?? "目的地巴士站"}`);
  return { ok: true, plan };
}

/** 站到站全网交通预览，额外校验目标站与所属区域开放状态。 */
export function networkTransitPlan(state: GameState, destinationStationId: string): NetworkTransitPlan {
  const plan = previewNetworkTransit(state, destinationStationId);
  if (!plan.ok) return plan;
  const destination = getLocation(plan.destinationStationId);
  const region = getRegion(plan.destinationRegion);
  if (!destination || !region || !destination.regions?.includes(plan.destinationRegion)) {
    return { ...plan, ok: false, reason: "目标车站数据缺失，未扣款" };
  }
  if (!isLocationUnlocked(state, destination) || !isRegionUnlocked(state, region)) {
    return { ...plan, ok: false, reason: "目标车站尚未开放，未扣款" };
  }
  return plan;
}

/** 买票确认后一次完成扣费、候车、乘车与抵达；不留下可重复使用的票据。 */
export function rideNetworkTransit(state: GameState, destinationStationId: string): CheckResult & { plan?: NetworkTransitPlan } {
  expireMissedTicket(state);
  const plan = networkTransitPlan(state, destinationStationId);
  if (!plan.ok) return { ok: false, reason: plan.reason, plan };
  const destination = getLocation(plan.destinationStationId)!;
  state.player.money -= plan.fare;
  recordMoney(state, -plan.fare);
  endNetbarSession(state);
  const icon = plan.mode === "train" ? "🚆" : "🚌";
  pushLog(state, icon, plan.routeLabel + "，车费 " + plan.fare + " 元；" + formatDeparture(plan.departure) + " 发车" + (plan.waitMinutes ? "，候车 " + plan.waitMinutes + " 分钟" : ""));
  const interruptedReason = (): string | undefined => travelInterruptionReason(state, plan.fromStationId);
  if (plan.waitMinutes > 0) advanceHours(state, plan.waitMinutes / 60);
  const interrupted = interruptedReason();
  if (interrupted) return { ok: false, reason: interrupted, plan };
  let arrived = false;
  advanceHours(state, plan.travelMinutes / 60, true, false, () => {
    if (interruptedReason()) return;
    state.locationId = plan.destinationStationId;
    state.region = plan.destinationRegion;
    syncArea(state);
    setLocationNavigationPath(state, plan.destinationRegion);
    recordLocationVisited(state, plan.destinationStationId);

    arrived = true;
  });
  if (!arrived) return { ok: false, reason: interruptedReason() ?? "行程已中止", plan };
  state.flags.commuted_once = true;
  pushLog(state, "📍", "行程结束，已抵达" + destination.name);
  return { ok: true, plan };
}

/** 车站窗口使用的购票入口。购票后车票保存在 GameState，可离站后再返回。 */
export function purchaseIntercityTicket(state: GameState, mode: IntercityMode): TicketOperation {
  const stationId = state.locationId;
  const r = buyIntercityTicket(state, mode, stationId);
  if (!r.ok || !r.ticket) return r;
  const destination = getLocation(r.ticket.destinationStationId)?.name ?? "目标城市边缘车站";
  const icon = mode === "train" ? "🚆" : "🚌";
  pushLog(
    state,
    icon,
    `已购买${mode === "train" ? "火车" : "巴士"}票，${formatDeparture({ day: r.ticket.departureDay, minute: r.ticket.departureMinute })} 发车，抵达${destination}`,
  );
  return r;
}

/**
 * v1.42 买票即乘车：购票后自动快进到发车时刻，再快进至目标车站。
 * 目标车站/区域在扣费前校验；新流程不留下待检票车票。旧存档已有的
 * intercityTicket 仍由 rideIntercityTicket 走人工检票分支。
 */
export function purchaseAndRideIntercityTicket(state: GameState, mode: IntercityMode): TicketOperation {
  const stationId = state.locationId;
  const destinationId = counterpartStationOf(stationId);
  const destination = destinationId ? getLocation(destinationId) : undefined;
  const destinationRegion = destination?.regions?.[0];
  if (!destinationId || !destination || !destinationRegion) return { ok: false, reason: "目标车站数据缺失，未扣款" };
  const targetRegion = getRegion(destinationRegion);
  if (!targetRegion || !isRegionUnlocked(state, targetRegion)) return { ok: false, reason: "目标区域尚未开放，未扣款" };
  // 买票即乘车流程选择严格晚于当前分钟的下一班：11:00 购票安排 12:00 发车。
  const bought = buyIntercityTicket(state, mode, stationId, { afterCurrent: true });
  if (!bought.ok || !bought.ticket) return bought;
  const ticket = bought.ticket;
  const now = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
  const departure = ticket.departureDay * 1440 + ticket.departureMinute;
  const waitHours = Math.max(0, (departure - now) / 60);
  if (waitHours > 0) advanceHours(state, waitHours);
  const boarded = rideIntercityTicket(state);
  if (!boarded.ok || !boarded.ticket) {
    // 理论上只会在状态被外部并发修改时触发；保留票据避免已付款状态丢失。
    state.intercityTicket = ticket;
    return { ok: false, reason: boarded.reason ?? "发车状态发生变化，车票已保留" };
  }
  pushLog(state, mode === "train" ? "🚆" : "🚌", `已购票并自动乘车：${formatDeparture({ day: ticket.departureDay, minute: ticket.departureMinute })} 发车，预计 ${ticket.durationHours} 小时后到达${destination.name}`);
  return boarded;
}

/** 车站窗口使用的检票入口。只有在购票车站的绑定发车分钟才会成功。 */
export function rideIntercityTicket(state: GameState): TicketOperation {
  const stationId = state.locationId;
  const r = boardIntercityTicket(state, stationId);
  if (!r.ok || !r.ticket) return r;
  const ticket: IntercityTicket = r.ticket;
  const destination = getLocation(ticket.destinationStationId);
  const destinationRegion = destination?.regions?.[0];
  // 检票会先消费车票；若目标区域数据异常或当前仍未解锁，恢复车票，避免玩家无故损失已付款车票。
  if (!destinationRegion) {
    state.intercityTicket = ticket;
    return { ok: false, reason: "目标车站数据缺失" };
  }
  const entered = destinationRegion ? enterRegion(state, destinationRegion) : { ok: false, reason: "目标车站数据缺失" };
  if (!entered.ok) {
    state.intercityTicket = ticket;
    return { ok: false, reason: entered.reason };
  }
  // enterRegion 已经把玩家送到目标城市边缘地图；公共交通下车后不直接落在车站内部。
  state.locationId = "map";
  state.region = destinationRegion;

  syncArea(state);
  if (destination) recordLocationVisited(state, destination.id);
  advanceHours(state, ticket.durationHours);
  state.flags["commuted_once"] = true;
  pushLog(
    state,
    ticket.mode === "train" ? "🚆" : "🚌",
    `乘坐${ticket.mode === "train" ? "火车" : "巴士"}抵达${getRegion(destinationRegion)?.name ?? "目标城市"}边缘（下车点：${destination?.name ?? "边缘车站"}）`,
  );
  return r;
}

/** 进入地点（含出行结算 + 打烊投影判定） */
/** v1.38 携带猫咪时禁止进入的地点（医院/工作/洗浴/餐厅/便利店等，促使玩家把猫放家里） */
const NO_PET_LOCATIONS = new Set([
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

/** 携带猫咪进入禁止场所时的拦截提示 */
function petCarryBlockReason(state: GameState, loc: LocationDef): string | null {
  const pet = activePetOf(state);
  if (!pet || isResidenceLocation(state, loc.id)) return null;
  if (NO_PET_LOCATIONS.has(loc.id)) {
    return `你还带着「${pet.name}」，这类地方不方便带猫咪进入。回家把它放下，或在猫咪面板点「送回家」`;
  }
  return null;
}

function enterLocation(state: GameState, loc: LocationDef): CheckResult {
  if(loc.id==='boyue_texas_shop'){const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;}
  if (loc.weekendNightOnly && !isLocationVisible(state, loc)) {
    return { ok: false, reason: closedReason(loc, state.time.hour, state) };
  }
  const arrivalPreview = stateAfterTravel(state, travelPlan(state, loc).hours);
  if (!isLocationUnlocked(arrivalPreview, loc)) {
    return { ok: false, reason: locationLockReason(arrivalPreview, loc) };
  }

  // v1.38 携带猫咪时，部分场所禁止进入（促进默认把猫放家里）
  const carry = petCarryBlockReason(state, loc);
  if (carry) return { ok: false, reason: carry };

  // 市区↔郊区保留城市边缘落点；涉及开发区的地点按直达方案结算。
  const fromTop = topAreaOfState(state);
  const targetRegions = regionsOfLocation(state, loc);
  const targetTop = targetRegions?.[0] ? topRegionOf(targetRegions[0]) : undefined;
  if (fromTop && targetTop && fromTop !== targetTop && !isDevelopmentRoute(fromTop, targetTop)) {
    const privatePlan = privateIntercityPlan(state);
    if (!privatePlan) {
      return { ok: false, reason: "跨城不能直接前往：请前往巴士站/火车站购票乘车，或使用汽车、电动车、三轮车" };
    }
    const edge = cityEdgeOf(targetTop);
    const arrived = arriveAtCityEdge(state, targetTop, privatePlan);
    if (!arrived.ok) return arrived;
    if (!["internet_cafe", "boyue_internet_cafe"].includes(loc.id)) endNetbarSession(state);
    // 只有目标本身就在城市边缘时才继续进入地点；其他目标停留在边缘地图。
    if (edge && targetRegions?.includes(edge)) {
      if (state.living.awayNight && loc.id === residenceLocationId(state, true)) state.living.awayNight = null;
      state.locationId = loc.id;
      state.region = edge;
      setLocationNavigationPath(state, edge);
      recordLocationVisited(state, loc.id);

      onEnterClothingLocation(state, loc.id);
    }
    return { ok: true };
  }

  const plan = travelPlan(state, loc);
  const blocked = fareBlockReason(state, plan);
  if (blocked) return { ok: false, reason: blocked };
  const developmentTravel = [fromTop, targetTop].some((id) => id === "development" || id === "boyue");
  if (developmentTravel) {
    const interrupted = travelInterruptionReason(state, state.locationId);
    if (interrupted) return { ok: false, reason: interrupted };
  }

  const hours = plan.hours;
  if (hours > 0 || loc.weekendNightOnly || loc.id.startsWith("boyue_")) {
    // 打烊投影：按抵达时刻判定，赶不上就别白跑
    const arrivalState = stateAfterTravel(state, hours);
    const arrive = arrivalState.time.hour + arrivalState.time.minute / 60;
    // 员工按班次到岗；顾客营业时间不拦截已录用员工的当日候场。
    const employedHere = state.career.jobId && getJobDef(state.career.jobId)?.locationId === loc.id;
    const shiftToday = state.career.nextShiftDay === gameDay(state.time);
    if (!isResidenceLocation(state, loc.id) && !isLocationOpen(loc, arrive, arrivalState) && !canArriveEarly(loc, arrive, arrivalState) && !(employedHere && shiftToday)) {
      const phase = locationOpenPhase(loc, arrive, arrivalState);
      const cost = `过去要${hoursLabel(hours).replace("约 ", "")}`;
      return {
        ok: false,
        reason:
          loc.weekendNightOnly ? closedReason(loc, arrive, arrivalState) : phase === "before"
            ? `${cost}，那时还没开门（${loc.openHours?.start}:00 营业）`
            : `${cost}，到那时已经打烊了`,
      };
    }
  }

  // v1.43：网吧机位只在网吧有效；通过准入后再清理，失败的移动保持状态不变。
  if (!["internet_cafe", "boyue_internet_cafe"].includes(loc.id)) endNetbarSession(state);
  payAndLogTravel(state, plan);
  const arrive = (): CheckResult => {
    if (state.living.awayNight && loc.id === residenceLocationId(state, true)) state.living.awayNight = null;
    state.locationId = loc.id;
    recordLocationVisited(state, loc.id);
    state.region = loc.id === "home" ? currentRegion(state) : inferSourceRegion(state, loc);
    syncArea(state);
    setLocationNavigationPath(state, state.region);
    onEnterClothingLocation(state, loc.id);
    if (loc.id === "labor_market") refreshLaborMarket(state);

    state.flags["commuted_once"] = true;
    return { ok: true };
  };
  // 通勤时仍在路上；开发区交通额外防止日历结算后覆写结局或系统落点。
  if (developmentTravel) return advanceDevelopmentTravel(state, hours, arrive);
  advanceHours(state, hours);
  return arrive();
}

/** 统一移动入口：区域 id / 地点 id / "map" 都走这里 */
export function moveTo(state: GameState, targetId: string): CheckResult {
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if (state.flags["hospitalized"] && targetId !== "hospital") {
    return { ok: false, reason: "正在住院，请先在医院办理出院" };
  }
  if (targetId === "gov_residence") targetId = "old_apartment";
  const active = state.work?.active;
  // 旧版允许徒步兼职；暂停挂起该班次，先允许玩家去备车，再继续原进度。
  const deliveryNeedsVehicle = active?.jobId === "job_delivery" && active.source === "delivery"
    && active.status === "paused" && resolveVehicle(state) === "none";
  if (active && !deliveryNeedsVehicle) return { ok: false, reason: "请先完成或继续当前工作班次" };
  if (targetId === "home") targetId = residenceLocationId(state);
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
  if (r.ok) maybeMeetNpc(state, targetId); // v0.99 偶遇：只有成功进入地点才检查 NPC
  return r;
}

/** 出门按钮：地点态回到所属区域视图，无归属则回主地图 */
export function exitLocation(state: GameState): CheckResult {
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if (state.flags["hospitalized"]) return { ok: false, reason: "正在住院，请先在医院办理出院" };
  if (state.locationId === "map") return { ok: false, reason: "已经在地图上了" };
  if (state.locationId === "airport") {
    return enterRegion(state, getRegion("development_airport")?.parent ?? "boyue");
  }
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
