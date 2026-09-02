/**
 * 工作小游戏引擎（v0.96）：每份工作各具特色的迷你玩法。
 * 纯逻辑层：配置读取、难度系数、音游判定、评分奖励。
 *
 * 玩法类型（按引擎分派）：
 * - sequence：顺序点击（流水线多轮乱序 / 咖啡配方 / 配送路线 / 巡逻打点 / 记忆复现 / 摆摊）
 * - quiz：快速判断（收银找零 / 质检 / 分拣 / 话术 / 配餐）
 * - whack：反应点击（打地鼠式：点目标避开坏目标 / 信号灯）
 * - rhythm：音游（下落音符 + 判定线，锻炼 / 卖唱）
 *
 * 全局难度系数 DIFFICULTY = 0.965：作为判定窗与限时/下落速度的缩放基础值（<1 → 略严格）。
 * 设计原则：无压力无惩罚——非完美不扣数值；得分比例映射为工资加成（0~5%）。
 */
import type { Effects, GameState, SkillKey } from "../types";
import { applyEffects, pushLog } from "../engine";
import { recordMoney } from "./weekly"; // v1.215：小游戏奖金计入周记（P1-10）
import minigameData from "../data/minigames.json";
// v1.3b2 技能减时：只读数据表（不引 jobs.ts / actions.ts，避免循环依赖）
import jobsData from "../data/jobs.json";
import actionsData from "../data/actions.json";

/** 全局难度系数（判定阈值 / 速度 / 容错调整的基础值） */

/** v1.05 难度分级（可在设置中选择，替代全局 DIFFICULTY） */
export type DifficultyTier = 'easy' | 'normal' | 'hard';
export const DIFF_TIER_SCALE: Record<DifficultyTier, number> = { easy: 1.15, normal: 0.965, hard: 0.78 };
export function getDifficulty(state: import('../types').GameState): DifficultyTier {
  const v = state.flags['difficulty_tier'];
  if (typeof v === 'string' && (v === 'easy' || v === 'normal' || v === 'hard')) return v;
  return 'normal';
}
export function scaledDifficulty(state: import('../types').GameState): number {
  return DIFF_TIER_SCALE[getDifficulty(state)];
}

export const DIFFICULTY = (minigameData as { difficulty: number }).difficulty;

// ---- 配置类型 ----

export interface SequenceCfg {
  type: "sequence";
  title: string;
  icon: string;
  desc: string;
  steps: string[];
  stepIcons?: string[];
  /** 循环轮数（流水线 3-5 次；每轮开始前按钮乱序） */
  rounds?: number;
  /** 每轮开始前是否打乱按钮顺序 */
  shuffleEachRound?: boolean;
  /** 记忆模式：先亮序展示，再按记忆复点 */
  memory?: boolean;
  /** 配方表（咖啡师）：顶部展示，每轮从表中随机选一杯 */
  recipeTable?: { name: string; recipe: string[] }[];
  /** 限时（秒），缺省不限 */
  timeLimit?: number;
  /** 失误容忍次数（点错扣一次，超出判非完美） */
  wrongLimit?: number;
  perfectBonusRate?: number;
}

export interface QuizCfg {
  type: "quiz";
  title: string;
  icon: string;
  desc: string;
  questions: { q: string; options: string[]; answer: number }[];
  timeLimit?: number;
  wrongLimit?: number;
  perfectBonusRate?: number;
}

export interface WhackCfg {
  type: "whack";
  title: string;
  icon: string;
  desc: string;
  /** 出现的目标总数（好+坏） */
  targets: number;
  timeLimit?: number;
  wrongLimit?: number;
  goodLabel: string;
  goodIcon: string;
  badLabel: string;
  badIcon: string;
  perfectBonusRate?: number;
}

export interface RhythmCfg {
  type: "rhythm";
  title: string;
  icon: string;
  desc: string;
  /** 轨道数（1-3） */
  tracks: number;
  /** 音符总数 */
  notes: number;
  /** 相邻音符间隔（ms） */
  intervalMs: number;
  /** 音符下落时长（ms） */
  fallMs: number;
  perfectBonusRate?: number;
}

