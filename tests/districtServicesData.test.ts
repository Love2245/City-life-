import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import actionsData from "../src/game/data/actions.json";
import itemsData from "../src/game/data/items.json";
import housingData from "../src/game/data/housing.json";
import jobsData from "../src/game/data/jobs.json";
import locationsData from "../src/game/data/locations.json";
import regionsData from "../src/game/data/regions.json";
import minigamesData from "../src/game/data/minigames.json";
import { DISTRICT_FORTUNES } from "../src/game/data/districtFortunes";
import { EXHIBITIONS, getDistrictExhibition } from "../src/game/data/districtExhibitions";
import { createInitialState } from "../src/game/core/state";
import { visibleActionsAtLocation } from "../src/game/core/actions";

const actions = actionsData as Array<Record<string, any>>;
const items = itemsData.items as Array<Record<string, any>>;
const locations = locationsData as Array<Record<string, any>>;
const action = (id: string) => actions.find((entry) => entry.id === id)!;
const item = (id: string) => items.find((entry) => entry.id === id)!;
const location = (id: string) => locations.find((entry) => entry.id === id)!;
const games = minigamesData.games as Record<string, any>;

describe("1.48 新区生活服务数据契约", () => {
  it("数据主键唯一，消费、住房与小游戏引用全部可解析", () => {
    for (const definitions of [actions, items, jobsData, locations, regionsData]) {
      expect(new Set(definitions.map(({ id }) => id)).size).toBe(definitions.length);
    }
    for (const entry of actions) {
      expect(location(entry.locationId), entry.id).toBeDefined();
      if (entry.itemId) expect(item(entry.itemId), entry.id).toBeDefined();
      if (entry.housingId) expect([housingData.gov, ...housingData.nightly, ...housingData.lease, ...housingData.buy].some((tier) => tier.id === entry.housingId), entry.id).toBe(true);
    }
    const validGameIds = new Set([...actions.map(({ id }) => id), ...jobsData.map(({ id }) => id)]);
    for (const gameId of Object.keys(games)) expect(validGameIds.has(gameId), gameId).toBe(true);
  });

  it.each([
    ["boyue_talent_apartment", 650, 0.8, 5, 1100, "campus_engineering"],
  ])("%s 月租使用本地设施和完整生活设施", (id, price, recovery, moodBonus, rentCap, region) => {
    const tier = housingData.lease.find((entry) => entry.id === id);
    expect(tier).toMatchObject({ id, locationId: id, price, recovery, moodBonus, rentCap, rentGrowthRate: 0.05, region, area: "residential", facilities: ["rest", "shower", "cook"] });
    expect(location(id as string).publicHousingEntry).toBeUndefined();
    expect(action("sign_lease_" + id)).toMatchObject({ locationId: "housing_agency", housingId: id, handler: "sign_lease" });
  });

  it("营地每晚三十元，无烹饪设施、无帐篷购置前置", () => {
    expect(housingData.nightly.find(({ id }) => id === "camping_lodging")).toMatchObject({ price: 30, recovery: 0.7, moodBonus: 6, facilities: ["rest", "shower"], locationId: "camping_base", region: "development_reserve" });
    expect(action("camping_stay")).toMatchObject({ handler: "stay_hotel", housingId: "camping_lodging", duration: 0, requirements: { money: 30 } });
    expect(action("camping_stay").requirements.flag).toBeUndefined();
    expect(action("camping_barbecue")).toMatchObject({ duration: 1, effects: { money: -30, satiety: 45, mood: 8 } });
  });

  it.each(["dev_university", "boyue_engineering_college"])("%s 三种堂食餐无健康损失且只在校园供餐", (id) => {
    expect(location(id).openHours).toEqual({ start: 7, end: 21 });
    for (const [price, satiety] of [[6, 20], [10, 35], [15, 50]]) {
      const meal = action(id + "_canteen_" + price);
      expect(meal).toMatchObject({ locationId: id === "dev_university" ? "campus_teacher_canteen" : "campus_engineering_canteen", duration: 0.5, effects: { money: -price, satiety }, requirements: { money: price } });
      expect(meal.handler).toBeUndefined();
      expect(meal.itemId).toBeUndefined();
      expect(meal.effects.health ?? 0).toBe(0);
    }
  });

  it.each(["development_university", "boyue_university"])("%s 大学城公共街区不再设置首次开放日期", (id) => {
    expect(regionsData.find((entry) => entry.id === id)).not.toHaveProperty("openFrom");
  });

  it("东月道观的三项公益行动有各自周期与明确营业时间", () => {
    expect(location("moon_mountain").openHours).toBeNull();
    expect(action("moon_fortune")).toMatchObject({ handler: "district_fortune", duration: 0.25, effects: {}, requirements: { oncePerDay: "moon_fortune_day", notFlag: "church_baptized", hourRange: { start: 6, end: 18 } } });
    expect(action("moon_clinic")).toMatchObject({ handler: "district_clinic", duration: 0.5, effects: { health: 10, satiety: 10 } });
    expect(action("moon_clinic").requirements.oncePerDay).toBeUndefined();
    expect(action("moon_clinic").effects.cureStatuses).toBeUndefined();
    expect(action("moon_porridge")).toMatchObject({ duration: 0.25, effects: { satiety: 20 }, requirements: { oncePerDay: "moon_porridge_day" } });
    for (const id of ["moon_fortune", "moon_clinic", "moon_porridge"]) {
      expect(action(id).effects.money ?? 0).toBe(0);
      expect(action(id).requirements.hourRange).toEqual({ start: 6, end: 18 });
    }
    for (const id of ["church", "temple"]) expect(location(id).openHours).toEqual({ start: 6, end: 18 });
  });

  it("登山消耗与每天限制明确，不为满二十次设置禁用条件", () => {
    expect(action("moon_hike")).toMatchObject({ handler: "district_hike", duration: 2, effects: { stamina: -40, mood: 5, fitness: 1 }, requirements: { oncePerDay: "moon_hike_day" } });
    expect(action("moon_hike").requirements).toMatchObject({ attr: { stamina: 40, health: 40 }, noStatus: ["sick", "muscle_strain", "hungry", "depressed"] });
    expect(action("treasure_lake_walk").effects).toEqual(action("lake_walk").effects);
    expect(action("treasure_lake_run").effects).toEqual(action("lake_run").effects);
    expect(action("boyue_football_run").effects.stamina).toBe(action("lake_run").effects.stamina);
  });

  it("七档签概率合计百分之百，每档均有四句原创签文及解读", () => {
    expect(DISTRICT_FORTUNES.map(({ name }) => name)).toEqual(["大吉", "吉", "小吉", "平", "小凶", "凶", "大凶"]);
    expect(DISTRICT_FORTUNES.map(({ weight }) => weight)).toEqual([8, 17, 20, 30, 15, 7, 3]);
    expect(DISTRICT_FORTUNES.reduce((sum, { weight }) => sum + weight, 0)).toBe(100);
    expect(DISTRICT_FORTUNES.map(({ mood }) => mood)).toEqual([5, 3, 1, 0, -1, -3, -5]);
    expect(new Set(DISTRICT_FORTUNES.map(({ text }) => text)).size).toBe(7);
    for (const fortune of DISTRICT_FORTUNES) {
      expect(fortune.text.split("\n")).toHaveLength(4);
      expect(fortune.interpretation.length).toBeGreaterThan(30);
    }
  });

  it.each(["dev_museum", "dev_science_museum", "dev_art_gallery"])("%s 至少八件固定展品且无远程图依赖", (id) => {
    const exhibition = EXHIBITIONS[id];
    expect(exhibition.locationId).toBe(id);
    expect(exhibition.exhibits.length).toBeGreaterThanOrEqual(8);
    expect(new Set(exhibition.exhibits.map(({ id: exhibitId }) => exhibitId)).size).toBe(exhibition.exhibits.length);
    for (const entry of exhibition.exhibits) {
      expect(entry.caption.length).toBeGreaterThan(20);
      expect(entry.image).toMatch(/\.webp(?:$|\?)/);
      expect(entry.image).toContain("exhibitions/district/");
      const imageFile = entry.image!.split("/").at(-1)!.split("?")[0];
      expect(existsSync(resolve(process.cwd(), "src/assets/exhibitions/district", imageFile))).toBe(true);
      expect(entry.svg).toBeUndefined();
    }
    expect(location(id).openHours).toEqual({ start: 8, end: 18 });
    expect(action(id + "_exhibition")).toMatchObject({ handler: "district_exhibition", duration: 1, requirements: { oncePerDay: id + "_exhibition_day" } });
    expect(action(id + "_exhibition").effects).toEqual(id === "dev_art_gallery" ? { mood: 10 } : { intelligence: 1, mood: 5 });
  });

  it("博物馆和科技馆只陈列文物类型与真实展馆装置", () => {
    expect(EXHIBITIONS.dev_museum.exhibits.map(({ title }) => title)).toEqual([
      "新石器彩陶罐", "商周青铜礼器", "汉代陶俑", "唐代铜镜", "宋代青瓷瓶", "古代玉璧", "山水绢本立轴", "古代纹饰石刻",
    ]);
    expect(EXHIBITIONS.dev_science_museum.exhibits.map(({ title }) => title)).toEqual([
      "力学平衡台", "棱镜与光谱", "水压演示装置", "低压电路实验台", "声学共振展项", "太阳能发电模型", "可编程机械臂", "天体运行模型",
    ]);
  });

  it("美术馆按名次陈列二十幅名画改编作品，不显示作者", () => {
    const titles = [
      "《蒙娜丽莎》", "《星月夜》", "《最后的晚餐》", "《呐喊》", "《戴珍珠耳环的少女》",
      "《格尔尼卡》", "《维纳斯的诞生》", "《创造亚当》", "《夜巡》", "《记忆的永恒》",
      "《吻》", "《雅典学院》", "《日出·印象》", "《向日葵》", "《宫娥》",
      "《自由引导人民》", "《美国哥特式》", "《大碗岛的星期天下午》", "《雾海上的漫游者》", "《雪中猎人》",
    ];
    expect(EXHIBITIONS.dev_art_gallery.exhibits).toHaveLength(20);
    expect(EXHIBITIONS.dev_art_gallery.exhibits.map(({ rank }) => rank)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(EXHIBITIONS.dev_art_gallery.exhibits.map(({ title }) => title)).toEqual(titles);
    expect(EXHIBITIONS.dev_art_gallery.exhibits.every((entry) => !("artist" in entry))).toBe(true);
    for (let month = 1; month <= 12; month++) {
      const exhibition = getDistrictExhibition("dev_art_gallery", month)!;
      expect(exhibition.currentTheme).toBeUndefined();
      expect(exhibition.exhibits).toBe(EXHIBITIONS.dev_art_gallery.exhibits);
    }
    expect(getDistrictExhibition("unknown")).toBeUndefined();
  });

  it.each(["dev_food_street", "boyue_food_street", "boyue_snack_street"])("%s 摆摊共享旧项目，单独限制每天次数", (id) => {
    const stall = action("stall_" + id);
    expect(stall).toMatchObject({ locationId: id, handler: "work_project", projectId: "snack_stall", duration: 2, requirements: { skill: { cooking: 2 }, oncePerDay: "stall_" + id + "_day" } });
    expect(games[stall.id]).toEqual(games.stall_market_fair);
    expect(stall.requirements.oncePerDay).not.toBe(action("stall_snack_street").requirements.oncePerDay);
  });

  it.each([
    ["job_cafe_staff", "job_boyue_cafe_staff", "boyue_cafe"],
    ["job_convenience_clerk", "job_boyue_convenience_clerk", "boyue_convenience_store"],
    ["job_waiter_fast", "job_boyue_waiter_fast", "boyue_fast_food"],
    ["job_waiter_west", "job_boyue_waiter_west", "boyue_western_restaurant"],
    ["job_netbar_admin", "job_boyue_netbar_admin", "boyue_internet_cafe"],
  ])("%s 分店使用独立岗位 ID 和当地开班地点", (oldId, newId, locationId) => {
    const oldJob = jobsData.find(({ id }) => id === oldId)!;
    const newJob = jobsData.find(({ id }) => id === newId)!;
    expect(newJob.locationId).toBe(locationId);
    expect(newJob.effects).toEqual(oldJob.effects);
    expect(newJob.duration).toBe(oldJob.duration);
    expect(games[newId]).toEqual(games[oldId]);
  });

  it("夜总会酒保周一至周五跨夜上班，驻唱只挂清吧且无静态工资", () => {
    expect(jobsData.find(({ id }) => id === "job_boyue_bartender")).toMatchObject({ kind: "formal", locationId: "boyue_nightclub", duration: 8, startHour: 18, endHour: 2, restDays: ["sat", "sun"], effects: { money: 150, stamina: -50, stress: 10, skills: { service: 1 } } });
    expect(games.job_boyue_bartender).toMatchObject({ type: "restaurant", mode: "cup" });
    expect(action("boyue_lounge_singing")).toMatchObject({ locationId: "boyue_lounge_bar", handler: "district_singer", duration: 2, requirements: { attr: { charm: 25 }, hourRange: { start: 18, end: 4 } } });
    expect(action("boyue_lounge_singing").effects.money).toBeUndefined();
    expect(actions.filter(({ handler }) => handler === "district_singer")).toHaveLength(1);
    expect(games.boyue_lounge_singing.type).toBe("rhythm");
    expect(games.boyue_lounge_singing.title).toContain("演唱");
  });

  it.each(["boyue_nightclub", "boyue_lounge_bar"])("%s 六种酒逐杯价格、效果与时长一致", (id) => {
    const drinks = actions.filter((entry) => entry.locationId === id && entry.handler === "district_alcohol" && entry.effects.money < 0);
    expect(drinks.map(({ effects }) => -effects.money)).toEqual([25, 60, 120, 300, 800, 1500]);
    expect(drinks.map(({ effects }) => effects.mood)).toEqual([5, 8, 10, 12, 15, 20]);
    for (const drink of drinks) expect(drink).toMatchObject({ duration: 0.25, effects: { health: -1, stamina: -2 }, requirements: { money: -drink.effects.money } });
  });

  it("免费酒只在夜总会兑换最低档，无静态现金收益", () => {
    const free = actions.filter(({ handler }) => handler === "district_free_drink");
    expect(free).toHaveLength(1);
    expect(free[0]).toMatchObject({ locationId: "boyue_nightclub", duration: 0.25, effects: { mood: 5, health: -1, stamina: -2 } });
    expect(free[0].effects.money ?? 0).toBe(0);
  });

  it("普通饮料与能量饮料效果明确，所有咖啡分店恢复二十五体力", () => {
    expect(item("drink")).toMatchObject({ useEffects: { stamina: 10, satiety: 4, mood: 3 } });
    expect(item("drink").desc).toContain("饮用后 +4 饱腹、+10 体力、+3 心情");
    expect(item("energy_drink")).toMatchObject({ shopPrice: 25, startOffer: false, useEffects: { stamina: 20, satiety: 4, mood: 3 } });
    for (const id of ["buy_drink_convenience", "boyue_buy_drink_convenience", "dev_food_street_tofu", "boyue_snack_street_tofu"]) {
      const purchase = action(id);
      // 2026-10-20 文案改自然叙述：动作描述不再罗列 +N 饱腹/体力（数值由道具说明承担），
      // 但仍须讲清「带走进背包、喝的时候才生效 / 在店里当场生效」。
      expect(purchase.desc).toContain("背包");
      expect(purchase.desc).toMatch(/店里|当场|喝的时候/);
    }
    for (const id of ["convenience_store_energy_drink", "boyue_convenience_store_energy_drink", "boyue_sports_store_energy_drink"]) {
      expect(action(id).desc).toContain("提神");
    }
    for (const id of ["drink_cafe", "boyue_drink_cafe"]) expect(action(id)).toMatchObject({ duration: 0.5, effects: { money: -25, stamina: 25, mood: 8 } });
  });

  it.each([
    ["football_jersey", 99, "clothes", 1],
    ["basketball_jersey", 89, "clothes", 1],
    ["sports_shorts", 69, "pants", 0],
  ])("%s 体育衣物的槽位、价格及魅力正确", (id, price, slot, charm) => {
    expect(item(id as string)).toMatchObject({ shopPrice: price, slot, outfitLayer: id, startOffer: false });
    expect(item(id as string).bonus?.charm ?? 0).toBe(charm);
    expect(action("buy_" + id)).toMatchObject({ itemId: id, locationId: "boyue_sports_store", handler: "buy_item", effects: { money: -(price as number) } });
  });

  it("五种玩偶不作为开局装备或消耗品，库存可重复收藏", () => {
    for (const id of ["plush_bear", "plush_rabbit", "plush_cat", "plush_panda", "plush_dinosaur"]) {
      expect(item(id)).toMatchObject({ consumable: false, startOffer: false });
      expect(item(id).slot).toBeUndefined();
      expect(item(id).useEffects).toBeUndefined();
    }
  });

  it("钓鱼装备三档价格正确，鱼饵一桶二十五次，鱼桶用永久标记避免重复收费", () => {
    for (const [id, price] of [["fishing_rod", 80], ["fishing_bait", 20], ["fishing_bucket", 25]]) expect(action("buy_" + id)).toMatchObject({ locationId: "camping_base", itemId: id, handler: "buy_item", effects: { money: -(price as number) } });
    expect(action("buy_fishing_bait")).toMatchObject({ itemQuantity: 25, name: expect.stringContaining("20元 / 25次"), requirements: { money: 20 } });
    expect(item("fishing_bait")).toMatchObject({ shopPrice: 20 });
    expect(action("buy_fishing_rod").requirements.notFlag).toBe("fishing_rod_owned");
    expect(action("buy_fishing_bucket").requirements.notFlag).toBe("fishing_bucket_owned");
  });

  it.each([
    ["snack_street", ["snack_skewer", "snack_noodles", "snack_tofu"], "老街"],
    ["dev_food_street", ["bento", "sandwich", "drink"], "师范大学城"],
    ["boyue_food_street", ["snack_skewer", "snack_noodles", "bento"], "工程学院"],
    ["boyue_snack_street", ["snack_skewer", "snack_noodles", "drink"], "泊月夜市"],
  ])("%s 餐点绑定当地风格且显示名与背包物品一致", (locationId, expectedItems, placeLabel) => {
    const meals = actions.filter((entry) => entry.locationId === locationId && entry.handler === "buy_food");
    expect(meals.map((entry) => entry.itemId)).toEqual(expectedItems);
    for (const meal of meals) {
      expect(meal.name).toContain(item(meal.itemId).name);
      expect(meal.effects.money).toBe(-meal.requirements.money);
      expect(meal.effects.log).toContain(placeLabel);
      // 「背包」是这条文案的硬约束（带走才进背包、不是当场吃掉），措辞可自然化。
      expect(meal.desc).toContain("背包");
    }
  });

  it("未开放赛事不收费，旧公司占位已撤下，电玩城由真实玩法面板提供入口", () => {
    const placeholders = actions.filter(({ handler }) => handler === "district_placeholder");
    expect(placeholders.map(({ id }) => id).sort()).toEqual(["boyue_swimming_match", "boyue_football_match", "boyue_basketball_match"].sort());
    for (const entry of placeholders) expect(entry).toMatchObject({ duration: 0, effects: {} });
    expect(actions.filter(({ locationId }) => locationId === "boyue_arcade")).toEqual([]);
    expect(location("airport").locked).toBe(true);
    expect(location("boyue_central_fountain")).toBeUndefined();
  });

  it('孵化基地转为纯办公，撤下旧住房租约和公司占位入口',()=>{const s=createInitialState();s.locationId='housing_agency';expect(visibleActionsAtLocation(s,'housing_agency').some(a=>a.id==='sign_lease_dev_incubator')).toBe(false);expect(housingData.lease.some(h=>(h.id as string)==='dev_incubator')).toBe(false);expect(actions.some(a=>a.id==='dev_incubator_company')).toBe(false);expect(visibleActionsAtLocation(s,'dev_incubator').some(a=>a.handler==='district_placeholder')).toBe(false);});
});
