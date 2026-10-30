// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { placeOrder, claimOrder } from "../src/game/core/orders";
import {
  acquireShopItem,
  inventoryGroupOf,
  getItem,
  repairOwnedItemAcquisitionState,
} from "../src/game/core/items";
import { storageLocationOf, storedItems } from "../src/game/core/storage";
import { facilityEfficiency } from "../src/game/core/facility";
import { applyNewGameSetup, emptyProfile, syncProfileEndings } from "../src/game/core/profile";
import { checkEnding } from "../src/game/core/endings";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { currentView, gameState, profile, markSessionClean, replaceState, settleEndingProfile } from "../src/stores/gameStore.svelte";
import type { Allocation, GameState } from "../src/game/types";

const saves = vi.hoisted(() => ({
  saveGame: vi.fn(async () => undefined),
  saveProfile: vi.fn(async () => undefined),
  saveProfileImmediately: vi.fn(() => true),
}));
vi.mock("../src/lib/save", () => ({ saveGame: saves.saveGame }));
vi.mock("../src/lib/profile", () => ({
  loadProfile: vi.fn(async () => emptyProfile()),
  saveProfile: saves.saveProfile,
  saveProfileImmediately: saves.saveProfileImmediately,
}));

const zeroAllocation: Allocation = { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 };

function order(state: GameState, kind: "takeout" | "shop", itemId: string): string {
  const result = placeOrder(state, { kind, itemId, price: 10, etaDays: 0 });
  expect(result.ok).toBe(true);
  return state.orders.at(-1)!.id;
}

afterEach(() => {
  Object.assign(profile, emptyProfile());
  currentView.name = "menu";
  markSessionClean();
  saves.saveGame.mockClear();
  saves.saveProfile.mockClear();
  saves.saveProfileImmediately.mockReset().mockReturnValue(true);
});