/** v1.20 中国象棋（公园「象棋大爷」）：内置简易对弈，胜/负/和由组件自行判定 */
export interface ChessCfg {
  type: "chess";
  title: string;
  icon: string;
  desc: string;
  /** 胜局奖金（元） */
  winMoney?: number;
  /** 和局奖金（元） */
  drawMoney?: number;
  perfectBonusRate?: number;
}

/** v1.25 记忆配对：先展示卡牌几秒，翻面后按记忆两两配对 */
export interface MemoryCfg {
  type: "memory";
  title: string;
  icon: string;
  desc: string;
  /** 卡牌图标池（取前 4 个做 4 对） */
  icons: string[];
  /** 记忆展示时长（ms），缺省 3500 */
  showMs?: number;
  timeLimit?: number;
  perfectBonusRate?: number;
}

/** v1.25 工序排序：把打乱的步骤按正确顺序依次点选 */
export interface SortCfg {
  type: "sort";
  title: string;
  icon: string;
  desc: string;
  /** 正确顺序（从先到后） */
  order: string[];
  /** 展示条目（label + icon） */
  items: { label: string; icon?: string }[];
  /** v1.25 限时（秒） */
  timeLimit?: number;
  /** v1.3b2 循环轮数（每轮重新打乱），默认 1 */
  rounds?: number;
  wrongLimit?: number;
  perfectBonusRate?: number;
}

// ---- v1.3 四套新模板 ----

export interface RestaurantCfg {
  type: "restaurant";
  title: string;
  icon: string;
  desc: string;
  perfectBonusRate?: number;
  /** v1.3b2 全局限时（秒），缺省不限（数据层已统一为 30） */
  timeLimit?: number;
  /** 生命值（顾客走掉扣 1），默认 3 */
  lives?: number;
  /** 本班次总顾客数，默认 10 */
  totalCustomers?: number;
  /** 顾客生成间隔(ms)，默认 4500 */
  spawnMs?: number;
  /** 同时等待上限，默认 3 */
  maxWaiting?: number;
  /** 主品展示形态（仅视觉），不影响逻辑 */
  mode?: "burger" | "cup" | "snack";
  /** 底部食材栏（主品原料） */
  ingredients: { id: string; name: string; icon: string }[];
  /**
   * 可选配菜。
   * v1.3b2：新增 group —— 同 group 的多个 id 视为「可互相满足」（点了薯条给同组的薯饼也算对）。
   */
  sides?: { id: string; name: string; icon: string; price: number; group?: string }[];
  /**
   * 可选饮料。
   * v1.3b2 修复：可乐/雪碧在数据层合并为「碳酸饮料」，并用 group 做同组互认，
   * 避免顾客点了 cola 而柜台只有 sprite 时永远无法满足。
   */
  drinks?: { id: string; name: string; icon: string; price: number; group?: string }[];
  /** 主品配方 */
  recipes: { id: string; name: string; price: number; recipe: string[] }[];
  /** 顾客类型 */
  customerTypes: { name: string; emoji: string; patience: number; tip: number }[];
  /**
   * v1.3b2 摆摊模式（街边/周末集市摆摊）：无全局计时、无顾客总数，
   * 顾客按批刷新，服务完一批询问「继续 / 收摊」；每服务一人按份计钱（多劳多得），
   * 每服务一人扣体力并经过时间，体力不支或时间太晚强制收摊。
   */
  stall?: boolean;
  /** 摆摊：每服务一位顾客的收入（元），多劳多得 */
  stallPerCustomerPay?: number;
  /** 摆摊：每服务一位顾客消耗的体力（体力不支则强制收摊） */
  stallStaminaCost?: number;
  /** 摆摊：每服务一位顾客经过的时间（小时），用于「太晚了收摊」判定 */
  stallHourPerCustomer?: number;
  /**
   * v1.3b3 顾客数上限：达到即「食材用完了」强制收摊（覆盖街边 / 周末集市）。
   * 0 或不填 = 无上限（仅受体力 / 时间约束）。用于平衡「时长远超其他工作却工资持平」。
   */
  stallCustomerCap?: number;
}

