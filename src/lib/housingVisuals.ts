import type { GameState } from "../game/types";
import { getEffectiveLodging, HOUSING } from "../game/core/housing";
import { isResidenceLocation, housingAtLocation, residenceLocationId, permanentResidence } from "../game/core/residence";
import { developmentHousingBackgroundUrl, sceneBackgroundUrl, type SceneTheme } from "./sceneVisuals";
import { atlasVisualFor } from "./mapVisuals";
import { currentWeather } from "../game/core/weather";
import { themeOfHour } from "../game/timeOfDay";

/** Pack version only; the application version remains unchanged. */
export const HOUSING_VISUAL_KEYS: readonly string[] = [
  HOUSING.gov.id,
  ...HOUSING.nightly.map((tier) => tier.visualId ?? tier.id),
  ...HOUSING.lease.map((tier) => tier.visualId ?? tier.id),
  ...(HOUSING.buy ?? []).map((tier) => tier.visualId??tier.id),
].filter((key, index, keys) => keys.indexOf(key) === index);

const housingModules = import.meta.glob("/src/assets/bg/v1.46/housing/**/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export type HousingVisualTheme = SceneTheme | "late-night";

/** 当前入住建筑与居家页面使用同一套住宿素材。 */
export function currentHousingVisualKey(state: GameState): string {
  const residence = getEffectiveLodging(state);
  return residence.visualId ?? residence.id;
}

/** Resolve district-specific housing first, then keep the legacy v1.46 package for existing homes. */
export function housingBackgroundUrl(
  key: string,
  theme: HousingVisualTheme,
  assets: Readonly<Record<string, string>> = housingModules,
  hour?: number,
): string | undefined {
  const period = hour === undefined ? theme : themeOfHour(hour);
  const resolvedTheme = period === "late-night" ? "night" : period;
  return assets[`/src/assets/bg/v1.48/housing/${key}/${resolvedTheme}.webp`]
    ?? developmentHousingBackgroundUrl(key, resolvedTheme)
    ?? assets[`/src/assets/bg/v1.46/housing/${key}/${resolvedTheme}.webp`]
    ?? (key === "camping_base" ? sceneBackgroundUrl(key, resolvedTheme, hour) : undefined)
    ?? sceneBackgroundUrl("home", resolvedTheme, hour);
}

/** Shared by the full-screen backdrop and the location introduction image. */
export function currentSceneBackgroundUrl(state: GameState, theme: HousingVisualTheme): string | undefined {
  if (isResidenceLocation(state)) {
    return housingBackgroundUrl(currentHousingVisualKey(state), theme, undefined, state.time.hour);
  }
  if (state.locationId === "map") {
    // 地图画布与四周底景必须取同一张时段 / 天气原图，不能出现一级夜景配二级日景。
    return atlasVisualFor(state.region || "main", currentWeather(state), state.time.hour).url;
  }
  const key = state.locationId;
  const weather = currentWeather(state);
  // An unowned residence keeps the exterior; public service rooms resolve below.
  if (["moon_monument"].includes(key)
    || (key === "own_villa" && !isResidenceLocation(state))) {
    return atlasVisualFor(state.region === "downtown_center" ? "downtown_center" : "downtown_commercial", weather, state.time.hour).url;
  }
  const newResidence = ["hotel_boyue_quick", "hotel_boyu_nightmarket", "dev_incubator", "boyue_talent_apartment"]
    .includes(key) ? housingAtLocation(key) : undefined;
  if (newResidence) {
    return housingBackgroundUrl(newResidence.visualId ?? newResidence.id, theme, undefined, state.time.hour);
  }
  if (key === residenceLocationId(state, true)) {
    const base = permanentResidence(state);
    return housingBackgroundUrl(base.visualId ?? base.id, theme, undefined, state.time.hour);
  }
  const venue = sceneBackgroundUrl(key, theme === "late-night" ? "night" : theme, state.time.hour, weather);
  if (venue) return venue;
  const housing = housingAtLocation(key);
  if (housing) return housingBackgroundUrl(housing.visualId ?? housing.id, theme, undefined, state.time.hour);
  if (state.region?.startsWith('campus_')) return atlasVisualFor(state.region, weather, state.time.hour).url;
  return sceneBackgroundUrl(key, theme === "late-night" ? "night" : theme, state.time.hour, weather);
}
