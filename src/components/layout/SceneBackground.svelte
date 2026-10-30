<script lang="ts">
  import { isResidenceLocation } from "../../game/core/residence";
  import { fade } from "svelte/transition";
  import { motionDurationMs, motionEasing } from "../../lib/motion";
  import { gameState } from "../../stores/gameStore.svelte";
  import { themeOfHour } from "../../game/core/time";
  import { getLocation } from "../../game/core/actions";
  import { currentHousingVisualKey, currentSceneBackgroundUrl } from "../../lib/housingVisuals";
  import { sceneHasNativeLighting } from "../../lib/sceneVisuals";
  import { atlasVisualFor } from "../../lib/mapVisuals";
  import { currentWeather } from "../../game/core/weather";
  import { districtAtmosphere, isDistrictVisual } from "../../lib/districtAtmosphere";
  import "../../styles/districtAtmosphere.css";

  /**
   * 住处使用 v1.46/housing/{key}/{theme}.webp，其他地点沿用场景背景包。
   * 房源素材尚未提供时回退到原 home 背景。
   */
  const theme = $derived(themeOfHour(gameState.time.hour));
  const isL1MapScene = $derived(gameState.locationId === "map" && !gameState.region);
  /** 地图页使用当前层级自己的背景：main 是一级主地图，downtown/suburb 是二级区域总览。 */
  const mapBgKey = $derived.by(() => {
    if (!gameState.region) return "main";
    return gameState.region;
  });
  const bgKey = $derived(
    gameState.locationId === "map" ? mapBgKey : gameState.locationId
  );
  const currentBg = $derived(currentSceneBackgroundUrl(gameState, theme));
  const district = $derived(isDistrictVisual(bgKey));
  const nativeSceneLighting = $derived(sceneHasNativeLighting(bgKey, gameState.time.hour));
  const weather = $derived(currentWeather(gameState));
  const mapVisual = $derived(
    gameState.locationId === "map"
      ? atlasVisualFor(gameState.region || "main", currentWeather(gameState), gameState.time.hour)
      : undefined,
  );
  const atmosphere = $derived(districtAtmosphere(bgKey, gameState.time.hour, weather, gameState.locationId === "map", mapVisual?.nativeLighting ?? false));
  const transitionKey = $derived(
    isResidenceLocation(gameState) ? `residence:${currentHousingVisualKey(gameState)}` : bgKey
  );
  const fallbackGradient = $derived(
    bgKey === "main"
      ? undefined
      : getLocation(gameState.locationId)?.gradient
  );

  /** v1.38 P1：预解码目标背景图。当 bgKey/theme 变化（即跨一级地图后）立即用
   *  Image() 预热解码，使昂贵的解码发生在「过场动画仍覆盖全屏」期间，
   *  避免过场一结束、首帧才去同步解码整张大图而导致主线程卡顿数秒。 */
  $effect(() => {
    const url = currentBg;
    if (url) {
      const pre = new Image();
      pre.decoding = "async";
      pre.src = url;
    }
  });

  /** v0.98 bg 按 key 跨淡入淡出 */
</script>

{#key transitionKey + ":" + theme}
  {#if currentBg}
    <div class="scene-bg" data-district={district ? "true" : undefined} data-native-scene={nativeSceneLighting ? "true" : undefined} style:--district-filter={atmosphere.filter} data-theme={theme} data-native-map={mapVisual ? (mapVisual.nativeLighting ? "true" : "false") : undefined} data-map-id={gameState.locationId === "map" ? gameState.region : undefined} data-map-source={mapVisual?.assetSource} data-map-period={mapVisual?.time} data-housing={isResidenceLocation(gameState) ? "true" : undefined} in:fade={{ duration: motionDurationMs(isL1MapScene ? "--dur-scene" : "--dur-fast"), easing: motionEasing("--ease-out") }} out:fade={{ duration: motionDurationMs(isL1MapScene ? "--dur-base" : "--dur-fast"), easing: motionEasing("--ease-out") }} aria-hidden="true">
      <img src={currentBg} alt="" decoding="async" fetchpriority="high" />
    </div>
  {:else if fallbackGradient}
    <div class="scene-bg grad" in:fade={{ duration: motionDurationMs(isL1MapScene ? "--dur-scene" : "--dur-fast"), easing: motionEasing("--ease-out") }} out:fade={{ duration: motionDurationMs(isL1MapScene ? "--dur-base" : "--dur-fast"), easing: motionEasing("--ease-out") }} style="background:{fallbackGradient}" aria-hidden="true"></div>
  {/if}
{/key}

<style>
  .scene-bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .scene-bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* 可读性遮罩：主题化暗纱，让文字从背景中凸显 */
  .scene-bg::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--bg-scrim, rgba(8, 10, 18, 0.4));
    pointer-events: none;
  }
  .scene-bg[data-theme="day"]::after {
    background: var(--bg-scrim, rgba(8, 10, 18, 0.3));
  }
  .scene-bg[data-theme="dusk"]::after {
    background: var(--bg-scrim, rgba(16, 9, 31, 0.42));
  }
  .scene-bg[data-theme="night"]::after {
    background: var(--bg-scrim, rgba(4, 7, 20, 0.52));
  }
  .scene-bg[data-native-scene="true"]::after,
  .scene-bg[data-map-source="development"]::after { background: rgba(4, 7, 20, 0.12); }
  .scene-bg[data-native-map="true"][data-map-source="revised"]::after { background: rgba(4, 7, 20, 0.18); }
  .scene-bg[data-native-map="true"][data-map-source="first-level"]::after { background: rgba(4, 7, 20, 0.20); }
  .scene-bg.grad {
    opacity: 0.55;
  }
</style>
