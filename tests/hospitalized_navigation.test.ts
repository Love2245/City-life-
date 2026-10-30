import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { canSleepHere } from "../src/game/core/housing";
import { canPerform, getAction, moveTo, travelToRegion } from "../src/game/core/actions";
import { enterRegion, goToMap } from "../src/game/core/regions";
import { residenceLocationId } from "../src/game/core/residence";
import { sleepSettlement } from "../src/game/core/time";

describe("住院状态的移动与睡眠", () => {
  it("住院期间不能经移动、区域入口或地图入口离开医院", () => {
    const state = createInitialState(47501);
    state.flags["hospitalized"] = true;
    state.locationId = "hospital";
    state.region = "downtown_center";
    state.navStack = ["map", "downtown", "downtown_center"];

    expect(moveTo(state, "home")).toMatchObject({ ok: false });
    expect(travelToRegion(state, "downtown")).toMatchObject({ ok: false });
    expect(enterRegion(state, "downtown")).toMatchObject({ ok: false });
    goToMap(state);

    expect(state.locationId).toBe("hospital");
    expect(state.region).toBe("downtown_center");
    expect(canSleepHere(state)).toBe(true);
  });

  it("住院后即使误到住处，也不能触发住院睡眠结算", () => {
    const state = createInitialState(47502);
    state.flags["hospitalized"] = true;
    state.locationId = residenceLocationId(state);

    expect(canSleepHere(state)).toBe(false);
    const sleepAction = getAction("sleep_home");
    expect(sleepAction).toBeDefined();
    expect(canPerform(state, sleepAction!)).toMatchObject({ ok: false });
  });

  it("住满三晚但健康不足60时继续治疗，达到安全线后才出院", () => {
    const state = createInitialState(47503);
    state.flags["hospitalized"] = true;
    state.flags["hospitalNights"] = 2;
    state.locationId = "hospital";
    state.region = "downtown_center";
    state.player.attrs.health = 30;
    const moneyBefore = state.player.money;

    sleepSettlement(state, { stayedUp: false, hours: 8 });
    expect(state.player.attrs.health).toBe(44.5);
    expect(state.flags["hospitalized"]).toBe(true);
    expect(state.flags["hospitalNights"]).toBe(3);

    delete state.flags["settledAnchor"];
    delete state.flags["settledToday"];
    sleepSettlement(state, { stayedUp: false, hours: 8 });
    expect(state.player.attrs.health).toBe(57.5);
    expect(state.flags["hospitalized"]).toBe(true);
    expect(state.flags["hospitalNights"]).toBe(4);

    delete state.flags["settledAnchor"];
    delete state.flags["settledToday"];
    sleepSettlement(state, { stayedUp: false, hours: 8 });
    expect(state.player.attrs.health).toBeGreaterThanOrEqual(60);
    expect(state.flags["hospitalized"]).toBe(false);
    expect(state.player.money).toBe(moneyBefore - 180);
  });
});
