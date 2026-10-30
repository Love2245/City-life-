import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import { adoptCat } from "../src/game/core/cat";
import { performAction } from "../src/game/core/actions";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { checkEventConditions, applyEventChoice, EVENTS } from "../src/game/core/events";
import { itemCount, addItem } from "../src/game/core/items";
import {
  CAT_ITEMS,
  AUTO_FEEDER_ITEM_ID,
  AUTO_FEED_MIN_SATIETY,
  allCatItems,
  getCatItem,
  catInventoryList,
  activePetOf,
  availableCatsOf,
  fosterCat,
  isCatFostered,
  reclaimCat,
  setActivePet,
  feedCat,
  cleanCat,
  playWithCat,
  trainCat,
  tickCatCareDaily,
  tickCatAutoFeeder,
  buyCatItem,
  catAttrMultiplier,
  catTrainEfficiency,
  catBattleAttrs,
  catTrainBoost,
  catDefBonus,
  catMoodBonus,
  catMaxHp,
  catCurHp,
  injuryTreatCost,
  injuryTrainEfficiency,
  injuryAttrMultiplier,
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
import { unitFromPet } from "../src/game/core/catBattle";

/** 收养一只猫并设为携带 */
function setupCat(seed = 7): ReturnType<typeof createInitialState> {
  const s = createInitialState(seed);
  const pet = adoptCat(s, "orange");
  expect(pet).not.toBeNull();
  setActivePet(s, s.pets[0].uid);
  return s;
}

describe("v1.4 P2 猫咪用品数据", () => {
  it("17 件用品：4 品类 × 3 档位 + 4 医院特供 + 自动设备，id 唯一", () => {
    expect(CAT_ITEMS.length).toBe(17);
    expect(new Set(CAT_ITEMS.map((i) => i.id)).size).toBe(17);
    for (const cat of ["food", "toy", "bed", "train"] as const) {
      expect(CAT_ITEMS.filter((i) => i.cat === cat)).toHaveLength(3);
    }
    expect(CAT_ITEMS.filter((i) => i.cat === "special")).toHaveLength(4);
    expect(CAT_ITEMS.filter((i) => i.cat === "device").map((i) => i.id)).toEqual([AUTO_FEEDER_ITEM_ID]);
    // 医院特供与自动设备：basic 4 / good 7 / lux 6
    expect(CAT_ITEMS.filter((i) => i.tier === "basic")).toHaveLength(4);
    expect(CAT_ITEMS.filter((i) => i.tier === "good")).toHaveLength(7);
    expect(CAT_ITEMS.filter((i) => i.tier === "lux")).toHaveLength(6);
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

describe("伤势存档容错", () => {
  it("畸形伤势等级不会产生 undefined、NaN 或污染后续状态", () => {
    expect(injuryTreatCost("invalid" as never)).toBe(30);
    expect(injuryTrainEfficiency({ level: "invalid", day: 1 } as never)).toBe(1);
    expect(injuryAttrMultiplier({ level: "invalid", day: 1 } as never)).toBe(1);

    const s = setupCat(812);
    s.pets[0].injured = { level: "invalid", day: Number.NaN } as never;
    const migrated = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(migrated.pets[0].injured).toBeUndefined();
    expect(catBattleAttrs(migrated, migrated.pets[0]).atk).toBeGreaterThan(0);
  });

  it("合法伤势保留，缺失的受伤日补为当前日期", () => {
    const s = setupCat(813);
    s.pets[0].injured = { level: "medium", day: Number.NaN };
    const migrated = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(migrated.pets[0].injured).toEqual({ level: "medium", day: (s.time.year - 2026) * 360 + (s.time.month - 1) * 30 + s.time.day });
  });
});

describe("自动照料机", () => {
  it("购买需至少拥有一只猫、售价 500、无需携带且不能重复购买", () => {
    const s = createInitialState(12);
    s.locationId = "pet_store";
    s.time.hour = 12;
    const noCat = performAction(s, "cat_buy_auto_feeder");
    expect(noCat.ok).toBe(false);
    expect(noCat.reason).toContain("领养");
    expect(itemCount(s, AUTO_FEEDER_ITEM_ID)).toBe(0);

    adoptCat(s, "orange");
    adoptCat(s, "mint");
    setActivePet(s, undefined);
    const money0 = s.player.money;
    const bought = performAction(s, "cat_buy_auto_feeder");
    expect(bought.ok).toBe(true);
    expect(s.player.money).toBe(money0 - 500);
    expect(itemCount(s, AUTO_FEEDER_ITEM_ID)).toBe(1);
    expect(s.activePet).toBeUndefined();
    const duplicate = performAction(s, "cat_buy_auto_feeder");
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toContain("无需重复购买");

    const oldSave = JSON.parse(JSON.stringify(s));
    oldSave.version = 31;
    const upgraded = migrateSave(oldSave);
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(itemCount(upgraded, AUTO_FEEDER_ITEM_ID)).toBe(1);
  });

  it("按所有猫咪补到 34 点，优先消费最低数量的现有猫粮并合并反馈", () => {
    const s = createInitialState(13);
    adoptCat(s, "orange");
    adoptCat(s, "mint");
    setActivePet(s, undefined);
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_basic", 3);
    s.pets[0].care.satiety = AUTO_FEED_MIN_SATIETY - 25;
    s.pets[1].care.satiety = 0;

    const logs = tickCatAutoFeeder(s);
    expect(s.pets[0].care.satiety).toBe(34);
    expect(s.pets[1].care.satiety).toBe(50);
    expect(itemCount(s, "cat_food_basic")).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("3份猫粮");
    expect(tickCatAutoFeeder(s)).toEqual([]);
  });

  it("非跨天时间推进会立即喂食，猫粮不足的提示同日只出现一次", () => {
    const s = setupCat(14);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_basic", 1);
    pet.care.satiety = 34;
    const played = performAction(s, "cat_play");
    expect(played.ok).toBe(true);
    expect(pet.care.satiety).toBe(57);
    expect(itemCount(s, "cat_food_basic")).toBe(0);
    expect(s.log.filter((entry) => entry.text.includes("自动照料机"))).toHaveLength(1);

    pet.care.satiety = 0;
    expect(tickCatAutoFeeder(s)).toEqual([]); // 已经有过本日汇总，不重复刷日志
  });

  it("每日饱食衰减后结算自动喂食", () => {
    const s = setupCat(15);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_basic", 1);
    pet.care.satiety = 50;

    const logs = tickCatCareDaily(s);
    expect(pet.care.satiety).toBe(55); // 日减 20 后，普通猫粮 +25
    expect(itemCount(s, "cat_food_basic")).toBe(0);
    expect(logs.filter((message) => message.includes("自动照料机"))).toHaveLength(1);
  });

  it("事件选项造成低饱食后也立即喂食；缺粮汇总反馈同日限一次", () => {
    const s = setupCat(16);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    pet.care.satiety = 0;

    const noFood = tickCatAutoFeeder(s);
    expect(noFood).toHaveLength(1);
    expect(noFood[0]).toContain("猫粮不足");
    expect(tickCatAutoFeeder(s)).toEqual([]);

    addItem(s, "cat_food_basic", 1);
    const eventResult = applyEventChoice(s, "ev_cat_hungry", 0);
    expect(eventResult.ok).toBe(true);
    expect(pet.care.satiety).toBeGreaterThanOrEqual(AUTO_FEED_MIN_SATIETY);
    expect(itemCount(s, "cat_food_basic")).toBe(0);
  });
});

describe("自动照料机清洁", () => {
  it("干净度低于三分之一时恢复至 100，不自动治病且同日反馈限一次", () => {
    const s = setupCat(17);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    pet.care.hygiene = 33;
    pet.care.satiety = 90;
    pet.care.mood = 90;
    pet.sick = true;
    pet.consecutiveSickDays = 3;

    const logs = tickCatAutoFeeder(s);
    expect(pet.care.hygiene).toBe(100);
    expect(pet.sick).toBe(true);
    expect(pet.consecutiveSickDays).toBe(3);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("自动照料机");
    expect(logs[0]).toContain("完成清洁");
    expect(tickCatAutoFeeder(s)).toEqual([]);

    pet.care.hygiene = 34;
    expect(tickCatAutoFeeder(s)).toEqual([]);
    expect(pet.care.hygiene).toBe(34);
  });

  it("自动喂食保留旧效果但不会顺带治病", () => {
    const s = setupCat(18);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_good", 1);
    pet.care.satiety = 0;
    pet.care.mood = 80;
    pet.sick = true;
    pet.consecutiveSickDays = 2;

    tickCatAutoFeeder(s);
    expect(pet.care.satiety).toBe(35);
    expect(pet.sick).toBe(true);
    expect(pet.consecutiveSickDays).toBe(2);
  });

  it("跨日结算自动补粮不会间接治病", () => {
    const s = setupCat(25);
    const pet = s.pets[0];
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_basic", 1);
    pet.care.satiety = 49;
    pet.care.mood = 50;
    pet.sick = true;
    pet.consecutiveSickDays = 2;

    tickCatCareDaily(s);
    expect(pet.care.satiety).toBe(54);
    expect(pet.sick).toBe(true);
    expect(pet.consecutiveSickDays).toBe(3);
  });
});

describe("花鸟市场宠物寄养", () => {
  it("寄养和领回都限花鸟市场且免费，保留猫咪成长资料并清除携带状态", () => {
    const s = setupCat(19);
    const pet = s.pets[0];
    pet.level = 4;
    pet.exp = 23;
    pet.care.satiety = 17;
    pet.care.hygiene = 26;
    pet.sick = true;
    pet.consecutiveSickDays = 4;
    const cardPack = pet.cardPack;
    const money = s.player.money;
    const uid = pet.uid;

    expect(fosterCat(s, uid).ok).toBe(false);
    s.locationId = "flower_market";
    expect(fosterCat(s, uid).ok).toBe(true);
    expect(s.player.money).toBe(money);
    expect(isCatFostered(pet)).toBe(true);
    expect(pet.level).toBe(4);
    expect(pet.exp).toBe(23);
    expect(pet.care).toEqual({ satiety: 17, mood: 80, hygiene: 26 });
    expect(pet.cardPack).toBe(cardPack);
    expect(s.activePet).toBeUndefined();
    expect(activePetOf(s)).toBeUndefined();
    expect(availableCatsOf(s)).toHaveLength(0);
    expect(setActivePet(s, uid)).toBe(false);
    expect(unitFromPet(s, uid)).toBeNull();

    addItem(s, "cat_food_basic", 1);
    const moneyBeforeCare = s.player.money;
    expect(feedCat(s, pet, "cat_food_basic").ok).toBe(false);
    expect(cleanCat(s, pet).ok).toBe(false);
    expect(playWithCat(s, pet).ok).toBe(false);
    expect(trainCat(s, pet, "atk").ok).toBe(false);
    expect(itemCount(s, "cat_food_basic")).toBe(1);
    expect(s.player.money).toBe(moneyBeforeCare);

    const dailyBefore = { ...pet.care };
    tickCatCareDaily(s);
    expect(pet.care).toEqual(dailyBefore);
    expect(pet.sick).toBe(true);
    expect(pet.consecutiveSickDays).toBe(4);
    expect(pet.level).toBe(4);
    s.locationId = "home";
    expect(reclaimCat(s, uid).ok).toBe(false);
    s.locationId = "flower_market";
    expect(reclaimCat(s, uid).ok).toBe(true);
    expect(s.player.money).toBe(money);
    expect(isCatFostered(pet)).toBe(false);
    expect(s.pets[0]).toBe(pet);
    expect(pet.consecutiveSickDays).toBe(4);
    expect(reclaimCat(s, uid).ok).toBe(false);
  });

  it("自动照料不触碰寄养猫；连续生病日数在寄养期间冻结并从领回后继续", () => {
    const s = setupCat(20);
    const pet = s.pets[0];
    s.locationId = "flower_market";
    addItem(s, AUTO_FEEDER_ITEM_ID, 1);
    addItem(s, "cat_food_good", 2);
    pet.care.satiety = 0;
    pet.care.hygiene = 0;
    pet.care.mood = 0;
    pet.sick = true;
    pet.consecutiveSickDays = 6;
    expect(fosterCat(s, pet.uid).ok).toBe(true);

    tickCatCareDaily(s);
    tickCatCareDaily(s);
    expect(s.pets).toContain(pet);
    expect(pet.consecutiveSickDays).toBe(6);
    expect(pet.care.satiety).toBe(0);
    expect(pet.care.hygiene).toBe(0);
    expect(itemCount(s, "cat_food_good")).toBe(2);

    expect(reclaimCat(s, pet.uid).ok).toBe(true);
    tickCatCareDaily(s);
    expect(s.pets).not.toContain(pet);
    expect(s.activePet).toBeUndefined();
  });

  it("连续病满七个日结后跑掉，康复清零，旧档首次追踪从 1 天开始", () => {
    const s = setupCat(21);
    const pet = s.pets[0];
    pet.sick = true;
    pet.care.satiety = 0;
    pet.care.mood = 0;
    delete pet.consecutiveSickDays;
    for (let day = 0; day < 6; day++) {
      tickCatCareDaily(s);
      expect(s.pets).toContain(pet);
    }
    expect(pet.consecutiveSickDays).toBe(6);
    const finalLogs = tickCatCareDaily(s);
    expect(s.pets).not.toContain(pet);
    expect(finalLogs.some((line) => line.includes("连续生病七天") && line.includes("跑掉"))).toBe(true);

    const s2 = setupCat(24);
    const healthyPet = s2.pets[0];
    healthyPet.sick = true;
    healthyPet.consecutiveSickDays = 5;
    healthyPet.care.satiety = 60;
    healthyPet.care.mood = 60;
    addItem(s2, "cat_food_basic", 1);
    expect(feedCat(s2, healthyPet, "cat_food_basic").ok).toBe(true);
    expect(healthyPet.sick).toBe(false);
    expect(healthyPet.consecutiveSickDays).toBe(0);
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
    s.locationId = "park";
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
