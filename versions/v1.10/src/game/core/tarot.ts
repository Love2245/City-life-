/**
 * 塔罗牌成就系统（v0.985，重构自 v0.94 的旧成就系统）。
 *
 * 设计要点：
 * - 22 张大阿尔卡纳（编号 0-21）即全部成就，集齐 0-20 自动解锁 21「世界」。
 * - 数据结构即需求：TAROT_CARDS 每张含 id / name / symbol(象征) / hint / check。
 * - 解锁评估集中在 evaluateTarot(state)，每处状态变更后调用；每日连胜在 tickTarotDaily 维护。
 * - 计数器 counters 记录无法从现有状态直接派生的累计量（学习时长/夜间行动/短信对象/随机事件/工作种类…）。
 *   其余卡片（教皇/恶魔/太阳/审判/战车）直接读现有 state 字段，无需新增计数器。
 *
 * 纯逻辑层：仅依赖 types 与 data/endings.json（只读），不 import DOM/Svelte/Tauri/engine/time，
 * 因此无循环依赖，可被 engine.ts / time.ts / jobs.ts / events.ts 安全引用。
 */
import type { GameState, TarotCounters, TarotState } from "../types";
import { gameDay } from "./calendar";
import endingsData from "../data/endings.json";

/** 结局 tier 查表（endings.json 为顶层数组） */
const ENDING_TIER = new Map<string, string>(
  (endingsData as Array<{ id: string; tier: string }>).map((e) => [e.id, e.tier]),
);

export type { TarotCounters, TarotState };

export function emptyTarotCounters(): TarotCounters {
  return {
    libraryStudyHours: 0,
    queenStreak: 0,
    emperorStreak: 0,
    messagedDistinct: [],
    joblessStreak: 0,
    distinctEvents: [],
    justiceStreak: 0,
    starStreak: 0,
    collapsedThenActed: false,
    distinctJobKinds: [],
    helpedEvents: 0,
    nightActions: 0,
    recoveredFromDepressionOrInjury: false,
    majorCrisisHit: false,
    survivedMajorNegative: false,
    workPayCount: 0,
  };
}

/** 全新档的塔罗状态：愚者(0)开局自动解锁 */
export function initialTarot(): TarotState {
  return { unlocked: [0] };
}

export interface TarotCard {
  id: number;
  name: string;
  /** 象征意义（一句话） */
  symbol: string;
  /** 解锁条件提示（UI 展示用） */
  hint: string;
  /** 解锁条件逻辑：满足返回 true（0 与 21 已特殊处理，不会被直接评估） */
  check: (s: GameState) => boolean;
}

const num = (v: boolean | number | undefined): number => (typeof v === "number" ? v : v === true ? 1 : 0);

