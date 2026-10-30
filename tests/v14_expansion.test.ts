import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version";
import packageMetadata from "../package.json";
import type { GameState } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import {
  actionsAtLocation,
  canPerform,
  getAction,
  getLocation,
  performAction,
  purchaseIntercityTicket,
  rideIntercityTicket,
  travelToRegion,
  visibleActionsAtLocation,
} from "../src/game/core/actions";
import {
  boardIntercityTicket,
  buyIntercityTicket,
  fareOfIntercity,
  nextDeparture,
  planTransit,
  ticketStatus,
  INTERCITY_BUS_FARE,
  INTERCITY_BUS_HOURS,
  INTERCITY_CAR_HOURS,
  INTERCITY_TRAIN_FARE,
  INTERCITY_TRAIN_HOURS,
  SUBWAY_FARE,
  SUBURB_BUS_FARE,
} from "../src/game/core/transit";
import { getRegion, locationsOfRegion } from "../src/game/core/regions";
import {
  adoptSmallPet,
  checkupSmallPet,
  comfortSmallPet,
  feedSmallPet,
  tickSmallPetsDaily,
} from "../src/game/core/smallPets";
import { itemCount, getItem } from "../src/game/core/items";
import { getMiniGameConfig, getMiniGameConfigFor } from "../src/game/core/minigame";
import { applyForJob, completeWork, getJobDef, isRestDay, localJobsOf, performJob } from "../src/game/core/jobs";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";

function atLocation(state: GameState, locationId: string, region: string): void {
  state.locationId = locationId;
  state.region = region;
  state.area = region;
  state.navStack = [];
}

function atDowntownStation(state: GameState, locationId = "bus_station"): void {
  atLocation(state, locationId, "downtown_station");
}

describe("1.4 地图结构", () => {
  it("版本与老城区显示名更新，内部 id 保持兼容", () => {
    expect(VERSION).toBe("1.49.0");
    expect(packageMetadata.version).toBe(VERSION);
    expect(getRegion("downtown_station")?.name).toBe("老城区");
    expect(getLocation("flower_market")?.regions).toContain("downtown_station");
    expect(getLocation("snack_street")?.regions).toContain("downtown_station");
    expect(getLocation("school")?.regions).toContain("downtown_station");
    expect(locationsOfRegion("suburban_edge").map((loc) => loc.id)).toEqual(
      expect.arrayContaining(["suburb_bus_station", "suburb_train_station"]),
    );
  });

  it("老城区及车站直接开放，不再要求车站通行证", () => {
    const state = createInitialState();
    expect(travelToRegion(state, "downtown_station").ok).toBe(true);
    expect(getRegion("downtown_station")?.unlockFlag).toBeUndefined();
    expect(getLocation("bus_station")?.unlockFlag).toBeUndefined();
    expect(getLocation("high_speed_rail")?.unlockFlag).toBeUndefined();
    expect(getAction("apply_station_pass")).toBeUndefined();
  });

  it("花鸟市场旧宠物设施入口迁入，但猫咪 action id 继续可查", () => {
    expect(getLocation("pet_store")?.regions).toEqual([]);
    expect(getLocation("pet_hospital")?.regions).toEqual([]);
    expect(actionsAtLocation("flower_market").some((a) => a.id === "pet_adopt")).toBe(true);
    expect(actionsAtLocation("flower_market").some((a) => a.handler === "treat_injury")).toBe(true);
  });

  it("花鸟市场周末摊位工作日隐藏，绿植和宠物服务仍每日存在", () => {
    const weekday = createInitialState();
    weekday.time.day = 3; // 2026-08-03，周一
    weekday.time.hour = 10;
    const visibleWeekday = visibleActionsAtLocation(weekday, "flower_market").map((a) => a.id);
    expect(visibleWeekday).not.toContain("buy_flower_flower_market");
    expect(visibleWeekday).not.toContain("small_pet_adopt_bird");
    expect(visibleWeekday).not.toContain("small_pet_adopt_goldfish");
    expect(visibleWeekday).toContain("buy_plant_flower_market");
    expect(visibleWeekday).toContain("pet_adopt");

    const weekend = createInitialState(); // 开局 2026-08-01，周六
    weekend.time.hour = 10;
    const visibleWeekend = visibleActionsAtLocation(weekend, "flower_market").map((a) => a.id);
    expect(visibleWeekend).toEqual(expect.arrayContaining(["buy_flower_flower_market", "small_pet_adopt_bird", "small_pet_adopt_goldfish"]));
  });
});

