import type { GameState } from '../types';
import { currentArea, exitLocation, getLocation, locationAvailabilityAtArrival, locationLockReason, moveTo, regionAvailabilityAtArrival, regionTravelPlan, travelToRegion } from './actions';
import { companyStage } from './companyConfig';
import { fromLinearDay, gameDay, linearDay } from './calendar';
import { isResidenceLocation } from './residence';
import { hoursLabel, isDevelopmentRoute } from './transit';
import { enterRegion, topRegionOf } from './regions';

export interface CompanyCommuteQuote {
  ok: boolean;
  reason?: string;
  destinationId: string;
  destinationName: string;
  hours: number;
  fare: number;
  transport: string;
  detail: string;
}

const minuteOf = (state: GameState) => gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;

/** The shortcut follows the same atlas itinerary: leave, enter the office district, then its facility. */
function runRoute(state: GameState): CompanyCommuteQuote & { interrupted?: boolean } {
  const office = state.company && state.company.status!=='closed' && companyStage(state.company.stage);
  const quote: CompanyCommuteQuote = {
    ok: false, destinationId: office ? office.location : '', destinationName: office ? office.name : '',
    hours: 0, fare: 0, transport: '', detail: '',
  };
  if (!office) return { ...quote, reason: state.company?.status==='closed'?'公司已停业，请到市政企业窗口恢复营业':'请先到市政大厅注册公司' };
  if (state.endingId) return { ...quote, reason: '本局生活已结束，无法出发' };
  if (!isResidenceLocation(state)) return { ...quote, reason: '请在当前住处的出门菜单中使用' };
  const available = moveTo({ ...state, navStack: [...state.navStack] }, 'map');
  if (!available.ok) return { ...quote, reason: available.reason };
  const started = minuteOf(state);
  const modes: string[] = [];
  const finish = (ok: boolean, reason?: string, interrupted = false) => {
    const transport = modes.length ? modes.join(' → ') : '同区步行';
    const hours = Math.max(0, minuteOf(state) - started) / 60;
    return { ...quote, ok, reason, hours, transport, interrupted,
      detail: `${transport} · ${hoursLabel(hours)} · ${quote.fare > 0 ? `${quote.fare} 元路费` : '免费'}` };
  };
  const left = exitLocation(state);
  if (!left.ok) return finish(false, left.reason);
  // Cross-city private transport first reaches the city edge. A second ordinary
  // district journey is required; public intercity transport still needs a station ticket.
  for (let leg = 0; state.region !== office.region && leg < 2; leg++) {
    const plan = regionTravelPlan(state, office.region);
    const result = travelToRegion(state, office.region);
    if (!result.ok) return finish(false, result.reason, !!state.endingId || !!state.flags.hospitalized);
    if (plan.mode !== 'same') { modes.push(plan.name); quote.fare += plan.fare; }
    if (state.endingId || state.flags.hospitalized || state.locationId !== 'map') {
      return finish(false, '行程被当前生活状态中断，请查看行动日志', true);
    }
  }
  if (state.region !== office.region) return finish(false, '请先完成跨城交通，再前往公司');
  const entered = moveTo(state, office.location);
  if (!entered.ok) return finish(false, entered.reason, !!state.endingId || !!state.flags.hospitalized);
  if (state.endingId || state.flags.hospitalized || state.locationId !== office.location) {
    return finish(false, '行程被当前生活状态中断，请查看行动日志', true);
  }
  return finish(true);
}

/** Actual travel settles once on a detached state, then commits. */
function simulate(state: GameState) {
  const draft = JSON.parse(JSON.stringify(state)) as GameState;
  return { draft, result: runRoute(draft) };
}

export function companyCommuteQuote(state: GameState): CompanyCommuteQuote {
  const office = state.company && state.company.status!=='closed' && companyStage(state.company.stage);
  const quote: CompanyCommuteQuote = { ok: false, destinationId: office ? office.location : '',
    destinationName: office ? office.name : '', hours: 0, fare: 0, transport: '', detail: '' };
  if (!office) return { ...quote, reason: state.company?.status==='closed'?'公司已停业，请到市政企业窗口恢复营业':'请先到市政大厅注册公司' };
  if (state.endingId) return { ...quote, reason: '本局生活已结束，无法出发' };
  if (!isResidenceLocation(state)) return { ...quote, reason: '请在当前住处的出门菜单中使用' };
  // Do not run advanceHours for a quote: some existing social ID generators use
  // module counters. Pure clock projection leaves both state and those counters intact.
  const projected = { ...state, time: { ...state.time }, player: { ...state.player }, navStack: [...state.navStack] };
  const available = moveTo({ ...projected, navStack: [...projected.navStack] }, 'map');
  if (!available.ok) return { ...quote, reason: available.reason };
  const left = exitLocation(projected);
  if (!left.ok) return { ...quote, reason: left.reason };
  const modes: string[] = [];
  const finish = (ok: boolean, reason?: string) => {
    const transport = modes.length ? modes.join(' → ') : '同区步行';
    return { ...quote, ok, reason, transport,
      detail: `${transport} · ${hoursLabel(quote.hours)} · ${quote.fare > 0 ? `${quote.fare} 元路费` : '免费'}` };
  };
  for (let leg = 0; projected.region !== office.region && leg < 2; leg++) {
    const plan = regionTravelPlan(projected, office.region);
    const fromTop = projected.region ? topRegionOf(projected.region) : projected.area ? topRegionOf(projected.area) : undefined;
    const toTop = topRegionOf(office.region);
    const arrival = regionAvailabilityAtArrival(projected, office.region);
    quote.hours += plan.hours; quote.fare += plan.fare;
    if (plan.mode !== 'same') modes.push(plan.name);
    if (!arrival.unlocked) return finish(false, arrival.reason);
    if (plan.requiresTicket) return finish(false, '跨城不能直接前往：请前往巴士站/火车站购票乘车，或使用汽车、电动车、三轮车');
    if (projected.player.money < plan.fare) return finish(false, `身上不够 ${plan.fare} 元车费，先攒点钱再出发吧`);
    projected.player.money -= plan.fare;
    const minutes = projected.time.hour * 60 + projected.time.minute + Math.round(plan.hours * 60);
    projected.time = { ...projected.time, ...fromLinearDay(linearDay(projected.time) + Math.floor(minutes / 1440)), hour: Math.floor(minutes % 1440 / 60), minute: minutes % 60 };
    const cityEdge = fromTop && toTop && fromTop !== toTop && !isDevelopmentRoute(fromTop, toTop)
      ? toTop === 'downtown' ? 'downtown_station' : toTop === 'suburb' ? 'suburban_edge' : undefined : undefined;
    const entered = enterRegion(projected, cityEdge ?? office.region);
    if (!entered.ok) return finish(false, entered.reason);
    projected.area = currentArea(projected);
  }
  const destination = getLocation(office.location), availability = locationAvailabilityAtArrival(projected, destination);
  if (!availability.unlocked) return finish(false, locationLockReason(projected, destination));
  if (!availability.open && !availability.early) return finish(false, availability.closedText);
  return finish(projected.region === office.region, projected.region === office.region ? undefined : '请先完成跨城交通，再前往公司');
}

/** Validation failures do not move the resident, charge a fare, advance time or consume RNG. */
export function commuteToCompany(state: GameState): CompanyCommuteQuote {
  const { draft, result } = simulate(state);
  if (result.ok || result.interrupted) Object.assign(state, draft);
  return result;
}
