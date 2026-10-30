import {dispatchMoney} from '../../lib/streetDispatch/pay.js';
/** 正式工合同、按班末缺勤检查、按录用日每七天发薪。每班工资在小游戏完成后入账。 */
import type { CareerTier, CareerTrack, GameState, JobDef, WorkSession, WageRecord } from "../types";
import { recordMoney } from "./weekly";
import { pushLog } from "../engine";
import { gameDay } from "./calendar";
import { addContact } from "./contacts";
import { addItem } from "./items";
import { completeJobQuest, refreshDailyQuests } from "./quests";
import { firstWorkDay, isWorkRestDay, nextWorkDay, scheduledWorkShift, workClock, workDateLabel, workMinute } from "./workSchedule";
import { jobSkillWageMultiplier } from "./jobs";
import { priceMultiplier } from "./difficulty";
import { checkJobRequirements } from "./jobRequirements";
import jobsData from "../data/jobs.json";

const JOB_DEFS = jobsData as unknown as JobDef[];

/** 正式工小游戏表现的最高工资加成：满分本期工资最多额外 +5%。 */
const MINI_GAME_PAY_BONUS_RATE = 0.05;

/**
 * v1.395 职业阶梯。
 * 旧岗位数据没有强制新增字段，因此这里提供一层稳定的轨道/层级索引；
 * 以后新增岗位只需在 JobDef 上填 careerTrack/careerTier，未填写时仍能安全推导。
 */
export const CAREER_TIERS: ReadonlyArray<{ id: CareerTier; name: string; minExperience: number; desc: string }> = [
  { id: "entry", name: "入门岗", minExperience: 0, desc: "先把基本功做扎实，熟悉城市与工作流程" },
  { id: "skilled", name: "熟练岗", minExperience: 3, desc: "稳定完成工作后，开始接触更高收益岗位" },
  { id: "professional", name: "专业岗", minExperience: 10, desc: "技能与履历达到要求，可承担专业职责" },
  { id: "management", name: "管理岗", minExperience: 24, desc: "能带人、管项目，并解锁稀有事件与推荐" },
];

const CAREER_TRACK_NAMES: Record<CareerTrack, string> = {
  service: "服务运营",
  operation: "生产运营",
  driving: "交通配送",
  writing: "写作内容",
  programming: "编程技术",
  design: "设计创意",
  management: "管理行政",
  general: "综合发展",
};

type CareerHint = { track: CareerTrack; tier: CareerTier };
const JOB_CAREER_HINTS: Record<string, CareerHint> = {
  job_delivery: { track: "driving", tier: "entry" },
  job_express: { track: "driving", tier: "entry" },
  job_convenience_day: { track: "service", tier: "entry" },
  job_market_cleaner: { track: "service", tier: "entry" },
  job_farm_hand: { track: "operation", tier: "entry" },
  job_pasture_milk: { track: "operation", tier: "entry" },
  job_orchard_pick: { track: "operation", tier: "entry" },
  job_factory_line: { track: "operation", tier: "entry" },
  job_sorting: { track: "operation", tier: "entry" },
  job_security: { track: "service", tier: "entry" },
  job_sales: { track: "service", tier: "entry" },
  job_ride_hailing: { track: "driving", tier: "skilled" },
  job_taxi: { track: "driving", tier: "professional" },
  job_convenience_clerk: { track: "service", tier: "skilled" },
  job_cafe_staff: { track: "service", tier: "skilled" },
  job_waiter_fast: { track: "service", tier: "skilled" },
  job_waiter_west: { track: "service", tier: "professional" },
  job_driving_tutor: { track: "driving", tier: "professional" },
  job_factory_qc: { track: "operation", tier: "skilled" },
  job_factory_tech: { track: "operation", tier: "professional" },
  job_loading: { track: "operation", tier: "skilled" },
  job_warehouse: { track: "management", tier: "professional" },
  job_office_assistant: { track: "management", tier: "professional" },
  job_training_assistant: { track: "writing", tier: "professional" },
  job_delivery_fulltime: { track: "driving", tier: "professional" },
  job_netbar_admin: { track: "operation", tier: "skilled" },
};

const TIER_INDEX: Record<CareerTier, number> = { entry: 0, skilled: 1, professional: 2, management: 3 };

