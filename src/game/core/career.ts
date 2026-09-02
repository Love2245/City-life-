/**
 * 职业系统：周结/月结（正式工）在职状态与周期发薪。
 * 纯逻辑层。
 * - 入职：applyJob（weekly/monthly 岗，career.jobId 为空才可）
 * - 上班：applyJob 同岗 → workedDays+1（同日只能上 1 次班），当日结算体力/健康，不发钱
 * - 发薪：paycheck（sleepSettlement 挂载）weekly day∈{7,14,21,28}、monthly day===30
 *   发薪 = 日薪 × workedDays × 满勤奖励（weekly≥6 / monthly≥26 → ×1.1）
 * - 自动离职：连续 3 天未上班（checkAutoQuit）
 */
import type { GameState, JobDef } from "../types";
import { recordMoney } from "./weekly";
import { pushLog } from "../engine";
import { gameDay, fromLinearDay, weekdayOf, START_EPOCH } from "./calendar";
import { addContact } from "./contacts";
import { onWorkDone } from "./tarot";
import jobsData from "../data/jobs.json";

const JOB_DEFS = jobsData as unknown as JobDef[];

/** 当前存活天数（绝对日语义，跨月不回绕；"同日判定"统一用此） */
function todayOf(state: GameState): number {
  return gameDay(state.time);
}

/** 周结发薪日 */
export function isWeeklyPayday(day: number): boolean {
  return day === 7 || day === 14 || day === 21 || day === 28;
}

/** 月结发薪日 */
export function isMonthlyPayday(day: number): boolean {
  return day === 30;
}

/** 当前是否发薪日（v1.215：可传锚定日 day，供熬夜跨日补结算；不传用 state.time.day） */
export function isPayday(state: GameState, day?: number): boolean {
  const c = state.career;
  if (!c.kind || c.jobId === null) return false;
  const d = day ?? state.time.day;
  return c.kind === "weekly" ? isWeeklyPayday(d) : isMonthlyPayday(d);
}

/**
 * 入职 / 上班（weekly/monthly 岗）。
 * - 未就职：入职，当日算上班第 1 天
 * - 已就职同岗：上班 +1 天（同日重复拒绝）
 * - 已就职他岗：拒绝（先辞职）
 */
export function applyJob(state: GameState, job: JobDef): { ok: boolean; reason?: string; newlyHired?: boolean } {
  const c = state.career;
  if (c.jobId && c.jobId !== job.id) {
    return { ok: false, reason: "已有工作在身，先到劳务公司办理离职" };
  }
  if (c.jobId === job.id) {
    // v0.965：lastWorkDay 用绝对日（游戏内存活天数），跨月不回绕，杜绝"今天已上过班"误判
    if (c.lastWorkDay === todayOf(state)) {
      return { ok: false, reason: "今天已经上过班了，明天再来" };
    }
    c.workedDays += 1;
    c.lastWorkDay = todayOf(state);
    pushLog(state, job.icon, `今天去${job.name}上了一天班（累计 ${c.workedDays} 天）`);
    return { ok: true, newlyHired: false };
  }
  // 入职
  c.jobId = job.id;
  c.kind = job.kind === "monthly" ? "monthly" : "weekly";
  c.hiredDay = todayOf(state);
  c.workedDays = 1;
  c.lastWorkDay = todayOf(state);
  state.flags["employed"] = true; // v0.992：同事类 NPC 偶遇 + 「同事日久生情」tick 的开关
  pushLog(state, job.icon, `入职${job.name}，今天算第 1 个工作日`);
  // v0.978：入职电子厂自动加组长联系人（内推关照）
  if (job.locationId === "electronics_factory") addContact(state, "factory_leader");
  return { ok: true, newlyHired: true };
}

/** 辞职（劳务公司"办理离职"） */
export function resignJob(state: GameState): { ok: boolean; text: string } {
  if (!state.career.jobId) {
    return { ok: false, text: "当前没有在职工作" };
  }
  const name = state.career.jobId;
  state.career.jobId = null;
  state.career.kind = null;
  state.career.hiredDay = 0;
  state.career.workedDays = 0;
  state.career.lastWorkDay = 0;
  delete state.flags["employed"]; // v0.992：离职后不再算在职
  pushLog(state, "📋", `辞去了${name}的工作`);
  return { ok: true, text: "办理了离职手续" };
}

