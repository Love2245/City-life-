import type { GameState, ItemDef } from "../types";
import { gameDay } from "./calendar";
import { canEnterTemple } from "./religion";
import { addItem, getItem } from "./items";
import { pushLog } from "../engine";

export interface TempleGiftOffer {
  itemId: string;
  note: string;
}

/** A small rotating-feeling selection; players choose any single free gift per game week. */
export const TEMPLE_GIFT_OFFERS: readonly TempleGiftOffer[] = [
  { itemId: "doc_sutra_amita", note: "结缘院赠阅经文" },
  { itemId: "doc_sutra_diamond", note: "结缘院赠阅经文" },
  { itemId: "doc_sutra_heart", note: "结缘院赠阅经文" },
  { itemId: "doc_temple_prayer_leaflet", note: "结缘院介绍与静心练习" },
  { itemId: "temple_wrist_mala", note: "素木腕珠，随身留念" },
  { itemId: "doc_temple_art_print", note: "一张山门水墨画印" },
  { itemId: "doc_temple_deer_king_art", note: "一幅鹿王本生故事画印" },
  { itemId: "doc_temple_guide_bodhisattva_art", note: "一幅引路菩萨画印" },
  { itemId: "doc_temple_maha_vairocana_art", note: "一幅大日如来画印" },
];

const OFFER_BY_ID = new Map(TEMPLE_GIFT_OFFERS.map((offer) => [offer.itemId, offer]));
const LAST_CLAIM_WEEK_FLAG = "temple_gift_claim_week";

export function templeGiftWeekIndex(state: GameState): number {
  return Math.floor(gameDay(state.time) / 7);
}

export function templeGiftClaimedThisWeek(state: GameState): boolean {
  return state.flags[LAST_CLAIM_WEEK_FLAG] === templeGiftWeekIndex(state);
}

export function templeGiftItem(itemId: string): ItemDef | undefined {
  return getItem(itemId);
}

export function claimTempleGift(state: GameState, itemId: string): { ok: true; item: ItemDef } | { ok: false; reason: string } {
  if (state.locationId !== "temple") return { ok: false, reason: "请到寺庙结缘院领取" };
  if (!canEnterTemple(state)) return { ok: false, reason: "你已受洗归主，寺庙与你无缘" };
  if (!OFFER_BY_ID.has(itemId)) return { ok: false, reason: "这件物品不在结缘院目录中" };
  if (templeGiftClaimedThisWeek(state)) return { ok: false, reason: "本游戏周已经领取过结缘礼，下周再来看看" };

  const item = getItem(itemId);
  if (!item) return { ok: false, reason: "这件结缘礼暂时无法领取" };
  addItem(state, itemId, 1);
  state.flags[LAST_CLAIM_WEEK_FLAG] = templeGiftWeekIndex(state);
  pushLog(state, "🛕", `在结缘院免费领取了「${item.name}」，本游戏周的结缘礼已领取`);
  return { ok: true, item };
}
