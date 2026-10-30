import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { cookFreeform } from "../src/game/core/cooking";

function kitchenState() {
  const state = createInitialState(42);
  state.flags["cook_utensil"] = true;
  state.living.mode = "lease";
  state.living.govDaysLeft = 0;
  state.living.nightly = null;
  state.living.lease = { housingId: "old_apartment", rent: 100, rentGrowthCount: 0 };
  return state;
}

describe("v1.43 自由烹饪只扣除配方真正用到的材料（L9）", () => {
  it("配方不认的多余调料会原样退回，不再被无声吞掉", () => {
    const s = kitchenState();
    s.inventory.tomato = 1;
    s.inventory.egg = 1;
    s.inventory.salt = 1;
    s.inventory.sugar = 1;

    const r = cookFreeform(s, ["tomato", "egg"], ["salt", "sugar"]);

    expect(r.ok).toBe(true);
    expect(r.recipe?.id).toBe("tomato_egg");
    expect(r.returned).toEqual(["sugar"]);
    // 用到的调料被扣掉，多放的原样留在背包
    expect(s.inventory.salt).toBeUndefined();
    expect(s.inventory.sugar).toBe(1);
    // 食材全部计入，正常消耗
    expect(s.inventory.tomato).toBeUndefined();
    expect(s.inventory.egg).toBeUndefined();
  });

  it("材料不足时直接失败，且不消耗任何材料", () => {
    const s = kitchenState();
    s.inventory.tomato = 1;
    s.inventory.egg = 0;

    const r = cookFreeform(s, ["tomato", "egg"], []);

    expect(r.ok).toBe(false);
    expect(r.reason).toContain("食材不足");
    expect(s.inventory.tomato).toBe(1);
  });

  it("没有匹配到菜谱时仍按原设计销毁全部投入（失败作品）", () => {
    const s = kitchenState();
    s.inventory.milk = 3;
    s.inventory.soy_sauce = 1;

    const r = cookFreeform(s, ["milk", "milk", "milk"], ["soy_sauce"]);

    expect(r.ok).toBe(true);
    expect(r.failed).toBe(true);
    expect(s.inventory.milk).toBeUndefined();
    expect(s.inventory.soy_sauce).toBeUndefined();
  });
});
