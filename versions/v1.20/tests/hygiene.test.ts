import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction, actionsOf } from "../src/game/core/actions";
import { sleepSettlement } from "../src/game/core/time";
import { applyFamily } from "../src/game/core/families";

/** 站在洗浴中心、时间在营业时段（9-24）内 */
function atBathhouse(money = 500, hygiene = 30) {
  const s = createInitialState();
  applyFamily(s, "ordinary");
  s.time.hour = 12;
  s.player.money = money;
  s.player.attrs.hygiene = hygiene;
  s.locationId = "bathhouse";
  return s;
}

describe("洗浴中心三档", () => {
  it("洗浴中心提供三档服务", () => {
    const ids = actionsOf("bathhouse").map((a) => a.id);
    expect(ids).toContain("shower_quick");
    expect(ids).toContain("bath_massage");
    expect(ids).toContain("bath_center");
  });

  it("快速淋浴：30 元 1 小时，干净度 +45", () => {
    const s = atBathhouse(500, 30);
    const r = performAction(s, "shower_quick");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(470);
    expect(s.player.attrs.hygiene).toBe(75);
    expect(s.time.hour).toBe(13);
  });

  it("搓背按摩：120 元 3 小时，干净度 +80，体力心情上升、压力下降", () => {
    const s = atBathhouse(500, 10);
    s.player.attrs.stamina = 50;
    s.player.attrs.mood = 40;
    s.player.stress = 30;
    const r = performAction(s, "bath_massage");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(380);
    expect(s.player.attrs.hygiene).toBe(90);
    expect(s.player.attrs.stamina).toBeGreaterThan(50);
    expect(s.player.attrs.mood).toBeGreaterThan(40);
    expect(s.player.stress).toBeLessThan(30);
    expect(s.time.hour).toBe(15);
  });

  it("干净度不会溢出 100", () => {
    const s = atBathhouse(500, 50);
    performAction(s, "bath_massage"); // +80
    expect(s.player.attrs.hygiene).toBe(100);
  });

  it("泡澡一条龙后干净度回满", () => {
    const s = atBathhouse(500, 5);
    const r = performAction(s, "bath_center");
    expect(r.ok).toBe(true);
    expect(s.player.attrs.hygiene).toBe(100);
  });

  it("钱不够时三档都被拒绝", () => {
    const s = atBathhouse(20, 30);
    expect(performAction(s, "shower_quick").ok).toBe(false);
    expect(performAction(s, "bath_massage").ok).toBe(false);
    expect(performAction(s, "bath_center").ok).toBe(false);
    expect(s.player.money).toBe(20);
  });

  it("120 元只够搓背不够一条龙", () => {
    const s = atBathhouse(150, 30);
    expect(performAction(s, "bath_center").ok).toBe(false);
    expect(performAction(s, "bath_massage").ok).toBe(true);
  });

  it("睡眠掉 6 点干净度，洗浴叠加后仍在 0-100", () => {
    const s = atBathhouse(500, 30);
    performAction(s, "shower_quick"); // 75
    sleepSettlement(s, { hours: 8 });
    expect(s.player.attrs.hygiene).toBe(69);
    expect(s.player.attrs.hygiene).toBeGreaterThanOrEqual(0);
    expect(s.player.attrs.hygiene).toBeLessThanOrEqual(100);
  });

  it("干净度为 0 时冲个澡也能救回来", () => {
    const s = atBathhouse(500, 0);
    performAction(s, "shower_quick");
    expect(s.player.attrs.hygiene).toBe(45);
  });
});
