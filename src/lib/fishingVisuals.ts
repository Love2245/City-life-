import type { FishingSpotId } from "../game/core/fishing";
import type { WeatherId } from "../game/types";
import { themeOfHour, type VisualTimeOfDay } from "../game/timeOfDay";

type FishingVisualName = "day" | "dusk" | "night" | "cloudy-day" | "rain-day" | "rain-dusk" | "rain-night";
type AssetModules = Record<string, string>;

const fishingAssets = import.meta.glob("/src/assets/bg/v1.48/fishing/*/*.webp", {
  eager: true,
  import: "default",
}) as AssetModules;

/** Convert in-game time and weather to one of the location-specific fishing backplates. */
export function fishingVisualAssetPath(spotId: FishingSpotId, hour: number, weather: WeatherId): string {
  const period: VisualTimeOfDay = themeOfHour(hour);
  const isWet = weather === "rain" || weather === "snow";
  const isCloudy = weather === "cloudy" || weather === "coldwave";
  const visualName: FishingVisualName = isWet
    ? `rain-${period}`
    : isCloudy && period === "day"
      ? "cloudy-day"
      : period;
  return `/src/assets/bg/v1.48/fishing/${spotId}/${visualName}.webp`;
}

export function fishingVisualUrl(spotId: FishingSpotId, hour: number, weather: WeatherId): string | undefined {
  return fishingAssets[fishingVisualAssetPath(spotId, hour, weather)];
}