/** 工厂流水线 / 物流分拣：传送带零件按顺序抓取组装，错抓或漏抓目标扣血，完成升级加速 */
export interface FactoryCfg {
  type: "factory";
  title: string;
  icon: string;
  desc: string;
  perfectBonusRate?: number;
  /** v1.3b2 全局限时（秒），缺省不限（数据层已统一为 30） */
  timeLimit?: number;
  /** 生命值（错抓/漏抓目标零件扣 1），默认 3 */
  lives?: number;
  /** 达标产量（达成即满分结束），默认 15 */
  productsToWin?: number;
  /** 零件生成间隔(ms)，默认 1100 */
  spawnMs?: number;
  /** 工单长度范围，默认 3~6 */
  recipeMin?: number;
  recipeMax?: number;
  /** 生成目标零件的概率，默认 0.4 */
  targetWeight?: number;
  /** 流水线零件池 */
  parts: { id: string; name: string; icon: string }[];
}

/** 便利店收银：购物篮扫码 → 计算应收 → 顾客付款 → 输入找零，耐心耗尽则投诉 */
export interface CheckoutCfg {
  type: "checkout";
  title: string;
  icon: string;
  desc: string;
  perfectBonusRate?: number;
  /** 生命值（找零错误或投诉扣 1），默认 3 */
  lives?: number;
  /** 本班顾客数，默认 5 */
  customers?: number;
  /** v1.3b2 全局限时（秒），缺省不限（数据层已统一为 30） */
  timeLimit?: number;
  /** 耐心每秒下降点数（0~100），默认 1.2 */
  patienceMs?: number;
  /** 商品池 */
  items: { id: string; name: string; icon: string; price: number }[];
  /** 纸币面额（升序），用于生成顾客付款 */
  notes?: number[];
  /** 每篮商品数范围，默认 3~6 */
  minBasket?: number;
  maxBasket?: number;
}

export interface DispatchGuestType {
  typeKey: string;
  name: string;
  icon: string;
  peopleRange: number[];
  budgetRange: number[];
  /** 资源偏好：分配到的资源 type 命中时额外加分 */
  prefType?: string;
  prefTip?: number;
}

export interface DispatchRoomType {
  type: string;
  name: string;
  icon: string;
  beds: number;
  price: number;
}

/** 酒店前台 / 驾校助教派单：排队需求方 + 资源匹配（床位/预算/人数），满意度与连击驱动结算 */
export interface DispatchCfg {
  type: "dispatch";
  title: string;
  icon: string;
  desc: string;
  perfectBonusRate?: number;
  /** v1.3b2 全局限时（秒），缺省不限（数据层已统一为 30） */
  timeLimit?: number;
  /** 当日总需求方总数，默认 12 */
  guestsTotal?: number;
  /** 需求方生成间隔(ms)，默认 6000 */
  spawnMs?: number;
  /** 单个需求方耐心上限(秒)，默认 120 */
  patienceMax?: number;
  guests: DispatchGuestType[];
  rooms: DispatchRoomType[];
  /** 文案替换（默认：需求方=旅客/资源=房间） */
  labels?: { guest: string; resource: string };
}

// ---- v1.3 beta2：Canvas 配送模板（外卖 / 快递 / 网约车） ----

/** 地图节点（取货点 / 送达点）；x,y 为路口坐标，door 为建筑门口坐标（车停到门口） */
export interface DeliveryPoint {
  id: string;
  name: string;
  /** 路网坐标（须落在 xs × ys 网格交点上） */
  x: number;
  y: number;
  /** 门口坐标（从路口拐进去的落点） */
  door: { x: number; y: number };
  icon?: string;
  color?: string;
}

