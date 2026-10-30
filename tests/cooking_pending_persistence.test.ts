import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { cookFreeform, settlePendingCook } from "../src/game/core/cooking";
import { installFridge } from "../src/game/core/fridge";
import { migrateSave } from "../src/game/core/migrate";

function readyKitchen() {
  const state = createInitialState(1475);
  state.flags["cook_utensil"] = true;
  state.living.mode = "lease";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = { housingId: "old_apartment", rent: 100, rentGrowthCount: 0 };
  state.inventory.milk = 1;
  state.inventory.egg = 1;
  return state;
}

describe("v1.475 待结算烹饪成品", () => {
  it("完成菜品后写入存档，读档保留成品并阻止二次扣料", () => {
    const state = readyKitchen();
    const result = cookFreeform(state, ["milk", "egg"], []);
    expect(result).toMatchObject({ ok: true, recipe: { id: "pudding" } });
    expect(state.cooking.pendingCook).toMatchObject({ recipeId: "pudding", quality: "普通" });
    expect(state.inventory.milk).toBeUndefined();
    expect(state.inventory.egg).toBeUndefined();

    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(reloaded.cooking.pendingCook).toEqual(state.cooking.pendingCook);
    const retry = cookFreeform(reloaded, ["milk", "egg"], []);
    expect(retry.ok).toBe(false);
    expect(reloaded.cooking.pendingCook).toEqual(state.cooking.pendingCook);
  });

  it("没有空间时存冰箱失败且保留成品；安装后只允许存入一次", () => {
    const state = readyKitchen();
    cookFreeform(state, ["milk", "egg"], []);
    const fullFridge = settlePendingCook(state, "store");
    expect(fullFridge.ok).toBe(false);
    expect(state.cooking.pendingCook?.recipeId).toBe("pudding");

    expect(installFridge(state, "small").ok).toBe(true);
    expect(settlePendingCook(state, "store")).toMatchObject({ ok: true, recipe: { id: "pudding" } });
    expect(state.fridge.items["cooked:pudding"]).toBe(1);
    expect(state.cooking.pendingCook).toBeUndefined();
    expect(settlePendingCook(state, "store").ok).toBe(false);
    expect(state.fridge.items["cooked:pudding"]).toBe(1);

    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(reloaded.fridge.items["cooked:pudding"]).toBe(1);
    expect(reloaded.cooking.mealQualities?.["cooked:pudding"]).toBe("普通");
  });

  it("选择食用后恢复饱腹并清除待处理成品，重复结算不产生效果", () => {
    const state = readyKitchen();
    state.player.attrs.satiety = 20;
    cookFreeform(state, ["milk", "egg"], []);
    const eaten = settlePendingCook(state, "eat");
    expect(eaten.ok).toBe(true);
    const satietyAfterMeal = state.player.attrs.satiety;
    expect(satietyAfterMeal).toBeGreaterThan(20);
    expect(state.cooking.pendingCook).toBeUndefined();
    expect(settlePendingCook(state, "eat").ok).toBe(false);
    expect(state.player.attrs.satiety).toBe(satietyAfterMeal);
  });
});
