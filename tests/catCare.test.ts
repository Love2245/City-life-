import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import { adoptCat } from "../src/game/core/cat";
import { performAction } from "../src/game/core/actions";
import { checkEventConditions, applyEventChoice, EVENTS } from "../src/game/core/events";
import { itemCount, addItem } from "../src/game/core/items";
import {
  CAT_ITEMS,
  allCatItems,
  getCatItem,
  catInventoryList,
  activePetOf,
  setActivePet,
  feedCat,
  cleanCat,
  playWithCat,
  trainCat,
  tickCatCareDaily,
  buyCatItem,
  catAttrMultiplier,
  catTrainEfficiency,
  catBattleAttrs,
  catTrainBoost,
  catDefBonus,
  catMoodBonus,
  catMaxHp,
  catCurHp,
  healCatHp,
  catDowned,
  restoreCatHp,
  useCatItem,
  DAILY_HP_RECOVER_PCT,
  TRAIN_DAILY_LIMIT,
  CLEAN_COST,
  CLEAN_HYGIENE,
  CLEAN_MOOD,
  PLAY_MOOD,
  PLAY_SATIETY_COST,
  DAILY_SATIETY_DECAY,
  DAILY_MOOD_DECAY,
  DAILY_HYGIENE_DECAY,
  DIRTY_MOOD_PENALTY,
  CARE_LOW,
  CARE_CRITICAL,
} from "../src/game/core/catCare";

/** 收养一只猫并设为携带 */
function setupCat(seed = 7): ReturnType<typeof createInitialState> {
  const s = createInitialState(seed);
  const pet = adoptCat(s, "orange");
  expect(pet).not.toBeNull();
  setActivePet(s, s.pets[0].uid);
  return s;
}

describe("v1.4 P2 猫咪用品数据", () => {
  it("16 件用品：4 品类 × 3 档位 + 4 医院特供，id 唯一", () => {
    expect(CAT_ITEMS.length).toBe(16);
    expect(new Set(CAT_ITEMS.map((i) => i.id)).size).toBe(16);
    for (const cat of ["food", "toy", "bed", "train"] as const) {
      expect(CAT_ITEMS.filter((i) => i.cat === cat)).toHaveLength(3);
    }
    expect(CAT_ITEMS.filter((i) => i.cat === "special")).toHaveLength(4);
    // 医院特供：2 优质 + 1 豪华 + 1 生命药剂（优质）→ basic 4 / good 7 / lux 5
    expect(CAT_ITEMS.filter((i) => i.tier === "basic")).toHaveLength(4);
    expect(CAT_ITEMS.filter((i) => i.tier === "good")).toHaveLength(7);
    expect(CAT_ITEMS.filter((i) => i.tier === "lux")).toHaveLength(5);
  });

  it("价格均为正数，猫粮都有饱食恢复", () => {
    for (const i of CAT_ITEMS) {
      expect(i.price, `${i.id} 价格`).toBeGreaterThan(0);
      if (i.cat === "food") expect(i.satiety, `${i.id} 缺饱食`).toBeGreaterThan(0);
    }
  });

  it("getCatItem / allCatItems 可用", () => {
    expect(getCatItem("cat_food_basic")?.name).toBe("普通猫粮");
    expect(getCatItem("nonexistent")).toBeUndefined();
    expect(allCatItems()).toHaveLength(CAT_ITEMS.length);
  });
});

describe("v1.4 P2 携带切换", () => {
  it("setActivePet 设置/清除携带猫", () => {
    const s = createInitialState(1);
    adoptCat(s, "orange");
    const uid = s.pets[0].uid;
    expect(setActivePet(s, uid)).toBe(true);
    expect(s.activePet).toBe(uid);
    expect(activePetOf(s)?.uid).toBe(uid);
    expect(setActivePet(s, undefined)).toBe(true);
    expect(activePetOf(s)).toBeUndefined();
  });

  it("setActivePet 目标不存在返回 false", () => {
    const s = createInitialState(1);
    expect(setActivePet(s, "pet_999")).toBe(false);
    expect(s.activePet).toBeUndefined();
  });
});

