import { describe, expect, it } from "vitest";
import { atlasBackgroundCandidatesFor, atlasLevelOf, atlasVisualFor } from "../src/lib/mapVisuals";
import { sceneBackgroundUrl, sceneHasNativeLighting } from "../src/lib/sceneVisuals";

describe("泊月区地图与真实夜景", () => {
  it("四一级地图保持层级，泊月四分区都有各自背景", () => {
    for (const id of ["downtown", "suburb", "development", "boyue"]) expect(atlasLevelOf(id)).toBe("first");
    for (const id of ["boyue", "boyue_university", "boyue_mall", "boyue_olympic", "boyue_night_market"]) {
      expect(atlasVisualFor(id, "sunny", 12).url, id).toContain(`/atlas/${id}.webp`);
    }
  });
  it("新区一级地图按天气和时段显示对应底图", () => {
    for (const id of ["development", "boyue"]) {
      for (const weather of ["sunny", "cloudy", "rain"] as const) {
        for (const [hour, period] of [[12, "day"], [18, "dusk"], [21, "night"], [23, "late-night"], [4, "late-night"]] as const) {
          const visual = atlasVisualFor(id, weather, hour);
          if (weather === "sunny") {
            const suffix = period === "day" ? "" : `_${period}`;
            expect(visual.url).toContain(`/atlas/${id}${suffix}.webp`);
          } else {
            expect(visual.url).toContain(`/atlas/${id}_${weather}-${period === "late-night" ? "late-night" : period}.webp`);
          }
          expect(visual.nativeLighting).toBe(period !== "day");
          expect(visual.weatherId).toBe(weather);
        }
      }
    }
    for (const id of ["development", "boyue"]) {
      for (const hour of [17, 18, 19]) {
        const visual = atlasVisualFor(id, "sunny", hour);
        expect(visual.url).toContain(`/atlas/${id}_dusk.webp`);
        expect(visual.nativeLighting).toBe(true);
      }
    }
  });
  it("新区和泊月区的室外二级地图按天气及时段取静态底图，深夜复用夜景", () => {
    const outdoorMaps = [
      "development_culture",
      "development_university",
      "development_reserve",
      "boyue_university",
      "boyue_night_market",
      "boyue_olympic",
    ];
    const periods = [
      [12, "day"],
      [18, "dusk"],
      [21, "night"],
      [23, "late-night"],
    ] as const;

    for (const id of outdoorMaps) {
      for (const weather of ["cloudy", "rain"] as const) {
        for (const [hour, period] of periods) {
          const assetPeriod = period === "late-night" ? "night" : period;
          const visual = atlasVisualFor(id, weather, hour);
          expect(visual.url, `${id}/${weather}/${period}`).toContain(
            `/atlas/${id}_${weather}-${assetPeriod}.webp`,
          );
          expect(visual.assetSource, `${id}/${weather}/${period}`).toBe("development");
          expect(visual.nativeLighting, `${id}/${weather}/${period}`).toBe(period !== "day");
          expect(visual.weatherId, `${id}/${weather}/${period}`).toBe(weather);
        }
      }
    }
  });
  it("新区室外二级地图将雨雪、寒潮映射到对应天气底图", () => {
    for (const id of ["development_culture", "development_university", "development_reserve", "boyue_university", "boyue_night_market", "boyue_olympic"]) {
      for (const [weather, expected] of [["snow", "rain"], ["coldwave", "cloudy"]] as const) {
        expect(atlasVisualFor(id, weather, 12).url).toContain(`/atlas/${id}_${expected}-day.webp`);
      }
    }
  });
  it("雨雪、寒潮与晴天以外的天气映射到相应的新区天气图", () => {
    for (const id of ["development", "boyue"]) {
      for (const [weather, expected] of [["rain", "rain"], ["snow", "rain"], ["cloudy", "cloudy"], ["coldwave", "cloudy"]] as const) {
        expect(atlasVisualFor(id, weather, 12).url).toContain(`/atlas/${id}_${expected}-day.webp`);
      }
    }
  });
  it("独立夜景损坏时仍可回退到同区域的日景", () => {
    const urls = atlasBackgroundCandidatesFor("boyue_night_market", "snow", 23);
    expect(urls[0]).toContain("boyue_night_market_rain-night.webp");
    const samePeriodFallback = urls.findIndex(url => url.includes("/atlas/boyue_night_market_night.webp"));
    const dayFallback = urls.findIndex(url => url.includes("/atlas/boyue_night_market.webp"));
    expect(samePeriodFallback).toBeGreaterThan(0);
    expect(dayFallback).toBeGreaterThan(samePeriodFallback);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("小商场内部不覆盖户外天气，奥体与校园保持室外天气", () => {
    for (const hour of [12, 18, 21, 23]) {
      const indoor = atlasVisualFor("boyue_mall", "rain", hour);
      expect(indoor.indoor).toBe(true);
      expect(indoor.url).toBe(atlasVisualFor("boyue_mall", "sunny", hour).url);
    }
    expect(atlasVisualFor("boyue_olympic", "rain", 12).indoor).toBe(false);
    expect(atlasVisualFor("boyue_university", "rain", 12).indoor).toBe(false);
  });
  it("喷泉昼夜使用不同原图，机场使用小型通航独立背景", () => {
    const day = sceneBackgroundUrl("boyue_central_fountain", "day");
    const night = sceneBackgroundUrl("boyue_central_fountain", "night");
    expect(day).toContain("boyue_central_fountain.webp");
    expect(night).toContain("boyue_central_fountain_night.webp");
    expect(night).not.toBe(day);
    expect(sceneBackgroundUrl("boyue_central_fountain", "dusk", 18)).toBe(day);
    expect(sceneBackgroundUrl("boyue_central_fountain", "dusk", 17)).toBe(day);
    expect(sceneBackgroundUrl("boyue_central_fountain", "dusk", 20)).toBe(night);
    expect(sceneHasNativeLighting("boyue_central_fountain", 18)).toBe(false);
    expect(sceneHasNativeLighting("boyue_central_fountain", 20)).toBe(true);
    expect(sceneBackgroundUrl("airport", "day")).toContain("/v1.48/scenes/airport.webp");
  });
});

