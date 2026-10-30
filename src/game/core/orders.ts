/**
 * v1.3 订单系统（外卖 / 网购通用）
 * ------------------------------------------------------------------
 * - placeOrder: 下单 → 扣款 → 写入 state.orders（支持即时或延迟送达）
 * - tickOrders: 跨天 tick（rollDay 调用）→ 到达后标记 arrived
 * - claimOrder: 领取 → 入包，返回结果文案
 *
 * 纯逻辑层，不触碰 UI。
 */
import type { GameState, Order } from "../types";
import { gameDay } from "../core/calendar";
import { getItem, addItem, acquireShopItem } from "./items";
import { pushLog } from "../engine";
import { recordMoney } from "./weekly";

function nextOrderId(state: GameState): string {
  // 使用存档内序列而非 Date.now，保证离线/便携版下单时 ID 可复现且不会碰撞。
  // typeof 对 NaN 也成立，会持续生成 ord_NaN 重复 id；用 Number.isSafeInteger 收紧
  // （JSON 会把 NaN 写成 null，读回时本就会落回 seq=1，这里是双保险）。
  const stored = state.flags.orderSeq;
  let seq = typeof stored === "number" && Number.isSafeInteger(stored) && stored > 0 ? stored : 1;
  let id = `ord_${seq}`;
  while ((state.orders ?? []).some((o) => o.id === id)) {
    seq += 1;
    id = `ord_${seq}`;
  }
  state.flags.orderSeq = seq + 1;
  return id;
}

/** 下单：校验金钱 + 扣款 + 入订单队列 */
export function placeOrder(
  state: GameState,
  opts: { kind: "takeout" | "shop"; itemId: string; price: number; etaDays: number }
): { ok: boolean; text: string } {
  if (!state.orders) state.orders = [];
  const item = getItem(opts.itemId);
  if (!item) return { ok: false, text: "商品不存在" };
  if (state.player.money < opts.price) {
    return { ok: false, text: `钱不够，还差 ¥${Math.max(0, opts.price - state.player.money)}` };
  }
  state.player.money -= opts.price;
  recordMoney(state, -opts.price); // 周记：外卖/网购下单计入支出
  const order: Order = {
    id: nextOrderId(state),
    kind: opts.kind,
    itemId: opts.itemId,
    name: item.name,
    icon: item.icon ?? "📦",
    price: opts.price,
    orderDay: gameDay(state.time),
    etaDays: opts.etaDays,
    arrived: opts.etaDays <= 0,
  };
  state.orders.push(order);
  const etaText = opts.etaDays <= 0 ? "已即时送达，可前往手机领取" : `${opts.etaDays} 天后到货`;
  return { ok: true, text: `已下单 ${item.name}（${etaText}）` };
}

/** 跨天推进：到货标记 */
export function tickOrders(state: GameState): void {
  if (!state.orders || state.orders.length === 0) return;
  const today = gameDay(state.time);
  for (const o of state.orders) {
    if (!o.arrived && today >= o.orderDay + o.etaDays) {
      o.arrived = true;
      // v1.3b7 到货弹窗提示（快递/外卖到达时 pushLog，UI 会弹通知）
      pushLog(state, "📦", `${o.icon} ${o.name} 已到货，记得去领取`);
    }
  }
}

/** 领取订单：外卖和网购都入包 */
export function claimOrder(state: GameState, orderId: string): { ok: boolean; text: string } {
  if (!state.orders) return { ok: false, text: "无订单" };
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false, text: "订单不存在" };
  const o = state.orders[idx];
  if (!o.arrived) return { ok: false, text: "订单还未到达" };

  if (o.kind === "takeout") {
    // v1.3b7 外卖：入包（不即时食用），玩家可在背包自行食用 —— 修复"领取后物品不在背包"
    addItem(state, o.itemId, 1);
    state.orders.splice(idx, 1);
    return { ok: true, text: `🍔 ${o.name} 已入包，可在背包食用` };
  }
  // 网购：入包待使用
  acquireShopItem(state, o.itemId);
  state.orders.splice(idx, 1);
  return { ok: true, text: `${o.name} 已入包，可在背包使用` };
}

/** 当前生效中的订单（未领取） */
export function activeOrders(state: GameState): Order[] {
  return (state.orders ?? []).filter((o) => !o.arrived);
}

/** 可领取的订单（已到达） */
export function arrivedOrders(state: GameState): Order[] {
  return (state.orders ?? []).filter((o) => o.arrived);
}