describe("v1.4 P2 喂食", () => {
  it("背包没有猫粮时喂食失败", () => {
    const s = setupCat();
    const r = feedCat(s, s.pets[0]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("猫粮");
  });

  it("喂普通猫粮：饱食 +25，消耗 1 份", () => {
    const s = setupCat();
    addItem(s, "cat_food_basic", 2);
    const pet = s.pets[0];
    pet.care.satiety = 60;
    const sat0 = pet.care.satiety;
    const r = feedCat(s, pet);
    expect(r.ok).toBe(true);
    expect(pet.care.satiety).toBe(sat0 + 25);
    expect(itemCount(s, "cat_food_basic")).toBe(1);
    expect(r.deltas?.find((d) => d.key === "cat_satiety")?.value).toBe(25);
  });

  it("喂优质猫粮：饱食 +35 且心情 +5", () => {
    const s = setupCat();
    addItem(s, "cat_food_good", 1);
    const pet = s.pets[0];
    const mood0 = pet.care.mood;
    const r = feedCat(s, pet);
    expect(r.ok).toBe(true);
    expect(pet.care.mood).toBe(mood0 + 5);
    expect(r.deltas?.some((d) => d.key === "cat_mood")).toBe(true);
  });

  it("饱食接近上限时实际增量截断（不超 100）", () => {
    const s = setupCat();
    addItem(s, "cat_food_basic", 1);
    const pet = s.pets[0];
    pet.care.satiety = 90;
    const r = feedCat(s, pet);
    expect(r.ok).toBe(true);
    expect(pet.care.satiety).toBe(100);
    expect(r.deltas?.find((d) => d.key === "cat_satiety")?.value).toBe(10);
  });

  it("缺省自动用背包里最高档猫粮", () => {
    const s = setupCat();
    addItem(s, "cat_food_basic", 1);
    addItem(s, "cat_food_lux", 1);
    const pet = s.pets[0];
    const r = feedCat(s, pet);
    expect(r.ok).toBe(true);
    expect(itemCount(s, "cat_food_lux")).toBe(0); // 先消耗豪华档
    expect(itemCount(s, "cat_food_basic")).toBe(1);
  });
});

describe("v1.4 P2 清洁", () => {
  it("钱不够时清洁失败", () => {
    const s = setupCat();
    s.player.money = 5;
    const r = cleanCat(s, s.pets[0]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("钱不够");
  });

  it("清洁成功：干净度 +40、心情 +3、扣 15 元并计入周记", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.hygiene = 50;
    const money0 = s.player.money;
    const spent0 = s.weekly.spent;
    const r = cleanCat(s, pet);
    expect(r.ok).toBe(true);
    expect(pet.care.hygiene).toBe(50 + CLEAN_HYGIENE);
    expect(pet.care.mood).toBe(80 + CLEAN_MOOD);
    expect(s.player.money).toBe(money0 - CLEAN_COST);
    expect(s.weekly.spent).toBe(spent0 + CLEAN_COST);
  });
});

describe("v1.4 P2 玩耍", () => {
  it("玩耍：心情 +12、饱食 -2", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const mood0 = pet.care.mood;
    const sat0 = pet.care.satiety;
    const r = playWithCat(s, pet);
    expect(r.ok).toBe(true);
    expect(pet.care.mood).toBe(mood0 + PLAY_MOOD);
    expect(pet.care.satiety).toBe(sat0 - PLAY_SATIETY_COST);
  });
});

