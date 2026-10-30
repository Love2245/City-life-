/**
 * 宗教支线互斥系统（v0.98）：
 * - 教堂线：参加弥撒 → 累计 5 次 → 洗礼 → 教堂完成，禁止进入寺庙。
 * - 寺庙线：做义工 → 累计 5 次 → 佛法会 → 再累计 5 次 → 三宝 → 寺庙完成，禁止进入教堂。
 * 纯逻辑层，依赖 flags（全 number 语义）。
 */
import type { GameState } from "../types";
import { applyEffects, pushLog } from "../engine";
import { onEventChoice } from "./tarot";
import { addItem, itemCount } from "./items";
import { residenceLocationId, grantTempleStay } from "./residence";
import { gameDay, weekdayOf } from "./calendar";
import { randomInt } from "../rng";
import { CHURCH_GIFT_CARDS, GOSPEL_BOX_QUOTES, getChurchGospelExcerptDocument, type GospelBoxQuote } from "../data/churchGifts";

const CHURCH_CRUCIFIX_ID = "church_crucifix";
const CHURCH_GOSPEL_BOX_ID = "doc_church_gospel_box";

export interface ChurchMealResult {
  ok: boolean;
  reason?: string;
}

export type ChurchGospelBoxResult =
  | {
    ok: true;
    quote: GospelBoxQuote;
    quoteIndex: number;
    documentId: typeof CHURCH_GOSPEL_BOX_ID;
    alreadyDrawn: boolean;
  }
  | { ok: false; reason: string };
/* ==================== 教堂 ==================== */

/** 弥撒次数（≥5 解锁洗礼） */
const MASS_FOR_BAPTISM = 5;

/** 首次参加慕道会时赠送《思高圣经》上下册；每次上课另随机赠一张未收集卡片。 */
export function afterChurchCatechumen(state: GameState): string[] {
  const rewards: string[] = [];
  if (!state.flags.bible_awarded) {
    addItem(state, "bible_old_testament");
    addItem(state, "bible_new_testament");
    state.flags.bible_awarded = true;
    rewards.push("《思高圣经·旧约》×1", "《思高圣经·新约》×1");
    pushLog(state, "📖", "首次参加慕道会，领取《思高圣经》上、下册，已收入背包");
  }

  const unowned = CHURCH_GIFT_CARDS.filter((card) => itemCount(state, card.itemId) === 0);
  if (unowned.length === 0) {
    state.flags.church_gift_cards_complete = true;
    pushLog(state, "✝️", "圣母与十一位门徒纪念卡已收齐；本次慕道班不再重复赠送。");
    return rewards;
  }
  const card = unowned[randomInt(state.rng, 0, unowned.length - 1)];
  addItem(state, card.itemId);
  rewards.push(`${card.name}纪念卡 ×1`);
  if (unowned.length === 1) state.flags.church_gift_cards_complete = true;
  pushLog(state, "🖼️", `慕道班赠予你一张${card.name}纪念卡，已收入背包。`);
  return rewards;
}

/** 弥撒结算后调用 */
export function afterChurchMass(state: GameState): void {
  const count = (typeof state.flags.church_attended === "number" ? state.flags.church_attended : 0) + 1;
  state.flags.church_attended = count;
  pushLog(state, "⛪", `第 ${count} 次参加教堂弥撒`);

  if (!state.flags.church_baptized && count >= MASS_FOR_BAPTISM) {
    state.flags.church_baptized = true;
    pushLog(state, "✝️", "神父为你主持了洗礼——你正式成为了教会的一员。从此之后，寺庙对你关上了大门。");
    repairChurchCrucifixForBaptizedSave(state);
  }
}

/** New baptism and the old-save migration hook share the same once-only keepsake grant. */
export function repairChurchCrucifixForBaptizedSave(state: GameState): boolean {
  if (!state.flags.church_baptized || state.flags.church_crucifix_awarded) return false;
  if (itemCount(state, CHURCH_CRUCIFIX_ID) > 0) {
    state.flags.church_crucifix_awarded = true;
    return false;
  }
  addItem(state, CHURCH_CRUCIFIX_ID);
  state.flags.church_crucifix_awarded = true;
  pushLog(state, "✝️", "洗礼后收到一枚苦像纪念品，已收入背包。");
  return true;
}

function churchActionBlockReason(state: GameState): string | null {
  if (state.locationId !== "church") return "请先到教堂再参加这项活动。";
  if (!canEnterChurch(state)) return "你已成为佛门弟子，教堂大门紧闭。";
  return null;
}

/** Free church fellowship meal is available once per calendar day on Saturday or Sunday. */
export function canReceiveChurchMeal(state: GameState): ChurchMealResult {
  const blocked = churchActionBlockReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const weekday = weekdayOf(state.time);
  if (weekday !== 5 && weekday !== 6) return { ok: false, reason: "教会免费聚餐只在周六、周日开放。" };
  if (state.flags.church_meal_day === gameDay(state.time)) {
    return { ok: false, reason: "你今天已经参加过教会聚餐了。" };
  }
  return { ok: true };
}

/** Settlement hook for the standalone weekend fellowship action. */
export function afterChurchMeal(state: GameState): ChurchMealResult {
  const check = canReceiveChurchMeal(state);
  if (!check.ok) return check;
  state.flags.church_meal_day = gameDay(state.time);
  applyEffects(state, { satiety: 55, mood: 12, stress: -10, health: 2, fame: 1 }, "🍲");
  pushLog(state, "🍲", "教友们邀请你共进免费聚餐，有菜有汤，吃得暖心又饱足。");
  onEventChoice(state, "ev_church_fellowship", 1);
  return { ok: true };
}

