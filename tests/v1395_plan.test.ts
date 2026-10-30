import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { enterRegion, getRegion, isRegionUnlocked } from "../src/game/core/regions";
import { getJobDef } from "../src/game/core/jobs";
import { careerTierOf, careerTrackOf, careerTierFor, recordCareerProgress } from "../src/game/core/career";
import { eternalChallengeOf } from "../src/game/core/eternal";
import { checkEventConditions, EVENTS } from "../src/game/core/events";
import { runBatchSimulation } from "../src/game/core/simulation";

describe("v1.395 content expansion hooks", () => {
  it("锁定区域在完成路线办理后可进入", () => {
    const state = createInitialState(1395);
    const region = getRegion("heavy_industry");
    expect(isRegionUnlocked(state, region)).toBe(false);
    expect(enterRegion(state, "heavy_industry").ok).toBe(false);
    state.flags.route_heavy_industry = true;
    expect(isRegionUnlocked(state, region)).toBe(true);
    expect(enterRegion(state, "heavy_industry").ok).toBe(true);
  });

  it("工作履历按轨道累计并触发阶梯晋升", () => {
    const state = createInitialState(1395);
    const job = getJobDef("job_delivery")!;
    expect(careerTrackOf(job)).toBe("driving");
    expect(careerTierOf(job)).toBe("entry");
    for (let i = 0; i < 3; i++) recordCareerProgress(state, job);
    expect(careerTierFor(state, job)).toBe("skilled");
    expect(state.career.experience?.driving).toBe(3);
  });

  it("永恒模式提供独立赛季目标与专属事件池", () => {
    const normal = createInitialState(1395);
    expect(eternalChallengeOf(normal)).toBeNull();
    const eternal = createInitialState(1395);
    eternal.mode = "eternal";
    eternal.locationId = "street"; // v1.43：家是安全区，事件判定放在街头
    expect(eternalChallengeOf(eternal)?.title).toBeTruthy();
    const event = EVENTS.find((e) => e.id === "ev_eternal_route_offer")!;
    expect(checkEventConditions(eternal, event)).toBe(true);
    expect(checkEventConditions(normal, event)).toBe(false);
  });

  it("批量模拟返回经济、破产、事件重复率指标", () => {
    const report = runBatchSimulation({ days: 30, runs: 2, seed: 1395 });
    expect(report.runs).toBe(2);
    expect(report.finalMoney.min).toBeTypeOf("number");
    expect(report.bankruptcyRate).toBeGreaterThanOrEqual(0);
    expect(report.eventRepeatRate).toBeGreaterThanOrEqual(0);
  });
});
