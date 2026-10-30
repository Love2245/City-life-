/** v1.45 NPC 场景服装解析，纯数据/逻辑层。 */
import type { NpcPresenceTime, NpcOutfitContext } from "./npcs";
import { getNpcDef, npcPresenceAt } from "./npcs";
import type { Season } from "./calendar";
import type { WeatherId } from "../types";

export type OutfitContext = NpcOutfitContext;
export type NpcWeatherOutfit = "summer" | "rain" | "winter" | "autumn";

/** 天气款优先级：冬季保暖 > 非冬季雨天 > 酷暑/夏季晴天 > 常态。 */
export function npcWeatherOutfitForConditions(
  season: Season,
  weather: WeatherId,
): NpcWeatherOutfit | null {
  if (season === "winter" || weather === "coldwave" || weather === "snow") return "winter";
  if (weather === "rain") return "rain";
  if (weather === "heatwave" || (season === "summer" && weather === "sunny")) return "summer";
  if (season === "autumn") return "autumn";
  return null;
}

/** 地点默认场景；NPC 排班上的 outfitContext 优先级更高。 */
const LOCATION_CONTEXT: Record<string, OutfitContext> = {
  cafe: "service",
  fast_food: "service",
  internet_cafe: "service",
  library: "service",
  labor_market: "retail",
  electronics_store: "retail",
  luxury_store: "retail",
  furniture_store: "retail",
  flower_market: "market",
  market: "market",
  snack_street: "market",
  park: "outdoor",
  lake_park: "outdoor",
  amusement_park: "casual",
  clinic: "medical",
  hospital: "medical",
  suburb_bus_station: "station",
  suburb_train_station: "station",
  farm: "farm",
  pasture: "farm",
  orchard: "farm",
};

/** 少数角色在同一地点的职业语义比地点默认值更明确。 */
const NPC_CONTEXT_OVERRIDE: Record<string, Partial<Record<string, OutfitContext>>> = {
  npc_zhao_gang: { snack_street: "casual" },
  npc_chen_jie: { market: "service" },
  npc_netbar_boss: { internet_cafe: "service", electronics_store: "retail" },
  npc_wang_lei: { hospital: "casual" },
  npc_flower_market_owner: { amusement_park: "casual" },
  npc_suburb_farmer: { farm: "farm", pasture: "farm", orchard: "farm" },
};

export function outfitContextForNpc(
  npcId: string,
  locationId: string,
  time: NpcPresenceTime,
): OutfitContext {
  const def = getNpcDef(npcId);
  const presence = def ? npcPresenceAt(def, time) : null;
  if (presence?.locationId === locationId && presence.outfitContext) return presence.outfitContext;
  return NPC_CONTEXT_OVERRIDE[npcId]?.[locationId]
    ?? LOCATION_CONTEXT[locationId]
    ?? "casual";
}

export function contextLabel(context: OutfitContext): string {
  return {
    service: "服务装",
    retail: "店员装",
    outdoor: "户外装",
    medical: "医疗装",
    farm: "农务装",
    station: "车站装",
    market: "市集装",
    casual: "日常装",
  }[context];
}
