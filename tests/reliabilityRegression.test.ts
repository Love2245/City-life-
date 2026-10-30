// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, pushLog } from '../src/game/engine';
import { advanceHours, previewSleepStamina, sleepSettlement, sleep } from '../src/game/core/time';
import { processWorkCalendar } from '../src/game/core/career';
import { gameDay } from '../src/game/core/calendar';
import { saveGameImmediately, loadGame } from '../src/lib/save';
import { showToast, uiState } from '../src/stores/uiStore.svelte';

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('continuous play reliability', () => {
  it('new important events remain observable after log retention reaches 200', () => {
    const s = createInitialState(24);
    for (let n = 0; n < 250; n++) pushLog(s, '📝', `history ${n}`);
    const cursor = Number(s.flags.log_sequence);
    pushLog(s, '💰', '工资到账'); pushLog(s, '⏰', '迟到罚款');
    expect(s.log.length).toBe(200);
    expect(s.log.filter(e => (e.sequence ?? 0) > cursor).map(e => e.text)).toEqual(['工资到账', '迟到罚款']);
  });
  it('bed efficiency and capped stamina preview match actual restoration', () => {
    const baseline = createInitialState(24); baseline.player.attrs.stamina = 20;
    const unboosted = previewSleepStamina(baseline, 4);
    for (const bed of ['bed_standard', 'bed_premium']) {
      const s = createInitialState(24); s.equipped.furniture = bed;
      s.player.attrs.stamina = 20;
      const expected = previewSleepStamina(s, 4);
      expect(expected).toBeGreaterThan(unboosted);
      sleepSettlement(s, {hours:4, stayedUp:false});
      expect(s.player.attrs.stamina).toBe(expected);
    }
  });
  it('leave-page checkpoint persists synchronously and exposes storage failure', async () => {
    const s = createInitialState(24); s.player.money = 1234;
    saveGameImmediately('auto', s);
    expect((await loadGame('auto'))?.player.money).toBe(1234);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('quota');});
    expect(() => saveGameImmediately('auto', s)).toThrow('存档写入失败'); spy.mockRestore();
  });
  it('rejects invalid state before mutating the save slot or saved flag', () => {
    const valid = createInitialState(25);
    saveGameImmediately('auto', valid);
    const previous = localStorage.getItem('urban_life_save_auto');
    const invalid = createInitialState(26);
    invalid.player.money = Number.NaN;
    expect(() => saveGameImmediately('auto', invalid)).toThrow('当前状态结构无效');
    expect(invalid.flags.saved_once).toBeUndefined();
    expect(localStorage.getItem('urban_life_save_auto')).toBe(previous);
  });
  it('debt ending waits for three daily settlements with debt', () => {
    const s = createInitialState(27);
    s.player.money = 0;
    s.player.debt = 100;
    for (let day = 0; day < 3; day += 1) {
      if (day > 0) s.time.day += 1;
      s.time.hour = 22;
      s.time.stayedUp = false;
      sleepSettlement(s, { hours: 8, stayedUp: false });
      expect(s.player.debtStreak).toBe(day + 1);
      if (day < 2) expect(s.endingId).toBeNull();
    }
    expect(s.player.debtStreak).toBe(3);
    expect(s.endingId).toBe('ending_bankrupt');
  });
  it('counts consecutive debt days when midnight passes without sleep', () => {
    const s = createInitialState(27);
    s.player.money = 0;
    s.player.debt = 100;
    for (let day = 0; day < 3; day += 1) {
      advanceHours(s, 24);
      expect(s.player.debtStreak).toBe(day + 1);
      if (day < 2) expect(s.endingId).toBeNull();
    }
    expect(s.endingId).toBe('ending_bankrupt');
  });
  it('automatic loan repayment clears the consecutive debt counter', () => {
    const s = createInitialState(28);
    s.player.money = 0;
    s.player.debt = 100;
    s.time.hour = 22;
    sleepSettlement(s, { hours: 8, stayedUp: false });
    expect(s.player.debtStreak).toBe(1);
    s.time.day += 1;
    s.time.hour = 22;
    s.player.money = 100;
    sleepSettlement(s, { hours: 8, stayedUp: false });
    expect(s.player.debt).toBe(0);
    expect(s.player.debtStreak).toBe(0);
    expect(s.endingId).toBeNull();
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])('normalizes corrupted rent due day %s instead of looping', (nextRentDay) => {
    const s = createInitialState(29);
    s.living = { mode: 'lease', govDaysLeft: 0, nightly: null, lease: {
      housingId: 'old_apartment', rent: 1000, rentGrowthCount: 0, nextRentDay,
    } };
    s.time.hour = 22;
    sleepSettlement(s, { hours: 8, stayedUp: false });
    expect(s.living.lease?.nextRentDay).toBe(gameDay(s.time) + 30);
    expect(s.player.money).toBe(500);
  });
  it('preserves a valid future rent due date without charging early', () => {
    const s = createInitialState(29);
    s.living = { mode: 'lease', govDaysLeft: 0, nightly: null, lease: {
      housingId: 'old_apartment', rent: 1000, rentGrowthCount: 0, nextRentDay: 999999,
    } };
    s.time.hour = 22;
    sleepSettlement(s, { hours: 8, stayedUp: false });
    expect(s.living.lease?.nextRentDay).toBe(999999);
    expect(s.player.money).toBe(500);
  });
  it('repairs non-finite work calendar cursors before processing', () => {
    const s = createInitialState(30);
    s.career.jobId = 'job_warehouse';
    s.career.hiredDay = gameDay(s.time);
    s.career.firstShiftDay = Number.NEGATIVE_INFINITY;
    s.career.nextShiftDay = Number.NEGATIVE_INFINITY;
    s.career.nextPayDay = Number.NEGATIVE_INFINITY;
    processWorkCalendar(s);
    expect(Number.isSafeInteger(s.career.firstShiftDay)).toBe(true);
    expect(Number.isSafeInteger(s.career.nextShiftDay)).toBe(true);
    expect(s.career.nextShiftDay).toBeGreaterThanOrEqual(s.career.firstShiftDay!);
    expect(s.career.nextPayDay).toBe(gameDay(s.time) + 7);
  });
  it('short late-night sleep includes the new disorder in its preview without mutating state', () => {
    const s = createInitialState(24); s.time.hour = 23; s.player.attrs.stamina = 20;
    const expected = previewSleepStamina(s, 4);
    expect(s.statuses.some(status => status.id === 'sleep_disorder')).toBe(false);
    sleep(s, 4);
    expect(s.player.attrs.stamina).toBe(expected);
  });
  it('multiple notices are shown sequentially instead of overwritten', () => {
    vi.useFakeTimers(); uiState.toast = null;
    showToast('first'); showToast('second');
    expect(uiState.toast).toBe('first');
    vi.advanceTimersByTime(1200); expect(uiState.toast).toBe('second');
    vi.advanceTimersByTime(1200); expect(uiState.toast).toBeNull();
  });
});
