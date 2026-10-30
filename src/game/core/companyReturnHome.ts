import type { GameState } from '../types';
import { currentArea, exitLocation, getLocation, locationAvailabilityAtArrival, locationLockReason, moveTo, regionAvailabilityAtArrival, regionTravelPlan, travelToRegion } from './actions';
import { fromLinearDay, gameDay, linearDay } from './calendar';
import { companyOfficeHere } from './companyOverview';
import { currentResidence, residenceLocationId, residenceRegion } from './residence';
import { enterRegion, topRegionOf } from './regions';
import { hoursLabel, isDevelopmentRoute } from './transit';
import type { CompanyCommuteQuote } from './companyCommute';

export type CompanyReturnHomeQuote = CompanyCommuteQuote;
const minuteOf = (s: GameState) => gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
function destination(s: GameState) {
  const home = currentResidence(s);
  const valid = home.id !== 'atm' && !(home.id === 'gov' && s.living.govDaysLeft <= 0);
  return { id: residenceLocationId(s), region: residenceRegion(s), name: home.name,
    valid, reason: valid ? undefined : '当前没有有效住所，请先登记住宿或选择住处' };
}
function initial(s: GameState): CompanyReturnHomeQuote {
  const home = destination(s);
  return { ok: false, destinationId: home.id, destinationName: home.name, hours: 0, fare: 0, transport: '', detail: '' };
}
function available(s: GameState): string | undefined {
  if (!companyOfficeHere(s)) return '请在当前公司门口使用回家路线';
  if (s.endingId) return '本局生活已结束，无法出发';
  const check = moveTo({ ...s, navStack: [...s.navStack] }, 'map');
  if (!check.ok) return check.reason;
  return destination(s).reason;
}
function detail(q: CompanyReturnHomeQuote, modes: string[]) {
  q.transport = modes.length ? modes.join(' → ') : '同区步行';
  q.detail = `${q.transport} · ${hoursLabel(q.hours)} · ${q.fare > 0 ? `${q.fare} 元路费` : '免费'}`;
  return q;
}

/** Resolve the currently booked home for each leg, without advancing calendars or random generators. */
export function companyReturnHomeQuote(s: GameState): CompanyReturnHomeQuote {
  const quote = initial(s), reason = available(s);
  if (reason) return { ...quote, reason };
  const projected = { ...s, time: { ...s.time }, player: { ...s.player }, navStack: [...s.navStack] };
  const left = exitLocation(projected); if (!left.ok) return { ...quote, reason: left.reason };
  const modes: string[] = [];
  const finish = (ok: boolean, reason?: string) => detail({ ...quote, ok, reason }, modes);
  for (let leg = 0; leg < 4; leg++) {
    const home = destination(projected); quote.destinationId = home.id; quote.destinationName = home.name;
    if (!home.valid) return finish(false, home.reason);
    if (projected.region === home.region) {
      const location = getLocation(home.id), arrival = locationAvailabilityAtArrival(projected, location);
      if (!arrival.unlocked) return finish(false, locationLockReason(projected, location));
      if (!arrival.open && !arrival.early) return finish(false, arrival.closedText);
      return finish(true);
    }
    const plan = regionTravelPlan(projected, home.region), arrival = regionAvailabilityAtArrival(projected, home.region);
    quote.hours += plan.hours; quote.fare += plan.fare;
    if (plan.mode !== 'same') modes.push(plan.name);
    if (!arrival.unlocked) return finish(false, arrival.reason);
    if (plan.requiresTicket) return finish(false, '跨城不能直接回家：请前往巴士站/火车站购票乘车，或使用汽车、电动车、三轮车');
    if (projected.player.money < plan.fare) return finish(false, `身上不够 ${plan.fare} 元车费，先攒点钱再出发吧`);
    projected.player.money -= plan.fare;
    const minutes = projected.time.hour * 60 + projected.time.minute + Math.round(plan.hours * 60);
    projected.time = { ...projected.time, ...fromLinearDay(linearDay(projected.time) + Math.floor(minutes / 1440)), hour: Math.floor(minutes % 1440 / 60), minute: minutes % 60 };
    const fromTop = projected.region ? topRegionOf(projected.region) : projected.area ? topRegionOf(projected.area) : undefined;
    const toTop = topRegionOf(home.region);
    const edge = fromTop && toTop && fromTop !== toTop && !isDevelopmentRoute(fromTop, toTop)
      ? toTop === 'downtown' ? 'downtown_station' : toTop === 'suburb' ? 'suburban_edge' : undefined : undefined;
    const entered = enterRegion(projected, edge ?? home.region);
    if (!entered.ok) return finish(false, entered.reason);
    projected.area = currentArea(projected);
  }
  return finish(false, '当前住所路线发生变化，请先回到地图选择住处');
}

/** Ordinary travel settles once; validation failures keep the original company location and balances. */
export function returnHomeFromCompany(s: GameState): CompanyReturnHomeQuote {
  const quote = companyReturnHomeQuote(s);
  if (!quote.ok) return quote;
  const draft = JSON.parse(JSON.stringify(s)) as GameState, started = minuteOf(s), modes: string[] = [];
  let fare = 0;
  const finish = (ok: boolean, reason?: string, interrupted = false): CompanyReturnHomeQuote => {
    const home = destination(draft);
    const result = detail({ ...quote, ok, reason, destinationId: home.id, destinationName: home.name,
      hours: Math.max(0, minuteOf(draft) - started) / 60, fare }, modes);
    if (ok || interrupted) Object.assign(s, draft);
    return result;
  };
  const left = exitLocation(draft); if (!left.ok) return finish(false, left.reason);
  for (let leg = 0; leg < 4; leg++) {
    const home = destination(draft);
    if (!home.valid) return finish(false, home.reason, minuteOf(draft) > started);
    if (draft.region === home.region) {
      const entered = moveTo(draft, home.id);
      if (!entered.ok) return finish(false, entered.reason, !!draft.endingId || !!draft.flags.hospitalized);
      if (draft.endingId || draft.flags.hospitalized || draft.locationId !== residenceLocationId(draft)) return finish(false, '行程被当前生活状态中断，请查看行动日志', true);
      return finish(true);
    }
    const plan = regionTravelPlan(draft, home.region), traveled = travelToRegion(draft, home.region);
    if (!traveled.ok) return finish(false, traveled.reason, !!draft.endingId || !!draft.flags.hospitalized);
    if (plan.mode !== 'same') { fare += plan.fare; modes.push(plan.name); }
    if (draft.endingId || draft.flags.hospitalized || draft.locationId !== 'map') return finish(false, '行程被当前生活状态中断，请查看行动日志', true);
  }
  return finish(false, '当前住所路线发生变化，请回到地图查看行程', minuteOf(draft) > started);
}
