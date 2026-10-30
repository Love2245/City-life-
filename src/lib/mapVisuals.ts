import type { WeatherId } from "../game/types";
import { themeOfHour } from "../game/timeOfDay";
import { sceneBackgroundUrl, type SceneTheme } from "./sceneVisuals";

/** 一级地图独有的时间层级；深夜不再和普通夜晚共用同一层图。 */
export type AtlasTime = "day" | "dusk" | "night" | "late-night";
export type AtlasWeather = "sunny" | "cloudy" | "rain";
export type AtlasLevel = "main" | "first" | "second";
export type AtlasAssetSource = "revised" | "first-level" | "development" | "fallback";

export interface AtlasVisual {
  url: string | undefined;
  time: AtlasTime;
  /** 归并后的三档天气，供既有 CSS 与调用方兼容使用。 */
  weather: AtlasWeather;
  /**
   * 原始六档天气（sunny / cloudy / rain / snow / heatwave / coldwave）。
   * 资源包按三种基础天气绘制，原始天气用于界面标识；不再叠加天气动画。
   */
  weatherId: WeatherId;
  /** 资源本身是否已经画好灯光；为真时 MapAtlas 不再额外把画面压黑。 */
  nativeLighting: boolean;
  /** 资源来源，用于把新修补图、旧区域图和旧版回退图做一致的色彩校正。 */
  assetSource: AtlasAssetSource;
  indoor: boolean;
}

// 二级地图继续使用已校准的航拍构图，并在同一构图上补齐天气 × 时段变体。
// 一级区域图仍沿用 v1.43 的独立天气底图。
const aerial = import.meta.glob("/src/assets/bg/v1.42/atlas/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const firstLevel = import.meta.glob("/src/assets/bg/v1.43/atlas/*/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

// 市中心与商业区使用同批次的 v1.495 天气/灯光实图，其他区域保留 v1.46 重绘。
const revised = import.meta.glob(["/src/assets/bg/v1.46/atlas/*/*.webp", "/src/assets/bg/v1.495/atlas/*/*.webp"], {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** v1.48 新区与泊月区的独立地图图组，二级室外地图也包含静态天气变体。 */
const development = import.meta.glob("/src/assets/bg/v1.48/atlas/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const DEVELOPMENT_WEATHER_MAPS = new Set([
  "development",
  "boyue",
  "development_culture",
  "development_university",
  "development_reserve",
  "boyue_university",
  "boyue_night_market",
  "boyue_olympic",
]);

function developmentUrl(mapId: string, weather: AtlasWeather = "sunny", hour = 12): string | undefined {
  const root = "/src/assets/bg/v1.48/atlas";
  const time = atlasTimeOfHour(hour);
  const weatherPeriods = time === "late-night" ? ["late-night", "night"] : [time];
  // 一级区域图及新区、泊月区的室外二级图都有独立天气底图；室内地图
  // （如 boyue_mall）和未开放机场继续使用不受天气影响的原背景。
  if (DEVELOPMENT_WEATHER_MAPS.has(mapId) && weather !== "sunny") {
    for (const period of weatherPeriods) {
      const variant = development[`${root}/${mapId}_${weather}-${period}.webp`];
      if (variant) return variant;
    }
  }
  const suffixes = time === "dusk"
    ? ["_dusk"]
    : time === "late-night"
      ? ["_late-night", "_night"]
      : time === "night"
        ? ["_night"]
        : [];
  for (const suffix of suffixes) {
    const period = development[`${root}/${mapId}${suffix}.webp`];
    if (period) return period;
  }
  return development[`${root}/${mapId}.webp`];
}

function revisedUrl(mapId: string, weather: AtlasWeather, time: AtlasTime): string | undefined {
  const root = `/src/assets/bg/${["downtown_commercial", "downtown_center","campus_teacher","campus_engineering"].includes(mapId) ? "v1.495" : "v1.46"}/atlas/${mapId}`;
  const period = time === "late-night" ? "night" : time;
  return revised[`${root}/${weather}-${time}.webp`]
    ?? revised[`${root}/${weather}-${period}.webp`]
    ?? revised[`${root}/sunny-${time}.webp`]
    ?? revised[`${root}/sunny-${period}.webp`];
}

const FIRST_LEVEL_MAPS = new Set(["downtown", "suburb", "development", "boyue"]);

/** 地图层级：主地图、一级区域地图、二级地点地图。 */
export function atlasLevelOf(mapId: string): AtlasLevel {
  if (mapId === "main") return "main";
  return FIRST_LEVEL_MAPS.has(mapId) ? "first" : "second";
}

export function atlasTimeOfHour(hour: number): AtlasTime {
  if (hour >= 23 || hour < 5) return "late-night";
  return themeOfHour(hour);
}

