import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { applyForJob, completeWork, deliveryParttime, getJobDef, pauseWork, performJob, resumeWork, rideHailingParttime, takeJobOffer } from '../src/game/core/jobs';
import { deliveryShiftTimeLimit, getMiniGameConfig, getMiniGameConfigFor } from '../src/game/core/minigame';
import { migrateSave } from '../src/game/core/migrate';
import { gameDay } from '../src/game/core/calendar';

const keys = ['job_delivery', 'job_express', 'job_ride_hailing', 'job_taxi', 'job_delivery_fulltime'];

function start(key: string, seed: number) {
  const state = createInitialState(seed);
  state.time.day = 3; // 周一，正式配送班次为 08:00–16:00。
  state.time.hour = 8;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  state.player.attrs.hygiene = 100;
  state.flags.app_delivery = true;
  state.flags.app_ride_hailing = true;
  state.flags.item_driving_license = true;
  state.flags.item_car = true;
  if (key === 'job_delivery_fulltime') {
    state.locationId = 'logistics_center';
    expect(applyForJob(state, getJobDef(key)!).ok).toBe(true);
  } else if (key === 'job_express' || key === 'job_taxi') {
    state.locationId = 'labor_market';
    state.laborMarket.offers = [{ uid: 'duration_offer', jobId: key, quota: 1 }];
    state.laborMarket.generatedDay = gameDay(state.time);
  }
  const result = key === 'job_delivery' ? deliveryParttime(state)
    : key === 'job_ride_hailing' ? rideHailingParttime(state)
    : key === 'job_delivery_fulltime' ? performJob(state, key)
    : takeJobOffer(state, 'duration_offer');
  expect(result.ok, result.reason).toBe(true);
  return state;
}

function startWithDuration(key: string, seconds: 90 | 120) {
  for (let seed = 1; seed <= 100; seed++) {
    const state = start(key, seed);
    if (state.work?.active?.deliveryTimeLimitSec === seconds) return state;
  }
  throw new Error(`No ${seconds} second shift found for ${key}`);
}

describe('配送小游戏的固定普通班与加班时长', () => {
  it.each(keys)('%s 独立配置与不同技能等级都固定 90 秒，目标单数仍按技能缩放', key => {
    const base = getMiniGameConfig(key);
    expect(base?.type).toBe('delivery');
    expect(base?.timeLimit).toBe(90);
    const state = createInitialState(301);
    for (const level of [0, 6, 10]) {
      state.player.skills.driving = level;
      const cfg = getMiniGameConfigFor(state, key);
      expect(cfg?.type).toBe('delivery');
      expect(cfg?.timeLimit).toBe(90);
      if (cfg?.type === 'delivery' && base?.type === 'delivery') {
        expect(cfg.targetOrders).toBeLessThanOrEqual(base.targetOrders!);
        if (level === 10) expect(cfg.targetOrders).toBeLessThan(base.targetOrders!);
      }
    }
    expect(getMiniGameConfig(key)?.timeLimit).toBe(90);
  });

  it.each(keys)('%s 开班时保存普通或加班秒数，配置读取不再消耗随机数', key => {
    const expectedHours = key === 'job_delivery' || key === 'job_delivery_fulltime' ? 8 : 10;
    for (const seconds of [90, 120] as const) {
      const state = startWithDuration(key, seconds);
      const active = state.work!.active!;
      expect(deliveryShiftTimeLimit(active.seed)).toBe(seconds);
      expect(active.workedMinutes).toBe(expectedHours * 60);
      expect(active.endMinute - active.startMinute).toBe(expectedHours * 60);
      const rng = structuredClone(state.rng);
      for (const level of [0, 6, 10]) {
        state.player.skills.driving = level;
        expect(getMiniGameConfigFor(state, key)?.timeLimit).toBe(seconds);
      }
      expect(state.rng).toEqual(rng);
    }
  });

  it.each([90, 120] as const)('正式配送 %s 秒班暂停、序列化读档和恢复后保留同一时长与进度', seconds => {
    const state = startWithDuration('job_delivery_fulltime', seconds);
    const active = state.work!.active!;
    active.minigameProgress = { schema: 'urban-life-street-dispatch', remaining: seconds - 13, delivered: 2 };
    pauseWork(state);
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(loaded.work?.active).toMatchObject({
      id: active.id, seed: active.seed, status: 'paused', deliveryTimeLimitSec: seconds,
      minigameProgress: active.minigameProgress,
    });
    loaded.player.skills.driving = 10;
    expect(getMiniGameConfigFor(loaded, 'job_delivery_fulltime')?.timeLimit).toBe(seconds);
    resumeWork(loaded);
    expect(getMiniGameConfigFor(loaded, 'job_delivery_fulltime')?.timeLimit).toBe(seconds);
    expect(loaded.work?.active?.id).toBe(active.id);
  });

  it('旧班次没有新秒数字段时按 90 秒打开，保留已有小游戏快照且不重抽', () => {
    const state = startWithDuration('job_delivery_fulltime', 120);
    delete state.work!.active!.deliveryTimeLimitSec;
    state.work!.active!.minigameProgress = { remaining: 51, delivered: 1 };
    const rng = structuredClone(state.rng);
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)));
    expect(getMiniGameConfigFor(loaded, 'job_delivery_fulltime')?.timeLimit).toBe(90);
    expect(loaded.work?.active?.minigameProgress).toEqual({ remaining: 51, delivered: 1 });
    expect(loaded.rng).toEqual(rng);
  });

  it.each([90, 120] as const)('%s 秒挑战仍按8小时正式班记账，采用同一底薪与提成标准', seconds => {
    const state = startWithDuration('job_delivery_fulltime', seconds);
    const active = state.work!.active!;
    const money = state.player.money;
    const reference = active.deliveryPay!.referenceIncome;
    active.completedOrders=10;active.deliveryEarnedFare=reference-active.deliveryPay!.base;
    const result = completeWork(state, active.id, 1);
    expect(result.ok).toBe(true);
    expect(state.time.hour).toBe(16);
    expect(state.player.money).toBe(money); // 原正式工工资仍记入待发账户。
    expect(state.career.accruedWages).toBe(reference);
    expect(state.work?.masteryMinutes.job_delivery_fulltime).toBe(480);
  });
});
