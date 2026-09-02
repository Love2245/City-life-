import { describe, it, expect } from "vitest";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { createInitialState } from "../src/game/core/state";
import type { GameState } from "../src/game/types";

describe("存档迁移", () => {
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
    expect(migrated.inventory).toEqual({ phone: 1 });
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
    expect(migrated.inventory).toEqual({ phone: 1 });
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
    expect(migrated.inventory).toEqual({ phone: 1 });
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

  it("当前版本存档原样返回", () => {
    const s = createInitialState();
    expect(s.version).toBe(SAVE_VERSION);
    expect(migrateSave(s)).toBe(s);
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
});