/**
 * v1.3b2 配送模板：网格路网 + Dijkstra 寻路 + 订单状态机（备货 → 取货 → 送达）。
 * 三种 mode 共用同一套地图几何，仅替换取送点池、文案与主题色：
 * - food：外卖（餐厅 → 住户）
 * - parcel：快递（仓库 → 收件地址）
 * - rideshare：网约车 / 出租车（上车点 → 下车点）
 */
export interface DeliveryCfg {
  type: "delivery";
  title: string;
  icon: string;
  desc: string;
  perfectBonusRate?: number;
  mode: "food" | "parcel" | "rideshare";
  /** 限时（秒），默认 30 */
  timeLimit?: number;
  /** 达标单数（完成即满分），默认 5 */
  targetOrders?: number;
  /** 每单展示收入（元，仅界面展示，不直接进钱包） */
  payPerOrder?: number;
  /** 同时在手订单上限，默认 3 */
  maxActive?: number;
  /** 取货点池（餐厅 / 仓库 / 上车点） */
  pickups: DeliveryPoint[];
  /** 送达点池（住户 / 收件地址 / 下车点） */
  drops: DeliveryPoint[];
  /** 文案替换（默认：取货 / 送达） */
  labels?: { pickup: string; dropoff: string; order?: string; cooking?: string };
  /** 主题配色 */
  theme?: { road?: string; accent?: string };
}

export type MiniGameConfig = SequenceCfg | QuizCfg | WhackCfg | RhythmCfg | ChessCfg | MemoryCfg | SortCfg | RestaurantCfg | FactoryCfg | CheckoutCfg | DispatchCfg | DeliveryCfg;

// ---- 配置读取 ----

const GAMES = (minigameData as { games: Record<string, MiniGameConfig> }).games;

/** 按 key（jobId 或 actionId）取小游戏配置；无配置返回 undefined（该工作不弹小游戏） */
export function getMiniGameConfig(key: string): MiniGameConfig | undefined {
  return GAMES[key];
}

/** 所有已配置的小游戏 key（测试完整性用） */
export function configuredMiniGameKeys(): string[] {
  return Object.keys(GAMES);
}

// ---- v1.3 beta2：单局时长统一 + 技能减时 ----

/**
 * 时长基线：所有小游戏按「单局约 30 秒」设计（数据层已统一），
 * 主技能每高 1 级再减 8%，最低减到 50%（即 15 秒）。
 */
export const MG_TIME = {
  /** 基准单局秒数（数据层设计值） */
  baseSec: 30,
  /** 每级技能减时比例 */
  perLevel: 0.08,
  /** 缩放下限（不会比基准的 50% 更短） */
  floor: 0.5,
} as const;

/** 技能等级 → 时长系数（0 级 = 1.0，6 级 = 0.52，7 级及以上 = 0.5） */
export function miniGameTimeFactor(level: number): number {
  const lv = Math.max(0, Math.floor(level || 0));
  return Math.max(MG_TIME.floor, 1 - MG_TIME.perLevel * lv);
}

/**
 * 部分工作/行动的 effects.skills 为空，取不到主技能 → 手动指定。
 * 未列出且数据里也没有技能收益的（锻炼类 rhythm、象棋）不参与减时，属预期行为。
 */
const MG_SKILL_OVERRIDE: Record<string, SkillKey> = {
  stall_street_night: "cooking",
  temple_volunteer: "service",
  street_singing: "operation",
  // v1.3b2 补齐：这些岗位 jobs.json 里没写技能收益，但玩法明确对应某项技能
  job_express: "driving",
  job_ride_hailing: "driving",
  job_taxi: "driving",
  job_market_cleaner: "service",
  job_security: "service",
  job_sales: "service",
  job_sorting: "operation",
  job_loading: "operation",
  job_training_assistant: "programming",
};