/** Draw one new exact Síkǎo New Testament excerpt and save it for today's document view. */
export function afterChurchGospelBox(state: GameState): ChurchGospelBoxResult {
  const blocked = churchActionBlockReason(state);
  if (blocked) return { ok: false, reason: blocked };

  const today = gameDay(state.time);
  const savedIndex = state.flags.church_gospel_box_quote_index;
  if (state.flags.church_gospel_box_day === today && typeof savedIndex === "number") {
    const savedQuote = GOSPEL_BOX_QUOTES[savedIndex];
    if (savedQuote) {
      return {
        ok: true,
        quote: savedQuote,
        quoteIndex: savedIndex,
        documentId: CHURCH_GOSPEL_BOX_ID,
        alreadyDrawn: true,
      };
    }
  }

  let seenMask = typeof state.flags.church_gospel_box_seen_mask === "number"
    ? Math.max(0, Math.floor(state.flags.church_gospel_box_seen_mask))
    : 0;
  let unseenIndices = GOSPEL_BOX_QUOTES.map((_, index) => index).filter((index) => (seenMask & (1 << index)) === 0);
  if (unseenIndices.length === 0) {
    seenMask = 0;
    unseenIndices = GOSPEL_BOX_QUOTES.map((_, index) => index);
  }
  const quoteIndex = unseenIndices[randomInt(state.rng, 0, unseenIndices.length - 1)];
  const quote = GOSPEL_BOX_QUOTES[quoteIndex];
  seenMask |= 1 << quoteIndex;
  state.flags.church_gospel_box_seen_mask = seenMask;
  state.flags.church_gospel_box_day = today;
  state.flags.church_gospel_box_quote_index = quoteIndex;
  pushLog(state, "📜", `你从福音小盒抽到今日摘录：《${quote.bookName}》第${quote.chapter}章。`);
  return {
    ok: true,
    quote,
    quoteIndex,
    documentId: CHURCH_GOSPEL_BOX_ID,
    alreadyDrawn: false,
  };
}

/** Reader integration: the current-day document contains just the saved draw, never future quotes. */
export function getCurrentChurchGospelExcerpt(state: GameState): ReturnType<typeof getChurchGospelExcerptDocument> {
  return getChurchGospelExcerptDocument(state);
}

/** 是否可以进入教堂（寺庙未完成、未洗礼前） */
export function canEnterChurch(state: GameState): boolean {
  if (state.flags.temple_done) return false;
  return true;
}

/** 是否已完成洗礼（不可逆） */
export function isChurchBaptized(state: GameState): boolean {
  return !!state.flags.church_baptized;
}

/* ==================== 寺庙 ==================== */

const VOLUNTEER_FOR_CEREMONY = 5;
const VOLUNTEER_FOR_TRIPLE = 10;

/** 义工结算后调用 */
export function afterTempleVolunteer(state: GameState): void {
  grantTempleStay(state);
  const count = (typeof state.flags.temple_volunteered === "number" ? state.flags.temple_volunteered : 0) + 1;
  state.flags.temple_volunteered = count;
  if (count === 1 && !state.flags.doc_guanyin_awarded) {
    addItem(state, "doc_guanyin");
    state.flags.doc_guanyin_awarded = true;
    pushLog(state, "🪷", "师父赠予你一副水月观音菩萨画像，已收入背包");
  }
  pushLog(state, "🛕", `第 ${count} 次在寺庙做义工`);

  if (!state.flags.temple_ceremony && count >= VOLUNTEER_FOR_CEREMONY) {
    state.flags.temple_ceremony = true;
    pushLog(state, "🙏", "住持为你举办了佛法会——你在众人见证下与佛结缘。");
  }
  if (!state.flags.temple_done && count >= VOLUNTEER_FOR_TRIPLE) {
    state.flags.temple_done = true;
    pushLog(state, "🪷", "住持授予你三宝，你已是佛门弟子。从此教堂对你关上了大门。");
  }

    // 义工入住禅房，寺庙成为当前的家；原租约或产权继续保留。
    if (state.locationId === "home") state.locationId = residenceLocationId(state);
  if (state.living.mode === "nightly") {
    state.living.nightly = { lodgingId: "temple" };
      state.living.awayNight = null;
  } else {
    state.living.awayNight = { lodgingId: "temple" };
  }
    pushLog(state, "🛕", "本次义工为你安排了禅房，可住至后天结束；期限内回来无需重复登记，再次做义工会刷新住宿期限。");
}

/** 是否可以进入寺庙（教堂未完成） */
export function canEnterTemple(state: GameState): boolean {
  if (state.flags.church_baptized) return false;
  return true;
}

/** 是否已完成三宝（不可逆） */
export function isTempleDone(state: GameState): boolean {
  return !!state.flags.temple_done;
}

/* ==================== 互斥检查（供 UI / 行动校验） ==================== */

/** 返回「禁止进入原因」或 null（可进入） */
export function religionBlockReason(
  state: GameState,
  locationId: string,
): string | null {
  if (locationId === "church" && state.flags.temple_done) {
    return "你已是佛门弟子，教堂大门紧闭。";
  }
  if (locationId === "temple" && state.flags.church_baptized) {
    return "你已受洗归主，寺庙与你无缘。";
  }
  return null;
}
