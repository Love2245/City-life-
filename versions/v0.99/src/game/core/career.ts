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
import { pushLog } from "../engine";
import { gameDay } from "./calendar";
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

/** 当前是否发薪日 */
export function isPayday(state: GameState): boolean {
  const c = state.career;
  if (!c.kind || c.jobId === null) return false;
  return c.kind === "weekly" ? isWeeklyPayday(state.time.day) : isMonthlyPayday(state.time.day);
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
  pushLog(state, "📋", `辞去了${name}的工作`);
  return { ok: true, text: "办理了离职手续" };
}

/** 发薪日结算（sleepSettlement 调用） */
export function paycheck(state: GameState): { ok: boolean; amount: number; bonus: boolean } {
  const c = state.career;
  if (!c.kind || c.jobId === null) return { ok: false, amount: 0, bonus: false };
  const job = JOB_DEFS.find((j) => j.id === c.jobId);
  if (!job) {
    resignJob(state);
    return { ok: false, amount: 0, bonus: false };
  }
  const daily = job.effects.money ?? 0;
  const full = c.kind === "weekly" ? c.workedDays >= 6 : c.workedDays >= 26;
  const amount = Math.round(daily * c.workedDays * (full ? 1.1 : 1));
  state.player.money += amount;
  // v0.985：周结/月结岗的报酬在此才真正到手，补记「魔术师·完成工作并获得报酬」
  if (amount > 0) onWorkDone(state, c.jobId, amount);
  pushLog(state, "💰", `${c.kind === "weekly" ? "周薪" : "月薪"}到账：${amount} 元（${c.workedDays} 天${full ? "，满勤 +10%" : ""}）`);
  c.workedDays = 0;
  c.lastWorkDay = todayOf(state);
  return { ok: true, amount, bonus: full };
}

/** 连续 3 天未上班自动离职（sleepSettlement 调用） */
export function checkAutoQuit(state: GameState): void {
  const c = state.career;
  if (!c.jobId) return;
  // v0.965：绝对日差值（跨月不回绕），连续 3 天未上班才离职
  if (todayOf(state) - c.lastWorkDay >= 3) {
    const name = c.jobId;
    c.jobId = null;
    c.kind = null;
    c.hiredDay = 0;
    c.workedDays = 0;
    c.lastWorkDay = 0;
    pushLog(state, "📋", `连续 3 天没去上班，被自动离职了（${name}）`);
  }
}