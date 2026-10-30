import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { emptyProfile, applyNewGameSetup } from "../src/game/core/profile";
import { sleepSettlement } from "../src/game/core/time";

describe("v1.395 回归：开局与日结算", () => {
  it("无稳定住所时不会通过旧开局物品直接获得橘猫", () => {
    const noCat = createInitialState(1);
    applyNewGameSetup(noCat, "ordinary", { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 }, [], emptyProfile(), "normal");
    expect(noCat.pets).toHaveLength(0);

    const withCat = createInitialState(1);
    applyNewGameSetup(withCat, "ordinary", { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 3 }, ["cat_orange"], emptyProfile(), "normal");
    expect(withCat.pets).toHaveLength(0);
    expect(withCat.flags.item_cat_orange).toBeUndefined();
  });

  it("同一天第二次睡眠不重复执行每日衰减或负债计数", () => {
    const state = createInitialState(2);
    state.player.money = -10;
    state.player.attrs.health = 100;
    state.player.attrs.hygiene = 100;
    sleepSettlement(state, { hours: 8 });
    const health = state.player.attrs.health;
    const hygiene = state.player.attrs.hygiene;
    expect(state.player.negativeMoneyStreak).toBe(1);

    sleepSettlement(state, { hours: 1 });
    expect(state.player.negativeMoneyStreak).toBe(1);
    expect(state.player.attrs.health).toBe(health);
    expect(state.player.attrs.hygiene).toBe(hygiene);
  });
});
