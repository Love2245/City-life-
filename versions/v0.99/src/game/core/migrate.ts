/**
 * 存档迁移（纯函数，无 I/O）。
 * v1 → v2：living 三态结构、backgrounds/laborMarket 字段补充。
 * v2 → v3：difficulty → family 映射、allocation/ownedItems 补充。
 * v5 → v6：三级地图新增 region/navStack 字段。
 * v6 → v7：背包 inventory + 职业 career 扩展。
 * v7 → v8：载具月租 vehicles 字段。
 * v8 → v9：任务系统 quests / questsGeneratedDay 字段。
 * v9 → v10：实习期 career.internDays / internLastDay 字段。
 * v10 → v11：v0.92 会籍 memberships、抑郁/猝死计数 depressionStreak / criticalHealthStreak。
 * v11 → v12：v0.94 成就 achievements、收集 seen、经济 economy、新手引导 tutorial 子对象。
 * v12 → v13：v0.95 纪元迁移（1年1月1日 → 2026-08-01 起）+ 装备 equipped / 天气 weather 字段。
 * v14 → v15：v0.97 短信收件箱 smsInbox 字段。
 * v15 → v16：v0.975 物理所在二级区域 area 字段（用于跨区出行判定）。
 * v16 → v17：v0.978 联系人 contacts 字段（默认父母两人）。
 * v17 → v18：v0.985 成就系统重构为 22 张塔罗牌（tarot / counters / pendingTarot），旧 achievements/pendingAch 弃用。
 */
import type { GameState, JobOffer } from "../types";
import { inferRegionOfLocation, regionPathOf } from "./regions";
import { fromLinearDay, START_EPOCH } from "./calendar";
import { defaultContacts } from "./contacts";
import { emptyTarotCounters, evaluateTarot, initialTarot } from "./tarot";
import { affinityToState } from "./relationships";

export const SAVE_VERSION = 19;

/** 旧纪元（v12 及以前）线性日公式：year1/month1/day1 = 0 */
function legacyLinearDay(t: { year: number; month: number; day: number }): number {
  return (t.year - 1) * 360 + (t.month - 1) * 30 + (t.day - 1);
}

/**
 * v0.965：把"月内日"字段（1-30）换算为绝对日语义。
 * 旧档的 lastWorkDay/hiredDay/internLastDay/questsGeneratedDay/laborMarket.generatedDay
 * 存的是月内日（跨月回绕导致"今天已上过班"误判）——迁移时 ≤30（含 0）一律置 -1（未记录），
 * 由系统在首个结算/刷新点重建，避免把上月同号误当今天。
 */

/** 旧纪元年月日 → 新纪元（2026-08-01 起）年月日 */
function shiftLegacyDate(t: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
  return fromLinearDay(START_EPOCH + legacyLinearDay(t));
}

/** 旧版（v1/v2）living 结构 */
interface LegacyLiving {
  housingId: string;
  rent: number;
  rentGrowthCount: number;
}

/** 时段 → 小时 映射（v3 存档迁移用） */
const PERIOD_TO_HOUR: Record<string, number> = {
  morning: 9,
  afternoon: 14,
  evening: 19,
  night: 23,
};

/** 难度 → 家庭 映射（v2 存档迁移用） */
const DIFFICULTY_TO_FAMILY: Record<string, string> = {
  easy: "wealthy",
  normal: "ordinary",
  hard: "destitute",
};

