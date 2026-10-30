import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";

describe("v1.47 慕道会赠书", () => {
  it("首次参加赠送两册思高圣经，重复参加不重复领取", () => {
    const state = createInitialState(14701);
    state.locationId = "church";
    state.region = "suburban_edge";
    state.time.hour = 10;

    expect(performAction(state, "church_catechumen").ok).toBe(true);
    expect(state.inventory.bible_old_testament).toBe(1);
    expect(state.inventory.bible_new_testament).toBe(1);

    state.flags.church_catechumen_day = -1;
    expect(performAction(state, "church_catechumen").ok).toBe(true);
    expect(state.inventory.bible_old_testament).toBe(1);
    expect(state.inventory.bible_new_testament).toBe(1);
  });
});
