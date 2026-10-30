/**
 * 城市通行系统。
 *
 * 本地移动仍由地铁/郊区巴士和私人载具负责；跨一级地图的公共交通
 * 市区与郊区之间必须先购买绑定班次的车票；开发区可从地图乘长途地铁，
 * 或在两侧巴士站搭乘每小时整点发车的直达班次。
 */
import type { GameState, IntercityTicket, TimeState } from "../types";
import { gameDay } from "./calendar";
import { recordMoney } from "./weekly";

/** 市区地铁单程票价与跨二级区耗时 */
export const SUBWAY_FARE = 2;
export const SUBWAY_HOURS = 0.5;
/** 郊区内部巴士单程票价与跨二级区耗时 */
export const SUBURB_BUS_FARE = 5;
export const SUBURB_BUS_HOURS = 0.5;
/** 无公共交通时的步行跨区耗时（单程；v1.43 由 2h 降到 1h，避免与班次叠加超限） */
export const WALK_CROSS_HOURS = 1;
/** 同一城市跨二级区域的私人载具耗时 */
export const CAR_HOURS = 10 / 60;
export const BIKE_HOURS = 20 / 60;
/** 本地公共交通首班时刻（05:00 开始运营） */
export const SUBWAY_FIRST_HOUR = 5;

/** 跨一级区公共交通票价与耗时 */
export const INTERCITY_BUS_FARE = 16;
export const INTERCITY_BUS_HOURS = 1.25;
export const INTERCITY_TRAIN_FARE = 12;
export const INTERCITY_TRAIN_HOURS = 1;
/** 跨一级区私人载具耗时 */
export const INTERCITY_BIKE_HOURS = 1.5;
export const INTERCITY_CAR_HOURS = 1;

/** 开发区跨一级区域直达交通，不需要绑定车票。 */
export const DEVELOPMENT_SUBWAY_FARE = 5;
export const DEVELOPMENT_SUBWAY_HOURS = 1;
export const DEVELOPMENT_BIKE_HOURS = 45 / 60;
export const DEVELOPMENT_CAR_HOURS = 30 / 60;
export const DEVELOPMENT_BUS_FARE = 8;
export const DEVELOPMENT_BUS_HOURS = 45 / 60;

export type TransitMode =
  | "same"
  | "car"
  | "bike"
  | "subway"
  | "development_subway"
  | "suburb_bus"
  | "walk"
  | "bus"
  | "train";

export interface TransitPlan {
  mode: TransitMode;
  hours: number;
  fare: number;
  icon: string;
  name: string;
  /** 跨城公共交通必须在车站购买/检票 */
  requiresTicket?: boolean;
  /** 车站面板应打开的方式 */
  ticketMode?: "bus" | "train";
}

export interface Departure {
  day: number;
  minute: number;
}

export type IntercityMode = "bus" | "train";

export interface TicketOperation {
  ok: boolean;
  reason?: string;
  ticket?: IntercityTicket;
}

export type TicketStatus = "pending" | "due" | "missed";

/** 同类公共交通形成全网直达；城市边缘站只可从同运营类型车站乘车。 */
export interface NetworkTransitPlan {
  ok: boolean;
  reason?: string;
  mode: IntercityMode;
  fromStationId: string;
  destinationStationId: string;
  destinationRegion: string;
  fare: number;
  waitMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  departure: Departure;
  arrival: Departure;
  routeLabel: string;
  allDayHourly: boolean;
  privateCarMinutes: number;
  privateBikeMinutes: number;
}

const VEHICLE_PRIORITY = ["car", "tricycle", "e_bike", "bicycle"] as const;
export type VehicleType = (typeof VEHICLE_PRIORITY)[number];

