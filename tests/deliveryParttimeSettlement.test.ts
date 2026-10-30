import { describe, expect, it } from 'vitest';
import type { WorkSession } from '../src/game/types';
import { createInitialState } from '../src/game/core/state';
import {
  applyForJob, completeWork, deliveryOrdersRemaining, deliveryParttime,
  DELIVERY_SHIFT_MINUTES, getJobDef, nowWorkMinute, pauseWork, performJob, resumeWork, takeJobOffer,
} from '../src/game/core/jobs';
import { applyDeliveryTrafficIncident } from '../src/game/core/deliveryTraffic';
import { getMiniGameConfigFor } from '../src/game/core/minigame';
import { migrateSave } from '../src/game/core/migrate';
import { advanceHours } from '../src/game/core/time';
import { gameDay } from '../src/game/core/calendar';
import { rentVehicle } from '../src/game/core/vehicle';

function ready(vehicle = 'bicycle') {
  const state = createInitialState(8104);
  state.time.day = 3;
  state.time.hour = 8;
  state.time.minute = 0;
  Object.assign(state.player.attrs, { health: 100, stamina: 100, satiety: 100, hygiene: 100 });
  state.flags.app_delivery = true;
  if (vehicle !== 'none') state.flags[`item_${vehicle}`] = true;
  return state;
}

