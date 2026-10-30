/**
 * 住房系统：数据加载、当前住宿档位解析、按天住宿选择、月租签约。
 * 纯逻辑层。
 */
import type { GameState, HousingData, LodgingTier, Facility } from "../types";
import { pushLog } from "../engine";
import housingData from "../data/housing.json";
import familyData from "../data/families.json";
import { scaleCost } from "./difficulty";
import { addContact } from "./contacts";
import { recordMoney } from "./weekly";
import { currentWeather } from "./weather";
import {prepayCityHotel,CITY_HOTEL_ROOMS} from './cityHotels';
import { gameDay } from "./calendar";
import {ownedProperties,activeOwnedProperty,bestOwnedProperty,addOwnedProperty,normalizeOwnedProperties,settlePropertyRent} from './propertyPortfolio';
import { getRegion, isRegionUnlocked, regionLockReason } from "./regions";
import {
  currentResidence, permanentResidence, residenceLocationId, residenceRegion, isResidenceLocation,
  hasTempleStay, hasWorkerDormStay, unlockResidence, TEMPLE_STAY_UNTIL,
  WORKER_DORM_STAY_UNTIL, temporaryStayThroughDate,
  expireTempleStay as expireTempleTemporaryStay,
  expireWorkerDormStay as expireWorkerDormTemporaryStay,
} from "./residence";

export const HOUSING: HousingData = housingData as HousingData;

/** 租约每 30 个游戏日滚动续期一次。 */
export const LEASE_PERIOD_DAYS = 30;

const nightlyTiers = HOUSING.nightly;
const leaseTiers = HOUSING.lease;
const buyTiers = HOUSING.buy ?? [];
const nightlyMap = new Map(nightlyTiers.map((t) => [t.id, t]));
const leaseMap = new Map(leaseTiers.map((t) => [t.id, t]));
/** v0.94 可购产权房源 */
const buyMap = new Map(buyTiers.map((t) => [t.id, t]));
/** 家庭租房折扣（赤贫 15%） */
const familyMap = new Map(
  (familyData as { families: Array<{ id: string; rentDiscount?: number }> }).families.map((f) => [f.id, f]),
);

/** 家庭租房折扣率（0~1） */
function familyRentDiscount(state: GameState): number {
  return familyMap.get(state.family)?.rentDiscount ?? 0;
}

/** 获取按天住宿档位 */
export function getLodging(id: string): LodgingTier | undefined {
  return nightlyMap.get(id);
}

/** 获取月租房源 */
export function getLeaseTier(id: string): (LodgingTier & { rentGrowthRate: number; rentCap?: number }) | undefined {
  return leaseMap.get(id);
}

/** v0.94 获取可购产权房源 */
export function getBuyTier(id: string): (LodgingTier & { buyPrice: number }) | undefined {
  return buyMap.get(id);
}

/** 所有可购产权房源（UI 展示用） */
export function getBuyTiers(): (LodgingTier & { buyPrice: number })[] {
  return buyTiers;
}

/** 当前借宿档位；入住持续到返回常住建筑或更换住处。 */
export function awayNightTier(state: GameState): LodgingTier | undefined {
  const id = state.living.awayNight?.lodgingId;
  if (id === "temple" && !hasTempleStay(state)) return undefined;
  if (id === "worker_dorm" && !hasWorkerDormStay(state)) return undefined;
  return id ? nightlyMap.get(id) : undefined;
}

/** 退掉借宿登记，恢复常住地址。 */
export function clearAwayNight(state: GameState): void {
  state.living.awayNight = null;
}

/** 是否已经拥有产权住房（兼容产权档、产权 id 与旧存档 flag）。 */
export function hasOwnedProperty(state: GameState): boolean {
  return ownedProperties(state).length>0 || state.living.mode === "own" || !!state.living.ownedId || state.flags["owned_property"] === true;
}

/** 当前实际入住档位；借宿期间保留原有租约或产权。 */
export function getEffectiveLodging(state: GameState): LodgingTier {
  return currentResidence(state);
}

