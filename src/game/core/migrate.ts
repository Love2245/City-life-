import { normalizeCatDuel } from './catDuelCollection';
import { normalizeStockMarket } from './stockMarket';
import {normalizeFinancialRisk} from './financialRisk';
import { normalizeCompanySave } from './companyMigration';
import { normalizePersonalDevelopment } from './projects';
import {normalizeCityHotelBooking} from './cityHotels';
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
 * v26 → v27：1.4 老城区交通车票、花鸟市场位置兼容、小宠物字段。
 * v27 → v28：1.41 每日目标可序列化、城市连续委托、项目被动收入上限。
 * v28 → v29：1.42 冰箱/自由烹饪状态、新食材字段与旧票据兼容。
 * v29 → v30：1.45 穿搭槽位、基础衣柜与 NPC 场景服装兼容。
 * v30 → v31：1.45 内搭颜色、场景奖励服装与工作里程字段兼容。
 */
import type { GameState, JobDef, JobOffer } from "../types";
import { emptyCityCommissionState, removeRetiredNpcTasks } from "./npcTaskAvailability";
import { getEnding } from "./endings";
import { inferRegionOfLocation, regionPathOf, topRegionOf, isRegionUnlocked, getRegion } from "./regions";
import { normalizeDistrictLeisure,refreshLoadedCasinoRandomness } from "./districtLeisure";
import {normalizeOwnedProperties} from './propertyPortfolio';
import { normalizeDistrictServices } from "./districtServices";
import { normalizeFishing } from "./fishing";
import { fromLinearDay, gameDay, START_EPOCH } from "./calendar";
import { defaultContacts } from "./contacts";
import { normalizeNpcOnlineNames } from './npcOnlineNames';
import { normalizeMessages } from "./sms";
import { emptyTarotCounters, evaluateTarot, initialTarot } from "./tarot";
import { retireDailyGoals } from "./quests";
import { ensureWardrobeDefaults } from "./clothing";
import { legacySalaryParts } from "./career";
import { migrateLegacyLaptopApps } from "./apps";
import { repairChurchCrucifixForBaptizedSave } from "./religion";
import { syncAutoHomeEquipment } from "./equipment";
import { normalizeHomeLayouts } from "./homeInterior";
import { normalizeHomeLighting } from "./homeLighting";
import { normalizeHomeDecor } from "./homeDecor";
import { repairOwnedItemAcquisitionState } from "./items";
import { ensureWorkState } from "./jobs";
import { normalizeTrainingCertificate } from "./training";

function normalizeMealQualityBatches(
  value: unknown,
): Record<string, Array<{ quality: "普通" | "美味" | "完美"; quantity: number }>> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, Array<{ quality: "普通" | "美味" | "完美"; quantity: number }>> = {};
  for (const [itemId, rawBatches] of Object.entries(value)) {
    if (!Array.isArray(rawBatches)) continue;
    const quantities = new Map<"普通" | "美味" | "完美", number>();
    for (const rawBatch of rawBatches) {
      if (!rawBatch || typeof rawBatch !== "object") continue;
      const batch = rawBatch as { quality?: unknown; quantity?: unknown };
      if (batch.quality !== "普通" && batch.quality !== "美味" && batch.quality !== "完美") continue;
      if (typeof batch.quantity !== "number" || !Number.isFinite(batch.quantity) || batch.quantity <= 0) continue;
      const quantity = Math.floor(batch.quantity);
      if (quantity > 0) quantities.set(batch.quality, (quantities.get(batch.quality) ?? 0) + quantity);
    }
    if (quantities.size > 0) {
      result[itemId] = [...quantities].map(([quality, quantity]) => ({ quality, quantity }));
    }
  }
  return result;
}
import { firstWorkDay, isWorkRestDay, nextWorkDay, standardWorkMinutes, workMinute } from "./workSchedule";
import { pushLog } from "../engine";
import { recordMoney } from "./weekly";
import { migrateProgrammingRoyalties } from "./projects";
import { residenceLocationId, residenceRegion, isResidenceLocation, migrateTempleStay, expireTemporaryResidenceStays } from "./residence";
import jobsData from "../data/jobs.json";
import { ensureRngState } from "../rng";

export const SAVE_VERSION = 38;
const MAX_SAVED_WAGE_RECORDS = 500;
const MAX_SAVED_SOCIAL_POSTS = 120;
const MAX_SAVED_POST_COMMENTS = 20;
const MAX_SAVED_POST_REACTIONS = 80;
const MAX_SAVED_SMS_MESSAGES = 300;
const RETAINED_WORK_FLAG_DAYS = 60;

export function pruneExpiredWorkedFlags(flags: GameState["flags"], currentDay: number): void {
  const firstRetainedDay = currentDay - RETAINED_WORK_FLAG_DAYS + 1;
  for (const key of Object.keys(flags)) {
    const match = /^worked_.+_(\d+)$/.exec(key);
    if (match && Number(match[1]) < firstRetainedDay) delete flags[key];
  }
}

