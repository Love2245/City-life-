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

export const HOUSING: HousingData = housingData as HousingData;

const govTier = HOUSING.gov;
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
export function getLeaseTier(id: string): (LodgingTier & { rentGrowthRate: number }) | undefined {
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

/** 当前实际生效的住宿档位（gov→政府档；nightly→所选档(缺省 atm)；lease→月租档；own→产权档） */
export function getEffectiveLodging(state: GameState): LodgingTier {
  const l = state.living;
  if (l.mode === "gov") return govTier;
  if (l.mode === "lease") {
    const tier = l.lease ? leaseMap.get(l.lease.housingId) : undefined;
    return tier ?? govTier;
  }
  if (l.mode === "own") {
    const tier = l.ownedId ? buyMap.get(l.ownedId) : undefined;
    return tier ?? govTier;
  }
  // nightly：未选默认 atm
  return nightlyMap.get(l.nightly?.lodgingId ?? "atm") ?? govTier;
}

/** 当前住处是否具备某设施 */
export function hasFacility(state: GameState, f: Facility): boolean {
  return getEffectiveLodging(state).facilities.includes(f);
}

/**
 * v0.97 当前住处的出门定位区域（home 地点动态归属）。
 * 连锁酒店/出租屋/出租公寓 → 市中心；青年旅舍/民宿/政府住房/露宿 → 住宅区。
 */
export function currentRegion(state: GameState): string {
  return getEffectiveLodging(state).region ?? "downtown_residential";
}

/** 当前住处显示名（home 地点动态名称） */
export function currentResidenceName(state: GameState): string {
  const l = state.living;
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

/** 今晚住宿费用（mode=nightly 时） */
export function nightlyPrice(state: GameState): number {
  const tier = getLodging(state.living.nightly?.lodgingId ?? "atm");
  return tier?.price ?? 0;
}

/** 选择今晚住宿（仅 mode=nightly 生效） */
export function selectLodging(state: GameState, lodgingId: string): boolean {
  if (state.living.mode !== "nightly") return false;
  if (!nightlyMap.has(lodgingId)) return false;
  state.living.nightly = { lodgingId };
  return true;
}

/** 签约月租（mode→lease，扣首月房租（含家庭折扣）；要求 money ≥ 折后价） */
export function signLease(state: GameState, housingId: string): { ok: boolean; reason?: string } {
  const tier = leaseMap.get(housingId);
  if (!tier) return { ok: false, reason: "未知房源" };
  const discount = familyRentDiscount(state);
  const price = Math.round(tier.price * (1 - discount));
  if (state.player.money < price) return { ok: false, reason: `付不起首月房租（需 ${price} 元）` };
  state.player.money -= price;
  state.living.mode = "lease";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = { housingId, rent: price, rentGrowthCount: 0 };
  pushLog(state, tier.icon, `签约${tier.name}，月租 ${price} 元${discount > 0 ? `（含政府补贴 -${Math.round(discount * 100)}%）` : ""}，从此不用再找地方住`);
  addContact(state, "landlord"); // v0.98：租房后自动添加房东联系方式
  return { ok: true };
}

/** 是否有可签的月租房源（供 UI 判断） */
export function hasLeaseOption(): boolean {
  return leaseTiers.length > 0;
}

/**
 * v0.94 一次性买断产权房（mode→own）。
 * 房价按当前物价倍率缩放（scaleCost）；已有产权则拒绝重复购买。
 * 购房后免租金/免月租，永居。
 * 返回 { ok, reason?, price }，price 为含物价浮动的实际成交价。
 */
export function buyProperty(state: GameState, housingId: string): { ok: boolean; reason?: string; price?: number } {
  const tier = buyMap.get(housingId);
  if (!tier) return { ok: false, reason: "未知房源" };
  if (state.living.mode === "own") {
    return { ok: false, reason: "已经拥有产权住房，不能重复购买" };
  }
  const price = scaleCost(state, tier.buyPrice);
  if (state.player.money < price) {
    return { ok: false, reason: `买不起（需 ${price} 元，含物价浮动）` };
  }
  state.player.money -= price;
  state.living.mode = "own";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = null;
  state.living.ownedId = housingId;
  state.flags["owned_property"] = true;
  pushLog(state, tier.icon, `一次性买断「${tier.name}」共 ${price} 元，从此不用再交房租`);
  return { ok: true, price };
}