type EffectSkills = { effects?: { skills?: Partial<Record<string, number>> } };
const JOB_ROWS = jobsData as unknown as ({ id: string } & EffectSkills)[];
const ACTION_ROWS = actionsData as unknown as ({ id: string } & EffectSkills)[];

let SKILL_OF_KEY: Map<string, SkillKey> | null = null;
function skillIndex(): Map<string, SkillKey> {
  if (SKILL_OF_KEY) return SKILL_OF_KEY;
  const m = new Map<string, SkillKey>();
  for (const row of [...JOB_ROWS, ...ACTION_ROWS]) {
    const sk = row?.effects?.skills;
    if (!sk) continue;
    let best: string | undefined;
    let bestVal = -Infinity;
    for (const [k, v] of Object.entries(sk)) {
      const n = typeof v === "number" ? v : 0;
      if (n > bestVal) {
        bestVal = n;
        best = k;
      }
    }
    if (best && bestVal > 0) m.set(row.id, best as SkillKey);
  }
  for (const [k, v] of Object.entries(MG_SKILL_OVERRIDE)) m.set(k, v);
  SKILL_OF_KEY = m;
  return m;
}

/** 小游戏 key（jobId / actionId）对应的主技能；无技能收益的行动返回 undefined */
export function mainSkillOfMiniGame(key: string): SkillKey | undefined {
  return skillIndex().get(key);
}

/** 计数字段下限（缩放后不得低于此值，避免开局即满分） */
const MG_MIN: Record<string, number> = {
  rounds: 1,
  targets: 5,
  totalCustomers: 3,
  customers: 2,
  // 工厂产量必须能随时长同比下降（吞吐受 spawnMs 限制），否则减时后高技能玩家永远拿不到满分
  productsToWin: 3,
  guestsTotal: 4,
  notes: 8,
  targetOrders: 2,
  questions: 3,
};

function scaleCount(v: number | undefined, f: number, field: string): number | undefined {
  if (typeof v !== "number") return v;
  return Math.max(MG_MIN[field] ?? 1, Math.ceil(v * f));
}

/**
 * 按时长系数缩放配置（**深拷贝**，绝不修改模块级 GAMES）。
 * 只缩放「总时长」与「总数量」；**不缩放** spawnMs / patienceMs / intervalMs / fallMs /
 * maxWaiting / lives 等密度与容错字段 —— 时长短了数量同比减少，单位时间难度恒定。
 * chess（自由对弈）不参与缩放。
 */
export function scaleMiniGameConfig<T extends MiniGameConfig>(cfg: T, factor: number): T {
  const f = Math.max(MG_TIME.floor, Math.min(1, factor));
  const c = JSON.parse(JSON.stringify(cfg)) as T;
  if (f >= 1 || c.type === "chess") return c;

  const any = c as unknown as Record<string, unknown>;
  if (typeof any.timeLimit === "number") {
    any.timeLimit = Math.max(8, Math.round((any.timeLimit as number) * f));
  }
  for (const field of ["rounds", "targets", "totalCustomers", "customers", "productsToWin", "guestsTotal", "notes", "targetOrders"]) {
    const scaled = scaleCount(any[field] as number | undefined, f, field);
    if (scaled !== undefined) any[field] = scaled;
  }
  if (Array.isArray(any.questions)) {
    const arr = any.questions as unknown[];
    any.questions = arr.slice(0, Math.max(MG_MIN.questions, Math.ceil(arr.length * f)));
  }
  return c;
}

/**
 * 带技能减时的配置读取（组件应使用此函数）。
 * 与纯查表的 getMiniGameConfig 分离：查表函数保持无状态、可被测试直接断言原始数据。
 */
export function getMiniGameConfigFor(state: GameState, key: string): MiniGameConfig | undefined {
  const base = GAMES[key];
  if (!base) return undefined;
  const skill = mainSkillOfMiniGame(key);
  if (!skill) return JSON.parse(JSON.stringify(base)) as MiniGameConfig;
  const lv = state.player.skills[skill] ?? 0;
  return scaleMiniGameConfig(base, miniGameTimeFactor(lv));
}

