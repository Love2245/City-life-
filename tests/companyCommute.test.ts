import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { registerCompany } from '../src/game/core/company';
import { companyStage } from '../src/game/core/companyConfig';
import { companyCommuteQuote, commuteToCompany } from '../src/game/core/companyCommute';
import { exitLocation, moveTo, travelToRegion } from '../src/game/core/actions';
import { signLease, selectLodging } from '../src/game/core/housing';
import { residenceLocationId, residenceRegion } from '../src/game/core/residence';
import { gameDay } from '../src/game/core/calendar';
import type { GameState } from '../src/game/types';
import * as timeCore from '../src/game/core/time';

const clone = (state: GameState) => JSON.parse(JSON.stringify(state)) as GameState;
afterEach(() => vi.restoreAllMocks());
const minute = (state: GameState) => gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
// Existing social IDs include a module sequence and wall clock. Preserve and
// compare every reference and payload while assigning IDs in encounter order.
function comparable(state: GameState) {
  const ids = new Map<string, string>();
  return JSON.stringify(state).replace(/(?:post|forum)_[a-z0-9]+_\d+/g, id => {
    if (!ids.has(id)) ids.set(id, `social-${ids.size}`);
    return ids.get(id)!;
  });
}
function resident(home = 'old_apartment', stage: 1 | 2 = 2) {
  const state = createInitialState(49724);
  state.mode = 'eternal'; state.player.money = 100_000; state.time.hour = 10;
  state.locationId = 'municipal_hall'; state.developmentHistory!.total = 1; Object.assign(state.developmentHistory!.byType, { indie_game: 5 });
  expect(registerCompany(state, '通勤公司', stage).ok).toBe(true);
  if (['minsu', 'hotel', 'hotel_mooncourt'].includes(home)) expect(selectLodging(state, home)).toBe(true);
  else expect(signLease(state, home).ok).toBe(true);
  // The fixture starts at the actual booked room, independent of the journey used to acquire it.
  state.locationId = residenceLocationId(state);
  const region = residenceRegion(state);
  state.region = region; state.area = region; state.navStack = ['map', region];
  return state;
}
function ordinaryJourney(state: GameState) {
  const office = companyStage(state.company!.stage);
  expect(exitLocation(state).ok).toBe(true);
  for (let leg = 0; state.region !== office.region && leg < 2; leg++) expect(travelToRegion(state, office.region).ok).toBe(true);
  expect(moveTo(state, office.location).ok).toBe(true);
}

