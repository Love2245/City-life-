/** 工作待办。正式工按合同唯一排班；日结直接开工，不生成预约任务。 */
import type { DailyGoalSnapshot, GameState, JobDef, Quest } from "../types";
import { pushLog } from "../engine";
import { gameDay, weekdayOf } from "./calendar";
import { isRestDayOf, scheduledWorkShift, workMinute } from "./workSchedule";
import jobsData from "../data/jobs.json";
import locationsData from "../data/locations.json";
import { isRetiredNpcQuest, removeRetiredNpcTasks } from "./npcTaskAvailability";

const JOB_DEFS = jobsData as unknown as JobDef[];
const JOB_MAP = new Map(JOB_DEFS.map((j) => [j.id, j]));
const LOC_NAME = new Map(
  (locationsData as unknown as Array<{ id: string; name: string }>).map((l) => [l.id, l.name]),
);

/** v0.965：当日存活天数（绝对日语义，跨月不回绕——"同日"判定统一用此） */
export function todayOf(state: GameState): number {
  return gameDay(state.time);
}

/** 兼容旧调用；新工作系统没有迟到罚款。 */
export const QUEST_LATE_FINE_ABSENT = 0;

/** 地点中文名（任务栏展示用） */
export function locationName(id?: string): string {
  if (!id) return "";
  return LOC_NAME.get(id) ?? id;
}

/** 去掉岗位名里的「（日结）」等后缀，任务栏空间有限 */
export function shortJobName(name: string): string {
  return name.replace(/（[^）]*）/g, "").trim();
}

/** 同日同岗幂等 id */
export function questIdOf(day: number, jobId: string): string {
  return `q_${day}_${jobId}`;
}

/** 岗位是否需要按时到岗（缺省由 kind 推断：day 自由，其余按时） */
export function isPunctual(job: JobDef): boolean {
  return job.kind === "formal";
}

/** 岗位下班时刻（缺省由 startHour + duration 派生） */
export function jobEndHour(job: JobDef): number | undefined {
  if (job.endHour !== undefined) return job.endHour;
  if (job.startHour === undefined) return undefined;
  return (job.startHour + (job.duration ?? 8)) % 24;
}

/**
 * 环形迟到小时数。
 * diff = ((now - startHour) + 24) % 24；diff > 12 视为「提前到下一班」，返回 0。
 * 例：夜班 startHour=20，凌晨 2 点 → diff=6（迟到 6h）；凌晨 2 点对 startHour=8 → diff=18 > 12 → 早到 0。
 */
function circularLateness(nowHour: number, startHour: number): number {
  const diff = (((nowHour - startHour) % 24) + 24) % 24;
  return diff > 12 ? 0 : diff;
}

/** 岗位维度的迟到小时数（不需按时的岗位恒为 0） */
export function latenessOfJob(state: GameState, job: JobDef): number {
  if (!isPunctual(job) || job.startHour === undefined) return 0;
  const day = state.career.jobId === job.id ? state.career.nextShiftDay ?? todayOf(state) : todayOf(state);
  return Math.max(0, (workMinute(state) - scheduledWorkShift(job, day).startMinute) / 60);
}

/** 任务维度的迟到小时数（有 jobId 则委托岗位判定） */
export function lateness(state: GameState, quest: Quest): number {
  if (quest.jobId) {
    const job = JOB_MAP.get(quest.jobId);
    if (job) return latenessOfJob(state, job);
  }
  if (quest.startHour === undefined) return 0;
  const now = state.time.hour + state.time.minute / 60;
  return circularLateness(now, quest.startHour);
}

/** 迟到罚则 */
export interface LatePenalty {
  /** 工资折算系数 */
  ratio: number;
  /** 心情增量（负值） */
  moodPenalty: number;
  /** 是否判定为旷工（不能上班） */
  absent: boolean;
  /** 旷工罚款 */
  fine: number;
}

/** 旧接口保留兼容；v1.465 的迟到工资由实际工作分钟核算，不收罚款。 */
export function latePenalty(h: number): LatePenalty {
  // 具体工资按 getWorkShift 的绝对班末和实际工时计算；此函数仅为旧调用兜底。
  void h;
  return { ratio: 1, moodPenalty: 0, absent: false, fine: 0 };
}