function normalizeBoundedCollections(state: GameState): GameState {
  if (state.rng) ensureRngState(state.rng);
  normalizeMessages(state);
  normalizeNpcOnlineNames(state);
  state.smsInbox = state.smsInbox.slice(-MAX_SAVED_SMS_MESSAGES);
  if (state.work?.wageRecords) state.work.wageRecords = state.work.wageRecords.slice(-MAX_SAVED_WAGE_RECORDS);
  const posts = state.social?.posts;
  if (Array.isArray(posts)) {
    posts.sort((a, b) => b.day - a.day);
    posts.length = Math.min(posts.length, MAX_SAVED_SOCIAL_POSTS);
    for (const post of posts) {
      if (Array.isArray(post.comments) && post.comments.length > MAX_SAVED_POST_COMMENTS) {
        post.comments = post.comments.slice(-MAX_SAVED_POST_COMMENTS);
      }
      if (Array.isArray(post.reactions) && post.reactions.length > MAX_SAVED_POST_REACTIONS) {
        post.reactions = post.reactions.slice(-MAX_SAVED_POST_REACTIONS);
      }
    }
  }
  for (const key of Object.keys(state.flags)) {
    const trainedDay = /^trained_(-?\d+)$/.exec(key);
    if (trainedDay && Number(trainedDay[1]) !== gameDay(state.time)) delete state.flags[key];
  }
  pruneExpiredWorkedFlags(state.flags, gameDay(state.time));
  // Legacy releases reset progress on completion. Only restore that old completed
  // state; a new work (including a just-started 0%) must survive loading unchanged.
  for (const projectId of ["indie_game", "mobile_app"]) {
    if (state.flags[`project_completed_${projectId}`] !== true) continue;
    const progress = state.career.projects[projectId];
    if (Number.isFinite(progress) && progress > 0 && progress < 100) {
      state.flags[`project_continuation_${projectId}`] = true;
    }
    if (state.flags[`project_continuation_${projectId}`] !== true) state.career.projects[projectId] = 100;
  }
  return state;
}

const DEFAULT_SKILLS: GameState["player"]["skills"] = {
  programming: 0,
  design: 0,
  writing: 0,
  operation: 0,
  cooking: 0,
  service: 0,
  driving: 0,
  management: 0,
};

/** 技能表曾逐步扩充；对旧档缺少的新键按初始等级补齐，保留已有等级。 */
function ensureSkillDefaults(state: GameState): void {
  const player = state.player as (GameState["player"] & { skills?: unknown }) | undefined;
  if (!player) return;
  const skills = player.skills;
  if (skills == null) {
    player.skills = { ...DEFAULT_SKILLS };
  } else if (typeof skills === "object" && !Array.isArray(skills)) {
    player.skills = { ...DEFAULT_SKILLS, ...skills } as GameState["player"]["skills"];
  }
}

const WORK_JOBS = jobsData as unknown as JobDef[];
const WORK_JOB_MAP = new Map(WORK_JOBS.map((job) => [job.id, job]));

