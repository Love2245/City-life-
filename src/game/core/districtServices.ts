import type { ActionDef, Effects, GameState } from "../types";
import { applyEffects, pushLog, triggerCollapse } from "../engine";
import { randomInt } from "../rng";
import { DISTRICT_FORTUNES, type DistrictFortune } from "../data/districtFortunes";
import { getDistrictExhibition } from "../data/districtExhibitions";
import { gameDay, linearDay, weekdayOf } from "./calendar";
import { advanceHours, sleep } from "./time";
import { scaleCost } from "./difficulty";
import { guardCollapse } from "./fatigue";
import { reconcileStatuses } from "./statuses";
import { residenceLocationId, residenceRegion } from "./residence";
import { regionPathOf } from "./regions";
import { consumePerfectDanceDrink, hasPerfectDanceDrink } from "./districtLeisure";
import { itemCount, removeItem } from './items';
import { LOUNGE_BEER_COUPON } from '../data/npcIntroductionProgress';

export interface DistrictServicesState {
  fortune?: { day: number; id: string };
  clinicWeek?: number;
  hikeDay?: number;
  alcoholCups: number;
  alcoholWarning?: 3 | 5 | 6;
}
/** 第六杯酒导致的额外昏睡时长。界面预告与结算使用同一个常量。 */
export const DISTRICT_ALCOHOL_BLACKOUT_HOURS = 8;
export function normalizeDistrictServices(state: GameState): void {
  const old = state.districtServices;
  state.districtServices = {
    alcoholCups: Number.isFinite(old?.alcoholCups) ? Math.max(0, Math.min(6, Math.floor(old!.alcoholCups))) : 0,
    ...(old?.fortune && Number.isSafeInteger(old.fortune.day) && DISTRICT_FORTUNES.some(f => f.id === old.fortune!.id) ? { fortune: old.fortune } : {}),
    ...(Number.isSafeInteger(old?.clinicWeek) ? { clinicWeek: old!.clinicWeek } : {}),
    ...(Number.isSafeInteger(old?.hikeDay) ? { hikeDay: old!.hikeDay } : {}),
  };
  state.player.hikingStaminaCapBonus = Number.isFinite(state.player.hikingStaminaCapBonus)
    ? Math.max(0, Math.min(20, Math.floor(state.player.hikingStaminaCapBonus!))) : 0;
  if ((state.inventory.fishing_rod ?? 0) > 0) state.flags.fishing_rod_owned = true;
  if ((state.inventory.fishing_bucket ?? 0) > 0) state.flags.fishing_bucket_owned = true;
}
function serviceState(state: GameState): DistrictServicesState {
  return state.districtServices ??= { alcoholCups: 0 };
}
export function clinicWeekOf(state: GameState): number {
  return linearDay(state.time) - weekdayOf(state.time);
}
export function todayDistrictFortune(state: GameState): DistrictFortune | undefined {
  const saved = state.districtServices?.fortune;
  return saved?.day === gameDay(state.time) ? DISTRICT_FORTUNES.find(f => f.id === saved.id) : undefined;
}
export function pickDistrictFortune(roll: number, fortunes: DistrictFortune[] = DISTRICT_FORTUNES): DistrictFortune | undefined {
  let remaining = roll;
  return fortunes.find((fortune) => { remaining -= fortune.weight; return remaining <= 0; }) ?? fortunes[fortunes.length - 1];
}
export function isDistrictService(action: ActionDef): boolean {
  return !!action.handler?.startsWith("district_");
}
export function checkDistrictService(state: GameState, action: ActionDef): { ok: boolean; reason?: string } {
  if (action.handler === "district_placeholder") return { ok: false, reason: "尚未开放" };
  if (state.locationId !== action.locationId) return { ok: false, reason: "请先前往提供这项服务的地点" };
  const now = state.time.hour + state.time.minute / 60;
  if (action.id === "boyue_lounge_coupon_drink") {
    if (state.region !== "boyue_night_market" || (now >= 6 && now < 18)) return { ok: false, reason: "请在清吧营业时间前来兑换" };
    if (itemCount(state, LOUNGE_BEER_COUPON) < 1) return { ok: false, reason: "需要一张清吧啤酒券" };
  }
  if (["district_fortune", "district_clinic"].includes(action.handler ?? "") && (now < 6 || now >= 18)) {
    return { ok: false, reason: "道观服务时间为6:00—18:00" };
  }
  if (action.handler === "district_fortune") {
    if (state.flags.church_baptized) return { ok: false, reason: "已受洗，不能抽签；仍可领粥、义诊和登山" };
    if (todayDistrictFortune(state)) return { ok: false, reason: "今天已经抽过签，可以在下方重读签文" };
  }
  if (action.handler === "district_clinic" && state.districtServices?.clinicWeek === clinicWeekOf(state)) {
    return { ok: false, reason: "本周已参加义诊，下周一恢复额度" };
  }
  if (action.handler === "district_hike" && state.districtServices?.hikeDay === gameDay(state.time)) {
    return { ok: false, reason: "今天已经登过山，明天再来吧" };
  }
  if (action.handler === "district_free_drink" && !hasPerfectDanceDrink(state)) {
    return { ok: false, reason: "本营业夜跳舞满分后可领取一次基础酒，资格在6:00失效" };
  }
  if (action.handler === "district_singer") return { ok: false, reason: "请使用驻唱节奏活动入口" };
  return { ok: true };
}
type ServiceResult = { ok: false; reason: string } | { ok: true; effects: Effects; duration: number; verdict: string; crossedDay: boolean };
export function performDistrictService(state: GameState, action: ActionDef): ServiceResult {
  const check = checkDistrictService(state, action);
  if (!check.ok) return { ok: false, reason: check.reason ?? "暂不可进行" };
  const services = serviceState(state);
  const beforeDay = linearDay(state.time);
  let effects: Effects = { ...action.effects };
  let duration = action.duration ?? 0;
  let verdict = action.desc;
  if (action.handler === "district_fortune") {
    const fortune = pickDistrictFortune(randomInt(state.rng, 1, 100));
    if (!fortune) return { ok: false, reason: "签文数据缺失" };
    services.fortune = { day: gameDay(state.time), id: fortune.id };
    effects = { mood: fortune.mood };
    verdict = `${fortune.name}\n\n${fortune.text}\n\n解读：${fortune.interpretation}`;
  } else if (action.handler === "district_clinic") {
    services.clinicWeek = clinicWeekOf(state);
    effects = { health: 10, satiety: 10 };
    verdict = "道长仔细问过近况，送来热饭，叮嘱你按时吃饭、好好休息。";
  } else if (action.handler === "district_hike") {
    const guard = guardCollapse(state, action.name, triggerCollapse);
    if (!guard.ok) return { ok: false, reason: guard.reason ?? "需要休息" };
    services.hikeDay = gameDay(state.time);
    const old = state.player.hikingStaminaCapBonus ?? 0;
    state.player.hikingStaminaCapBonus = Math.min(20, old + 1);
    effects = { stamina: -40, mood: 5, fitness: 1 };
    verdict = old >= 20 ? "熟悉的山道走到尽头，山风吹散了疲惫。你在树荫下歇了一会儿。"
      : "一步步走上山顶，山风迎面而来。你感觉脚步比从前稳当了一些。";
  } else if (action.handler === "district_exhibition") {
    const e = getDistrictExhibition(action.locationId, state.time.month);
    if (!e) return { ok: false, reason: "展览数据缺失" };
    verdict = `参观了「${e.currentTheme?.name ?? e.title}」。${e.currentTheme?.desc ?? e.intro}`;
  } else if (action.handler === "district_alcohol" || action.handler === "district_free_drink") {
    if (action.id === "boyue_lounge_coupon_drink" && !removeItem(state, LOUNGE_BEER_COUPON, 1)) return { ok: false, reason: "啤酒券已经使用" };
    if (action.handler === "district_free_drink" && !consumePerfectDanceDrink(state)) return { ok: false, reason: "领酒资格已过期或已领取" };
    effects = { ...effects, ...(action.handler === "district_alcohol" ? { money: -scaleCost(state, Math.abs(action.effects.money ?? 0)) } : { money: 0 }), health: -1, stamina: -2 };
    services.alcoholCups = Math.min(6, services.alcoholCups + 1);
    services.alcoholWarning = services.alcoholCups === 3 ? 3 : services.alcoholCups === 5 ? 5 : services.alcoholCups === 6 ? 6 : undefined;
    verdict = "杯中的酒慢慢见底，暖意泛上脸颊。";
    if (services.alcoholCups === 3) verdict = "你有些微醺。酒保递来一杯水，劝你慢一点喝。";
    if (services.alcoholCups === 5) verdict = "视线开始发飘，站稳都有些费劲。酒保收起酒杯，劝你今晚到此为止。";
  }
  if (action.requirements?.oncePerDay) state.flags[action.requirements.oncePerDay] = gameDay(state.time);
  applyEffects(state, effects, action.icon);
  advanceHours(state, duration);
  if (action.handler === "district_hike") reconcileStatuses(state, { heavyWork: true, staminaCost: 40 });
  if (services.alcoholCups >= 6) {
    const fare = Math.min(20, Math.max(0, state.player.money));
    applyEffects(state, { money: -fare });
    state.locationId = residenceLocationId(state);
    state.region = residenceRegion(state);
    state.area = state.region;
    state.navStack = ["map", ...regionPathOf(state.region)];
    sleep(state, DISTRICT_ALCOHOL_BLACKOUT_HOURS);
    applyEffects(state, { health: -10, mood: -15 });
    effects = { ...effects, money: (effects.money ?? 0) - fare, health: -11, mood: (effects.mood ?? 0) - 15 };
    duration += DISTRICT_ALCOHOL_BLACKOUT_HOURS;
    services.alcoholWarning = 6;
    verdict = "记忆停在了吧台前。醒来时，你已经回到住处，床边放着一杯水。";
  }
  pushLog(state, action.icon, verdict);
  return { ok: true, effects, duration, verdict, crossedDay: beforeDay !== linearDay(state.time) };
}
