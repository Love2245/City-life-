import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { actionTagsOf, canPerform, exitLocation, getAction, getLocation, isLocationUnlocked, isLocationVisible, locationAvailabilityAtArrival, locationLockReason, moveTo, performAction, regionTravelPlan, travelToRegion } from "../src/game/core/actions";
import { gameDay, fromLinearDay, linearDay, weekdayOf } from "../src/game/core/calendar";
import { clinicWeekOf, pickDistrictFortune, todayDistrictFortune } from "../src/game/core/districtServices";
import { DISTRICT_FORTUNES } from "../src/game/data/districtFortunes";
import { getMaxStamina } from "../src/game/core/stats";
import { sleep } from "../src/game/core/time";
import { selectLodging, signLease } from "../src/game/core/housing";
import { residenceLocationId, isResidenceBuildingVisible } from "../src/game/core/residence";
import { migrateSave } from "../src/game/core/migrate";
import { startNetbarSession, onNetbarMachine } from "../src/game/core/projects";
const clone = <T>(s: T): T => JSON.parse(JSON.stringify(s));
function at(locationId = "moon_mountain", month = 9, day = 1, hour = 8) {
  const s = createInitialState(1482026); s.player.money = 5000;
  s.player.attrs = { stamina: 100, health: 50, satiety: 50, mood: 50, hygiene: 100 };
  Object.assign(s.time, { year: 2026, month, day, hour, minute: 0 });
  s.locationId = locationId; s.region = getLocation(locationId)?.regions?.[0] ?? "development"; s.area = s.region;
  s.navStack = ["map", s.region]; s.weather = { id: "sunny", lastRollDay: gameDay(s.time) };
  return s;
}
const minute = (s: ReturnType<typeof at>) => linearDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;

describe("鱼饵整桶采购", () => {
  it("保留旧库存，并按物价系数显示价格和实际扣款", () => {
    const s = at("camping_base", 9, 1, 10);
    s.economy.priceIndex = 1.5;
    s.player.money = 500;
    s.inventory.fishing_bait = 3;
    const bait = getAction("buy_fishing_bait")!;
    expect(actionTagsOf(bait, s).map(({ text }) => text)).toContain("-30💰");
    const result = performAction(s, bait.id);
    expect(result.ok).toBe(true);
    expect(result.result?.deltas).toContainEqual(expect.objectContaining({ key: "money", value: -30 }));
    expect(s.player.money).toBe(470);
    expect(s.inventory.fishing_bait).toBe(28);
  });
});