/** 迟到时长的中文描述（"35 分钟" / "1 小时 20 分钟"） */
export function formatDuration(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

/**
 * v0.975 该岗今天是否休息日（与 jobs.ts 的 isRestDay 同源，但本模块不 import jobs.ts 以免重环）。
 * 缺省每周六休；双休岗周六日；自由接单岗（restDays=[]）不休。
 */
export function isRestDayFor(job: JobDef, time: { year: number; month: number; day: number }): boolean {
  return isRestDayOf(job, weekdayOf(time));
}

/** 由岗位构造当日任务对象 */
function buildJobQuest(state: GameState, job: JobDef, offerUid?: string, forDay = todayOf(state)): Quest {
  const money = job.effects.money ?? 0;
  // v1.463：fixed 已归并为"正式工·周结"（见 jobs.ts 的 performJob 分支），标签口径同步统一。
  const kindLabel = job.kind === "formal" ? "正式工·周结" : "日结";
  // 浮动/分档工资区间（v0.89）：避免任务栏显示错误的天花板数字
  const tier = job.incomeTiers?.[Object.keys(job.incomeTiers)[0]];
  const range = tier?.moneyRange ?? job.moneyRange;
  const rewardText = range
    ? `${kindLabel} ${range.min}~${range.max} 元`
    : money > 0 ? `${kindLabel} +${money} 元` : kindLabel;
  return {
    id: questIdOf(forDay, job.id),
    type: "job",
    title: shortJobName(job.name),
    icon: job.icon,
    desc: job.desc,
    locationId: job.locationId,
    startHour: isPunctual(job) ? job.startHour : undefined,
    endHour: isPunctual(job) ? jobEndHour(job) : undefined,
    day: forDay,
    status: "pending",
    jobId: job.id,
    offerUid,
    reward: rewardText,
    fine: 0,
  };
}

/** 兜底：老存档 / 手搓 state 缺字段时补齐 */
function ensureQuestFields(state: GameState): void {
  if (!Array.isArray(state.quests)) state.quests = [];
  if (typeof state.questsGeneratedDay !== "number") state.questsGeneratedDay = 0;
}

/**
 * 惰性跨天刷新（仿 laborMarket.generatedDay）：
 * 1. 归档昨日未完成任务（pending/active → 记日志）并清空任务栏
 * 2. 在职正式工今日有应出勤班次 → 自动排唯一待办
 */
export function refreshDailyQuests(state: GameState): void {
  ensureQuestFields(state);
  removeRetiredNpcTasks(state);
  const today = todayOf(state);
  if (state.questsGeneratedDay === today && state.quests.some((q) =>
    q.type === "job" && q.status === "pending" && q.day === today && q.jobId === state.career.jobId)) return;
  // 实体委托的一次性记录与物品凭据跨日保存，包括成功、失败结局。
  const npcTasks = state.quests.filter((q) => q.npcTask);
  // v1.43：只归档「早于今天」的未完成任务。晚间预约的次日班次（day = 明天）在跨午夜时
  // 已经属于「今天」，不能被误当成「昨天没完成」清掉；缺 day 字段的旧任务按旧行为归档。
  const isStale = (q: Quest): boolean =>
    !q.commission && !q.npcTask && (q.status === "pending" || q.status === "active") && (typeof q.day !== "number" || q.day < today);
  const stale = state.quests.filter(isStale);
  const currentJobHistory = state.quests.filter((q) => q.type === "job" && q.day === today &&
    (q.status === "done" || q.status === "missed" || q.status === "failed"));
  const pendingFuture = state.quests.filter((q) =>
    !q.commission && !q.npcTask && q.type !== "job" && (q.status === "pending" || q.status === "active") && typeof q.day === "number" && q.day >= today,
  );
  if (stale.length > 0) {
    const names = stale.map((q) => q.title).join("、");
    pushLog(state, "📋", `昨天有 ${stale.length} 项任务没完成：${names}`);
  }
  state.quests = [...npcTasks, ...pendingFuture, ...currentJobHistory];
  state.questsGeneratedDay = today;

  // 在职正式工自动排班
  const c = state.career;
  if (c.jobId && c.nextShiftDay === today && !state.flags["worked_" + c.jobId + "_" + today]) {
    const job = JOB_MAP.get(c.jobId);
    if (job?.kind === "formal" && scheduledWorkShift(job, today).endMinute > workMinute(state)) {
      // v0.975：休息日不生成工作目标、也无需上班
      if (isRestDayFor(job, state.time)) {
        pushLog(state, "📅", `${shortJobName(job.name)}今天休息，好好享受周末`);
      } else {
        state.quests.push(buildJobQuest(state, job));
      }
    }
  }
}

/**
 * 应聘 / 接活 → 生成任务。
 * 同日同岗幂等：已存在则原样返回（仅补 offerUid）。
 * `forDay` 用于「晚间预约次日班次」：任务记到班次实际发生的自然日，
 * 避免跨午夜被 refreshDailyQuests 当成「昨天没完成」而误归档。
 */
export function acceptJobQuest(state: GameState, job: JobDef, offerUid?: string, forDay = todayOf(state)): Quest {
  // 日结立即开工；正式合同由 hireJob 建立，任务只是当前班次的提示。
  if (job.kind === "day" || state.career.jobId !== job.id) return buildJobQuest(state, job, offerUid, forDay);
  refreshDailyQuests(state);
  const id = questIdOf(forDay, job.id);
  const existing = state.quests.find((q) => q.id === id);
  if (existing) {
    if (offerUid && !existing.offerUid) existing.offerUid = offerUid;
    return existing;
  }
  const quest = buildJobQuest(state, job, offerUid, forDay);
  state.quests.push(quest);

  const where = quest.locationId ? locationName(quest.locationId) : "岗位";
  if (quest.startHour !== undefined) {
    pushLog(state, "📋", `接下「${quest.title}」，${quest.startHour}:00 前到${where}报到`);
  } else {
    pushLog(state, "📋", `接下「${quest.title}」，时间自由，随时可以出工`);
  }
  return quest;
}

/** 标记完成（找不到任务时静默忽略，兼容未走任务栏的直接上班） */
export function completeQuest(state: GameState, questId: string): void {
  ensureQuestFields(state);
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.status === "done") return;
  q.status = "done";
}