function migrateWork31(state: GameState): void {
  const day = gameDay(state.time);
  state.flags ??= {};
  state.work = { active: undefined, masteryMinutes: {}, settledIds: [], wageRecords: [], sequence: 0 };
  for (const job of WORK_JOBS) {
    const prefix = "worked_" + job.id + "_";
    const workedDays = new Set<number>();
    for (const [key, value] of Object.entries(state.flags)) {
      if (!value || !key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      const workedDay = Number(suffix);
      if (workedDay >= 0 && workedDay <= day) workedDays.add(workedDay);
    }
    if (workedDays.size) state.work.masteryMinutes[job.id] = workedDays.size * standardWorkMinutes(job);
  }
  migrateWork31Continuation(state, day);
}

function normalizeDistrictSave(state: GameState): void {
  normalizeDistrictServices(state);
  normalizeDistrictLeisure(state);
  refreshLoadedCasinoRandomness(state);
  normalizeFinancialRisk(state);
  normalizeFishing(state);
  if (state.locationId === "airport" || state.region === "development_airport") {
    state.locationId = "map";
    state.region = "boyue";
    state.area = "boyue";
  }
  if (state.locationId === "boyue_central_fountain") {
    state.locationId = "map";
    state.region = "boyue_night_market";
    state.area = "boyue_night_market";
  }
  const savedRegion = state.region ?? inferRegionOfLocation(state.locationId);
  if (savedRegion && !isRegionUnlocked(state, getRegion(savedRegion)) && ["development_university", "boyue_university"].includes(savedRegion)) {
    state.locationId = "map";
    state.region = topRegionOf(savedRegion);
    state.area = state.region;
  }
}

function migrateWork31Continuation(state: GameState, day: number): void {
  const pending = (state.quests ?? []).filter((quest) =>
    quest.type === "job" && (quest.status === "pending" || quest.status === "active") &&
    typeof quest.day === "number" && quest.day >= day &&
    !!quest.jobId && WORK_JOB_MAP.get(quest.jobId)?.kind === "formal",
  ).sort((a, b) => a.day! - b.day! || (a.startHour ?? 0) - (b.startHour ?? 0) || a.id.localeCompare(b.id));
  const c = state.career;
  const oldJob = WORK_JOB_MAP.get(c.jobId ?? "");
  if (c.jobId) {
    const earned = legacySalaryParts(state, oldJob);
    state.player.money += earned.total;
    if (earned.total > 0) recordMoney(state, earned.total);
    state.work!.wageRecords.push({ id: "migration_31_" + day, jobId: c.jobId, day, kind: "migration",
      ...earned, note: "旧制已赚工资一次性结清；新制从今天起七天发薪" });
    pushLog(state, "💰", "工作系统升级：旧制已赚工资结清 " + earned.total + " 元；新账期从今天开始");
  }
  // 旧制只有预约而没有在职记录时，恢复最早的正式班次；多余预约写入处理日志。
  const chosen = oldJob?.kind === "formal" ? oldJob : pending.length ? WORK_JOB_MAP.get(pending[0].jobId!) : undefined;
  const chosenBooking = pending.find((quest) => quest.jobId === chosen?.id);
  const canceled = (state.quests ?? []).filter((quest) => quest.type === "job" &&
    (quest.status === "pending" || quest.status === "active"));
  state.quests = (state.quests ?? []).filter((quest) => !canceled.includes(quest));
  state.questsGeneratedDay = -1;
  if (canceled.length) pushLog(state, "📋", "已清理旧制工作预约 " + canceled.length + " 项；日结改为直接开工，不算缺勤");
  if (chosen) {
    c.jobId = chosen.id;
    c.kind = "weekly";
    c.hiredDay = day;
    let first = firstWorkDay(chosen, workMinute(state));
    if (chosenBooking && chosenBooking.day! >= day && !isWorkRestDay(chosen, chosenBooking.day!)) {
      const bookedEnd = chosenBooking.day! * 1440 + Math.round((chosen.endHour ?? 17) * 60);
      if (bookedEnd > workMinute(state)) first = chosenBooking.day!;
    }
    if (state.flags["worked_" + chosen.id + "_" + first]) first = nextWorkDay(chosen, first + 1);
    c.firstShiftDay = first;
    c.nextShiftDay = first;
    c.nextPayDay = day + 7;
    c.consecutiveAbsences = 0;
    state.flags.employed = true;
    if (!oldJob && chosenBooking) pushLog(state, "📋", "旧版预约已恢复为正式合同：" + chosen.name);
  } else {
    c.jobId = null;
    c.kind = null;
    c.hiredDay = 0;
    c.lastWorkDay = -1;
    delete c.firstShiftDay;
    delete c.nextShiftDay;
    delete c.nextPayDay;
    c.consecutiveAbsences = 0;
    delete state.flags.employed;
  }
  c.workedDays = 0;
  c.accruedWages = 0;
  c.periodScheduled = 0;
  c.periodAttended = 0;
  c.periodBaseWages = 0;
  c.periodGameBonus = 0;
  c.miniGameScoreTotal = 0;
  c.miniGameScoreCount = 0;
  migrateLegacyLaptopApps(state);
}

/** v1.43 删除 NPC 后，读取旧存档时一并清理其运行时残留。 */
const REMOVED_NPC_IDS = new Set([
  "npc_pharmacist",
  "npc_suburb_station_staff",
  "npc_li_na",
  "npc_oldtown_station_clerk",
  "npc_school_coordinator",
]);
const REMOVED_NPC_CONTACT_IDS = new Set([...REMOVED_NPC_IDS].map((npcId) => `npc_${npcId}`));
const REMOVED_CITY_COMMISSION_IDS = new Set([
  "city_suburb_last_mile",
  "city_oldtown_transfer_manual",
  "city_school_charity_fair",
  "city_station_lost_parcel",
  "city_weekend_volunteer",
]);
const REMOVED_NPC_FLAG_PREFIXES = [...REMOVED_NPC_IDS].flatMap((npcId) => [
  `npc_contact_${npcId}`,
  `npc_contact_added_${npcId}`,
  `meet_visits_${npcId}`,
  `call_cd_${npcId}`,
  `moments_dedicated_index_${npcId}`,
  `moments_last_npc_${npcId}`,
  `npc_remaster_event_seen_${npcId}`,
  `npc_remaster_talks_${npcId}`,
  `npc_remaster_rain_talks_${npcId}`,
  `npc_remaster_quiet_${npcId}`,
  `npc_remaster_passive_${npcId}`,
  `npc_chat_day_${npcId}`,
  `npc_chat_count_${npcId}`,
  `npc_help_day_${npcId}`,
  `npc_help_phase_${npcId}`,
]);

// Daily goals are intentionally discarded in every save-version branch.
function normalizeDailyGoals(_raw: unknown): GameState["dailyGoals"] { return undefined; }

function normalizeCityCommissions(_raw: unknown): GameState["cityCommissions"] {
  return emptyCityCommissionState();
}

function isRemovedNpc(npcId: string | undefined): boolean {
  return typeof npcId === "string" && REMOVED_NPC_IDS.has(npcId);
}

function isRemovedContact(contactId: string | undefined): boolean {
  return typeof contactId === "string" && REMOVED_NPC_CONTACT_IDS.has(contactId);
}

function normalizeRemovedNpcContent(state: GameState): void {
  state.relationships = (state.relationships ?? []).filter((relationship) => !isRemovedNpc(relationship.npcId));
  state.contacts = (state.contacts ?? []).filter((contact) =>
    !isRemovedNpc(contact.npcId) && !isRemovedContact(contact.id),
  );
  state.quests = (state.quests ?? []).filter((quest) => !isRemovedNpc(quest.commission?.npcId));
  state.smsInbox = (state.smsInbox ?? []).filter((message) =>
    !isRemovedNpc(message.npcId) && !isRemovedContact(message.contactId),
  );

  if (state.social) {
    state.social.posts = state.social.posts.filter((post) =>
      !isRemovedNpc(post.npcId) && !isRemovedContact(post.contactId),
    );
  }

  if (state.weekly) {
    state.weekly.interactions = Object.fromEntries(
      Object.entries(state.weekly.interactions ?? {}).filter(([npcId]) => !isRemovedNpc(npcId)),
    );
    if (state.weekly.report) {
      state.weekly.report.interactions = state.weekly.report.interactions.filter(
        (interaction) => !isRemovedNpc(interaction.npcId),
      );
    }
  }

  if (state.romance) {
    state.romance.dateCount = Object.fromEntries(
      Object.entries(state.romance.dateCount ?? {}).filter(([npcId]) => !isRemovedNpc(npcId)),
    );
    if (state.romance.confessed) {
      state.romance.confessed = Object.fromEntries(
        Object.entries(state.romance.confessed).filter(([npcId]) => !isRemovedNpc(npcId)),
      );
    }
    if (isRemovedNpc(state.romance.crashTonight)) state.romance.crashTonight = undefined;
    if (isRemovedNpc(state.romance.loanNpc)) state.romance.loanNpc = undefined;
  }

  state.flags = Object.fromEntries(
    Object.entries(state.flags ?? {}).filter(([key]) =>
      !REMOVED_NPC_FLAG_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix)),
    ),
  );

  if (state.cityCommissions) {
    state.cityCommissions.offeredIds = state.cityCommissions.offeredIds.filter(
      (id) => !REMOVED_CITY_COMMISSION_IDS.has(id),
    );
    if (state.cityCommissions.activeId && REMOVED_CITY_COMMISSION_IDS.has(state.cityCommissions.activeId)) {
      state.cityCommissions.activeId = null;
    }
    for (const id of REMOVED_CITY_COMMISSION_IDS) delete state.cityCommissions.cooldownUntilDay[id];
  }
}

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