describe("1.4 城际车票与班次", () => {
  it("巴士/火车的票价、耗时和下一班次符合规则", () => {
    const s = createInitialState();
    s.time.hour = 6;
    s.time.minute = 1;
    expect(fareOfIntercity("bus")).toBe(INTERCITY_BUS_FARE);
    expect(fareOfIntercity("train")).toBe(INTERCITY_TRAIN_FARE);
    expect(INTERCITY_BUS_HOURS).toBe(1.25);
    expect(INTERCITY_TRAIN_HOURS).toBe(1);
    expect(nextDeparture(s.time, "bus")).toEqual({ day: 0, minute: 420 });
    expect(nextDeparture(s.time, "train")).toEqual({ day: 0, minute: 540 });
    s.time.hour = 18;
    s.time.minute = 1;
    expect(nextDeparture(s.time, "bus")).toEqual({ day: 1, minute: 360 });
    expect(nextDeparture(s.time, "train")).toEqual({ day: 0, minute: 1260 });
  });

  it("购票立即扣款，离站后回到原站仍可在绑定分钟检票", () => {
    const s = createInitialState();
    atDowntownStation(s, "bus_station");
    s.time.hour = 6;
    s.time.minute = 0;
    const moneyBefore = s.player.money;
    const bought = purchaseIntercityTicket(s, "bus");
    expect(bought.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - INTERCITY_BUS_FARE);
    expect(s.intercityTicket?.destinationStationId).toBe("suburb_bus_station");
    expect(ticketStatus(s)).toBe("due");

    atLocation(s, "flower_market", "downtown_station");
    expect(rideIntercityTicket(s).ok).toBe(false);
    atDowntownStation(s, "bus_station");
    const ride = rideIntercityTicket(s);
    expect(ride.ok).toBe(true);
    expect(s.locationId).toBe("map");
    expect(s.region).toBe("suburban_edge");
    expect(s.navStack).toEqual(["map", "suburb", "suburban_edge"]);
    expect(s.time.hour).toBe(7);
    expect(s.time.minute).toBe(15);
    expect(s.intercityTicket).toBeUndefined();
  });

  it("只能在购票车站上车，火车返回市区也使用对应车站", () => {
    const s = createInitialState();
    atDowntownStation(s, "high_speed_rail");
    s.time.hour = 8;
    s.time.minute = 0;
    expect(buyIntercityTicket(s, "train", "high_speed_rail").ok).toBe(true);
    s.time.hour = 9;
    atLocation(s, "bus_station", "downtown_station");
    expect(boardIntercityTicket(s, "bus_station").ok).toBe(false);
    atLocation(s, "high_speed_rail", "downtown_station");
    const boarded = boardIntercityTicket(s, "high_speed_rail");
    expect(boarded.ok).toBe(true);
    expect(boarded.ticket?.destinationStationId).toBe("suburb_train_station");

    const rideState = createInitialState();
    atDowntownStation(rideState, "high_speed_rail");
    rideState.time.hour = 9;
    rideState.time.minute = 0;
    expect(purchaseIntercityTicket(rideState, "train").ok).toBe(true);
    const trainTicket = rideState.intercityTicket;
    expect(trainTicket?.departureMinute).toBe(540);
    const trainRide = rideIntercityTicket(rideState);
    expect(trainRide.ok).toBe(true);
    expect(rideState.locationId).toBe("map");
    expect(rideState.region).toBe("suburban_edge");
    expect(rideState.navStack).toEqual(["map", "suburb", "suburban_edge"]);
  });

  it("旧档已购 35 元、2.5 小时车票迁移后沿用原时长且检票不二次扣款", () => {
    const state = createInitialState();
    atDowntownStation(state, "bus_station");
    state.time.hour = 6;
    state.time.minute = 0;
    state.player.money = 965;
    state.intercityTicket = {
      mode: "bus",
      originStationId: "bus_station",
      destinationStationId: "suburb_bus_station",
      departureDay: gameDay(state.time),
      departureMinute: 360,
      fare: 35,
      durationHours: 2.5,
    };
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)));
    const savedMoney = loaded.player.money;
    expect(loaded.intercityTicket?.durationHours).toBe(2.5);
    expect(rideIntercityTicket(loaded).ok).toBe(true);
    expect(loaded.player.money).toBe(savedMoney);
    expect(loaded.time.hour).toBe(8);
    expect(loaded.time.minute).toBe(30);
  });

  it("错过班次时车票作废且不退款，已有有效票不能重复买票", () => {
    const s = createInitialState();
    atDowntownStation(s);
    s.time.hour = 6;
    s.time.minute = 0;
    const before = s.player.money;
    expect(buyIntercityTicket(s, "bus", "bus_station").ok).toBe(true);
    expect(buyIntercityTicket(s, "bus", "bus_station").ok).toBe(false);
    s.time.minute = 1;
    expect(ticketStatus(s)).toBe("missed");
    expect(boardIntercityTicket(s, "bus_station").ok).toBe(false);
    expect(s.intercityTicket).toBeUndefined();
    expect(s.player.money).toBe(before - INTERCITY_BUS_FARE);
  });

  it("跨城私家交通：汽车 1 小时，电动车/三轮车 1.5 小时，自行车不能跨城", () => {
    const car = createInitialState();
    car.flags.item_car = true;
    const carResult = travelToRegion(car, "suburb");
    expect(carResult.ok).toBe(true);
    expect(car.region).toBe("suburban_edge");
    expect(car.time.hour).toBe(8);
    expect(car.time.minute).toBe(0);
    expect(INTERCITY_CAR_HOURS).toBe(1);

    const scooter = createInitialState();
    scooter.flags.item_e_bike = true;
    expect(travelToRegion(scooter, "suburb").ok).toBe(true);
    expect(scooter.time.hour).toBe(8);
    expect(scooter.time.minute).toBe(30);

    const bicycle = createInitialState();
    bicycle.flags.item_bicycle = true;
    const blocked = travelToRegion(bicycle, "suburb");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain("车站");
  });

  it("市区地铁 2 元，郊区内部交通改为郊区巴士 5 元", () => {
    const city = createInitialState();
    city.region = "downtown_residential";
    city.area = "downtown_residential";
    expect(planTransit(city, "local", "downtown").mode).toBe("subway");
    expect(planTransit(city, "local", "downtown").fare).toBe(SUBWAY_FARE);

    const suburb = createInitialState();
    suburb.locationId = "map";
    suburb.region = "suburb";
    suburb.area = "suburb";
    const plan = planTransit(suburb, "local", "suburb");
    expect(plan.mode).toBe("suburb_bus");
    expect(plan.fare).toBe(SUBURB_BUS_FARE);
  });
});