describe("v1.475 获取物品与永久图鉴回归", () => {
  it("可直接食用的农场食材领取后归入背包，仍可用于烹饪", () => {
    const state = createInitialState(147501);
    state.player.money = 100;
    const id = order(state, "takeout", "farm_milk");

    expect(claimOrder(state, id).ok).toBe(true);
    const milk = getItem("farm_milk")!;
    expect(state.inventory.farm_milk).toBe(1);
    expect(inventoryGroupOf(milk)).toBe("consumables");
    expect(storageLocationOf(milk)).toBe("backpack");
    expect(storedItems(state, "backpack").some(({ item }) => item.id === "farm_milk")).toBe(true);
    expect(storedItems(state, "home").some(({ item }) => item.id === "farm_milk")).toBe(false);
  });

  it("网购手机首次领取时登记手机 flag 与主题", () => {
    const state = createInitialState(147502);
    state.player.money = 100;
    const id = order(state, "shop", "phone_flower");

    expect(claimOrder(state, id).ok).toBe(true);
    expect(state.inventory.phone_flower).toBe(1);
    expect(state.flags.item_phone_flower).toBe(true);
    expect(state.phoneSkin).toBe("flower");
  });

  it("名表入账并发放一次属性与奢侈品记录，重复领取不重复奖励", () => {
    const state = createInitialState(147503);
    state.player.money = 100;
    const charm = state.player.stats.charm;
    const fame = state.player.stats.fame;
    const first = order(state, "shop", "luxury_watch");
    expect(claimOrder(state, first).ok).toBe(true);

    expect(state.inventory.luxury_watch).toBe(1);
    expect(state.economy.ownedLuxury).toContain("luxury_watch");
    expect(state.player.stats.charm).toBe(charm + 3);
    expect(state.player.stats.fame).toBe(fame + 5);

    const second = order(state, "shop", "luxury_watch");
    expect(claimOrder(state, second).ok).toBe(true);
    expect(state.inventory.luxury_watch).toBe(2);
    expect(state.economy.ownedLuxury.filter((id) => id === "luxury_watch")).toHaveLength(1);
    expect(state.player.stats.charm).toBe(charm + 3);
    expect(state.player.stats.fame).toBe(fame + 5);
  });

  it("旧档补回订单漏掉的手机主题、名表奖励和笔记本实体，重复迁移不重复发放", () => {
    const state = createInitialState(147504);
    state.inventory.phone_rice = 1;
    state.inventory.phone_flower = 1;
    state.inventory.luxury_watch = 1;
    state.flags.item_laptop = true;
    const charm = state.player.stats.charm;
    const fame = state.player.stats.fame;

    repairOwnedItemAcquisitionState(state);
    expect(state.phoneSkin).toBe("flower");
    expect(state.flags.item_phone_flower).toBe(true);
    expect(state.economy.ownedLuxury).toContain("luxury_watch");
    expect(state.player.stats.charm).toBe(charm + 3);
    expect(state.player.stats.fame).toBe(fame + 5);
    expect(state.inventory.laptop).toBe(1);
    expect(state.equipped.tool).toBe("laptop");
    expect(facilityEfficiency(state, "dev")).toBe(1);

    repairOwnedItemAcquisitionState(state);
    expect(state.player.stats.charm).toBe(charm + 3);
    expect(state.player.stats.fame).toBe(fame + 5);
    expect(state.inventory.laptop).toBe(1);
  });

  it("当前版直读档与 v31→v32 迁移都会修复旧物品权益且只修一次", () => {
    for (const version of [31, 32]) {
      const legacy = createInitialState(147508);
      legacy.version = version;
      legacy.inventory.phone_flower = 1;
      legacy.inventory.luxury_watch = 1;
      legacy.flags.item_laptop = true;
      const charm = legacy.player.stats.charm;
      const fame = legacy.player.stats.fame;

      const migrated = migrateSave(legacy);
      expect(migrated.version).toBe(SAVE_VERSION);
      expect(migrated.phoneSkin).toBe("flower");
      expect(migrated.economy.ownedLuxury).toContain("luxury_watch");
      expect(migrated.inventory.laptop).toBe(1);
      expect(migrated.player.stats.charm).toBe(charm + 3);
      expect(migrated.player.stats.fame).toBe(fame + 5);

      const reopened = migrateSave(migrated);
      expect(reopened.inventory.laptop).toBe(1);
      expect(reopened.player.stats.charm).toBe(charm + 3);
      expect(reopened.player.stats.fame).toBe(fame + 5);
    }
  });

  it("新局选择笔记本会获得实体并启用工具装备效果", () => {
    const state = createInitialState(147505);
    applyNewGameSetup(state, "ordinary", zeroAllocation, ["laptop"], emptyProfile(), "normal");

    expect(state.flags.item_laptop).toBe(true);
    expect(state.inventory.laptop).toBe(1);
    expect(state.equipped.tool).toBe("laptop");
    expect(facilityEfficiency(state, "dev")).toBe(1);
  });

  it("好结局并入永久图鉴时不发命运点，重复同步保持幂等", () => {
    const state = createInitialState(147506);
    state.player.money = 100000;
    expect(checkEnding(state)).toBeNull();
    expect(state.unlockedEndings).toContain("ending_rich");

    const archive = emptyProfile();
    expect(syncProfileEndings(archive, state)).toBe(true);
    expect(syncProfileEndings(archive, state)).toBe(false);
    expect(archive.unlockedEndings).toEqual(["ending_rich"]);
    expect(archive.fatePoints).toBe(0);
    expect(archive.memoirs).toHaveLength(0);
  });

  it("读档恢复旧版好结局时同步跨周目图鉴并持久化", () => {
    const state = createInitialState(147507);
    state.unlockedEndings = ["ending_rich"];
    replaceState(state);

    expect(profile.unlockedEndings).toContain("ending_rich");
    expect(saves.saveProfileImmediately).toHaveBeenCalledOnce();
  });

  it("结局档案写入失败时不误标已结算，写入恢复后只结算一次", () => {
    const state = createInitialState(147509);
    state.endingId = "ending_bankrupt";
    replaceState(state);
    saves.saveProfileImmediately.mockReturnValueOnce(false).mockReturnValueOnce(true);

    settleEndingProfile();
    expect(gameState.flags.fate_settled).toBeUndefined();
    expect(profile.fatePoints).toBe(0);
    expect(profile.memoirs).toHaveLength(0);

    settleEndingProfile();
    const settledPoints = profile.fatePoints;
    expect(settledPoints).toBeGreaterThan(0);
    expect(profile.memoirs).toHaveLength(1);
    expect(gameState.flags.fate_settled).toBe(true);

    settleEndingProfile();
    expect(profile.fatePoints).toBe(settledPoints);
    expect(profile.memoirs).toHaveLength(1);
  });
});