describe('从住处直接到公司的正常路线结算', () => {
  it.each([
    ['old_apartment', 2, 10, '', 2, 30],
    ['rental_apartment', 2, 10, '', 0, 0],
    ['old_apartment', 2, 2, '', 0, 60],
    ['old_apartment', 2, 10, 'item_car', 0, 10],
    ['old_apartment', 2, 10, 'item_e_bike', 0, 20],
    ['old_apartment', 2, 10, 'item_bicycle', 0, 20],
    ['old_apartment', 1, 10, '', 5, 60],
    ['suburb_room', 2, 10, 'item_car', 0, 70],
    ['suburb_room', 2, 10, 'item_e_bike', 0, 110],
    ['minsu', 2, 10, '', 2, 30],
    ['hotel', 2, 10, '', 0, 0],
  ])('%s / 公司阶段%i / %i点 / %s 与手动路线一致', (home, stage, hour, vehicle, fare, minutes) => {
    const state = resident(home as string, stage as 1 | 2); if ((hour as number) < state.time.hour) state.time.day++;
    state.time.hour = hour as number;
    if (vehicle) state.flags[vehicle as string] = true;
    const normal = clone(state), before = JSON.stringify(state), quote = companyCommuteQuote(state);
    expect(quote).toMatchObject({ ok: true, fare, hours: (minutes as number) / 60 });
    expect(JSON.stringify(state)).toBe(before);
    ordinaryJourney(normal);
    const start = minute(state), cash = state.player.money;
    expect(commuteToCompany(state).ok).toBe(true);
    expect(minute(state) - start).toBe(minutes);
    expect(cash - state.player.money).toBe(fare);
    expect(JSON.stringify(state)).toBe(JSON.stringify(normal));
  });
  it('同区不凭空收路费或时间，雨天沿用普通地铁减速', () => {
    const same = resident(); same.region = same.area = 'downtown_commercial';
    expect(companyCommuteQuote(same)).toMatchObject({ ok: true, hours: 0, fare: 0 });
    const rain = resident(); rain.weather = { id: 'rain', lastRollDay: gameDay(rain.time) };
    const normal = clone(rain); ordinaryJourney(normal);
    expect(companyCommuteQuote(rain)).toMatchObject({ ok: true, hours: .75, fare: 2 });
    expect(commuteToCompany(rain).ok).toBe(true); expect(JSON.stringify(rain)).toBe(JSON.stringify(normal));
  });
  it('本地现金不足时使用原有步行方案，开发区固定车费不足则保留住处且不扣款', () => {
    const local = resident(); local.player.money = 0;
    expect(companyCommuteQuote(local)).toMatchObject({ ok: true, hours: 1, fare: 0 });
    expect(commuteToCompany(local).ok).toBe(true);
    const intercity = resident('old_apartment', 1); intercity.player.money = 4;
    const before = JSON.stringify(intercity);
    expect(companyCommuteQuote(intercity)).toMatchObject({ ok: false, reason: expect.stringContaining('5 元车费') });
    expect(commuteToCompany(intercity).ok).toBe(false); expect(JSON.stringify(intercity)).toBe(before);
  });
  it('市区郊区无载具不跳过车站购票，失败保留全部状态', () => {
    const state = resident('suburb_room'), before = JSON.stringify(state);
    expect(companyCommuteQuote(state)).toMatchObject({ ok: false, reason: expect.stringContaining('购票') });
    expect(commuteToCompany(state).ok).toBe(false); expect(JSON.stringify(state)).toBe(before);
  });
  it.each(['ending', 'hospital', 'fishing', 'leisure', 'work', 'campus'])('%s 阻断不会修改住处、时间、现金或随机数', kind => {
    const state = resident('old_apartment', kind === 'campus' ? 1 : 2);
    if (kind === 'ending') state.endingId = 'survival_bad';
    if (kind === 'hospital') state.flags.hospitalized = true;
    if (kind === 'fishing') state.fishing = { active: true } as any;
    if (kind === 'leisure') state.districtLeisure = { active: true } as any;
    if (kind === 'work') state.work.active = { jobId: 'job_cafe', status: 'active' } as any;
    if (kind === 'campus') state.flags.item_student_pass = false;
    const before = JSON.stringify(state);
    expect(companyCommuteQuote(state).ok).toBe(false); expect(commuteToCompany(state).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('扩张后自动指向当前办公室，未注册或不在住处不能使用', () => {
    const state = resident(); state.company!.stage = 4;
    expect(companyCommuteQuote(state).destinationId).toBe('company_office_floor');
    expect(commuteToCompany(state).ok).toBe(true); expect(state.locationId).toBe('company_office_floor');
    expect(commuteToCompany(state).ok).toBe(false);
    state.company = null; expect(companyCommuteQuote(state).ok).toBe(false);
  });
  it('跨午夜沿用普通路线的日历、公司、天气及随机结算，报价不会提前发放收益', () => {
    const state = resident('old_apartment', 1); state.time.hour = 23; state.time.minute = 45;
    state.company!.royaltyCents = 90000; const normal = clone(state), before = JSON.stringify(state);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1792812345000), advance = vi.spyOn(timeCore, 'advanceHours');
    expect(companyCommuteQuote(state).ok).toBe(true); expect(JSON.stringify(state)).toBe(before);
    expect(advance).not.toHaveBeenCalled(); expect(clock).not.toHaveBeenCalled();
    ordinaryJourney(normal); expect(commuteToCompany(state).ok).toBe(true);
    expect(comparable(state)).toBe(comparable(normal));
  });
});
