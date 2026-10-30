import {dispatchPayTerms,dispatchWage,validDispatchPay} from '../../lib/streetDispatch/pay.js';
/** v1.465: all work starts a persistent shift and settles once after its challenge. */
import type { GameState, JobDef, JobOffer, ActionResult, Effects, WorkSession, WorkState } from "../types";
import actionsData from '../data/actions.json';
import { grantWorkerDormStay } from './residence';
import { pendingStreetPerformance } from './streetPerformance';
import { randomInt, weightedDraw } from "../rng";
import { applyEffects, advanceTime, collectDeltas, pushLog, triggerCollapse } from "../engine";
import { markLateToday, onWorkDone } from "./tarot";
import { reconcileStatuses } from "./statuses";
import { canWork, guardSurvival } from "./survival";
import { hireJob, getWorkShift, creditWorkedShift, processWorkCalendar, recordCareerProgress } from "./career";
import { recordJob } from "./weekly";
import { currentWeather } from "./weather";
import { gameDay, weekdayOf } from "./calendar";
import { isRestDayOf } from "./workSchedule";
import { priceMultiplier } from "./difficulty";
import { checkJobRequirements as evaluateJobRequirements, hasJobCertificate } from "./jobRequirements";
import { recordClothingWorkMilestone } from "./clothing";
import { deliveryShiftTimeLimit, getMiniGameConfig, gradeOf } from "./minigame";
import jobsData from "../data/jobs.json";
import { recordRemasterAction } from "../data/npcDialogueRemaster";
import locationsData from "../data/locations.json";
import { getRegion, isRegionUnlocked, regionLockReason } from "./regions";

export const JOB_DEFS: JobDef[] = jobsData as JobDef[];
const defMap = new Map(JOB_DEFS.map(job => [job.id, job]));
export const MASTERY_FULL_SHIFTS = 10;
export const SKIP_WAGE_RATIO = 0.8;
/** 手机兼职外卖一天一班，每班八小时，工资取小游戏实际配送收入。 */
export const DELIVERY_DAILY_LIMIT = 1;
export const DELIVERY_SHIFT_MINUTES = 8 * 60;
/** 网约车按班次接单：一天最多开一班，每班十小时。 */
export const RIDE_HAILING_DAILY_LIMIT = 1;
export const RIDE_HAILING_SHIFT_MINUTES = 10 * 60;

export function ensureWorkState(state: GameState): WorkState {
  const work = state.work ??= { masteryMinutes: {}, settledIds: [], wageRecords: [], sequence: 0 };
  normalizeDeliveryParttimeSession(state);
  if (work.active) work.active.canSkip = completedWorkShifts(state, work.active.jobId, work.active.standardMinutes) >= MASTERY_FULL_SHIFTS;
  return work;
}

export function completedWorkShifts(state: GameState, jobId: string, standardMinutes?: number): number {
  const saved = state.work?.completedShifts?.[jobId];
  if (Number.isFinite(saved) && saved! >= 0) return Math.floor(saved!);
  const minutes = standardMinutes ?? (jobId === 'job_delivery' ? DELIVERY_SHIFT_MINUTES : Math.round((defMap.get(jobId)?.duration ?? 1) * 60));
  return Math.max(0, Math.floor((state.work?.masteryMinutes[jobId] ?? 0) / Math.max(1, minutes)));
}

/** 旧一小时兼职会话沿用同一进度和种子，恢复为八小时实际收入班次。 */
export function normalizeDeliveryParttimeSession(state: GameState): void {
  const session = state.work?.active;
  if (!session || session.jobId !== "job_delivery" || session.source !== "delivery") return;
  session.endMinute = session.startMinute + DELIVERY_SHIFT_MINUTES;
  session.workedMinutes = DELIVERY_SHIFT_MINUTES;
  session.standardMinutes = DELIVERY_SHIFT_MINUTES;
  session.baseWage = 0;
  session.canSkip = completedWorkShifts(state, session.jobId, DELIVERY_SHIFT_MINUTES) >= MASTERY_FULL_SHIFTS;
  const key = `delivery_order_${session.day}`;
  state.flags[key] = Math.max(1, Number(state.flags[key] ?? 0));
}