function inferredTrack(job: JobDef): CareerTrack {
  const skills = job.effects.skills ?? {};
  if (skills.driving || job.id.includes("delivery") || job.id.includes("taxi") || job.id.includes("ride")) return "driving";
  if (skills.service || job.id.includes("waiter") || job.id.includes("cafe") || job.id.includes("sales")) return "service";
  if (skills.management || job.id.includes("warehouse") || job.id.includes("office")) return "management";
  if (skills.programming) return "programming";
  if (skills.design) return "design";
  if (skills.writing) return "writing";
  if (skills.operation || job.id.includes("factory") || job.id.includes("sorting")) return "operation";
  return "general";
}

function inferredTier(job: JobDef): CareerTier {
  if (job.careerTier) return job.careerTier;
  if (job.kind === "day") return "entry";
  const values = [
    ...Object.values(job.requirements?.attr ?? {}).map((v) => v ?? 0),
    ...Object.values(job.requirements?.skill ?? {}).map((v) => (v ?? 0) * 10),
  ];
  const max = Math.max(0, ...values);
  return max >= 50 ? "professional" : max >= 30 ? "skilled" : "entry";
}

/** 岗位所属职业轨道。 */
export function careerTrackOf(job: JobDef | undefined): CareerTrack {
  if (!job) return "general";
  return job.careerTrack ?? JOB_CAREER_HINTS[job.id]?.track ?? inferredTrack(job);
}

/** 岗位在职业阶梯中的基准层级。 */
export function careerTierOf(job: JobDef | undefined): CareerTier {
  if (!job) return "entry";
  return job.careerTier ?? JOB_CAREER_HINTS[job.id]?.tier ?? inferredTier(job);
}

export function careerTrackName(track: CareerTrack): string {
  return CAREER_TRACK_NAMES[track] ?? CAREER_TRACK_NAMES.general;
}

