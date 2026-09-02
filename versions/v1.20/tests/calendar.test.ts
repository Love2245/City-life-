import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { linearDay, gameDay, fromLinearDay, seasonOf, START_YEAR, START_MONTH } from "../src/game/core/calendar";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import type { GameState } from "../src/game/types";

describe("日历系统 v0.95（纪元 2026-08-01）", () => {
  it("开局 2026-08-01 即第 0 天", () => {
    const s = createInitialState();
    expect(s.time.year).toBe(2026);
    expect(s.time.month).toBe(8);
    expect(s.time.day).toBe(1);
    expect(gameDay(s.time)).toBe(0);
  });

  it("gameDay 按 30 天月推进", () => {
    expect(gameDay({ year: 2026, month: 9, day: 1 })).toBe(30);
    expect(gameDay({ year: 2026, month: 11, day: 1 })).toBe(90);
    expect(gameDay({ year: 2027, month: 2, day: 1 })).toBe(180);
    expect(gameDay({ year: 2027, month: 8, day: 1 })).toBe(360); // 活满一年
  });

  it("跨年连续（12月30日 → 次年1月1日）", () => {
    expect(gameDay({ year: 2026, month: 12, day: 30 })).toBe(149);
    expect(gameDay({ year: 2027, month: 1, day: 1 })).toBe(150);
  });

  it("seasonOf 四季正确", () => {
    expect(seasonOf(8)).toBe("summer");
    expect(seasonOf(6)).toBe("summer");
    expect(seasonOf(11)).toBe("autumn");
    expect(seasonOf(12)).toBe("winter");
    expect(seasonOf(1)).toBe("winter");
    expect(seasonOf(4)).toBe("spring");
  });

  it("linearDay ↔ fromLinearDay 互逆", () => {
    const t = { year: 2028, month: 5, day: 17 };
    const back = fromLinearDay(linearDay(t));
    expect(back).toEqual(t);
  });

  it("开局线性日 = START_EPOCH", () => {
    expect(linearDay({ year: START_YEAR, month: START_MONTH, day: 1 })).toBe(729570);
    expect(gameDay({ year: START_YEAR, month: START_MONTH, day: 1 })).toBe(0);
  });
});

describe("存档迁移 v12 → v13（纪元换算）", () => {
  function makeV12(): GameState {
    const s = createInitialState();
    // 还原为旧纪元（1年1月1日 起）
    s.version = 12;
    s.time = { day: 5, month: 1, year: 1, hour: 9, minute: 0, stayedUp: false };
    s.vehicles = { e_bike: { day: 5, month: 2, year: 1 } }; // 旧纪元到期日（租 30 天 → 2月5日）
    s.memberships = { gym: { day: 10, month: 1, year: 1 } };
    s.flags["ev_ev_street_lottery_last"] = 40; // 旧 absoluteDay（1月10日 = 9+31? 用具体值）
    s.flags["some_flag"] = true;
    return s;
  }

  it("时间换算：旧 1年1月1日 → 2026-08-01，第 N 天 → 2026-08-01+N", () => {
    const s = makeV12(); // 旧 1/5 → 开局+4 天 = 2026-08-05
    const m = migrateSave(s);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.time.year).toBe(2026);
    expect(m.time.month).toBe(8);
    expect(m.time.day).toBe(5);
    expect(m.time.hour).toBe(9); // 时刻保留
  });

  it("载具/会籍到期日同步换算（差值语义不变）", () => {
      const s = makeV12();
      const m = migrateSave(s);
      // 旧 2/5（1/5+30 天）→ 新 2026-09-05
      expect(m.vehicles["e_bike"]).toEqual({ day: 5, month: 9, year: 2026, deposit: 600 });
    // 旧 1/10 → 新 2026-08-10
    expect(m.memberships["gym"]).toEqual({ day: 10, month: 8, year: 2026 });
    // 到期日与当前时刻的差值（租期剩余 26 天）不变
    expect(gameDay(m.time)).toBe(4);
  });

  it("事件冷却绝对日 + START_EPOCH 偏移", () => {
    const s = makeV12();
    const m = migrateSave(s);
    const oldAbs = 40; // 旧 absoluteDay
    expect(m.flags["ev_ev_street_lottery_last"]).toBe(oldAbs + 729570);
    expect(m.flags["some_flag"]).toBe(true); // 非冷却 flag 不动
  });

  it("equipped / weather 默认值补齐", () => {
    const s = makeV12();
    const m = migrateSave(s);
    expect(m.equipped).toEqual({});
    expect(m.weather.id).toBe("sunny");
  });

  it("当前版本存档原样返回", () => {
    const s = createInitialState();
    expect(s.version).toBe(SAVE_VERSION);
    expect(migrateSave(s)).toBe(s);
  });
});
