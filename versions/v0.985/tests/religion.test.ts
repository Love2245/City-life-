import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction, canPerform, getAction } from "../src/game/core/actions";
import { afterChurchMass } from "../src/game/core/religion";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";

/**
 * 初始时间是 2026-08-01（周六）07:00，而教堂 9:00 开门、寺庙 8:00 开门——
 * 直接用初始时间调用宗教行动会被「还没开门」拦下，因此统一拨到 10:00。
 * 弥撒相关用例自行覆盖 hour（仅 15:00–18:00 有效）。
 */
function fresh(hour = 10): GameState {
  const s = createInitialState();
  s.player.attrs.stamina = 100;
  s.player.attrs.health = 100;
  s.time = { ...s.time, hour };
  return s;
}

describe("v0.981 宗教系统", () => {
  it("教堂弥撒：仅周六 15:00–18:00 可参加", () => {
    const s = fresh(15); // 2026-08-01 为周六
    expect(performAction(s, "church_mass").ok).toBe(true);

    const early = fresh(10); // 周六但未到弥撒时段
    expect(performAction(early, "church_mass").ok).toBe(false);

    const sun = fresh(16);
    sun.time = { ...sun.time, day: 2 }; // 周日
    expect(performAction(sun, "church_mass").ok).toBe(false);
  });

  it("寺庙义工：累计次数写入 flag，并解锁素斋/住宿", () => {
    const s = fresh();
    expect(canPerform(s, getAction("temple_vegetarian")!).ok).toBe(false); // 未做义工
    expect(performAction(s, "temple_volunteer").ok).toBe(true);
    expect(s.flags.temple_volunteered).toBe(1);
    expect(s.flags.temple_ceremony).toBeUndefined();
    // 做义工后解锁素斋与禅房挂单
    expect(canPerform(s, getAction("temple_vegetarian")!).ok).toBe(true);
    expect(canPerform(s, getAction("temple_lodging")!).ok).toBe(true);
  });

  it("告解：每日一次", () => {
    const s = fresh();
    expect(performAction(s, "church_confession").ok).toBe(true);
    expect(s.flags.confession_day).toBe(gameDay(s.time));
    // 同一天再次告解被拒
    expect(performAction(s, "church_confession").ok).toBe(false);
  });

  it("祭拜（教堂/寺庙）：每日一次", () => {
    const s = fresh();
    expect(performAction(s, "church_worship").ok).toBe(true);
    expect(s.flags.worship_church_day).toBe(gameDay(s.time));
    expect(performAction(s, "church_worship").ok).toBe(false);

    const t = fresh();
    expect(performAction(t, "temple_worship").ok).toBe(true);
    expect(t.flags.worship_temple_day).toBe(gameDay(t.time));
    expect(performAction(t, "temple_worship").ok).toBe(false);
  });

  it("弥撒散场必触发教友团建聚餐事件", () => {
    const s = fresh();
    afterChurchMass(s);
    expect(s.pendingEvents ?? []).toContain("ev_church_fellowship");
  });

  it("宗教互斥：受洗后寺庙封锁，寺庙圆满后教堂封锁", () => {
    const s = fresh();
    s.flags.church_baptized = true;
    expect(performAction(s, "temple_volunteer").ok).toBe(false);

    // 拨到弥撒时段，确保拒绝原因是互斥封锁而非时段限制
    const t = fresh(15);
    t.flags.temple_done = true;
    expect(performAction(t, "church_mass").ok).toBe(false);
  });

  it("禅房过夜仅对无固定住处者开放（stay_hotel handler）", () => {
    const s = fresh();
    s.flags.temple_volunteered = 1;
    s.living.mode = "lease"; // 已有租房
    const r = performAction(s, "temple_lodging");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("固定住处");

    const t = fresh();
    t.flags.temple_volunteered = 1;
    t.living.mode = "nightly"; // 无固定住处
    expect(performAction(t, "temple_lodging").ok).toBe(true);
  });
});