/** 旧档月租升级到滚动租期时，从读档日开始完整保留 30 日已付权益。 */
function normalizeLeaseRentSchedule(state: GameState): void {
  state.flags ??= {};
  delete state.flags["lease_prepaid_month"];
  delete state.flags["lease_first_month_prepaid"];
  const lease = state.living?.mode === "lease" ? state.living.lease : null;
  if (!lease) return;

  const today = gameDay(state.time);
  const nextRentDay = lease.nextRentDay;
  if (typeof nextRentDay !== "number" || !Number.isSafeInteger(nextRentDay) || nextRentDay < 0) {
    lease.nextRentDay = today + 30;
  }
}

/**
 * v1.44：旧档结局态归一化（读档收口点，所有历史版本统一经过）。
 * 旧版本「好结局 / 隐藏结局」触发后会把 endingId 写进存档，读档时 App 的结局路由
 * 会立即把玩家推到结局页——与新版「仅坏结局结束游戏」规则冲突，表现为旧好结局档
 * 一读档/一睡觉就被强制结束。这里把非 bad tier 的 endingId 清空解除结束态，
 * 图鉴解锁（unlockedEndings）保留；坏结局（含剧情失败线）与未知结局保留原状。
 */
function normalizeEndingContinuity(state: GameState): void {
  if (!state.endingId) return;
  const def = getEnding(state.endingId);
  if (!def || def.tier === "bad") return;
  state.endingId = null;
  if (Array.isArray(state.unlockedEndings) && !state.unlockedEndings.includes(def.id)) {
    state.unlockedEndings.push(def.id);
  }
}

/** v1.47：为旧驾照档案补齐背包里的驾驶本，同时保留已拥有资格。 */
function grantDrivingLicenseToLegacySave(state: GameState): void {
  state.inventory ??= {};
  state.flags ??= {};
  // 旧版驾照考试只写入了资格 flag，没有把驾驶本放进背包；补齐展示物品，保留原资格。
  if (state.flags.item_driving_license) {
    state.inventory.driving_license = Math.max(1, state.inventory.driving_license ?? 0);
  }
}

/** v1.47：为首次创建指南前的旧档补发一本，重复读档不增加副本。 */
function grantCityGuideToLegacySave(state: GameState): void {
  state.inventory ??= {};
  state.flags ??= {};
  if (state.flags.doc_city_guide_awarded) return;
  state.inventory.doc_city_guide = Math.max(1, state.inventory.doc_city_guide ?? 0);
  state.flags.doc_city_guide_awarded = true;
}

/** v1.48: drop malformed cat injuries from hand-edited/corrupted saves before care and battle logic reads them. */
function normalizeCatInjuries(state: GameState): void {
  const validLevels = new Set(["light", "medium", "heavy"]);
  const today = Number.isFinite(state.time?.year) && Number.isFinite(state.time?.month) && Number.isFinite(state.time?.day)
    ? (state.time.year - 2026) * 360 + (state.time.month - 1) * 30 + state.time.day
    : 0;
  for (const pet of state.pets ?? []) {
    const injury = pet?.injured as unknown;
    if (injury === undefined || injury === null) continue;
    if (!injury || typeof injury !== "object") {
      pet.injured = undefined;
      continue;
    }
    const record = injury as { level?: unknown; day?: unknown };
    if (!validLevels.has(String(record.level))) {
      pet.injured = undefined;
      continue;
    }
    pet.injured = {
      level: record.level as "light" | "medium" | "heavy",
      day: Number.isFinite(record.day) ? Math.round(record.day as number) : today,
    };
  }
}

