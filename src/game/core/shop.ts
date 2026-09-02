/**
 * v1.3 网购商城
 * ------------------------------------------------------------------
 * 线上购买商场同款（服装 / 电子 / 家具 / 奢侈品），价格比线下低，但需 3 天快递。
 * 目录复用 items.json 既有物品 id；下单走 orders 系统，到达后入包。
 */
import type { GameState } from "../types";
import { getItem } from "./items";
import { placeOrder, claimOrder, activeOrders, arrivedOrders } from "./orders";

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 线下实体店价（名牌店 / 电器城 / 家具城） */
  offline: number;
  /** 网购价（约线下 9 折，省运费与时间） */
  price: number;
  /** 分类 */
  cat: "服装" | "电子" | "家具" | "奢侈品";
}

/** 网购目录：价目对齐线下实体店（shirt 800 / suit 5000 / 羊绒大衣 3000 / 名表 10000 / 名牌包 15000 / 手机 800~5000 / 床品 1500~4000 / 灯 600 / 绿植 1200），线上统一 9 折 */
function onlinePrice(offline: number): number {
  return Math.round((offline * 0.9) / 10) * 10;
}

export const SHOP_CATALOG: ShopItem[] = [
  { id: "shirt", name: "衬衫", icon: "👔", desc: "干净得体，魅力 +2（可装备）", offline: 800, price: onlinePrice(800), cat: "服装" },
  { id: "suit", name: "西装", icon: "🤵", desc: "笔挺西装，魅力 +5（可装备）", offline: 5000, price: onlinePrice(5000), cat: "服装" },
  { id: "phone_rice", name: "大米手机", icon: "📱", desc: "实惠智能机，通讯更顺手", offline: 800, price: onlinePrice(800), cat: "电子" },
  { id: "phone_flower", name: "花朵手机", icon: "🌸", desc: "高颜值手机，颜值党的选择", offline: 2000, price: onlinePrice(2000), cat: "电子" },
  { id: "phone_fruit", name: "水果手机", icon: "🍎", desc: "旗舰手机，面子与里子兼得", offline: 5000, price: onlinePrice(5000), cat: "电子" },
  { id: "bed_standard", name: "真丝套装", icon: "🛏️", desc: "提升睡眠质量（可装备）", offline: 1500, price: onlinePrice(1500), cat: "家具" },
  { id: "bed_premium", name: "梦幻套装", icon: "✨", desc: "顶级寝具，每晚好梦（可装备）", offline: 4000, price: onlinePrice(4000), cat: "家具" },
  { id: "lamp", name: "暖光灯", icon: "💡", desc: "温馨氛围，心情 +2（家具）", offline: 600, price: onlinePrice(600), cat: "家具" },
  { id: "plant", name: "绿植盆栽", icon: "🪴", desc: "一抹绿意，心情 +3（家具）", offline: 1200, price: onlinePrice(1200), cat: "家具" },
  { id: "luxury_coat", name: "羊绒大衣", icon: "🧥", desc: "纯羊绒，气质拉满（奢侈品）", offline: 3000, price: onlinePrice(3000), cat: "奢侈品" },
  { id: "luxury_watch", name: "名表", icon: "⌚", desc: "腕间品味，fame +3（奢侈品）", offline: 10000, price: onlinePrice(10000), cat: "奢侈品" },
  { id: "luxury_bag", name: "名牌包", icon: "👜", desc: "出门必备，fame +4（奢侈品）", offline: 15000, price: onlinePrice(15000), cat: "奢侈品" },
];

/** 下单网购 */
export function placeShopOrder(state: GameState, itemId: string): { ok: boolean; text: string } {
  const m = SHOP_CATALOG.find((x) => x.id === itemId);
  if (!m) return { ok: false, text: "商城没有这件商品" };
  // 防御：万一物品数据缺失
  if (!getItem(itemId)) return { ok: false, text: "商品数据异常" };
  return placeOrder(state, { kind: "shop", itemId, price: m.price, etaDays: 3 });
}

export { claimOrder, activeOrders, arrivedOrders };
