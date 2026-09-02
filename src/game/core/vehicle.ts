/**
 * v1.20 载具押金制租赁：租用 → 交押金；退租或买断 → 退还押金（买断可抵扣押金）。
 * 纯逻辑层。载具类型：bicycle（仅买断）/ e_bike / tricycle / car（可租可买）。
 * 旧版 30 天月租档已废弃，旧档迁移时按原月租金折算为押金，转为不限期的押金租赁。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";
import { scaleCost } from "./difficulty";
import { recordMoney } from "./weekly"; // v1.215：买断载具计入周记支出（P1-10）

/** 载具中文名（复用） */
export const VEHICLE_NAMES: Record<string, string> = {
  bicycle: "自行车",
  e_bike: "电动车",
  tricycle: "三轮车",
  car: "汽车",
};

/** 载具押金（租用需交，退租/买断时退还或抵扣） */
export const VEHICLE_DEPOSIT: Record<string, number> = {
  e_bike: 600,
  tricycle: 1200,
  car: 3000,
};

/** 旧版月租金（仅供存档迁移折算押金，不再用于新租赁） */
export const VEHICLE_RENT: Record<string, number> = {
  e_bike: 600,
  tricycle: 1200,
  car: 3000,
};

/** v0.94 载具买断价（一次性付款，永不回收） */
export const VEHICLE_BUY: Record<string, number> = {
  bicycle: 300,
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

/** 是否正租用该载具（有 vehicles 条目且非自有） */
function isRenting(state: GameState, type: string): boolean {
  const v = state.vehicles[type];
  return !!v && !v.owned;
}

/**
 * v1.20 租用载具：校验钱 → 扣押金 → 写 flag + 押金记录（不限租期，退租或买断时退还）。
 * 同一车型已拥有或已租用则拒绝重复租用。
 */
export function rentVehicle(state: GameState, type: string, price?: number): RentResult {
  const cost = price ?? VEHICLE_DEPOSIT[type];
  if (!cost) return { ok: false, reason: "未知载具" };
  if (state.flags[`item_${type}`] && state.vehicles[type]) {
    return { ok: false, reason: `已经租着/拥有这辆${VEHICLE_NAMES[type] ?? type}了` };
  }
  // 兼容旧档/二手购买：已持 flag 但无 vehicles 记录（如劳务市场二手电动车）视为自有
  if (state.flags[`item_${type}`]) {
    return { ok: false, reason: `已经有这辆${VEHICLE_NAMES[type] ?? type}了` };
  }
  if (state.player.money < cost) {
    return { ok: false, reason: `金钱不足（押金需 ${cost} 元）` };
  }
  state.player.money -= cost;
  state.flags[`item_${type}`] = true;
  state.vehicles[type] = { day: state.time.day, month: state.time.month, year: state.time.year, deposit: cost };
  pushLog(state, "🔑", `租了一辆${VEHICLE_NAMES[type] ?? type}（押金 ${cost} 元），退租或买断时押金退还`);
  return { ok: true, price: cost };
}

/**
 * v1.20 买断载具（owned=true，不受租赁回收影响）。
 * 价格按当前物价倍率缩放；若正租用同型车，押金直接抵作购车款（只需补差价）。
 * 已有同型自有车则拒绝重复购买。
 */
export function buyVehicle(state: GameState, type: string): RentResult {
  const base = VEHICLE_BUY[type];
  if (!base) return { ok: false, reason: "未知载具" };
  if (state.vehicles[type]?.owned) {
    return { ok: false, reason: `已经拥有这辆${VEHICLE_NAMES[type] ?? type}了` };
  }
  // 持 flag 但无 vehicles 记录（劳务市场二手电动车等）→ 视为已有自有车
  if (state.flags[`item_${type}`] && !state.vehicles[type]) {
    return { ok: false, reason: `已经有这辆${VEHICLE_NAMES[type] ?? type}了` };
  }
  const cost = scaleCost(state, base);
  const deposit = isRenting(state, type) ? (state.vehicles[type].deposit ?? 0) : 0;
  const pay = Math.max(0, cost - deposit);
  if (state.player.money < pay) {
    return { ok: false, reason: `金钱不足（买断 ${cost} 元${deposit > 0 ? `，押金抵扣后需 ${pay} 元` : ""}）` };
  }
  state.player.money -= pay;
  recordMoney(state, -pay); // v1.215 修复（P1-10）：买断载具计入周记支出（押金抵扣部分不算新支出）
  state.flags[`item_${type}`] = true;
  state.vehicles[type] = { day: state.time.day, month: state.time.month, year: state.time.year, owned: true };
  pushLog(
    state,
    "🚗",
    deposit > 0
      ? `买断这辆${VEHICLE_NAMES[type] ?? type}（${cost} 元，押金 ${deposit} 元已抵扣，实付 ${pay} 元），车是自己的了`
      : `买断一辆${VEHICLE_NAMES[type] ?? type}（${cost} 元），车是自己的了`,
  );
  return { ok: true, price: pay };
}

/** v1.20 退租：退押金 → 清 flag → 删 vehicles 条目。自有车无需退租。 */
export function returnVehicle(state: GameState, type: string): RentResult {
  const v = state.vehicles[type];
  if (!v) return { ok: false, reason: `没有租用${VEHICLE_NAMES[type] ?? type}` };
  if (v.owned) return { ok: false, reason: `这辆${VEHICLE_NAMES[type] ?? type}是你自己的，不用退` };
  const deposit = v.deposit ?? 0;
  delete state.vehicles[type];
  state.flags[`item_${type}`] = false;
  state.player.money += deposit;
  pushLog(state, "🔑", `退租${VEHICLE_NAMES[type] ?? type}，押金 ${deposit} 元已退还`);
  return { ok: true, price: deposit };
}

/** 到期检查（sleepSettlement 调用）：仅回收旧版无押金的 30 天月租档；押金制租赁不设租期，需手动退租 */
export function checkVehicleExpiry(state: GameState): void {
  for (const [type, exp] of Object.entries(state.vehicles)) {
    if (exp.owned) continue; // 自有车永不回收
    if (exp.deposit != null) continue; // v1.20 押金制租赁不限租期
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