/** v1.42：为旧存档和 v29 存档统一补齐三级地图导航栈。 */
function normalizeNavigationAndResidence(state: GameState): GameState {
  normalizeLeaseRentSchedule(state);
  normalizeCompanySave(state);
  normalizePersonalDevelopment(state);
  // 撤下大学城旧快捷酒店；既有产权和租约不变，也不收取一次搬迁房费。
  const retiredHotel = 'hotel_boyue_quick';
  if (state.living.nightly?.lodgingId === retiredHotel) {
    state.living.nightly = state.living.mode === 'nightly' ? {lodgingId:'hotel_boyu_nightmarket'} : null;
  }
  if (state.living.awayNight?.lodgingId === retiredHotel) state.living.awayNight = {lodgingId:'hotel_boyu_nightmarket'};
  if (state.locationId === retiredHotel) {
    const booked = state.living.awayNight?.lodgingId === 'hotel_boyu_nightmarket' || state.living.mode === 'nightly';
    state.locationId = booked ? 'hotel_boyu_nightmarket' : 'home';
    state.region = state.locationId === 'home' ? undefined : 'boyue_night_market';
  }
  if(['dev_incubator','boyue_talent_apartment'].includes(state.living.lease?.housingId??''))state.flags.item_student_pass=true;
  normalizeCityHotelBooking(state);
  if(state.locationId==='moon_monument'){state.locationId='map';state.region='downtown_commercial';}
  normalizeOwnedProperties(state);
  normalizeHomeLayouts(state);
  normalizeHomeLighting(state);
  normalizeHomeDecor(state);
  normalizeCatInjuries(state);
  normalizeRemovedNpcContent(state);
  normalizeEndingContinuity(state);
  grantDrivingLicenseToLegacySave(state);
  grantCityGuideToLegacySave(state);
  normalizeTrainingCertificate(state);
  migrateProgrammingRoyalties(state);
  normalizeLeaseRentSchedule(state);
  // v1.47：旧档中已达成的一次性收藏奖励在读档时补发，重复读档不重复入包。
  state.inventory ??= {};
  state.flags ??= {};
  normalizeDistrictSave(state);
  repairChurchCrucifixForBaptizedSave(state);
  syncAutoHomeEquipment(state);
  const grantDocument = (id: string, flag: string): void => {
    if (state.flags[flag]) return;
    state.inventory[id] = Math.max(1, state.inventory[id] ?? 0);
    state.flags[flag] = true;
  };
  if (Number(state.flags.temple_volunteered) > 0) grantDocument("doc_guanyin", "doc_guanyin_awarded");
  if (state.catFlags?.tournament_tournament_primary) grantDocument("doc_cat_award", "doc_cat_award_awarded");
  let fullWeeks = 0;
  let lastJob = "";
  let lastDay = -Infinity;
  for (const record of state.work?.wageRecords ?? []) {
    if (record.kind !== "weekly") continue;
    if (record.attendanceBonus > 0 && record.jobId === lastJob && record.day === lastDay + 7) {
      fullWeeks += 1;
    } else {
      fullWeeks = record.attendanceBonus > 0 ? 1 : 0;
    }
    lastJob = record.jobId;
    lastDay = record.day;
    if (fullWeeks >= 4) grantDocument("doc_employee_award", "doc_employee_award_awarded");
  }
  if (fullWeeks > 0 && state.flags.employee_full_week_streak === undefined) {
    state.flags.employee_full_week_streak = lastJob === state.career.jobId ? fullWeeks : 0;
  }
  migrateTempleStay(state);
  normalizeMessages(state);
  expireTemporaryResidenceStays(state);
  if (state.locationId === "gov_residence") state.locationId = "old_apartment";
  if (state.locationId === "home") state.locationId = residenceLocationId(state);
  const locationId = state.locationId;
  let regionId = typeof state.region === "string" ? state.region : undefined;
  if (isResidenceLocation(state)) regionId = residenceRegion(state);
  else if (locationId === "airport") {
    // 机场移入泊月区，旧档可能仍保留伯月新区顶级归属或旧 area。
    regionId = inferRegionOfLocation(locationId);
    state.area = regionId;
  }
  else if (locationId === "map" && state.area === "development_airport"
    && (!regionId || regionId === "development")) regionId = topRegionOf("development_airport");
  else if (regionId === "downtown_mall" && ["clothing_store", "luxury_store", "furniture_store", "western_restaurant"].includes(locationId)) {
    // Preserve existing shop IDs and physical district while adding the indoor breadcrumb.
    regionId = "mall_interior";
  }
  else if (regionId === "downtown_center" && ["housing_agency", "car_rental", "cafe", "own_villa"].includes(locationId)) {
    // 保留地点、业务及物理市中心归属，补齐迁址后的子地图路径。
    regionId = "downtown_commercial";
    state.area = "downtown_center";
  }
  else if (['dev_university','dev_incubator'].includes(locationId)) regionId='campus_teacher';
  else if (['boyue_engineering_college','boyue_talent_apartment'].includes(locationId)) regionId='campus_engineering';
  else if (locationId && locationId !== "map" && !regionId) regionId = inferRegionOfLocation(locationId);
  const path = regionId ? regionPathOf(regionId) : [];
  if (path.length > 0) {
    state.region = regionId;
    state.navStack = ["map", ...path];
    if (isResidenceLocation(state)) state.area = regionId;
    else if (regionId === "development_airport") state.area = regionId;
  } else {
    state.navStack = ["map"];
    if (locationId === "map") state.region = undefined;
  }
  return state;
}

