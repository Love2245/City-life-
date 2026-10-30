<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { atlasBackgroundCandidatesFor, atlasLevelOf, atlasVisualFor } from "../../lib/mapVisuals";
  import { mapAnchor, type AtlasItem } from "../../lib/mapAtlas";
  import { formatTime } from "../../game/core/time";
  import { currentWeather, WEATHER_LABEL } from "../../game/core/weather";
  import { gameState } from "../../stores/gameStore.svelte";
  import MapSymbol from "./MapSymbol.svelte";
  import { districtAtmosphere } from "../../lib/districtAtmosphere";
  import "../../styles/districtAtmosphere.css";

  let { mapId, title, subtitle, items, onSelect, onReady, navigation, overlay, waitItems = [], onWait }: {
    mapId: string;
    title: string;
    subtitle: string;
    items: AtlasItem[];
    onSelect: (id: string) => void;
    onReady?: () => void;
    navigation?: Snippet;
    overlay?: Snippet;
    waitItems?: Array<{ label: string; hours: number; smart?: boolean }>;
    onWait?: (hours: number) => void;
  } = $props();
  let viewport: HTMLDivElement;
  let backgroundImage = $state<HTMLImageElement>();
  let atlasHeader: HTMLElement;
  let headerHeight = $state(0);
  let width = $state(860);
  let height = $state(480);
  let listOpen = $state(false);
  // 所有设备统一以 100% 为最小/默认比例；画布自身按视口两轴中较长的一边铺满。
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 1.6;
  const ZOOM_STEP = 0.1;
  const zoomMin = ZOOM_MIN;
  let zoom = $state(ZOOM_MIN);
  const weatherId = $derived(currentWeather(gameState));
  const visual = $derived(atlasVisualFor(mapId, weatherId, gameState.time.hour));
  const backgroundCandidates = $derived(atlasBackgroundCandidatesFor(mapId, weatherId, gameState.time.hour));
  let failedBackgroundsByMap = $state<Record<string, string[]>>({});
  const background = $derived(
    backgroundCandidates.find(url => !failedBackgroundsByMap[mapId]?.includes(url)),
  );
  // 新夜图损坏而回退到日图时，恢复时段滤镜，避免夜间画布突然变成白昼。
  const backgroundNativeLighting = $derived(
    visual.nativeLighting && !(visual.assetSource === "development" && background !== visual.url),
  );
  const atmosphere = $derived(districtAtmosphere(mapId, gameState.time.hour, weatherId, true, backgroundNativeLighting));
  const timeLabel = $derived(
    visual.time === "day" ? "日间" : visual.time === "dusk" ? "黄昏" : visual.time === "night" ? "夜晚" : "深夜",
  );
  const hasBackground = $derived(!!background);
  // Keep the entire picture and its markers on one plane. Narrow screens pan instead of cropping the image alone.
  // Give the panorama a small overscan ring. This removes the dark side bars
  // caused by fitting the image to a short viewport while keeping landmarks
  // and their normalized anchors on the same plane.
  const MAP_ASPECT_RATIO = 1672 / 941;
  const MAP_OVERSCAN = 1.08;
  const baseBoardWidth = $derived(
    Math.max(
      mapId === "downtown_center" ? 1100 : 860,
      Math.max(width, height * MAP_ASPECT_RATIO),
    ) * MAP_OVERSCAN,
  );
  const boardWidth = $derived(baseBoardWidth * zoom);
  const time = $derived(formatTime(gameState.time.hour, gameState.time.minute));
  let drag: { id: number; x: number; y: number; left: number; top: number; captured: boolean; moved: boolean } | undefined;
  let layoutMapId = "";
  // The initial value is the component's configured default; keeping it literal avoids
  // capturing a reactive value during component initialization.
  let lastZoom = ZOOM_MIN;
  const homeItem = $derived(items.find(item => item.home));
  const developmentAtlas = $derived(mapId === "development" || mapId.startsWith("development_") || mapId === "boyue" || mapId.startsWith("boyue_"));
  const civicAtlas = $derived(mapId === "downtown_center" || mapId === "downtown_commercial"||mapId.startsWith('campus_'));
  function focusHome(): void {
    const anchor = homeItem && mapAnchor(mapId, homeItem.id);
    if (!anchor || !viewport) return;
    viewport.scrollLeft = Math.max(0, boardWidth * anchor.x / 100 - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, boardWidth / MAP_ASPECT_RATIO * anchor.y / 100 - viewport.clientHeight * 0.65);
  }

  $effect(() => {
    const el = viewport;
    const headerEl = atlasHeader;
    const observer = new ResizeObserver(() => {
      width = el.clientWidth;
      height = el.clientHeight;
      headerHeight = headerEl?.clientHeight ?? 0;
    });
    observer.observe(el);
    if (headerEl) {
      headerHeight = headerEl.clientHeight;
      observer.observe(headerEl);
    }
    return () => observer.disconnect();
  });

  // 初次进入地图居中；缩放时按当前视口中心调整滚动位置，避免地图跳回左上角。
  $effect(() => {
    const id = mapId;
    const currentZoom = zoom;
    void boardWidth;
    void width;
    void height;
    const frame = requestAnimationFrame(() => {
      if (!viewport) return;
      if (layoutMapId !== id) {
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        // Enter from the top: scene transitions resize the viewport for several
        // frames, so centering vertically here can leave its first row clipped.
        viewport.scrollTop = 0;
        focusHome();
        layoutMapId = id;
      } else if (currentZoom !== lastZoom) {
        const factor = currentZoom / lastZoom;
        viewport.scrollLeft = Math.max(0, (viewport.scrollLeft + viewport.clientWidth / 2) * factor - viewport.clientWidth / 2);
        viewport.scrollTop = Math.max(0, (viewport.scrollTop + viewport.clientHeight / 2) * factor - viewport.clientHeight / 2);
      }
      lastZoom = currentZoom;
    });
    return () => cancelAnimationFrame(frame);
  });

  // Readiness belongs to this exact map and image. Loading is complete only
  // after decoding and the first usable layout, including cached images and
  // the existing list/background fallback when every candidate has failed.
  $effect(() => {
    const id = mapId;
    const url = background;
    const image = backgroundImage;
    const el = viewport;
    const callback = onReady;
    let active = true;
    let decoded = !url;
    let decoding = false;
    let delivered = false;
    let frame: number | undefined;
    const current = () => active && mapId === id && background === url;
    const schedule = () => {
      if (!current() || delivered || frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (!current() || delivered || !decoded || !el.clientWidth || !el.clientHeight) return;
        if (layoutMapId !== id) { schedule(); return; }
        delivered = true;
        callback?.();
      });
    };
    const failed = () => {
      if (current()) markBackgroundFailed(url, id);
    };
    const loaded = async () => {
      if (!current() || decoding || !image || !url) return;
      if (!image.naturalWidth) { failed(); return; }
      decoding = true;
      try {
        if (typeof image.decode === "function") await image.decode();
        if (!current()) return;
        decoded = true;
        schedule();
      } catch {
        failed();
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    if (url && image) {
      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
      if (image.complete) void loaded();
    } else if (!url) {
      schedule();
    }
    return () => {
      active = false;
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      image?.removeEventListener("load", loaded);
      image?.removeEventListener("error", failed);
    };
  });

  function setZoom(value: number): void {
    zoom = Math.max(zoomMin, Math.min(ZOOM_MAX, Math.round(value * 10) / 10));
  }
  function markBackgroundFailed(url: string | undefined, id = mapId): void {
    if (!url) return;
    const failed = failedBackgroundsByMap[id] ?? [];
    if (failed.includes(url)) return;
    failedBackgroundsByMap = { ...failedBackgroundsByMap, [id]: [...failed, url] };
  }
  function adjustZoom(delta: number): void { setZoom(zoom + delta); }
  function onWheel(event: WheelEvent): void {
    // 滚轮负责缩放，地图本身通过拖动平移，触控板也能稳定使用。
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  function startPan(event: PointerEvent): void {
    // Let touch input use the browser's native overflow scrolling. Custom
    // pointer panning is retained for mouse users on desktop.
    if (event.pointerType !== "mouse") return;
    const target = event.target;
    if (drag || (event.pointerType === "mouse" && event.button !== 0) || !(target instanceof Element) || target.closest("button")) return;
    // Delay pointer capture until an actual drag begins. A tap on the map then
    // remains a tap, and the header/return controls never share a captured pointer.
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, captured: false, moved: false };
  }
  function pan(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      try {
        viewport.setPointerCapture(event.pointerId);
        drag.captured = viewport.hasPointerCapture(event.pointerId);
      } catch {
        // Window-level pointer listeners below keep panning usable when a WebView
        // does not support capture for a specific pointer type.
      }
    }
    // client coordinates include the game's UI zoom; scrollLeft/Top use CSS pixels.
    const scale = viewport.getBoundingClientRect().width / viewport.clientWidth || 1;
    viewport.scrollLeft = drag.left - dx / scale;
    viewport.scrollTop = drag.top - dy / scale;
  }
  function stopPan(event?: PointerEvent): void {
    if (!drag || (event && drag.id !== event.pointerId)) return;
    const active = drag;
    drag = undefined;
    if (active.captured && viewport?.hasPointerCapture(active.id)) {
      try { viewport.releasePointerCapture(active.id); } catch { /* pointer already released */ }
    }
  }
  onDestroy(() => stopPan());