/**
 * v1.43.x 住院恢复率专用：忽略「今晚外宿」，返回玩家真实住处档位。
 * 住院期间人实际在病房，外宿预订不计入恢复率（且会在睡眠结算时作废）。
 */
export function getResidenceLodging(state: GameState): LodgingTier {
  return permanentResidence(state);
}

/** 当前住处是否具备某设施 */
export function hasFacility(state: GameState, f: Facility): boolean {
  return getEffectiveLodging(state).facilities.includes(f);
}

/** 当前入住建筑的区域；借宿与常住共用实际地址。 */
export function currentRegion(state: GameState): string {
  return residenceRegion(state);
}

/** 当前租约距离下次扣款的游戏日数；缺少日期的未迁移状态按完整周期显示。 */
export function daysUntilNextRent(state: GameState): number | null {
  const lease = state.living.mode === "lease" ? state.living.lease : null;
  if (!lease) return null;
  const today = gameDay(state.time);
  const dueDay = Number.isSafeInteger(lease.nextRentDay)
    ? lease.nextRentDay!
    : today + LEASE_PERIOD_DAYS;
  return Math.max(0, dueDay - today);
}

/** 当前住处显示名（home 地点动态名称） */
export function currentResidenceName(state: GameState): string {
  if (currentResidence(state).id === "temple") {
    const date = temporaryStayThroughDate(state, TEMPLE_STAY_UNTIL);
    return `寺庙禅房（可住至 ${date ?? "资格有效期内"}）`;
  }
  if (currentResidence(state).id === "worker_dorm") {
    const date = temporaryStayThroughDate(state, WORKER_DORM_STAY_UNTIL);
    return `工人集体宿舍（可住至 ${date ?? "资格有效期内"}）`;
  }
  if (currentResidence(state).id === "npc_guest_room") {
    return "朋友家客房（借宿一晚）";
  }
  const l = state.living;
  const away = awayNightTier(state);
  if (away) return `${away.name}（借宿，${away.price} 元/晚）`;
  if (l.mode === "gov") return `政府免费住宿（剩 ${l.govDaysLeft} 晚）`;
  if (l.mode === "lease") {
    const tier = l.lease ? leaseMap.get(l.lease.housingId) : undefined;
    return tier?.name ?? "月租房";
  }
  if (l.mode === "own") {
    const tier = l.ownedId ? buyMap.get(l.ownedId) : undefined;
    return tier ? `${tier.name}（已购，无需付租）` : "自有住房";
  }
  const tier = getLodging(l.nightly?.lodgingId ?? "atm");
  return `${tier?.name ?? "流浪"}（${tier?.price ?? 0} 元/晚）`;
}

/** 地图住处标牌使用住宿档位的配置名称；期限、费用等状态留给住处详情展示。 */
export function mapResidenceName(state: GameState): string {
  const residence = currentResidence(state);
  // 地图建筑标牌只显示建筑本名；借宿费用、剩余期限等状态留在居家详情页。
  return residence.name;
}

/** 居家页面与地图使用同一份当前入住名称。 */
export function homeResidenceName(state: GameState): string {
  return currentResidenceName(state);
}

/** 入睡必须回到实际入住建筑，住院病房另行处理。 */
export function canSleepHere(state: GameState): boolean {
  if (state.flags["hospitalized"]) return state.locationId === "hospital";
  const rawStayId = state.living.awayNight?.lodgingId
    ?? (state.living.mode === "nightly" ? state.living.nightly?.lodgingId : undefined);
  if (rawStayId === "temple" && !hasTempleStay(state)) return false;
  if (rawStayId === "worker_dorm" && !hasWorkerDormStay(state)) return false;
  const residence = currentResidence(state);
  if (!isResidenceLocation(state)) return false;
  if (residence.id === "temple") return hasTempleStay(state);
  if (residence.id === "worker_dorm") return hasWorkerDormStay(state);
  return true;
}

