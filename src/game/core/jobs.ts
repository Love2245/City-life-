/**
 * 工作机会系统：日结工每日刷新劳务市场、固定岗位校验、证书实习期。
 * 纯逻辑层。
 */
import type { GameState, JobDef, JobOffer, ActionResult, Skills } from "../types";
import { randomInt, weightedDraw } from "../rng";
import { applyEffects, advanceTime, collectDeltas, pickVerdict, pushLog, triggerCollapse, type Effects } from "../engine";
import { checkRequirements, isLocationOpen, getLocation, closedReason } from "./actions";
import { onWorkDone, markLateToday } from "./tarot";
import { reconcileStatuses } from "./statuses";
import { isStaminaZero } from "./fatigue";
import { canWork, guardSurvival } from "./survival";
import { enterRegion, goToMap } from "./regions";
import { applyJob } from "./career";
import { recordJob, recordMoney } from "./weekly";
import { isReferred } from "./contacts";
import { currentWeather } from "./weather";
import { fameIncomeMult } from "./stats";
import { gameDay, weekdayLabel, weekdayOf } from "./calendar";
import {
  isPunctual,
  latenessOfJob,
  latePenalty,
  formatDuration,
  acceptJobQuest,
  completeJobQuest,
  failJobQuest,
  jobQuestOfToday,
  markGoalWorked, // v1.215：上班成功标记「干一次活」每日目标（dailyGoals.test.ts）
  type LatePenalty,
} from "./quests";
import jobsData from "../data/jobs.json";

export const JOB_DEFS: JobDef[] = jobsData as JobDef[];

const defMap = new Map(JOB_DEFS.map((j) => [j.id, j]));

/** v0.95 热浪：有体力消耗的工作额外 +25% 消耗 */
function heatwaveStaminaBoost(state: GameState, eff: Effects): void {
  if (currentWeather(state) === "heatwave" && (eff.stamina ?? 0) < 0) {
    state.player.attrs.stamina = Math.max(0, state.player.attrs.stamina - Math.round(-(eff.stamina ?? 0) * 0.25));
  }
}

/** v0.965 工作质量分：正常 0.85，迟到扣至 0.4（负责人对话依据） */
function jobQualityOf(punchPenaltyRatio: number): number {
  return punchPenaltyRatio >= 1 ? 0.85 : 0.4;
}

/** v0.97 该岗今天是否休息日（缺省每周六休；双休岗周六日；自由接单岗不休） */
export function isRestDay(state: GameState, job: JobDef): boolean {
  // v1.20：日结工没有双休限制，每天都可以工作
  if (job.kind === "day") return false;
  const days = job.restDays ?? ["sat"];
  if (days.length === 0) return false;
  // restDays 存英文标识（sat/sun），星期映射：周六=5、周日=6
  const w = weekdayOf(state.time);
  const key = w === 5 ? "sat" : w === 6 ? "sun" : undefined;
  return key ? days.includes(key) : false;
}

/** v0.97 休息日提示文案 */
function restReason(state: GameState, job: JobDef): string {
  return `${job.name}今天休息（${weekdayLabel(state.time)}）`;
}

export function getJobDef(id: string): JobDef | undefined {
  return defMap.get(id);
}

/* ==================== 证书实习期（v0.89） ==================== */

/** 证书类 flag：允许无证实习（工资 50%，累计 3 个工作日自动发证） */
const CERTIFICATE_FLAGS = ["item_certificate", "item_driving_license"];

const FLAG_NAMES: Record<string, string> = {
  item_certificate: "技能证书",
  item_driving_license: "驾驶本",
  item_driving_course: "学车报名",
  item_laptop: "笔记本电脑",
  item_training_cert: "培训证书", // v1.10：培训学校结业证书（不参与实习换证闭环）
};

function flagName(flag: string): string {
  return FLAG_NAMES[flag] ?? flag;
}