const VEHICLE_ICON: Record<VehicleType, string> = { car: "🚗", tricycle: "🛺", e_bike: "🛵", bicycle: "🚲" };
const VEHICLE_LABEL: Record<VehicleType, string> = { car: "开车", tricycle: "骑三轮车", e_bike: "骑电动车", bicycle: "骑自行车" };
const STATION_MODE: Record<string, IntercityMode> = {
  bus_station: "bus",
  suburb_bus_station: "bus",
  development_bus_station: "bus",
  high_speed_rail: "train",
  suburb_train_station: "train",
};
const STATION_PAIR: Record<string, string> = {
  bus_station: "suburb_bus_station",
  suburb_bus_station: "bus_station",
  high_speed_rail: "suburb_train_station",
  suburb_train_station: "high_speed_rail",
};
const NETWORK_STATIONS: Record<IntercityMode, readonly string[]> = {
  bus: ["bus_station", "suburb_bus_station", "development_bus_station"],
  train: ["high_speed_rail", "suburb_train_station"],
};
interface NetworkRoute {
  fare: number;
  hours: number;
  allDayHourly?: boolean;
  privateCarHours: number;
  privateBikeHours: number;
}
const NETWORK_ROUTE: Record<string, NetworkRoute> = {
  "bus_station|development_bus_station": {
    fare: DEVELOPMENT_BUS_FARE, hours: DEVELOPMENT_BUS_HOURS, allDayHourly: true,
    privateCarHours: DEVELOPMENT_CAR_HOURS, privateBikeHours: DEVELOPMENT_BIKE_HOURS,
  },
  "bus_station|suburb_bus_station": {
    fare: INTERCITY_BUS_FARE, hours: INTERCITY_BUS_HOURS,
    privateCarHours: INTERCITY_CAR_HOURS, privateBikeHours: INTERCITY_BIKE_HOURS,
  },
  "development_bus_station|suburb_bus_station": {
    fare: 10, hours: DEVELOPMENT_BUS_HOURS,
    privateCarHours: DEVELOPMENT_CAR_HOURS, privateBikeHours: DEVELOPMENT_BIKE_HOURS,
  },
  "high_speed_rail|suburb_train_station": {
    fare: INTERCITY_TRAIN_FARE, hours: INTERCITY_TRAIN_HOURS,
    privateCarHours: INTERCITY_CAR_HOURS, privateBikeHours: INTERCITY_BIKE_HOURS,
  },
};

function networkRouteKey(a: string, b: string): string { return [a, b].sort().join("|"); }

export function networkStationsOf(mode: IntercityMode): string[] { return [...NETWORK_STATIONS[mode]]; }

export function networkDestinationsFrom(stationId: string): string[] {
  const mode = stationModeOf(stationId);
  return mode ? NETWORK_STATIONS[mode].filter(id => id !== stationId) : [];
}

/** 车站到车站的直达班次与完整成本预览；不扣费、不推进时间。 */
export function networkTransitPlan(state: GameState, destinationStationId: string): NetworkTransitPlan {
  const fromStationId = state.locationId;
  const mode = stationModeOf(fromStationId);
  const destinationMode = stationModeOf(destinationStationId);
  const empty: NetworkTransitPlan = {
    ok: false, reason: "请选择有效的目标车站", mode: mode ?? "bus", fromStationId,
    destinationStationId, destinationRegion: "", fare: 0, waitMinutes: 0,
    travelMinutes: 0, totalMinutes: 0, departure: { day: 0, minute: 0 },
    arrival: { day: 0, minute: 0 }, routeLabel: "", allDayHourly: false,
    privateCarMinutes: 0, privateBikeMinutes: 0,
  };
  if (!mode || destinationMode !== mode || destinationStationId === fromStationId) return empty;
  const from = NETWORK_ROUTE[networkRouteKey(fromStationId, destinationStationId)];
  const destinationRegion = STATION_REGION[destinationStationId];
  if (!from || !destinationRegion) return { ...empty, reason: "这两站之间暂无直达班次" };
  const departures = mode === "bus" && from.allDayHourly
    ? Array.from({ length: 24 }, (_, i) => i * 60)
    : departureMinutesOf(mode);
  const now = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
  const today = gameDay(state.time);
  const nowMinute = state.time.hour * 60 + state.time.minute;
  const sameDay = departures.find(minute => minute >= nowMinute);
  const departure = sameDay === undefined
    ? { day: today + 1, minute: departures[0] }
    : { day: today, minute: sameDay };
  const departureAbsolute = departure.day * 1440 + departure.minute;
  const waitMinutes = Math.max(0, departureAbsolute - now);
  const travelMinutes = from.hours * 60;
  const arrivalAbsolute = departureAbsolute + travelMinutes;
  const arrival = { day: Math.floor(arrivalAbsolute / 1440), minute: arrivalAbsolute % 1440 };
  const plan: NetworkTransitPlan = {
    ok: true, mode, fromStationId, destinationStationId, destinationRegion,
    fare: from.fare, waitMinutes, travelMinutes, totalMinutes: waitMinutes + travelMinutes,
    departure, arrival,
    routeLabel: `${getStationLabel(fromStationId)} → ${getStationLabel(destinationStationId)}`,
    allDayHourly: !!from.allDayHourly,
    privateCarMinutes: from.privateCarHours * 60,
    privateBikeMinutes: from.privateBikeHours * 60,
  };
  if (state.endingId) return { ...plan, ok: false, reason: "本局生活已结束，无法乘车" };
  if (state.flags.hospitalized) return { ...plan, ok: false, reason: "住院期间不能乘车" };
  if (state.work?.active) return { ...plan, ok: false, reason: "请先完成或继续当前工作班次" };
  if (state.intercityTicket && ticketStatus(state) !== "missed") return { ...plan, ok: false, reason: "请先处理已购买的旧车票" };
  if (state.player.money < plan.fare) return { ...plan, ok: false, reason: `金钱不足（需要 ${plan.fare} 元）` };
  return plan;
}

