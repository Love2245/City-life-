import { describe, it, expect } from "vitest";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { nextRandom } from "../src/game/rng";
import type { GameState } from "../src/game/types";

describe("存档迁移", () => {
  it("旧租约读档时保留完整的 30 日权益，后续读取不重置账期并按新房源归属 home", () => {
    const legacy = createInitialState();
    legacy.version = SAVE_VERSION;
    legacy.locationId = "home";
    legacy.region = "downtown_residential";
    legacy.time = { ...legacy.time, year: 2026, month: 8, day: 23 };
    legacy.living.mode = "lease";
    legacy.living.lease = { housingId: "suburb_room", rent: 800, rentGrowthCount: 0 };
    legacy.flags.lease_prepaid_month = "2026-08";
    legacy.flags.lease_first_month_prepaid = true;

    const migrated = migrateSave(legacy);
    const expectedDueDay = gameDay(legacy.time) + 30;
    expect(migrated.living.lease?.nextRentDay).toBe(expectedDueDay);
    expect(migrated.region).toBe("suburban_edge");
    expect(migrated.navStack).toEqual(["map", "suburb", "suburban_edge"]);
    expect(migrated.flags.lease_prepaid_month).toBeUndefined();
    expect(migrated.flags.lease_first_month_prepaid).toBeUndefined();

    const reopened = migrateSave(migrated);
    expect(reopened.living.lease?.nextRentDay).toBe(expectedDueDay);
  });

  it("保留旧存档已有的有效下次租期日期", () => {
    const state = createInitialState();
    state.version = SAVE_VERSION;
    state.living.mode = "lease";
    state.living.lease = {
      housingId: "old_apartment",
      rent: 1000,
      rentGrowthCount: 2,
      nextRentDay: gameDay(state.time) + 12,
    };
    const migrated = migrateSave(state);
    expect(migrated.living.lease?.nextRentDay).toBe(gameDay(state.time) + 12);
  });

  it("v4 存档 → v6（链式补 statuses + region/navStack）", () => {
    const v4 = {
      ...createInitialState(),
      version: 4,
    } as unknown as GameState;
    delete (v4 as unknown as Record<string, unknown>).statuses;

    const migrated = migrateSave(v4 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.statuses).toEqual([]);
    // v6 新字段
    expect(migrated.region).toBe("downtown_residential"); // home 归属
    expect(migrated.navStack).toEqual(["map", "downtown", "downtown_residential"]);
  });

  it("v5 存档 → v12（补 region/navStack + inventory/career + vehicles + quests + internDays + 成就/收集/经济/引导）", () => {
    const v5 = {
      ...createInitialState(),
      version: 5,
    } as unknown as GameState;
    const migrated = migrateSave(v5 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.region).toBe("downtown_residential");
    expect(migrated.navStack).toEqual(["map", "downtown", "downtown_residential"]);
    expect(migrated.inventory).toMatchObject({ phone: 1, white_vest: 1, black_pants: 1, cyan_jacket: 1 });
    expect(migrated.career.kind).toBeNull();
    expect(migrated.vehicles).toEqual({});
    expect(migrated.quests).toEqual([]);
    expect(migrated.career.internDays).toEqual({});
    expect(migrated.career.internLastDay).toBe(-1); // v0.965 哨兵
  });

  it("v6 存档 → v12（补 inventory/career/vehicles/quests + 成就/收集/经济/引导）", () => {
    const v6 = {
      ...createInitialState(),
      version: 6,
    } as unknown as GameState;
    const migrated = migrateSave(v6 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.inventory).toMatchObject({ phone: 1, white_vest: 1, black_pants: 1, cyan_jacket: 1 });
    expect(migrated.vehicles).toEqual({});
    expect(migrated.quests).toEqual([]);
  });

  it("v7 存档 → v12（补 vehicles + quests + 成就/收集/经济/引导）", () => {
    const v7 = {
      ...createInitialState(),
      version: 7,
    } as unknown as GameState;
    const migrated = migrateSave(v7 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.vehicles).toEqual({});
    expect(migrated.quests).toEqual([]);
  });

  it("v8 存档 → v11（补 quests/questsGeneratedDay + internDays）", () => {
    const v8 = {
      ...createInitialState(),
      version: 8,
    } as unknown as GameState;
    delete (v8 as unknown as Record<string, unknown>).quests;
    delete (v8 as unknown as Record<string, unknown>).questsGeneratedDay;

    const migrated = migrateSave(v8 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.quests).toEqual([]);
    expect(migrated.questsGeneratedDay).toBe(-1); // v0.965 哨兵（强制下次刷新）
    // 旧字段不丢
    expect(migrated.vehicles).toEqual({});
    expect(migrated.inventory).toMatchObject({ phone: 1, white_vest: 1, black_pants: 1, cyan_jacket: 1 });
  });

  it("v9 存档 → v11（补 internDays/internLastDay，保留任务与职业）", () => {
    const v9 = {
      ...createInitialState(),
      version: 9,
      quests: [{ id: "q1", type: "job", title: "质检", icon: "🔍", desc: "", day: 3, status: "pending", jobId: "job_factory_qc" }],
    } as unknown as GameState;
    delete (v9.career as unknown as Record<string, unknown>).internDays;
    delete (v9.career as unknown as Record<string, unknown>).internLastDay;

    const migrated = migrateSave(v9 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.career.internDays).toEqual({});
    // v0.965：internLastDay 旧月内日/未记录语义 → -1 哨兵（首个结算自动重建）
    expect(migrated.career.internLastDay).toBe(-1);
    // v0.965：任务栏旧月内日 id/归属天语义 → 迁移清空，下次刷新重建当日任务；职业保留
    expect(migrated.quests).toHaveLength(0);
    expect(migrated.career.jobId).toBeNull();
  });

  it("v5 在主地图 → navStack=['map']、region=undefined", () => {
    const v5 = {
      ...createInitialState(),
      version: 5,
      locationId: "map",
    } as unknown as GameState;
    const migrated = migrateSave(v5 as unknown as Record<string, never>);
    expect(migrated.region).toBeUndefined();
    expect(migrated.navStack).toEqual(["map"]);
  });

  it("当前版本存档复制并保留可持久化内容", () => {
    const s = createInitialState();
    const serialized = JSON.stringify(s);
    expect(s.version).toBe(SAVE_VERSION);
    const migrated = migrateSave(s);
    expect(migrated).not.toBe(s);
    expect(JSON.stringify(s)).toBe(serialized);
    expect(migrated.version).toBe(s.version);
    expect(migrated.inventory.doc_city_guide).toBe(1);
  });

  it("v28 缺失 rng 时补齐 calls，并保持随机序列可推进", () => {
    const v28 = JSON.parse(JSON.stringify(createInitialState(7))) as Record<string, unknown>;
    v28.version = 28;
    delete v28.rng;
    const before = JSON.stringify(v28);
    const migrated = migrateSave(v28);
    expect(JSON.stringify(v28)).toBe(before);
    expect(migrated.rng).toMatchObject({ seed: 1, calls: 0 });
    expect(Number.isFinite(migrated.rng.calls)).toBe(true);
    const first = nextRandom(migrated.rng);
    const second = nextRandom(migrated.rng);
    expect(second).not.toBe(first);
  });

  it("v2 旧住宿结构迁移后保留租住三态", () => {
    const v2 = {
      ...createInitialState(7),
      version: 2,
      living: { housingId: "rental_room", rent: 80, rentGrowthCount: 1 },
    } as unknown as Record<string, never>;
    const migrated = migrateSave(v2);
    expect(migrated.living.mode).toBe("lease");
    expect(migrated.living.lease).toMatchObject({ housingId: "rental_room", rent: 80, rentGrowthCount: 1 });
  });

  it("当前版本存档会清理已删除 NPC 的运行时残留", () => {
    const s = createInitialState();
    s.relationships.push({ npcId: "npc_li_na", affinity: 30, state: "acquaintance" });
    s.contacts.push({
      id: "npc_npc_li_na",
      name: "李娜",
      avatar: "👩",
      relation: "employee",
      title: "员工",
      intro: "",
      canCall: true,
      canSms: true,
      addedDay: 1,
      npcId: "npc_li_na",
    });
    s.smsInbox.push({
      id: "old-npc-message",
      sender: "许岚",
      senderIcon: "👩",
      text: "旧短信",
      options: [],
      replied: false,
      day: 1,
      contactId: "npc_npc_school_coordinator",
      npcId: "npc_school_coordinator",
      dir: "in",
    });
    s.social?.posts.push({
      id: "old-npc-post",
      author: "contact",
      contactId: "npc_npc_oldtown_station_clerk",
      npcId: "npc_oldtown_station_clerk",
      text: "旧动态",
      category: "daily",
      day: 1,
      reactions: [],
      comments: [],
      selfLiked: false,
    });
    s.quests.push({
      id: "old-npc-quest",
      type: "story",
      title: "旧委托",
      icon: "📋",
      desc: "",
      day: 1,
      status: "active",
      commission: {
        npcId: "npc_school_coordinator",
        days: 1,
        startDay: 1,
        rewardEffects: {},
        rewardText: "",
      },
    });
    s.weekly.interactions.npc_li_na = 2;
    s.weekly.report = { earned: 0, spent: 0, interactions: [{ npcId: "npc_li_na", count: 2 }], jobsDone: 0, goalGap: null };
    s.romance.dateCount.npc_li_na = 2;
    s.romance.confessed = { npc_li_na: true };
    s.romance.crashTonight = "npc_oldtown_station_clerk";
    s.romance.loanNpc = "npc_school_coordinator";
    s.flags.npc_contact_npc_li_na = true;
    s.flags.moments_last_npc_npc_li_na = 1;
    s.flags.npc_remaster_talks_npc_school_coordinator = 2;
    s.cityCommissions.offeredIds = ["city_oldtown_transfer_manual", "city_market_weekend_stock"];
    s.cityCommissions.activeId = "city_school_charity_fair";
    s.cityCommissions.cooldownUntilDay.city_station_lost_parcel = 4;

    const migrated = migrateSave(s);
    expect(migrated.relationships).toHaveLength(0);
    expect(migrated.contacts.some((contact) => contact.npcId === "npc_li_na")).toBe(false);
    expect(migrated.smsInbox).toHaveLength(0);
    expect(migrated.social?.posts).toHaveLength(0);
    expect(migrated.quests).toHaveLength(0);
    expect(migrated.weekly.interactions).toEqual({});
    expect(migrated.weekly.report?.interactions).toEqual([]);
    expect(migrated.romance.dateCount).toEqual({});
    expect(migrated.romance.confessed).toEqual({});
    expect(migrated.romance.crashTonight).toBeUndefined();
    expect(migrated.romance.loanNpc).toBeUndefined();
    expect(migrated.flags.npc_contact_npc_li_na).toBeUndefined();
    expect(migrated.flags.moments_last_npc_npc_li_na).toBeUndefined();
    expect(migrated.flags.npc_remaster_talks_npc_school_coordinator).toBeUndefined();
    expect(migrated.cityCommissions.offeredIds).toEqual([]);
    expect(migrated.cityCommissions.activeId).toBeNull();
    expect(migrated.cityCommissions.cooldownUntilDay.city_station_lost_parcel).toBeUndefined();
  });

  it("v23 → v24：补编程周入 + 旧租用车折算为押金（不限租期）", async () => {
    const base = createInitialState();
    const v23 = {
      ...base,
      version: 23,
      career: { ...base.career, passiveIncome: undefined },
      vehicles: {
        e_bike: { day: 5, month: 8, year: 2026 },
        car: { day: 3, month: 9, year: 2026 },
      },
    } as unknown as GameState;
    const migrated = migrateSave(v23 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.career.passiveIncome).toBe(0);
    expect(migrated.vehicles["e_bike"].deposit).toBe(600);
    expect(migrated.vehicles["car"].deposit).toBe(3000);
    // 押金制租赁不会被到期回收
    const { checkVehicleExpiry } = await import("../src/game/core/vehicle");
    const s2 = createInitialState();
    s2.vehicles = migrated.vehicles;
    s2.flags["item_e_bike"] = true;
    s2.flags["item_car"] = true;
    s2.time = { day: 30, month: 12, year: 2026, hour: 12, minute: 0, stayedUp: false };
    checkVehicleExpiry(s2);
    expect(s2.vehicles["e_bike"]).toBeDefined();
    expect(s2.vehicles["car"]).toBeDefined();
  });

  it("v1 旧档最终迁移到 v5", () => {
    const v1 = {
      version: 1,
      family: "ordinary",
      allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
      ownedItems: [],
      rng: { seed: 1, calls: 0 },
      time: { day: 5, month: 1, year: 1, period: "morning", stayedUp: false },
      player: {
        name: "阿城",
        attrs: { stamina: 80, health: 85, mood: 70, hygiene: 80, satiety: 75 },
        stats: { intelligence: 30, charm: 30, fitness: 30, fame: 0 },
        skills: {},
        money: 1000, debt: 0, stress: 0, lowMoodStreak: 0, negativeMoneyStreak: 0, hungryStreak: 0,
      },
      living: { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 },
      career: { jobId: null, projects: {} },
      relationships: [],
      flags: {},
      log: [],
      locationId: "home",
      endingId: null,
      unlockedEndings: [],
    } as unknown as GameState;

    const migrated = migrateSave(v1 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.statuses).toEqual([]);
    expect(migrated.living.mode).toBe("lease"); // v1 旧房 → lease
    expect(typeof migrated.time.hour).toBe("number"); // period → hour
  });

  it("v2 难度映射到家庭（hard → destitute）", () => {
    const v2 = {
      ...createInitialState(),
      version: 2,
      difficulty: "hard",
    } as unknown as GameState;
    const migrated = migrateSave(v2 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.family).toBe("destitute");
  });

  it("v24 → v25：补 Moments/订单/直播/市民池字段兜底", () => {
    const v24 = {
      ...createInitialState(),
      version: 24,
    } as unknown as GameState;
    // 模拟旧档确实没有这些可选字段
    delete (v24 as unknown as Record<string, unknown>).social;
    delete (v24 as unknown as Record<string, unknown>).orders;
    delete (v24 as unknown as Record<string, unknown>).live;
    delete (v24 as unknown as Record<string, unknown>).citizensPool;

    const migrated = migrateSave(v24 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.social).toEqual({ posts: [], unreadMoments: 0 });
    expect(migrated.orders).toEqual([]);
    expect(migrated.live).toEqual({ streaming: false, lastStreamDay: -1, totalFameGain: 0 });
    expect(migrated.citizensPool).toEqual([]);
  });

  it("v24 → v25：保留已有 social/orders 数据不丢", () => {
    const v24 = {
      ...createInitialState(),
      version: 24,
      social: { posts: [{ id: "p1", author: "self", text: "旧帖", category: "daily", day: 3, reactions: [], comments: [], selfLiked: false }], unreadMoments: 0 },
      orders: [{ id: "o1", kind: "shop", itemId: "phone", name: "手机", icon: "📱", price: 450, orderDay: 3, etaDays: 3, arrived: false }],
      live: { streaming: false, lastStreamDay: 10, totalFameGain: 50 },
      citizensPool: [{ id: "c1", name: "路人甲", avatar: "🧑", tag: "上班族" }],
    } as unknown as GameState;

    const migrated = migrateSave(v24 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.social?.posts).toHaveLength(1);
    expect(migrated.orders).toHaveLength(1);
    expect(migrated.live?.totalFameGain).toBe(50);
    expect(migrated.citizensPool).toHaveLength(1);
  });

  it("v25 → v26：补猫咪系统字段兜底", () => {
    const v25 = {
      ...createInitialState(),
      version: 25,
    } as unknown as GameState;
    delete (v25 as unknown as Record<string, unknown>).pets;
    delete (v25 as unknown as Record<string, unknown>).catFlags;

    const migrated = migrateSave(v25 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.pets).toEqual([]);
    expect(migrated.catFlags).toEqual({});
  });

  it("v25 → v26：保留已有 pets/catFlags 数据不丢", () => {
    const v25 = {
      ...createInitialState(),
      version: 25,
      pets: [{ uid: "pet_1", catId: "orange", icon: "🐱", name: "橘猫", personality: "bold", level: 1, exp: 0, attrs: { hp: 88, atk: 13, def: 10, spd: 10 }, care: { satiety: 80, mood: 80, hygiene: 80 }, acquiredDay: 1 }],
      catFlags: { cat_orange: true },
    } as unknown as GameState;

    const migrated = migrateSave(v25 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.pets).toHaveLength(1);
    expect(migrated.pets[0].catId).toBe("orange");
    expect(migrated.catFlags["cat_orange"]).toBe(true);
  });

  it("v25 → v26：旧剧情档 mode=story 转为普通模式", () => {
    const v25 = {
      ...createInitialState(),
      version: 25,
      mode: "story",
    } as unknown as GameState;

    const migrated = migrateSave(v25 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.mode).toBe("normal");
  });

  it("v1.44：v25 → v26 永恒档统一归为经典模式", () => {
    const v25 = {
      ...createInitialState(),
      version: 25,
      mode: "eternal",
    } as unknown as GameState;

    const migrated = migrateSave(v25 as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.mode).toBe("normal");
  });
});
