import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyEffects } from "../src/game/engine";
import { adoptableCats, CAT_ADOPT_PRICE, adoptCat, hasCat, getCatDef } from "../src/game/core/cat";
import { ACTIONS } from "../src/game/core/actions";

describe("v1.33 宠物店领养系统", () => {
  it("领养池排除 boss（圆头猫咪不可领养）", () => {
    const pool = adoptableCats();
    expect(pool.some((c) => c.rarity === "boss")).toBe(false);
    expect(pool.some((c) => c.id === "roundhead")).toBe(false);
    expect(pool.length).toBeGreaterThan(0);
  });

  it("定价覆盖普通/稀有/超稀有/传说四档", () => {
    for (const r of ["common", "rare", "super", "legend"] as const) {
      expect(CAT_ADOPT_PRICE[r]).toBeGreaterThan(0);
    }
    expect(CAT_ADOPT_PRICE.common).toBeLessThan(CAT_ADOPT_PRICE.rare);
    expect(CAT_ADOPT_PRICE.rare).toBeLessThan(CAT_ADOPT_PRICE.super);
    expect(CAT_ADOPT_PRICE.super).toBeLessThan(CAT_ADOPT_PRICE.legend);
  });

  it("pet_adopt 动作归属宠物用品店、pet_adopt 分组", () => {
    const a = ACTIONS.find((x) => x.id === "pet_adopt");
    expect(a).toBeTruthy();
    expect(a!.locationId).toBe("pet_store");
    expect(a!.group).toBe("pet_adopt");
    expect(a!.handler).toBe("pet_adopt");
  });

  it("训练动作移到公园且需携带猫，购买动作移到宠物用品店", () => {
    for (const id of ["cat_train_atk", "cat_train_def", "cat_train_spd", "cat_train_hp"]) {
      const a = ACTIONS.find((x) => x.id === id)!;
      expect(a.locationId, `${id} 应在公园`).toBe("park");
      expect(a.requirements?.hasActivePet, `${id} 需携带猫`).toBe(true);
      expect(a.group, `${id} 归猫训练组`).toBe("cat_train");
    }
    const buy = ACTIONS.filter((x) => x.id.startsWith("cat_buy_") && x.handler === "buy_cat_item");
    expect(buy.length).toBe(16); // 12 商店用品 + 4 医院特供（含体力药水）
    for (const a of buy) {
      const expectLoc = a.catItemId && ["cat_potion", "cat_hp_potion", "cat_purifier", "cat_revive"].includes(a.catItemId)
        ? "pet_hospital"
        : "pet_store";
      expect(a.locationId, `${a.id} 应在${expectLoc}`).toBe(expectLoc);
      expect(a.group, `${a.id} 应归二级菜单分组`).toMatch(/^(pet_|hos_)/);
    }
  });

  it("收养：扣款入周记、写入 pets、首次自动携带、重复收养可再得一只", () => {
    const s = createInitialState(7);
    const def = getCatDef("orange")!;
    const price = CAT_ADOPT_PRICE[def.rarity];
    s.player.money = 50000;
    const money0 = s.player.money;
    const pet = adoptCat(s, "orange");
    expect(pet).not.toBeNull();
    expect(s.pets.length).toBe(1);
    expect(s.activePet).toBe(pet!.uid); // 首次收养自动携带
    expect(hasCat(s, "orange")).toBe(true);
    expect(s.flags[`cat_adopted_orange`]).toBe(true);
    // 模拟领养扣款（applyEffects 记周记）
    applyEffects(s, { money: -price });
    expect(s.player.money).toBe(money0 - price);
    // 再收养一只不同猫，不覆盖当前携带
    const pet2 = adoptCat(s, "mint");
    expect(pet2).not.toBeNull();
    expect(s.pets.length).toBe(2);
    expect(s.activePet).toBe(pet!.uid);
  });
});
