import type { GameState, HousingData, LodgingTier } from "../types";
import housingData from "../data/housing.json";
import locationsData from "../data/locations.json";
import { fromLinearDay, gameDay, START_EPOCH } from "./calendar";
import { pushLog } from "../engine";

// 地址和入住身份的唯一来源；不依赖结算或导航模块，可供引擎、读档与 UI 共用。
const housing = housingData as HousingData;
export const RESIDENCE_TIERS: readonly LodgingTier[] = [
  housing.gov, ...housing.nightly, ...housing.lease, ...(housing.buy ?? []),
];

const ATM_TIER = housing.nightly.find((tier) => tier.id === "atm") ?? housing.nightly[0]!;
/** A temporary but physically addressable room used for a one-night NPC crash stay. */
const NPC_CRASH_TIER: LodgingTier = {
  ...ATM_TIER,
  id: "npc_guest_room",
  name: "朋友家客房",
  icon: "🛏️",
  price: 0,
  recovery: 0.65,
  moodBonus: 5,
  facilities: ["rest", "shower"],
  sideEffects: undefined,
  region: "downtown_residential",
  visualId: "minsu",
  locationId: "npc_guest_room",
  mapAnchor: { x: 62, y: 72 },
};
/** 只有月租或产权住房才允许开始养猫；临时床位不算稳定住所。 */
export function hasLongTermResidence(state: GameState): boolean {
  if (state.living.mode === "lease" && !!state.living.lease?.housingId) return true;
  if (state.living.mode === "own" && !!state.living.ownedId) return true;
  // 兼容旧存档中只保留产权标记的状态。
  return !!state.living.ownedId || state.flags["owned_property"] === true;
}

export const TEMPLE_STAY_UNTIL = "temple_lodging_until";
export const WORKER_DORM_STAY_UNTIL = "industrial_dorm_lodging_until";
export const NPC_CRASH_STAY_DAY = "npc_crash_stay_day";
const TEMPLE_STAY_MIGRATED = "temple_lodging_rule_v2";
const WORKER_DORM_STAY_MIGRATED = "industrial_dorm_lodging_rule_v2";
const NPC_CRASH_STAY_MIGRATED = "npc_crash_stay_rule_v2";

export function residenceMinutes(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}

function temporaryStayIsActive(state: GameState, key: string): boolean {
  const until = state.flags[key];
  return typeof until === "number" && Number.isFinite(until) && residenceMinutes(state) < until;
}

function rawTemporaryLodging(state: GameState, id: string): boolean {
  return state.living.awayNight?.lodgingId === id ||
    (state.living.mode === "nightly" && state.living.nightly?.lodgingId === id);
}

/** 旧档只给正在使用的临时住所一段新规则过渡期；历史资格不会变成长期住宿。 */
export function migrateTemporaryResidenceStays(state: GameState): void {
  state.flags ??= {};
  const nextTwoFullDays = (gameDay(state.time) + 3) * 1440;
  if (state.flags[TEMPLE_STAY_MIGRATED] !== true) {
    if (rawTemporaryLodging(state, "temple")) {
      const oldUntil = state.flags[TEMPLE_STAY_UNTIL];
      state.flags[TEMPLE_STAY_UNTIL] = Math.max(
        typeof oldUntil === "number" && Number.isFinite(oldUntil) ? oldUntil : 0,
        nextTwoFullDays,
      );
    }
    state.flags[TEMPLE_STAY_MIGRATED] = true;
  }
  if (state.flags[WORKER_DORM_STAY_MIGRATED] !== true) {
    if (rawTemporaryLodging(state, "worker_dorm")) {
      const oldUntil = state.flags[WORKER_DORM_STAY_UNTIL];
      state.flags[WORKER_DORM_STAY_UNTIL] = Math.max(
        typeof oldUntil === "number" && Number.isFinite(oldUntil) ? oldUntil : 0,
        nextTwoFullDays,
      );
    }
    state.flags[WORKER_DORM_STAY_MIGRATED] = true;
  }
  if (state.flags[NPC_CRASH_STAY_MIGRATED] !== true) {
    if (typeof state.romance?.crashTonight === "string" && typeof state.flags[NPC_CRASH_STAY_DAY] !== "number") {
      // Old saves stored no date. Preserve one current-night stay, then future stays always carry their day.
      state.flags[NPC_CRASH_STAY_DAY] = gameDay(state.time);
    }
    state.flags[NPC_CRASH_STAY_MIGRATED] = true;
  }
}