const STATION_REGION: Record<string, string> = {
  bus_station: "downtown_station", suburb_bus_station: "suburban_edge",
  development_bus_station: "development_culture", high_speed_rail: "downtown_station",
  suburb_train_station: "suburban_edge",
};

function getStationLabel(id: string): string {
  const labels: Record<string, string> = {
    bus_station: "树堰区巴士站", suburb_bus_station: "紫羊区巴士站",
    development_bus_station: "伯月新区巴士站", high_speed_rail: "树堰区火车站",
    suburb_train_station: "紫羊区火车站",
  };
  return labels[id] ?? id;
}

export function currentVehicle(state: GameState): VehicleType | undefined {
  for (const v of VEHICLE_PRIORITY) {
    if (state.flags[`item_${v}`]) return v;
  }
  return undefined;
}

export function isSubwayRunning(state: GameState): boolean {
  return state.time.hour >= SUBWAY_FIRST_HOUR;
}

export type TransitTier = "same" | "local" | "intercity";

/** 伯月新区与泊月区相邻，交通按现有城区内跨子区规则结算。 */
export function isAdjacentDistrictRoute(fromTopRegion?: string, toTopRegion?: string): boolean {
  return (fromTopRegion === "development" && toTopRegion === "boyue")
    || (fromTopRegion === "boyue" && toTopRegion === "development");
}

export function isDevelopmentRoute(fromTopRegion?: string, toTopRegion?: string): boolean {
  if (fromTopRegion === toTopRegion) return false;
  if (fromTopRegion === "development" || toTopRegion === "development") return true;
  return [fromTopRegion, toTopRegion].some((id) => id === "boyue")
    && fromTopRegion !== "suburb" && toTopRegion !== "suburb";
}

/** 开发区往返优先私人载具，自行车仍使用长途地铁。 */
export function planDevelopmentTransit(state: GameState): TransitPlan {
  const vehicle = currentVehicle(state);
  if (vehicle === "car") return { mode: "car", hours: DEVELOPMENT_CAR_HOURS, fare: 0, icon: VEHICLE_ICON.car, name: VEHICLE_LABEL.car };
  if (vehicle === "tricycle" || vehicle === "e_bike") {
    return { mode: "bike", hours: DEVELOPMENT_BIKE_HOURS, fare: 0, icon: VEHICLE_ICON[vehicle], name: VEHICLE_LABEL[vehicle] };
  }
  return { mode: "development_subway", hours: DEVELOPMENT_SUBWAY_HOURS, fare: DEVELOPMENT_SUBWAY_FARE, icon: "🚇", name: "长途地铁" };
}