const ACTION_WORK_PROGRESS_JOB: Record<string, string> = {
  steel_shift: "job_factory_line",
  glass_quality_shift: "job_factory_qc",
  aluminum_recycle_shift: "job_loading",
  internet_night_job: "job_netbar_admin",
  boyue_internet_night_job: "job_boyue_netbar_admin",
  market_help_stand: "job_convenience_clerk",
  bus_station_gig: "job_convenience_clerk",
  development_bus_station_gig: "job_boyue_convenience_clerk",
};
// Scene wage actions use the same persistent session and settlement rules as listed jobs.
for (const action of actionsData) {
  const sourceJob=defMap.get(ACTION_WORK_PROGRESS_JOB[action.id]??'');
  if (!sourceJob) continue;
  defMap.set(action.id,{ ...sourceJob, id:action.id, name:action.name, icon:action.icon,
    desc:action.desc??'',kind:'day',locationId:action.locationId,duration:action.duration??1,
    effects:action.effects??{},requirements:action.requirements,sound:action.sound as JobDef['sound'],
    incomeTiers:undefined,moneyRange:undefined,heavy:['steel_shift','glass_quality_shift','aluminum_recycle_shift'].includes(action.id),
  } as JobDef);
}
export function performWageAction(state:GameState, actionId:string):WorkResult {
  const job=defMap.get(actionId);
  return job&&ACTION_WORK_PROGRESS_JOB[actionId]?beginWork(state,job,'site'):{ok:false,reason:'该零工不存在'};
}

/** 普通工资行动也写入统一工作履历、周报和每日目标。 */
export function recordWageActionCompletion(state: GameState, actionId: string, wage: number): boolean {
  const progressJob = getJobDef(ACTION_WORK_PROGRESS_JOB[actionId] ?? "");
  if (!progressJob) return false;
  const day = gameDay(state.time);
  const completedFlag = `worked_${actionId}_${day}`;
  if (state.flags[completedFlag]) return false;
  state.flags[completedFlag] = true;
  state.flags.ever_worked = true;
  if (!state.flags[`job_done_${actionId}`]) {
    state.flags[`job_done_${actionId}`] = true;
    state.flags.jobs_done_count = Number(state.flags.jobs_done_count ?? 0) + 1;
  }
  recordJob(state);
  onWorkDone(state, progressJob.id, wage);
  recordCareerProgress(state, progressJob);
  // 工资行动属于一次实际工作，会中断连续农场帮工。
  state.flags.npc_remaster_farm_help_streak_npc_suburb_farmer = 0;

  const work = ensureWorkState(state);
  const sequence = ++work.sequence;
  work.wageRecords.push({
    id: `action_${actionId}_${day}_${sequence}`,
    jobId: actionId,
    day,
    kind: "day",
    base: wage,
    gameBonus: 0,
    attendanceBonus: 0,
    total: wage,
    note: "劳动行动工资到账",
  });
  if (work.wageRecords.length > 500) work.wageRecords.splice(0, work.wageRecords.length - 500);
  return true;
}

export function nowWorkMinute(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}
export function getJobDef(id: string): JobDef | undefined { return defMap.get(id); }
export function isRestDay(state: GameState, job: JobDef): boolean {
  return isRestDayOf(job, weekdayOf(state.time));
}
export function jobApplicationSuccessChance(state: GameState, job: JobDef): number {
  return checkJobRequirements(state, job).ok ? 1 : 0;
}
export function checkJobRequirements(state: GameState, job: JobDef) {
  return evaluateJobRequirements(state, job);
}
export function internFlagOf(job: JobDef): string | undefined {
  const flag = job.requirements?.flag;
  return flag === "item_certificate" || flag === "item_driving_license" || flag === "item_training_cert"
    ? flag : undefined;
}
export function hasCertificate(state: GameState, flag: string): boolean {
  return hasJobCertificate(state, flag);
}
/** No formal role currently defines an internship track; configured requirements are hard gates. */
export function isIntern(state: GameState, job: JobDef): boolean {
  return checkJobRequirements(state, job).intern;
}
export function applyForJob(state: GameState, job: JobDef, replace = false) {
  return hireJob(state, job, replace);
}
export function fixedJobsOf(locationId: string): JobDef[] {
  return JOB_DEFS.filter(job => job.kind === "formal" && job.locationId === locationId);
}
export function localJobsOf(locationId: string): JobDef[] {
  return JOB_DEFS.filter(job => job.locationId === locationId);
}

export function refreshLaborMarket(state: GameState): void {
  // 旧存档可能仍留有网约车劳务 offer；App 是唯一开班入口，先清除旧名额。
  state.laborMarket.offers = state.laborMarket.offers.filter(offer => offer.jobId !== "job_ride_hailing");
  const today = gameDay(state.time);
  if (state.laborMarket.generatedDay === today) return;
  state.laborMarket.generatedDay = today;
  state.laborMarket.offers = [];
  const pool = JOB_DEFS.filter(job => job.kind === "day" && !job.locationId && job.id !== "job_ride_hailing");
  const starters = pool.filter(job => !job.requirements?.skill && !job.requirements?.flag);
  const count = randomInt(state.rng, 3, 6);
  for (let i = 0; i < count; i++) {
    const candidates = i === 0 && starters.length ? starters : pool;
    const job = weightedDraw(state.rng, candidates.map(item => ({ item, weight: item.weight ?? 1 })));
    if (job) state.laborMarket.offers.push({
      uid: job.id + "_" + today + "_" + i, jobId: job.id, quota: job.quota ?? 1,
    });
  }
}
export function getTodayOffers(state: GameState): Array<{ offer: JobOffer; def: JobDef }> {
  return state.laborMarket.offers.flatMap(offer => {
    const def = defMap.get(offer.jobId);
    return def && def.id !== "job_ride_hailing" && offer.quota > 0 ? [{ offer, def }] : [];
  });
}