export function permanentResidence(state: GameState): LodgingTier {
  const living = state.living;
  if (living.mode === "gov") return housing.gov;
  const id = living.mode === "lease" ? living.lease?.housingId
    : living.mode === "own" ? living.ownedId : living.nightly?.lodgingId ?? "atm";
  const pool = living.mode === "lease" ? housing.lease
    : living.mode === "own" ? housing.buy ?? [] : housing.nightly;
  return pool.find((tier) => tier.id === id) ?? housing.gov;
}

export function currentResidence(state: GameState): LodgingTier {
  if (hasNpcCrashStay(state)) return NPC_CRASH_TIER;
  const guestId = state.living.awayNight?.lodgingId;
  const guest = housing.nightly.find((tier) => tier.id === guestId);
  if (guest && (guest.id !== "temple" || hasTempleStay(state))
    && (guest.id !== "worker_dorm" || hasWorkerDormStay(state))) return guest;
  const base = permanentResidence(state);
  if (state.living.mode === "nightly" && base.id === "temple" && !hasTempleStay(state)) return ATM_TIER;
  if (state.living.mode === "nightly" && base.id === "worker_dorm" && !hasWorkerDormStay(state)) return ATM_TIER;
  return base;
}

export function residenceLocationId(state: GameState, permanent = false): string {
  const tier = permanent ? permanentResidence(state) : currentResidence(state);
  return tier.locationId ?? tier.id;
}

export function residenceRegion(state: GameState): string {
  return currentResidence(state).region ?? "downtown_residential";
}

/** home 仅兼容历史存档和行动组；实际地图与新移动使用建筑 ID。 */
export function isResidenceLocation(state: GameState, locationId = state.locationId): boolean {
  return locationId === "home" || locationId === residenceLocationId(state);
}

export function housingAtLocation(locationId: string): LodgingTier | undefined {
  if (locationId === NPC_CRASH_TIER.locationId) return NPC_CRASH_TIER;
  return RESIDENCE_TIERS.find((tier) => (tier.locationId ?? tier.id) === locationId);
}

export function hasTempleStay(state: GameState): boolean {
  return temporaryStayIsActive(state, TEMPLE_STAY_UNTIL);
}

export function hasWorkerDormStay(state: GameState): boolean {
  return temporaryStayIsActive(state, WORKER_DORM_STAY_UNTIL);
}

/** Work and volunteer lodging lasts through the end of the second full day after completion. */
function refreshedStayUntil(state: GameState): number {
  return (gameDay(state.time) + 3) * 1440;
}

export function grantTempleStay(state: GameState): void {
  state.flags[TEMPLE_STAY_UNTIL] = refreshedStayUntil(state);
  state.flags[TEMPLE_STAY_MIGRATED] = true;
}

export function grantWorkerDormStay(state: GameState): void {
  state.flags[WORKER_DORM_STAY_UNTIL] = refreshedStayUntil(state);
  state.flags[WORKER_DORM_STAY_MIGRATED] = true;
  state.flags["industrial_dorm_qualified"] = true;
  if (state.living.mode === "nightly") {
    state.living.nightly = { lodgingId: "worker_dorm" };
    state.living.awayNight = null;
  } else {
    state.living.awayNight = { lodgingId: "worker_dorm" };
  }
}

/** 截止日期按“可住至”展示；until 是次日 00:00 起不再有效的分钟游标。 */
export function temporaryStayThroughDate(state: GameState, key: string): string | undefined {
  const until = state.flags[key];
  if (typeof until !== "number" || !Number.isFinite(until)) return undefined;
  const lastDay = Math.ceil(until / 1440) - 1;
  const date = fromLinearDay(START_EPOCH + lastDay);
  return date.year === state.time.year
    ? `${date.month}月${date.day}日`
    : `${date.year}年${date.month}月${date.day}日`;
}

export function hasNpcCrashStay(state: GameState): boolean {
  return typeof state.romance?.crashTonight === "string"
    && state.flags[NPC_CRASH_STAY_DAY] === gameDay(state.time);
}

/** 清理跨日后仍残留的蹭住标记。睡眠中的标记由时间结算在醒来后消费。 */
export function expireNpcCrashStay(state: GameState): void {
  if (typeof state.romance?.crashTonight !== "string" || hasNpcCrashStay(state)) return;
  clearNpcCrashStay(state);
}

