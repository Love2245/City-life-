import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { JOB_DEFS, getJobDef, previewWork, performJob, completeWork, applyForJob, recordWageActionCompletion } from "../src/game/core/jobs";
import { HOUSING } from "../src/game/core/housing";
import { ACTIONS } from "../src/game/core/actions";
import { migrateSave } from "../src/game/core/migrate";

describe("工资与基本生活开销", () => {
  it("失败班次不获得首次工作标记，真实完成和旧工资记录仍能正确登记", () => {
    for (const score of [0, .8]) {
      const s = createInitialState(951); s.time.hour=8; s.locationId='farm';
      const start=performJob(s,'job_farm_hand'); expect(start.ok).toBe(true);
      expect(completeWork(s,start.session!.id,score).ok).toBe(true);
      expect(!!s.flags.ever_worked).toBe(score>=.6);
    }
    const legacy=createInitialState(952);
    expect(recordWageActionCompletion(legacy,'steel_shift',80)).toBe(true);
    expect(legacy.flags.ever_worked).toBe(true);
    expect(recordWageActionCompletion(legacy,'steel_shift',80)).toBe(false);
  });
  const cheapMeal = Math.abs(ACTIONS.find(action => action.id === "buy_lunch_convenience")!.effects.money!);
  const room = HOUSING.nightly.find(tier => tier.id === "hostel")!.price;
  const dailyBasics = cheapMeal * 3 + room + 4;
  it("普通八小时岗位基础工资均值位于120到150，长班最高不超过180", () => {
    const normal = JOB_DEFS.filter(job => job.duration === 8);
    const mean = normal.reduce((sum, job) => sum + (job.effects.money ?? 0), 0) / normal.length;
    expect(mean).toBeGreaterThanOrEqual(120);
    expect(mean).toBeLessThanOrEqual(150);
    for (const job of JOB_DEFS) expect(job.effects.money ?? 0, job.id).toBeLessThanOrEqual(180);
  });
  it("技能证书车辆和加班不重复乘配送提成，普通参考班约200元，更新前旧报价兑现", () => {
    for (const legacy of [false, true]) {
      let state = createInitialState(948);
      state.time.hour = 8; state.locationId = "labor_market";
      state.flags.skill_certificate_level = 3; state.flags.item_car = true;
      state.laborMarket.offers = [{ uid: "wage-qa", jobId: "job_express", quota: 1 }];
      for (const key of Object.keys(state.player.skills)) state.player.skills[key as keyof typeof state.player.skills] = 20;
      const start = performJob(state, "wage-qa");
      expect(start.ok, start.reason).toBe(true);
      const session = start.session!;
      session.overtime = true;
      if (legacy) { delete session.wageBalanceVersion; delete session.deliveryPay; session.baseWage = 240; }
      else { session.completedOrders=6;session.deliveryEarnedFare=200-session.deliveryPay!.base; }
      state = migrateSave(JSON.parse(JSON.stringify(state)));
      expect(state.work!.active!.wageBalanceVersion).toBe(legacy ? undefined : 2);
      const before = state.player.money;
      expect(completeWork(state, session.id, 1).ok).toBe(true);
      expect(state.player.money - before).toBe(legacy ? 378 : 200);
    }
  });
  it("新正式班次连同表现奖金和满勤比例仍在200以内", () => {
    const state = createInitialState(949);
    state.time.day = 3; state.time.hour = 8; state.locationId = "electronics_factory";
    state.player.stats.intelligence = 40;
    state.flags.skill_certificate_level = 3; state.player.skills.service = 20;
    expect(applyForJob(state, getJobDef("job_factory_tech")!).ok).toBe(true);
    const start = performJob(state, "job_factory_tech");
    expect(start.ok, start.reason).toBe(true);
    start.session!.overtime = true;
    expect(completeWork(state, start.session!.id, 1).ok).toBe(true);
    expect(state.career.periodBaseWages! + state.career.periodGameBonus! + Math.round(state.career.periodBaseWages! * .1)).toBeLessThanOrEqual(200);
  });
  it("普通完整班次覆盖三餐、青旅和通勤，仍留有积蓄", () => {
    for (const id of ["job_convenience_day", "job_market_cleaner", "job_waiter_fast", "job_convenience_clerk"]) {
      const state = createInitialState(945);
      state.time.hour = 8;
      const wage = previewWork(state, getJobDef(id)!).wage;
      expect(wage - dailyBasics, id).toBeGreaterThanOrEqual(50);
    }
  });
  it("重体力和技术岗位支付比基础服务更高的小时报酬", () => {
    const state = createInitialState(946);
    state.time.hour = 8;
    const basic = getJobDef("job_waiter_fast")!;
    for (const id of ["job_loading", "job_factory_qc", "job_factory_tech"]) {
      const job = getJobDef(id)!;
      expect(previewWork(state, job).wage / job.duration).toBeGreaterThan(previewWork(state, basic).wage / basic.duration);
    }
  });
  it("真实四小时农村日结按新工资到账，重复结算仍不能多领", () => {
    const state = createInitialState(947);
    state.time.hour = 8; state.locationId = "farm";
    const before = state.player.money;
    const start = performJob(state, "job_farm_hand");
    expect(start.ok, start.reason).toBe(true);
    const result = completeWork(state, start.session!.id, 0);
    expect(result.ok).toBe(true);
    expect(state.player.money - before).toBe(0); // 零分没有有效工作，不再提供保底工资。
    const paid = state.player.money;
    expect(completeWork(state, start.session!.id, 1).ok).toBe(false);
    expect(state.player.money).toBe(paid);
  });
});