/** 估算单局时长（秒），用于测试守护「30 秒基准」 */
export function estimateMiniGameSec(cfg: MiniGameConfig): number {
  const any = cfg as unknown as Record<string, number | undefined>;
  if (typeof any.timeLimit === "number") return any.timeLimit;
  switch (cfg.type) {
    case "rhythm":
      return Math.round(((cfg.notes ?? 10) * (cfg.intervalMs ?? 900) + (cfg.fallMs ?? 1800)) / 1000);
    case "restaurant":
      return Math.round(((cfg.totalCustomers ?? 10) * (cfg.spawnMs ?? 4500)) / 1000);
    case "factory":
      return Math.round(((cfg.productsToWin ?? 15) * (cfg.spawnMs ?? 1100)) / 1000);
    case "dispatch":
      return Math.round(((cfg.guestsTotal ?? 12) * (cfg.spawnMs ?? 6000)) / 1000);
    default:
      return MG_TIME.baseSec;
  }
}

// ---- 音游判定 ----

export type TimingJudge = "perfect" | "good" | "ok" | "miss";

/**
 * 判定窗口（ms，基础值 × 难度系数）。
 * v0.965 调宽基准（90→110 / 150→185 / 230→280），整体更宽松、容错更高。
 */
export const JUDGE_WINDOW = {
  perfect: Math.round(110 * DIFFICULTY),
  good: Math.round(185 * DIFFICULTY),
  ok: Math.round(280 * DIFFICULTY),
};

export const JUDGE_SCORE: Record<TimingJudge, number> = {
  perfect: 100,
  good: 70,
  ok: 40,
  miss: 0,
};

export const JUDGE_LABEL: Record<TimingJudge, string> = {
  perfect: "完美",
  good: "良好",
  ok: "普通",
  miss: "失误",
};

/** 根据按键时刻与理想时刻的偏差（ms）判定 */
export function judgeTiming(offsetMs: number): TimingJudge {
  const abs = Math.abs(offsetMs);
  if (abs <= JUDGE_WINDOW.perfect) return "perfect";
  if (abs <= JUDGE_WINDOW.good) return "good";
  if (abs <= JUDGE_WINDOW.ok) return "ok";
  return "miss";
}

/**
 * 限时（秒）按难度系数缩放。
 * v0.965：改为放宽（×1.15），给玩家更充裕的时间，降低压力。
 */
export function scaleTimeLimit(baseSec: number): number {
  return Math.max(4, Math.round(baseSec * 1.15 * 10) / 10);
}

/** 失误容忍（v0.965：下限提升到 2，更宽容） */
export function scaleWrongLimit(base: number): number {
  return Math.max(2, Math.floor(base * DIFFICULTY));
}

// ---- 表现评级（v0.965 玩法反馈） ----

export type GameGrade = "S" | "A" | "B" | "C" | "D";

export const GRADE_LABEL: Record<GameGrade, string> = {
  S: "神级表现",
  A: "干得漂亮",
  B: "中规中矩",
  C: "勉强过关",
  D: "有待努力",
};

/** 得分比例 → 评级 */
export function gradeOf(ratio: number): GameGrade {
  if (ratio >= 0.95) return "S";
  if (ratio >= 0.8) return "A";
  if (ratio >= 0.6) return "B";
  if (ratio >= 0.3) return "C";
  return "D";
}

// ---- 评分与奖励 ----

export const MINIGAME_REWARD = {
  /** 完美表现的最高工资加成比例 */
  maxBonusRate: 0.05,
  /** 无工资来源（实习/零薪）时的心情补偿 */
  moodFallback: 1,
};

/**
 * 结算小游戏奖励（按得分比例 0-1 给工资加成，失败/低分无惩罚）。
 * @param key 工作/行动 id（仅日志用）
 * @param scoreRatio 得分比例 0-1（miss 不计分，完美=1）
 * @param todayPay 本次结算的工资基数
 */
