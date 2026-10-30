<script lang="ts">
  import { showToast } from "../../stores/uiStore.svelte";
  import { isMobileLayout } from "../../stores/uiStore.svelte";
  import { REGIONS, childrenOf, getRegion, isRegionUnlocked } from "../../game/core/regions";
  import { getLocation, regionTravelPlan, regionAvailabilityAtArrival, isFreeDistrictBorder } from "../../game/core/actions";
  import { planLabel } from "../../game/core/transit";
  import { currentRegion } from "../../game/core/housing";
  import { gameState } from "../../stores/gameStore.svelte";
  import MapAtlas from "./MapAtlas.svelte";
  import type { AtlasItem } from "../../lib/mapAtlas";

  let { parentRegionId = "downtown", onSelect, onReady, breadcrumbs = [], onCrumb,
    showBack = false, showHome = false, onBack, onHome }: {
    parentRegionId?: string;
    onSelect: (regionId: string) => void;
    onReady?: () => void;
    breadcrumbs?: { id: string; label: string; icon: string }[];
    onCrumb?: (index: number) => void;
    showBack?: boolean;
    showHome?: boolean;
    onBack?: () => void;
    onHome?: () => void;
  } = $props();
  const regions = $derived(childrenOf(parentRegionId));
  const parent = $derived(getRegion(parentRegionId));
  const districts = $derived(REGIONS.filter(r => !r.parent && r.id !== parentRegionId
    && !(parentRegionId === "suburb" && r.id === "development")
    && !(parentRegionId === "development" && r.id === "suburb")
    && !(parentRegionId === "suburb" && r.id === "boyue")
    && !(parentRegionId === "boyue" && r.id === "suburb")));
  const integratedMobileChrome = $derived(isMobileLayout() && breadcrumbs.length > 1 && !!onCrumb);
  function entryDetail(id: string): string | undefined {
    if (id === "suburban_edge") return `${getLocation("suburb_bus_station")?.name ?? "紫羊区巴士站"} · ${getLocation("suburb_train_station")?.name ?? "紫羊区火车站"} · 游乐场 · 环湖公园`;
    if (id === "rural") return "农场 · 牧场 · 果园 · 温室";
    if (id === "heavy_industry") return "钢铁厂 · 玻璃厂 · 铝厂 · 工人集体宿舍";
    if (id.startsWith("development_") || id.startsWith("boyue_")) return getRegion(id)?.desc;
    return undefined;
  }
  const markers: AtlasItem[] = $derived([...regions.map(r => {
    const plan = regionTravelPlan(gameState, r.id);
    const availability = regionAvailabilityAtArrival(gameState, r.id);
    const locked = !availability.unlocked;
    const detail = entryDetail(r.id);
    const home = currentRegion(gameState) === r.id;
    return { id: r.id, name: r.name, description: detail ?? r.desc, detail, locked, current: plan.mode === "same",
      home, badge: home ? "家在这里" : undefined,
      hint: locked ? availability.reason : home ? "你住在这里 · 查看区域" : plan.mode === "same" ? "当前所在 · 查看地点" : planLabel(plan) };
  }), ...(!parent?.parent ? districts.map(d => {
    const plan = regionTravelPlan(gameState, d.id);
    const locked = !isRegionUnlocked(gameState, d) || !!plan.requiresTicket;
    const freeBorder = isFreeDistrictBorder(gameState, d.id);
    const expandedDevelopmentHint = d.id === "development" && parentRegionId !== "boyue"
      && !locked && !freeBorder && !plan.requiresTicket && plan.mode !== "same";
    return {
      id: d.id, name: d.name, locked, shortcut: true, crossRegion: true,
      hint: freeBorder ? "道路相连 · 免费 · 即刻到达" : plan.requiresTicket ? "需要私人载具 · 或到车站购票" : plan.mode === "same" ? "当前所在 · 查看区域" : expandedDevelopmentHint ? planLabel(plan) + "；树堰—伯月巴士直达 8 元 / 45 分钟" : planLabel(plan),
      pinHint: expandedDevelopmentHint ? planLabel(plan) : undefined,
      description: d.desc,
    };
  }) : [])]);

  function select(id: string): void {
    if (districts.some(d => d.id === id)) {
      const plan = regionTravelPlan(gameState, id);
      if (plan.requiresTicket) {
        showToast("需要汽车、电动车或三轮车才能自行跨区；也可以先到对应车站购票");
        return;
      }
      onSelect(id);
      return;
    }
    const r = regions.find(r => r.id === id);
    if (!r) return;
    const availability = regionAvailabilityAtArrival(gameState, r.id);
    if (!availability.unlocked) {
      showToast(availability.reason);
      return;
    }
    onSelect(r.id);
  }

</script>

<div class="region-grid-view hud-scope scene-atlas">
  <MapAtlas mapId={parentRegionId} title={parent?.name ?? "区域地图"} subtitle={parent?.desc ?? "选择目的地，继续探索城市"} items={markers} onSelect={select} {onReady}>
    {#snippet navigation()}
      {#if integratedMobileChrome}
        <div class="integrated-topline">
          <nav class="integrated-breadcrumbs" aria-label="地图路径">
            {#each breadcrumbs as crumb, index (crumb.id)}
              <button class="atlas-crumb" class:last={index === breadcrumbs.length - 1} onclick={() => onCrumb?.(index)}>{crumb.label}</button>
            {/each}
          </nav>
          <div class="integrated-title-nav" aria-label="区域导航">
            {#if showBack && onBack}<button class="atlas-crumb" onclick={onBack}>← 返回</button>{/if}
            {#if showHome && onHome}<button class="atlas-crumb" onclick={onHome}>{getRegion("downtown")?.name ?? "树堰区"}</button>{/if}
          </div>
        </div>
      {/if}
    {/snippet}
  </MapAtlas>
</div>

<style>
  .region-grid-view.scene-atlas { position:relative; flex:1; min-height:0; width:100%; display:flex !important; flex-direction:column; padding:0 !important; gap:0 !important; overflow:hidden; background:transparent; }
  .scene-atlas .integrated-topline { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:5px; height:auto !important; min-height:44px; }
  .integrated-breadcrumbs,.integrated-title-nav { display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
  .atlas-crumb { color:#e7dab5; border:1px solid #d3c39a55; border-radius:4px; background:#18231ee0; min-height:44px; padding:4px 8px; white-space:nowrap; cursor:pointer; font:inherit; font-size:12px; font-weight:750; }
  .atlas-crumb.last { color:#bdf5dd; border-color:#8bd1b366; }
  .atlas-crumb:hover { background:#514c39; }
  .atlas-crumb:focus-visible { outline:2px solid #e5c783; }
</style>