describe("v1.4 P2 训练", () => {
  it("钱不够时训练失败", () => {
    const s = setupCat();
    s.player.money = 5;
    const r = trainCat(s, s.pets[0], "atk");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("钱不够");
  });

  it("首次训练攻击：atk +2、扣 20 元、心情 -3、属性重算", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const atk0 = pet.attrs.atk;
    const mood0 = pet.care.mood;
    const money0 = s.player.money;
    const r = trainCat(s, pet, "atk");
    expect(r.ok).toBe(true);
    expect(pet.trainBonus?.atk).toBe(2);
    expect(pet.attrs.atk).toBe(atk0 + 2);
    expect(pet.trainedToday).toBe(1);
    expect(s.player.money).toBe(money0 - 20);
    expect(pet.care.mood).toBe(mood0 - 3);
    expect(s.weekly.spent).toBe(20);
  });

  it("同一项重复训练收益递减（第二次 < 第一次）", () => {
    const s = setupCat();
    const pet = s.pets[0];
    trainCat(s, pet, "atk");
    const g1 = pet.trainBonus?.atk ?? 0;
    trainCat(s, pet, "atk");
    const g2 = (pet.trainBonus?.atk ?? 0) - g1;
    expect(g2).toBeLessThan(g1);
    expect(g2).toBeGreaterThanOrEqual(1);
  });

  it("每日上限 3 次，第 4 次被拒", () => {
    const s = setupCat();
    const pet = s.pets[0];
    for (let i = 0; i < TRAIN_DAILY_LIMIT; i++) {
      expect(trainCat(s, pet, "atk").ok).toBe(true);
    }
    const r = trainCat(s, pet, "atk");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("训练次数用完了");
  });

  it("心情低于 30 时训练效率减半", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.mood = 20;
    expect(catTrainEfficiency(pet)).toBe(0.5);
    const r = trainCat(s, pet, "atk");
    expect(r.ok).toBe(true);
    expect(pet.trainBonus?.atk).toBe(1); // round(2 * 0.5) = 1
  });

  it("训练舱（+30%）提升训练收益", () => {
    const s = setupCat();
    addItem(s, "cat_train_lux", 1);
    expect(catTrainBoost(s)).toBe(0.3);
    const pet = s.pets[0];
    const r = trainCat(s, pet, "atk");
    expect(r.ok).toBe(true);
    expect(pet.trainBonus?.atk).toBe(3); // round(2 * 1.3) = 3
  });
});

describe("v1.4 P2 每日结算", () => {
  it("跨天衰减：饱食 -20、心情 -10、干净 -15，训练计数重置", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.trainedToday = 2;
    pet.trainCounts = { atk: 2 };
    const logs = tickCatCareDaily(s);
    expect(pet.care.satiety).toBe(80 - DAILY_SATIETY_DECAY);
    expect(pet.care.mood).toBe(80 - DAILY_MOOD_DECAY);
    expect(pet.care.hygiene).toBe(80 - DAILY_HYGIENE_DECAY);
    expect(pet.trainedToday).toBe(0);
    expect(pet.trainCounts).toEqual({});
    expect(logs).toHaveLength(0);
  });

  it("干净度低于 30 时心情额外 -5", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.hygiene = 20;
    tickCatCareDaily(s);
    expect(pet.care.mood).toBe(80 - DAILY_MOOD_DECAY - DIRTY_MOOD_PENALTY);
  });

  it("豪华猫别墅（心情 +10）抵消每日心情衰减", () => {
    const s = setupCat();
    addItem(s, "cat_bed_lux", 1);
    expect(catMoodBonus(s)).toBe(10);
    const pet = s.pets[0];
    tickCatCareDaily(s);
    expect(pet.care.mood).toBe(80 - DAILY_MOOD_DECAY + 10);
  });

  it("饱食低于 30 时返回提醒日志", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.satiety = 25;
    const logs = tickCatCareDaily(s);
    expect(logs.some((l) => l.includes("饿得直叫"))).toBe(true);
  });
});

describe("v1.4 P2 购买用品", () => {
  it("钱不够时购买失败", () => {
    const s = createInitialState(1);
    s.player.money = 5;
    const r = buyCatItem(s, "cat_food_lux");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("钱不够");
  });

  it("购买成功：扣款入周记、物品入背包、catInventoryList 可见", () => {
    const s = createInitialState(1);
    const money0 = s.player.money;
    const r = buyCatItem(s, "cat_food_basic");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(money0 - 10);
    expect(s.weekly.spent).toBe(10);
    expect(itemCount(s, "cat_food_basic")).toBe(1);
    expect(catInventoryList(s).some((e) => e.item.id === "cat_food_basic" && e.qty === 1)).toBe(true);
  });

  it("未知用品购买失败", () => {
    const s = createInitialState(1);
    const r = buyCatItem(s, "nonexistent");
    expect(r.ok).toBe(false);
  });
});