export function migrateSave(raw: unknown): GameState {
  if (!raw || typeof raw !== "object") throw new Error("存档格式无效");
  // 迁移步骤会逐步补字段、清理旧内容；先复制 JSON 存档，避免读取/预览旧档时
  // 把调用方手里的对象原地改掉。存档本身来自 JSON，因此不会丢失可持久化字段。
  const r = JSON.parse(JSON.stringify(raw)) as GameState;
  ensureSkillDefaults(r);
  if (r.player && typeof r.player === "object") {
    r.player.debt = Number.isFinite(r.player.debt) && r.player.debt > 0 ? r.player.debt : 0;
    r.player.debtStreak = Number.isFinite(r.player.debtStreak) && r.player.debtStreak! > 0
      ? Math.floor(r.player.debtStreak!)
      : 0;
  }
  if (!Number.isInteger(r.version)) throw new Error("存档版本无效");
  if (r.version > SAVE_VERSION) throw new Error("存档来自更新版本，请使用更新版本打开");
  removeRetiredNpcTasks(r);
  retireDailyGoals(r);
  if (r.version === SAVE_VERSION) {
    normalizeCatDuel(r);
    // 历史版本曾在首页试玩喵喵对决后把 cat_battle_sandbox 写进 live 状态并无清除路径，
    // 旧档可能带着该 flag：它会让 shouldCheckpointGameSession 静默关掉自动存档，一律清掉。
    if (r.flags && typeof r.flags === "object") delete r.flags["cat_battle_sandbox"];
    r.work ??= { masteryMinutes: {}, settledIds: [], wageRecords: [], sequence: 0 };
    r.work.masteryMinutes ??= {};
    r.work.settledIds ??= [];
    r.work.wageRecords ??= [];
    r.work.sequence ??= 0;
    ensureWorkState(r);
    ensureWardrobeDefaults(r);
    const normalized = normalizeNavigationAndResidence(r);
    repairOwnedItemAcquisitionState(normalized);
    normalizeStockMarket(normalized);
    return normalizeBoundedCollections(normalized);
  }

  let migrated: GameState;
  if(r.version===37){
    normalizeCatDuel(r);
    r.version=38;
    return migrateSave(r);
  } else if(r.version===36){
    r.version=37;
    return migrateSave(r);
  } else if (r.version === 35) {
    r.version = 36;
    return migrateSave(r);
  } else if (r.version === 34) {
    r.version=35;
    normalizeStockMarket(r);
    return migrateSave(r);
  } else if (r.version === 33) {
    // v34 增加可选 npcTask 进度；旧关系和资产保留，不自动接取新任务。
    // 旧占位 commission 已按 1.492 的清理决定移除，不转换、不领奖、不扣罚。
    r.version = 34;
    return migrateSave(r);
  } else if (r.version === 32) {
    r.version = 33;
    return migrateSave(r);
  } else if (r.version === 31) {
    migrateWork31(r);
    r.version = 32;
    repairOwnedItemAcquisitionState(r);
    migrated = r;
  } else if (r.version === 13) {
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
    // v18 → v19（v0.99）：新增 NPC 社交/恋爱运行时状态 romance（关系数组字段已存在）。
    const v19State: GameState = {
      ...r,
      version: 19,
      romance: (r as { romance?: GameState["romance"] }).romance ?? { dateCount: {}, cohabiting: false },
    } as GameState;
    migrated = migrateSave(v19State);
  } else if (r.version === 19) {
    // v19 → v20（v0.991）：新增游戏模式 mode（默认普通；永恒/剧情经解锁后选择）。
    const v20State: GameState = {
      ...r,
      version: 20,
      mode: (r as { mode?: GameState["mode"] }).mode ?? "normal",
    } as GameState;
    migrated = migrateSave(v20State);
  } else if (r.version === 20) {
    // v20 → v21（v0.992）：经济子系统新增持久化投资自增序号（杜绝同日卖出再买入复用 id）。
    // 序号必须从现有持仓 id 解析最大值：旧档若卖出过投资，length+1 会小于历史最大序号，
    // 迁移当日再次买入、且买入日期与某仍持仓投资相同时就会 id 撞车（findIndex 卖错单）。
    const maxSeq = Math.max(0, ...(r.economy.investments ?? []).map((i) => Number(String(i.id).split("_").pop()) || 0));
    const v21State: GameState = {
      ...r,
      version: 21,
      economy: {
        ...r.economy,
        nextInvSeq:
          (r.economy as { nextInvSeq?: number }).nextInvSeq ?? maxSeq + 1,
      },
    } as GameState;
    migrated = migrateSave(v21State);
  } else if (r.version === 21) {
    // v21 → v22（v1.0）：剧情模式运行时状态 story（非剧情模式为默认空态）。
    const v22State: GameState = {
      ...r,
      version: 22,
      story: (r as { story?: GameState["story"] }).story ?? {
        arc: null,
        stage: 0,
        goalFund: 0,
        conscience: 0,
        failedObligations: 0,
        activeCards: [],
        doneCards: [],
        gambler: null,
        nextDrawDay: 4,
        finalTriggered: false,
        introSeen: false,
      },
    } as GameState;
    migrated = migrateSave(v22State);
  } else if (r.version === 22) {
    // v22 → v23（v1.10）：周记统计 + 手机皮肤。
    const v23State: GameState = {
      ...r,
      version: 23,
      weekly: (r as { weekly?: GameState["weekly"] }).weekly ?? {
        earned: 0,
        spent: 0,
        interactions: {},
        jobsDone: 0,
        pending: false,
        report: null,
      },
      phoneSkin: (r as { phoneSkin?: GameState["phoneSkin"] }).phoneSkin,
    } as GameState;
    migrated = migrateSave(v23State);
  } else if (r.version === 23) {
    // v23 → v24（v1.20）：编程周入 passiveIncome + 押金制载具租赁。
    // 旧版租用车（无 deposit 字段）按原月租金折算为押金 → 转为"押金制"租赁（不再 30 天到期）。
    const LEGACY_DEPOSIT: Record<string, number> = { e_bike: 600, tricycle: 1200, car: 3000 };
    const vehicles: GameState["vehicles"] = { ...r.vehicles };
    for (const [type, v] of Object.entries(vehicles)) {
      if (!v.owned && v.deposit == null) {
        vehicles[type] = { ...v, deposit: LEGACY_DEPOSIT[type] ?? 0 };
      }
    }
    const career = r.career
      ? { ...r.career, passiveIncome: (r.career as { passiveIncome?: number }).passiveIncome ?? 0 }
      : r.career;
    const v24State: GameState = {
      ...r,
      version: 24,
      career,
      vehicles,
    } as GameState;
    migrated = migrateSave(v24State);
  } else if (r.version === 24) {
    // v24 → v25（v1.3）：Moments 社交 / 订单 / 直播 / 市民池 字段兜底。
    // 全部为可选新字段，旧档缺则补默认；用 ??= 保证幂等、不破坏已有数据。
    const v25State: GameState = {
      ...r,
      version: 25,
      social: (r as { social?: GameState["social"] }).social ?? {
        posts: [],
        unreadMoments: 0,
      },
      orders: (r as { orders?: GameState["orders"] }).orders ?? [],
      live: (r as { live?: GameState["live"] }).live ?? {
        streaming: false,
        lastStreamDay: -1,
        totalFameGain: 0,
      },
      citizensPool: (r as { citizensPool?: GameState["citizensPool"] }).citizensPool ?? [],
    } as GameState;
    migrated = migrateSave(v25State);
  } else if (r.version === 25) {
    // v25 → v26（v1.4）：猫咪系统字段兜底 + 旧剧情档转普通模式。
    // 剧情模式整体移除：mode=story 的存档转为普通模式（剧情字段残留但不读写，降低迁移风险）。
    // v1.44：模式系统收敛为单一「经典模式」——story / eternal 一律归为 normal，
    // 旧永恒档的物价倍率等差异随读档自然消失，与新版「仅坏结局结束游戏」规则保持一致。
    const v26State: GameState = {
      ...r,
      version: 26,
      pets: (r as { pets?: GameState["pets"] }).pets ?? [],
      catFlags: (r as { catFlags?: GameState["catFlags"] }).catFlags ?? {},
      ownedAccessories: (r as { ownedAccessories?: GameState["ownedAccessories"] }).ownedAccessories ?? {},
      mode: "normal",
    } as GameState;
    migrated = migrateSave(v26State);
  } else if (r.version === 26) {
    // v26 → v27（1.4）：老城区城际交通 + 花鸟市场轻量小宠物。
    // 旧宠物用品店/宠物医院仍保留为逻辑兼容 id，但玩家当前场景迁移到花鸟市场。
    const oldLocation = r.locationId;
    const movedFromPetArea = oldLocation === "pet_store" || oldLocation === "pet_hospital";
    const v27State: GameState = {
      ...r,
      version: 27,
      intercityTicket: undefined,
      smallPets: Array.isArray((r as { smallPets?: GameState["smallPets"] }).smallPets)
        ? (r as { smallPets: GameState["smallPets"] }).smallPets
        : [],
      ...(movedFromPetArea
        ? {
            locationId: "flower_market",
            region: "downtown_station",
            area: "downtown_station",
            navStack: [],
          }
        : {}),
    } as GameState;
    migrated = migrateSave(v27State);
  } else if (r.version === 27) {
    // v27 → v28（1.41）：目标检查器不再写入存档；接入城市连续委托并限制版税池。
    // v1.4 当前有效车票不跨小版本保留，避免在旧规则快照中出现已不匹配的班次。
    const passiveIncome = Math.max(0, Math.min(1500, Number(r.career?.passiveIncome ?? 0) || 0));
    const v28State: GameState = {
      ...r,
      version: 28,
      dailyGoals: normalizeDailyGoals(r.dailyGoals),
      smallPets: Array.isArray((r as { smallPets?: GameState["smallPets"] }).smallPets)
        ? (r as { smallPets: GameState["smallPets"] }).smallPets
        : [],
      cityCommissions: normalizeCityCommissions((r as { cityCommissions?: unknown }).cityCommissions),
      career: { ...r.career, passiveIncome },
    } as GameState;
    // 1.42 继续执行 v28 → v29，确保所有历史版本都补齐冰箱/烹饪字段。
    migrated = migrateSave(v28State);
  } else if (r.version === 28) {
    // v28 → v29：冰箱与自由烹饪。旧版已经付款但尚未发车的车票必须保留，
    // 继续由旧的人工检票流程处理，不能因为升级而丢失玩家权益。
    const rawFridge = (r as { fridge?: unknown }).fridge;
    const fridge = rawFridge && typeof rawFridge === "object"
      ? {
          tier: ["small", "medium", "large"].includes((rawFridge as { tier?: unknown }).tier as string)
            ? (rawFridge as { tier: "small" | "medium" | "large" }).tier
            : null,
          items: (rawFridge as { items?: unknown }).items && typeof (rawFridge as { items: unknown }).items === "object"
            ? Object.fromEntries(Object.entries((rawFridge as { items: Record<string, unknown> }).items).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => [k, Math.floor(v as number)]))
            : {},
        }
      : { tier: null, items: {} };
    const rawCooking = (r as { cooking?: unknown }).cooking;
    const cooking = rawCooking && typeof rawCooking === "object"
      ? {
          unlockedRecipeIds: Array.isArray((rawCooking as { unlockedRecipeIds?: unknown }).unlockedRecipeIds)
            ? (rawCooking as { unlockedRecipeIds: unknown[] }).unlockedRecipeIds.filter((id): id is string => typeof id === "string")
            : [],
          ...((typeof (rawCooking as { lastRecipeId?: unknown }).lastRecipeId === "string") ? { lastRecipeId: (rawCooking as { lastRecipeId: string }).lastRecipeId } : {}),
          ...((typeof (rawCooking as { lastQuality?: unknown }).lastQuality === "string") ? { lastQuality: (rawCooking as { lastQuality: "普通" | "美味" | "完美" }).lastQuality } : {}),
          ...(() => {
            const pending = (rawCooking as { pendingCook?: unknown }).pendingCook;
            if (!pending || typeof pending !== "object") return {};
            const row = pending as { recipeId?: unknown; quality?: unknown };
            return typeof row.recipeId === "string" && (row.quality === "普通" || row.quality === "美味" || row.quality === "完美")
              ? { pendingCook: { recipeId: row.recipeId, quality: row.quality } }
              : {};
          })(),
          mealQualities: (rawCooking as { mealQualities?: unknown }).mealQualities && typeof (rawCooking as { mealQualities: unknown }).mealQualities === "object"
            ? Object.fromEntries(Object.entries((rawCooking as { mealQualities: Record<string, unknown> }).mealQualities).filter(([, value]) => value === "普通" || value === "美味" || value === "完美"))
            : {},
          mealQualityBatches: normalizeMealQualityBatches((rawCooking as { mealQualityBatches?: unknown }).mealQualityBatches),
        }
      : { unlockedRecipeIds: [] };
    const passiveIncome = Math.max(0, Math.min(1500, Number(r.career?.passiveIncome ?? 0) || 0));
    const v29State: GameState = {
      ...r,
      version: 29,
      fridge,
      cooking,
      smallPets: Array.isArray((r as { smallPets?: unknown }).smallPets)
        ? (r as { smallPets: GameState["smallPets"] }).smallPets
        : [],
      cityCommissions: normalizeCityCommissions((r as { cityCommissions?: unknown }).cityCommissions),
      dailyGoals: normalizeDailyGoals(r.dailyGoals),
      equipped: r.equipped && typeof r.equipped === "object" ? r.equipped : {},
      inventory: r.inventory && typeof r.inventory === "object" ? r.inventory : { phone: 1 },
      relationships: Array.isArray(r.relationships) ? r.relationships : [],
      career: r.career
        ? { ...r.career, passiveIncome }
        : {
            jobId: null, kind: null, hiredDay: 0, workedDays: 0, lastWorkDay: 0,
            internDays: {}, internLastDay: -1, projects: {}, passiveIncome: 0, experience: {},
          },
      rng: r.rng ?? { seed: 1, calls: 0 },
    } as GameState;
    // 继续执行 v29 → v30，确保所有历史版本最终都有基础衣柜。
    migrated = migrateSave(v29State);
  } else if (r.version === 30) {
    // v30 → v31（1.45）：新增独立内搭槽位，保留旧衣服/裤子/帽子与加成状态。
    const v31State: GameState = {
      ...r,
      version: 31,
      equipped: r.equipped && typeof r.equipped === "object" ? { ...r.equipped } : {},
      inventory: r.inventory && typeof r.inventory === "object" ? { ...r.inventory } : { phone: 1 },
      flags: r.flags && typeof r.flags === "object" ? { ...r.flags } : {},
      smallPets: Array.isArray((r as { smallPets?: unknown }).smallPets)
        ? (r as { smallPets: GameState["smallPets"] }).smallPets
        : [],
      cityCommissions: normalizeCityCommissions((r as { cityCommissions?: unknown }).cityCommissions),
      dailyGoals: normalizeDailyGoals(r.dailyGoals),
      career: r.career
        ? {
            ...r.career,
            passiveIncome: Math.max(0, Math.min(1500, Number(r.career.passiveIncome ?? 0) || 0)),
          }
        : {
            jobId: null, kind: null, hiredDay: 0, workedDays: 0, lastWorkDay: 0,
            internDays: {}, internLastDay: -1, projects: {}, passiveIncome: 0, experience: {},
          },
    } as GameState;
    ensureWardrobeDefaults(v31State);
    migrated = v31State;
  } else if (r.version === 29) {
    // v29 → v30（1.45）：新增帽子/裤子槽位，并给旧档补齐基础衣柜。
    const v30State: GameState = {
      ...r,
      version: 30,
      equipped: r.equipped && typeof r.equipped === "object" ? { ...r.equipped } : {},
      inventory: r.inventory && typeof r.inventory === "object" ? { ...r.inventory } : { phone: 1 },
      smallPets: Array.isArray((r as { smallPets?: unknown }).smallPets)
        ? (r as { smallPets: GameState["smallPets"] }).smallPets
        : [],
      cityCommissions: normalizeCityCommissions((r as { cityCommissions?: unknown }).cityCommissions),
      dailyGoals: normalizeDailyGoals(r.dailyGoals),
      career: r.career
        ? {
            ...r.career,
            passiveIncome: Math.max(0, Math.min(1500, Number(r.career.passiveIncome ?? 0) || 0)),
          }
        : {
            jobId: null, kind: null, hiredDay: 0, workedDays: 0, lastWorkDay: 0,
            internDays: {}, internLastDay: -1, projects: {}, passiveIncome: 0, experience: {},
          },
    } as GameState;
    ensureWardrobeDefaults(v30State);
    migrated = migrateSave(v30State);
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
      living: normalizeLegacyLiving(r.living),
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
      living: normalizeLegacyLiving(legacyLiving),
      backgrounds: (r as { backgrounds?: Record<string, string> }).backgrounds ?? {},
      laborMarket: (r as { laborMarket?: { generatedDay: number; offers: JobOffer[] } }).laborMarket ?? {
        generatedDay: 1,
        offers: [],
      },
    };
    migrated = migrateSave(v2State);
  }

  // 较早迁移链有分支直接返回 v31；统一继续经过 31→32，不能留下旧工资制。
  const normalized = migrated.version < SAVE_VERSION ? migrateSave(migrated) : normalizeNavigationAndResidence(migrated);
  return normalizeBoundedCollections(normalized);
}

/** v1/v2 旧档的住宿结构归一到当前三态 Housing。 */
function normalizeLegacyLiving(raw: unknown): GameState["living"] {
  if (raw && typeof raw === "object") {
    const row = raw as Partial<LegacyLiving> & { mode?: unknown };
    if (row.mode === "gov" || row.mode === "lease" || row.mode === "nightly" || row.mode === "owned") {
      return raw as GameState["living"];
    }
    if (typeof row.housingId === "string") {
      return {
        mode: "lease",
        govDaysLeft: 0,
        nightly: null,
        lease: {
          housingId: row.housingId,
          rent: typeof row.rent === "number" ? row.rent : 0,
          rentGrowthCount: typeof row.rentGrowthCount === "number" ? row.rentGrowthCount : 0,
        },
      };
    }
  }
  return { mode: "gov", govDaysLeft: 7, nightly: null, lease: null };
}
