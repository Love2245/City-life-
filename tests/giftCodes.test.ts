import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Load the engine's shared residence module first, matching the existing core test bootstrap order.
import { grantTempleStay } from "../src/game/core/residence";
import { createInitialState } from "../src/game/core/state";
import { submitForumComposer } from "../src/game/core/forumComposer";
import { installationId } from "../src/lib/installation";
import { normalizeGiftCodeInput, redeemGiftCode } from "../src/game/core/giftCodes";
import { allCitizens } from "../src/game/core/citizens";
import { addItem, applyItem, itemCount } from "../src/game/core/items";
import { loadGame, saveGameImmediately } from "../src/lib/save";
import {
  claimTempleGift,
  templeGiftClaimedThisWeek,
  TEMPLE_GIFT_OFFERS,
} from "../src/game/core/templeGiftShop";
void grantTempleStay;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const testLocalStorage = new MemoryStorage();

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: testLocalStorage });
});

afterAll(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("gift code redemption in the laptop forum composer", () => {
  it("normalizes case, whitespace, and full-width punctuation; awards CITY LIFE! once per install", () => {
    testLocalStorage.clear();
    expect(normalizeGiftCodeInput("CITY LIFE!")).toBe("city life!");
    expect(normalizeGiftCodeInput("city life！")).toBe("city life!");
    const installId = installationId();
    expect(installationId()).toBe(installId);

    const state = createInitialState();
    const result = submitForumComposer(state, "  CiTy   LiFe！  ");
    expect(result).toEqual({ kind: "redeemed", codeId: "city_life", amount: 1500 });
    expect(state.player.money).toBe(2000);
    expect(state.weekly.earned).toBe(1500);
    expect(state.flags.gift_code_city_life_redeemed).toBe(true);
    expect(state.social.posts).toHaveLength(0);

    const newSave = createInitialState();
    expect(submitForumComposer(newSave, "CITY LIFE!")).toEqual({ kind: "expired", codeId: "city_life" });
    expect(newSave.player.money).toBe(500);
    expect(newSave.social.posts).toHaveLength(0);
  });

  it("awards Love2245 once and leaves ordinary forum posts unchanged", () => {
    testLocalStorage.clear();
    const state = createInitialState();
    const ordinary = submitForumComposer(state, "今天公园里有一群小猫", "fun");
    expect(ordinary.kind).toBe("posted");
    if (ordinary.kind === "posted") {
      expect(ordinary.post.text).toBe("今天公园里有一群小猫");
      expect(ordinary.post.category).toBe("fun");
    }

    expect(submitForumComposer(state, "Love2245")).toEqual({ kind: "redeemed", codeId: "love2245", amount: 1500 });
    expect(state.player.money).toBe(2000);
    expect(state.weekly.earned).toBe(1500);
    expect(state.social.posts).toHaveLength(1);
    expect(state.social.posts[0].text).not.toBe("Love2245");
    expect(submitForumComposer(state, "love2245")).toEqual({ kind: "expired", codeId: "love2245" });
  });

  it("自动存档失败后同一人生可恢复兑换，成功落档后新人生不能重复领取", async () => {
    testLocalStorage.clear();
    const initial = createInitialState(771475);
    saveGameImmediately("auto", initial);

    const active = await loadGame("auto");
    expect(active).not.toBeNull();
    expect(redeemGiftCode(active!, "CITY LIFE!")).toEqual({
      kind: "redeemed",
      codeId: "city_life",
      amount: 1500,
    });

    const originalSetItem = testLocalStorage.setItem.bind(testLocalStorage);
    const failedAutoWrite = vi.spyOn(testLocalStorage, "setItem").mockImplementation((key, value) => {
      if (key === "urban_life_save_auto") throw new Error("quota");
      originalSetItem(key, value);
    });
    expect(() => saveGameImmediately("auto", active!)).toThrow("存档写入失败");
    failedAutoWrite.mockRestore();

    const recovered = await loadGame("auto");
    expect(recovered?.flags.gift_code_city_life_redeemed).toBeUndefined();
    expect(redeemGiftCode(recovered!, "CITY LIFE!")).toEqual({
      kind: "redeemed",
      codeId: "city_life",
      amount: 1500,
    });
    expect(recovered!.player.money).toBe(2000);

    saveGameImmediately("auto", recovered!);
    const freshLife = createInitialState(771476);
    expect(redeemGiftCode(freshLife, "CITY LIFE!")).toEqual({ kind: "expired", codeId: "city_life" });
    expect(freshLife.player.money).toBe(500);
  });
});

describe("1.498 forum rewards and mj replies", () => {
  it("grants the three cash rewards in cents and commits each code after saving", async () => {
    testLocalStorage.clear();
    const state = createInitialState(149831);
    state.player.money = 500.11;
    for (const [input, codeId, amount] of [[" GOOD   GAME ", "good_game", 200], ["SoDa", "soda", 200], ["６７６７", "bonus_6767", 676.7]] as const) {
      expect(submitForumComposer(state, input)).toEqual({ kind: "redeemed", codeId, amount });
      expect(submitForumComposer(state, input)).toEqual({ kind: "expired", codeId });
    }
    expect(state.player.money).toBe(1576.81);
    expect(state.weekly.earned).toBeCloseTo(1076.7, 6);
    expect(state.social.posts).toHaveLength(0);
    saveGameImmediately("auto", state);
    const loaded = await loadGame("auto");
    expect(loaded?.player.money).toBe(1576.81);
    const freshLife = createInitialState(149832);
    for (const input of ["good game", "soda", "6767"]) {
      expect(submitForumComposer(loaded!, input).kind).toBe("expired");
      expect(submitForumComposer(freshLife, input).kind).toBe("expired");
    }
    expect(freshLife.player.money).toBe(500);
  });

  it("grants the usable e-bike, persists ownership, and does not duplicate an existing bike", async () => {
    testLocalStorage.clear();
    const state = createInitialState(149833);
    expect(submitForumComposer(state, "ebike")).toMatchObject({ kind: "redeemed", amount: 0, itemId: "e_bike" });
    expect(state.flags.item_e_bike).toBe(true);
    expect(itemCount(state, "e_bike")).toBe(1);
    expect(state.player.money).toBe(500);
    saveGameImmediately("auto", state);
    const loaded = await loadGame("auto");
    expect(loaded?.flags.item_e_bike).toBe(true);
    expect(itemCount(loaded!, "e_bike")).toBe(1);
    expect(submitForumComposer(createInitialState(149834), "ebike").kind).toBe("expired");
    testLocalStorage.clear();
    const owner = createInitialState(149835);
    addItem(owner, "e_bike"); applyItem(owner, "e_bike");
    expect(submitForumComposer(owner, "ebike").kind).toBe("redeemed");
    expect(itemCount(owner, "e_bike")).toBe(1);
  });

  it("storage reservation failure never grants cash, a bike, or a consumed-code flag", () => {
    testLocalStorage.clear(); installationId();
    const state = createInitialState(149836);
    const write = vi.spyOn(testLocalStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      for (const code of ["6767", "ebike"]) expect(submitForumComposer(state, code).kind).toBe("unavailable");
      expect(state.player.money).toBe(500);
      expect(itemCount(state, "e_bike")).toBe(0);
      expect(state.flags.gift_code_6767_redeemed).toBeUndefined();
      expect(state.flags.gift_code_ebike_redeemed).toBeUndefined();
    } finally { write.mockRestore(); }
  });

  it("mj remains a normal post with one literal mj reply from every online citizen, including after load", async () => {
    testLocalStorage.clear();
    const state = createInitialState(149837);
    const result = submitForumComposer(state, "mj", "fun");
    expect(result.kind).toBe("posted");
    if (result.kind !== "posted") throw new Error("mj post missing");
    expect(result.post.text).toBe("mj");
    expect(result.post.category).toBe("fun");
    expect(result.post.comments?.map(c => c.authorId)).toEqual(allCitizens().map(c => c.id));
    expect(result.post.comments?.every(c => c.text === "mj")).toBe(true);
    expect(new Set(result.post.comments?.map(c => c.id)).size).toBe(allCitizens().length);
    expect(state.player.money).toBe(500);
    saveGameImmediately("auto", state);
    const loaded = await loadGame("auto");
    const post = loaded!.social.posts.find(p => p.id === result.post.id)!;
    expect(post.text).toBe("mj");
    expect(post.comments).toHaveLength(allCitizens().length);
    expect(post.comments?.every(c => c.text === "mj")).toBe(true);
    expect(submitForumComposer(state, "mj").kind).toBe("posted");
    const normal = submitForumComposer(state, "今天聊聊 mj");
    expect(normal.kind).toBe("posted");
    if (normal.kind === "posted") expect(normal.post.comments?.length ?? 0).toBe(0);
  });
});

describe("temple weekly free gifts", () => {
  it("allows one catalog gift each seven-day game week and persists the claim in save flags", () => {
    const state = createInitialState();
    state.locationId = "temple";
    const firstId = TEMPLE_GIFT_OFFERS[0].itemId;
    const secondId = TEMPLE_GIFT_OFFERS[1].itemId;

    expect(claimTempleGift(state, firstId).ok).toBe(true);
    expect(state.inventory[firstId]).toBe(1);
    expect(templeGiftClaimedThisWeek(state)).toBe(true);
    expect(claimTempleGift(state, secondId)).toMatchObject({ ok: false });
    expect(state.inventory[secondId]).toBeUndefined();

    state.time.day += 7;
    expect(templeGiftClaimedThisWeek(state)).toBe(false);
    expect(claimTempleGift(state, secondId).ok).toBe(true);
    expect(state.inventory[secondId]).toBe(1);
  });

  it("only grants listed gifts while the player is at the temple", () => {
    const state = createInitialState();
    expect(claimTempleGift(state, TEMPLE_GIFT_OFFERS[0].itemId)).toMatchObject({ ok: false });
    state.locationId = "temple";
    expect(claimTempleGift(state, "made_up_temple_item")).toMatchObject({ ok: false });
  });
});
