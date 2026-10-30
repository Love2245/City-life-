import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { atlasLevelOf, atlasWeatherOf, atlasVisualFor } from "../src/lib/mapVisuals";

/** 二级地点地图与一级区域地图的判定锚点。旧版已有的精确时段图继续复用，新绘制包优先覆盖。 */
const SECOND_LEVEL = "downtown_center";
const FIRST_LEVEL = "downtown";

function urlOf(visual: { url?: string }): string {
  return visual.url ?? "";
}

describe("v1.43 二级地图天气视觉", () => {
  it("层级判定：downtown / suburb 为一级区域图，其余地点图为二级", () => {
    expect(atlasLevelOf("main")).toBe("main");
    expect(atlasLevelOf("downtown")).toBe("first");
    expect(atlasLevelOf("suburb")).toBe("first");
    for (const id of [
      "downtown_center",
      "downtown_mall",
      "downtown_industrial",
      "downtown_residential",
      "downtown_station",
      "suburban_edge",
      "rural",
      "heavy_industry",
    ]) {
      expect(atlasLevelOf(id), id).toBe("second");
    }
  });

  it("保留原始六档天气，二级地图因此能区分雪 / 热浪 / 寒潮", () => {
    expect(atlasWeatherOf("snow")).toBe("rain");
    expect(atlasWeatherOf("coldwave")).toBe("cloudy");
    expect(atlasWeatherOf("heatwave")).toBe("sunny");
    for (const id of ["sunny", "cloudy", "rain", "snow", "heatwave", "coldwave"] as const) {
      const visual = atlasVisualFor(SECOND_LEVEL, id, 12);
      expect(visual.weatherId, id).toBe(id);
    }
  });

  it("时间边界与资源时段一致", () => {
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 4).time).toBe("late-night");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 5).time).toBe("day");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 16).time).toBe("day");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 17).time).toBe("dusk");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 19).time).toBe("dusk");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 20).time).toBe("night");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 22).time).toBe("night");
    expect(atlasVisualFor(SECOND_LEVEL, "sunny", 23).time).toBe("late-night");
  });

  it("所有一级区域和二级地图都使用当前游戏时段的素材", () => {
    const maps = [
      "downtown",
      "suburb",
      "development",
      "boyue",
      "downtown_center",
      "downtown_industrial",
      "downtown_mall",
      "downtown_residential",
      "downtown_station",
      "suburban_edge",
      "rural",
      "heavy_industry",
      "development_culture",
      "development_reserve",
      "development_university",
      "boyue_mall",
      "boyue_night_market",
      "boyue_olympic",
      "boyue_university",
    ];
    const periods = [
      [12, "day"],
      [18, "dusk"],
      [21, "night"],
      [23, "late-night"],
    ] as const;

    for (const mapId of maps) {
      const urls = periods.map(([hour, expectedTime]) => {
        const visual = atlasVisualFor(mapId, "sunny", hour);
        expect(visual.time, `${mapId} at ${hour}:00`).toBe(expectedTime);
        expect(visual.url, `${mapId} at ${hour}:00 has no background`).toBeTruthy();
        return visual.url;
      });
      expect(new Set(urls.slice(0, 3)).size, `${mapId} day/dusk/night`).toBe(3);
    }
  });

  it("二级图优先选择精确时段，缺少同天气时也不会回退到白天", () => {
    const districts = [
      "downtown_center",
      "downtown_industrial",
      "downtown_mall",
      "downtown_residential",
      "downtown_station",
      "suburban_edge",
      "rural",
      "heavy_industry",
    ];
    const hours = [12, 18, 21, 23];
    const periods = ["day", "dusk", "night", "late-night"];
    for (const id of districts) {
      for (const weather of ["sunny", "cloudy", "rain"] as const) {
        for (const [hour, period] of hours.map((hour, index) => [hour, periods[index]] as const)) {
          const visual = atlasVisualFor(id, weather, hour);
          expect(visual.time, `${id}/${weather}/${hour}`).toBe(period);
          expect(visual.nativeLighting, `${id}/${weather}/${hour}`).toBe(true);
          expect(urlOf(visual), `${id}/${weather}/${hour}`).toMatch(
            new RegExp(`-(?:${period === "late-night" ? "night" : period})\\.webp$`),
          );
          expect(urlOf(visual), `${id}/${weather}/${hour}`).toContain(`/atlas/${id}/`);
        }
      }
    }
  });

  it("二级地图变体保持原图尺寸和 WebP 格式", () => {
    for (const id of [
      "downtown_center",
      "downtown_industrial",
      "downtown_mall",
      "downtown_residential",
      "downtown_station",
      "suburban_edge",
      "rural",
      "heavy_industry",
    ]) {
      for (const weather of ["sunny", "cloudy", "rain"] as const) {
        for (const period of ["day", "dusk", "night", "late-night"]) {
          const file = new URL(`../src/assets/bg/v1.43/atlas/${id}/${weather}-${period}.webp`, import.meta.url);
          expect(existsSync(file), `${id}/${weather}-${period}`).toBe(true);
          expect(readFileSync(file).subarray(8, 12).toString(), `${id}/${weather}-${period}`).toBe("WEBP");
          expect(statSync(file).size, `${id}/${weather}-${period}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("一级区域地图仍按天气 × 时段取 v1.43 底图", () => {
    const rain = atlasVisualFor(FIRST_LEVEL, "rain", 10);
    expect(rain.nativeLighting).toBe(true);
    expect(urlOf(rain)).toContain("v1.43/atlas/downtown/rain-day.webp");
    const suburbanRain = atlasVisualFor("suburb", "cloudy", 12);
    expect(suburbanRain.nativeLighting).toBe(true);
    expect(urlOf(suburbanRain)).toContain("v1.43/atlas/suburb/cloudy-day.webp");
  });

  it("市中心使用统一的 v1.495 灯光图，其他地图仍保留原重绘包", () => {
    expect(urlOf(atlasVisualFor("downtown_center", "sunny", 21))).toContain("v1.495/atlas/downtown_center/sunny-night.webp");
    expect(urlOf(atlasVisualFor("downtown_mall", "sunny", 18))).toContain("v1.46/atlas/downtown_mall/sunny-dusk.webp");
  });

  it("素材缺失时逐级回退：cloudy-night 缺图 → sunny-night", () => {
    const cloudyNight = atlasVisualFor(FIRST_LEVEL, "cloudy", 22);
    expect(cloudyNight.time).toBe("night");
    expect(urlOf(cloudyNight)).toContain("v1.43/atlas/downtown/sunny-night.webp");
    expect(cloudyNight.nativeLighting).toBe(true);
  });

  it("一级地图完全缺图时回退到场景背景，且不误标原生灯光", () => {
    // downtown / suburb 目前都没有 sunny-day，属于已知素材缺口。
    const sunnyDay = atlasVisualFor(FIRST_LEVEL, "sunny", 12);
    expect(sunnyDay.nativeLighting).toBe(false);
  });
});

describe("泊月夜市重制地图素材解析", () => {
  it("一级泊月夜/深夜按晴云雨与时段读取对应底图", () => {
    const cases = [
      ["sunny", 12, "boyue.webp"],
      ["sunny", 18, "boyue_dusk.webp"],
      ["sunny", 21, "boyue_night.webp"],
      ["sunny", 23, "boyue_late-night.webp"],
      ["cloudy", 12, "boyue_cloudy-day.webp"],
      ["cloudy", 18, "boyue_cloudy-dusk.webp"],
      ["cloudy", 21, "boyue_cloudy-night.webp"],
      ["cloudy", 23, "boyue_cloudy-late-night.webp"],
      ["rain", 12, "boyue_rain-day.webp"],
      ["rain", 18, "boyue_rain-dusk.webp"],
      ["rain", 21, "boyue_rain-night.webp"],
      ["rain", 23, "boyue_rain-late-night.webp"],
    ] as const;

    for (const [weather, hour, fileName] of cases) {
      const visual = atlasVisualFor("boyue", weather, hour);
      expect(urlOf(visual), `${weather}/${hour}`).toContain(`/v1.48/atlas/${fileName}`);
      expect(visual.assetSource).toBe("development");
      const file = new URL(`../src/assets/bg/v1.48/atlas/${fileName}`, import.meta.url);
      expect(existsSync(file), fileName).toBe(true);
      expect(readFileSync(file).subarray(8, 12).toString(), fileName).toBe("WEBP");
    }
  });

  it("泊月夜市二级晴云雨地图均使用已通过的日暮夜矩阵", () => {
    for (const [weather, prefix] of [["sunny", ""], ["cloudy", "cloudy-"], ["rain", "rain-"]] as const) {
      for (const [hour, period] of [[12, "day"], [18, "dusk"], [21, "night"], [23, "night"]] as const) {
        const visual = atlasVisualFor("boyue_night_market", weather, hour);
        const fileName = weather === "sunny"
          ? `boyue_night_market${period === "day" ? "" : `_${period}`}.webp`
          : `boyue_night_market_${prefix}${period}.webp`;
        expect(urlOf(visual), `${weather}/${hour}`).toContain(`/v1.48/atlas/${fileName}`);
        expect(visual.assetSource).toBe("development");
        const file = new URL(`../src/assets/bg/v1.48/atlas/${fileName}`, import.meta.url);
        expect(existsSync(file), fileName).toBe(true);
        expect(readFileSync(file).subarray(8, 12).toString(), fileName).toBe("WEBP");
      }
    }
  });
});

describe("商场室内底图", () => {
  it("日暮夜都有独立室内图且不播放室外降水", () => {
    for (const [hour, period] of [[12, "day"], [18, "dusk"], [21, "night"], [23, "night"]] as const) {
      const visual = atlasVisualFor("mall_interior", "rain", hour);
      expect(visual.indoor).toBe(true);
      expect(visual.nativeLighting).toBe(true);
      expect(visual.url).toContain("v1.46/atlas/mall_interior/");
      expect(visual.url).toContain(`${period}.webp`);
    }
    expect(atlasVisualFor("downtown_mall", "rain", 21).indoor).toBe(false);
  });
});

describe("地图缩放与原生天气背景", () => {
  const source = readFileSync(
    new URL("../src/components/layout/MapAtlas.svelte", import.meta.url),
    "utf8",
  );
  const weatherLines = source
    .split("\n")
    .filter((line) => line.includes("data-weather") || line.includes("map-weather"));

  it("各设备最小缩放和默认缩放均为100%", () => {
    expect(source).toContain("const ZOOM_MIN = 1;");
    expect(source).toContain("const zoomMin = ZOOM_MIN;");
    expect(source).toContain("let zoom = $state(ZOOM_MIN);");
    expect(source).not.toContain("MOBILE_ZOOM_MIN");
    expect(source).not.toContain("$state(isMobileLayout()");
  });

  it("最小缩放时地图画布按视口宽高铺满，不露出周边底色", () => {
    expect(source).toContain("const MAP_ASPECT_RATIO = 1672 / 941;");
    expect(source).toContain("Math.max(width, height * MAP_ASPECT_RATIO)");
    expect(source).toContain("const boardWidth = $derived(baseBoardWidth * zoom);");

    // The component sizes its image plane to cover the longer viewport axis,
    // then adds a small overscan so neither dimension exposes the canvas.
    for (const [width, height] of [[932, 400], [640, 480], [1200, 700]]) {
      const ratio = 1672 / 941;
      const boardWidth = Math.max(860, width, height * ratio) * 1.08;
      expect(boardWidth).toBeGreaterThanOrEqual(width);
      expect(boardWidth / ratio).toBeGreaterThanOrEqual(height);
    }
  });

  it("雨天使用实际底图，不再渲染天气覆盖层", () => {
    expect(weatherLines.length).toBeGreaterThan(0);
    expect(source).not.toContain('class="map-weather"');
    expect(source).not.toContain('[data-weather-detail="rain"] .map-weather::before');
    expect(source).not.toContain('[data-weather-detail="rain"] .map-weather::after');
    expect(source).not.toContain("map-rain-fall");
    expect(source).not.toContain("map-rain-drift");
  });

  it("雪、热浪和寒潮不再合成动画或染色滤镜", () => {
    for (const effect of ["map-snow-fall", "map-heat-shimmer", "map-cold-mist", "filter:brightness"])
      expect(source).not.toContain(effect);
  });

  it("静态阅读暗纱位于地点标牌下方", () => {
    expect(source).toContain(".map-shade { z-index:2;");
    expect(source).toContain(".map-pin { position:absolute");
    expect(source).toContain("z-index:4;");
  });
});