describe("新地图门禁、免费边界与兼容落点", () => {
  it.each(["development", "boyue"])("%s总览道路只改导航，不消费或执行任何日历结算", source => {
    const s = at("map", 9, 1, 23); s.region = source; s.area = source;
    s.time.minute = 59; const before = clone(s); const target = source === "development" ? "boyue" : "development";
    expect(regionTravelPlan(s, target)).toMatchObject({ hours: 0, fare: 0 });
    expect(travelToRegion(s, target).ok).toBe(true);
    for (const key of ["time", "player", "living", "flags", "weekly", "work", "rng"] as const) expect(s[key]).toEqual(before[key]);
    expect(s.locationId).toBe("map"); expect(s.region).toBe(target);
  });
  it("二级区域之间仍收费耗时，返回树堰区仍是长途", () => {
    const s = at("map"); s.region = "development_university"; s.area = s.region;
    expect(regionTravelPlan(s, "boyue_university")).toMatchObject({ hours: .5, fare: 2 });
    expect(regionTravelPlan(s, "downtown")).toMatchObject({ hours: 1, fare: 5 });
  });
  it.each(["dev_university","dev_food_street","dev_incubator","boyue_engineering_college","boyue_food_street","boyue_talent_apartment","boyue_internet_cafe"])("%s按校内与公共街区分别验证门禁",id=>{const s=at('map',9,1);const school=['dev_university','dev_incubator','boyue_engineering_college','boyue_talent_apartment'].includes(id);expect(isLocationUnlocked(s,getLocation(id))).toBe(!school);if(school){expect(locationLockReason(s,getLocation(id))).toBe('需要学生通行证');s.flags.item_student_pass=true;if(id==='boyue_talent_apartment'){s.locationId='housing_agency';expect(signLease(s,id).ok).toBe(true);}expect(isLocationUnlocked(s,getLocation(id))).toBe(true);}});
  it("门禁按预计抵达日期，8月30日跨午夜可到9月1日", () => {
    const s = at("map", 8, 30, 23); s.time.minute = 40; s.region = "development_culture"; s.area = s.region;
    expect(locationAvailabilityAtArrival(s, getLocation("dev_food_street")).unlocked).toBe(true);
    expect(moveTo(s, "dev_food_street").ok).toBe(true); expect(s.time).toMatchObject({ month: 9, day: 1 });
  });
  it('孵化基地为纯办公，旧签租入口失效且不扣钱或发住房',()=>{const s=at('dev_incubator',9,1,10),before=JSON.stringify(s);expect(performAction(s,'sign_lease_dev_incubator').ok).toBe(false);expect(JSON.stringify(s)).toBe(before);s.locationId='housing_agency';expect(signLease(s,'dev_incubator').ok).toBe(false);expect(s.living.lease).toBeNull();});
  it("行动接口不能远程购买或签租约", () => {
    const s = at("dev_food_street");
    const beforeMoney = s.player.money;
    const beforeInventory = clone(s.inventory);
    const beforeLiving = clone(s.living);
    expect(performAction(s, "buy_fishing_rod")).toMatchObject({ ok: false, reason: "请先前往对应地点再进行此操作" });
    expect(performAction(s, "sign_lease_boyue_talent_apartment")).toMatchObject({ ok: false, reason: "请先前往对应地点再进行此操作" });
    expect(s.player.money).toBe(beforeMoney);
    expect(s.inventory).toEqual(beforeInventory);
    expect(s.living).toEqual(beforeLiving);
  });
  it.each([["airport", "boyue"], ["boyue_central_fountain", "boyue_night_market"]])("旧落点%s转至%s且不消费", (id, region) => {
    const s = at(id); const money = s.player.money, t = minute(s); const loaded = migrateSave(s);
    expect(loaded).toMatchObject({ locationId: "map", region }); expect(minute(loaded)).toBe(t); expect(loaded.player.money).toBe(money);
    expect(migrateSave(loaded)).toEqual(loaded);
  });
});
describe("道观额度与永久成长", () => {
  it("签文权重遗漏总概率时，以最后一支签文兜底", () => {
    const reducedWeights = DISTRICT_FORTUNES.map((fortune) => ({ ...fortune, weight: 1 }));
    expect(pickDistrictFortune(100, reducedWeights)).toBe(reducedWeights.at(-1));
  });
  it("签文及解释缓存，重复点击/读档无重抽无再奖励", () => {
    const s = at(); const before = minute(s); expect(performAction(s, "moon_fortune").ok).toBe(true);
    const fortune = todayDistrictFortune(s)!; expect(fortune.text.split("\n")).toHaveLength(4); expect(fortune.interpretation.length).toBeGreaterThan(20);
    expect(minute(s) - before).toBe(15); const saved = clone(s);
    expect(performAction(s, "moon_fortune").ok).toBe(false); expect(s).toEqual(saved);
    expect(todayDistrictFortune(migrateSave(s))).toEqual(fortune);
  });
  it("洗礼仅限制抽签，义诊领粥和登山仍可做", () => {
    const s = at(); s.flags.church_baptized = true;
    expect(canPerform(s, getAction("moon_fortune")!).ok).toBe(false);
    for (const id of ["moon_clinic", "moon_porridge", "moon_hike"]) expect(canPerform(s, getAction(id)!).ok).toBe(true);
    s.time.hour = 18; expect(canPerform(s, getAction("moon_clinic")!).ok).toBe(false); expect(canPerform(s, getAction("moon_hike")!).ok).toBe(true);
  });
  it("义诊周一重置，不清除疾病和伤势", () => {
    const s = at(); Object.assign(s.time, fromLinearDay(linearDay(s.time) + (6 - weekdayOf(s.time) + 7) % 7));
    s.statuses = [{ id: "muscle_strain", daysLeft: 3 } as any]; const week = clinicWeekOf(s);
    expect(performAction(s, "moon_clinic").ok).toBe(true); expect(s.player.attrs.health).toBe(60); expect(s.player.attrs.satiety).toBe(58);
    expect(s.statuses.some(x => x.id === "muscle_strain")).toBe(true); expect(performAction(s, "moon_clinic").ok).toBe(false);
    Object.assign(s.time, fromLinearDay(linearDay(s.time) + 1)); expect(clinicWeekOf(s)).toBe(week + 7); expect(performAction(s, "moon_clinic").ok).toBe(true);
  });
  it("领粥每日一次，次日重新开放", () => {
    const s = at(); expect(performAction(s, "moon_porridge").ok).toBe(true); const old = clone(s);
    expect(performAction(s, "moon_porridge").ok).toBe(false); expect(s).toEqual(old);
    s.time.day++; expect(performAction(s, "moon_porridge").ok).toBe(true);
  });
  it("登山上限最多20，与命运上限独立，上限后仍有效果", () => {
    const s = at(); s.player.staminaCapBonus = 10;
    for (let i = 0; i < 21; i++) {
      Object.assign(s.time, fromLinearDay(linearDay(at().time) + i), { hour: 8, minute: 0 });
      s.statuses = []; s.player.attrs.stamina = 100; s.player.attrs.satiety = 100;
      const fit = s.player.stats.fitness, cap = s.player.hikingStaminaCapBonus ?? 0;
      const r = performAction(s, "moon_hike"); expect(r.ok).toBe(true); expect(s.player.stats.fitness).toBe(fit + 1);
      expect(s.player.hikingStaminaCapBonus).toBe(Math.min(20, cap + 1)); expect(s.player.staminaCapBonus).toBe(10);
      expect(performAction(s, "moon_hike").ok).toBe(false);
      if (i === 20) expect(r.result?.verdict).toContain("山风");
    }
    const loaded = migrateSave(s); expect(loaded.player.hikingStaminaCapBonus).toBe(20); expect(getMaxStamina(loaded)).toBe(getMaxStamina(s));
  });
});
describe("住房、持久用品与饮酒", () => {
  it("泊月人才公寓在校内展示，签约发证后可以往返", () => {
    const id = "boyue_talent_apartment";
    const s = at("housing_agency", 9, 1, 10);
    const actionId = `sign_lease_${id}`;
    const location = getLocation(id)!;
    expect(isResidenceBuildingVisible(s, id)).toBe(false);
    expect(isLocationVisible(s, id)).toBe(false);
    expect(isLocationUnlocked(s, location)).toBe(false);
    const beforeAttempt = clone(s);
    expect(moveTo(s, id).ok).toBe(false);
    expect(s).toEqual(beforeAttempt);

    expect(performAction(s, actionId).ok).toBe(true);
    expect(s.living.mode).toBe("lease");
    expect(s.living.lease?.housingId).toBe(id);
    expect(isResidenceBuildingVisible(s, id)).toBe(true);
    expect(isLocationVisible(s, id)).toBe(true);
    expect(isLocationUnlocked(s, location)).toBe(true);

    expect(moveTo(s, id).ok).toBe(true);
    expect(s.locationId).toBe(id);
    expect(exitLocation(s).ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe(location.regions?.[0]);
    expect(moveTo(s, id).ok).toBe(true);
    expect(s.locationId).toBe(id);
  });
  it('人才公寓签约发放校园通行证，孵化基地不再接受租住',()=>{const s=at('housing_agency',9,1,10);expect(signLease(s,'dev_incubator').ok).toBe(false);expect(signLease(s,'boyue_talent_apartment').ok).toBe(true);expect(s.flags.item_student_pass).toBe(true);expect(isLocationUnlocked(s,getLocation('boyue_talent_apartment'))).toBe(true);});
  it("未签租约不影响公共露营住宿入口", () => {
    const s = at();
    expect(isResidenceBuildingVisible(s, "camping_base")).toBe(true);
  });
  it("营地外宿保留30日原租约，睡眠不重复扣房租", () => {
    const s = at("rental_apartment"); expect(signLease(s, "rental_apartment").ok).toBe(true); const lease = clone(s.living.lease);
    s.locationId = "camping_base"; s.region = "development_reserve"; s.area = s.region; s.time.hour = 22;
    const money = s.player.money; expect(selectLodging(s, "camping_lodging")).toBe(true); expect(residenceLocationId(s)).toBe("camping_base");
    sleep(s, 8); expect(s.living.lease).toEqual(lease); expect(s.player.money).toBe(money - 30); expect(s.living.awayNight?.lodgingId).toBe("camping_lodging");
  });
  it("鱼桶只收费一次且读档仍永久持有", () => {
    const s = at("camping_base"); const money = s.player.money;
    expect(performAction(s, "buy_fishing_bucket").ok).toBe(true); expect(s.player.money).toBe(money - 25);
    expect(s.inventory.fishing_bucket).toBe(1); expect(s.flags.fishing_bucket_owned).toBe(true);
    const saved = clone(s); expect(performAction(s, "buy_fishing_bucket").ok).toBe(false); expect(s).toEqual(saved);
    expect(migrateSave(s).flags.fishing_bucket_owned).toBe(true);
  });
  it("鱼竿只收费一次且旧库存读档后锁定重复购买", () => {
    const s = at("camping_base"); const money = s.player.money;
    expect(performAction(s, "buy_fishing_rod").ok).toBe(true); expect(s.player.money).toBe(money - 80);
    expect(s.inventory.fishing_rod).toBe(1); expect(s.flags.fishing_rod_owned).toBe(true);
    const saved = clone(s); expect(performAction(s, "buy_fishing_rod")).toMatchObject({ ok: false, reason: "已经有鱼竿了，无需重复购买" }); expect(s).toEqual(saved);
    const legacy = clone(s); delete legacy.flags.fishing_rod_owned;
    expect(migrateSave(legacy).flags.fishing_rod_owned).toBe(true);
  });
  it("宠物用品店和宠物医院分区都能在花鸟市场购买", () => {
    const s = at("flower_market", 9, 1, 10);
    const food = getAction("cat_buy_cat_food_basic")!;
    expect(canPerform(s, food)).toMatchObject({ ok: true });
    const money = s.player.money;
    expect(performAction(s, food.id).ok).toBe(true);
    expect(s.inventory.cat_food_basic).toBeGreaterThan(0);
    expect(s.player.money).toBeLessThan(money);

    const hospitalItem = getAction("cat_buy_cat_potion")!;
    expect(hospitalItem.locationId).toBe("pet_hospital");
    expect(canPerform(s, hospitalItem)).toMatchObject({ ok: true });

    s.locationId = "market";
    expect(performAction(s, food.id)).toMatchObject({ ok: false, reason: "请先前往对应地点再进行此操作" });
  });
  it("两酒吧跨午夜累积，第三第五杯警告，第六杯回家八小时", () => {
    const s = at("boyue_nightclub", 9, 1, 23); s.time.minute = 30; s.player.attrs.health = 90;
    for (let i = 1; i <= 5; i++) {
      if (i === 4) s.locationId = "boyue_lounge_bar";
      expect(performAction(s, `boyue_${i >= 4 ? "lounge" : "nightclub"}_alcohol_25`).ok).toBe(true);
      expect(s.districtServices?.alcoholCups).toBe(i);
      if (i === 3 || i === 5) expect(s.districtServices?.alcoholWarning).toBe(i);
    }
    const t = minute(s), r = performAction(s, "boyue_lounge_alcohol_25"); expect(r.ok).toBe(true);
    expect(minute(s) - t).toBe(495); expect(s.districtServices?.alcoholCups).toBe(0);
    expect(s.locationId).toBe(residenceLocationId(s)); expect(s.districtServices?.alcoholWarning).toBe(6);
  });
  it("一次睡满六小时清零，两次三小时不会清零", () => {
    const s = at(); s.districtServices = { alcoholCups: 4 }; s.locationId = residenceLocationId(s);
    sleep(s, 3); sleep(s, 3); expect(s.districtServices.alcoholCups).toBe(4); sleep(s, 6); expect(s.districtServices.alcoholCups).toBe(0);
  });
  it("新网吧实际提供机位，反复进入原地仍能使用", () => {
    const s = at("boyue_internet_cafe"); expect(startNetbarSession(s).ok).toBe(true); expect(onNetbarMachine(s)).toBe(true);
    expect(moveTo(s, "boyue_internet_cafe").ok).toBe(true); expect(onNetbarMachine(s)).toBe(true);
  });
});
