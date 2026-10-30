import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { canPerform, getAction, performAction } from "../src/game/core/actions";
import { inventoryList } from "../src/game/core/items";
import {
  completeWork,
  getTodayOffers,
  nowWorkMinute,
  pauseWork,
  performJob,
  rideHailingOrdersRemaining,
  rideHailingParttime,
  rideHailingShiftFlag,
  refreshLaborMarket,
  resumeWork,
} from "../src/game/core/jobs";
import { migrateSave } from "../src/game/core/migrate";
import { MARKET_APPS } from "../src/game/core/apps";
import type { GameState, WorkSession } from "../src/game/types";

describe("驾照与网约车流程", () => {
  it("报名与考试都只能付费一次，考试门槛明确且通过后驾驶本入包", () => {
    const state = createInitialState(3101);
    state.locationId = "driving_school";
    state.time.hour = 10;
    state.player.money = 10_000;
    const signup = getAction("sign_driving_course")!;
    const exam = getAction("driving_exam")!;

    expect(performAction(state, signup.id).ok).toBe(true);
    const afterSignup = state.player.money;
    expect(state.flags.item_driving_course).toBe(true);
    expect(performAction(state, signup.id)).toMatchObject({ ok: false, reason: expect.stringContaining("不必重复缴") });
    expect(state.player.money).toBe(afterSignup);

    state.player.stats.intelligence = 39;
    const lowIntelligence = performAction(state, exam.id);
    expect(lowIntelligence.ok).toBe(false);
    expect(lowIntelligence.reason).toContain("智力不足（需 40，当前 39）");
    expect(state.player.money).toBe(afterSignup);
    state.player.stats.intelligence = 40;

    expect(performAction(state, exam.id).ok).toBe(true);
    expect(state.flags.item_driving_license).toBe(true);
    expect(inventoryList(state).filter((entry) => entry.item.id === "driving_license")).toHaveLength(1);
    const afterExam = state.player.money;
    expect(performAction(state, exam.id)).toMatchObject({ ok: false, reason: expect.stringContaining("无需重复考试") });
    expect(performAction(state, signup.id)).toMatchObject({ ok: false, reason: expect.stringContaining("无需再次报名") });
    expect(state.player.money).toBe(afterExam);
  });

  it("新班次要求 App、驾照和汽车；开班只创建一次 10 小时会话", () => {
    const state = createInitialState(3102);
    const beforeMoney = state.player.money;
    const beforeTime = nowWorkMinute(state);
    expect(state.flags.app_ride_hailing).toBeUndefined();
    expect(rideHailingOrdersRemaining(state)).toBe(1);
    expect(rideHailingParttime(state).reason).toContain("驾驶证");

    state.flags.item_driving_license = true;
    expect(rideHailingParttime(state).reason).toContain("汽车");
    state.flags.item_car = true;
    expect(rideHailingParttime(state).reason).toContain("安装网约车软件");
    expect(state.work?.active).toBeUndefined();
    expect(nowWorkMinute(state)).toBe(beforeTime);
    expect(state.player.money).toBe(beforeMoney);

    state.flags.app_ride_hailing = true;
    const started = rideHailingParttime(state);
    expect(started.ok).toBe(true);
    expect(started.session).toMatchObject({
      workedMinutes: 600,
      standardMinutes: 600,
      baseWage: 0,
      completedOrders: 0,
    });
    expect(started.session!.endMinute - started.session!.startMinute).toBe(600);
    expect(nowWorkMinute(state)).toBe(beforeTime);
    expect(state.player.money).toBe(beforeMoney);
    expect(rideHailingOrdersRemaining(state)).toBe(0);

    const sameSession = rideHailingParttime(state);
    expect(sameSession.session?.id).toBe(started.session!.id);
    pauseWork(state);
    expect(state.work?.active?.status).toBe("paused");
    expect(nowWorkMinute(state)).toBe(beforeTime);
    expect(state.player.money).toBe(beforeMoney);
    expect(resumeWork(state)?.completedOrders).toBe(0);
    expect(completeWork(state, started.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(beforeMoney); // 空车班次可结算，零单就是零收入
    expect(nowWorkMinute(state) - beforeTime).toBe(600);
    expect(state.flags[rideHailingShiftFlag(started.session!.day)]).toBe(true);
    expect(rideHailingOrdersRemaining(state)).toBe(0);
    expect(rideHailingParttime(state).reason).toContain("今天已开始过");
    expect(MARKET_APPS.some((app) => app.flag === "app_ride_hailing")).toBe(true);
  });

  it("每单固定 25 元，评级、名气、培训证、技能、CPI 与难度都不影响结算，且不可重复结算", () => {
    const state = createInitialState(3104);
    state.flags.app_ride_hailing = true;
    state.flags.item_driving_license = true;
    state.flags.item_car = true;
    state.flags.skill_certificate_level = 3;
    state.player.stats.fame = 95;
    state.player.skills.driving = 20;
    state.economy.priceIndex = 2.5;
    const started = rideHailingParttime(state);
    expect(started.ok).toBe(true);
    started.session!.completedOrders = 3;
    const cashBefore = state.player.money;
    const timeBefore = nowWorkMinute(state);

    const settled = completeWork(state, started.session!.id, 1);

    expect(settled.ok).toBe(true);
    expect(state.player.money - cashBefore).toBe(75);
    expect(state.work!.wageRecords.at(-1)).toMatchObject({ base: 75, gameBonus: 0, total: 75, attendanceBonus: 0 });
    expect(settled.result?.verdict).toContain("完成 3 单，到账 ¥75");
    expect(nowWorkMinute(state) - timeBefore).toBe(600);
    const moneyAfter = state.player.money;
    const timeAfter = nowWorkMinute(state);
    expect(completeWork(state, started.session!.id, 1).ok).toBe(false);
    expect(state.player.money).toBe(moneyAfter);
    expect(nowWorkMinute(state)).toBe(timeAfter);
  });

  it("已存档的新班次保留送达数，跨午夜仍按开班日锁定并只结算一次", () => {
    const state = createInitialState(3105);
    state.time.hour = 20;
    state.flags.app_ride_hailing = true;
    state.flags.item_driving_license = true;
    state.flags.item_car = true;
    const started = rideHailingParttime(state);
    expect(started.ok).toBe(true);
    started.session!.completedOrders = 2;
    const startDay = started.session!.day;
    const beforeTime = nowWorkMinute(state);
    const cashBefore = state.player.money;

    pauseWork(state);
    expect(nowWorkMinute(state)).toBe(beforeTime);
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    const loaded = migrateSave(saved);
    expect(loaded.work?.active?.completedOrders).toBe(2);
    expect(loaded.work?.active?.status).toBe("paused");
    const resumed = rideHailingParttime(loaded);
    expect(resumed.session?.id).toBe(started.session!.id);
    expect(resumed.session?.completedOrders).toBe(2);
    resumeWork(loaded);

    expect(completeWork(loaded, resumed.session!.id, 1).ok).toBe(true);
    expect(loaded.player.money - cashBefore).toBe(50);
    expect(nowWorkMinute(loaded) - beforeTime).toBe(600);
    expect(loaded.time.day).toBeGreaterThan(startDay);
    expect(loaded.work!.wageRecords.at(-1)?.day).toBe(startDay);
    expect(loaded.flags[rideHailingShiftFlag(startDay)]).toBe(true);
    expect(completeWork(loaded, resumed.session!.id, 1).ok).toBe(false);
    expect(loaded.player.money - cashBefore).toBe(50);
  });

  it("旧存档的一小时进行中订单仍按冻结工资和原时长收尾", () => {
    const state = createInitialState(3106);
    const startMinute = nowWorkMinute(state);
    const legacy: WorkSession = {
      id: "legacy_ride_order",
      jobId: "job_ride_hailing",
      kind: "day",
      source: "delivery",
      day: state.time.day,
      startMinute,
      endMinute: startMinute + 60,
      workedMinutes: 60,
      standardMinutes: 600,
      baseWage: 37,
      effects: { stamina: -10, stress: 3, mood: 1 },
      seed: 9,
      canSkip: false,
      status: "paused",
    };
    state.work!.active = legacy;
    const cashBefore = state.player.money;

    const settled = completeWork(state, legacy.id, 1);

    expect(settled.ok).toBe(true);
    expect(state.player.money - cashBefore).toBe(39); // 旧版 5% 表现奖金沿用已开始会话
    expect(settled.result?.duration).toBe(1);
    expect(nowWorkMinute(state) - startMinute).toBe(60);
  });

  it("劳务市场不再派发网约车岗位，旧 offer 也不能绕过 App 新开班", () => {
    const state = createInitialState(3107);
    refreshLaborMarket(state);
    expect(state.laborMarket.offers.some((offer) => offer.jobId === "job_ride_hailing")).toBe(false);
    state.laborMarket.offers.push({ uid: "legacy_ride_offer", jobId: "job_ride_hailing", quota: 1 });
    expect(getTodayOffers(state).some(({ def }) => def.id === "job_ride_hailing")).toBe(false);
    expect(performJob(state, "legacy_ride_offer")).toMatchObject({
      ok: false,
      reason: "网约车班次只能通过手机网约车 App 开始",
    });
    expect(state.work?.active).toBeUndefined();
  });

  it("旧档已有驾照资格但背包缺驾驶本时会补齐", () => {
    const state = createInitialState(3103);
    state.flags.item_driving_license = true;
    delete state.inventory.driving_license;
    state.locationId = "car_rental";
    state.player.money = 5_000;
    expect(inventoryList(state).some((entry) => entry.item.id === "driving_license")).toBe(false);
    const migrated = migrateSave(state);
    expect(migrated.inventory.driving_license).toBe(1);
    expect(canPerform(migrated, getAction("rent_car_shop")!).ok).toBe(true);
  });
});