function localPublicPlan(state: GameState, targetTopRegion?: string): TransitPlan {
  const suburb = targetTopRegion === "suburb";
  const mode: TransitMode = suburb ? "suburb_bus" : "subway";
  const fare = suburb ? SUBURB_BUS_FARE : SUBWAY_FARE;
  const name = suburb ? "紫羊区巴士" : "地铁";
  const icon = suburb ? "🚌" : "🚇";
  const hours = suburb ? SUBURB_BUS_HOURS : SUBWAY_HOURS;
  if (isSubwayRunning(state) && state.player.money >= fare) {
    return { mode, hours, fare, icon, name };
  }
  return { mode: "walk", hours: WALK_CROSS_HOURS, fare: 0, icon: "🚶", name: "步行" };
}

/** 计算本地/跨城通行方案；跨城公共交通只返回“需车站购票”的候选方案。 */
export function planTransit(state: GameState, tier: TransitTier, targetTopRegion?: string, sourceTopRegion?: string): TransitPlan {
  if (tier === "same") {
    return { mode: "same", hours: 0, fare: 0, icon: "🚶", name: "步行" };
  }
  if (tier === "intercity" && isAdjacentDistrictRoute(sourceTopRegion, targetTopRegion)) tier = "local";
  else if (tier === "intercity" && isDevelopmentRoute(sourceTopRegion, targetTopRegion)) return planDevelopmentTransit(state);
  const v = currentVehicle(state);
  if (v === "car") {
    return {
      mode: "car",
      hours: tier === "intercity" ? INTERCITY_CAR_HOURS : CAR_HOURS,
      fare: 0,
      icon: VEHICLE_ICON.car,
      name: VEHICLE_LABEL.car,
    };
  }
  if (v === "tricycle" || v === "e_bike") {
    return {
      mode: "bike",
      hours: tier === "intercity" ? INTERCITY_BIKE_HOURS : BIKE_HOURS,
      fare: 0,
      icon: VEHICLE_ICON[v],
      name: VEHICLE_LABEL[v],
    };
  }
  if (tier === "intercity") {
    return {
      mode: "bus",
      hours: INTERCITY_BUS_HOURS,
      fare: INTERCITY_BUS_FARE,
      icon: "🚌",
      name: "城际巴士",
      requiresTicket: true,
      ticketMode: "bus",
    };
  }
  if (v === "bicycle") {
    return { mode: "bike", hours: BIKE_HOURS, fare: 0, icon: VEHICLE_ICON.bicycle, name: VEHICLE_LABEL.bicycle };
  }
  return localPublicPlan(state, targetTopRegion);
}

export interface DevelopmentBusPlan {
  ok: boolean;
  reason?: string;
  name: string;
  routeLabel: string;
  fromStationId: string;
  destinationStationId: string;
  destinationRegion: string;
  cost: number;
  fare: number;
  waitMinutes: number;
  waitHours: number;
  travelHours: number;
  totalHours: number;
  departure: Departure;
  arrival: Departure;
  arrivalHour: number;
  arrivalMinute: number;
}

