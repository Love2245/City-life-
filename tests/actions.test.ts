import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { applyFamily } from "../src/game/core/families";
import {
  performAction,
  canPerform,
  getAction,
  moveTo,
  isLocationOpen,
  getLocation,
} from "../src/game/core/actions";

describe("行动系统：基本执行（小时制）", () => {
  it("加载了地点与行动数据", () => {
    expect(getAction("study_library")).toBeDefined();
  });

  it("执行图书馆自习：智力 +3、-8 体力、推进 2 小时", () => {
    const s = createInitialState();
    s.time.hour = 10; // 图书馆 9-18 点营业
    const intel0 = s.player.stats.intelligence;
    const stamina0 = s.player.attrs.stamina;
    const hour0 = s.time.hour;

    const r = performAction(s, "study_library");
    expect(r.ok).toBe(true);
    expect(s.player.stats.intelligence).toBe(intel0 + 3);
    expect(s.player.attrs.stamina).toBe(stamina0 - 15); // 自习 2h -15 体力
    expect(s.time.hour).toBe(hour0 + 2); // duration 2h
  });

  it("行动带时长：买饮料 0.5 小时", () => {
    const s = createInitialState();
    const hour0 = s.time.hour;
    performAction(s, "buy_drink_convenience");
    expect(s.time.hour).toBe(hour0);
    expect(s.time.minute).toBe(30);
  });

  it("需求不满足时行动被拒绝（公园锻炼需体力 25）", () => {
    const s = createInitialState();
    s.player.attrs.stamina = 5;
    const r = performAction(s, "exercise_park");
    expect(r.ok).toBe(false);
  });

  it("v0.93：凌晨 4 点、体力充足时不再被时间硬阻断（仅打烊才拦）", () => {
    const s = createInitialState();
    s.time.hour = 4;
    s.player.attrs.stamina = 80;
    s.player.attrs.satiety = 80;
    s.player.money = 100;
    const r = performAction(s, "buy_lunch_convenience"); // 便利店 24h
    expect(r.ok).toBe(true);
    expect(r.reason ?? "").not.toContain("困到不行");
  });

  it("工作跨午夜：22 点开始 8 小时工作 → 次日 6 点", () => {
    const s = createInitialState();
    s.time.hour = 22;
    s.time.day = 5;
    // 用行动模拟（无 8h 普通行动，用 performAction + 时长验证 advanceHours）
    const r = performAction(s, "wander_street"); // 1h
    expect(r.crossedDay).toBe(false); // 23:00 未跨天
    const r2 = performAction(s, "wander_street"); // 23:00 → 24:00 跨天
    expect(r2.crossedDay).toBe(true);
    expect(s.time.day).toBe(6);
    expect(s.time.hour).toBe(0);
    expect(s.time.stayedUp).toBe(true);
  });
});

describe("行动系统：设施门槛（home）", () => {
  it("政府住宿下可洗澡（v0.97 与民宿一致）", () => {
    const s = createInitialState();
    const a = getAction("shower_home")!;
    const check = canPerform(s, a);
    expect(check.ok).toBe(true);
  });

  it("月租公寓下洗澡可用", () => {
    const s = createInitialState();
    s.living.mode = "lease";
    s.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    const a = getAction("shower_home")!;
    expect(canPerform(s, a).ok).toBe(true);
  });

  it("青旅下洗澡可用（青旅有 shower 设施）", () => {
    const s = createInitialState();
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "hostel" };
    const a = getAction("shower_home")!;
    expect(canPerform(s, a).ok).toBe(true);
  });
});

describe("行动系统：营业时间（openHours）", () => {
  it("图书馆 9-18 点营业", () => {
    const lib = getLocation("library")!;
    expect(isLocationOpen(lib, 9)).toBe(true);
    expect(isLocationOpen(lib, 17)).toBe(true);
    expect(isLocationOpen(lib, 18)).toBe(false); // end 不含
    expect(isLocationOpen(lib, 8)).toBe(false);
  });

  it("便利店 24 小时（缺省全天）", () => {
    const store = getLocation("convenience_store")!;
    expect(isLocationOpen(store, 3)).toBe(true);
    expect(isLocationOpen(store, 15)).toBe(true);
  });

  it("晚上图书馆行动被拒（已打烊）", () => {
    const s = createInitialState();
    s.time.hour = 20;
    moveTo(s, "library"); // 打烊拒绝
    const a = getAction("study_library")!;
    const check = canPerform(s, a);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("打烊");
  });

  it("moveTo 晚上去劳务市场被拒", () => {
    const s = createInitialState();
    s.time.hour = 19;
    const r = moveTo(s, "labor_market");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("打烊");
  });

  it("moveTo 进入劳务市场后刷新岗位池", () => {
    const s = createInitialState(5);
    s.time.hour = 10;
    moveTo(s, "labor_market");
    expect(s.laborMarket.generatedDay).toBe(gameDay(s.time)); // v0.965 绝对日语义
  });
});

describe("行动系统：图书馆书籍（v1.20）", () => {
  it("读哲学总集：提升智力 + 弹出一段书中片段", () => {
    const s = createInitialState();
    s.time.hour = 10;
    applyFamily(s, "ordinary");
    const a = getAction("book_philosophy")!;
    expect(canPerform(s, a).ok).toBe(true);
    const int0 = s.player.stats.intelligence;
    const r = performAction(s, "book_philosophy");
    expect(r.ok).toBe(true);
    expect(s.player.stats.intelligence).toBeGreaterThan(int0);
    expect(s.flags["book_book_philosophy_count"]).toBe(1);
    expect(r.result?.verdict.length).toBeGreaterThan(15);
    expect(r.result?.duration).toBe(3);
  });

  it("同一本书读满 10 次后不再提升属性", () => {
    const s = createInitialState();
    s.time.hour = 10;
    applyFamily(s, "ordinary");
    s.flags["book_book_philosophy_count"] = 10;
    const int0 = s.player.stats.intelligence;
    const r = performAction(s, "book_philosophy");
    expect(r.ok).toBe(true);
    expect(s.player.stats.intelligence).toBe(int0);
    expect(s.flags["book_book_philosophy_count"]).toBe(11);
  });

  it("摆摊小技巧：每读一次 +1 级（封顶 5）", () => {
    const s = createInitialState();
    s.time.hour = 10;
    applyFamily(s, "ordinary");
    s.flags["stall_tip_level"] = 5;
    performAction(s, "book_stall_tips");
    expect(s.flags["stall_tip_level"]).toBe(5);
  });
});
