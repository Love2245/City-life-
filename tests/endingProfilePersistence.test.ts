// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProfile } from "../src/game/core/profile";
import { createInitialState } from "../src/game/core/state";
import {
  gameState,
  profile,
  newGame,
  replaceState,
  settleEndingProfile,
} from "../src/stores/gameStore.svelte";
import { checkEnding } from "../src/game/core/endings";

const PROFILE_KEY = "urban_life_profile";

afterEach(() => {
  Object.assign(profile, emptyProfile());
  replaceState(createInitialState(47503));
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("结局奖励档案写入失败恢复", () => {
  it("档案保存失败时不置已结算，恢复存储后可完整重试一次", () => {
    Object.assign(profile, { ...emptyProfile(), fatePoints: 5 });
    const state = createInitialState(47504);
    state.endingId = "ending_bankrupt";
    replaceState(state);

    const originalSetItem = Storage.prototype.setItem;
    const failProfileWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === PROFILE_KEY) throw new Error("quota");
      return originalSetItem.call(this, key, value);
    });
    settleEndingProfile();

    expect(gameState.flags.fate_settled).toBeUndefined();
    expect(profile.fatePoints).toBe(5);
    expect(profile.memoirs).toHaveLength(0);

    failProfileWrite.mockRestore();
    settleEndingProfile();
    expect(gameState.flags.fate_settled).toBe(true);
    expect(profile.fatePoints).toBeGreaterThan(5);
    expect(profile.memoirs).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!).fatePoints).toBe(profile.fatePoints);

    settleEndingProfile();
    expect(profile.memoirs).toHaveLength(1);
  });

  it("好结局里程碑会在立即开启新生活前写入永久档案", () => {
    Object.assign(profile, emptyProfile());
    const state = createInitialState(47505);
    state.player.money = 100000;
    replaceState(state);

    checkEnding(gameState);
    expect(gameState.unlockedEndings).toContain("ending_rich");
    expect(gameState.endingId).toBeNull();

    newGame({
      familyId: "ordinary",
      allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
      ownedItems: [],
      mode: "normal",
    });

    expect(profile.unlockedEndings).toContain("ending_rich");
    expect(gameState.unlockedEndings).toContain("ending_rich");
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!).unlockedEndings).toContain("ending_rich");
  });
});