/** 全天每小时整点发车；整点抵达车站可搭当班。只预览，不改写状态。 */
export function developmentBusPlan(state: GameState): DevelopmentBusPlan {
  const fromStationId = state.locationId;
  const outbound = fromStationId === "bus_station";
  const inbound = fromStationId === "development_bus_station";
  const now = absoluteMinute(state.time);
  const departureMinute = Math.ceil(now / 60) * 60;
  const arrivalMinute = departureMinute + DEVELOPMENT_BUS_HOURS * 60;
  const waitMinutes = departureMinute - now;
  const plan: DevelopmentBusPlan = {
    ok: outbound || inbound,
    name: "伯月新区直达巴士",
    routeLabel: outbound ? "树堰区 → 伯月新区" : "伯月新区 → 树堰区",
    fromStationId,
    destinationStationId: outbound ? "development_bus_station" : inbound ? "bus_station" : "",
    destinationRegion: outbound ? "development_culture" : inbound ? "downtown_station" : "",
    cost: DEVELOPMENT_BUS_FARE,
    fare: DEVELOPMENT_BUS_FARE,
    waitMinutes,
    waitHours: waitMinutes / 60,
    travelHours: DEVELOPMENT_BUS_HOURS,
    totalHours: waitMinutes / 60 + DEVELOPMENT_BUS_HOURS,
    departure: { day: Math.floor(departureMinute / 1440), minute: departureMinute % 1440 },
    arrival: { day: Math.floor(arrivalMinute / 1440), minute: arrivalMinute % 1440 },
    arrivalHour: Math.floor((arrivalMinute % 1440) / 60),
    arrivalMinute: arrivalMinute % 60,
  };
  if (!plan.ok) plan.reason = "请先前往树堰区或伯月新区的巴士站";
  else if (state.endingId) { plan.ok = false; plan.reason = "本局生活已结束，无法继续乘车"; }
  else if (state.flags.hospitalized) { plan.ok = false; plan.reason = "正在住院，请先在医院办理出院"; }
  else if (state.work?.active) { plan.ok = false; plan.reason = "请先完成或继续当前工作班次"; }
  else if (state.player.money < plan.fare) { plan.ok = false; plan.reason = `金钱不足（需要 ${plan.fare} 元）`; }
  return plan;
}

export function stationModeOf(stationId: string): IntercityMode | undefined {
  return STATION_MODE[stationId];
}

export function counterpartStationOf(stationId: string): string | undefined {
  return STATION_PAIR[stationId];
}

export function fareOfIntercity(mode: IntercityMode): number {
  return mode === "bus" ? INTERCITY_BUS_FARE : INTERCITY_TRAIN_FARE;
}

export function durationOfIntercity(mode: IntercityMode): number {
  return mode === "bus" ? INTERCITY_BUS_HOURS : INTERCITY_TRAIN_HOURS;
}

export function departureMinutesOf(mode: IntercityMode): number[] {
  return mode === "bus"
    ? Array.from({ length: 13 }, (_, i) => (6 + i) * 60)
    : Array.from({ length: 8 }, (_, i) => i * 3 * 60);
}