describe("1.4 花鸟市场小宠物", () => {
  it("小宠物独立于猫咪 PetState，支持购买、喂食、安抚、体检和每日衰减", () => {
    const s = createInitialState();
    const catCount = s.pets.length;
    const adopted = adoptSmallPet(s, "bird");
    expect(adopted.ok).toBe(true);
    expect(s.smallPets).toHaveLength(1);
    expect(s.smallPets[0].kind).toBe("bird");
    expect(s.pets).toHaveLength(catCount);
    const uid = s.smallPets[0].uid;
    const hungryBefore = s.smallPets[0].hunger;
    const moodBefore = s.smallPets[0].mood;
    expect(feedSmallPet(s, uid).ok).toBe(true);
    expect(s.smallPets[0].hunger).toBeLessThan(hungryBefore);
    expect(comfortSmallPet(s, uid).ok).toBe(true);
    expect(s.smallPets[0].mood).toBeGreaterThan(moodBefore);
    const checkup = checkupSmallPet(s, uid);
    expect(checkup.ok).toBe(true);
    const hungerAfterCare = s.smallPets[0].hunger;
    const moodAfterCare = s.smallPets[0].mood;
    tickSmallPetsDaily(s);
    expect(s.smallPets[0].hunger).toBe(hungerAfterCare + 15);
    expect(s.smallPets[0].mood).toBe(moodAfterCare - 8);
  });

  it("花鸟市场行动按默认价格运行，并能通过行动入口照料指定宠物", () => {
    const s = createInitialState();
    s.time.hour = 10;
    atLocation(s, "flower_market", "downtown_station");
    expect(performAction(s, "small_pet_adopt_goldfish").ok).toBe(true);
    const pet = s.smallPets[0];
    expect(pet.kind).toBe("goldfish");
    expect(getAction("buy_plant_flower_market")?.requirements?.money).toBe(80);
    expect(getAction("buy_plant_flower_market")?.effects?.money).toBe(-80);
    const moneyBefore = s.player.money;
    expect(performAction(s, "small_pet_feed_goldfish", { smallPetUid: pet.uid }).ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - 3);
  });
});

