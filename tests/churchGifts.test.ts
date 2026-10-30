import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  afterChurchCatechumen,
  afterChurchGospelBox,
  afterChurchMass,
  afterChurchMeal,
  canReceiveChurchMeal,
  getCurrentChurchGospelExcerpt,
  repairChurchCrucifixForBaptizedSave,
} from "../src/game/core/religion";
import { gameDay, weekdayOf } from "../src/game/core/calendar";
import { itemCount } from "../src/game/core/items";
import { GOSPEL_BOX_QUOTES, CHURCH_GIFT_CARDS, churchGiftCardImage } from "../src/game/data/churchGifts";
import { getReadableDocument } from "../src/game/data/readableDocuments";
import { NEW_TESTAMENT } from "../src/game/data/scripture";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  const state = createInitialState(501);
  state.locationId = "church";
  state.time.hour = 10;
  return state;
}

describe("教堂赠礼与福音小盒", () => {
  it("每次慕道班赠一张尚未拥有的圣母/十一门徒卡，保留首次圣经上下册并在收齐后停止", () => {
    const state = fresh();
    expect(CHURCH_GIFT_CARDS).toHaveLength(12);
    expect(CHURCH_GIFT_CARDS.some((card) => /犹达斯依斯加略|犹大依斯加略/.test(card.name))).toBe(false);
    expect(CHURCH_GIFT_CARDS.some((card) => card.name.includes("犹达（达陡）"))).toBe(true);

    for (let i = 0; i < CHURCH_GIFT_CARDS.length; i += 1) afterChurchCatechumen(state);
    expect(itemCount(state, "bible_old_testament")).toBe(1);
    expect(itemCount(state, "bible_new_testament")).toBe(1);
    for (const card of CHURCH_GIFT_CARDS) expect(itemCount(state, card.itemId)).toBe(1);

    const inventoryBefore = { ...state.inventory };
    afterChurchCatechumen(state);
    expect(state.inventory).toEqual(inventoryBefore);
    expect(state.flags.church_gift_cards_complete).toBe(true);
  });

  it("十二张卡片都有名字、主题说明和各自的可欣赏原生卡面", () => {
    const cards = CHURCH_GIFT_CARDS.map((card) => ({
      card,
      document: getReadableDocument(card.itemId),
      image: churchGiftCardImage(card),
    }));
    expect(new Set(cards.map(({ image }) => image)).size).toBe(12);
    for (const { card, document, image } of cards) {
      expect(document?.kind).toBe("art");
      expect(document?.title).toBe(card.name);
      expect(document?.pages[0]).toBe(card.description);
      expect(image).toContain(card.itemId.replace("church_card_", "") + ".png");
      expect(image).not.toMatch(/^data:image/);
    }
  });

  it("新受洗获得一枚苦像；旧档补发只成功一次且不重复发已有苦像", () => {
    const state = fresh();
    state.flags.church_attended = 4;
    afterChurchMass(state);
    expect(state.flags.church_baptized).toBe(true);
    expect(state.flags.church_crucifix_awarded).toBe(true);
    expect(itemCount(state, "church_crucifix")).toBe(1);
    expect(getReadableDocument("church_crucifix")?.kind).toBe("art");
    expect(repairChurchCrucifixForBaptizedSave(state)).toBe(false);
    expect(itemCount(state, "church_crucifix")).toBe(1);

    const legacy = fresh();
    expect(repairChurchCrucifixForBaptizedSave(legacy)).toBe(false);
    legacy.flags.church_baptized = true;
    expect(repairChurchCrucifixForBaptizedSave(legacy)).toBe(true);
    expect(repairChurchCrucifixForBaptizedSave(legacy)).toBe(false);
    expect(itemCount(legacy, "church_crucifix")).toBe(1);

    const preexisting = fresh();
    preexisting.flags.church_baptized = true;
    preexisting.inventory.church_crucifix = 1;
    expect(repairChurchCrucifixForBaptizedSave(preexisting)).toBe(false);
    expect(preexisting.flags.church_crucifix_awarded).toBe(true);
    expect(itemCount(preexisting, "church_crucifix")).toBe(1);
  });

  it("弥撒不再自动聚餐；周六和周日各能领取一次免费聚餐", () => {
    const state = fresh(); // 2026-08-01 is Saturday
    const satiety = state.player.attrs.satiety;
    afterChurchMass(state);
    expect(state.player.attrs.satiety).toBe(satiety);
    expect(state.flags.church_meal_day).toBeUndefined();

    expect(weekdayOf(state.time)).toBe(5);
    expect(canReceiveChurchMeal(state).ok).toBe(true);
    expect(afterChurchMeal(state).ok).toBe(true);
    expect(state.flags.church_meal_day).toBe(gameDay(state.time));
    expect(afterChurchMeal(state).ok).toBe(false);

    state.time.day = 2; // Sunday
    expect(weekdayOf(state.time)).toBe(6);
    expect(afterChurchMeal(state).ok).toBe(true);
    expect(afterChurchMeal(state).ok).toBe(false);

    state.time.day = 3; // Monday
    expect(weekdayOf(state.time)).toBe(0);
    expect(afterChurchMeal(state).ok).toBe(false);

    state.time.day = 1;
    state.flags.temple_done = true;
    expect(afterChurchMeal(state).ok).toBe(false);
  });

  it("福音小盒仅在教堂抽取，每日保存一段原文且同日重复不重抽、不发属性奖励", () => {
    const state = fresh();
    const result = afterChurchGospelBox(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const quoteBefore = result.quote;
    expect(state.flags.church_gospel_box_day).toBe(gameDay(state.time));
    expect(itemCount(state, "doc_church_gospel_box")).toBe(0);
    expect(getCurrentChurchGospelExcerpt(state)?.pages).toEqual([
      `【${quoteBefore.bookName} 第${quoteBefore.chapter}章】\n\n${quoteBefore.text}`,
    ]);
    expect(getReadableDocument("doc_church_gospel_box")).toBeUndefined();

    const attributesBefore = { ...state.player.attrs };
    const moneyBefore = state.player.money;
    const rngCalls = state.rng.calls;
    const repeated = afterChurchGospelBox(state);
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    expect(repeated.alreadyDrawn).toBe(true);
    expect(repeated.quoteIndex).toBe(result.quoteIndex);
    expect(state.rng.calls).toBe(rngCalls);
    expect(state.player.attrs).toEqual(attributesBefore);
    expect(state.player.money).toBe(moneyBefore);

    state.time.day = 2;
    const nextDay = afterChurchGospelBox(state);
    expect(nextDay.ok).toBe(true);
    if (!nextDay.ok) return;
    expect(nextDay.quoteIndex).not.toBe(result.quoteIndex);
    expect(afterChurchGospelBox({ ...state, locationId: "home" }).ok).toBe(false);
  });

  it("福音池每条原句都逐字出自所标思高新约书卷与章节", () => {
    for (const quote of GOSPEL_BOX_QUOTES) {
      const book = NEW_TESTAMENT.books.find((candidate) => candidate.name === quote.bookName);
      expect(book, `找不到书卷 ${quote.bookName}`).toBeDefined();
      const chapter = book?.chapters.find((candidate) => candidate.number === quote.chapter);
      expect(chapter, `找不到 ${quote.bookName} 第${quote.chapter}章`).toBeDefined();
      const source = chapter?.pages.map((page) => page.content).join("\n") ?? "";
      expect(source, `${quote.bookName} 第${quote.chapter}章未找到原句`).toContain(quote.text);
    }
  });
});
