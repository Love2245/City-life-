/**
 * v1.3 外卖到家
 * ------------------------------------------------------------------
 * 在线点餐：从「可即食的消耗品」菜单选一份，扣款下单，约 1 小时（跨天 tick 即到达）送达，
 * 领取后即时食用（恢复饱腹 / 心情）。
 *
 * 菜单 = items.json 中「消耗品 + 含饱腹效果」的条目；价格 = 物品 cost + 配送费。
 */
import type { GameState } from "../types";
import { ITEMS } from "./items";
import { placeOrder, claimOrder, activeOrders, arrivedOrders } from "./orders";

const DELIVERY_FEE = 4;

export interface TakeoutItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 配送总价（物品价 + 配送费） */
  price: number;
}

/** 外卖菜单：筛选消耗品且具饱腹效果的食物 */
export const TAKEOUT_MENU: TakeoutItem[] = ITEMS.filter((it) => {
  if (!it.consumable) return false;
  const eff = it.useEffects as { satiety?: number } | undefined;
  return !!eff && (eff.satiety ?? 0) > 0;
}).map((it) => {
  const base = (it.cost as number) ?? 0;
  return {
    id: it.id,
    name: it.name,
    icon: it.icon ?? "🍔",
    desc: it.desc ?? "",
    price: base + DELIVERY_FEE,
  };
});

/** 下单外卖 */
export function placeTakeout(state: GameState, itemId: string): { ok: boolean; text: string } {
  const m = TAKEOUT_MENU.find((x) => x.id === itemId);
  if (!m) return { ok: false, text: "菜单上没有这道" };
  return placeOrder(state, { kind: "takeout", itemId, price: m.price, etaDays: 0 });
}

export { claimOrder, activeOrders, arrivedOrders };