/** 标记失败（旷工） */
export function failQuest(state: GameState, questId: string, reason?: string): void {
  ensureQuestFields(state);
  const q = state.quests.find((x) => x.id === questId);
  if (!q) return;
  q.status = "failed";
  if (reason) pushLog(state, "⏰", reason);
}

/** 取当日该岗位的任务（判断玩家是否"已接下这份活" —— 罚款前提） */
export function jobQuestOfToday(state: GameState, job: JobDef): Quest | undefined {
  if (!Array.isArray(state.quests)) return undefined;
  return state.quests.find((q) => q.id === questIdOf(todayOf(state), job.id));
}

/** 按岗位标记完成（performJob 调用） */
export function completeJobQuest(state: GameState, job: JobDef, day = todayOf(state)): void {
  completeQuest(state, questIdOf(day, job.id));
}

/** 按岗位标记旷工（performJob 调用），返回被标记的任务 */
export function failJobQuest(state: GameState, job: JobDef, fine: number): void {
  ensureQuestFields(state);
  const q = state.quests.find((x) => x.id === questIdOf(todayOf(state), job.id));
  if (!q) return;
  q.status = "failed";
  q.fine = (q.fine ?? 0) + fine;
}

/**
 * 任务栏读取（纯函数，不改 state —— 供 Svelte 派生使用）。
 * 排序：未完成在前，有定时的按开始时刻升序，已完成沉底。
 */
export function activeQuests(state: GameState): Quest[] {
  if (!Array.isArray(state.quests)) return [];
  const rank = (q: Quest) => (q.status === "done" || q.status === "failed" || q.status === "missed" ? 1 : 0);
  return state.quests.filter(q => !isRetiredNpcQuest(q)).sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ah = a.startHour ?? 99;
    const bh = b.startHour ?? 99;
    return ah - bh;
  });
}



/** Retired feature: old saves discard goals without consuming RNG or paying rewards. */
export function retireDailyGoals(state: GameState): void {
  delete state.dailyGoals;
  for (const key of ['goal_money_start', 'goal_hygiene_start', 'goal_day', 'goal_worked',
    'contacted_today', 'cooked_today', 'exercised_today', 'read_today']) delete state.flags?.[key];
}
/** Compatibility for older callers; daily goals are no longer generated. */
export function generateDailyGoals(state: GameState): DailyGoalSnapshot[] { retireDailyGoals(state); return []; }
export function markGoalWorked(state: GameState): void { retireDailyGoals(state); }
export function tickDailyGoals(state: GameState, _applyReward: (mood: number) => void): number { retireDailyGoals(state); return 0; }

/** 最近一个未完成且有定时的任务（顶栏提醒用） */
export function upcomingQuest(state: GameState): Quest | undefined {
  if (!Array.isArray(state.quests)) return undefined;
  return activeQuests(state).find((q) => q.status === "pending" && q.startHour !== undefined);
}