</script>

<svelte:window onpointermove={pan} onpointerup={stopPan} onpointercancel={stopPan} />

<section class="atlas" class:development-atlas={developmentAtlas} class:civic-atlas={civicAtlas} style:--atlas-header-height={`${headerHeight}px`} aria-label={`${title}全景地图`}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable region needs a tab stop for keyboard panning.) -->
  <div class="map-viewport" bind:this={viewport} tabindex="0" role="region" aria-label="可滚动地图，点击地点标牌前往，也可打开地点列表"
    onpointerdown={startPan} onpointerup={stopPan} onpointercancel={stopPan} onlostpointercapture={stopPan} onwheel={onWheel}>
    <div class="map-board" style:--district-filter={atmosphere.filter} style:width={`${boardWidth}px`} data-map-id={mapId} data-atlas-level={atlasLevelOf(mapId)} data-period={visual.time} data-weather={visual.weather} data-weather-detail={visual.weatherId} data-asset-source={visual.assetSource} data-native-lighting={backgroundNativeLighting ? "true" : "false"}>
      {#if background}<img class="map-image" bind:this={backgroundImage} src={background} alt="" draggable="false" />{/if}
      <div class="map-shade" aria-hidden="true"></div>
      {#each items as item, index (item.id)}
        {@const anchor = mapAnchor(mapId, item.id, index)}
        {@const disabled = !!item.locked || item.status === "closed" || item.status === "locked"}
        {#if anchor}
        <button class="map-pin" class:locked={disabled} class:early={item.status === "early"} class:current={item.current} class:home={item.home} class:shortcut={item.shortcut} class:cross-region={item.crossRegion}
          class:edge-left={(developmentAtlas || civicAtlas) && anchor.x <= 10} class:edge-right={(developmentAtlas || civicAtlas || (mapId === "downtown" && item.id === "development")) && anchor.x >= 90} class:edge-top={developmentAtlas && anchor.y <= 15}
          data-location-id={item.id} style:left={`${anchor.x}%`} style:top={`${anchor.y}%`}
          disabled={disabled} onclick={() => onSelect(item.id)}
          title={[item.name, item.badge, item.description, item.disabledReason, item.schedule, item.hint].filter(Boolean).join(" · ")}>
          <span class="pin-heading"><MapSymbol id={item.home ? "home" : item.id} /><strong class="pin-name">{item.name}</strong></span>
          {#if item.detail}<span class="pin-detail">{item.detail}</span>{/if}
          {#if item.badge}<span class="pin-badge">{item.badge}</span>{/if}
          {#if item.disabledReason}<span class="pin-hint pin-disabled-reason">{item.disabledReason}</span>{/if}
          {#if (item.pinHint ?? item.hint) && (item.pinHint ?? item.hint) !== item.disabledReason}<span class="pin-hint">{item.pinHint ?? item.hint}</span>{/if}
          {#if item.schedule}<span class="pin-schedule">{item.schedule}</span>{/if}
          <span class="pin-dot" aria-hidden="true"></span>
        </button>
        {/if}
      {/each}
    </div>
    {#if overlay}
      <div class="map-overlay">{@render overlay()}</div>
    {/if}
  </div>

  <header class="atlas-header" bind:this={atlasHeader}>
    <div class="atlas-heading"><span class="eyebrow">都市生活 · 城市漫游</span><h2>{title}</h2><p>{subtitle}</p></div>
    <div class="atlas-tools">
      {#if navigation}<div class="atlas-navigation">{@render navigation()}</div>{/if}
      <span class="atlas-time">{time} · {WEATHER_LABEL[weatherId]} · {timeLabel}</span>
      <div class="zoom-tools" aria-label="地图缩放">
        <button class="zoom-button" aria-label="缩小地图" disabled={zoom <= zoomMin} onclick={() => adjustZoom(-ZOOM_STEP)}>−</button>
        <span class="zoom-value">{Math.round(zoom * 100)}%</span>
        <button class="zoom-button" aria-label="放大地图" disabled={zoom >= ZOOM_MAX} onclick={() => adjustZoom(ZOOM_STEP)}>＋</button>
        <button class="zoom-reset" onclick={() => setZoom(1)}>重置</button>
      </div>
      <button class="list-toggle" aria-expanded={listOpen} onclick={() => listOpen = !listOpen}>{listOpen ? "收起列表" : "地点列表"}</button>
      {#if homeItem}<button class="list-toggle" onclick={focusHome}>定位住处</button>{/if}
    </div>
  </header>

  {#if listOpen || !hasBackground}
    <nav class="atlas-list" aria-label={`${title}地点列表`}>
      {#each items as item (item.id)}
        {@const disabled = !!item.locked || item.status === "closed" || item.status === "locked"}
        <button class="list-item" class:home={item.home} class:cross-region={item.crossRegion} disabled={disabled} onclick={() => onSelect(item.id)}>
          <MapSymbol id={item.home ? "home" : item.id} /><span><strong>{item.name}{#if item.badge}<em>{item.badge}</em>{/if}</strong><small>{item.detail || item.description}</small>{#if item.disabledReason}<small class="list-hint">{item.disabledReason}</small>{:else if item.hint}<small class="list-hint">{item.hint}</small>{/if}{#if item.schedule}<small class="list-schedule">{item.schedule}</small>{/if}</span><span aria-hidden="true">›</span>
        </button>
      {/each}
    </nav>
  {/if}
  {#if waitItems.length > 0 && onWait}
    <div class="atlas-wait" aria-label="在街上等待">
      <span>⏳ 在街上等一会儿</span>
      {#each waitItems as item}
        <button class:smart={item.smart} onclick={() => onWait?.(item.hours)}>{item.label}</button>
      {/each}
    </div>
  {/if}
  <div class="atlas-caption" aria-hidden="true"><span class="caption-rule"></span>点击标牌前往<span class="caption-sep">/</span>滑动或拖动查看全景</div>
</section>

<style>
  .atlas { position:relative; display:flex; flex-direction:column; isolation:isolate; flex:1; min-height:300px; width:100%; overflow:hidden; border:1px solid rgba(223,216,184,.3); border-radius:12px; background:#202925; color:#fff4d3; box-shadow:0 12px 32px #0004; container-type:inline-size; }
  .map-viewport { position:relative; z-index:0; flex:1; min-height:0; min-width:0; overflow:auto; scrollbar-width:none; -ms-overflow-style:none; cursor:grab; overscroll-behavior:contain; touch-action:pan-x pan-y; display:block; }
  .map-viewport::-webkit-scrollbar { display:none; width:0; height:0; }
  .map-viewport:active { cursor:grabbing; }
  .map-viewport:focus-visible { outline:2px solid #e9d395; outline-offset:-3px; }
  .map-board { position:absolute; top:0; left:0; aspect-ratio:1672 / 941; user-select:none; margin:0; /* 脱离滚动视口布局流，放大画布不会反向撑高手机页面 */ }
  .map-image,.map-shade { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  .map-image { z-index:0; object-fit:fill; }
  /* 天气与时段由实际底图表达，仅保留标牌阅读所需的静态暗纱。 */
  .map-shade { z-index:2; background:linear-gradient(180deg,#0a15222b,transparent 30%,#07111917 80%,#07111966); }
  /* 地图快捷入口固定在画布边缘，不随底图缩放/平移；具体按钮自行声明可点击。 */
  .map-overlay { position:absolute; z-index:5; inset:0; pointer-events:none; }
  .atlas-header { position:absolute; inset:0 0 auto; order:-1; z-index:6; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:16px 20px 26px; background:transparent; border-bottom:0; pointer-events:none; }
  .atlas-header > * { pointer-events:auto; }
  /* 所有地图共用透明悬浮工具栏；开发区也不能再占用地图画布高度。 */
  .development-atlas .atlas-header { position:absolute; inset:0 0 auto; flex:0 0 auto; padding:12px 16px; background:transparent; border-bottom:0; }
  .development-atlas .atlas-heading { flex:1; }
  .development-atlas .atlas-tools { flex-shrink:1; min-width:0; }
  .atlas-heading { min-width:0; pointer-events:none; }
  .eyebrow { font-size:10px; letter-spacing:3px; color:#eee2bac7; }
  h2 { font-size:28px; font-weight:800; letter-spacing:3px; margin:5px 0; color:#fff4d3; text-shadow:0 2px 5px #0009; }
  p { margin:0; font-size:12px; line-height:1.6; color:#eeead6c7; }
  .atlas-tools { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:8px; flex-shrink:0; max-width:52%; }
  .atlas-tools button,.atlas-navigation { pointer-events:auto; }
  .atlas-navigation { flex:0 1 auto; min-width:0; max-width:100%; overflow-x:auto; scrollbar-width:none; }
  .atlas-navigation::-webkit-scrollbar { display:none; }
  .atlas-time { font-size:11px; letter-spacing:1px; color:#e3d7b7; }
  .zoom-tools { display:flex; align-items:center; gap:4px; pointer-events:auto; }
  .zoom-button,.zoom-reset { color:#fff0c9; background:#252a25cc; border:1px solid #d3c39a66; border-radius:5px; min-height:44px; padding:6px 10px; font:inherit; font-size:12px; cursor:pointer; }
  .zoom-button { width:38px; font-size:18px; line-height:1; }
  .zoom-value { min-width:46px; text-align:center; font-size:11px; color:#e3d7b7; }
  .zoom-button:hover:not(:disabled),.zoom-reset:hover { background:#d3c39a22; }
  .zoom-button:disabled { opacity:.35; cursor:not-allowed; }
  .list-toggle { color:#fff0c9; background:#252a25cc; border:1px solid #d3c39a66; border-radius:5px; min-height:44px; padding:6px 12px; font:inherit; font-size:12px; cursor:pointer; }
  .map-pin { position:absolute; transform:translate(var(--pin-align-x,-50%),calc(-100% - 14px)); z-index:4; padding:8px 13px; min-height:44px; max-width:220px; border:1px solid #ded0a49e; border-radius:4px; background:linear-gradient(135deg,#494734ed,#252c26e8); color:#fff1c6; text-shadow:0 1px 3px #0009; box-shadow:0 3px 12px #0007,inset 0 1px #ffffff12; backdrop-filter:blur(5px); font:inherit; text-align:left; cursor:pointer; transition:background var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out); }
  .map-pin.cross-region { border:2px solid #79cfe5; background:repeating-linear-gradient(135deg,#7fd7ef18 0 2px,transparent 2px 9px),linear-gradient(135deg,#263f4aef,#17272eea); box-shadow:0 0 0 2px #10232c99,0 4px 16px #0009,inset 0 0 0 1px #d3f5ff33; }
  .map-pin.cross-region::after { background:#91e0f4; }
  .map-pin::after { content:""; position:absolute; left:50%; top:100%; height:14px; width:1px; background:#eee0b5b3; }
  .civic-atlas .map-pin{transform:translate(var(--pin-align-x,-50%),-50%)}
  .civic-atlas .map-pin::after,.civic-atlas .map-pin .pin-dot{display:none}
  .pin-heading { display:flex; align-items:center; gap:8px; white-space:nowrap; font-size:19px; letter-spacing:1px; font-weight:550; }
  .civic-atlas .map-pin { width:max-content; padding:7px 10px; max-width:172px; border-radius:7px; }
  .civic-atlas .pin-heading { font-size:15px; gap:5px; }
  .civic-atlas .pin-detail,.civic-atlas .pin-schedule,.civic-atlas .pin-hint:not(.pin-disabled-reason) { display:none; }
  .civic-atlas .pin-disabled-reason { font-size:10px; max-width:154px; }
  .pin-name { display:block; min-width:0; color:inherit; font-size:1.04em; font-weight:800; letter-spacing:.02em; white-space:normal; overflow-wrap:anywhere; line-height:1.25; }
  .pin-heading :global(svg) { flex-shrink:0; }
  .pin-detail { display:block; margin-top:4px; font-size:12px; line-height:1.45; color:#f3e9ceeb; white-space:normal; }
  .pin-badge { display:inline-block; margin-top:5px; padding:2px 6px; border-radius:999px; background:#8bd1b333; color:#bdf5dd; font-size:11px; }
  .pin-hint { display:block; margin-top:4px; font-size:11px; max-width:200px; line-height:1.5; color:#f3e9ced4; }
  .pin-schedule { display:block; margin-top:4px; max-width:200px; font-size:10px; line-height:1.4; color:#d5f0dd; }
  .pin-disabled-reason { color:#ffe0a3; font-weight:700; }
  .pin-dot { position:absolute; top:calc(100% + 11px); left:calc(50% - 3px); width:7px; height:7px; border-radius:50%; background:#f3e1ad; box-shadow:0 0 0 4px #191e1a55; }
  .map-pin.edge-left { --pin-align-x:0%; }
  .map-pin.edge-left::after { left:0; }
  .map-pin.edge-left .pin-dot { left:-3px; }
  .map-pin.edge-right { --pin-align-x:-100%; }
  .map-pin.edge-right::after { left:100%; }
  .map-pin.edge-right .pin-dot { left:calc(100% - 3px); }
  .map-pin.edge-top { transform:translate(var(--pin-align-x,-50%),14px); }
  .map-pin.edge-top::after { top:-14px; }
  .map-pin.edge-top .pin-dot { top:-18px; }
  .development-atlas .map-pin.shortcut { max-width:170px; }
  .map-pin:hover:not(:disabled),.map-pin:focus-visible { z-index:5; background:#675d3cee; box-shadow:0 0 0 2px #eed38d88,0 5px 20px #0008; outline:none; }
  .map-pin.cross-region:hover:not(:disabled),.map-pin.cross-region:focus-visible { background:repeating-linear-gradient(135deg,#91e0f422 0 2px,transparent 2px 8px),linear-gradient(135deg,#315567f5,#203540f2); box-shadow:0 0 0 2px #91e0f477,0 5px 20px #0008; }
  .map-pin.current { border-color:#8bd1b3; color:#bdf5dd; }
  .map-pin.cross-region.current { border-color:#79cfe5; }
  .map-pin.home { border-color:#83d8bd; box-shadow:0 0 0 2px #83d8bd33,0 3px 12px #0007,inset 0 1px #ffffff12; }
  .map-pin.early { border-color:#e5c783; }
  .map-pin.current .pin-dot { background:#9de4c4; }
  .map-pin.locked { color:#cac7bc; background:#282b28e8; border-style:dashed; cursor:not-allowed; }
  .map-pin.locked .pin-dot { background:#a5a294; }
  .map-pin.cross-region.locked { border-color:#76aebe; background:repeating-linear-gradient(135deg,#7fd7ef12 0 2px,transparent 2px 9px),linear-gradient(135deg,#26343aed,#1c262be8); }
  .atlas-caption { pointer-events:none; position:absolute; bottom:14px; left:20px; display:flex; align-items:center; gap:9px; font-size:11px; letter-spacing:1px; color:#eee4c8; text-shadow:0 1px 4px #000; padding:7px 10px; background:#101c20a6; border-radius:3px; }
  .atlas-wait { position:absolute; z-index:6; left:50%; bottom:12px; transform:translateX(-50%); display:flex; align-items:center; gap:6px; padding:7px 10px; border:1px solid #d3c39a55; border-radius:8px; background:#101c20d9; color:#eee4c8; font-size:11px; backdrop-filter:blur(8px); pointer-events:auto; }
  .atlas-wait button { min-height:32px; padding:4px 8px; border:1px solid #d3c39a66; border-radius:6px; background:#252a25cc; color:#fff0c9; font:inherit; cursor:pointer; }
  .atlas-wait button.smart { color:#bdf5dd; border-color:#8bd1b388; }
  .atlas-wait button:hover,.atlas-wait button:focus-visible { background:#d3c39a22; outline:2px solid #e5c783; outline-offset:1px; }
  .caption-rule { width:22px; height:1px; background:#ddc488; }
  .caption-sep { opacity:.4; }
  .atlas-list { position:absolute; top:112px; bottom:54px; right:16px; width:min(320px,calc(100% - 32px)); z-index:4; overflow-y:auto; padding:6px; background:#111e22f2; backdrop-filter:blur(14px); border:1px solid #d3c39a66; border-radius:8px; box-shadow:0 12px 32px #0008; }
  .development-atlas .atlas-list { top:calc(var(--atlas-header-height,112px) + 8px); bottom:12px; }
  .list-item { width:100%; display:flex; align-items:center; gap:12px; padding:12px 10px; min-height:60px; background:transparent; border:0; border-bottom:1px solid #d3c39a22; color:#f0e5c8; font:inherit; text-align:left; cursor:pointer; }
  .list-item.cross-region { border-left:3px solid #79cfe5; padding-left:7px; background:repeating-linear-gradient(135deg,#7fd7ef0d 0 2px,transparent 2px 9px); }
  .list-item > span:first-of-type { flex:1; }
  .list-item strong { display:block; font-size:15px; font-weight:800; letter-spacing:.01em; }
  .list-item strong em { margin-left:6px; padding:2px 5px; border-radius:999px; font-size:10px; font-style:normal; color:#bdf5dd; background:#8bd1b333; }
  .list-item small { display:block; font-size:12px; margin-top:5px; line-height:1.5; color:#e3d9bdd1; }
  .list-item small.list-hint { margin-top:2px; color:#bdf5ddad; }
  .list-item small.list-schedule { margin-top:2px; color:#c7e5d2; }
  .list-item:hover:not(:disabled),.list-toggle:hover { background:#d3c39a22; }
  .list-item:disabled { opacity:.5; cursor:not-allowed; }
  .list-item:focus-visible,.list-toggle:focus-visible,.zoom-button:focus-visible,.zoom-reset:focus-visible { outline:2px solid #e5c783; outline-offset:-2px; }
  @container (max-width:600px) { .atlas-header { padding:6px 8px; gap:4px; flex-wrap:wrap; } .atlas-heading { flex:1 1 100%; } h2 { font-size:20px; } .eyebrow { display:none; } .atlas-heading p { display:block; max-width:100%; font-size:10px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .atlas-tools { width:100%; gap:4px; max-width:100%; flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; scrollbar-width:none; } .atlas-tools::-webkit-scrollbar { display:none; } .atlas-tools > * { flex-shrink:0; } .atlas-tools .atlas-navigation { flex:1 1 auto; min-width:0; } .atlas-time { display:none; } .atlas-caption { left:8px; font-size:11px; } .pin-heading { font-size:17px; gap:6px; } .pin-detail,.pin-hint { font-size:12px; } .pin-schedule { font-size:11px; } }
  @container (max-width:600px) { .development-atlas h2 { font-size:20px; } }
  :global(:root[data-game-mode="mobile"]) .atlas { min-height:0; }
  :global(:root[data-game-mode="mobile"]) .atlas-header { padding:6px 8px; gap:4px; flex-wrap:nowrap; align-items:center; }
  :global(:root[data-game-mode="mobile"]) h2 { font-size:18px; margin:0; }
  :global(:root[data-game-mode="mobile"]) .atlas-heading { flex:0 1 34%; max-width:34%; min-width:0; }
  :global(:root[data-game-mode="mobile"]) .atlas .eyebrow { display:none; }
  :global(:root[data-game-mode="mobile"]) .atlas-heading p { display:block; max-width:min(100%, 48rem); font-size:10px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  :global(:root[data-game-mode="mobile"]) .atlas-tools { flex:0 1 66%; width:auto; max-width:66%; min-width:0; flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; scrollbar-width:none; }
  :global(:root[data-game-mode="mobile"]) .atlas-tools::-webkit-scrollbar { display:none; }
  :global(:root[data-game-mode="mobile"]) .atlas-tools > * { flex-shrink:0; }
  :global(:root[data-game-mode="mobile"]) .atlas-tools .atlas-navigation { flex:1 1 auto; min-width:0; }
  :global(:root[data-game-mode="mobile"]) .atlas-tools .atlas-time { display:none; }
  :global(:root[data-game-mode="mobile"]) .atlas-list { top:90px; }
  @container (max-width:600px) {
    :global(:root[data-game-mode="mobile"]) .atlas-header { flex-wrap:wrap; align-items:flex-start; }
    :global(:root[data-game-mode="mobile"]) .atlas-heading { flex:1 1 100%; width:100%; max-width:100%; }
    :global(:root[data-game-mode="mobile"]) .atlas-tools { flex:0 0 100%; width:100%; max-width:100%; }
  }
  /* 手游下的等待条由 mobile.css 直接隐藏（用户反馈：遮挡地图视野）。 */
</style>