describe('手机兼职外卖八小时实际收入班次', () => {
  it('无车时拒绝开工，不扣体力、时间、金钱或占当日班次', () => {
    const state = ready('none');
    state.player.attrs.stamina = 0;
    const before = JSON.stringify(state);
    expect(deliveryOrdersRemaining(state)).toBe(1);
    expect(deliveryParttime(state)).toMatchObject({ ok: false, reason: expect.stringContaining('购买或租用配送车辆') });
    expect(JSON.stringify(state)).toBe(before);
    expect(state.work?.active).toBeUndefined();
    expect(deliveryOrdersRemaining(state)).toBe(1);
  });

  it.each(['bicycle', 'e_bike', 'tricycle', 'car'])('%s 可开工且不用为骑车另设驾照要求', vehicle => {
    const state = ready(vehicle);
    const start = nowWorkMinute(state);
    const money = state.player.money;
    const stamina = state.player.attrs.stamina;
    expect(state.flags.item_driving_license).toBeUndefined();
    const result = deliveryParttime(state);
    expect(result.ok, result.reason).toBe(true);
    expect(result.session).toMatchObject({ source: 'delivery', jobId: 'job_delivery', baseWage: 0, workedMinutes: 480, standardMinutes: 480, completedOrders: 0, canSkip: false });
    expect(result.session!.effects).toMatchObject({ stamina: -50, stress: 10, mood: 1 });
    expect(result.session!.endMinute - result.session!.startMinute).toBe(DELIVERY_SHIFT_MINUTES);
    expect(result.result?.duration).toBe(8);
    expect(nowWorkMinute(state)).toBe(start);
    expect(state.player.money).toBe(money);
    expect(state.player.attrs.stamina).toBe(stamina);
    expect(deliveryOrdersRemaining(state)).toBe(0);
    const rng = structuredClone(state.rng);
    expect(deliveryParttime(state).session?.id).toBe(result.session!.id);
    expect(state.rng).toEqual(rng);
    expect(state.work?.sequence).toBe(1);
  });

  it.each(['e_bike', 'tricycle', 'car'])('租用 %s 也满足准入，沿用现有车辆 flag', vehicle => {
    const state = ready('none');
    state.player.money = 10000;
    expect(rentVehicle(state, vehicle).ok).toBe(true);
    expect(state.vehicles[vehicle].owned).not.toBe(true);
    expect(deliveryParttime(state).ok).toBe(true);
  });

  it('底薪加实际提成到账，不按单价封顶，不乘评级、名气、证书、技能和物价，罚款不重复扣', () => {
    const state = ready('car');
    state.flags.skill_certificate_level = 3;
    state.player.stats.fame = 95;
    state.player.skills.driving = 20;
    state.economy.priceIndex = 2.5;
    state.work!.masteryMinutes.job_delivery = 100000;
    const started = deliveryParttime(state);
    const session = started.session!;
    session.completedOrders = 2;
    session.deliveryEarnedFare = 83.75;
    const start = nowWorkMinute(state);
    const before = state.player.money;
    expect(applyDeliveryTrafficIncident(state, { kind: 'collision', fine: 3, message: '碰撞罚款' })).toBe(3);
    expect(session.canSkip).toBe(true); // 十次后仍选择继续实际配送。
    const result = completeWork(state, session.id, 1);
    expect(result.ok).toBe(true);
    expect(state.player.money).toBe(before - 3 + 119.75);
    expect(nowWorkMinute(state) - start).toBe(480);
    expect(state.work!.wageRecords.at(-1)).toMatchObject({ day: session.day, base: 119.75, gameBonus: 0, attendanceBonus: 0, total: 119.75 });
    expect(result.result?.verdict).toBe('送达 2 单，底薪 ¥36 + 订单提成 ¥83.75 = 本班工资 ¥119.75；已到账（交通罚款已在配送途中扣除）');
    expect(result.result?.verdict).not.toContain('表现奖金');
    const settled = JSON.stringify(state);
    expect(completeWork(state, session.id, 1).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(settled);
    expect(deliveryParttime(state).reason).toContain('今天已开始过兼职外卖班次');
    expect(state.weekly.jobsDone).toBe(1);
  });

  it.each([undefined, -10, NaN, Infinity])('实际收入 %s 按零到账，缺失字段不回退到固定基础工资', amount => {
    const state = ready();
    const session = deliveryParttime(state).session!;
    session.completedOrders = 5;
    session.deliveryEarnedFare = amount;
    const before = state.player.money;
    expect(completeWork(state, session.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(before);
    expect(state.work!.wageRecords.at(-1)).toMatchObject({ base: 0, gameBonus: 0, total: 0 });
  });

  it('已结束旧单在同日也占一班，次日才可开工', () => {
    const state = ready();
    const today = gameDay(state.time);
    state.flags[`delivery_order_${today}`] = 4;
    expect(deliveryOrdersRemaining(state)).toBe(0);
    expect(deliveryParttime(state).ok).toBe(false);
    expect(state.work?.active).toBeUndefined();
    advanceHours(state, 24);
    Object.assign(state.player.attrs, { stamina: 100, satiety: 100, hygiene: 100 });
    expect(deliveryOrdersRemaining(state)).toBe(1);
    expect(deliveryParttime(state).ok).toBe(true);
  });

  it('旧一小时暂停会话读档修复为八小时，保留时限、收入、快照和种子且只结算一次', () => {
    const state = ready();
    const start = nowWorkMinute(state);
    const legacy: WorkSession = {
      id: 'legacy_delivery_order', jobId: 'job_delivery', kind: 'day', source: 'delivery', day: gameDay(state.time),
      startMinute: start, endMinute: start + 60, workedMinutes: 60, standardMinutes: 600, baseWage: 25,
      effects: { stamina: -10, stress: 3, mood: 1 }, seed: 4928, status: 'paused', canSkip: true,
      completedOrders: 3, deliveryEarnedFare: 44.5, deliveryTimeLimitSec: 120,
      minigameProgress: { schema: 'urban-life-street-dispatch', remaining: 65, delivered: 3, earnedFare: 44.5 },
    };
    state.work!.active = legacy;
    const raw = JSON.stringify(state);
    const loaded = migrateSave(JSON.parse(raw));
    expect(JSON.stringify(state)).toBe(raw);
    expect(loaded.work!.active).toMatchObject({ ...legacy, endMinute: start + 480, workedMinutes: 480, standardMinutes: 480, baseWage: 0, canSkip: false });
    expect(getMiniGameConfigFor(loaded, 'job_delivery')?.timeLimit).toBe(120);
    expect(deliveryOrdersRemaining(loaded)).toBe(0);
    expect(deliveryParttime(loaded).session?.id).toBe(legacy.id);
    expect(resumeWork(loaded)?.status).toBe('playing');
    const cash = loaded.player.money;
    expect(completeWork(loaded, legacy.id, 1).ok).toBe(true);
    expect(nowWorkMinute(loaded) - start).toBe(480);
    expect(loaded.player.money).toBe(cash + 44.5);
    expect(completeWork(loaded, legacy.id, 1).ok).toBe(false);
  });

  it('旧进行中班次缺少累计收入字段仍可恢复，但无车不能绕过开工或继续检查', () => {
    const state = ready();
    const session = deliveryParttime(state).session!;
    session.endMinute = session.startMinute + 60;
    session.workedMinutes = 60;
    session.baseWage = 19;
    session.minigameProgress = { remaining: 41, delivered: 1 };
    delete session.deliveryEarnedFare;
    delete session.deliveryTimeLimitSec;
    pauseWork(state);
    state.flags.item_bicycle = false;
    const cash = state.player.money;
    const time = nowWorkMinute(state);
    expect(deliveryParttime(state).reason).toContain('配送车辆');
    expect(resumeWork(state)).toBeUndefined();
    expect(state.work!.active?.status).toBe('paused');
    expect(nowWorkMinute(state)).toBe(time);
    expect(state.player.money).toBe(cash);
    state.flags.item_bicycle = true;
    expect(resumeWork(state)?.id).toBe(session.id);
    expect(getMiniGameConfigFor(state, 'job_delivery')?.timeLimit).toBe(90);
    expect(state.work!.active?.minigameProgress).toEqual({ remaining: 41, delivered: 1 });
    expect(completeWork(state, session.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(cash);
    expect(nowWorkMinute(state) - time).toBe(480);
  });

  it('更新前已开工的劳务市场岗位继续结算十小时固定工资与表现奖金', () => {
    const state = ready('none');
    state.locationId = 'labor_market';
    state.laborMarket.offers = [{ uid: 'fixed_delivery_offer', jobId: 'job_delivery', quota: 1 }];
    const result = takeJobOffer(state, 'fixed_delivery_offer');
    expect(result.ok, result.reason).toBe(true);
    expect(result.session?.source).toBe('market');
    expect(result.session?.workedMinutes).toBe(600);
    delete result.session!.deliveryPay; // Simulate an already-open shift from before the piece-rate update.
    const wage = result.session!.baseWage;
    const cash = state.player.money;
    result.session!.deliveryEarnedFare = 800;
    expect(completeWork(state, result.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(cash + wage + Math.round(wage * .05));
  });

  it('更新前已开工的正式外卖保留旧班次工资与待发周期', () => {
    const state = ready('none');
    const job = getJobDef('job_delivery_fulltime')!;
    state.locationId = job.locationId!;
    expect(applyForJob(state, job).ok).toBe(true);
    const result = performJob(state, job.id);
    expect(result.ok, result.reason).toBe(true);
    expect(result.session?.workedMinutes).toBe(480);
    delete result.session!.deliveryPay; // Simulate an already-open shift from before the piece-rate update.
    const wage = result.session!.baseWage;
    const cash = state.player.money;
    result.session!.deliveryEarnedFare = 800;
    expect(completeWork(state, result.session!.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(cash);
    expect(state.career.accruedWages).toBe(wage + Math.round(wage * 0.05));
  });
});