export type VehicleType = "none" | "bicycle" | "e_bike" | "tricycle" | "car";
const VEHICLES: VehicleType[] = ["car", "tricycle", "e_bike", "bicycle", "none"];
export function resolveVehicle(state: GameState): VehicleType {
  return VEHICLES.find(type => type !== "none" && !!state.flags["item_" + type]) ?? "none";
}
export function resolveTierForJob(state: GameState, job: JobDef): VehicleType {
  return VEHICLES.slice(VEHICLES.indexOf(resolveVehicle(state))).find(type => !!job.incomeTiers?.[type]) ?? "none";
}
/** Employer supplies baseline equipment; owned vehicle can only improve the job. */
export function mergedJobEffects(state: GameState, job: JobDef): Effects {
  const vehicle = resolveTierForJob(state, job);
  const bonus = { none: 0, bicycle: .05, e_bike: .1, tricycle: .12, car: .15 }[vehicle];
  const tier = vehicle !== "none" ? job.incomeTiers?.[vehicle] : undefined;
  return {
    ...job.effects,
    money: Math.round((job.effects.money ?? 0) * (1 + (job.incomeTiers ? bonus : 0))),
    stamina: tier?.stamina == null ? job.effects.stamina : Math.max(job.effects.stamina ?? 0, tier.stamina),
    stress: tier?.stress == null ? job.effects.stress : Math.min(job.effects.stress ?? 0, tier.stress),
  };
}
export function jobSkillWageMultiplier(state: GameState, job: JobDef): number {
  const keys = Object.keys(job.requirements?.skill ?? job.effects.skills ?? {}) as Array<keyof typeof state.player.skills>;
  const skill = Math.max(0, ...keys.map(key => state.player.skills[key] ?? 0));
  return 1 + Math.min(.3, skill * .015);
}
/** 培训学校逐级结业后，对普通工作和接单收入统一生效。 */
export function skillCertificateWageMultiplier(state: GameState): number {
  const rawLevel = state.flags.skill_certificate_level;
  const savedLevel = typeof rawLevel === "number" && Number.isFinite(rawLevel)
    ? Math.max(0, Math.min(3, Math.floor(rawLevel)))
    : 0;
  const level = Math.max(savedLevel, state.flags.item_training_cert ? 1 : 0);
  return [1, 1.05, 1.1, 1.2][level];
}
function wageEffects(state: GameState, job: JobDef, draw: boolean): Effects {
  const eff = mergedJobEffects(state, job);
  const range = job.moneyRange;
  const raw = range
    ? draw ? randomInt(state.rng, range.min, range.max) : Math.round((range.min + range.max) / 2)
    : eff.money ?? 0;
  const certificate = internFlagOf(job);
  const supplement = certificate && hasCertificate(state, certificate) ? 10 : 0;
  return {
    ...eff,
    money: Math.min(Math.round((job.kind === "formal" ? 170 : 180) * priceMultiplier(state)),
      Math.max(0, Math.round(raw * jobSkillWageMultiplier(state, job) * skillCertificateWageMultiplier(state) * priceMultiplier(state)) + supplement)),
    log: undefined,
  };
}
export function settleJobEffects(state: GameState, job: JobDef): Effects {
  return wageEffects(state, job, true);
}
/** A full shift quote without RNG draws or attendance-dependent proration. */
export function fullShiftWage(state: GameState, job: JobDef): number { return wageEffects(state, job, false).money ?? 0; }
function minigameWageMultiplier(score: number): number {
  const grade = gradeOf(score);
  return grade === "D" ? 0 : grade === "C" ? 0.5 : grade === "B" ? 0.85 : 1;
}
export function workStatusReason(state: GameState): string | undefined {
  if (state.endingId) return "游戏已经结束";
  if (state.flags.hospitalized) return "正在住院，请先出院";
  if (state.player.attrs.stamina <= 0) return "体力耗尽，强行工作会晕倒，请先休息";
  if (state.player.attrs.satiety <= 0) return "饱腹耗尽，强行工作会低血糖晕倒，请先吃饭";
  return canWork(state).reason;
}
function scaledEffects(effects: Effects, ratio: number): Effects {
  const out: Effects = { ...effects, money: undefined, log: undefined };
  const keys = ["stamina", "health", "mood", "hygiene", "satiety", "stress", "intelligence", "charm", "fitness", "fame"] as const;
  for (const key of keys) {
    const value = effects[key];
    if (typeof value === "number") (out as Record<string, unknown>)[key] = Math.round(value * ratio);
  }
  if (effects.skills) out.skills = Object.fromEntries(Object.entries(effects.skills).map(([key, value]) => [key, Math.round((value ?? 0) * ratio * 100) / 100]));
  return out;
}
export function previewWork(state: GameState, job: JobDef) {
  const standardMinutes = Math.round(job.duration * 60);
  const now = nowWorkMinute(state);
  const shift = job.kind === "formal" ? getWorkShift(state, job) : undefined;
  const start = shift && shift.phase !== "none" ? Math.max(now, shift.startMinute) : now;
  const endMinute = shift && shift.phase !== "none" ? shift.endMinute : start + standardMinutes;
  const workedMinutes = Math.max(0, Math.min(standardMinutes, endMinute - start));
  const ratio = workedMinutes / standardMinutes;
  const effects = wageEffects(state, job, false);
  const masteryMinutes = state.work?.masteryMinutes[job.id] ?? 0;
  return {
    duration: workedMinutes / 60, workedMinutes, standardMinutes, endMinute,
    wage: Math.round((effects.money ?? 0) * ratio),
    stamina: Math.round((effects.stamina ?? 0) * ratio * (currentWeather(state) === "heatwave" ? 1.25 : 1)),
    stress: Math.round((effects.stress ?? 0) * ratio),
    masteryMinutes, masteryTarget: standardMinutes * MASTERY_FULL_SHIFTS,
    completedShifts: completedWorkShifts(state,job.id,standardMinutes),
    canSkip: completedWorkShifts(state,job.id,standardMinutes) >= MASTERY_FULL_SHIFTS,
    warning: workStatusReason(state),
  };
}

