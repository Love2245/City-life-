import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyFamily } from "../src/game/core/families";
import {
  canPerform,
  getAction,
  moveTo,
  travelHours,
  isLocationOpen,
  getLocation,
} from "../src/game/core/actions";
import { performJob } from "../src/game/core/jobs";
import { nap, alarmCappedHours, alarmWakeHour } from "../src/game/core/time";
import { getMaxStamina } from "../src/game/core/stats";

describe("v0.93：移除时间型疲劳硬阻断 (P1)", () => {
  it("凌晨 3 点、体力充足时仍可办事（不再“困到不行”）", () => {
    const s = createInitialState();
    s.time.hour = 3;
    s.player.attrs.stamina = 80;
    s.player.attrs.satiety = 80;
    s.player.money = 100;
    const a = getAction("buy_lunch_convenience"); // 便利店 24h
    expect(a).toBeDefined();
    const r = canPerform(s, a!);
    expect(r.ok).toBe(true);
    expect(r.reason ?? "").not.toContain("困到不行");
  });

  it("凌晨 3 点上班不会被时间硬阻断（原因绝不含“困到不行”）", () => {
    const s = createInitialState();
    s.time.hour = 3;
    s.player.attrs.stamina = 60;
    s.player.attrs.satiety = 60;
    const r = performJob(s, "cafe_staff");
    expect(r.reason ?? "").not.toContain("困到不行");
  });

  it("体力归零强行工作仍失败（guardSurvival 晕倒），且非时间阻断", () => {
    const s = createInitialState();
    s.time.hour = 3;
    s.player.attrs.stamina = 0;
    s.player.attrs.satiety = 60;
    const r = performJob(s, "cafe_staff");
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").not.toContain("困到不行");
  });
});

describe("v0.93：起床闹钟 (P2)", () => {
  it("alarmCappedHours 按闹钟上限睡眠", () => {
    const s = createInitialState();
    s.time.hour = 23;
    s.alarmHour = 7;
    expect(alarmCappedHours(s, 10)).toBe(8); // 23→次日7 = 8h
    s.alarmHour = undefined;
    expect(alarmCappedHours(s, 10)).toBe(10); // 无闹钟不限制
  });

  it("alarmWakeHour 返回正确叫醒时刻", () => {
    const s = createInitialState();
    s.time.hour = 2;
    s.alarmHour = 7;
    expect(alarmWakeHour(s)).toBe(7);
    s.time.hour = 23;
    s.alarmHour = 7;
    expect(alarmWakeHour(s)).toBe(7);
  });
});

describe("v0.93：体力恢复上调 (P3)", () => {
  it("小睡恢复上限的 30%", () => {
    const s = createInitialState();
    applyFamily(s, "ordinary");
    const max = getMaxStamina(s);
    s.player.attrs.stamina = 0;
    nap(s, 2);
    expect(s.player.attrs.stamina).toBeCloseTo(max * 0.3, 0);
  });
});

describe("v0.93：24h 机构 (P4)", () => {
  it("诊所/快餐/洗浴 24h 营业", () => {
    expect(isLocationOpen(getLocation("clinic"), 2)).toBe(true);
    expect(isLocationOpen(getLocation("fast_food"), 2)).toBe(true);
    expect(isLocationOpen(getLocation("bathhouse"), 2)).toBe(true);
  });
  it("菜市场延长到 6-23", () => {
    expect(isLocationOpen(getLocation("market"), 6)).toBe(true);
    expect(isLocationOpen(getLocation("market"), 22)).toBe(true);
    expect(isLocationOpen(getLocation("market"), 23)).toBe(false);
  });
});

describe("v0.93：三级地图通行 (P5)", () => {
  it("同二级地图移动耗时 0，跨二级地图 0.5h", () => {
    const s = createInitialState();
    s.region = "downtown_residential";
    expect(travelHours(s, getLocation("clinic"))).toBe(0); // clinic 归属 residential
    s.region = "downtown_mall";
    expect(travelHours(s, getLocation("clinic"))).toBe(0.5);
  });
  it("同区移动瞬间到达（分钟不变）", () => {
    const s = createInitialState();
    s.region = "downtown_residential";
    s.time.hour = 10;
    s.time.minute = 0;
    const r = moveTo(s, "clinic"); // clinic 归属 residential
    expect(r.ok).toBe(true);
    expect(s.time.minute).toBe(0); // 同区 0 耗时
  });

  it("跨二级地图移动耗时半小时（分钟 +30）", () => {
    const s = createInitialState();
    s.region = "downtown_residential";
    s.time.hour = 10;
    s.time.minute = 0;
    const r = moveTo(s, "fast_food"); // fast_food 归属 mall，跨区
    expect(r.ok).toBe(true);
    expect(s.time.minute).toBe(30);
  });
});
