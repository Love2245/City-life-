import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { checkoutClothing, clothingCatalog, clothingPrice, clothingStoreCatalog, clothingTryOnItemsForSlot, ensureWardrobeDefaults } from "../src/game/core/clothing";
import { resolvePlayerOutfit } from "../src/game/core/playerOutfitResolver";
import { migrateSave } from "../src/game/core/migrate";
import { actionsOf, canPerform, getAction, performAction } from "../src/game/core/actions";
import { playerPortraitForReply } from "../src/game/core/npcPortraits";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sourceManifest from "./fixtures/clothing-source-manifest.json";
import clothingPriceContract from "./fixtures/clothing-market-prices.json";
import type { ActionDef } from "../src/game/types";

describe("服装店分店和结算", () => {
  it("三店都能打开各自试衣间，旧衬衫购买归街角衣橱", () => {
    const state = createInitialState(7);
    state.time.hour = 12;
    state.player.money = 10000;
    for (const store of ["clothing_store", "budget_clothing_store", "luxury_store"]) {
      state.locationId = store;
      const entries = actionsOf(store).filter((action) => action.handler === "open_clothing_store");
      expect(entries).toHaveLength(1);
      expect(canPerform(state, entries[0]).ok).toBe(true);
    }
    expect(getAction("buy_shirt")?.locationId).toBe("clothing_store");
    state.locationId = "clothing_store";
    expect(performAction(state, "buy_shirt").ok).toBe(true);
    expect(state.equipped.clothes).toBe("shirt");
  });
  it("三店目录不重叠，奢侈店专售正装，平价店提供纯色基础款", () => {
    const ids = (store: string) => clothingStoreCatalog(store).map((item) => item.id);
    const luxury = ids("luxury_store");
    const normal = ids("clothing_store");
    const budget = ids("budget_clothing_store");
    expect(luxury).toEqual(expect.arrayContaining(["suit", "taupe_double_suit", "luxury_coat", "taupe_suit_trousers"]));
    expect(normal).toEqual(expect.arrayContaining(["pinstripe_shirt", "cable_knit_sweater", "cream_relaxed_shirt"]));
    expect(budget).toEqual(expect.arrayContaining(["plain_white_tee", "plain_black_tee", "plain_gray_tee", "plain_gray_pants", "black_pants"]));
    const all = [...luxury, ...normal, ...budget];
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("factory_uniform");
    expect(all).not.toContain("cyan_jacket");
    expect(ids("unknown")).toEqual([]);
  });

  it("跨店混合订单或在家购物整体拒绝，状态不变", () => {
    const state = createInitialState(7);
    state.player.money = 50000;
    state.locationId = "budget_clothing_store";
    const before = JSON.stringify(state);
    expect(checkoutClothing(state, ["plain_white_tee", "taupe_suit_trousers"]).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    state.locationId = "home";
    expect(checkoutClothing(state, ["plain_white_tee"]).ok).toBe(false);
    state.locationId = "clothing_store";
    expect(checkoutClothing(state, ["factory_uniform"]).ok).toBe(false);
  });

  it("基础款可购买且不重复收费，支持自有正装和工作奖励", () => {
    const state = createInitialState(7);
    state.locationId = "budget_clothing_store";
    state.player.money = 1000;
    const result = checkoutClothing(state, ["plain_black_tee"]);
    expect(result).toMatchObject({ ok: true, total: 288 });
    expect(state.player.money).toBe(712);
    expect(checkoutClothing(state, ["plain_black_tee"]).total).toBe(0);
    expect(state.inventory.plain_black_tee).toBe(1);
    state.inventory.suit = 1;
    state.inventory.factory_uniform = 1;
    expect(clothingTryOnItemsForSlot(state, "clothes").map((item) => item.id)).toEqual(expect.arrayContaining(["suit", "factory_uniform"]));
    expect(checkoutClothing(state, ["suit"]).total).toBe(0);
    expect(state.equipped.clothes).toBe("suit");
    expect(checkoutClothing(state, ["factory_uniform"]).ok).toBe(true);
  });

  it("摘帽只在结算成功时执行，重复槽位订单不改变装备", () => {
    const state = createInitialState(7);
    state.locationId = "budget_clothing_store";
    state.inventory.baseball_cap = 1;
    state.equipped.hat = "baseball_cap";
    expect(checkoutClothing(state, ["suit"], { removeHat: true }).ok).toBe(false);
    expect(state.equipped.hat).toBe("baseball_cap");
    expect(checkoutClothing(state, ["white_vest"], { removeHat: true }).ok).toBe(true);
    expect(state.equipped.hat).toBeUndefined();
    const before = JSON.stringify(state);
    expect(checkoutClothing(state, ["white_vest", "cyan_jacket"]).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("旧档保留跨店服装、补回已装备库存且修复错槽", () => {
    const state = createInitialState(7);
    state.version = 29;
    state.equipped = { clothes: "taupe_double_suit", pants: "suit" };
    state.inventory = {};
    const migrated = migrateSave(state);
    ensureWardrobeDefaults(migrated);
    expect(migrated.equipped.clothes).toBe("taupe_double_suit");
    expect(migrated.inventory.taupe_double_suit).toBe(1);
    expect(migrated.equipped.pants).toBe("taupe_suit_trousers");
  });

  it("旧的单件购买入口也不能越过供应目录", () => {
    const state = createInitialState(7);
    const action = { id: "bad_vendor", handler: "buy_item", itemId: "suit", locationId: "clothing_store" } as ActionDef;
    expect(canPerform(state, action)).toMatchObject({ ok: false, reason: "这家店不出售这件服装" });
  });

  it("服装价格表保留原有衣物 ID 与槽位，基准价和通胀价一致", () => {
    const contract = clothingPriceContract.map((item) => ({ ...item })).sort((a, b) => a.id.localeCompare(b.id));
    const catalog = clothingCatalog()
      .map(({ id, slot, shopPrice }) => ({ id, slot, shopPrice: shopPrice ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(catalog).toEqual(contract);

    const state = createInitialState(7);
    for (const item of clothingCatalog()) {
      expect(clothingPrice(state, item)).toBe(item.shopPrice ?? 0);
    }
    state.economy.priceIndex = 1.5;
    for (const item of clothingCatalog()) {
      expect(clothingPrice(state, item)).toBe(Math.round((item.shopPrice ?? 0) * 1.5));
    }

    for (const [actionId, itemId] of [["buy_luxury_coat", "luxury_coat"], ["buy_shirt", "shirt"], ["buy_suit", "suit"]]) {
      const basePrice = clothingPriceContract.find((item) => item.id === itemId)?.shopPrice;
      expect(getAction(actionId)?.effects?.money).toBe(-basePrice!);
      expect(getAction(actionId)?.requirements?.money).toBe(basePrice);
    }
  });
});

describe("已安装的 AI 服装资源", () => {
  it("11 件独立 RGBA 图片已安装，且旧动作没有混进默认图目录", () => {
    const hashes = new Set<string>();
    for (const asset of sourceManifest.assets) {
      const path = resolve(asset.target);
      const png = readFileSync(path);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1024);
      expect(png.readUInt32BE(20)).toBe(1536);
      expect(png[25]).toBe(6); // PNG RGBA, not RGB-only faux transparency.
      hashes.add(createHash("sha256").update(png).digest("hex"));
      expect(readdirSync(resolve(path, "..")).filter((name) => name.endsWith(".png"))).toEqual(["default.png"]);
    }
    expect(hashes.size).toBe(11);
  });

  it.each(sourceManifest.assets.map((asset) => asset.id))("%s 在所有回答动作中使用完整默认姿势而非旧图", (id) => {
    const outfit = { hat: "baseball_cap", clothes: id === "plain_gray_pants" ? "cyan_jacket" : id, underlayer: "underlayer_white", pants: id === "plain_gray_pants" ? id : "black_pants" };
    for (const reply of [undefined, "谢谢", "为什么", "不用", "当然可以"]) {
      const portrait = playerPortraitForReply(reply, outfit);
      expect(portrait.variant).toBe("default");
      expect(portrait.layers).toHaveLength(2);
      expect(portrait.layers?.[0]).toContain("/outfit-sets-v1/");
      expect(portrait.layers?.[0]).toContain(`${outfit.clothes}.png`);
      expect(portrait.layers?.some((path) => path.includes("asset-archive"))).toBe(false);
    }
  });
});

describe("真实服装立绘解析", () => {
  const root = "/src/assets/portraits/player";
  const outfit = { hat: undefined, clothes: "shirt_item", underlayer: "inner", pants: "pants" };
  const garments = { shirt_item: "real_shirt", inner: "inner", pants: "pants", cap: "cap" };
  const bases = { [`${root}/base/default.png`]: "base-default", [`${root}/base/action_shrug.png`]: "base-shrug" };
  const layers = Object.fromEntries(["real_shirt", "inner", "pants", "cap"].map((id) => [`${root}/layers/${id}/default.png`, `${id}-default`]));

  it("按 outfitLayer 解析独立服装，缺动作时整套回退默认姿势", () => {
    const mixed = { ...layers, [`${root}/layers/pants/action_shrug.png`]: "pants-shrug" };
    expect(resolvePlayerOutfit("action_shrug", outfit, bases, mixed, garments)).toMatchObject({ variant: "default", layers: ["base-default", "pants-default", "inner-default", "real_shirt-default"] });
  });

  it("聊天与衣柜统一姿势和图层次序，帽子不会无声消失", () => {
    const posed = { ...layers, ...Object.fromEntries(Object.keys(layers).map((path) => [path.replace("default.png", "action_shrug.png"), path])) };
    const result = resolvePlayerOutfit("action_shrug", { ...outfit, hat: "cap" }, bases, posed, garments);
    expect(result?.variant).toBe("default");
    expect(result?.layers).toHaveLength(5);
    expect(result?.layers[4]).toBe("cap-default");
    expect(result?.layers[0]).toBe("base-default");
    expect(resolvePlayerOutfit("default", { ...outfit, hat: "missing" }, bases, layers, garments)).toBeUndefined();
  });
});
