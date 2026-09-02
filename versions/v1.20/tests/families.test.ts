import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  applyFamily,
  applyAllocation,
  validateNewGameSetup,
  getFamily,
  FAMILIES,
  DEFAULT_FAMILY,
} from "../src/game/core/families";
import { getMaxStamina } from "../src/game/core/stats";
import { START_ITEMS, startCostOf } from "../src/game/core/items";

describe("家庭条件：数据", () => {
  it("4 档家庭齐全", () => {
    const ids = FAMILIES.map((f) => f.id);
    expect(ids).toEqual(["destitute", "tight", "ordinary", "wealthy"]);
  });

  it("普通为默认家庭", () => {
    expect(DEFAULT_FAMILY).toBe("ordinary");
    const f = getFamily("ordinary")!;
    expect(f.initialMoney).toBe(500);
    expect(f.monthlyPayment).toBe(0);
    expect(f.pointQuota).toBe(10);
    expect(f.freeHousingNights).toBe(7);
  });
});

describe("家庭条件：应用", () => {
  it("赤贫：0 资金 + gov 15 晚 + 魅力/体力 debuff", () => {
    const s = createInitialState();
    s.player.stats.charm = 30;
    s.player.attrs.stamina = 80;
    applyFamily(s, "destitute");
    expect(s.player.money).toBe(0);
    expect(s.living.mode).toBe("gov");
    expect(s.living.govDaysLeft).toBe(15);
    expect(s.player.stats.charm).toBe(25); // 30 - 5
    expect(getMaxStamina(s)).toBe(90); // 100 - 10 capMod
  });

  it("拮据：200 资金 + 配额 5", () => {
    const s = createInitialState();
    applyFamily(s, "tight");
    expect(s.player.money).toBe(200);
    expect(getFamily("tight")!.pointQuota).toBe(5);
    expect(s.living.govDaysLeft).toBe(7);
  });

  it("普通：500 资金 + gov 7 晚", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    expect(s.player.money).toBe(500);
    expect(s.living.mode).toBe("gov");
    expect(s.living.govDaysLeft).toBe(7);
  });

  it("富裕：2000 资金 + 无免费住宿（直接 nightly）", () => {
    const s = createInitialState();
    applyFamily(s, "wealthy");
    expect(s.player.money).toBe(2000);
    expect(s.living.mode).toBe("nightly");
    expect(s.living.govDaysLeft).toBe(0);
  });
});

describe("属性点分配", () => {
  it("金钱加点 +100/点", () => {
    const s = createInitialState();
    s.player.money = 0;
    applyAllocation(s, { money: 3, charm: 0, stamina: 0, intelligence: 0, items: 0 });
    expect(s.player.money).toBe(300);
  });

  it("体力加点 → 体力上限 +5/点", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    applyAllocation(s, { money: 0, charm: 0, stamina: 3, intelligence: 0, items: 0 });
    expect(getMaxStamina(s)).toBe(115);
  });

  it("智力/魅力加点按单价生效", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    applyAllocation(s, { money: 0, charm: 2, stamina: 0, intelligence: 2, items: 0 });
    expect(s.player.stats.charm).toBe(30 + 2 * 3); // 单价 3（占位）
    expect(s.player.stats.intelligence).toBe(30 + 2 * 3);
  });
});

describe("校验", () => {
  it("配额内合法（物品按各自点数计费）", () => {
    // ordinary 配额 10；笔记本开局点数 4
    const r = validateNewGameSetup("ordinary", { money: 3, charm: 1, stamina: 1, intelligence: 0, items: 4 }, ["laptop"]);
    expect(r.ok).toBe(true);
  });

  it("超出配额拒绝", () => {
    const r = validateNewGameSetup("tight", { money: 6, charm: 0, stamina: 0, intelligence: 0, items: 0 }, []);
    expect(r.ok).toBe(false);
  });

  it("物品点数与所选物品实际点数不符拒绝", () => {
    // 笔记本开局点数 4，但只投了 2 点 → 不匹配
    const r = validateNewGameSetup("ordinary", { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 2 }, ["laptop"]);
    expect(r.ok).toBe(false);
  });
});

describe("起步装备（v0.935）", () => {
  it("低价值零食/生鲜不进开局兑换，高价值装备在内", () => {
    const ids = START_ITEMS.map((i) => i.id);
    expect(ids).toContain("laptop");
    expect(ids).toContain("car");
    expect(ids).not.toContain("fruit");
    expect(ids).not.toContain("salad");
    // 汽车是高价值项，点数最高
    expect(startCostOf(START_ITEMS.find((i) => i.id === "car"))).toBeGreaterThan(
      startCostOf(START_ITEMS.find((i) => i.id === "bicycle")),
    );
  });
});