function getAttrValueOf(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

/** 岗位要求的证书 flag（无则 undefined） */
export function internFlagOf(job: JobDef): string | undefined {
  const f = job.requirements?.flag;
  return f && CERTIFICATE_FLAGS.includes(f) ? f : undefined;
}

/**
 * v1.20 持证判定：拥有对应证书即视为持证；
 * 培训学校的结业证书（item_training_cert）升级为「万能证书」，可解锁所有需要技能证书的岗位。
 */
export function hasCertificate(state: GameState, flag: string): boolean {
  if (state.flags[flag]) return true;
  if (flag === "item_certificate" && state.flags["item_training_cert"]) return true;
  return false;
}

/** 是否处于实习态：岗位要求证书且玩家无证（内推则免实习） */
export function isIntern(state: GameState, job: JobDef): boolean {
  const flag = internFlagOf(job);
  if (!flag) return false;
  if (isReferred(state, job.id)) return false;
  return !hasCertificate(state, flag);
}

/**
 * 岗位需求校验（实习友好版）：
 * - attr/skill/money 严格校验
 * - 证书类 flag 缺失 → 放行并标记 intern（进入实习）
 * - 非证书 flag 缺失 → 拒绝
 */
export function checkJobRequirements(
  state: GameState,
  job: JobDef,
): { ok: boolean; reason?: string; intern?: boolean } {
  const intern = isIntern(state, job);
  const req = job.requirements;
  // v1.20 万能证书：持有培训结业证书 → 所有需要技能证书的岗位完全解锁（含技能门槛）
  const masterCert = req?.flag === "item_certificate" && state.flags["item_training_cert"];
  if (req?.attr) {
    for (const [key, need] of Object.entries(req.attr)) {
      const cur = getAttrValueOf(state, key);
      if (cur < (need ?? 0)) return { ok: false, reason: `${key}不足（需 ${need}）` };
    }
  }
  if (req?.skill && !masterCert) {
    for (const [key, need] of Object.entries(req.skill)) {
      const k = key as keyof Skills;
      if (state.player.skills[k] < (need ?? 0)) return { ok: false, reason: `技能不足（需 ${need}）` };
    }
  }
  if (req?.money && state.player.money < req.money) {
    return { ok: false, reason: `金钱不足（需 ${req.money}）` };
  }
  // 证书门槛：内推（referral_<jobId>）可免证书直接入职；培训结业证书为万能证书（v1.20）
  if (req?.flag && !masterCert && !intern && !hasCertificate(state, req.flag) && !isReferred(state, job.id)) {
    return { ok: false, reason: `缺少${flagName(req.flag)}` };
  }
  return { ok: true, intern };
}

/**
 * 实习期结算：工资减半 + 累计工作日（同日幂等）。
 * 满 3 天 → 发证 + 日志，下一班起恢复全额（本次仍按实习折半）。
 */
function applyInternPay(state: GameState, job: JobDef, eff: Effects): Effects {
  if (!isIntern(state, job)) return eff;
  const flag = internFlagOf(job)!;
  const c = state.career;
  if (c.internLastDay !== gameDay(state.time)) {
    c.internDays[job.id] = (c.internDays[job.id] ?? 0) + 1;
    c.internLastDay = gameDay(state.time);
  }
  const total = c.internDays[job.id];
  const after = Math.round((eff.money ?? 0) * 0.5);
  if (total >= 3) {
    state.flags[flag] = true;
    c.internDays[job.id] = 0;
    pushLog(state, "🎓", `实习满 3 天，正式获得${flagName(flag)}！下一班起恢复全额工资`);
  } else {
    pushLog(state, "📋", `实习期第 ${total}/3 天，工资减半：${after} 元`);
  }
  return { ...eff, money: after };
}

/** 跨天则重建今日岗位池（v0.93：3~6 个 day 岗位；保底含 1 个低门槛岗，确保玩家总能找到活） */
export function refreshLaborMarket(state: GameState): void {
  if (state.laborMarket.generatedDay === gameDay(state.time)) return;
  state.laborMarket.generatedDay = gameDay(state.time);
  state.laborMarket.offers = [];
  const pool = JOB_DEFS.filter((j) => j.kind === "day" && !j.locationId);
  if (pool.length === 0) return;
  const n = randomInt(state.rng, 3, 6);
  const lowBarrier = pool.filter((j) => !j.requirements?.skill && !j.requirements?.flag);
  const picked: JobDef[] = [];
  // v0.93 保底：优先放入一个无技能/无证书门槛的岗，保证「总能找到活干」
  if (lowBarrier.length > 0) {
    const g = weightedDraw(state.rng, lowBarrier.map((j) => ({ item: j, weight: j.weight ?? 1 })));
    if (g) picked.push(g);
  }
  const remaining = n - picked.length;
  for (let i = 0; i < remaining; i++) {
    const job = weightedDraw(state.rng, pool.map((j) => ({ item: j, weight: j.weight ?? 1 })));
    if (job) picked.push(job);
  }
  for (const job of picked) {
    state.laborMarket.offers.push({
      uid: `${job.id}_${state.laborMarket.offers.length}`,
      jobId: job.id,
      quota: job.quota ?? 1,
    });
  }
}

/** 当前交通工具档位 */
export type VehicleType = "none" | "bicycle" | "e_bike" | "tricycle" | "car";
/** 载具优先级（高→低），用于"持高档载具跑低档岗"时回退到岗位支持的最高档 */
const VEHICLE_PRIORITY: VehicleType[] = ["car", "tricycle", "e_bike", "bicycle", "none"];

export function resolveVehicle(state: GameState): VehicleType {
  if (state.flags["item_car"]) return "car";
  if (state.flags["item_tricycle"]) return "tricycle";
  if (state.flags["item_e_bike"]) return "e_bike";
  if (state.flags["item_bicycle"]) return "bicycle";
  return "none";
}

/** 岗位支持的载具档（incomeTiers 键）；当前车辆不在其中时回退到比它低一档的岗位支持档 */
export function resolveTierForJob(state: GameState, job: JobDef): VehicleType {
  if (!job.incomeTiers) return "none";
  const current = resolveVehicle(state);
  if (job.incomeTiers[current]) return current;
  // v1.215 修复（P1-7）：回退只向「低档」方向走——持 e_bike 跑快递时，
  // 原实现从高到低遍历先命中 tricycle（+33% 最高档），报酬错档；现在 e_bike 未支持则依次试 bicycle/none。
  const idx = VEHICLE_PRIORITY.indexOf(current);
  for (let i = idx; i < VEHICLE_PRIORITY.length; i++) {
    const v = VEHICLE_PRIORITY[i];
    if (job.incomeTiers[v]) return v;
  }
  return "none";
}

/** 合并 incomeTiers 覆盖基础 effects（纯函数） */
export function mergedJobEffects(state: GameState, job: JobDef): Effects {
  const tier = job.incomeTiers?.[resolveTierForJob(state, job)];
  if (!tier) return job.effects;
  return {
    ...job.effects,
    money: tier.money,
    stamina: tier.stamina ?? job.effects.stamina,
    stress: tier.stress ?? job.effects.stress,
    log: tier.log ?? job.effects.log,
  };
}

/** 结算版 effects：浮动工资区间 + log {money} 占位替换（走 rng 可复现） */
export function settleJobEffects(state: GameState, job: JobDef): Effects {
  const tier = job.incomeTiers?.[resolveTierForJob(state, job)];
  const eff = mergedJobEffects(state, job);
  let money = eff.money ?? 0;
  let log = eff.log ?? "";
  const range = tier?.moneyRange ?? job.moneyRange;
  if (range) {
    money = randomInt(state.rng, range.min, range.max);
  }
  // v1.20 持证上岗补贴：需要证书的岗位，持证者每次上班额外 +10 元
  const certBonus = certifiedBonus(state, job);
  money += certBonus;
  const tpl = tier?.log ?? job.effects.log ?? "";
  if (tpl.includes("{money}")) {
    log = tpl.replace("{money}", String(money));
  } else if (tier?.log) {
    log = tier.log;
  }
  if (certBonus > 0) log = `${log}（持证补贴 +${certBonus} 元）`;
  return { ...eff, money, log };
}

/** 持证上岗补贴金额：岗位要求证书且玩家持证 → 10 元（实习期无证不补） */
function certifiedBonus(state: GameState, job: JobDef): number {
  const flag = job.requirements?.flag;
  if (!flag || !CERTIFICATE_FLAGS.includes(flag)) return 0;
  return hasCertificate(state, flag) ? 10 : 0;
}

/** 工作后若地点打烊，按 region 回退到区域或主地图 */
function kickJobToMap(state: GameState): void {
  if (state.locationId === "map") return;
  const loc = getLocation(state.locationId);
  if (loc && !isLocationOpen(loc, state.time.hour)) {
    if (state.region) {
      enterRegion(state, state.region);
      pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了街上");
    } else {
      goToMap(state);
      pushLog(state, "🗺️", "天色已晚，这里打烊了，你回到了主地图");
    }
  }
}

/**
 * 到岗打卡判定（三分支共用）。
 * - 不需按时 / 准点 → { blocked: false, penalty.ratio = 1 }
 * - 迟到未超 2h → 不阻断，返回折算系数与心情惩罚
 * - 迟到超 2h → 判旷工，阻断上班。
 *   罚款只在**玩家已接下当日任务**时收取（违约金语义）：没接过的活儿单纯"轮不到你"，不罚钱。
 */
function punchIn(state: GameState, job: JobDef): { blocked: boolean; reason?: string; penalty: LatePenalty } {
  const late = latenessOfJob(state, job);
  const penalty = latePenalty(late);
  if (!isPunctual(job) || late <= 0) {
    return { blocked: false, penalty: latePenalty(0) };
  }
  markLateToday(state); // v0.985：当日迟到 → 打断「皇帝」的连续守序天数
  if (penalty.absent) {
    const accepted = jobQuestOfToday(state, job);
    if (accepted) {
      state.player.money -= penalty.fine;
      recordMoney(state, -penalty.fine); // v1.215 修复（P1-10）：旷工罚款计入周记支出
      state.player.attrs.mood = Math.max(0, state.player.attrs.mood + penalty.moodPenalty);
      failJobQuest(state, job, penalty.fine);
      const reason = `迟到 ${formatDuration(late)}，主管让你今天别干了，还罚了 ${penalty.fine} 元`;
      pushLog(state, "⏰", reason);
      return { blocked: true, reason, penalty };
    }
    const reason = `这活儿 ${job.startHour}:00 就开工了，你晚了 ${formatDuration(late)}，人家不要你了`;
    return { blocked: true, reason, penalty };
  }
  return { blocked: false, penalty };
}

/** 把迟到折算系数施加到当日结算 effects 上（day / fixed 岗当场发钱） */
function applyLateToEffects(state: GameState, eff: Effects, penalty: LatePenalty, late: number): Effects {
  if (penalty.ratio >= 1) return eff;
  const before = eff.money ?? 0;
  const after = Math.round(before * penalty.ratio);
  pushLog(state, "⏰", `迟到 ${formatDuration(late)}，今天的工钱被扣到 ${after} 元（原 ${before} 元）`);
  return {
    ...eff,
    money: after,
    mood: (eff.mood ?? 0) + penalty.moodPenalty,
  };
}

/** 某地点的固定岗位（双入口渲染用） */
export function fixedJobsOf(locationId: string): JobDef[] {
  return JOB_DEFS.filter((j) => j.kind === "fixed" && j.locationId === locationId);
}

/** 某地点的全部本地岗位（日结/周结/月结/固定，场景渲染用） */
export function localJobsOf(locationId: string): JobDef[] {
  return JOB_DEFS.filter((j) => j.locationId === locationId);
}

/** 从劳务市场接活（uid）或固定岗位（jobId）：校验 → 结算 → 推进时长 */
/**
 * 标记完成过某工作。仅在新工作种类时累加 jobs_done_count（不同工种数）。
 * v0.985：同时喂给塔罗计数器——paid>0 计入「魔术师·首次有偿工作」，工种去重计入「死神·换过 5 种工作」。
 * @param paid 本次当场到手的工资（周结/月结岗当日为 0，工资在 career.paycheck 结算）
 */
function markJobDone(state: GameState, jobId: string, paid: number): void {
  state.flags["ever_worked"] = true;
  recordJob(state); // v1.10 周记：完成一次工作
  if (state.flags["job_done_" + jobId] !== true) {
    state.flags["job_done_" + jobId] = true;
    const prev = typeof state.flags["jobs_done_count"] === "number" ? (state.flags["jobs_done_count"] as number) : 0;
    state.flags["jobs_done_count"] = prev + 1;
  }
  onWorkDone(state, jobId, paid);
}

export function performJob(
  state: GameState,
  key: string,
): { ok: boolean; reason?: string; crossedDay?: boolean; result?: ActionResult } {
  // v0.92 生存准入：抑郁症 / 干净度过低 → 直接无法上班（先于疲劳判定，给出明确原因）
  const work = canWork(state);
  if (!work.ok) return { ok: false, reason: work.reason };

  // 生存兜底（v0.93 行为变更）：不再以时间为硬阻断，只要体力>0 凌晨也能上班。
  // 仅体力归零或饱腹归零时仍强行工作 → 晕倒（低血糖/力竭），由 guardSurvival 处理。
  if (isStaminaZero(state) || state.player.attrs.satiety <= 0) {
    const g = guardSurvival(state, "在极度疲惫时强行工作", triggerCollapse);
    if (!g.ok) return { ok: false, reason: g.reason };
  }

  // 固定岗 + 地点型日结岗（如流水线/分拣）：按 jobId 直查，走打烊/迟到/实习/结算（无 quota；v0.89）
  const fixedJob = defMap.get(key);
  // v1.06：同日防重复（固定岗/地点型日结岗每天限一次）
  const _todayGuard = `worked_${key}_${gameDay(state.time)}`;
  if (fixedJob && (fixedJob.kind === "fixed" || (fixedJob.kind === "day" && !!fixedJob.locationId))) {
    if (state.flags[_todayGuard]) return { ok: false, reason: "今天已经上过班了，明天再来" };
    // v0.97 休息日拦截
    if (isRestDay(state, fixedJob)) return { ok: false, reason: restReason(state, fixedJob) };
    // 打烊校验（固定岗所属地点关闭时不可上班）
    if (fixedJob.locationId && !isLocationOpen(getLocation(fixedJob.locationId), state.time.hour)) {
      // v0.935：区分「还没开门」与「已打烊」，并提示营业时间
      const why = closedReason(getLocation(fixedJob.locationId), state.time.hour);
      return { ok: false, reason: `岗位地点${why || "已打烊"}` };
    }
    const check = checkJobRequirements(state, fixedJob);
    if (!check.ok) return check;
    // 到岗打卡：迟到超 2h 直接判旷工
    const lateFixed = latenessOfJob(state, fixedJob);
    const punchFixed = punchIn(state, fixedJob);
    if (punchFixed.blocked) return { ok: false, reason: punchFixed.reason };
    let eff = applyLateToEffects(state, settleJobEffects(state, fixedJob), punchFixed.penalty, lateFixed);
    // 证书实习期：工资减半 + 累计 3 天发证（v0.89）
    eff = applyInternPay(state, fixedJob, eff);
    applyEffects(state, eff, fixedJob.icon);
    heatwaveStaminaBoost(state, eff);
    markJobDone(state, fixedJob.id, eff.money ?? 0);
    state.flags[_todayGuard] = true;
    markGoalWorked(state); // v1.215：完成工作标记「干一次活」每日目标
    completeJobQuest(state, fixedJob);
    const { crossedDay } = advanceTime(state, fixedJob.duration ?? 8);
    reconcileStatuses(state, {
      heavyWork: fixedJob.heavy,
      staminaCost: -(eff.stamina ?? 0),
    });
    kickJobToMap(state);
    return {
      ok: true,
      crossedDay,
      result: {
        actionId: fixedJob.id,
        icon: fixedJob.icon,
        name: fixedJob.name,
        duration: fixedJob.duration ?? 8,
        deltas: collectDeltas(eff),
        sound: fixedJob.sound,
        verdict: pickVerdict(state, fixedJob.verdicts),
        quality: jobQualityOf(punchFixed.penalty.ratio),
      },
    };
  }

  // 周结/月结岗（正式工）：按 jobId 直查，走入职/上班逻辑，工资发薪日结算
  const cycleJob = defMap.get(key);
  if (cycleJob && (cycleJob.kind === "weekly" || cycleJob.kind === "monthly")) {
    // v0.97 休息日拦截
    if (isRestDay(state, cycleJob)) return { ok: false, reason: restReason(state, cycleJob) };
    if (cycleJob.locationId && !isLocationOpen(getLocation(cycleJob.locationId), state.time.hour)) {
      const why = closedReason(getLocation(cycleJob.locationId), state.time.hour);
      return { ok: false, reason: `岗位地点${why || "已打烊"}` };
    }
    const check = checkRequirements(state, cycleJob.requirements);
    if (!check.ok) return check;
    // 到岗打卡：旷工不调 applyJob，lastWorkDay 不更新 → 连续 3 天走 checkAutoQuit 自动离职
    const lateCycle = latenessOfJob(state, cycleJob);
    const punchCycle = punchIn(state, cycleJob);
    if (punchCycle.blocked) return { ok: false, reason: punchCycle.reason };
    const hired = applyJob(state, cycleJob);
    if (!hired.ok) return { ok: false, reason: hired.reason };
    // 当日只结算体力/健康等消耗，工资在发薪日发放
    const eff: Effects = { ...cycleJob.effects, money: undefined };
    // 正式工当日不发钱，迟到改为即时扣现金
    if (punchCycle.penalty.ratio < 1) {
      const daily = cycleJob.effects.money ?? 0;
      const fine = Math.round(daily * (1 - punchCycle.penalty.ratio));
      state.player.money -= fine;
      recordMoney(state, -fine); // v1.215 修复（P1-10）：迟到考勤罚款计入周记支出
      eff.mood = (eff.mood ?? 0) + punchCycle.penalty.moodPenalty;
      pushLog(state, "⏰", `迟到 ${formatDuration(lateCycle)}，被扣了 ${fine} 元考勤罚款`);
    }
    applyEffects(state, eff, cycleJob.icon);
    heatwaveStaminaBoost(state, eff);
    markJobDone(state, cycleJob.id, 0); // 周/月结：当日不发钱，报酬在 career.paycheck 计入
    markGoalWorked(state); // v1.215：完成工作标记「干一次活」每日目标
    completeJobQuest(state, cycleJob);
    const { crossedDay } = advanceTime(state, cycleJob.duration ?? 8);
    reconcileStatuses(state, {
      heavyWork: cycleJob.heavy,
      staminaCost: -(eff.stamina ?? 0),
    });
    kickJobToMap(state);
    return {
      ok: true,
      crossedDay,
      result: {
        actionId: cycleJob.id,
        icon: cycleJob.icon,
        name: cycleJob.name,
        duration: cycleJob.duration ?? 8,
        deltas: collectDeltas(eff),
        sound: cycleJob.sound,
        verdict: pickVerdict(state, cycleJob.verdicts),
        quality: jobQualityOf(punchCycle.penalty.ratio),
      },
    };
  }

  // 日结岗：通过 uid 在 offers 中查找
  const offerIdx = state.laborMarket.offers.findIndex((o) => o.uid === key);
  if (offerIdx < 0) return { ok: false, reason: "岗位已招满或消失" };
  const offer = state.laborMarket.offers[offerIdx];
  const job = defMap.get(offer.jobId);
  if (!job) return { ok: false, reason: "未知岗位" };
  // v0.97 休息日拦截（自由接单岗 restDays=[] 不受影响）
  if (isRestDay(state, job)) return { ok: false, reason: restReason(state, job) };
  if (offer.quota <= 0) return { ok: false, reason: "岗位已招满" };

  const check = checkRequirements(state, job.requirements);
  if (!check.ok) return check;

  // 到岗打卡：外卖/快递/网约车/出租车 punctual=false 完全跳过；旷工时名额不减
  const lateDay = latenessOfJob(state, job);
  const punchDay = punchIn(state, job);
  if (punchDay.blocked) return { ok: false, reason: punchDay.reason };

  const eff = applyLateToEffects(state, settleJobEffects(state, job), punchDay.penalty, lateDay);
  applyEffects(state, eff, job.icon);
  markJobDone(state, job.id, eff.money ?? 0);
  markGoalWorked(state); // v1.215：完成工作标记「干一次活」每日目标
  completeJobQuest(state, job);
  offer.quota--;
  if (offer.quota <= 0) {
    state.laborMarket.offers.splice(offerIdx, 1);
  }
  const { crossedDay } = advanceTime(state, job.duration ?? 8);
  reconcileStatuses(state, {
    heavyWork: job.heavy,
    staminaCost: -(eff.stamina ?? 0),
  });
  kickJobToMap(state);
  return {
    ok: true,
    crossedDay,
    result: {
      actionId: job.id,
      icon: job.icon,
      name: job.name,
      duration: job.duration ?? 8,
      deltas: collectDeltas(eff),
      sound: job.sound,
      verdict: pickVerdict(state, job.verdicts),
      quality: jobQualityOf(punchDay.penalty.ratio),
    },
  };
}

/**
 * 劳务市场「接活」统一入口。
 * - 定时岗且还没到点 → 只排进任务栏（mode="scheduled"），到点再从任务栏开工
 * - 已到点（含迟到 ≤2h）→ 立刻开工（mode="worked"）
 * - 自由岗（外卖/快递/网约车/出租车）→ 一律立刻开工
 */
export function takeJobOffer(
  state: GameState,
  uid: string,
): { ok: boolean; mode?: "scheduled" | "worked"; reason?: string; crossedDay?: boolean; result?: ActionResult; startHour?: number } {
  const offer = state.laborMarket.offers.find((o) => o.uid === uid);
  if (!offer) return { ok: false, reason: "岗位已招满或消失" };
  const job = defMap.get(offer.jobId);
  if (!job) return { ok: false, reason: "未知岗位" };

  if (isPunctual(job) && job.startHour !== undefined) {
    const now = state.time.hour + state.time.minute / 60;
    const notYet = latenessOfJob(state, job) <= 0 && Math.abs(now - job.startHour) > 1e-6;
    if (notYet) {
      const check = checkRequirements(state, job.requirements);
      if (!check.ok) return check;
      // 排班仅记录 quest；quota 在 performJob 实际开工时再减（避免双重扣减 + 第二次 takeJobOffer 找不到 offer）
      acceptJobQuest(state, job, uid);
      return { ok: true, mode: "scheduled", startHour: job.startHour };
    }
  }
  const r = performJob(state, uid);
  return { ...r, mode: r.ok ? "worked" : undefined };
}

/** 从任务栏开工：day 岗走 offerUid，其余走 jobId */
export function workQuestJob(
  state: GameState,
  quest: { jobId?: string; offerUid?: string },
): { ok: boolean; reason?: string; crossedDay?: boolean; result?: ActionResult } {
  if (!quest.jobId) return { ok: false, reason: "该任务不是工作任务" };
  const job = defMap.get(quest.jobId);
  if (!job) return { ok: false, reason: "未知岗位" };
  const key = job.kind === "day" ? quest.offerUid ?? quest.jobId : quest.jobId;
  return performJob(state, key);
}

/** 拿到今日岗位列表（带完整 def） */
export function getTodayOffers(state: GameState): Array<{ offer: JobOffer; def: JobDef }> {
  const out: Array<{ offer: JobOffer; def: JobDef }> = [];
  for (const offer of state.laborMarket.offers) {
    const def = defMap.get(offer.jobId);
    if (def) out.push({ offer, def });
  }
  return out;
}

/* ==================== v1.25 兼职外卖（手机 App 接单） ==================== */

/** 兼职外卖单趟基础收入（按玩家当前交通工具档位；站点不提供车辆） */
export function deliveryParttimeBasePay(state: GameState): number {
  switch (resolveVehicle(state)) {
    case "car":
      return 90;
    case "e_bike":
      return 70;
    case "tricycle":
      return 60;
    case "bicycle":
      return 50;
    default:
      return 35; // 步行
  }
}

/** 兼职外卖接一单：需已下载外卖 App；收入 = 基础档 × 影响力加成 */
export function deliveryParttime(
  state: GameState,
): { ok: boolean; reason?: string; pay?: number; deltas?: ReturnType<typeof collectDeltas> } {
  if (!state.flags["app_delivery"]) {
    return { ok: false, reason: "还没安装外卖接单软件，请先到手机「应用市场」下载" };
  }
  const base = deliveryParttimeBasePay(state);
  const pay = Math.round(base * fameIncomeMult(state));
  const eff: Effects = { money: pay, stamina: -10, stress: 3, mood: 1 };
  applyEffects(state, eff, "🛵");
  advanceTime(state, 1); // 接一单约 1 小时
  pushLog(state, "🛵", `兼职接了一单外卖，赚了 ${pay} 元`);
  markGoalWorked(state); // v1.25：兼职外卖也算「干一次活」
  return { ok: true, pay, deltas: collectDeltas(eff) };
}
