/**
 * 任务系统（v0.86）：常驻任务栏 + 工作定时到岗 + 迟到分级罚则。
 * 纯逻辑层。
 *
 * 依赖约束：本模块只引用 jobs.json / locations.json 原始数据 + types + engine.pushLog，
 * **绝不 import ./jobs.ts**（否则形成 time → quests → jobs → time 的重环）。
 * 这与 career.ts 的依赖形态一致。
 *
 * 生命周期：
 * - 接活/应聘 → acceptJobQuest 生成当天 pending 任务（同日同岗幂等）
 * - 跨天 → refreshDailyQuests（挂在 time.advanceHours 的日期进位处）归档旧任务，
 *   并为在职正式工自动排今日班
 * - 上班成功 → completeQuest；迟到超 2 小时 → failQuest
 */
import type { GameState, JobDef, Quest } from "../types";
import { pushLog } from "../engine";
import { gameDay, weekdayOf } from "./calendar";
import { randomInt } from "../rng";
import jobsData from "../data/jobs.json";
import locationsData from "../data/locations.json";

const JOB_DEFS = jobsData as unknown as JobDef[];
const JOB_MAP = new Map(JOB_DEFS.map((j) => [j.id, j]));
const LOC_NAME = new Map(
  (locationsData as unknown as Array<{ id: string; name: string }>).map((l) => [l.id, l.name]),
);

/** v0.965：当日存活天数（绝对日语义，跨月不回绕——"同日"判定统一用此） */
export function todayOf(state: GameState): number {
  return gameDay(state.time);
}

/** 旷工（迟到超 2 小时）罚款 */
export const QUEST_LATE_FINE_ABSENT = 50;

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
  if (typeof job.punctual === "boolean") return job.punctual;
  return job.kind !== "day";
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
  const now = state.time.hour + state.time.minute / 60;
  return circularLateness(now, job.startHour);
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

/**
 * 分级罚款表：
 * | 迟到     | 工资  | 心情 | 结果 |
 * | ≤ 0      | 100% | 0    | 准点 |
 * | 0 ~ 1h   | 80%  | -3   | 迟到 |
 * | 1 ~ 2h   | 50%  | -6   | 迟到 |
 * | > 2h     | 0    | -8   | 旷工，罚 50 元 |
 */
export function latePenalty(h: number): LatePenalty {
  if (h <= 0) return { ratio: 1, moodPenalty: 0, absent: false, fine: 0 };
  if (h <= 1) return { ratio: 0.8, moodPenalty: -3, absent: false, fine: 0 };
  if (h <= 2) return { ratio: 0.5, moodPenalty: -6, absent: false, fine: 0 };
  return { ratio: 0, moodPenalty: -8, absent: true, fine: QUEST_LATE_FINE_ABSENT };
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
  const days = job.restDays ?? ["sat"];
  if (days.length === 0) return false;
  const w = weekdayOf(time);
  const key = w === 5 ? "sat" : w === 6 ? "sun" : undefined;
  return key ? days.includes(key) : false;
}