/** 极端天气先落到最接近的三种视觉方案，避免没有素材时回退成晴天。 */
export function atlasWeatherOf(weather: WeatherId): AtlasWeather {
  if (weather === "rain" || weather === "snow") return "rain";
  if (weather === "cloudy" || weather === "coldwave") return "cloudy";
  return "sunny";
}

function sceneThemeForAtlasTime(time: AtlasTime): SceneTheme {
  return time === "day" ? "day" : time === "dusk" ? "dusk" : "night";
}

function firstLevelUrl(mapId: string, weather: AtlasWeather, time: AtlasTime): string | undefined {
  const root = `/src/assets/bg/v1.43/atlas/${mapId}`;
  return firstLevel[`${root}/${weather}-${time}.webp`]
    ?? firstLevel[`${root}/sunny-${time}.webp`];
}

/**
 * 返回地图当前的底图，不让 CSS 用一层黑幕伪造夜景。
 * 新一级地图按「天气 × 时段」取图；素材不足时仍平稳回退到旧版图。
 */
export function atlasVisualFor(
  mapId: string,
  weather: WeatherId = "sunny",
  hour = 12,
): AtlasVisual {
  const time = atlasTimeOfHour(hour);
  const visualWeather = atlasWeatherOf(weather);
  const level = atlasLevelOf(mapId);
  // 所有层级都先尝试 v1.43 天气底图：二级地点地图使用保持原构图的修补变体；
  // 素材缺失时再平稳回退到旧版 v1.42 航拍图。
  const revised = revisedUrl(mapId, visualWeather, time);
  const development = developmentUrl(mapId, visualWeather, hour);
  const nativeDevelopmentLighting = !!development
    && time !== "day"
    && development !== developmentUrl(mapId, visualWeather, 12);
  const firstLevel = revised || development ? undefined : firstLevelUrl(mapId, visualWeather, time);
  const generated = revised ?? development ?? firstLevel;
  const fallback = aerial[`/src/assets/bg/v1.42/atlas/${mapId}.webp`]
    ?? (level === "first" ? sceneBackgroundUrl(mapId, sceneThemeForAtlasTime(time)) ?? sceneBackgroundUrl(mapId, "day") : undefined);

  return {
    url: generated ?? fallback,
    time,
    weather: visualWeather,
    weatherId: weather,
    nativeLighting: !!generated && (!development || nativeDevelopmentLighting),
    assetSource: revised ? "revised" : development ? "development" : firstLevel ? "first-level" : "fallback",
    indoor: mapId === "mall_interior" || mapId === "boyue_mall",
  };
}

/**
 * 地图主图加载失败时的备用资源。依次尝试同地图的天气图、旧航拍图和场景背景，
 * 让单张坏图不会导致整个地图无法使用。
 */
export function atlasBackgroundCandidatesFor(
  mapId: string,
  weather: WeatherId = "sunny",
  hour = 12,
): string[] {
  const time = atlasTimeOfHour(hour);
  const visualWeather = atlasWeatherOf(weather);
  const nearbyWeather: AtlasWeather[] = visualWeather === "rain"
    ? ["cloudy", "sunny"]
    : visualWeather === "cloudy"
      ? ["rain", "sunny"]
      : ["cloudy", "rain"];
  const candidates = [
    atlasVisualFor(mapId, weather, hour).url,
    developmentUrl(mapId, visualWeather, hour),
    ...nearbyWeather.map(candidateWeather => developmentUrl(mapId, candidateWeather, hour)),
    // 先尝试相同时段的天气替代图，再回退到同一时段的晴天图；最后才用白昼图。
    developmentUrl(mapId, "sunny", hour),
    developmentUrl(mapId, "sunny", 12),
    revisedUrl(mapId, visualWeather, time),
    revisedUrl(mapId, "sunny", time),
    revisedUrl(mapId, "cloudy", time),
    revisedUrl(mapId, "rain", time),
    firstLevelUrl(mapId, visualWeather, time),
    firstLevelUrl(mapId, "sunny", time),
    firstLevelUrl(mapId, "cloudy", time),
    firstLevelUrl(mapId, "rain", time),
    aerial[`/src/assets/bg/v1.42/atlas/${mapId}.webp`],
    sceneBackgroundUrl(mapId, sceneThemeForAtlasTime(time)),
    sceneBackgroundUrl(mapId, "day"),
    sceneBackgroundUrl(mapId, "dusk"),
    sceneBackgroundUrl(mapId, "night"),
  ];

  // 多个回退层级可能共用同一张图，过滤重复项避免失败时重复尝试。
  return [...new Set(candidates.filter((url): url is string => !!url))];
}

/** 兼容旧调用方；新地图应使用 atlasVisualFor 取得完整视觉元信息。 */
export function atlasBackgroundUrl(mapId: string, theme: SceneTheme = "day"): string | undefined {
  const hour = theme === "day" ? 12 : theme === "dusk" ? 18 : 21;
  return atlasVisualFor(mapId, "sunny", hour).url;
}