export const TAROT_CARDS: TarotCard[] = [
  {
    id: 0,
    name: "愚者",
    symbol: "启程",
    hint: "开局即赠，新的都市生活就此开始。",
    check: () => true,
  },
  {
    id: 1,
    name: "魔术师",
    symbol: "创造",
    hint: "首次主动完成工作并获得报酬。",
    check: (s) => s.counters.workPayCount >= 1,
  },
  {
    id: 2,
    name: "女祭司",
    symbol: "智慧",
    hint: "智力≥60 且累计图书馆学习超 10 小时。",
    check: (s) => s.player.stats.intelligence >= 60 && s.counters.libraryStudyHours >= 10,
  },
  {
    id: 3,
    name: "皇后",
    symbol: "丰盛",
    hint: "饱腹/心情/干净度均≥80 持续 5 天以上。",
    check: (s) => s.counters.queenStreak >= 5,
  },
  {
    id: 4,
    name: "皇帝",
    symbol: "秩序",
    hint: "管理技能≥5 且连续 30 天不请假不迟到。",
    check: (s) => s.player.skills.management >= 5 && s.counters.emperorStreak >= 30,
  },
  {
    id: 5,
    name: "教皇",
    symbol: "信仰",
    hint: "参加弥撒或寺庙义工≥8 次，并完成洗礼或皈依。",
    check: (s) => {
      const church = num(s.flags.church_attended);
      const temple = num(s.flags.temple_volunteered);
      const baptized = s.flags.church_baptized === true;
      const converted = s.flags.temple_done === true;
      return (church >= 8 || temple >= 8) && (baptized || converted);
    },
  },
  {
    id: 6,
    name: "恋人",
    symbol: "羁绊",
    hint: "联系人≥5 且给 3 个不同人通讯。",
    check: (s) => s.contacts.length >= 5 && s.counters.messagedDistinct.length >= 3,
  },
  {
    id: 7,
    name: "战车",
    symbol: "征服",
    hint: "完成 1 个创业项目达 100%。",
    check: (s) => Object.values(s.career.projects).some((v) => v >= 100),
  },
  {
    id: 8,
    name: "力量",
    symbol: "韧性",
    hint: "体质≥70 且从抑郁或重伤中完全恢复。",
    check: (s) => s.player.stats.fitness >= 70 && s.counters.recoveredFromDepressionOrInjury,
  },
  {
    id: 9,
    name: "隐者",
    symbol: "独行",
    hint: "超 50 天无固定工作且存款≥5000。",
    check: (s) => s.counters.joblessStreak >= 50 && s.player.money >= 5000,
  },
  {
    id: 10,
    name: "命运之轮",
    symbol: "转折",
    hint: "累计触发 15 个不同随机事件。",
    check: (s) => s.counters.distinctEvents.length >= 15,
  },
  {
    id: 11,
    name: "正义",
    symbol: "平衡",
    hint: "各项属性 50-80 稳定超 10 天。",
    check: (s) => s.counters.justiceStreak >= 10,
  },
  {
    id: 12,
    name: "倒吊人",
    symbol: "牺牲",
    hint: "体力透支晕倒后未立刻睡而继续行动。",
    check: (s) => s.counters.collapsedThenActed,
  },
  {
    id: 13,
    name: "死神",
    symbol: "蜕变",
    hint: "换过≥5 种不同类型工作。",
    check: (s) => s.counters.distinctJobKinds.length >= 5,
  },
  {
    id: 14,
    name: "节制",
    symbol: "调和",
    hint: "魅力≥60 且智力≥60，并完成 3 次助人事件。",
    check: (s) =>
      s.player.stats.charm >= 60 &&
      s.player.stats.intelligence >= 60 &&
      s.counters.helpedEvents >= 3,
  },
  {
    id: 15,
    name: "恶魔",
    symbol: "执念",
    hint: "持有≥3 件奢侈品且金钱≥20000。",
    check: (s) => s.economy.ownedLuxury.length >= 3 && s.player.money >= 20000,
  },
  {
    id: 16,
    name: "高塔",
    symbol: "崩坏",
    hint: "跌入重大生存危机（健康归零 / 濒临破产 / 体力透支晕倒）后重新站起来。",
    check: (s) => s.counters.survivedMajorNegative,
  },
  {
    id: 17,
    name: "星星",
    symbol: "希望",
    hint: "心情≥85 连续 10 天以上。",
    check: (s) => s.counters.starStreak >= 10,
  },
  {
    id: 18,
    name: "月亮",
    symbol: "暗夜",
    hint: "夜间 23:00-5:00 累计行动超 20 次。",
    check: (s) => s.counters.nightActions >= 20,
  },
  {
    id: 19,
    name: "太阳",
    symbol: "成就",
    hint: "解锁 1 个好结局或隐藏结局。",
    check: (s) =>
      s.unlockedEndings.some((id) => {
        const t = ENDING_TIER.get(id);
        return t === "good" || t === "secret";
      }),
  },
  {
    id: 20,
    name: "审判",
    symbol: "觉醒",
    hint: "解锁≥4 种不同结局。",
    check: (s) => s.unlockedEndings.length >= 4,
  },
  {
    id: 21,
    name: "世界",
    symbol: "圆满",
    hint: "集齐前 21 张塔罗牌后自动解锁。",
    // 永不直接评估；由 evaluateTarot 末段自动判定
    check: () => false,
  },
];

