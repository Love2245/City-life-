/**
 * 初始 GameState 工厂（骨架）。
 * 纯逻辑：不依赖任何外部环境。
 * 注意：家庭条件/属性分配由 newGame 流程中的 applyFamily/applyAllocation 应用，
 * 此处仅提供兜底默认值（普通家庭骨架）。
 */
import type { GameState } from "../types";
import { createCatDuelState } from './catDuelCollection';
import { createRng } from "../rng";
import { createStockMarket } from "./stockMath";
import { defaultContacts } from "./contacts";
import { emptyTarotCounters, initialTarot } from "./tarot";

/** 默认技能键（0-10 级，开局全 0） */
const ZERO_SKILLS = {
  programming: 0,
  design: 0,
  writing: 0,
  operation: 0,
  cooking: 0,
  service: 0,
  driving: 0,
  management: 0,
};

export function createInitialState(seed?: number): GameState {
  const state:GameState = {
    version: 38,
    catDuel: createCatDuelState(),
    company: null,
    developmentHistory: { total: 0, byType: {}, migrated: true },
    mode: "normal",
    family: "ordinary",
    allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
    ownedItems: [],
    statuses: [],
    rng: createRng(seed),
    time: {
      day: 1,
      month: 8,
      year: 2026,
      hour: 7,
      minute: 0,
      stayedUp: false,
    },
    player: {
      name: "阿城",
      attrs: {
        stamina: 80,
        health: 85,
        mood: 70,
        hygiene: 80,
        satiety: 75,
      },
      stats: {
        intelligence: 30,
        charm: 30,
        fitness: 30,
        fame: 0,
      },
      skills: { ...ZERO_SKILLS },
      money: 500,
      debt: 0,
      debtStreak: 0,
      stress: 0,
      lowMoodStreak: 0,
      negativeMoneyStreak: 0,
      hungryStreak: 0,
      depressionStreak: 0,
      criticalHealthStreak: 0,
      hikingStaminaCapBonus: 0,
    },
    living: {
      mode: "gov",
      govDaysLeft: 7,
      nightly: null,
      lease: null,
    },
    backgrounds: {},
    laborMarket: {
      generatedDay: -1,
      offers: [],
    },
    career: {
      jobId: null,
      kind: null,
      hiredDay: 0,
      workedDays: 0,
      firstShiftDay: undefined,
      nextShiftDay: undefined,
      nextPayDay: undefined,
      consecutiveAbsences: 0,
      periodScheduled: 0,
      periodAttended: 0,
      periodBaseWages: 0,
      periodGameBonus: 0,
      lastWorkDay: 0,
      internDays: {},
      internLastDay: -1,
      projects: {},
      passiveIncome: 0,
      experience: {},
      miniGameScoreTotal: 0,
      miniGameScoreCount: 0,
    },
    work: { masteryMinutes: {}, settledIds: [], wageRecords: [], sequence: 0 },
    quests: [],
    questsGeneratedDay: -1,
    smsInbox: [],
    /** v0.978 默认联系人为父母两人 */
    contacts: defaultContacts(),
    inventory: {
      phone: 1,
      doc_city_guide: 1,
      // v1.45 基础穿搭：新档开局直接穿上白背心、青色外套和黑裤子。
      white_vest: 1,
      underlayer_white: 1,
      black_pants: 1,
      cyan_jacket: 1,
    },
    vehicles: {},
    memberships: {},
  relationships: [],
  /** v0.99 NPC 社交/恋爱运行时状态 */
  romance: { dateCount: {}, cohabiting: false },
  /** v1.0 剧情模式运行时状态（默认空态，非剧情模式不使用） */
  story: {
    arc: null,
    stage: 0,
    goalFund: 0,
    conscience: 0,
    failedObligations: 0,
    activeCards: [],
    doneCards: [],
    gambler: null,
    nextDrawDay: 0,
    finalTriggered: false,
    introSeen: false,
  },
  /** v1.10 周记统计 */
  weekly: {
    earned: 0,
    spent: 0,
    interactions: {},
    jobsDone: 0,
    pending: false,
    report: null,
  },
  phoneSkin: undefined,
  flags: { doc_city_guide_awarded: true, development_economy_v2: true },
    log: [],
    locationId: "home",
    region: "downtown_residential",
    area: "downtown_residential",
    // 开局就在普通出租屋：导航栈必须包含完整的「城市 → 市区 → 住宅区」路径，
    // 否则首次打开场景时面包屑会退化成「城市 → 住处」，出门后也无法正确回到二级地图。
    navStack: ["map", "downtown", "downtown_residential"],
    endingId: null,
    unlockedEndings: [],
    alarmHour: undefined,
    tarot: initialTarot(),
    counters: emptyTarotCounters(),
    seen: { itemsEaten: [], locationsVisited: [] },
    economy: { priceIndex: 1, investments: [], ownedLuxury: [], nextInvSeq: 1 },
    tutorial: { done: [], activeStep: 0 },
    pendingTarot: [],
    equipped: {
      clothes: "cyan_jacket",
      underlayer: "underlayer_white",
      pants: "black_pants",
    },
    weather: { id: "sunny", lastRollDay: 0 },
    social: { posts: [], unreadMoments: 0 },
    orders: [],
    live: { streaming: false, lastStreamDay: -1, totalFameGain: 0 },
    citizensPool: [],
    pets: [],
    intercityTicket: undefined,
    fridge: { tier: null, items: {} },
    cooking: { unlockedRecipeIds: [], mealQualities: {} },
    smallPets: [],
    cityCommissions: {
      weekIndex: 0,
      offeredIds: [],
      activeId: null,
      cooldownUntilDay: {},
    },
    catFlags: {},
    ownedAccessories: {},
    districtServices: { clinicWeek: -1, hikeDay: -1, alcoholCups: 0 },
    districtLeisure: { nextSessionId: 1, active: null },
    fishing: {nextId:1,active:null,bucket:[],specimens:{},bestRecords:{},pendingCatch:null},
  };
  state.economy.stockMarket=createStockMarket(state);
  return state;
}
