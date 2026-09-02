import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  CATS,
  CAT_PERSONALITIES,
  getCatDef,
  allCatDefs,
  computeCatAttrs,
  randomPersonality,
  adoptCat,
  hasCat,
  checkCatAcquisition,
} from "../src/game/core/cat";
import type { CatRarity } from "../src/game/types";

describe("v1.4 猫咪数据", () => {
  it("v1.38 精简后 4 只猫（橘/薄荷/黄金/Boss），id 唯一", () => {
    const ids = CATS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CATS.length).toBe(4);
  });

  it("v1.38 稀有度分布：1 普通 + 1 稀有 + 1 传说 + 1 Boss", () => {
    const count = (r: CatRarity) => CATS.filter((c) => c.rarity === r).length;
    expect(count("common")).toBe(1);
    expect(count("rare")).toBe(1);
    expect(count("super")).toBe(0);
    expect(count("legend")).toBe(1);
    expect(count("boss")).toBe(1);
  });

  it("基础属性与成长率均为正数", () => {
    for (const c of CATS) {
      for (const k of ["hp", "atk", "def", "spd"] as const) {
        expect(c.base[k], `${c.id} base.${k}`).toBeGreaterThan(0);
        expect(c.growth[k], `${c.id} growth.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("getCatDef / allCatDefs 可用", () => {
    expect(getCatDef("orange")?.name).toBe("橘猫");
    expect(getCatDef("nonexistent")).toBeUndefined();
    expect(allCatDefs()).toHaveLength(CATS.length);
  });
});

describe("v1.4 属性计算", () => {
  it("等级 1 属性 = 基础值 × 性格修正", () => {
    const orange = getCatDef("orange")!;
    const bold = computeCatAttrs(orange, 1, "bold");
    expect(bold.atk).toBe(Math.round(orange.base.atk * 1.1));
    expect(bold.def).toBe(Math.round(orange.base.def * 0.95));
  });

  it("属性随等级成长（基础 + 成长率 × (等级-1)）", () => {
    const orange = getCatDef("orange")!;
    const lv10 = computeCatAttrs(orange, 10, "calm");
    const expectedHp = Math.round((orange.base.hp + orange.growth.hp * 9) * 1);
    expect(lv10.hp).toBe(expectedHp);
    expect(lv10.hp).toBeGreaterThan(orange.base.hp);
  });

  it("随机性格走 rng，同 seed 可复现", () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    expect(randomPersonality(a)).toBe(randomPersonality(b));
    expect(CAT_PERSONALITIES).toContain(randomPersonality(a));
  });
});

describe("v1.4 收养与获取", () => {
  it("收养橘猫：写入 pets、解锁图鉴、置收养 flag", () => {
    const s = createInitialState(1);
    const pet = adoptCat(s, "orange");
    expect(pet).not.toBeNull();
    expect(s.pets).toHaveLength(1);
    expect(s.pets[0].catId).toBe("orange");
    expect(s.pets[0].level).toBe(1);
    expect(s.pets[0].care).toEqual({ satiety: 80, mood: 80, hygiene: 80 });
    expect(s.catFlags["cat_orange"]).toBe(true);
    expect(s.flags["cat_adopted_orange"]).toBe(true);
    expect(hasCat(s, "orange")).toBe(true);
  });

  it("v1.32 首次收养自动设为携带，后续收养不覆盖当前携带", () => {
    const s = createInitialState(1);
    adoptCat(s, "orange");
    expect(s.activePet).toBe(s.pets[0].uid);
    // 第二只猫收养后不覆盖当前携带
    adoptCat(s, "mint");
    expect(s.activePet).toBe(s.pets[0].uid);
  });

  it("v1.32 开局兑换橘猫物品 → applyItem 自动收养并携带", async () => {
    const { applyItem } = await import("../src/game/core/items");
    const s = createInitialState(1);
    applyItem(s, "cat_orange");
    expect(s.pets).toHaveLength(1);
    expect(s.pets[0].catId).toBe("orange");
    expect(s.activePet).toBe(s.pets[0].uid);
    expect(s.flags["item_cat_orange"]).toBe(true);
  });

  it("Boss 圆头猫咪不可收养", () => {
    const s = createInitialState(1);
    expect(adoptCat(s, "roundhead")).toBeNull();
    expect(s.pets).toHaveLength(0);
  });

  it("未知猫种不可收养", () => {
    const s = createInitialState(1);
    expect(adoptCat(s, "nonexistent")).toBeNull();
    expect(s.pets).toHaveLength(0);
  });

  it("可收养多只不同猫种，uid 递增", () => {
    const s = createInitialState(1);
    adoptCat(s, "orange");
    adoptCat(s, "mint");
    expect(s.pets).toHaveLength(2);
    expect(s.pets[0].uid).toBe("pet_1");
    expect(s.pets[1].uid).toBe("pet_2");
  });

  it("达成目标型获取：攒够 50000 元解锁黄金猫（幂等）", () => {
    const s = createInitialState(1);
    s.player.money = 60000;
    const pet = checkCatAcquisition(s);
    expect(pet?.catId).toBe("golden");
    expect(hasCat(s, "golden")).toBe(true);
    // 幂等：再次调用不再重复发放
    expect(checkCatAcquisition(s)).toBeNull();
    expect(s.pets.filter((p) => p.catId === "golden")).toHaveLength(1);
  });

  it("未达标时不发放黄金猫", () => {
    const s = createInitialState(1);
    s.player.money = 10000;
    expect(checkCatAcquisition(s)).toBeNull();
    expect(hasCat(s, "golden")).toBe(false);
  });

  it("跨天结算触发达成目标型获取（攒够 50000 元 → 黄金猫上门）", async () => {
    const { advanceHours } = await import("../src/game/core/time");
    const s = createInitialState(1);
    s.player.money = 60000;
    s.time.hour = 23;
    s.time.minute = 0;
    const r = advanceHours(s, 2);
    expect(r.crossedDay).toBe(true);
    expect(hasCat(s, "golden")).toBe(true);
    expect(s.log.some((l) => l.text.includes("黄金猫"))).toBe(true);
  });
});
