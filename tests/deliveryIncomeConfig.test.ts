import { describe, expect, it } from 'vitest';
import type { WorkSession } from '../src/game/types';
import { createInitialState } from '../src/game/core/state';
import { getMiniGameConfigFor } from '../src/game/core/minigame';

function session(jobId: string, source: WorkSession['source'], baseWage: number, overtime = false): WorkSession {
  return {
    id: `test_${jobId}`, jobId, kind: 'formal', source, day: 1,
    startMinute: 0, endMinute: 600, workedMinutes: 600, standardMinutes: 600,
    baseWage, overtime, effects: {}, seed: 1, canSkip: false, status: 'playing',
  };
}

describe('驾驶配送工资预览配置', () => {
  it('兼职外卖与网约车按岗位实际收入模式显示', () => {
    const state = createInitialState(7101);
    state.work!.active = session('job_delivery', 'delivery', 0);
    expect(getMiniGameConfigFor(state, 'job_delivery')).toMatchObject({ actualIncome: true });
    state.work!.active = session('job_ride_hailing', 'delivery', 0);
    expect(getMiniGameConfigFor(state, 'job_ride_hailing')).toMatchObject({ actualIncome: true });
  });

  it('固定工资配送展示含加班倍率的底薪与岗位奖金率', () => {
    const state = createInitialState(7102);
    state.work!.active = session('job_delivery_fulltime', 'formal', 240, true);
    expect(getMiniGameConfigFor(state, 'job_delivery_fulltime')).toMatchObject({
      fixedShiftBase: 360,
      shiftBonusRate: 0.05,
    });
  });
});