/** 月结满勤门槛：按当月 1-30 号真实日历统计应出勤天数。
 *  v0.992 修复：固定 `30 - restCount*4 = 22` 对双休岗不可达（30 天月起周六时
 *  当月有 10 个周末日，文员最多 20 个工作日）——按实际星期分布动态计算。
 *  v1.215：锚定年/月作为参数（熬夜跨月补发薪时按锚定月统计）。 */
function monthlyWorkableDays(anchor: { year: number; month: number }, restDays: string[]): number {
  let workable = 0;
  for (let d = 1; d <= 30; d++) {
    const w = weekdayOf({ year: anchor.year, month: anchor.month, day: d });
    const isRest = (restDays.includes("sat") && w === 5) || (restDays.includes("sun") && w === 6);
    if (!isRest) workable++;
  }
  return workable;
}

/** v1.215：结算锚定日所在年/月（熬夜跨月时锚回上个月，配合发薪锚定） */
function anchorDateOf(state: GameState): { year: number; month: number } {
  if (state.time.stayedUp && state.time.day === 1) {
    let m = state.time.month - 1;
    let y = state.time.year;
    if (m < 1) { m = 12; y -= 1; }
    return { year: y, month: m };
  }
  return { year: state.time.year, month: state.time.month };
}

/** 发薪日结算（sleepSettlement 调用；v1.215：可传锚定日 day） */
export function paycheck(state: GameState, day?: number): { ok: boolean; amount: number; bonus: boolean } {
  const c = state.career;
  if (!c.kind || c.jobId === null) return { ok: false, amount: 0, bonus: false };
  // v1.066：只在发薪日发薪（周结 7/14/21/28，月结 30）——原来每晚都发，正式工变日结工
  if (!isPayday(state, day)) return { ok: false, amount: 0, bonus: false };
  const job = JOB_DEFS.find((j) => j.id === c.jobId);
  if (!job) {
    resignJob(state);
    return { ok: false, amount: 0, bonus: false };
  }
  const daily = job.effects.money ?? 0;
  // v0.99 修复：满勤门槛改为「应出勤天数」——双休岗每周最多 5 天；月结按真实日历动态计算
  const restDays = job.restDays?.length ? job.restDays : ["sat"];
  const anchor = anchorDateOf(state);
  const workable = c.kind === "weekly" ? 7 - restDays.length : monthlyWorkableDays(anchor, restDays);
  const full = c.workedDays >= workable;
  const amount = Math.round(daily * c.workedDays * (full ? 1.1 : 1));
  state.player.money += amount;
  recordMoney(state, amount); // v1.10 周记
  // v0.985：周结/月结岗的报酬在此才真正到手，补记「魔术师·完成工作并获得报酬」
  if (amount > 0) onWorkDone(state, c.jobId, amount);
  pushLog(state, "💰", `${c.kind === "weekly" ? "周薪" : "月薪"}到账：${amount} 元（${c.workedDays} 天${full ? "，满勤 +10%" : ""}）`);
  c.workedDays = 0;
  // v1.065：发薪不算出勤——lastWorkDay 只在 applyJob（实际干活）时更新，不在 paycheck 里重置
  return { ok: true, amount, bonus: full };
}

/** 连续 3 个「应出勤日」未上班自动离职（sleepSettlement 调用） */
export function checkAutoQuit(state: GameState): void {
  const c = state.career;
  if (!c.jobId) return;
  const job = JOB_DEFS.find((j) => j.id === c.jobId);
  // v0.99 修复：休息日（周六/日）不计入缺勤——双休岗周一缺勤不再被周五前连续天数误杀
  const restDays = job?.restDays ?? ["sat"];
  let missedWork = 0;
  for (let d = c.lastWorkDay + 1; d <= todayOf(state); d++) {
    // d 是存活天数（gameDay，开局=0）；fromLinearDay 需要绝对线性日（2026-08-01 = START_EPOCH）
    const w = weekdayOf(fromLinearDay(START_EPOCH + d));
    const isRest = (restDays.includes("sat") && w === 5) || (restDays.includes("sun") && w === 6);
    if (!isRest) missedWork++;
  }
  if (missedWork >= 3) {
    const name = c.jobId;
    c.jobId = null;
    c.kind = null;
    c.hiredDay = 0;
    c.workedDays = 0;
    c.lastWorkDay = 0;
    delete state.flags["employed"]; // v0.992：离职后不再算在职
    pushLog(state, "📋", `连续 3 天没去上班，被自动离职了（${name}）`);
  }
}