/** 结局 id → tier（good/secret/bad） */
export function endingTier(id: string): string | undefined {
  return ENDING_TIER.get(id);
}

const TAROT_MAP = new Map(TAROT_CARDS.map((c) => [c.id, c]));

export function tarotCard(id: number): TarotCard | undefined {
  return TAROT_MAP.get(id);
}

export function tarotUnlockedCount(state: GameState): number {
  return state.tarot.unlocked.length;
}

export function tarotTotal(): number {
  return TAROT_CARDS.length;
}

/**
 * 评估全部塔罗牌：未解锁且条件满足则解锁，推入 state.tarot.unlocked 与 state.pendingTarot。
 * 末段自动判定「世界」(id 21)：集齐 0-20 即解锁（支持同一次评估内补满 20 → 即时补 21）。
 * 幂等：已解锁的牌不会重复推入 pendingTarot。
 */
export function evaluateTarot(state: GameState): number[] {
  const newly: number[] = [];
  for (const c of TAROT_CARDS) {
    if (state.tarot.unlocked.includes(c.id)) continue;
    if (c.id === 21) continue; // 世界牌仅由下方自动判定
    if (c.check(state)) {
      state.tarot.unlocked.push(c.id);
      newly.push(c.id);
    }
  }
  // 世界牌：集齐 0-20 后自动解锁（含本轮刚补满的情形）
  if (
    !state.tarot.unlocked.includes(21) &&
    TAROT_CARDS.slice(0, 21).every((c) => state.tarot.unlocked.includes(c.id))
  ) {
    state.tarot.unlocked.push(21);
    newly.push(21);
  }
  for (const id of newly) state.pendingTarot.push(id);
  return newly;
}

const within = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/**
 * 每日结算时调用（time.ts sleepSettlement 末尾）：维护连续天数类计数器，并评估（让每日牌可在睡觉时解锁）。
 * 同时重置「当日请假/迟到」标记供皇帝牌判定。
 * @returns 本次新解锁的牌 id 列表
 */
export function tickTarotDaily(state: GameState): number[] {
  const a = state.player.attrs;
  const c = state.counters;

  // 皇后：饱腹/心情/干净度均≥80
  c.queenStreak = a.satiety >= 80 && a.mood >= 80 && a.hygiene >= 80 ? c.queenStreak + 1 : 0;

  // 正义：五项生存属性均稳定 50-80
  c.justiceStreak =
    within(a.stamina, 50, 80) &&
    within(a.health, 50, 80) &&
    within(a.mood, 50, 80) &&
    within(a.hygiene, 50, 80) &&
    within(a.satiety, 50, 80)
      ? c.justiceStreak + 1
      : 0;

  // 星星：心情≥85
  c.starStreak = a.mood >= 85 ? c.starStreak + 1 : 0;

  // 皇帝：必须「有固定工作 + 当天去上了班 + 没迟到」才算守住秩序的一天。
  // 无业 / 缺勤（等同请假）/ 迟到 任一发生即断。判定后清零当日迟到标记。
  const wasLate = state.flags.wasLateToday === true;
  const employed = state.career.jobId !== null;
  const workedToday = state.career.lastWorkDay === gameDay(state.time);
  c.emperorStreak = employed && workedToday && !wasLate ? c.emperorStreak + 1 : 0;
  state.flags.wasLateToday = false;

  // 隐者：无固定工作 → 连续 +1，否则归零
  c.joblessStreak = state.career.jobId === null ? c.joblessStreak + 1 : 0;

  return evaluateTarot(state);
}

/* ==================== 埋点钩子（由各系统调用） ==================== */

/** 夜间行动计数：在 engine.applyEffects 末尾按当前时刻调用 */
export function recordNightAction(state: GameState): void {
  const h = state.time.hour;
  if (h >= 23 || h < 5) state.counters.nightActions++;
}

