<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import { themeOfHour } from "../../game/core/time";
  import { getLocation } from "../../game/core/actions";

  /** 预加载全部背景图（Vite glob，路径约定 src/assets/bg/{locationId}/{theme}.webp） */
  const bgModules = import.meta.glob("/src/assets/bg/**/*.webp", {
    eager: true,
    import: "default",
  }) as Record<string, string>;

  /** locationId → { theme → url } */
  const bgMap: Record<string, Record<string, string>> = {};
  for (const [path, url] of Object.entries(bgModules)) {
    const m = path.match(/bg\/([^/]+)\/(.+)\.webp$/);
    if (m) {
      (bgMap[m[1]] ??= {})[m[2]] = url as string;
    }
  }

  const theme = $derived(themeOfHour(gameState.time.hour));
  /** 地图页使用当前区域背景；一级区域用一张代表性二级区域图作底图。 */
  const mapBgKey = $derived.by(() => {
    if (!gameState.region) return "main";
    if (gameState.region === "downtown") return "downtown_center";
    if (gameState.region === "suburb") return "suburban_edge";
    return gameState.region;
  });
  const bgKey = $derived(
    gameState.locationId === "map" ? mapBgKey : gameState.locationId
  );
  const currentBg = $derived(bgMap[bgKey]?.[theme]);
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

{#key bgKey + ":" + theme}
  {#if currentBg}
    <div class="scene-bg" in:fade={{ duration: 600 }} out:fade={{ duration: 400 }} aria-hidden="true">
      <img src={currentBg} alt="" decoding="async" fetchpriority="high" />
    </div>
  {:else if fallbackGradient}
    <div class="scene-bg grad" in:fade={{ duration: 600 }} out:fade={{ duration: 400 }} style="background:{fallbackGradient}" aria-hidden="true"></div>
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
  .scene-bg.grad {
    opacity: 0.55;
  }
</style>