/** 睡眠结算成功后结束借宿，并把玩家从朋友家客房送回自己的实际住址。 */
export function consumeNpcCrashStay(state: GameState): void {
  const atLegacyHomeAlias = state.locationId === "home";
  state.romance.crashTonight = undefined;
  delete state.flags[NPC_CRASH_STAY_DAY];
  delete state.flags["npc_guest_room_unlocked"];
  // Older saves used a generic home alias; only that alias needs resolving to a real address.
  // New saves stay physically at npc_guest_room after waking and must navigate away normally.
  if (atLegacyHomeAlias) state.locationId = residenceLocationId(state, true);
}

export const clearNpcCrashStay = consumeNpcCrashStay;

function expireTemporaryLodging(state: GameState, id: "temple" | "worker_dorm", key: string, icon: string, message: string): void {
  const active = rawTemporaryLodging(state, id);
  if (!active || temporaryStayIsActive(state, key)) return;
  if (state.living.awayNight?.lodgingId === id) state.living.awayNight = null;
  if (state.living.mode === "nightly" && state.living.nightly?.lodgingId === id) {
    state.living.nightly = { lodgingId: "atm" };
  }
  pushResidenceLog(state, icon, message);
}

function pushResidenceLog(state: GameState, icon: string, text: string): void {
  pushLog(state, icon, text);
}

export function expireTempleStay(state: GameState): void {
  expireTemporaryLodging(state, "temple", TEMPLE_STAY_UNTIL, "🛕", "禅房住宿资格已到期；需要再次做义工才能续住。你仍可继续留在寺庙办理其他事务。");
}

export function expireWorkerDormStay(state: GameState): void {
  expireTemporaryLodging(state, "worker_dorm", WORKER_DORM_STAY_UNTIL, "🏭", "工人集体宿舍住宿资格已到期；完成新的工业班次后可再次入住。你仍可继续在宿舍办理其他事务。");
}

export function expireTemporaryResidenceStays(state: GameState): void {
  expireTempleStay(state);
  expireWorkerDormStay(state);
  expireNpcCrashStay(state);
}

export function residenceSleepHours(_state: GameState, hours: number): number {
  // Expiry does not interrupt a sleep already in progress; it is handled once the player wakes.
  return hours;
}
/** 只有正在入住旧版禅房的存档获得一次过渡期，历史义工次数不兑换新住宿。 */
export function migrateTempleStay(state: GameState): void {
  migrateTemporaryResidenceStays(state);
}
export function unlockResidence(state: GameState, id: string): void {
  state.flags[`residence_unlocked_${id}`] = true;
}
/** 公共场所照常显示；私人住宿只在登记、租下或买下以后出现。 */
export function isResidenceBuildingVisible(state: GameState, id: string): boolean {
  if (id === "home" || id === "gov_residence") return false;
  if (id === "worker_dormitory") return state.flags["route_heavy_industry"] === true;
  if (id === "npc_guest_room") return hasNpcCrashStay(state);
  if(['own_villa','own_apartment','own_old_unit','rental_apartment','suburb_room'].includes(id))return currentResidence(state).locationId===id||permanentResidence(state).locationId===id||RESIDENCE_TIERS.some(t=>(t.locationId??t.id)===id&&(state.living.ownedId===t.id||state.living.properties?.some(p=>p.housingId===t.id)));
  const leaseTiersAtBuilding = housing.lease.filter(t => (t.locationId ?? t.id) === id);
  const publicNonLeaseEntry = RESIDENCE_TIERS.some(t =>
    !leaseTiersAtBuilding.some(lease => lease.id === t.id) && (t.locationId ?? t.id) === id,
  );
  // 月租独占建筑只随当前有效租约出现。旧档的准确 living.lease.housingId 可识别现租房，
  // 历史 residence_unlocked_* 标记不再让已搬走的房源永久留在地图上。
  if (leaseTiersAtBuilding.length && !publicNonLeaseEntry&&!locationsData.some(loc=>loc.id===id&&'publicHousingEntry' in loc&&loc.publicHousingEntry)) {
    return state.living.mode === "lease"
      && leaseTiersAtBuilding.some(t => t.id === state.living.lease?.housingId);
  }
  if (locationsData.some(loc => loc.id === id && "publicHousingEntry" in loc && loc.publicHousingEntry)) return true;
  const tiers = RESIDENCE_TIERS.filter(t => (t.locationId ?? t.id) === id);
  if (!tiers.length || ["hotel", "temple", "street"].includes(id)) return true;
  return tiers.some(t => t.id === currentResidence(state).id || t.id === permanentResidence(state).id
    || state.flags[`residence_unlocked_${t.id}`] === true);
}