/** 到期只结束住宿身份，不把玩家瞬移到另一栋房子。 */
export function expireTempleStay(state: GameState): void {
  expireTempleTemporaryStay(state);
}

export function expireWorkerDormStay(state: GameState): void {
  expireWorkerDormTemporaryStay(state);
}

/** 今晚住宿费用（mode=nightly 时） */
export function nightlyPrice(state: GameState): number {
  const tier = getEffectiveLodging(state);
  return tier?.price ?? 0;
}

/** 当晚实际住宿费；寒潮加价在选择校验、界面与睡眠结算间共用同一计算。 */
export function nightlyCost(state: GameState, basePrice: number): number {
  const base = Math.max(0, Math.round(basePrice));
  return currentWeather(state) === "coldwave" ? Math.round(base * 1.3) : base;
}

/**
 * 登记当前住宿。按晚住宿直接改住址；固定住房借宿保留原租约/产权。
 * 旧 forceAwayNight 参数只保留调用兼容，不再产生任意地点都能入睡的虚拟外宿。
 */
export function selectLodging(
  state: GameState,
  lodgingId: string,
  _opts?: { forceAwayNight?: boolean },
): boolean {
  const tier = nightlyMap.get(lodgingId);
  if (!tier) return false;
  if ((state.districtLeisure?.active || state.fishing?.active) || (tier.region && !isRegionUnlocked(state, getRegion(tier.region)))) return false;
  if (lodgingId === "camping_lodging" && state.locationId !== "camping_base") return false;
  if (lodgingId === "temple" && (state.locationId !== "temple" || !hasTempleStay(state))) return false;
  if (lodgingId === "worker_dorm" && (state.locationId !== "worker_dormitory" || !hasWorkerDormStay(state))) return false;
  // 房费在入睡结算时扣除，这里先挡住明显付不起的选择，避免睡完变成负资产
  const alreadyBooked=CITY_HOTEL_ROOMS.has(lodgingId)&&currentResidence(state).id===lodgingId&&state.flags.hotel_booking_id===[...CITY_HOTEL_ROOMS].indexOf(lodgingId)+1;
  if (!alreadyBooked&&nightlyCost(state, tier.price) > state.player.money) return false;
  if(!prepayCityHotel(state,lodgingId,nightlyCost(state,tier.price)))return false;
  // 旧 home 字段不能随换房把玩家瞬移到新地址；先固定当前所在的真实建筑。
  if (state.locationId === "home") state.locationId = residenceLocationId(state);
  unlockResidence(state, lodgingId);
  if (state.living.mode === "nightly") {
    state.living.nightly = { lodgingId };
    state.living.awayNight = null;
    return true;
  }
  state.living.awayNight = { lodgingId };
  return true;
}

/** 签约月租（mode→lease，预付首个 30 日租期；要求 money ≥ 折后价） */
export function signLease(state: GameState, housingId: string): { ok: boolean; reason?: string } {
  if (housingId === 'dev_incubator') return { ok: false, reason: '创业孵化基地为纯办公场所，请到市政大厅注册公司' };
  const tier = leaseMap.get(housingId);
  if (!tier) return { ok: false, reason: "未知房源" };
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  const campusHome=['dev_incubator','boyue_talent_apartment'].includes(housingId);
  const admissionState=campusHome?{...state,flags:{...state.flags,item_student_pass:true}}:state;
  if (tier.region && !isRegionUnlocked(admissionState, getRegion(tier.region))) return { ok: false, reason: regionLockReason(state, getRegion(tier.region)) };
  if (hasOwnedProperty(state)) return { ok: false, reason: "已有产权住房，不能再签普通租约" };
  const discount = familyRentDiscount(state);
  const price = Math.round(tier.price * (1 - discount));
  if (state.player.money < price) return { ok: false, reason: `付不起首月房租（需 ${price} 元）` };
  if (state.locationId === "home") state.locationId = residenceLocationId(state);
  state.player.money -= price;
  recordMoney(state, -price); // v1.10 周记（签约首期房租入周记）
  delete state.flags["lease_prepaid_month"];
  delete state.flags["lease_first_month_prepaid"];
  state.living.mode = "lease";
  if(campusHome)state.flags.item_student_pass=true;
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.awayNight = null;
  state.living.lease = {
    housingId,
    rent: price,
    rentGrowthCount: 0,
    nextRentDay: gameDay(state.time) + LEASE_PERIOD_DAYS,
  };
  unlockResidence(state, housingId);
  pushLog(state, tier.icon, `签约${tier.name}，首期租金 ${price} 元（覆盖 30 天）${discount > 0 ? `（含政府补贴 -${Math.round(discount * 100)}%）` : ""}，从此不用再找地方住`);
  addContact(state, "landlord"); // v0.98：租房后自动添加房东联系方式
  return { ok: true };
}