export function migrateSave(raw: unknown): GameState {
  const r = raw as GameState;
  if (r.version === SAVE_VERSION) return r;

  let migrated: GameState;
  if (r.version === 13) {
    // v13 → v14（v0.965）："同日判定"字段从月内日改为绝对日语义。
    // 旧档月内日值（1-30）置 0 = 未记录，首个结算/刷新点自动重建（当天可正常上班/刷新）。
    const c = r.career as { lastWorkDay?: number; hiredDay?: number; internLastDay?: number } | undefined;
    const career = r.career;
    if (career) {
      // ≤30（含 0）均为旧"月内日/未记录"语义 → 置 -1 哨兵（未记录），首个结算自动重建
      if (typeof c?.lastWorkDay === "number" && c.lastWorkDay <= 30) career.lastWorkDay = -1;
      if (typeof c?.hiredDay === "number" && c.hiredDay <= 30) career.hiredDay = -1;
      if (typeof c?.internLastDay === "number" && c.internLastDay <= 30) career.internLastDay = -1;
    }
    const lm = r.laborMarket as { generatedDay?: number } | undefined;
    if (lm && typeof lm.generatedDay === "number" && lm.generatedDay <= 30) lm.generatedDay = -1;
    // 任务栏旧 id/归属天均为月内日语义 → 一次性清空，下次刷新重建当日任务
    const v14State: GameState = {
      ...r,
      version: 14,
      quests: [],
      questsGeneratedDay: typeof r.questsGeneratedDay === "number" && r.questsGeneratedDay <= 30 ? -1 : r.questsGeneratedDay,
      career,
    } as GameState;
    migrated = migrateSave(v14State);
  } else if (r.version === 14) {
    // v14 → v15（v0.97）：补短信收件箱字段
    const v15State: GameState = {
      ...r,
      version: 15,
      smsInbox: Array.isArray((r as GameState).smsInbox) ? (r as GameState).smsInbox : [],
    } as GameState;
    migrated = migrateSave(v15State);
  } else if (r.version === 15) {
    // v15 → v16（v0.975）：补物理所在二级区域 area 字段（跨区出行判定用）。
    // 以当前所在地点精确推断其所属二级区域；若在主地图/未知地点，则回退到 region（无则留空，运行时首个移动会修正）。
    const locRegion =
      r.locationId && r.locationId !== "map" ? inferRegionOfLocation(r.locationId) : undefined;
    const area = locRegion ?? (typeof r.region === "string" ? r.region : undefined);
    const v16State: GameState = {
      ...r,
      version: 16,
      area,
    } as GameState;
    migrated = migrateSave(v16State);
  } else if (r.version === 16) {
    // v16 → v17（v0.978）：补联系人 contacts 字段（默认父母两人）。
    const v17State: GameState = {
      ...r,
      version: 17,
      contacts: Array.isArray((r as GameState).contacts) ? (r as GameState).contacts : defaultContacts(),
    } as GameState;
    migrated = migrateSave(v17State);
  } else if (r.version === 17) {
    // v17 → v18（v0.985）：成就系统重构为 22 张塔罗牌。
    // 旧 achievements（字符串 id）与塔罗牌不同构，不做一一映射；改为按存档现状「回溯评估」：
    // 凡是仅凭当前状态即可判定的牌（愚者/教皇/战车/恶魔/太阳/审判…）立即补发，
    // 依赖累计计数器的牌（女祭司/皇后/皇帝/月亮…）从 0 重新累计。
    const v18State: GameState = {
      ...r,
      version: 18,
      tarot: initialTarot(),
      counters: emptyTarotCounters(),
      pendingTarot: [],
      seen: (r as { seen?: GameState["seen"] }).seen ?? { itemsEaten: [], locationsVisited: [] },
      economy:
        (r as { economy?: GameState["economy"] }).economy ?? { priceIndex: 1, investments: [], ownedLuxury: [] },
      unlockedEndings: Array.isArray(r.unlockedEndings) ? r.unlockedEndings : [],
      contacts: Array.isArray(r.contacts) ? r.contacts : defaultContacts(),
    } as GameState;
    // 丢弃 v0.94 遗留字段，避免存档体积与语义双重残留
    delete (v18State as unknown as Record<string, unknown>).achievements;
    delete (v18State as unknown as Record<string, unknown>).pendingAch;
    // 回溯补发；补发结果不进 pendingTarot，避免老玩家读档瞬间被十几个弹窗刷屏
    evaluateTarot(v18State);
    v18State.pendingTarot = [];
    migrated = migrateSave(v18State);
  } else if (r.version === 18) {
    // v18 → v19（v0.99）：启用 NPC 关系系统。
    // 为存量 contacts 反向补建 Relationship（按 relation 给初始好感：parent 60 / mentor 45 / friend 40 / 其余 25），
    // 父母标记 noDecay（免衰减）；新增 romance 子对象。
    const v19State: GameState = {
      ...r,
      version: 19,
      relationships: Array.isArray((r as GameState).relationships) ? (r as GameState).relationships : [],
      romance: (r as { romance?: GameState["romance"] }).romance ?? {
        partnerId: undefined,
        dateCount: {},
        cohabiting: false,
      },
    } as GameState;
    const existing = new Set(v19State.relationships.map((x) => x.npcId));
    for (const c of v19State.contacts) {
      if (existing.has(c.id)) continue;
      const init =
        c.relation === "parent" ? 60 : c.relation === "mentor" ? 45 : c.relation === "friend" ? 40 : 25;
      v19State.relationships = [
        ...v19State.relationships,
        {
          npcId: c.id,
          affinity: init,
          state: affinityToState(init, false),
          lastInteractDay: 0,
          todayGain: 0,
          todayGainDay: 0,
          flags: c.relation === "parent" ? { noDecay: true } : {},
        },
      ];
    }
    migrated = migrateSave(v19State);
  } else if (r.version === 12) {
    // v12 → v13（v0.95）：纪元迁移——旧 1年1月1日 档换算到 2026-08-01 起，
    // 会籍/载具到期日与事件冷却绝对日同步换算；补 equipped/weather 字段。
    const oldTime = r.time;
    const newTime = shiftLegacyDate(oldTime);
    // 会籍到期日（absoluteDay 差值语义）
    const memberships: GameState["memberships"] = {};
    for (const [mid, exp] of Object.entries(r.memberships ?? {})) {
      memberships[mid] = { ...exp, ...shiftLegacyDate(exp) };
    }
    // 载具到期日（逐字段比较语义）
    const vehicles: GameState["vehicles"] = {};
    for (const [vt, v] of Object.entries(r.vehicles ?? {})) {
      vehicles[vt] = { ...v, ...shiftLegacyDate(v) };
    }
    // 事件冷却绝对日（flags.ev_*_last）+ 偏移（旧 absoluteDay = 旧linear+1，新 = 旧 + START_EPOCH）
    const flags: GameState["flags"] = { ...r.flags };
    for (const [k, val] of Object.entries(flags)) {
      if (k.startsWith("ev_") && k.endsWith("_last") && typeof val === "number") {
        flags[k] = val + START_EPOCH;
      }
    }
    const v13State: GameState = {
      ...r,
      version: 13,
      time: { ...r.time, year: newTime.year, month: newTime.month, day: newTime.day },
      memberships,
      vehicles,
      flags,
      equipped: (r as { equipped?: GameState["equipped"] }).equipped ?? {},
      weather: (r as { weather?: GameState["weather"] }).weather ?? { id: "sunny", lastRollDay: 0 },
    } as GameState;
    migrated = migrateSave(v13State);
  } else if (r.version === 11) {
    // v11 → v12（v0.94）：成就/收集/经济/新手引导 子对象（均为增量字段，给默认）
    // 注：achievements / pendingAch 为 v0.94 遗留字段，v18 迁移时会被丢弃，此处仅保证中间态完整。
    const v12State: GameState = {
      ...r,
      version: 12,
      achievements: (r as unknown as { achievements?: Record<string, true> }).achievements ?? {},
      seen: (r as { seen?: GameState["seen"] }).seen ?? { itemsEaten: [], locationsVisited: [] },
      economy: (r as { economy?: GameState["economy"] }).economy ?? { priceIndex: 1, investments: [], ownedLuxury: [] },
      tutorial: (r as { tutorial?: GameState["tutorial"] }).tutorial ?? { done: [], activeStep: 0 },
      pendingAch: (r as unknown as { pendingAch?: string[] }).pendingAch ?? [],
    } as unknown as GameState;
    migrated = migrateSave(v12State);
  } else if (r.version === 10) {
    // v10 → v11（v0.92）：会籍月卡 + 生存惩罚计数字段
    // 注意：老档里的静态 gym_member flag 无到期日，按「已失效」处理，
    // 由 membership.checkMembershipExpiry 在首个夜晚结算时对账清除。
    const v11State: GameState = {
      ...r,
      version: 11,
      memberships: (r as { memberships?: GameState["memberships"] }).memberships ?? {},
      player: {
        ...r.player,
        depressionStreak: (r.player as { depressionStreak?: number }).depressionStreak ?? 0,
        criticalHealthStreak: (r.player as { criticalHealthStreak?: number }).criticalHealthStreak ?? 0,
      },
    } as GameState;
    migrated = migrateSave(v11State);
  } else if (r.version === 9) {
    // v9 → v10：实习期 career 字段 + v0.9 结局字段（旧档直接可读）
    const v10State: GameState = {
      ...r,
      version: 10,
      career: {
        ...r.career,
        internDays: (r.career as { internDays?: Record<string, number> } | undefined)?.internDays ?? {},
        internLastDay: (r.career as { internLastDay?: number } | undefined)?.internLastDay ?? 0,
      },
      endingId: (r as { endingId?: string | null }).endingId ?? null,
      unlockedEndings: (r as { unlockedEndings?: string[] }).unlockedEndings ?? [],
    } as GameState;
    migrated = migrateSave(v10State);
  } else if (r.version === 8) {
    // v8 → v9：任务系统字段
    const v9State: GameState = {
      ...r,
      version: 9,
      quests: [],
      questsGeneratedDay: 0,
    } as GameState;
    migrated = migrateSave(v9State);
  } else if (r.version === 7) {
    // v7 → v8：载具月租 vehicles 字段
    const v8State: GameState = {
      ...r,
      version: 8,
      vehicles: {},
    } as GameState;
    migrated = migrateSave(v8State);
  } else if (r.version === 6) {
    // v6 → v7：背包 + 职业扩展
    const v7State: GameState = {
      ...r,
      version: 7,
      inventory: { phone: 1 },
      career: {
        jobId: null,
        kind: null,
        hiredDay: 0,
        workedDays: 0,
        lastWorkDay: 0,
        internDays: {},
        internLastDay: 0,
        projects: (r.career as { projects?: Record<string, number> } | undefined)?.projects ?? {},
      },
    } as GameState;
    migrated = migrateSave(v7State);
  } else if (r.version === 5) {
    // v5 → v6：三级地图新增 region/navStack（递归）
    const regionId = r.locationId === "map" ? undefined : inferRegionOfLocation(r.locationId);
    const navStack: string[] = regionId ? ["map", ...regionPathOf(regionId)] : ["map"];
    const v6State: GameState = {
      ...r,
      version: 6,
      region: regionId,
      navStack,
    } as GameState;
    migrated = migrateSave(v6State);
  } else if (r.version === 4) {
    // v4 → v5：statuses 字段（递归到 v6）
    const v5State: GameState = {
      ...r,
      version: 5,
      statuses: [],
    } as GameState;
    migrated = migrateSave(v5State);
  } else if (r.version === 3) {
    // v3 → v4：period → hour（再递归到 v5）
    const oldTime = (r as unknown as { time: { period?: string } }).time;
    const hour = oldTime?.period ? PERIOD_TO_HOUR[oldTime.period] ?? 9 : 7;
    const v4State: GameState = {
      ...r,
      version: 4,
      time: {
        day: r.time.day,
        month: r.time.month,
        year: r.time.year,
        hour,
        minute: 0,
        stayedUp: false,
      },
    } as GameState;
    migrated = migrateSave(v4State);
  } else if (r.version === 2) {
    // v2 → v4
    const legacyDifficulty = (raw as { difficulty?: string }).difficulty ?? "normal";
    const family = DIFFICULTY_TO_FAMILY[legacyDifficulty] ?? "ordinary";
    const v3State: GameState = {
      ...r,
      version: 3,
      family,
      allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
      ownedItems: [],
    } as GameState;
    delete (v3State as unknown as Record<string, unknown>).difficulty;
    migrated = migrateSave(v3State);
  } else {
    // v1 → v4（走 v2/v3 中间态）
    const legacyLiving = (raw as { living?: LegacyLiving }).living;
    const v2State: GameState = {
      ...r,
      version: 2,
      living: legacyLiving
        ? {
            mode: "lease",
            govDaysLeft: 0,
            nightly: null,
            lease: {
              housingId: legacyLiving.housingId,
              rent: legacyLiving.rent,
              rentGrowthCount: legacyLiving.rentGrowthCount,
            },
          }
        : { mode: "gov", govDaysLeft: 7, nightly: null, lease: null },
      backgrounds: (r as { backgrounds?: Record<string, string> }).backgrounds ?? {},
      laborMarket: (r as { laborMarket?: { generatedDay: number; offers: JobOffer[] } }).laborMarket ?? {
        generatedDay: 1,
        offers: [],
      },
    };
    migrated = migrateSave(v2State);
  }

  return migrated;
}
