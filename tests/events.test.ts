import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import { rollEvent, checkEventConditions, applyEventChoice, EVENTS } from "../src/game/core/events";
import { absoluteDay } from "../src/game/core/membership";

describe("随机事件：数据", () => {
  it("事件库至少 10 个", () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(10);
  });

  it("事件都有选项", () => {
    for (const ev of EVENTS) {
      expect(ev.choices.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("随机事件：条件过滤", () => {
  it("地点条件不满足时被过滤", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.locationId = "home";
    const lottery = EVENTS.find((e) => e.id === "ev_street_lottery")!;
    expect(checkEventConditions(s, lottery)).toBe(false);
    s.locationId = "street";
    s.time.hour = 10;
    expect(checkEventConditions(s, lottery)).toBe(true);
  });

  it("时段条件过滤", () => {
    const s = createInitialState();
    s.locationId = "street";
    s.time.hour = 2; // night
    const lottery = EVENTS.find((e) => e.id === "ev_street_lottery")!;
    expect(checkEventConditions(s, lottery)).toBe(false);
  });

  it("属性条件过滤（图书馆学妹需智力 30）", () => {
    const s = createInitialState();
    s.locationId = "library";
    s.time.hour = 10;
    s.player.stats.intelligence = 20;
    const ev = EVENTS.find((e) => e.id === "ev_library_student")!;
    expect(checkEventConditions(s, ev)).toBe(false);
    s.player.stats.intelligence = 30;
    expect(checkEventConditions(s, ev)).toBe(true);
  });
});

describe("随机事件：抽签与选项", () => {
  it("同 seed 同调用序列可复现", () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    applyFamily(a, "ordinary");
    applyFamily(b, "ordinary");
    a.locationId = "street";
    b.locationId = "street";
    a.time.hour = 12;
    b.time.hour = 12;
    const ra = rollEvent(a, 1); // 强制 100% 概率
    const rb = rollEvent(b, 1);
    expect(ra?.id).toBe(rb?.id);
  });

  it("applyEventChoice 生效并写冷却标记", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    s.player.money = 100;
    const r = applyEventChoice(s, "ev_street_lottery", 0); // 刮彩票 -10
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(90);
    expect(s.flags["ev_ev_street_lottery_last"]).toBe(absoluteDay(s.time));
  });

  it("选项 requires 不满足被拒", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.locationId = "library";
    s.time.hour = 10;
    s.player.stats.intelligence = 30;
    // ev_library_student 选项 0 需智力 45
    const r = applyEventChoice(s, "ev_library_student", 0);
    expect(r.ok).toBe(false);
    s.player.stats.intelligence = 50;
    const r2 = applyEventChoice(s, "ev_library_student", 0);
    expect(r2.ok).toBe(true);
  });

  it("钱不够时事件不进候选池（彩票需 10 元）", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    s.player.money = 5;
    const lottery = EVENTS.find((e) => e.id === "ev_street_lottery")!;
    expect(checkEventConditions(s, lottery)).toBe(false);
  });

  it("v1.215 修复：象棋赌局「押 5」输局最多只亏 5 元", () => {
    const ev = EVENTS.find((e) => e.id === "ev_park_chess")!;
    const gamble = ev.choices[0].gamble!;
    expect(gamble.lose).toBe(0); // 原 -5 会让输局总亏 10（cost 5 + lose -5）
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "park";
    s.time.hour = 15;
    s.player.money = 50;
    const before = s.player.money;
    const r = applyEventChoice(s, "ev_park_chess", 0);
    expect(r.ok).toBe(true);
    // 无论胜负，现金都不会低于押金前的 45 元
    expect(s.player.money).toBeGreaterThanOrEqual(before - 5);
  });

  it("健身房教练指点：体质按属性加成，不产生 NaN 技能（P1-13）", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "gym";
    s.time.hour = 15;
    const fitness0 = s.player.stats.fitness;
    const r = applyEventChoice(s, "ev_gym_coach", 0); // 虚心请教
    expect(r.ok).toBe(true);
    expect(s.player.stats.fitness).toBe(fitness0 + 1);
    // 修复前 skills.fitness 会写入非法技能键 → NaN；修复后不应出现
    expect(Number.isNaN(s.player.stats.fitness)).toBe(false);
    for (const v of Object.values(s.player.skills)) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});

describe("v1.4 猫咪收养事件", () => {
  it("纸箱里的小猫：选择收养写入 pets 并解锁图鉴", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    const r = applyEventChoice(s, "ev_street_orphan_kitten", 1); // 带回家收养
    expect(r.ok).toBe(true);
    expect(s.pets).toHaveLength(1);
    expect(s.pets[0].catId).toBe("orange");
    expect(s.catFlags["cat_orange"]).toBe(true);
  });

  it("收养后 notFlag 门控：再次选择收养被拒", () => {
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    applyEventChoice(s, "ev_street_orphan_kitten", 1); // 第一次收养成功
    const r2 = applyEventChoice(s, "ev_street_orphan_kitten", 1); // 第二次应被 notFlag 拒绝
    expect(r2.ok).toBe(false);
    expect(s.pets).toHaveLength(1);
  });

  it("v1.38 P7 流浪猫全局去重", () => {
    // 收养任一流浪猫后写入全局标记 stray_adopted
    const s = createInitialState(7);
    applyFamily(s, "ordinary");
    s.locationId = "street";
    s.time.hour = 12;
    const r = applyEventChoice(s, "ev_street_orphan_kitten", 1); // 收养一只流浪猫
    expect(r.ok).toBe(true);
    expect(s.flags["stray_adopted"]).toBe(true);
    // 此后公园薄荷猫（notFlag: stray_adopted）被拒绝
    s.locationId = "park";
    expect(applyEventChoice(s, "ev_adopt_mint_cat", 0).ok).toBe(false);
    // 未收养前则可在公园正常收养薄荷猫
    const s2 = createInitialState(7);
    applyFamily(s2, "ordinary");
    s2.locationId = "park";
    s2.time.hour = 12;
    expect(applyEventChoice(s2, "ev_adopt_mint_cat", 0).ok).toBe(true);
  });

  it("薄荷猫收养事件存在且条件正确", () => {
    const ev = EVENTS.find((e) => e.id === "ev_adopt_mint_cat")!;
    expect(ev).toBeTruthy();
    expect(ev.choices.some((c) => c.adoptCat === "mint")).toBe(true);
  });
});