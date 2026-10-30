import type { WeatherId } from "../game/types";
import { atlasTimeOfHour } from "./mapVisuals";

const OUTDOOR_SCENES = new Set(["moon_mountain", "treasure_lake", "camping_base", "dev_university", "dev_food_street", "development_bus_station", "boyue_engineering_college", "boyue_food_street", "boyue_snack_street", "boyue_football_field", "boyue_basketball_court"]);
const DISTRICT_SCENES = new Set([...OUTDOOR_SCENES, "dev_incubator", "dev_museum", "dev_science_museum", "dev_art_gallery", "airport"]);

/** Keep district identity and indoor metadata; lighting comes from artwork, without CSS filters. */
export function isDistrictVisual(id: string): boolean {
  return id === "development" || id.startsWith("development_") || id === "boyue" || id.startsWith("boyue_") || DISTRICT_SCENES.has(id);
}
export function districtAtmosphere(id: string, hour: number, _weather: WeatherId, map: boolean, _nativeLighting = false) {
  const period = atlasTimeOfHour(hour);
  const indoor = map ? id === "boyue_mall" : !OUTDOOR_SCENES.has(id);
  return {period, indoor, filter:"none"};
}