export function applyMiniGameReward(
  state: GameState,
  key: string,
  scoreRatio: number,
  todayPay = 0,
): { rewarded: boolean; bonus?: number; ratio: number } {
  const ratio = Math.max(0, Math.min(1, scoreRatio));
  const cfg = getMiniGameConfig(key);
  const maxRate = cfg?.perfectBonusRate ?? MINIGAME_REWARD.maxBonusRate;
  if (ratio <= 0) return { rewarded: false, ratio };
  // v1.215 修复（P2-4）：加成按比例真实计算，允许 0 加成（原 Math.max(1,…) 强制 +1 元）
  const bonus = Math.max(0, Math.round((todayPay || 0) * maxRate * ratio));
  if (todayPay > 0) {
    state.player.money += bonus;
    recordMoney(state, bonus); // v1.215 修复（P1-10）：小游戏奖金计入周记收入
    pushLog(state, "🎮", `小游戏表现 ${Math.round(ratio * 100)} 分！工作加成 +${bonus} 元`);
    return { rewarded: true, bonus, ratio };
  }
  // 工资为 0（实习/无薪）：给心情小补偿（表现越好心情越高）
  const moodGain = Math.round(MINIGAME_REWARD.moodFallback * ratio);
  state.player.attrs.mood = Math.min(100, state.player.attrs.mood + moodGain);
  pushLog(state, "🎮", `小游戏表现 ${Math.round(ratio * 100)} 分！心情 +${moodGain}`);
  return { rewarded: true, bonus: 0, ratio };
}

// ---- v1.33 P5 游乐场小游戏：分数换奖品 ----

/** 游乐场付费小游戏的奖品档位（按得分比例达标） */
export interface AmusementPrizeTier {
  /** 达标得分比例（0-1），档位按 min 从高到低排列 */
  min: number;
  /** 档位名（结算提示用） */
  label: string;
  money?: number;
  mood?: number;
}

/** 游乐场小游戏 key（付费入场 + 分数换奖品） */
export const AMUSEMENT_GAME_KEYS = [
  "amusement_icecream",
  "amusement_bowling",
  "amusement_dart",
  "amusement_ringtoss",
];

export function isAmusementGame(key: string): boolean {
  return AMUSEMENT_GAME_KEYS.includes(key);
}

/**
 * 按得分比例命中奖品档位（取最高达标档）。
 * 档位按 min 从高到低排列，取达标档中 min 最大（最高奖励）的那一档。
 */
export function amusementPrizeOf(key: string, ratio: number): AmusementPrizeTier | undefined {
  const cfg = getMiniGameConfig(key) as (MiniGameConfig & { prize?: { tiers?: AmusementPrizeTier[] } }) | undefined;
  const tiers = cfg?.prize?.tiers;
  if (!tiers || tiers.length === 0) return undefined;
  let hit: AmusementPrizeTier | undefined;
  for (const t of tiers) {
    if (ratio >= t.min && (!hit || t.min > hit.min)) hit = t;
  }
  return hit;
}

/**
 * 结算游乐场小游戏奖品（金钱 + 心情，走 applyEffects 记账与日志）。
 * 返回命中的档位；未命中（低分）返回 undefined，不产生任何惩罚。
 */
export function applyAmusementPrize(state: GameState, key: string, ratio: number): AmusementPrizeTier | undefined {
  const tier = amusementPrizeOf(key, ratio);
  if (!tier) return undefined;
  const eff: Effects = {};
  if (tier.money) eff.money = tier.money;
  if (tier.mood) eff.mood = tier.mood;
  const cfg = getMiniGameConfig(key);
  const parts: string[] = [];
  if (tier.money) parts.push(`奖金 +${tier.money} 元`);
  if (tier.mood) parts.push(`心情 +${tier.mood}`);
  applyEffects(
    state,
    { ...eff, log: `🎪 ${cfg?.title ?? "游乐场"}：${tier.label}！${parts.join("，")}` },
    "🎪",
  );
  return tier;
}
