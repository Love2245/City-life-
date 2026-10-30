import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { signLease } from '../src/game/core/housing';
import { getItem } from '../src/game/core/items';
import { FRIDGE_TIERS, cookingStock, fridgeUsedSlots, installFridge } from '../src/game/core/fridge';
import { RECIPES, cookFreeform, matchFreeformRecipe, selectKnownRecipeIngredients, settlePendingCook, storedMealBatches } from '../src/game/core/cooking';
import { getAction, performAction, purchasePriceOf, visibleActionsAtLocation } from '../src/game/core/actions';
import { isFacilityProduct } from '../src/game/core/facilityShopping';
import { migrateSave } from '../src/game/core/migrate';

function kitchen() {
  const state = createInitialState(498);
  state.player.money = 10000;
  expect(signLease(state, 'old_apartment').ok).toBe(true);
  expect(installFridge(state, 'small').ok).toBe(true);
  state.flags.cook_utensil = true;
  state.player.skills.cooking = 6;
  return state;
}

describe('具体食材与已知菜谱', () => {
  it('每道菜都有可购买的具体食材，精确投入能独立发现相应菜谱', () => {
    for (const recipe of RECIPES) {
      const ingredients = Object.entries(recipe.ingredientCategories ?? {}).flatMap(([id, count]) => Array(count).fill(id));
      expect(ingredients.length, recipe.id).toBeGreaterThan(0);
      expect(ingredients.length, recipe.id).toBeLessThanOrEqual(3);
      expect(ingredients, recipe.id).not.toContain('vegetable');
      expect(ingredients, recipe.id).not.toContain('meat');
      expect(matchFreeformRecipe(ingredients, recipe.seasonings ?? [])?.id, recipe.id).toBe(recipe.id);
    }
  });

  it('旧泛称和具体食材按库存总数合并，不改写原始存档、容量和成品品质', () => {
    const state = kitchen();
    state.inventory.vegetable = 2;
    state.inventory.meat = 1;
    state.fridge.items.farm_vegetable = 1;
    state.fridge.items.cabbage = 1;
    state.fridge.items.pork = 1;
    state.fridge.items['cooked:pudding'] = 2;
    state.cooking.mealQualityBatches = { 'cooked:pudding': [{ quality: '美味', quantity: 1 }, { quality: '完美', quantity: 1 }] };
    const before = JSON.stringify(state);
    expect(cookingStock(state).find((row) => row.id === 'cabbage')?.qty).toBe(4);
    expect(cookingStock(state).find((row) => row.id === 'pork')?.qty).toBe(2);
    expect(fridgeUsedSlots(state)).toBe(7);
    expect(JSON.stringify(state)).toBe(before);
    const loaded = migrateSave(JSON.parse(before));
    expect(loaded.inventory.vegetable).toBe(2);
    expect(loaded.fridge.items.farm_vegetable).toBe(1);
    expect(storedMealBatches(loaded, 'cooked:pudding')).toEqual([{ quality: '美味', quantity: 1 }, { quality: '完美', quantity: 1 }]);
  });

  it('已知菜谱只选料，缺料及库存变化不会扣除任何物品', () => {
    const state = kitchen();
    state.cooking.unlockedRecipeIds = ['dish_full_meal'];
    state.inventory.vegetable = 1;
    state.inventory.meat = 1;
    state.fridge.items.rice = 1;
    const lacking = selectKnownRecipeIngredients(state, 'dish_full_meal');
    expect(lacking.ok).toBe(false);
    expect(lacking.missing).toEqual(['盐 ×1']);
    state.fridge.items.salt = 1;
    const before = JSON.stringify(state);
    const selection = selectKnownRecipeIngredients(state, 'dish_full_meal');
    expect(selection).toMatchObject({ ok: true, ingredients: ['vegetable', 'meat', 'rice'], seasonings: ['salt'] });
    expect(JSON.stringify(state)).toBe(before);
    delete state.fridge.items.rice;
    const stale = JSON.stringify(state);
    expect(cookFreeform(state, selection.ingredients, selection.seasonings, 'dish_full_meal').ok).toBe(false);
    expect(JSON.stringify(state)).toBe(stale);
    state.fridge.items.rice = 1;
    const cooked = cookFreeform(state, selection.ingredients, selection.seasonings, 'dish_full_meal');
    expect(cooked).toMatchObject({ ok: true, recipe: { id: 'dish_full_meal' }, quality: '完美' });
    expect(state.inventory.vegetable).toBeUndefined();
    expect(state.inventory.meat).toBeUndefined();
    expect(state.fridge.items.rice).toBeUndefined();
    expect(state.fridge.items.salt).toBeUndefined();
    expect(state.cooking.pendingCook).toEqual({ recipeId: 'dish_full_meal', quality: '完美' });
    expect(settlePendingCook(state, 'store').ok).toBe(true);
    expect(storedMealBatches(state, 'cooked:dish_full_meal')).toEqual([{ quality: '完美', quantity: 1 }]);
  });

  it('无效食材、未掌握菜谱和厨艺不足都不会产生半笔扣料', () => {
    const state = kitchen();
    state.inventory.cabbage = 1;
    state.inventory.salt = 1;
    for (const attempt of [
      () => cookFreeform(state, ['salt'], ['salt']),
      () => cookFreeform(state, ['cabbage'], ['salt'], 'salt_vegetables'),
    ]) {
      const before = JSON.stringify(state);
      expect(attempt().ok).toBe(false);
      expect(JSON.stringify(state)).toBe(before);
    }
    state.cooking.unlockedRecipeIds = ['dish_steak'];
    state.inventory.beef = 1;
    state.player.skills.cooking = 1;
    expect(selectKnownRecipeIngredients(state, 'dish_steak').reason).toContain('厨艺');
    const before = JSON.stringify(state);
    expect(cookFreeform(state, ['beef'], ['salt'], 'dish_steak').ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('泡面既可从背包食用，也可消耗一份经正式烹饪结算', () => {
    const state = kitchen();
    state.inventory.noodles = 1;
    expect(getItem('noodles')?.consumable).toBe(true);
    expect(cookingStock(state).find((row) => row.id === 'noodles')?.qty).toBe(1);
    const result = cookFreeform(state, ['noodles'], []);
    expect(result).toMatchObject({ ok: true, recipe: { id: 'instant_noodles' }, quality: '完美' });
    expect(state.inventory.noodles).toBeUndefined();
    const health = state.player.attrs.health;
    const mood = state.player.attrs.mood;
    expect(settlePendingCook(state, 'eat').ok).toBe(true);
    expect(state.player.attrs.health).toBe(health - 2);
    expect(state.player.attrs.mood).toBe(mood - 3);
  });

  it('市场与农场销售具体品种，旧泛称不再上架，满冰箱时不扣钱', () => {
    const state = kitchen();
    state.locationId = 'market';
    const products = visibleActionsAtLocation(state, 'market').filter(isFacilityProduct);
    expect(products.some((action) => ['vegetable', 'meat', 'farm_vegetable'].includes(action.itemId ?? ''))).toBe(false);
    expect(new Set(products.map((action) => action.itemId)).size).toBe(products.length);
    expect(products.find((action) => action.itemId === 'cabbage')).toBeTruthy();
    state.time.hour = 21;
    expect(purchasePriceOf(state, getAction('buy_cabbage_market')!)).toBe(4);
    state.locationId = 'farm';
    state.time.hour = 10;
    const money = state.player.money;
    expect(performAction(state, 'farm_buy_vegetable').ok).toBe(true);
    expect(state.player.money).toBe(money - 3);
    expect(state.fridge.items.cabbage).toBe(1);
    expect(getItem('cabbage')?.cookingCategory).toBe('cabbage');
    expect(getItem('cabbage')?.consumable).not.toBe(true);
    state.fridge.items = { cabbage: FRIDGE_TIERS.small.capacity };
    const before = JSON.stringify(state);
    expect(performAction(state, 'farm_buy_vegetable').ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