describe("v1.4 P2 战斗属性修正", () => {
  it("饱食阈值：<15 → 0.6，<30 → 0.8，否则 1", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.satiety = 10;
    expect(catAttrMultiplier(pet)).toBe(0.6);
    pet.care.satiety = 20;
    expect(catAttrMultiplier(pet)).toBe(0.8);
    pet.care.satiety = 50;
    expect(catAttrMultiplier(pet)).toBe(1);
  });

  it("豪华猫别墅提供战斗 DEF +3", () => {
    const s = setupCat();
    expect(catDefBonus(s)).toBe(0);
    addItem(s, "cat_bed_lux", 1);
    expect(catDefBonus(s)).toBe(3);
    const pet = s.pets[0];
    const battle = catBattleAttrs(s, pet);
    expect(battle.def).toBe(pet.attrs.def + 3);
  });

  it("catBattleAttrs 应用饱食修正", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.satiety = 10;
    const battle = catBattleAttrs(s, pet);
    expect(battle.atk).toBe(Math.max(1, Math.round(pet.attrs.atk * 0.6)));
  });
});

describe("v1.4 P2 行动集成", () => {
  it("没有猫咪时喂食行动被拒", () => {
    const s = createInitialState(1);
    const r = performAction(s, "cat_feed");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还没有猫咪");
  });

  it("有猫但没猫粮时喂食行动被拒", () => {
    const s = setupCat();
    const r = performAction(s, "cat_feed");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("猫粮");
  });

  it("喂食行动：饱食提升并推进 0.5 小时", () => {
    const s = setupCat();
    addItem(s, "cat_food_basic", 1);
    const pet = s.pets[0];
    pet.care.satiety = 60;
    const sat0 = pet.care.satiety;
    const r = performAction(s, "cat_feed");
    expect(r.ok).toBe(true);
    expect(pet.care.satiety).toBe(sat0 + 25);
    expect(s.time.minute).toBe(30); // 7:00 + 0.5h
  });

  it("清洁行动：扣 15 元并恢复干净度", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.care.hygiene = 50;
    const money0 = s.player.money;
    const r = performAction(s, "cat_clean");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(money0 - CLEAN_COST);
    expect(pet.care.hygiene).toBe(50 + CLEAN_HYGIENE);
  });

  it("训练行动：atk 提升并受每日上限约束", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const atk0 = pet.attrs.atk;
    const r = performAction(s, "cat_train_atk");
    expect(r.ok).toBe(true);
    expect(pet.attrs.atk).toBeGreaterThan(atk0);
    pet.trainedToday = TRAIN_DAILY_LIMIT;
    const r2 = performAction(s, "cat_train_atk");
    expect(r2.ok).toBe(false);
  });

  it("购买行动：猫粮入背包（需在宠物用品店营业时间内）", () => {
    const s = createInitialState(1);
    s.locationId = "pet_store";
    s.time.hour = 12;
    const r = performAction(s, "cat_buy_cat_food_basic");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "cat_food_basic")).toBe(1);
  });

  it("catUid 指定非携带猫也可照顾", () => {
    const s = createInitialState(1);
    adoptCat(s, "orange");
    adoptCat(s, "mint");
    addItem(s, "cat_food_basic", 1);
    const target = s.pets[1]; // 薄荷猫（非携带）
    target.care.satiety = 60;
    const sat0 = target.care.satiety;
    const r = performAction(s, "cat_feed", { catUid: target.uid });
    expect(r.ok).toBe(true);
    expect(target.care.satiety).toBe(sat0 + 25);
  });
});