/** 晕倒后未睡继续行动：在 engine.applyEffects 末尾调用，处理「倒吊人」 */
export function recordCollapsedThenActed(state: GameState): void {
  if (state.flags.collapsed_not_slept === true) {
    state.counters.collapsedThenActed = true;
    state.flags.collapsed_not_slept = false;
  }
}

/** 晕倒发生时置位（engine.triggerCollapse 内调用） */
export function markCollapsed(state: GameState): void {
  state.flags.collapsed_not_slept = true;
}

/** 工作完成：jobs.ts markJobDone 内调用。paid>0 记一次有偿工作（魔术师），工种去重累计（死神） */
export function onWorkDone(state: GameState, jobId: string, paid: number): void {
  if (paid > 0) state.counters.workPayCount++;
  if (!state.counters.distinctJobKinds.includes(jobId)) state.counters.distinctJobKinds.push(jobId);
}

/** 迟到打卡：jobs.ts punchIn 内调用，当日置位，皇帝牌在每日结算时消费 */
export function markLateToday(state: GameState): void {
  state.flags.wasLateToday = true;
}

/** 随机事件被抽中：events.ts rollEvent 内调用（命运之轮按不同事件 id 去重累计） */
export function onEventTriggered(state: GameState, eventId: string): void {
  if (!state.counters.distinctEvents.includes(eventId)) state.counters.distinctEvents.push(eventId);
}

/**
 * 「助人」事件选项白名单（节制）。
 * events.json 未给选项打语义标签，这里集中维护 事件 id → 助人选项下标，
 * 新增助人剧情时只需在此登记一行，不必改数据 schema。
 */
const HELPING_CHOICES: Record<string, number[]> = {
  ev_library_student: [0], // 热心帮忙（给同学讲题）
  ev_church_fellowship: [1], // 帮着端菜洗碗
  ev_pasture_calf: [0], // 扶小牛一把
  ev_church_donation_box: [0], // 投下捐款
};

/** 事件选项已结算：events.ts applyEventChoice 末尾调用 */
export function onEventChoice(state: GameState, eventId: string, choiceIdx: number): void {
  if (HELPING_CHOICES[eventId]?.includes(choiceIdx)) state.counters.helpedEvents++;
}

/**
 * 跌入重大生存危机（高塔前置）：健康归零倒计时启动 / 资金为负满 3 天 / 体力透支晕倒。
 * 只置位，不解锁——必须活着爬出来才算。
 */
export function markMajorCrisis(state: GameState): void {
  state.counters.majorCrisisHit = true;
}

/**
 * 从重大危机中恢复（高塔）：危机标记存在、人还活着、且各项指标回到安全线以上。
 * survival.ts 每日结算与 engine 结算后调用。
 */
export function checkCrisisRecovered(state: GameState): void {
  const c = state.counters;
  if (!c.majorCrisisHit || c.survivedMajorNegative) return;
  if (state.endingId !== null) return; // 已经 game over，不算“存活”
  const p = state.player;
  const safe =
    p.attrs.health >= 50 &&
    p.money >= 0 &&
    p.criticalHealthStreak === 0 &&
    p.negativeMoneyStreak === 0;
  if (safe) {
    c.survivedMajorNegative = true;
    c.majorCrisisHit = false;
  }
}

/** 玩家给联系人发短信：contacts.ts sendSmsToContact 内调用 */
export function onContactMessaged(state: GameState, contactId: string): void {
  if (!state.counters.messagedDistinct.includes(contactId)) state.counters.messagedDistinct.push(contactId);
}

/** 图书馆学习：actions.ts 通用分支（locationId==="library"）内调用 */
export function onLibraryStudy(state: GameState, hours: number): void {
  state.counters.libraryStudyHours += hours;
}

/** 从抑郁/重伤恢复：survival.ts / treat_depression 内调用 */
export function onRecoveredDepressionOrInjury(state: GameState): void {
  state.counters.recoveredFromDepressionOrInjury = true;
}