/** 当前职业轨道累计工作次数（旧档读到缺省值时返回 0）。 */
export function careerExperienceOf(state: GameState, track: CareerTrack): number {
  const value = state.career.experience?.[track];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** 由经验次数计算当前已达层级。 */
export function careerTierFor(state: GameState, job?: JobDef): CareerTier {
  const track = careerTrackOf(job);
  const experience = careerExperienceOf(state, track);
  const experienceTier = CAREER_TIERS.reduce<CareerTier>((tier, def) => (
    experience >= def.minExperience ? def.id : tier
  ), "entry");
  const baseTier = careerTierOf(job);
  return TIER_INDEX[experienceTier] >= TIER_INDEX[baseTier] ? experienceTier : baseTier;
}

/** 当前轨道的下一档晋升提示；达到最高档时返回 null。 */
export function nextCareerTier(state: GameState, track: CareerTrack): { tier: CareerTier; name: string; remaining: number } | null {
  const current = CAREER_TIERS.reduce((tier, def) => careerExperienceOf(state, track) >= def.minExperience ? def.id : tier, "entry" as CareerTier);
  const next = CAREER_TIERS[TIER_INDEX[current] + 1];
  if (!next) return null;
  return { tier: next.id, name: next.name, remaining: Math.max(0, next.minExperience - careerExperienceOf(state, track)) };
}

/** 完成一份工作后推进职业履历，并在晋升时写一条明确日志。 */
export function recordCareerProgress(state: GameState, job: JobDef): void {
  const track = careerTrackOf(job);
  if (!state.career.experience) state.career.experience = {};
  const before = careerTierFor(state, job);
  state.career.experience[track] = careerExperienceOf(state, track) + 1;
  const after = careerTierFor(state, job);
  if (TIER_INDEX[after] > TIER_INDEX[before]) {
    pushLog(state, "📈", `${careerTrackName(track)}履历升级：${CAREER_TIERS[TIER_INDEX[after]].name}，${CAREER_TIERS[TIER_INDEX[after]].desc}`);
    state.flags[`career_${track}_${after}`] = true;
  }
}

/** 绝对分钟日历；契约只保存游标，不把查询动作当作上班。 */
const safe = (n: unknown): number => typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
const jobById = (id: string | null): JobDef | undefined => JOB_DEFS.find((job) => job.id === id);
function workLedger(state: GameState): NonNullable<GameState["work"]> {
  return state.work ??= { active: undefined, masteryMinutes: {}, settledIds: [], wageRecords: [], sequence: 0 };
}
function contractDefaults(state: GameState, job: JobDef): void {
  const c = state.career;
  c.kind = "weekly";
  const today = gameDay(state.time);
  const hiredDay = Number.isSafeInteger(c.hiredDay) && c.hiredDay >= 0 ? c.hiredDay : today;
  c.hiredDay = hiredDay;
  const firstShift = firstWorkDay(job, workMinute(state));
  if (!Number.isSafeInteger(c.firstShiftDay) || c.firstShiftDay! < hiredDay) c.firstShiftDay = firstShift;
  if (!Number.isSafeInteger(c.nextShiftDay) || c.nextShiftDay! < c.firstShiftDay!) c.nextShiftDay = c.firstShiftDay;
  if (!Number.isSafeInteger(c.nextPayDay) || c.nextPayDay! < hiredDay + 7) c.nextPayDay = hiredDay + 7;
  c.consecutiveAbsences ??= 0;
  c.periodScheduled ??= 0;
  c.periodAttended ??= 0;
  c.periodBaseWages ??= safe(c.accruedWages);
  c.periodGameBonus ??= 0;
  c.accruedWages = c.periodBaseWages + c.periodGameBonus;
}

export type WorkShiftPhase = "none" | "next" | "rest" | "early" | "working" | "travel" | "active";
export interface WorkShiftStatus {
  phase: WorkShiftPhase;
  day: number;
  startMinute: number;
  endMinute: number;
  label: string;
}
export function getWorkShift(state: GameState, job?: JobDef): WorkShiftStatus {
  job ??= jobById(state.career.jobId);
  const now = workMinute(state);
  if (!job || job.kind !== "formal" || state.career.jobId !== job.id)
    return { phase: "none", day: gameDay(state.time), startMinute: now, endMinute: now, label: "尚未入职" };
  const active = state.work?.active;
  if (active?.jobId === job.id && active.kind === "formal")
    return { phase: "active", day: active.day, startMinute: active.startMinute, endMinute: active.endMinute, label: "继续本班工作" };
  let day = state.career.nextShiftDay ?? firstWorkDay(job, now);
  while (scheduledWorkShift(job, day).endMinute <= now) day = nextWorkDay(job, day + 1);
  const shift = scheduledWorkShift(job, day);
  const nextLabel = "下一班 " + workDateLabel(day) + " " + workClock(shift.startMinute) + "—" + workClock(shift.endMinute);
  if (day > gameDay(state.time))
    return { ...shift, phase: isWorkRestDay(job, gameDay(state.time)) ? "rest" : "next", label: nextLabel };
  if (job.locationId && state.locationId !== job.locationId)
    return { ...shift, phase: "travel", label: "前往单位" };
  if (now < shift.startMinute)
    return { ...shift, phase: "early", label: "等待至 " + workClock(shift.startMinute) + " 并上班" };
  return { ...shift, phase: "working", label: "上班至 " + workClock(shift.endMinute) };
}
export function hireJob(state: GameState, job: JobDef, replace = false): { ok: boolean; reason?: string; newlyHired?: boolean } {
  if (job.kind !== "formal") return { ok: false, reason: "日结岗位直接开始工作" };
  if (state.career.jobId === job.id) return { ok: true, newlyHired: false };
  const requirements = checkJobRequirements(state, job);
  if (!requirements.ok) return { ok: false, reason: requirements.reason ?? "未达到岗位要求" };
  if (state.work?.active) return { ok: false, reason: "先完成正在进行的班次" };
  if (state.career.jobId && !replace) return { ok: false, reason: "已有在职岗位，请确认换岗" };
  if (state.career.jobId) {
    const result = resignJob(state);
    if (!result.ok) return { ok: false, reason: result.text };
  }
  const c = state.career;
  c.jobId = job.id;
  state.flags.employee_full_week_streak = 0;
  c.kind = "weekly";
  c.hiredDay = gameDay(state.time);
  c.firstShiftDay = firstWorkDay(job, workMinute(state));
  if (state.flags["worked_" + job.id + "_" + c.firstShiftDay]) c.firstShiftDay = nextWorkDay(job, c.firstShiftDay + 1);
  c.nextShiftDay = c.firstShiftDay;
  c.nextPayDay = c.hiredDay + 7;
  c.consecutiveAbsences = 0;
  c.periodScheduled = 0;
  c.periodAttended = 0;
  c.periodBaseWages = 0;
  c.periodGameBonus = 0;
  c.workedDays = 0;
  c.accruedWages = 0;
  c.lastWorkDay = -1;
  c.miniGameScoreTotal = 0;
  c.miniGameScoreCount = 0;
  state.flags.employed = true;
  if (job.locationId === "electronics_factory") addContact(state, "factory_leader");
  refreshDailyQuests(state);
  pushLog(state, job.icon, "已入职" + job.name + "；首班 " + workDateLabel(c.firstShiftDay) + " " + workClock(scheduledWorkShift(job, c.firstShiftDay).startMinute) + "，首次七日发薪 " + workDateLabel(c.nextPayDay));
  return { ok: true, newlyHired: true };
}
/** 旧调用保留录用语义，不提前记录出勤与工资。 */
export function applyJob(state: GameState, job: JobDef, _payMultiplier = 1, _flatPayBonus = 0): { ok: boolean; reason?: string; newlyHired?: boolean } {
  return hireJob(state, job);
}
export function creditWorkedShift(state: GameState, session: WorkSession, base: number, bonus: number, qualified = true): void {
  if (session.kind !== "formal" || state.career.jobId !== session.jobId) return;
  const marker = "work_credited_" + session.id;
  if (state.flags[marker]) return;
  const job = jobById(session.jobId);
  if (!job) return;
  contractDefaults(state, job);
  const c = state.career;
  c.periodBaseWages = dispatchMoney(safe(c.periodBaseWages) + safe(base));
  c.periodGameBonus = dispatchMoney(safe(c.periodGameBonus) + safe(bonus));
  c.accruedWages = c.periodBaseWages + c.periodGameBonus;
  c.workedDays += qualified ? 1 : 0;
  c.lastWorkDay = session.day;
  c.consecutiveAbsences = 0;
  c.periodScheduled = safe(c.periodScheduled) + 1;
  // 部分出勤重置缺勤；满勤奖励只奖励完整工时。
  c.periodAttended = safe(c.periodAttended) + (qualified ? Math.min(1, session.workedMinutes / Math.max(1, session.standardMinutes)) : 0);
  c.nextShiftDay = nextWorkDay(job, Math.max(c.nextShiftDay ?? session.day, session.day) + 1);
  state.flags[marker] = true;
  state.flags["worked_" + job.id + "_" + session.day] = true;
  if (qualified) completeJobQuest(state, job, session.day);
}
function parts(state: GameState, attendance: boolean): { base: number; gameBonus: number; attendanceBonus: number; total: number } {
  const c = state.career;
  const base = dispatchMoney(c.periodBaseWages === undefined ? safe(c.accruedWages) : safe(c.periodBaseWages));
  const gameBonus = dispatchMoney(safe(c.periodGameBonus));
  const full = attendance && safe(c.periodScheduled) > 0 && safe(c.periodAttended) + 1e-9 >= safe(c.periodScheduled);
  const attendanceBonus = full ? Math.round(base * 0.1) : 0;
  return { base, gameBonus, attendanceBonus, total: base + gameBonus + attendanceBonus };
}
export function salarySummary(state: GameState): { jobId: string | null; pending: number; base: number; gameBonus: number; nextPayDay?: number; consecutiveAbsences: number; records: WageRecord[] } {
  const value = parts(state, false);
  return { jobId: state.career.jobId, pending: state.career.jobId ? value.total : 0, base: value.base,
    gameBonus: value.gameBonus, nextPayDay: state.career.nextPayDay,
    consecutiveAbsences: state.career.consecutiveAbsences ?? 0, records: state.work?.wageRecords ?? [] };
}
export function resignationSalaryPreview(state: GameState): number {
  return state.career.jobId ? parts(state, false).total : 0;
}
function resetPeriod(state: GameState): void {
  const c = state.career;
  c.workedDays = 0; c.accruedWages = 0;
  c.periodBaseWages = 0; c.periodGameBonus = 0;
  c.periodScheduled = 0; c.periodAttended = 0;
  c.miniGameScoreTotal = 0; c.miniGameScoreCount = 0;
}
function paySalary(state: GameState, kind: "weekly" | "resign" | "dismissal", day: number): number {
  const c = state.career;
  if (!c.jobId) return 0;
  const value = parts(state, kind === "weekly");
  if (kind === "weekly") {
    const fullWeek = safe(c.periodScheduled) > 0 && safe(c.periodAttended) + 1e-9 >= safe(c.periodScheduled);
    const streak = fullWeek ? safe(state.flags.employee_full_week_streak) + 1 : 0;
    state.flags.employee_full_week_streak = streak;
    if (streak >= 4 && !state.flags.doc_employee_award_awarded) {
      addItem(state, "doc_employee_award");
      state.flags.doc_employee_award_awarded = true;
      pushLog(state, "📜", "连续四周按时全勤，获得优秀员工奖状");
    }
  }
  const ledger = workLedger(state);
  const id = "pay_" + c.jobId + "_" + c.hiredDay + "_" + kind + "_" + day + "_" + ledger.sequence++;
  const label = kind === "weekly" ? "七日周薪" : kind === "resign" ? "离职结算" : "解除合同结算";
  ledger.wageRecords.push({ id, jobId: c.jobId, day, kind, ...value, note: label });
  if (ledger.wageRecords.length > 500) ledger.wageRecords.splice(0, ledger.wageRecords.length - 500);
  state.player.money += value.total;
  if (value.total > 0) recordMoney(state, value.total);
  pushLog(state, "💰", label + "到账 " + value.total + " 元（基础 " + value.base + "、表现 " + value.gameBonus + "、满勤 " + value.attendanceBonus + "）");
  resetPeriod(state);
  return value.total;
}
function clearContract(state: GameState): void {
  const oldJobId = state.career.jobId;
  const c = state.career;
  c.jobId = null; c.kind = null; c.hiredDay = 0; c.lastWorkDay = -1;
  state.flags.employee_full_week_streak = 0;
  delete c.firstShiftDay; delete c.nextShiftDay; delete c.nextPayDay;
  c.consecutiveAbsences = 0;
  resetPeriod(state);
  delete state.flags.employed;
  state.quests = (state.quests ?? []).filter((q) => q.jobId !== oldJobId || (q.status !== "pending" && q.status !== "active"));
}
export function resignJob(state: GameState): { ok: boolean; text: string } {
  if (!state.career.jobId) return { ok: false, text: "当前没有在职工作" };
  if (state.work?.active?.jobId === state.career.jobId) return { ok: false, text: "请先完成本班工作" };
  const amount = paySalary(state, "resign", gameDay(state.time));
  clearContract(state);
  return { ok: true, text: "已离职并结清 " + amount + " 元工资；岗位熟练进度保留" };
}
/** 每次消费最早的班末或发薪零点。班次/发薪游标持久化，多日跳跃与重复调用均幂等。 */
export function processWorkCalendar(state: GameState, nowMinute = workMinute(state)): void {
  const c = state.career;
  if (!c.jobId) return;
  const job = jobById(c.jobId);
  if (!job) { paySalary(state, "dismissal", Math.floor(nowMinute / 1440)); clearContract(state); return; }
  contractDefaults(state, job);
  while (c.jobId) {
    const shift = scheduledWorkShift(job, c.nextShiftDay!);
    const paydayMinute = c.nextPayDay! * 1440;
    const active = state.work?.active;
    const protectedShift = active?.kind === "formal" && active.jobId === job.id && active.day === shift.day;
    const endMinute = protectedShift ? Infinity : shift.endMinute;
    // 尚在结算的本班若恰逢发薪零点，等记入工资后再发；较早账期照常处理。
    const deferredPay = active?.kind === "formal" && active.jobId === job.id && paydayMinute >= active.endMinute;
    const payMinute = deferredPay ? Infinity : paydayMinute;
    const event = Math.min(endMinute, payMinute);
    if (event > nowMinute || !Number.isFinite(event)) break;
    if (endMinute <= payMinute) {
      c.periodScheduled = safe(c.periodScheduled) + 1;
      if (state.flags["worked_" + job.id + "_" + shift.day]) {
        c.consecutiveAbsences = 0;
        c.periodAttended = safe(c.periodAttended) + 1;
      } else {
        c.consecutiveAbsences = safe(c.consecutiveAbsences) + 1;
        const quest = state.quests?.find((q) => q.jobId === job.id && q.day === shift.day);
        if (quest) { quest.status = "missed"; quest.fine = 0; }
        pushLog(state, "📋", job.name + " " + workDateLabel(shift.day) + " 未出勤（连续 " + c.consecutiveAbsences + "/3）");
      }
      c.nextShiftDay = nextWorkDay(job, shift.day + 1);
      if (c.consecutiveAbsences! >= 3) {
        const amount = paySalary(state, "dismissal", Math.floor(event / 1440));
        clearContract(state);
        pushLog(state, "📋", "连续三个应出勤班次未上班，已解除" + job.name + "合同，结清 " + amount + " 元");
      }
    } else {
      const due = c.nextPayDay!;
      paySalary(state, "weekly", due);
      c.nextPayDay = due + 7;
    }
  }
  refreshDailyQuests(state);
}
/** 兼容旧 API：实际发薪由 advanceHours 的日历事件驱动。 */
export function paycheck(state: GameState, _day?: number): { ok: boolean; amount: number; bonus: boolean } {
  const before = state.work?.wageRecords.length ?? 0;
  processWorkCalendar(state);
  const rows = (state.work?.wageRecords ?? []).slice(before).filter((row) => row.kind === "weekly");
  return { ok: rows.length > 0, amount: rows.reduce((sum, row) => sum + row.total, 0), bonus: rows.some((row) => row.attendanceBonus > 0) };
}
export function checkAutoQuit(state: GameState, _throughDay?: number): void { processWorkCalendar(state); }
export function isPayday(state: GameState, _day?: number): boolean {
  return !!state.career.jobId && state.career.nextPayDay === gameDay(state.time);
}
export function isWeeklyPayday(day: number): boolean { return day >= 7 && day % 7 === 0; }
/** 仅供旧档迁移推导旧月结奖励，运行合同均为周结。 */
export function isMonthlyPayday(day: number): boolean { return day === 30; }
/** 旧小游戏回调不再对整个账期二次加奖，表现奖金按班锁定。 */
export function recordMiniGameScore(_state: GameState, _jobId: string, _ratio: number): boolean { return false; }
/** 31→32 旧制欠薪：有限的 accruedWages 包括 0；缺失才按旧规则估算。 */
export function legacySalaryParts(state: GameState, job?: JobDef): { base: number; gameBonus: number; attendanceBonus: number; total: number } {
  const c = state.career;
  const base = Math.round(Number.isFinite(c.accruedWages) ? safe(c.accruedWages)
    : job ? Math.round(safe(job.effects.money) * jobSkillWageMultiplier(state, job) * priceMultiplier(state)) * safe(c.workedDays) : 0);
  const today = gameDay(state.time);
  const kind = (c as unknown as { kind: string | null }).kind;
  const due = kind === "monthly" ? state.time.day === 30 :
    Number.isFinite(c.hiredDay) && c.hiredDay >= 0 ? today - c.hiredDay >= 7 && (today - c.hiredDay) % 7 === 0 : isWeeklyPayday(today + 1);
  let required = Infinity;
  if (job && due) {
    const start = kind === "monthly" ? today - state.time.day + 1 : today - c.hiredDay === 7 ? c.hiredDay : today - 6;
    const end = kind === "monthly" ? start + 29 : today;
    required = 0;
    for (let day = start; day <= end; day++) if (!isWorkRestDay(job, day)) required++;
  }
  const attendanceBonus = due && safe(c.workedDays) >= required ? Math.round(base * 0.1) : 0;
  const count = safe(c.miniGameScoreCount);
  const average = count > 0 ? Math.min(1, safe(c.miniGameScoreTotal) / count) : 0;
  const gameBonus = Math.round((base + attendanceBonus) * MINI_GAME_PAY_BONUS_RATE * average);
  return { base, gameBonus, attendanceBonus, total: base + gameBonus + attendanceBonus };
}
