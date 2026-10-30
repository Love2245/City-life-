import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { equipItem, unequipItem } from "../src/game/core/equipment";
import {
  checkoutClothing,
  equippedClothing,
  ensureWardrobeDefaults,
} from "../src/game/core/clothing";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { outfitContextForNpc } from "../src/game/core/npcOutfits";
import { npcPortraitForContext, playerPortraitForReply } from "../src/game/core/npcPortraits";
import { clothingCatalog, clothingStoreCatalog, clothingStoreItemsForSlot } from "../src/game/core/clothing";

describe("v1.45 穿搭系统", () => {
  it("新档拥有基础衣柜，默认穿白背心、青色外套和黑裤子", () => {
    const state = createInitialState(7);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.inventory.white_vest).toBe(1);
    expect(state.inventory.underlayer_white).toBe(1);
    expect(state.inventory.black_pants).toBe(1);
    expect(state.inventory.cyan_jacket).toBe(1);
    expect(state.equipped).toMatchObject({ clothes: "cyan_jacket", underlayer: "underlayer_white", pants: "black_pants" });
  });

  it("套装整体替换，帽子独立，服装魅力加成只保留当前套装", () => {
    const state = createInitialState(7);
    state.inventory.shirt = 1;
    state.inventory.suit = 1;
    state.inventory.baseball_cap = 1;
    state.inventory.jeans = 1;
    const baseCharm = state.player.stats.charm;

    expect(equipItem(state, "shirt").ok).toBe(true);
    expect(state.player.stats.charm).toBe(baseCharm + 2);
    expect(equipItem(state, "suit").ok).toBe(true);
    expect(state.player.stats.charm).toBe(baseCharm + 5);
    expect(equipItem(state, "baseball_cap").ok).toBe(true);
    expect(equipItem(state, "jeans").ok).toBe(false);
    expect(equippedClothing(state)).toMatchObject({ hat: "baseball_cap", clothes: "suit", pants: "black_pants" });

    expect(unequipItem(state, "hat").ok).toBe(true);
    expect(state.equipped.hat).toBeUndefined();
    expect(state.equipped.clothes).toBe("suit");
    expect(unequipItem(state, "clothes").ok).toBe(true);
    expect(state.equipped.clothes).toBe("white_vest");
    expect(state.player.stats.charm).toBe(baseCharm);
  });

  it("服装店结算在余额不足时完全不改变状态，成功时一次性入包并穿上", () => {
    const state = createInitialState(7);
    state.locationId = "clothing_store";
    state.player.money = 250;
    const before = JSON.stringify({ money: state.player.money, inventory: state.inventory, equipped: state.equipped });
    const rejected = checkoutClothing(state, ["baseball_cap", "jeans"]);
    expect(rejected.ok).toBe(false);
    expect(JSON.stringify({ money: state.player.money, inventory: state.inventory, equipped: state.equipped })).toBe(before);

    state.player.money = 2000;
    const accepted = checkoutClothing(state, ["baseball_cap", "jeans"]);
    expect(accepted.ok).toBe(true);
    expect(accepted.purchasedIds).toEqual(["navy_hoodie", "jeans", "baseball_cap"]);
    expect(state.player.money).toBe(1624);
    expect(state.inventory.baseball_cap).toBe(1);
    expect(state.inventory.jeans).toBe(1);
    expect(state.equipped.hat).toBe("baseball_cap");
    expect(state.equipped.pants).toBe("jeans");
  });

  it("v29 存档迁移到 v31 时补齐衣柜但不重复计算旧衣服加成", () => {
    const state = createInitialState(7);
    state.version = 29;
    state.inventory = { phone: 1, shirt: 1 };
    state.equipped = { clothes: "shirt" };
    state.player.stats.charm = 37;

    const migrated = migrateSave(state);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.inventory.white_vest).toBe(1);
    expect(migrated.inventory.black_pants).toBe(1);
    expect(migrated.inventory.cyan_jacket).toBe(1);
    expect(migrated.inventory.underlayer_white).toBe(1);
    expect(migrated.equipped.clothes).toBe("shirt");
    expect(migrated.equipped.pants).toBe("plain_gray_pants");
    expect(migrated.equipped.underlayer).toBe("underlayer_white");
    expect(migrated.player.stats.charm).toBe(37);
  });

  it("NPC 根据地点返回场景服装上下文，缺少场景资源时回退到现有立绘", () => {
    expect(outfitContextForNpc("npc_wang_lei", "park", { weekday: 0, hour: 10 })).toBe("outdoor");
    expect(outfitContextForNpc("npc_pharmacist", "clinic", { weekday: 0, hour: 10 })).toBe("medical");
    const portrait = npcPortraitForContext("npc_wang_lei", "outdoor", "default");
    expect(portrait.source).toBeTruthy();
    expect(npcPortraitForContext("npc_zhao_gang", "casual", "default").source).toContain("npc_outfits");
    expect(npcPortraitForContext("npc_wang_lei", "casual", "default").source).toContain("npc_outfits");
  });

  it("NPC 场景服装以实际排班为准，不随机跨场景套用", () => {
    expect(outfitContextForNpc("npc_zhao_gang", "labor_market", { weekday: 2, hour: 10 })).toBe("retail");
    expect(outfitContextForNpc("npc_zhao_gang", "snack_street", { weekday: 6, hour: 18 })).toBe("casual");
    expect(outfitContextForNpc("npc_wang_lei", "hospital", { weekday: 4, hour: 15 })).toBe("casual");
    expect(outfitContextForNpc("npc_flower_market_owner", "amusement_park", { weekday: 6, hour: 12 })).toBe("casual");
    expect(outfitContextForNpc("npc_chen_jie", "market", { weekday: 6, hour: 10 })).toBe("service");
  });

  it("当前版本旧字段缺失时也能补齐默认衣柜", () => {
    const state = createInitialState(7);
    state.inventory = { phone: 1 };
    state.equipped = {};
    ensureWardrobeDefaults(state);
    expect(state.equipped).toMatchObject({ clothes: "white_vest", underlayer: "underlayer_white", pants: "black_pants" });
    expect(state.inventory.cyan_jacket).toBe(1);
  });

  it("主角换装会解析到真实透明层，而不是回退到旧整身图", () => {
    const defaultPortrait = npcPortraitForContext("npc_wang_lei", "outdoor", "default");
    expect(defaultPortrait.source).toContain("npc_outfits");

    const base = { hat: undefined, clothes: "white_vest", underlayer: "underlayer_white", pants: "black_pants" } as const;
    const jacket = { ...base, clothes: "cyan_jacket" };
    const cap = { ...base, hat: "baseball_cap" };
    const defaultPlayer = playerPortraitForReply(undefined, base);
    const jacketPlayer = playerPortraitForReply(undefined, jacket);
    const capPlayer = playerPortraitForReply(undefined, cap);

    expect(defaultPlayer.layers?.length).toBe(1);
    expect(jacketPlayer.layers?.length).toBe(1);
    expect(capPlayer.layers?.length).toBe(2);
    expect(jacketPlayer.layers?.[0]).not.toBe(defaultPlayer.layers?.[0]);
    expect(capPlayer.layers?.[1]).toBeTruthy();
    expect(capPlayer.layerTransforms).toEqual(["", "translateX(.7%) scale(.88,.98)"]);
    expect(jacketPlayer.layerTransforms).toEqual([""]);
    expect(playerPortraitForReply(undefined, { ...base, hat: "knit_cap" }).layerTransforms).toEqual(["", ""]);
    expect(clothingCatalog().every((item) => item.outfitLayer)).toBe(true);
    expect(clothingCatalog().some((item) => item.id === "farm_workwear")).toBe(true);
  });

  it("参考图中的每个服装部件都进入服装店目录", () => {
    const storeIds = new Set(clothingStoreCatalog().map((item) => item.id));
    expect([...storeIds]).toEqual(expect.arrayContaining([
      "pinstripe_shirt",
      "taupe_double_suit",
      "cable_knit_sweater",
      "cream_relaxed_shirt",
      "blue_collared_shirt",
      "brown_wide_trousers",
      "taupe_suit_trousers",
      "charcoal_relaxed_jeans",
      "sage_wide_trousers",
    ]));
    expect(clothingStoreItemsForSlot("clothes").map((item) => item.id)).toEqual(
      expect.arrayContaining(["pinstripe_shirt", "taupe_double_suit", "cable_knit_sweater", "cream_relaxed_shirt"]),
    );
    expect(clothingStoreItemsForSlot("underlayer").map((item) => item.id)).toContain("blue_collared_shirt");
    expect(clothingStoreItemsForSlot("pants").map((item) => item.id)).toEqual(
      expect.arrayContaining(["brown_wide_trousers", "taupe_suit_trousers", "charcoal_relaxed_jeans", "sage_wide_trousers"]),
    );
  });

  it("玩家立绘始终以实际穿搭为准；缺少动作差分时整套回退同一服装的默认姿势", () => {
    const base = { hat: undefined, clothes: "white_vest", underlayer: "underlayer_white", pants: "black_pants" } as const;
    const replies = ["谢谢", "为什么", "（抱臂。）", "（叉腰。）", "（托腮。）", "（耸肩。）"];
    for (const item of clothingCatalog()) {
      const outfit = { ...base, [item.slot]: item.id };
      for (const reply of replies) {
        const portrait = playerPortraitForReply(reply, outfit);
        expect(portrait.layers, `${item.id} / ${reply} should use outfit layers`).toBeTruthy();
        expect(portrait.source, `${item.id} / ${reply} must not use a legacy full-body action image`).toBeNull();
        expect(portrait.layers?.[0]).toContain(`/outfit-sets-v1/${outfit.clothes}.png`);
        const pose = portrait.variant;expect(pose).toBe('default');
        if (item.id === "sports_shorts") expect(pose).toBe("default");
      }
    }
  });
});