export function formatDeparture(departure: Departure): string {
  const h = Math.floor(departure.minute / 60);
  const m = departure.minute % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function absoluteMinute(time: TimeState): number {
  return gameDay(time) * 1440 + time.hour * 60 + time.minute;
}

/** 计算当前时刻之后（含当前分钟）的下一班车。 */
export function nextDeparture(time: TimeState, mode: IntercityMode): Departure {
  const today = gameDay(time);
  const now = time.hour * 60 + time.minute;
  const minutes = departureMinutesOf(mode);
  const todayMinute = minutes.find((minute) => minute >= now);
  return todayMinute === undefined
    ? { day: today + 1, minute: minutes[0] }
    : { day: today, minute: todayMinute };
}

/** 当前时刻之后（严格晚于当前分钟）的下一班车。
 * 买票即乘车流程使用它，避免整点购票时把刚刚发车的班次当成可乘班次；
 * 旧版人工检票继续使用 nextDeparture 的“含当前分钟”语义。 */
export function nextDepartureAfter(time: TimeState, mode: IntercityMode): Departure {
  const today = gameDay(time);
  const now = time.hour * 60 + time.minute;
  const minutes = departureMinutesOf(mode);
  const todayMinute = minutes.find((minute) => minute > now);
  return todayMinute === undefined
    ? { day: today + 1, minute: minutes[0] }
    : { day: today, minute: todayMinute };
}

export function ticketStatus(state: GameState, ticket = state.intercityTicket): TicketStatus | undefined {
  if (!ticket) return undefined;
  const now = absoluteMinute(state.time);
  const departure = ticket.departureDay * 1440 + ticket.departureMinute;
  if (now < departure) return "pending";
  if (now === departure) return "due";
  return "missed";
}

/** 清掉已错过的车票；费用不退。 */
export function expireMissedTicket(state: GameState): boolean {
  if (ticketStatus(state) !== "missed") return false;
  state.intercityTicket = undefined;
  return true;
}

export function buyIntercityTicket(
  state: GameState,
  mode: IntercityMode,
  originStationId: string,
  options?: { afterCurrent?: boolean },
): TicketOperation {
  if (stationModeOf(originStationId) !== mode) return { ok: false, reason: "这个车站不办理该交通方式" };
  if (state.locationId !== originStationId) return { ok: false, reason: "必须在对应车站购票" };
  if (!counterpartStationOf(originStationId)) return { ok: false, reason: "目标车站不存在，未扣款" };
  expireMissedTicket(state);
  if (state.intercityTicket) return { ok: false, reason: "你已经有一张未使用的绑定车票" };
  const fare = fareOfIntercity(mode);
  if (state.player.money < fare) return { ok: false, reason: `金钱不足（需要 ${fare} 元）` };
  const departure = options?.afterCurrent ? nextDepartureAfter(state.time, mode) : nextDeparture(state.time, mode);
  const ticket: IntercityTicket = {
    mode,
    originStationId,
    destinationStationId: counterpartStationOf(originStationId) ?? "",
    departureDay: departure.day,
    departureMinute: departure.minute,
    fare,
    durationHours: durationOfIntercity(mode),
  };
  state.player.money -= fare;
  recordMoney(state, -fare);
  state.intercityTicket = ticket;
  return { ok: true, ticket };
}

/** 检票只在绑定车站、绑定发车时刻执行；成功后消费车票。 */
export function boardIntercityTicket(state: GameState, stationId: string): TicketOperation {
  const ticket = state.intercityTicket;
  if (!ticket) return { ok: false, reason: "现在没有有效车票" };
  const status = ticketStatus(state, ticket);
  if (status === "missed") {
    state.intercityTicket = undefined;
    return { ok: false, reason: "这张车票已错过发车时间，费用不退，请重新购票" };
  }
  if (ticket.originStationId !== stationId) return { ok: false, reason: "只能在购票车站检票上车" };
  if (status === "pending") return { ok: false, reason: `请等到 ${formatDeparture({ day: ticket.departureDay, minute: ticket.departureMinute })} 发车` };
  state.intercityTicket = undefined;
  return { ok: true, ticket };
}

export function privateIntercityPlan(state: GameState): TransitPlan | undefined {
  const v = currentVehicle(state);
  if (v === "car") return { mode: "car", hours: INTERCITY_CAR_HOURS, fare: 0, icon: "🚗", name: "开车" };
  if (v === "tricycle" || v === "e_bike") return { mode: "bike", hours: INTERCITY_BIKE_HOURS, fare: 0, icon: VEHICLE_ICON[v], name: VEHICLE_LABEL[v] };
  return undefined;
}

export function walkReason(state: GameState, targetTopRegion?: string): string {
  const walk = `只能步行（约 ${hoursLabel(WALK_CROSS_HOURS)}）`;
  if (!isSubwayRunning(state)) return targetTopRegion === "suburb" ? `紫羊区巴士已停运，${walk}` : `地铁已停运，${walk}`;
  return targetTopRegion === "suburb" ? `身上不够 ${SUBURB_BUS_FARE} 元紫羊区巴士车费，${walk}` : `身上不够 ${SUBWAY_FARE} 元车费，${walk}`;
}

export function hoursLabel(hours: number): string {
  if (hours <= 0) return "即刻到达";
  if (hours >= 1) {
    const m = Math.round((hours % 1) * 60);
    const h = Math.floor(hours);
    return m > 0 ? `约 ${h} 小时 ${m} 分钟` : `约 ${h} 小时`;
  }
  return `约 ${Math.round(hours * 60)} 分钟`;
}

export function planLabel(plan: TransitPlan): string {
  if (plan.mode === "same") return "即刻到达";
  const fare = plan.fare > 0 ? ` · ${plan.fare} 元` : "";
  const ticket = plan.requiresTicket ? " · 需在车站购票" : "";
  return `${plan.icon} ${plan.name} · ${hoursLabel(plan.hours)}${fare}${ticket}`;
}
