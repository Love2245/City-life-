/**
 * 城市通行系统（v0.975）：地铁 / 步行 / 私人载具。
 *
 * 规则：
 * - 同一个二级区域内的设施之间走动：免费、即刻到达（保持 v0.93 手感）
 * - 跨二级区域（市中心 ↔ 工业园区 …）：
 *   · 自有/租用汽车        → 10 分钟，免费
 *   · 电动车 / 三轮车      → 20 分钟，免费
 *   · 地铁（05:00-24:00）  → 30 分钟，票价 2 元
 *   · 深夜停运或钱不够      → 步行 2 小时，免费
 *
 * 纯逻辑层：不写 state、不产生日志，只负责"算方案"，由 actions.ts 负责扣钱与推进时间。
 */
import type { GameState } from "../types";

/** 地铁单程票价（元） */
export const SUBWAY_FARE = 2;
/** 地铁跨区固定耗时（小时） */
export const SUBWAY_HOURS = 0.5;
/** 步行跨区耗时（小时，深夜地铁停运时） */
export const WALK_CROSS_HOURS = 2;
/** 开车跨区耗时（小时 = 10 分钟） */
export const CAR_HOURS = 10 / 60;
/** 电动车 / 三轮车跨区耗时（小时 = 20 分钟） */
export const BIKE_HOURS = 20 / 60;
/** 地铁首班车时刻（0:00 停运，5:00 恢复运营） */
export const SUBWAY_FIRST_HOUR = 5;

/** 跨一级区（市区↔郊区）长途巴士单程票价（元） */
export const INTERCITY_BUS_FARE = 20;
/** 跨一级区长途巴士耗时（小时 = 2 小时） */
export const INTERCITY_BUS_HOURS = 2;
/** 跨一级区电动车 / 三轮车自行往返耗时（小时 = 1 小时） */
export const INTERCITY_BIKE_HOURS = 1;
/** 跨一级区汽车自行往返耗时（小时 = 0.5 小时） */
export const INTERCITY_CAR_HOURS = 0.5;

/** 通行方式 */
export type TransitMode = "same" | "car" | "bike" | "subway" | "walk" | "bus";

export interface TransitPlan {
  mode: TransitMode;
  /** 耗时（小时） */
  hours: number;
  /** 花费（元） */
  fare: number;
  /** 展示图标 */
  icon: string;
  /** 方式中文名 */
  name: string;
}

/** 载具优先级：汽车 > 三轮车 > 电动车 > 自行车（v0.99：自行车也参与跨区通行，符合"通勤省力"描述） */
const VEHICLE_PRIORITY = ["car", "tricycle", "e_bike", "bicycle"] as const;
export type VehicleType = (typeof VEHICLE_PRIORITY)[number];

const VEHICLE_ICON: Record<VehicleType, string> = { car: "🚗", tricycle: "🛺", e_bike: "🛵", bicycle: "🚲" };
const VEHICLE_LABEL: Record<VehicleType, string> = { car: "开车", tricycle: "骑三轮车", e_bike: "骑电动车", bicycle: "骑自行车" };
const BUS_ICON = "🚌";
const BUS_LABEL = "长途巴士";

/** 当前可用的私人载具（租用中或已买断都算），无则 undefined */
export function currentVehicle(state: GameState): VehicleType | undefined {
  for (const v of VEHICLE_PRIORITY) {
    if (state.flags[`item_${v}`]) return v;
  }
  return undefined;
}

/** 地铁是否在运营时段（深夜 0:00-5:00 停运） */
export function isSubwayRunning(state: GameState): boolean {
  return state.time.hour >= SUBWAY_FIRST_HOUR;
}

/** 通行层级：same=同二级区(免费) / local=同一级区内跨二级区(地铁) / intercity=跨一级区(长途巴士) */
export type TransitTier = "same" | "local" | "intercity";

/**
 * 计算通行方案。
 * @param tier 通行层级：同区免费；同一级区内跨子区走地铁；跨一级区（市区↔郊区）走长途巴士
 */
export function planTransit(state: GameState, tier: TransitTier): TransitPlan {
  if (tier === "same") {
    return { mode: "same", hours: 0, fare: 0, icon: "🚶", name: "步行" };
  }
  const v = currentVehicle(state);
  if (v === "car") {
    return { mode: "car", hours: tier === "intercity" ? INTERCITY_CAR_HOURS : CAR_HOURS, fare: 0, icon: VEHICLE_ICON.car, name: VEHICLE_LABEL.car };
  }
  if (v) {
    return { mode: "bike", hours: tier === "intercity" ? INTERCITY_BIKE_HOURS : BIKE_HOURS, fare: 0, icon: VEHICLE_ICON[v], name: VEHICLE_LABEL[v] };
  }
  if (tier === "intercity") {
    return { mode: "bus", hours: INTERCITY_BUS_HOURS, fare: INTERCITY_BUS_FARE, icon: BUS_ICON, name: BUS_LABEL };
  }
  // 本地跨二级区：地铁（运营时段且够钱）否则步行
  if (isSubwayRunning(state) && state.player.money >= SUBWAY_FARE) {
    return { mode: "subway", hours: SUBWAY_HOURS, fare: SUBWAY_FARE, icon: "🚇", name: "地铁" };
  }
  return { mode: "walk", hours: WALK_CROSS_HOURS, fare: 0, icon: "🚶", name: "步行" };
}

/** 步行跨区的原因（用于提示玩家为什么要走两小时） */
export function walkReason(state: GameState): string {
  if (!isSubwayRunning(state)) return "地铁已停运";
  return "身上不够 2 元车费";
}

/** 通行时间的中文短标 */
export function hoursLabel(hours: number): string {
  if (hours <= 0) return "即刻到达";
  if (hours >= 1) {
    const m = Math.round((hours % 1) * 60);
    const h = Math.floor(hours);
    return m > 0 ? `约 ${h} 小时 ${m} 分钟` : `约 ${h} 小时`;
  }
  return `约 ${Math.round(hours * 60)} 分钟`;
}

/** 方案的完整文案，如「🚇 地铁 · 约 30 分钟 · 2 元」 */
export function planLabel(plan: TransitPlan): string {
  if (plan.mode === "same") return "即刻到达";
  const fare = plan.fare > 0 ? ` · ${plan.fare} 元` : "";
  return `${plan.icon} ${plan.name} · ${hoursLabel(plan.hours)}${fare}`;
}
