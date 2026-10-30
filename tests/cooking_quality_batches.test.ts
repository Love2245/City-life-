import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { cookFreeform, eatStoredMeal, settlePendingCook, storedMealBatches, storeCookedMeal } from "../src/game/core/cooking";
import { installFridge, storeInFridge } from "../src/game/core/fridge";
import { migrateSave } from "../src/game/core/migrate";

function readyKitchen() {
  const state = createInitialState(1475);
  state.flags["cook_utensil"] = true;
  state.living.mode = "lease";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = { housingId: "old_apartment", rent: 100, rentGrowthCount: 0 };
  expect(installFridge(state, "small").ok).toBe(true);
  return state;
}

function makePudding(state: ReturnType<typeof readyKitchen>, quality: "普通" | "美味" | "完美") {
  state.player.skills.cooking = quality === "完美" ? 6 : quality === "美味" ? 3 : 0;
  state.inventory.milk = (state.inventory.milk ?? 0) + 1;
  state.inventory.egg = (state.inventory.egg ?? 0) + 1;
  expect(cookFreeform(state, ["milk", "egg"], [])).toMatchObject({ ok: true, recipe: { id: "pudding" }, quality });
  expect(settlePendingCook(state, "store")).toMatchObject({ ok: true, quality });
}

describe("冰箱成品品质分批记录", () => {
  it.each([
    ["完美", "普通"],
    ["普通", "完美"],
  ] as const)("同一菜品按存入顺序保留 %s、%s 品质并在存档往返后分别食用", (first, second) => {
    const state = readyKitchen();
    makePudding(state, first);
    makePudding(state, second);
    const itemId = "cooked:pudding";

    expect(state.fridge.items[itemId]).toBe(2);
    expect(storedMealBatches(state, itemId)).toEqual([
      { quality: first, quantity: 1 },
      { quality: second, quantity: 1 },
    ]);

    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(reloaded.cooking.mealQualityBatches?.[itemId]).toEqual(state.cooking.mealQualityBatches?.[itemId]);
    expect(storedMealBatches(reloaded, itemId)).toEqual(storedMealBatches(state, itemId));

    expect(eatStoredMeal(reloaded, itemId, second)).toMatchObject({ ok: true, quality: second });
    expect(reloaded.fridge.items[itemId]).toBe(1);
    expect(storedMealBatches(reloaded, itemId)).toEqual([{ quality: first, quantity: 1 }]);
    expect(eatStoredMeal(reloaded, itemId, first)).toMatchObject({ ok: true, quality: first });
    expect(reloaded.fridge.items[itemId]).toBeUndefined();
    expect(reloaded.cooking.mealQualityBatches?.[itemId]).toBeUndefined();
  });

  it("指定品质不存在时不扣减另一品质的成品", () => {
    const state = readyKitchen();
    makePudding(state, "完美");
    const before = JSON.stringify(state.fridge.items);

    expect(eatStoredMeal(state, "cooked:pudding", "普通")).toMatchObject({ ok: false });
    expect(JSON.stringify(state.fridge.items)).toBe(before);
    expect(storedMealBatches(state, "cooked:pudding")).toEqual([{ quality: "完美", quantity: 1 }]);
  });

  it("同品质会堆叠，普通、美味、完美三种品质可共同保存并分别食用", () => {
    const state = readyKitchen();
    const itemId = "cooked:pudding";
    for (const quality of ["美味", "美味", "普通", "完美"] as const) {
      expect(storeCookedMeal(state, "pudding", quality)).toBe(true);
    }

    expect(storedMealBatches(state, itemId)).toEqual([
      { quality: "美味", quantity: 2 },
      { quality: "普通", quantity: 1 },
      { quality: "完美", quantity: 1 },
    ]);
    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(storedMealBatches(reloaded, itemId)).toEqual(storedMealBatches(state, itemId));

    for (const quality of ["完美", "普通", "美味", "美味"] as const) {
      expect(eatStoredMeal(reloaded, itemId, quality)).toMatchObject({ ok: true, quality });
    }
    expect(reloaded.fridge.items[itemId]).toBeUndefined();
  });

  it("冰箱已满时不写入成品数量或品质批次", () => {
    const state = readyKitchen();
    for (let i = 0; i < 20; i++) expect(storeInFridge(state, `filler_${i}`, 1)).toBe(true);
    const fridgeBefore = JSON.stringify(state.fridge);
    const batchesBefore = JSON.stringify(state.cooking.mealQualityBatches);

    expect(storeCookedMeal(state, "pudding", "完美")).toBe(false);
    expect(JSON.stringify(state.fridge)).toBe(fridgeBefore);
    expect(JSON.stringify(state.cooking.mealQualityBatches)).toBe(batchesBefore);
  });

  it("旧存档保留原单一品质读取，不凭总数量伪造历史分批", () => {
    const state = readyKitchen();
    const itemId = "cooked:pudding";
    state.fridge.items[itemId] = 2;
    state.cooking.mealQualities![itemId] = "美味";

    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(reloaded.cooking.mealQualityBatches?.[itemId]).toBeUndefined();
    expect(storedMealBatches(reloaded, itemId)).toEqual([{ quality: "美味", quantity: 2 }]);
  });

  it("旧档两份美味成品后存入普通成品，往返存档后两种品质仍能分别食用", () => {
    const state = readyKitchen();
    const itemId = "cooked:pudding";
    state.fridge.items[itemId] = 2;
    state.cooking.mealQualities![itemId] = "美味";

    let reloaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(storeCookedMeal(reloaded, "pudding", "普通")).toBe(true);
    reloaded = migrateSave(JSON.parse(JSON.stringify(reloaded)));

    expect(reloaded.fridge.items[itemId]).toBe(3);
    expect(storedMealBatches(reloaded, itemId)).toEqual([
      { quality: "普通", quantity: 1 },
      { quality: "美味", quantity: 2 },
    ]);
    expect(eatStoredMeal(reloaded, itemId, "美味")).toMatchObject({ ok: true, quality: "美味" });
    expect(reloaded.fridge.items[itemId]).toBe(2);
    expect(storedMealBatches(reloaded, itemId)).toEqual([
      { quality: "普通", quantity: 1 },
      { quality: "美味", quantity: 1 },
    ]);
    expect(eatStoredMeal(reloaded, itemId, "普通")).toMatchObject({ ok: true, quality: "普通" });
    expect(storedMealBatches(reloaded, itemId)).toEqual([{ quality: "美味", quantity: 1 }]);
    expect(eatStoredMeal(reloaded, itemId, "美味")).toMatchObject({ ok: true, quality: "美味" });
    expect(reloaded.fridge.items[itemId]).toBeUndefined();
  });
});
