import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { addItem } from '../src/game/core/items';
import { equipItem, unequipItem } from '../src/game/core/equipment';
import { sleep } from '../src/game/core/time';
import { performAction, waitHere } from '../src/game/core/actions';
import { tickDailyGoals } from '../src/game/core/quests';
import { performJob, completeWork } from '../src/game/core/jobs';
import { applyEffects } from '../src/game/engine';
import { migrateSave } from '../src/game/core/migrate';


describe('2026-10-03 core regressions', () => {
  it('C01: waiting across midnight then sleeping settles only the previous date', () => {
    const s = createInitialState(6100301);
    s.time.hour = 22;
    s.locationId = 'hostel';
    s.living = { mode: 'nightly', govDaysLeft: 0, nightly: { lodgingId: 'hostel' }, lease: null };
    s.weather = { id: 'sunny', lastRollDay: 0 };
    const early = structuredClone(s);
    sleep(early, 8);
    expect(early.player.money).toBe(475);
    expect(early.player.hungryStreak).toBe(1);
    expect(waitHere(s, 3).ok).toBe(true);
    const afterMidnight = { money: s.player.money, hygiene: s.player.attrs.hygiene, hungryStreak: s.player.hungryStreak, anchor: s.flags.settledAnchor };
    expect(afterMidnight.money).toBe(475);
    expect(afterMidnight.anchor).toBe(20260801);
    sleep(s, 8);
    expect(s.player.money).toBe(475);
    expect(s.player.attrs.hygiene).toBe(74);
    expect(s.player.hungryStreak).toBe(1);
    expect(s.flags.settledAnchor).toBe(20260801);
  });

  it('C02: bath center settles one date for its 24 hour action', () => {
    const s = createInitialState(6100302);
    s.locationId = 'bathhouse';
    s.time.hour = 12;
    s.player.money = 5000;
    const result = performAction(s, 'bath_center');
    expect(result.ok, result.reason).toBe(true);
    expect(s.time.day).toBe(2);
    expect(s.time.hour).toBe(12);
    expect(s.living.govDaysLeft).toBe(6);
    expect(s.player.hungryStreak).toBe(1);
    expect(s.player.attrs.health).toBe(83.5);
  });

  it('C03: charm training at the equipment cap survives changing clothes', () => {
    const s = createInitialState(6100303);
    s.locationId = 'park';
    s.time.hour = 18;
    s.player.stats.charm = 95;
    const baseline = structuredClone(s);
    expect(performAction(baseline, 'park_square_dance').ok).toBe(true);
    expect(baseline.player.stats.charm).toBe(96);
    addItem(s, 'suit');
    expect(equipItem(s, 'suit').ok).toBe(true);
    expect(s.player.stats.charm).toBe(100);
    const result = performAction(s, 'park_square_dance');
    expect(result.ok, result.reason).toBe(true);
    expect(result.result?.deltas.find(d => d.key === 'charm')?.value).toBe(1);
    expect(unequipItem(s, 'clothes').ok).toBe(true);
    expect(s.player.stats.charm).toBe(96);
  });

  it.each([['internet_night_job', 'internet_cafe'], ['market_help_stand', 'market_fair'], ['bus_station_gig', 'bus_station']])('C04: %s updates shared work progress when paid', (actionId, locationId) => {
    const s = createInitialState(6100304);
    s.locationId = locationId;
    s.time.hour = 10;
    s.player.attrs.stamina = 100;
    s.player.attrs.satiety = 100;
    s.player.attrs.hygiene = 100;
    s.dailyGoals = [{ id: 'work_once', text: '干一次活', reward: { mood: 2 }, done: false }];
    const before = s.player.money;
    const result = performAction(s, actionId);
    expect(result.ok, result.reason).toBe(true);
    expect(completeWork(s,s.work!.active!.id,1).ok).toBe(true);
    expect(s.player.money).toBeGreaterThan(before);
    tickDailyGoals(s, () => {});
    expect(s.flags.ever_worked).toBe(true);
    expect(s.weekly.jobsDone).toBe(1);
    expect(s.work?.wageRecords ?? []).toHaveLength(1);
    expect(s.dailyGoals).toBeUndefined();
    expect(s.career.experience[actionId === 'internet_night_job' ? 'operation' : 'service']).toBe(1);
  });

  it('C05: midnight wage clears the negative balance before bankruptcy is checked', () => {
    const s = createInitialState(6100305);
    s.locationId = 'electronics_factory';
    s.time.hour = 14;
    s.player.attrs.stamina = 100;
    s.player.attrs.satiety = 100;
    s.player.attrs.hygiene = 100;
    s.player.money = -1;
    s.player.negativeMoneyStreak = 6;
    const begin = performJob(s, 'job_factory_line');
    expect(begin.ok, begin.reason).toBe(true);
    const result = completeWork(s, begin.session!.id, 1);
    expect(result.ok, result.reason).toBe(true);
    expect(s.time.day).toBe(2);
    expect(s.time.hour).toBe(0);
    expect(s.player.money).toBe(162); // 完成 S 级挑战的工资与奖金在午夜检查前到账。
    expect(s.player.negativeMoneyStreak).toBe(0);
    expect(s.endingId).toBeNull();
  });

  it('old saves use recorded capped gear bonuses when deriving permanent stats', () => {
    const s = createInitialState(6100310);
    addItem(s, 'suit');
    s.equipped.clothes = 'suit';
    s.player.stats.charm = 100;
    s.flags.equip_bonus_applied_clothes_suit_charm = 1;
    delete s.player.baseStats;
    const migrated = migrateSave(s);
    expect(migrated.player.baseStats?.charm).toBe(99);
    applyEffects(migrated, { charm: 1 });
    expect(unequipItem(migrated, 'clothes').ok).toBe(true);
    expect(migrated.player.stats.charm).toBe(100);
    expect(migrateSave(migrated)).toEqual(migrated);
  });

  it('training and penalties survive save/load and repeated changes of equipment', () => {
    const s = createInitialState(6100311);
    s.player.stats.charm = 95;
    addItem(s, 'suit');
    addItem(s, 'shirt');
    equipItem(s, 'suit');
    applyEffects(s, { charm: 1 });
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(loaded.player.baseStats?.charm).toBe(96);
    applyEffects(loaded, { charm: -3 });
    for (let i = 0; i < 4; i++) {
      equipItem(loaded, 'shirt');
      expect(loaded.player.stats.charm).toBe(95);
      equipItem(loaded, 'suit');
      expect(loaded.player.stats.charm).toBe(98);
    }
    unequipItem(loaded, 'clothes');
    expect(loaded.player.stats.charm).toBe(93);
  });

  it('each paid market action earns work progress while same-day limited work stays single-use', () => {
    const s = createInitialState(6100312);
    s.locationId = 'market_fair';
    s.time.hour = 10;
    s.player.attrs.stamina = 100;
    expect(performAction(s, 'market_help_stand').ok).toBe(true);
    completeWork(s,s.work!.active!.id,1);
    expect(performAction(s, 'market_help_stand').ok).toBe(false);
    expect(s.weekly.jobsDone).toBe(1);
    expect(s.career.experience.service).toBe(1);
    expect(s.work?.wageRecords).toHaveLength(1);
    s.locationId = 'bus_station';
    expect(performAction(s, 'bus_station_gig').ok).toBe(true);
    completeWork(s,s.work!.active!.id,1);
    expect(performAction(s, 'bus_station_gig').ok).toBe(false);
    expect(s.weekly.jobsDone).toBe(2);
  });
});