describe("v1.4 P2 事件集成", () => {
  it("hasActivePet 条件：未携带猫时被过滤，携带后通过", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    const ev = EVENTS.find((e) => e.id === "ev_cat_street_adventure")!;
    expect(ev).toBeTruthy();
    expect(checkEventConditions(s, ev)).toBe(false);
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    expect(checkEventConditions(s, ev)).toBe(true);
  });

  it("catEffect 作用于携带猫的生存状态", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    const pet = s.pets[0];
    const mood0 = pet.care.mood;
    const r = applyEventChoice(s, "ev_cat_street_adventure", 0); // catEffect mood +5
    expect(r.ok).toBe(true);
    expect(pet.care.mood).toBe(mood0 + 5);
  });

  it("catEffect 负值生效（拉住猫咪 mood -2）", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    const pet = s.pets[0];
    const mood0 = pet.care.mood;
    const r = applyEventChoice(s, "ev_cat_street_adventure", 2); // catEffect mood -2
    expect(r.ok).toBe(true);
    expect(pet.care.mood).toBe(mood0 - 2);
  });

  it("猫咪饿了事件：喂食选项饱食 +20", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    const pet = s.pets[0];
    const sat0 = pet.care.satiety;
    const r = applyEventChoice(s, "ev_cat_hungry", 0); // catEffect satiety +20
    expect(r.ok).toBe(true);
    expect(pet.care.satiety).toBe(sat0 + 20);
  });
});

describe("v1.39 生命值系统", () => {
  it("缺省满血：catCurHp = catMaxHp，catDowned = false", () => {
    const s = setupCat();
    const pet = s.pets[0];
    expect(catMaxHp(pet)).toBe(pet.attrs.hp);
    expect(catCurHp(pet)).toBe(pet.attrs.hp);
    expect(catDowned(pet)).toBe(false);
  });

  it("healCatHp 恢复生命并钳制在上限", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.curHp = 50;
    expect(healCatHp(pet, 30)).toBe(30);
    expect(catCurHp(pet)).toBe(80);
    expect(healCatHp(pet, 100)).toBe(catMaxHp(pet) - 80); // 只补到上限
    expect(catCurHp(pet)).toBe(catMaxHp(pet));
  });

  it("catDowned：生命归零判定", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.curHp = 0;
    expect(catDowned(pet)).toBe(true);
  });

  it("每日结算恢复最大生命值的 20%", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const max = catMaxHp(pet);
    pet.curHp = Math.round(max * 0.5);
    const logs = tickCatCareDaily(s);
    expect(catCurHp(pet)).toBe(Math.round(max * 0.5) + Math.round(max * DAILY_HP_RECOVER_PCT));
    expect(logs.some((l) => l.includes("生命恢复了"))).toBe(true);
  });

  it("满血时每日不重复恢复", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const logs = tickCatCareDaily(s);
    expect(catCurHp(pet)).toBe(catMaxHp(pet));
    expect(logs.some((l) => l.includes("生命恢复了"))).toBe(false);
  });

  it("宠物医院恢复生命：按缺失量收费并补满", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const max = catMaxHp(pet);
    pet.curHp = 40;
    const money0 = s.player.money;
    const r = restoreCatHp(s, pet);
    expect(r.ok).toBe(true);
    expect(catCurHp(pet)).toBe(max);
    expect(s.player.money).toBeLessThan(money0);
  });

  it("满血时宠物医院拒绝治疗", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const r = restoreCatHp(s, pet);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("不需要治疗");
  });

  it("生命药剂：恢复 50% 最大生命，可拉起倒地猫咪", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const max = catMaxHp(pet);
    pet.curHp = 0;
    addItem(s, "cat_hp_potion", 1);
    const r = useCatItem(s, pet, "cat_hp_potion");
    expect(r.ok).toBe(true);
    expect(catCurHp(pet)).toBe(Math.round(max * 0.5));
    expect(catDowned(pet)).toBe(false);
  });

  it("喂猫粮恢复少量生命", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const max = catMaxHp(pet);
    pet.curHp = max - 20;
    addItem(s, "cat_food_basic", 1); // hp: 8
    const r = feedCat(s, pet, "cat_food_basic");
    expect(r.ok).toBe(true);
    expect(catCurHp(pet)).toBe(max - 20 + 8);
  });
});
