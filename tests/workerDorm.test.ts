import {completeWork} from '../src/game/core/jobs';
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { performAction } from "../src/game/core/actions";
import {
  currentResidence, isResidenceBuildingVisible, grantWorkerDormStay, hasWorkerDormStay,
  WORKER_DORM_STAY_UNTIL, residenceLocationId,
} from "../src/game/core/residence";
import { gameDay } from "../src/game/core/calendar";

describe("industrial worker dorm", () => {
  it("stays hidden until the heavy-industry route is unlocked", () => {
    const state = createInitialState(2);
    expect(isResidenceBuildingVisible(state, "worker_dormitory")).toBe(false);
    state.flags.route_heavy_industry = true;
    expect(isResidenceBuildingVisible(state, "worker_dormitory")).toBe(true);
  });

  it("lets a worker with a completed factory shift use the active dorm stay", () => {
    const state = createInitialState(3);
    state.locationId = "worker_dormitory";
    state.region = "heavy_industry";
    state.flags.route_heavy_industry = true;
    grantWorkerDormStay(state);
    const result = performAction(state, "stay_worker_dorm");
    expect(result.ok).toBe(true);
    expect(currentResidence(state).id).toBe("worker_dorm");
    expect(currentResidence(state).facilities).toContain("shower");
  });

  it("explains that a factory shift is needed before registration", () => {
    const state = createInitialState(4);
    state.locationId = "worker_dormitory";
    state.region = "heavy_industry";
    state.flags.route_heavy_industry = true;
    const result = performAction(state, "stay_worker_dorm");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("工厂班次");
  });

  it("a completed factory shift grants lodging through the second full day", () => {
    const state = createInitialState(5);
    state.locationId = "steel_factory";
    state.region = "heavy_industry";
    state.flags.route_heavy_industry = true;
    state.flags.skill_certificate_level = 1;
    const moneyBefore = state.player.money;
    const result = performAction(state, "steel_shift");
    expect(result.ok).toBe(true);
    completeWork(state,state.work!.active!.id,1);
    expect(state.flags.industrial_dorm_qualified).toBe(true);
    expect(state.player.money - moneyBefore).toBe(189);
    expect(hasWorkerDormStay(state)).toBe(true);
    expect(state.flags[WORKER_DORM_STAY_UNTIL]).toBe((gameDay(state.time) + 3) * 1440);
    expect(residenceLocationId(state)).toBe("worker_dormitory");
  });
});