/** 由岗位构造当日任务对象 */
function buildJobQuest(state: GameState, job: JobDef, offerUid?: string): Quest {
  const money = job.effects.money ?? 0;
  const kindLabel = job.kind === "weekly" ? "周结" : job.kind === "monthly" ? "月结" : job.kind === "fixed" ? "固定" : "日结";
  // 浮动/分档工资区间（v0.89）：避免任务栏显示错误的天花板数字
  const tier = job.incomeTiers?.[Object.keys(job.incomeTiers)[0]];
  const range = tier?.moneyRange ?? job.moneyRange;
  const rewardText = range
    ? `${kindLabel} ${range.min}~${range.max} 元`
    : money > 0 ? `${kindLabel} +${money} 元` : kindLabel;
  return {
    id: questIdOf(todayOf(state), job.id),
    type: "job",
    title: shortJobName(job.name),
    icon: job.icon,
    desc: job.desc,
    locationId: job.locationId,
    startHour: isPunctual(job) ? job.startHour : undefined,
    endHour: isPunctual(job) ? jobEndHour(job) : undefined,
    day: todayOf(state),
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
 * 2. 在职正式工（weekly/monthly）今日未上班 → 自动排今日班
 */
export function refreshDailyQuests(state: GameState): void {
  ensureQuestFields(state);
  if (state.questsGeneratedDay === todayOf(state)) return;

  // v1.3b3：多日委托（type=story 且带 commission）跨天保留，不参与每日任务归档
  const commissions = state.quests.filter((q) => q.commission && q.status === "active");
  const stale = state.quests.filter((q) => !q.commission && (q.status === "pending" || q.status === "active"));
  if (stale.length > 0) {
    const names = stale.map((q) => q.title).join("、");
    pushLog(state, "📋", `昨天有 ${stale.length} 项任务没完成：${names}`);
  }
  state.quests = commissions;
  state.questsGeneratedDay = todayOf(state);

  // 在职正式工自动排班
  const c = state.career;
  if (c.jobId && c.lastWorkDay !== todayOf(state)) {
    const job = JOB_MAP.get(c.jobId);
    if (job) {
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
 * 应聘 / 接活 → 生成当天任务。
 * 同日同岗幂等：已存在则原样返回（仅补 offerUid）。
 */
export function acceptJobQuest(state: GameState, job: JobDef, offerUid?: string): Quest {
  refreshDailyQuests(state);
  const id = questIdOf(todayOf(state), job.id);
  const existing = state.quests.find((q) => q.id === id);
  if (existing) {
    if (offerUid && !existing.offerUid) existing.offerUid = offerUid;
    return existing;
  }
  const quest = buildJobQuest(state, job, offerUid);
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
export function completeJobQuest(state: GameState, job: JobDef): void {
  completeQuest(state, questIdOf(todayOf(state), job.id));
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
  return [...state.quests].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ah = a.startHour ?? 99;
    const bh = b.startHour ?? 99;
    return ah - bh;
  });
}



/* ==================== v1.05 每日目标 ==================== */

export interface DailyGoal {
  id: string;
  text: string;
  check: (s: import('../types').GameState) => boolean;
  reward: { mood: number };
  done: boolean;
}

const GOAL_POOL: Omit<DailyGoal, 'done'>[] = [
  { id: 'earn_100', text: '今天赚到 100 元', check: s => s.player.money > (s.flags['goal_money_start'] as number ?? 0) + 100, reward: { mood: 2 } },
  { id: 'eat_hot', text: '吃一顿热的', check: s => !!s.flags['ateToday'], reward: { mood: 2 } },
  { id: 'shower', text: '洗个澡', check: s => (s.flags['goal_hygiene_start'] as number ?? 0) < s.player.attrs.hygiene, reward: { mood: 2 } },
  { id: 'work_once', text: '干一次活', check: s => !!s.flags['goal_worked'], reward: { mood: 2 } },
  { id: 'contact_someone', text: '联系一位联系人（通话/短信）', check: s => !!s.flags['contacted_today'], reward: { mood: 2 } },
  { id: 'cook_once', text: '做一道菜', check: s => !!s.flags['cooked_today'], reward: { mood: 2 } },
  { id: 'exercise_once', text: '运动一次', check: s => !!s.flags['exercised_today'], reward: { mood: 2 } },
  { id: 'read_once', text: '阅读一次', check: s => !!s.flags['read_today'], reward: { mood: 2 } },
];

/** v1.05 生成今日目标（每天刷新，随机 2 条） */
export function generateDailyGoals(state: import('../types').GameState): DailyGoal[] {
  const today = gameDay(state.time);
  if ((state.flags['goal_day'] as number ?? -1) === today && Array.isArray(state.dailyGoals) && state.dailyGoals.length > 0) {
    return state.dailyGoals;
  }
  state.flags['goal_money_start'] = state.player.money;
  state.flags['goal_hygiene_start'] = state.player.attrs.hygiene;
  state.flags['goal_day'] = today;
  state.flags['goal_worked'] = false;
  state.flags['contacted_today'] = false;
  state.flags['cooked_today'] = false;
  state.flags['exercised_today'] = false;
  state.flags['read_today'] = false;
  // v1.066：改用可播种 PRNG（原 Math.random 破坏读档回放）
  const pool = [...GOAL_POOL];
  const goals: DailyGoal[] = [];
  while (goals.length < 2 && pool.length > 0) {
    const idx = randomInt(state.rng, 0, pool.length - 1);
    goals.push({ ...pool.splice(idx, 1)[0], done: false });
  }
  state.dailyGoals = goals;
  return goals;
}

/** v1.05 工作完成时标记目标 */
export function markGoalWorked(state: import('../types').GameState): void {
  state.flags['goal_worked'] = true;
}

/** v1.05 检查并结算已完成的目标（返回本次新完成的数量） */
export function tickDailyGoals(state: import('../types').GameState, applyReward: (mood: number) => void): number {
  const goals: DailyGoal[] = (state.dailyGoals ?? []) as DailyGoal[];
  let completed = 0;
  for (const g of goals) {
    if (g.done) continue;
    // v1.25：兼容旧存档（check 可能缺失）——缺 check 视为不可结算
    if (!g.check) continue;
    if (g.check(state)) {
      g.done = true;
      applyReward(g.reward.mood);
      completed++;
    }
  }
  return completed;
}


/** 最近一个未完成且有定时的任务（顶栏提醒用） */
export function upcomingQuest(state: GameState): Quest | undefined {
  if (!Array.isArray(state.quests)) return undefined;
  return activeQuests(state).find((q) => q.status === "pending" && q.startHour !== undefined);
}
