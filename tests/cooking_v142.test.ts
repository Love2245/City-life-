import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  RECIPES,
  canCook,
  cookFreeform,
  matchFreeformRecipe,
  recipeList,
} from "../src/game/core/cooking";
import {
  FRIDGE_TIERS,
  canInstallFridge,
  canStoreInFridge,
  fridgeRemainingSlots,
  fridgeUsedSlots,
  installFridge,
  removeCookingItem,
  storeInFridge,
} from "../src/game/core/fridge";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";

function cookingState() {
  const state = createInitialState(42);
  state.flags["cook_utensil"] = true;
  state.living.mode = "lease";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = { housingId: "old_apartment", rent: 100, rentGrowthCount: 0 };
  return state;
}

describe("v1.42 自由烹饪菜谱", () => {
  it("保留首发 24 道菜并追加统一烹饪的泡面", () => {
    expect(recipeList()).toHaveLength(25);
    for (const id of ["pudding", "egg_tart", "stir_fried_vegetables", "salt_vegetables", "salad", "small_stir_fry", "tomato_egg", "egg_fried_rice", "potato_beef", "spicy_chicken", "onion_beef", "mushroom_egg", "cabbage_pork", "chicken_rice", "pork_rice", "sweet_milk_rice_porridge"]) {
      expect(RECIPES.some((recipe) => recipe.id === id)).toBe(true);
    }
    expect(RECIPES.at(-1)?.id).toBe('instant_noodles');
  });

  it("匹配顺序不敏感，配方所需食材/调料包含在投入中即可生效", () => {
    expect(matchFreeformRecipe(["milk", "egg"], [])?.id).toBe("pudding");
    expect(matchFreeformRecipe(["egg", "milk", "egg"], ["sugar"])?.id).toBe("egg_tart");
    expect(matchFreeformRecipe(["tomato", "egg"], ["salt"])?.id).toBe("tomato_egg");
    expect(matchFreeformRecipe(["milk", "milk", "milk"], ["soy_sauce"])).toBeUndefined();
    expect(matchFreeformRecipe(["egg", "milk"], ["salt"])?.id).toBe("pudding");
  });

  it("菜谱使用明确的具体食材，旧泛称库存兼容卷心菜和猪肉", () => {
    expect(matchFreeformRecipe(["carrot", "cabbage", "onion"], [])?.id).toBe("stir_fried_vegetables");
    expect(matchFreeformRecipe(["farm_vegetable"], ["salt"])?.id).toBe("salt_vegetables");
    expect(matchFreeformRecipe(["carrot", "onion", "meat"], ["soy_sauce"])?.id).toBe("small_stir_fry");
  });

  it("背包和冰箱混合取料，成功后永久解锁并消耗投入", () => {
    const state = cookingState();
    installFridge(state, "small");
    state.inventory.milk = 1;
    expect(storeInFridge(state, "egg", 1)).toBe(true);
    const result = cookFreeform(state, ["milk", "egg"], []);
    expect(result.ok).toBe(true);
    expect(result.recipe?.id).toBe("pudding");
    expect(state.inventory.milk).toBeUndefined();
    expect(state.fridge.items.egg).toBeUndefined();
    expect(state.cooking.unlockedRecipeIds).toContain("pudding");
    // 老 id 仍按类别兼容旧行动/旧存档。
    state.inventory.farm_milk = 1;
    state.inventory.farm_egg = 1;
    expect(canCook(state, "dish_full_meal").ok).toBe(false);
    expect(removeCookingItem(state, "farm_milk")).toBe(true);
  });

  it("未知组合是失败作品：消耗食材和调料但不解锁菜谱", () => {
    const state = cookingState();
    state.inventory.milk = 3;
    state.inventory.soy_sauce = 1;
    const before = [...state.cooking.unlockedRecipeIds];
    const result = cookFreeform(state, ["milk", "milk", "milk"], ["soy_sauce"]);
    expect(result.ok).toBe(true);
    expect(result.failed).toBe(true);
    expect(state.inventory.milk).toBeUndefined();
    expect(state.inventory.soy_sauce).toBeUndefined();
    expect(state.cooking.unlockedRecipeIds).toEqual(before);
  });
});

describe("v1.42 冰箱容量与迁移", () => {
  it("三档容量正确，成品占两格，满格预检不改状态", () => {
    const state = cookingState();
    expect(fridgeRemainingSlots(state)).toBe(0);
    expect(installFridge(state, "small").price).toBe(FRIDGE_TIERS.small.price);
    for (let i = 0; i < 18; i++) expect(storeInFridge(state, `tomato_${i}`, 1)).toBe(true);
    expect(fridgeUsedSlots(state)).toBe(18);
    expect(canStoreInFridge(state, "cooked:pudding", 1)).toBe(true);
    expect(storeInFridge(state, "cooked:pudding", 1)).toBe(true);
    expect(fridgeUsedSlots(state)).toBe(20);
    const money = state.player.money;
    const items = JSON.stringify(state.fridge.items);
    expect(canStoreInFridge(state, "salt", 1)).toBe(false);
    expect(state.player.money).toBe(money);
    expect(JSON.stringify(state.fridge.items)).toBe(items);
  });

  it("升级只补差价、保留库存且拒绝降级", () => {
    const state = cookingState();
    state.player.money = 1500;
    expect(installFridge(state, "small").ok).toBe(true);
    storeInFridge(state, "tomato", 1);
    const money = state.player.money;
    expect(installFridge(state, "medium")).toMatchObject({ ok: true, price: 400 });
    expect(state.player.money).toBe(money - 400);
    expect(state.fridge.items.tomato).toBe(1);
    expect(canInstallFridge(state, "small").ok).toBe(false);
  });

  it("v28 旧档迁移自动补齐 v29 冰箱、烹饪与 v1.45 穿搭字段", () => {
    const old = { ...createInitialState(7), version: 28, fridge: undefined, cooking: undefined } as unknown as Record<string, unknown>;
    const migrated = migrateSave(old);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.fridge).toEqual({ tier: null, items: {} });
    expect(migrated.cooking.unlockedRecipeIds).toEqual([]);
    expect(migrated.inventory).toBeDefined();
    expect(migrated.inventory).toMatchObject({ white_vest: 1, black_pants: 1, cyan_jacket: 1 });
    expect(migrated.rng).toBeDefined();
  });
});