export interface WorkResult {
  ok: boolean;
  reason?: string;
  crossedDay?: boolean;
  result?: ActionResult;
  session?: WorkSession;
}
function pendingResult(session: WorkSession): ActionResult {
  const job = defMap.get(session.jobId)!;
  return {
    actionId: job.id, icon: job.icon,
    name: session.source === "delivery" && job.id === "job_delivery" ? "兼职外卖" : job.name,
    duration: session.workedMinutes / 60, deltas: [], verdict: "完成工作挑战后结算",
  };
}
export function pauseWork(state: GameState): void {
  if (state.work?.active?.status === "playing") state.work.active.status = "paused";
}
export function resumeWork(state: GameState): WorkSession | undefined {
  const active = ensureWorkState(state).active;
  if (active?.jobId === "job_delivery" && active.source === "delivery" && resolveVehicle(state) === "none") return undefined;
  if (active?.status === "paused") active.status = "playing";
  return active;
}
function beginWork(state: GameState, job: JobDef, source: WorkSession["source"], offer?: JobOffer): WorkResult {
  if (pendingStreetPerformance(state)) return { ok:false,reason:'请先完成本次街头演出' };
  if (state.districtLeisure?.active) return { ok: false, reason: "请先完成当前娱乐活动" };
  const workplace = locationsData.find(location => location.id === job.locationId);
  const lockedRegion = workplace?.regions?.map(getRegion).find(region => region?.openFrom && !isRegionUnlocked(state, region));
  if (lockedRegion) return { ok: false, reason: regionLockReason(state, lockedRegion) };
  const deliveryParttimeShift = job.id === "job_delivery" && source === "delivery";
  // 已暂停的旧班次也必须有车才能继续，不能通过 active 早返回绕过准入。
  if (deliveryParttimeShift && resolveVehicle(state) === "none") {
    return { ok: false, reason: "兼职外卖需要先购买或租用配送车辆（自行车、电动车、三轮车或汽车）" };
  }
  const work = ensureWorkState(state);
  if (work.active) return work.active.jobId === job.id && work.active.source === source
    ? { ok: true, session: work.active, result: pendingResult(work.active) }
    : { ok: false, reason: "请先完成正在进行的工作" };
  if (state.endingId || state.flags.hospitalized) return { ok: false, reason: workStatusReason(state) };
  // 检查司机证照、车辆、应用及当日订单上限应早于体力结算；否则已跑完最后一单的人
  // 体力归零后再点一次，会被误判成强行工作并晕倒，而不是收到“今日已完成”的提示。
  if (job.id === "job_ride_hailing") {
    if (!state.flags.item_driving_license) return { ok: false, reason: "网约车接单需要先取得驾驶证" };
    if (!state.flags.item_car) return { ok: false, reason: "需要自有或租用的汽车才能接网约车订单" };
    if (!state.flags.app_ride_hailing) return { ok: false, reason: "请先在手机应用市场安装网约车软件" };
    if (rideHailingOrdersRemaining(state) <= 0) return { ok: false, reason: "今天已开始过网约车班次，明天再来接单" };
  }
  if (source === "delivery") {
    if (job.id !== "job_ride_hailing" && !state.flags.app_delivery) return { ok: false, reason: "请先安装手机外卖接单软件" };
    if (deliveryOrdersRemaining(state, job.id) <= 0) {
      return { ok: false, reason: job.id === "job_ride_hailing" ? "今天的网约车订单已完成，明天再来接单" : "今天已开始过兼职外卖班次，明天再来接单" };
    }
  }
  const ordinary = canWork(state);
  if (!ordinary.ok) return ordinary;
  if (state.player.attrs.stamina <= 0 || state.player.attrs.satiety <= 0) {
    return guardSurvival(state, "强行工作", triggerCollapse);
  }
  processWorkCalendar(state);
  let day = gameDay(state.time);
  let start = nowWorkMinute(state);
  const standardMinutes = deliveryParttimeShift ? DELIVERY_SHIFT_MINUTES : Math.round(job.duration * 60);
  let end = start + (job.id === "job_ride_hailing" ? RIDE_HAILING_SHIFT_MINUTES : standardMinutes);
  if (job.kind === "formal") {
    if (state.career.jobId !== job.id) return { ok: false, reason: "请先应聘录用，再去单位上班" };
    if (state.locationId !== job.locationId) return { ok: false, reason: "请先前往工作单位" };
    const shift = getWorkShift(state, job);
    if (shift.phase === "none" || shift.phase === "next" || shift.phase === "rest" || shift.day > day)
      return { ok: false, reason: shift.label || "今天没有待上班次" };
    if (start >= shift.endMinute) return { ok: false, reason: "本班已经下班，请查看下一班" };
    if (start < shift.startMinute) {
      advanceTime(state, (shift.startMinute - start) / 60);
      const after = guardSurvival(state, "等候后强行工作", triggerCollapse);
      if (!after.ok) return after;
      start = nowWorkMinute(state);
    }
    if (start > shift.startMinute) markLateToday(state);
    day = shift.day;
    end = shift.endMinute;
    if (state.flags["worked_" + job.id + "_" + day]) return { ok: false, reason: "这班已完成" };
  } else if (source === "site") {
    if (state.locationId !== job.locationId) return { ok: false, reason: "请先到岗位现场" };
    if (state.flags["worked_" + job.id + "_" + day]) return { ok: false, reason: "今天已做过这份工作" };
  } else if (source === "market") {
    if (state.locationId !== "labor_market") return { ok: false, reason: "请先到劳务市场" };
    if (!offer || offer.quota <= 0) return { ok: false, reason: "岗位已招满" };
  }
  const workedMinutes = end - start;
  if (workedMinutes <= 0) return { ok: false, reason: "本班已经结束" };
  const rideHailingShift = job.id === "job_ride_hailing" && source === "delivery";
  const full = source === "delivery"
    ? rideHailingShift
      ? { stamina: job.effects.stamina ?? -65, stress: job.effects.stress ?? 12 }
      : deliveryParttimeShift
        ? { stamina: -50, stress: 10, mood: 1 }
        : { stamina: -10, stress: 3, mood: 1 }
    : settleJobEffects(state, job);
  const actualRatio = source === "delivery" ? 1 : workedMinutes / standardMinutes;
  const effects = scaledEffects(full, actualRatio);
  if (currentWeather(state) === "heatwave" && (effects.stamina ?? 0) < 0)
    effects.stamina = Math.round((effects.stamina ?? 0) * 1.25);
  const session: WorkSession = {
    id: "work_" + day + "_" + ++work.sequence,
    jobId: job.id, kind: job.kind, source, offerUid: offer?.uid,
    day, startMinute: start, endMinute: end, workedMinutes, standardMinutes,
    baseWage: rideHailingShift || deliveryParttimeShift ? 0 : Math.round((full.money ?? 0) * actualRatio), wageBalanceVersion: 2, effects,
    overtime: false,
    seed: randomInt(state.rng, 1, 0x7fffffff),
    canSkip: completedWorkShifts(state,job.id,standardMinutes) >= MASTERY_FULL_SHIFTS,
    status: "playing",
  };
  if (getMiniGameConfig(job.id)?.type === "delivery") {
    session.deliveryTimeLimitSec = deliveryShiftTimeLimit(session.seed);
    const config=getMiniGameConfig(job.id)!;
    if(config.type==='delivery'&&config.mode!=='rideshare'){
      const targetIncome=deliveryParttimeShift?180:Math.min(Math.round(session.baseWage*(1+(config.perfectBonusRate??.05))),(session.kind==='formal'?180:200)*priceMultiplier(state));
      session.deliveryPay=dispatchPayTerms(targetIncome,config.mode==='parcel'?6:10);
      session.completedOrders=0;session.deliveryEarnedFare=0;delete session.effects.log;
    }
  }
  if (rideHailingShift || deliveryParttimeShift) session.completedOrders = 0;
  session.skipBaseWage = session.deliveryPay?.referenceIncome ?? (rideHailingShift ? 125 : deliveryParttimeShift ? 180 : session.baseWage);
  work.active = session;
  if (rideHailingShift) state.flags[rideHailingShiftFlag(day)] = true;
  if (offer) offer.quota--;
  if (source === "delivery" && job.id !== "job_ride_hailing") {
    const key = deliveryOrderFlag(state);
    state.flags[key] = Number(state.flags[key] ?? 0) + 1;
  }
  pushLog(state, job.icon, session.deliveryPay ? `开始「${job.name}」，完班底薪 ¥${session.deliveryPay.base}，按送达订单提成；本班报价已锁定` : deliveryParttimeShift ? "开始「兼职外卖」八小时班次，按小游戏实际配送收入结算" : rideHailingShift ? "开始「" + job.name + "」十小时班次，按实际送达单数结算" : "开始「" + job.name + "」，完成小游戏后结算");
  return { ok: true, session, result: pendingResult(session) };
}
export function performJob(state: GameState, key: string): WorkResult {
  const offer = state.laborMarket.offers.find(item => item.uid === key);
  const job = defMap.get(offer?.jobId ?? key);
  if (!job) return { ok: false, reason: "岗位不存在或已招满" };
  if (job.id === "job_ride_hailing") return { ok: false, reason: "网约车班次只能通过手机网约车 App 开始" };
  if (job.kind === "formal") {
    const started=beginWork(state,job,'formal');
    return job.id.endsWith('_counselor')&&started.ok&&started.session?completeWork(state,started.session.id,0):started;
  }
  if (offer) return beginWork(state, job, "market", offer);
  if (job.locationId) return beginWork(state, job, "site");
  return { ok: false, reason: "请到劳务市场选择今日岗位" };
}
export function takeJobOffer(state: GameState, uid: string): WorkResult & { mode?: "worked" | "scheduled" } {
  const result = performJob(state, uid);
  return { ...result, mode: result.ok ? "worked" : undefined };
}
export function workQuestJob(state: GameState, quest: { jobId?: string; offerUid?: string; day?: number }): WorkResult {
  if (!quest.jobId) return { ok: false, reason: "不是工作任务" };
  if (quest.day != null && quest.day > gameDay(state.time)) return { ok: false, reason: "还未到排班日期" };
  return performJob(state, quest.offerUid ?? quest.jobId);
}
/** 旧版单次参考价，仅保留兼容；手机兼职班次不再以此发薪。 */
export function deliveryParttimeBasePay(state: GameState): number {
  return { none: 15, bicycle: 19, e_bike: 25, tricycle: 22, car: 28 }[resolveVehicle(state)];
}
function deliveryOrderFlag(state: GameState): string {
  return "delivery_order_" + gameDay(state.time);
}
export function rideHailingShiftFlag(day: number): string { return `ride_hailing_shift_started_${day}`; }
export function deliveryOrdersRemaining(state: GameState, jobId = "job_delivery"): number {
  if (jobId === "job_ride_hailing") return rideHailingOrdersRemaining(state);
  const limit = DELIVERY_DAILY_LIMIT;
  return Math.max(0, limit - Number(state.flags[deliveryOrderFlag(state)] ?? 0));
}
export function deliveryParttime(state: GameState): WorkResult & { pay?: number; deltas?: ReturnType<typeof collectDeltas> } {
  const result = beginWork(state, defMap.get("job_delivery")!, "delivery");
  return { ...result, pay: result.session?.baseWage, deltas: [] };
}
/** 固定结算价：每完成一单送达后计 25 元，不叠加评级、证书、技能或物价倍率。 */
export function rideHailingParttimeBasePay(): number { return 25; }
export function rideHailingOrdersRemaining(state: GameState): number {
  return state.flags[rideHailingShiftFlag(gameDay(state.time))] ? 0 : RIDE_HAILING_DAILY_LIMIT;
}
export function rideHailingParttime(state: GameState): WorkResult & { pay?: number; deltas?: ReturnType<typeof collectDeltas> } {
  const job = defMap.get("job_ride_hailing");
  if (!job) return { ok: false, reason: "网约车岗位数据暂不可用" };
  const result = beginWork(state, job, "delivery");
  return { ...result, pay: result.session?.baseWage, deltas: [] };
}