/** 是否有可签的月租房源（供 UI 判断） */
export function hasLeaseOption(): boolean {
  return leaseTiers.length > 0;
}

/**
 * v0.94 一次性买断产权房（mode→own）。
 * 房价按当前物价倍率缩放；允许多套及相同房型，购买后默认自住最好的一套。
 * 购房后免租金/免月租，永居。
 * 返回 { ok, reason?, price }，price 为含物价浮动的实际成交价。
 */
export function buyProperty(state: GameState, housingId: string): { ok: boolean; reason?: string; price?: number; text?:string } {
  const tier = buyMap.get(housingId);
  if (!tier) return { ok: false, reason: "未知房源" };
  if(state.districtLeisure?.active||state.fishing?.active)return{ok:false,reason:'请先收竿或完成当前娱乐活动'};
  if(tier.region&&!isRegionUnlocked(state,getRegion(tier.region)))return{ok:false,reason:regionLockReason(state,getRegion(tier.region))};
  const price = scaleCost(state, tier.buyPrice);
  if (state.player.money < price) {
    return { ok: false, reason: `买不起（需 ${price} 元，含物价浮动）` };
  }
  if (state.locationId === "home") state.locationId = residenceLocationId(state);
  settlePropertyRent(state);
  const bought=addOwnedProperty(state,housingId);
  const active=bestOwnedProperty(ownedProperties(state),activeOwnedProperty(state)?.id)??bought;
  state.player.money -= price;
  recordMoney(state, -price); // v1.215：买断产权计入周记支出（P1-10）
  state.living.mode = "own";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.awayNight = null;
  state.living.lease = null;
  state.living.ownedId = active.housingId;
  state.living.activePropertyId=active.id;
  unlockResidence(state, housingId);
  state.flags["owned_property"] = true;
  const home=buyMap.get(active.housingId)!;
  const text=`买下「${tier.name}」共 ${price} 元；自住${home.name}，其余${ownedProperties(state).length-1}套自动出租，每满30个出租日收取月租。`;
  pushLog(state,tier.icon,text);
  return { ok: true, price,text };
}

/** 选择持有的一套产权房自住；保持玩家所在地图位置，其他套继续出租。 */
export function switchOwnedResidence(state:GameState,propertyId:string):{ok:boolean;reason?:string}{
 const target=ownedProperties(state).find(p=>p.id===propertyId);
 if(!target)return{ok:false,reason:'没有这套产权房'};
 if(state.districtLeisure?.active||state.fishing?.active)return{ok:false,reason:'请先收竿或完成当前娱乐活动'};
 if(state.flags.hospitalized)return{ok:false,reason:'请先办理出院'};
 if(state.locationId==='home')state.locationId=residenceLocationId(state);
 settlePropertyRent(state);normalizeOwnedProperties(state);
 state.living.mode='own';state.living.ownedId=target.housingId;state.living.activePropertyId=target.id;
 state.living.awayNight=null;state.living.nightly=null;state.living.lease=null;
 unlockResidence(state,target.housingId);
 pushLog(state,'🏠',`将${buyMap.get(target.housingId)?.name}设为自住，其余产权房自动出租。`);
 return{ok:true};
}
