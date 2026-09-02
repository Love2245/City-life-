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
});