/** The only settlement path. Repeated callbacks cannot grant a second wage or consume time. */
export function completeWork(state: GameState, sessionId: string, scoreRatio = 0, skip = false, endedEarly = false): WorkResult {
  const work = ensureWorkState(state);
  const session = work.active;
  if (!session || session.id !== sessionId || session.status === "settling" || work.settledIds.includes(sessionId))
    return { ok: false, reason: "该班次已结算或不存在" };
  const completedBefore = completedWorkShifts(state, session.jobId, session.standardMinutes);
  if (skip && completedBefore < MASTERY_FULL_SHIFTS) return { ok: false, reason: "本岗位累计完成十次后才能选择跳过" };
  const job = defMap.get(session.jobId);
  if (!job) return { ok: false, reason: "岗位数据不存在" };
  const deliveryParttimeShift = session.jobId === "job_delivery" && session.source === "delivery";
  const rideHailingShift = session.jobId === "job_ride_hailing" && session.source === "delivery" &&
    session.workedMinutes >= RIDE_HAILING_SHIFT_MINUTES;
  const completedOrders = Number.isFinite(session.completedOrders)
    ? Math.max(0, Math.floor(session.completedOrders ?? 0)) : 0;
  const rideCfg = getMiniGameConfig(job.id);
  const satisfactionFare = !skip && rideCfg?.type === "delivery" && rideCfg.mode === "rideshare" &&
    Number.isFinite(session.deliveryEarnedFare);
  const unitFare = rideCfg?.type === "delivery" ? rideCfg.payPerOrder ?? 25 : 25;
  const earnedFare = deliveryParttimeShift
    ? Number.isFinite(session.deliveryEarnedFare) ? Math.round(Math.max(0, session.deliveryEarnedFare ?? 0) * 100) / 100 : 0
    : satisfactionFare
    ? Math.round(Math.min(completedOrders * unitFare, Math.max(0, session.deliveryEarnedFare ?? 0)) * 100) / 100
    : completedOrders * rideHailingParttimeBasePay();
  const piecePay=!skip&&validDispatchPay(session.deliveryPay)?dispatchWage(session.deliveryPay,completedOrders,session.deliveryEarnedFare,!endedEarly):undefined;
  const score = Number.isFinite(scoreRatio) ? Math.max(0, Math.min(1, scoreRatio)) : 0;
  const overtimeBase = session.overtime ? Math.round(session.baseWage * 1.5) : session.baseWage;
  const skipQuote = session.skipBaseWage ?? session.deliveryPay?.referenceIncome ?? (rideHailingShift ? 125 : deliveryParttimeShift ? 180 : session.baseWage);
  const quotedBase = skip ? (session.overtime ? Math.round(skipQuote * 1.5) : skipQuote) : piecePay ? piecePay.total : deliveryParttimeShift || satisfactionFare || rideHailingShift ? earnedFare : overtimeBase;
  const metered = !skip && (!!piecePay || deliveryParttimeShift || satisfactionFare || rideHailingShift);
  const hasWageMinigame = getMiniGameConfig(job.id) !== undefined || !!ACTION_WORK_PROGRESS_JOB[job.id];
  const qualified = skip || (piecePay ? completedOrders>0&&(session.source==='delivery'||score>=.6) : metered ? completedOrders > 0 : !hasWageMinigame || score >= .6);
  const performanceAdjustedBase = !skip && !metered && hasWageMinigame
    ? Math.round(quotedBase * minigameWageMultiplier(score)) : quotedBase;
  const shiftLimit = session.wageBalanceVersion === 2 && !metered
    ? Math.round((session.kind === "formal" ? 180 : 200) * priceMultiplier(state)) : Infinity;
  const base = skip ? Math.round(Math.min(performanceAdjustedBase, shiftLimit) * SKIP_WAGE_RATIO) : Math.min(performanceAdjustedBase, shiftLimit);
  const legacyRideHailingOrder = job.id === "job_ride_hailing" && session.source === "delivery" && !rideHailingShift;
  const bonusRate = legacyRideHailingOrder ? .05 : getMiniGameConfig(job.id)?.perfectBonusRate ?? .05;
  const bonus = metered || skip || score < .6 ? 0 : Math.min(Math.round(overtimeBase * bonusRate * score), Math.max(0, shiftLimit - base));
  // Once a real shift is settled, keep its explicit count independent of legacy work minutes.
  (work.completedShifts ??= {})[job.id] = completedBefore;
  session.status = "settling";
  work.settledIds.push(sessionId);
  if (work.settledIds.length > 512) work.settledIds.shift();
  const elapsedHours = Math.max(0, session.endMinute - nowWorkMinute(state)) / 60;
  const paidEffects: Effects = { ...session.effects, money: session.kind === "day" ? base + bonus : undefined };
  if (!skip && hasWageMinigame && score < .6) paidEffects.skills = undefined;
  const { crossedDay } = advanceTime(state, elapsedHours, () => {
    applyEffects(state, paidEffects, job.icon);
    if (session.kind === "formal") creditWorkedShift(state, session, base, bonus, qualified);
  });
  const pieceText=piecePay?`送达 ${completedOrders} 单，底薪 ¥${piecePay.base} + 订单提成 ¥${piecePay.commission} = 本班工资 ¥${piecePay.total}${endedEarly?'（提前结束，未领取完班底薪）':''}${session.kind==='formal'?'；已记入待发工资，按七日周期结算':'；已到账'}（交通罚款已在配送途中扣除）`:undefined;
  work.wageRecords.push({
    id: session.id, jobId: job.id, day: deliveryParttimeShift || rideHailingShift ? session.day : gameDay(state.time), kind: session.kind === "formal" ? "formal" : "day",
    base, gameBonus: bonus, attendanceBonus: 0, total: base + bonus,
    note: skip ? '自主跳过小游戏，八折工资；班次耗时与发薪周期照常' : pieceText ?? (deliveryParttimeShift ? `送达 ${completedOrders} 单，实际配送收入 ¥${base}（交通罚款已在配送途中扣除）`
      : satisfactionFare ? `实际送达 ${completedOrders} 位乘客，按满意度计酬 ¥${base}`
      : rideHailingShift ? `实际送达 ${completedOrders} 单，每单 ¥${rideHailingParttimeBasePay()}` : !skip && hasWageMinigame && score < .3 ? '未完成有效工作，本班无工资，时间与体力已消耗' : session.kind === "formal" ? "本班工资已计入待发工资" : skip ? "熟练跳过，八折工资" : "下班到账"),
  });
  if (work.wageRecords.length > 500) work.wageRecords.splice(0, work.wageRecords.length - 500);
  if (session.offerUid) {
    state.laborMarket.offers = state.laborMarket.offers.filter(offer => offer.uid !== session.offerUid || offer.quota > 0);
  }
  state.flags["worked_" + job.id + "_" + session.day] = true;
  if (job.requirements?.oncePerDay) state.flags[job.requirements.oncePerDay] = session.day;
  if (qualified) state.flags.ever_worked = true;
  if (qualified && !state.flags["job_done_" + job.id]) {
    state.flags["job_done_" + job.id] = true;
    state.flags.jobs_done_count = Number(state.flags.jobs_done_count ?? 0) + 1;
  }
  if (qualified) {
  recordJob(state);
  onWorkDone(state, job.id, session.kind === "day" ? base + bonus : 0);
  recordCareerProgress(state, defMap.get(ACTION_WORK_PROGRESS_JOB[job.id]??'')??job);
  if (['steel_shift','glass_quality_shift','aluminum_recycle_shift'].includes(job.id)) grantWorkerDormStay(state);
  if (job.locationId) recordClothingWorkMilestone(state, job.locationId);
  recordRemasterAction(state, { kind: "work_completed", jobId: session.jobId, workedMinutes: session.workedMinutes });
  for (const quest of state.quests ?? []) {
    if (quest.type === "job" && quest.jobId === job.id && quest.day === session.day &&
        (quest.status === "pending" || quest.status === "active")) quest.status = "done";
  }
  work.masteryMinutes[job.id] = (work.masteryMinutes[job.id] ?? 0) + session.workedMinutes;
  if (!endedEarly) (work.completedShifts ??= {})[job.id] = completedBefore + 1;
  }
  delete work.active;
  processWorkCalendar(state);
  reconcileStatuses(state, { heavyWork: job.heavy, staminaCost: -(paidEffects.stamina ?? 0) });
  const payText = skip ? `自选跳过小游戏，${session.kind === 'formal' ? '记入待发' : '到账'} ¥${base}（工资 80%）` : pieceText ?? (deliveryParttimeShift ? `送达 ${completedOrders} 单，实际配送收入 ¥${base}（交通罚款已在配送途中扣除）` : satisfactionFare ? `送达 ${completedOrders} 位乘客，满意度车费到账 ¥${base}` : rideHailingShift
    ? `完成 ${completedOrders} 单，到账 ¥${base}`
    : (session.kind === "day" ? "到账" : "记入待发") + " ¥" + (base + bonus));
  pushLog(state, "💼", job.name + "下班，" + payText);
  if (completedBefore < MASTERY_FULL_SHIFTS && completedWorkShifts(state,job.id,session.standardMinutes) >= MASTERY_FULL_SHIFTS)
    pushLog(state, "⭐", job.name + "已完成十次：今后可选择跳过小游戏领取八折工资，也可照常挑战领取完整工资和表现奖励");
  return { ok: true, crossedDay, result: {
    actionId: job.id, icon: job.icon, name: session.source === "delivery" && job.id === "job_delivery" ? "兼职外卖" : job.name,
    duration: session.workedMinutes / 60, deltas: collectDeltas(paidEffects), sound: job.sound,
    verdict: piecePay || deliveryParttimeShift ? payText : payText + "（基础 ¥" + base + "，表现奖金 ¥" + bonus + "）" + (!qualified ? '。本班表现未达标，不累计熟练度与职业进度；已消耗的时间和体力不会退还。' : ''), quality: skip ? undefined : score,
  } };
}