describe("1.4 小吃街与学校兼职", () => {
  it("三种小吃沿用食物系统的价格与效果", () => {
    expect(getItem("snack_skewer")?.useEffects).toMatchObject({ satiety: 18, mood: 3 });
    expect(getItem("snack_noodles")?.useEffects).toMatchObject({ satiety: 28, mood: 2 });
    expect(getItem("snack_tofu")?.useEffects).toMatchObject({ satiety: 12, mood: 4 });
    const s = createInitialState();
    s.time.hour = 10;
    atLocation(s, "snack_street", "downtown_station");
    const moneyBefore = s.player.money;
    expect(performAction(s, "snack_street_skewer", { dine: "pack" }).ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - 10);
    expect(itemCount(s, "snack_skewer")).toBe(1);
  });

  it("小吃街摆摊复用周末集市配置，顾客单价为 13.5 元", () => {
    const cfg = getMiniGameConfig("stall_snack_street") as { stall?: boolean; stallPerCustomerPay?: number };
    expect(cfg?.stall).toBe(true);
    expect(cfg?.stallPerCustomerPay).toBe(13.5);
    const stateCfg = getMiniGameConfigFor(createInitialState(), "stall_snack_street") as { stallPerCustomerPay?: number };
    expect(stateCfg?.stallPerCustomerPay).toBe(13.5);
    expect(getAction("stall_snack_street")?.projectId).toBe("snack_stall");
  });

  it("学校辅导/托管正式工校验属性与服务技能，按班次记周薪且周日休息", () => {
    const job = getJobDef("job_school_tutor");
    expect(job).toBeDefined();
    expect(job?.locationId).toBe("school");
    expect(job?.startHour).toBe(9);
    expect(job?.endHour).toBe(17);
    expect(job?.requirements).toMatchObject({ attr: { intelligence: 35 }, skill: { service: 1 } });
    expect(job?.effects).toMatchObject({ money: 135, stamina: -35, stress: 4, skills: { service: 1 } });
    expect(job?.restDays).toEqual(["sun"]);
    expect(localJobsOf("school").map((j) => j.id)).toContain("job_school_tutor");

    const s = createInitialState();
    s.time.day = 3; // 周一
    s.time.hour = 9;
    s.player.stats.intelligence = 35;
    s.player.skills.service = 1;
    atLocation(s, "school", "downtown_station");
    const moneyBefore = s.player.money;
    expect(applyForJob(s, job!).ok).toBe(true);
    const result = performJob(s, "job_school_tutor");
    expect(result.ok).toBe(true);
    expect(result.session?.workedMinutes).toBe(480);
    expect(s.career.accruedWages).toBe(0);
    expect(completeWork(s, result.session!.id, 1).ok).toBe(true);
    expect(s.career.jobId).toBe("job_school_tutor");
    expect(s.career.accruedWages).toBeGreaterThan(0);
    expect(s.player.money).toBe(moneyBefore); // 当日不发钱
    expect(s.player.attrs.stamina).toBe(45);
    expect(s.player.stress).toBe(4);

    const sunday = createInitialState();
    sunday.time.day = 2; // 周日
    expect(isRestDay(sunday, job!)).toBe(true);
    expect(performJob(sunday, "job_school_tutor").ok).toBe(false);
  });
});

describe("1.4 存档迁移", () => {
  it("26→27 初始化车票/小宠物，并把旧宠物设施位置迁入花鸟市场", () => {
    const old = createInitialState(395) as unknown as Record<string, unknown>;
    old.version = 26;
    old.locationId = "pet_hospital";
    old.region = "downtown_center";
    old.area = "downtown_center";
    delete old.intercityTicket;
    delete old.smallPets;
    const migrated = migrateSave(old as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.locationId).toBe("flower_market");
    expect(migrated.region).toBe("downtown_station");
    expect(migrated.area).toBe("downtown_station");
    expect(migrated.navStack).toEqual(["map", "downtown", "downtown_station"]);
    expect(migrated.intercityTicket).toBeUndefined();
    expect(migrated.smallPets).toEqual([]);
  });
});
