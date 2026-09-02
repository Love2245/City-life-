/**
 * 载具月租系统：租用 / 到期收回。
 * 纯逻辑层。载具类型：e_bike（600/月）/ tricycle（1200/月）/ car（3000/月）。
 * 租期 30 天，到期自动收回（清 flag + 删 vehicles 条目）。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";
import { scaleCost } from "./difficulty";

/** 每月天数（与 time.rollDay / membership 的日历保持一致：统一 30 天月） */
const DAYS_PER_MONTH = 30;

/** 载具中文名（复用） */
export const VEHICLE_NAMES: Record<string, string> = { e_bike: "电动车", tricycle: "三轮车", car: "汽车" };

/** 载具月租金 */
export const VEHICLE_RENT: Record<string, number> = {
  e_bike: 600,
  tricycle: 1200,
  car: 3000,
};

/** v0.94 载具买断价（一次性付款，永不回收） */
export const VEHICLE_BUY: Record<string, number> = {
  e_bike: 3000,
  tricycle: 8000,
  car: 50000,
};

export interface RentResult {
  ok: boolean;
  reason?: string;
  /** v0.94 buyVehicle 返回：含物价浮动的实际成交价 */
  price?: number;
}

/** 租用载具：校验钱 → 扣款 → 写 flag + 到期日 */
export function rentVehicle(state: GameState, type: string, price?: number): RentResult {
  const cost = price ?? VEHICLE_RENT[type];
  if (!cost) return { ok: false, reason: "未知载具" };
  if (state.flags[`item_${type}`] && state.vehicles[type]) {
    return { ok: false, reason: "已经租着这辆车了，到期再续" };
  }
  if (state.player.money < cost) {
    return { ok: false, reason: `金钱不足（需 ${cost} 元）` };
  }
  state.player.money -= cost;
  state.flags[`item_${type}`] = true;
  // 到期日 = 当前日 + 30 天，做月份进位归一化（v0.936：原只记 day+30 不进位，下月 1 号即误判到期）
  const exp = { ...state.time, day: state.time.day + 30 };
  while (exp.day > DAYS_PER_MONTH) {
    exp.day -= DAYS_PER_MONTH;
    exp.month++;
    if (exp.month > 12) {
      exp.month = 1;
      exp.year++;
    }
  }
  state.vehicles[type] = { day: exp.day, month: exp.month, year: exp.year };
  pushLog(state, "🔑", `租了一辆${VEHICLE_NAMES[type] ?? type}（${cost} 元/月），30 天后到期`);
  return { ok: true };
}

/**
 * v0.94 一次性买断载具（owned=true，不受租赁到期回收影响）。
 * 价格按当前物价倍率缩放；已有同型自有车则拒绝重复购买。
 * 若当前是租用同型车，买断后自动转为自有。
 */
export function buyVehicle(state: GameState, type: string): RentResult {
  const base = VEHICLE_BUY[type];
  if (!base) return { ok: false, reason: "未知载具" };
  if (state.vehicles[type]?.owned) {
    return { ok: false, reason: `已经拥有这辆${VEHICLE_NAMES[type] ?? type}了` };
  }
  const cost = scaleCost(state, base);
  if (state.player.money < cost) {
    return { ok: false, reason: `金钱不足（需 ${cost} 元）` };
  }
  state.player.money -= cost;
  state.flags[`item_${type}`] = true;
  state.vehicles[type] = { day: state.time.day, month: state.time.month, year: state.time.year, owned: true };
  pushLog(state, "🚗", `买断一辆${VEHICLE_NAMES[type] ?? type}（${cost} 元），车是自己的了`);
  return { ok: true, price: cost };
}

/** 到期检查（sleepSettlement 调用）：到期收回租用载具（自有车跳过） */
export function checkVehicleExpiry(state: GameState): void {
  for (const [type, exp] of Object.entries(state.vehicles)) {
    if (exp.owned) continue; // 自有车永不回收
    const expired =
      state.time.year > exp.year ||
      (state.time.year === exp.year && state.time.month > exp.month) ||
      (state.time.year === exp.year && state.time.month === exp.month && state.time.day >= exp.day);
    if (expired) {
      delete state.vehicles[type];
      state.flags[`item_${type}`] = false;
      pushLog(state, "🔑", `租用的${VEHICLE_NAMES[type] ?? type}到期了，被租赁方收回`);
    }
  }
}