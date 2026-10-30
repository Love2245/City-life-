import { describe, expect, it } from "vitest";
import { fishingVisualAssetPath, fishingVisualUrl } from "../src/lib/fishingVisuals";

describe("fishing scene art selection", () => {
  it("maps game clock periods and weather to the dedicated art variants", () => {
    expect(fishingVisualAssetPath("treasure_lake", 12, "sunny")).toMatch(/treasure_lake\/day\.webp$/);
    expect(fishingVisualAssetPath("treasure_lake", 18, "sunny")).toMatch(/treasure_lake\/dusk\.webp$/);
    expect(fishingVisualAssetPath("treasure_lake", 22, "sunny")).toMatch(/treasure_lake\/night\.webp$/);
    expect(fishingVisualAssetPath("lake_park", 12, "cloudy")).toMatch(/lake_park\/cloudy-day\.webp$/);
    expect(fishingVisualAssetPath("lake_park", 18, "cloudy")).toMatch(/lake_park\/dusk\.webp$/);
    expect(fishingVisualAssetPath("lake_park", 1, "cloudy")).toMatch(/lake_park\/night\.webp$/);
    expect(fishingVisualAssetPath("treasure_lake", 12, "rain")).toMatch(/treasure_lake\/rain-day\.webp$/);
    expect(fishingVisualAssetPath("treasure_lake", 18, "rain")).toMatch(/treasure_lake\/rain-dusk\.webp$/);
    expect(fishingVisualAssetPath("treasure_lake", 22, "rain")).toMatch(/treasure_lake\/rain-night\.webp$/);
  });

  it("keeps location art distinct and resolves every packaged backplate", () => {
    const treasure = fishingVisualUrl("treasure_lake", 12, "sunny");
    const park = fishingVisualUrl("lake_park", 12, "sunny");
    expect(treasure).toBeTruthy();
    expect(park).toBeTruthy();
    expect(park).not.toBe(treasure);

    for (const spot of ["treasure_lake", "lake_park"] as const) {
      for (const [hour, weather] of [[12, "sunny"], [18, "sunny"], [22, "sunny"], [12, "cloudy"], [12, "rain"], [18, "rain"], [22, "rain"]] as const) {
        expect(fishingVisualUrl(spot, hour, weather), `${spot} ${hour}:00 ${weather}`).toBeTruthy();
      }
    }
  });
});
