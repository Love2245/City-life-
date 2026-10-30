import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { canPerform, getAction, performAction } from "../src/game/core/actions";
import { migrateSave } from "../src/game/core/migrate";
import { CHURCH_GIFT_CARDS, GOSPEL_BOX_QUOTES } from "../src/game/data/churchGifts";
import { getReadableDocument } from "../src/game/data/readableDocuments";

function atChurch() {
  const state = createInitialState(8120);
  state.locationId = "church";
  state.time = { year: 2026, month: 8, day: 1, hour: 10, minute: 0 };
  return state;
}

describe("教堂活动实际行动入口", () => {
  it("周六与周日各一顿免费聚餐，弥撒和重复提交不叠加餐食", () => {
    const state = atChurch(); state.player.attrs.satiety = 20;
    const beforeMoney = state.player.money;
    expect(performAction(state, "church_meal").ok).toBe(true);
    expect(state.player.attrs.satiety).toBeGreaterThan(20);
    const afterMeal = state.player.attrs.satiety;
    expect(performAction(state, "church_meal").ok).toBe(false);
    expect(state.player.attrs.satiety).toBe(afterMeal);
    state.time.day = 2; state.player.attrs.satiety = 20;
    expect(performAction(state, "church_meal").ok).toBe(true);
    state.time.day = 3;
    expect(canPerform(state, getAction("church_meal")!).ok).toBe(false);
    expect(state.player.money).toBe(beforeMoney);
  });

  it("福音每天一条，拒绝异地操作与同日重复，弹窗显示已抽中的原句", () => {
    const state = atChurch();
    state.locationId = "street";
    expect(performAction(state, "church_gospel_box").ok).toBe(false);
    state.locationId = "church";
    const result = performAction(state, "church_gospel_box");
    expect(result.ok).toBe(true);
    const idx = state.flags.church_gospel_box_quote_index as number;
    expect(result.result?.verdict).toContain(GOSPEL_BOX_QUOTES[idx].text);
    expect(performAction(state, "church_gospel_box").ok).toBe(false);
    expect(state.flags.church_gospel_box_quote_index).toBe(idx);
    expect(getReadableDocument("doc_church_gospel_box", state)).toBeUndefined();
    expect(state.inventory.doc_church_gospel_box).toBeUndefined();
    state.time.day += 1;
    expect(performAction(state, "church_gospel_box").ok).toBe(true);
    expect(state.flags.church_gospel_box_quote_index).not.toBe(idx);
    expect(state.inventory.doc_church_gospel_box).toBeUndefined();
  });

  it("慕道班礼品不重复，十二张集齐仍可参加且不重复补圣经", () => {
    const state = atChurch();
    for (let day = 1; day <= 13; day++) {
      state.time.day = day; state.time.hour = 10;
      const result = performAction(state, "church_catechumen");
      expect(result.ok).toBe(true);
      expect(result.result?.verdict).toContain(day <= 12 ? "本次获得" : "本次没有新增礼品");
      if (day === 1) expect(result.result?.verdict).toContain("思高圣经·旧约");
      expect(performAction(state, "church_catechumen").ok).toBe(false);
    }
    expect(CHURCH_GIFT_CARDS).toHaveLength(12);
    for (const card of CHURCH_GIFT_CARDS) expect(state.inventory[card.itemId]).toBe(1);
    expect(state.inventory.bible_old_testament).toBe(1);
    expect(state.inventory.bible_new_testament).toBe(1);
  });

  it("新受洗和旧档受洗都获得唯一苦像，重复读取不再补发", () => {
    const state = atChurch(); state.flags.church_attended = 4; state.time.hour = 15;
    expect(performAction(state, "church_mass").ok).toBe(true);
    expect(state.inventory.church_crucifix).toBe(1);
    const legacy = atChurch(); legacy.flags.church_baptized = true;
    const migrated = migrateSave(legacy);
    expect(migrated.inventory.church_crucifix).toBe(1);
    expect(migrateSave(migrated).inventory.church_crucifix).toBe(1);
  });
});
