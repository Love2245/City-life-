<script lang="ts">
  import { showToast, uiState } from "../../stores/uiStore.svelte";
  import { childrenOf, getRegion,isRegionUnlocked,regionLockReason } from "../../game/core/regions";
  import {gameState} from '../../stores/gameStore.svelte';
  import { type WaitOption } from "../../game/core/actions";
  import MapAtlas from "./MapAtlas.svelte";
  type MapItem = {
    id: string;
    name: string;
    icon: string;
    locked: boolean;
    closed: boolean;
    gradient: string;
    /** 预计通行时间（小时） */
    travelHours: number;
    travelText?: string;
    schedule?: string;
    /** v0.935 还没开门（区别于已打烊） */
    notYetOpen?: boolean;
    /** v0.935 允许提前到达候场（开门前 2h 内） */
    early?: boolean;
    /** v0.935 打烊/未开门的说明文案 */
    closedText?: string;
  };
  type BreadcrumbItem = { id: string; label: string; icon: string };

  let {
    regionId,
    items,
    onSelect,
    onReady,
    showBack = false,
    showHome = false,
    onBack,
    onHome,
    breadcrumbs = [],
    onCrumb,
    waitItems = [],
    onWait,
  }: {
    regionId: string;
    items: MapItem[];
    onSelect: (id: string) => void;
    onReady?: () => void;
    showBack?: boolean;
    showHome?: boolean;
    onBack?: () => void;
    onHome?: () => void;
    breadcrumbs?: BreadcrumbItem[];
    onCrumb?: (index: number) => void;
    waitItems?: WaitOption[];
    onWait?: (hours: number) => void;
  } = $props();

  const region = $derived(getRegion(regionId));
  const homeLabel = $derived(
    region?.parent ? `🗺️ 回${getRegion(region.parent)?.name ?? "上一级"}` : "🗺️ 回主地图",
  );
  // v1.3b5：玻璃强度扩为 4 档（low=最透 / medium=轻玻璃 / high=平衡 / dark=深蓝近实色）。
  // 直接给出完整渐变背景，绑定到 style:background；「低」为最透，解决「玻璃不透光」反馈。
  const GLASS_BG: Record<string, string> = {
    low: "linear-gradient(145deg, rgba(15,25,48,0.14), rgba(5,10,24,0.06))",
    medium: "linear-gradient(145deg, rgba(15,25,48,0.20), rgba(5,10,24,0.12))",
    high: "linear-gradient(145deg, rgba(15,25,48,0.38), rgba(5,10,24,0.30))",
    dark: "linear-gradient(145deg, rgba(8,12,26,0.82), rgba(3,6,16,0.76))",
  };
  const glassBg = $derived(GLASS_BG[uiState.mapGlass] ?? GLASS_BG.low);

  function click(item: MapItem): void {
    if (item.locked) {
      // 与悬停 hint 同源：锁定地点各有真实门禁原因（任务未解锁/时间未到），
      // 硬编码"暂未开放，下次更新推出"会误导玩家去等更新。
      showToast(item.closedText ?? "暂未开放，下次更新推出");
      return;
    }
    // v0.935：开门前 2h 内允许提前过去候场，其余情况才拦
    if (item.closed && !item.early) {
      showToast(item.closedText ?? "已打烊");
      return;
    }
    onSelect(item.id);
  }
  const portals = $derived([
    ...childrenOf(regionId).map((child) => ({ id: child.id, name: child.id === "mall_interior" ? "商场主入口" : child.name, description: child.desc, hint: !isRegionUnlocked(gameState,child)?regionLockReason(gameState,child):child.id === "downtown_commercial" ? "沿图书馆北侧前往" : `进入${child.name}`,status:!isRegionUnlocked(gameState,child)?'locked' as const:'open' as const,disabledReason:!isRegionUnlocked(gameState,child)?regionLockReason(gameState,child):undefined })),
    ...(regionId.startsWith('campus_')?[{id:region!.parent!,name:'返回大学城',description:'沿校门返回大学城',hint:'大学城方向'}]:[]),
    ...(regionId === "mall_interior" ? [{ id: "downtown_mall", name: "商场出口", description: "返回商场外街区", hint: "走出商场" }] : []),
    ...(regionId === "downtown_commercial" ? [{ id: "downtown_center", name: "返回市中心", description: "沿图书馆前的道路返回市中心", hint: "图书馆方向" }] : []),
  ]);
  const atlasItems = $derived([...portals, ...items.map((item) => ({
    ...item,
    // 锁定标牌突出显示门禁原因，不再用“即刻到达”覆盖它；锁定地点也不显示营业时间。
    hint: item.locked ? item.closedText : item.travelText,
    schedule: item.locked ? undefined : item.schedule,
    status: item.locked ? "locked" as const : item.closed && !item.early ? "closed" as const : item.early ? "early" as const : "open" as const,
    disabledReason: item.closedText,
  }))]);
  function clickById(id: string): void {
    if (portals.some((portal) => portal.id === id)) {
      onSelect(id);
      return;
    }
    const item = items.find((candidate) => candidate.id === id);
    if (item) click(item);
  }
</script>

<div class="region-view hud-scope" style:background={glassBg}>
  <MapAtlas mapId={regionId} title={region?.name ?? "区域"} subtitle={region?.desc ?? "选择目的地"} items={atlasItems} onSelect={clickById} {onReady} waitItems={waitItems} onWait={onWait}>
    {#snippet navigation()}
      <nav class="city-atlas-navigation" aria-label="地图路径">
        {#each breadcrumbs as crumb, index}
          <button class:last={index === breadcrumbs.length - 1} onclick={() => onCrumb?.(index)}>{crumb.icon} {crumb.label}</button>
        {/each}
        {#if showBack && onBack}<button onclick={onBack}>← 返回上一级</button>{/if}
        {#if showHome && onHome}<button onclick={onHome}>{homeLabel}</button>{/if}
      </nav>
    {/snippet}
  </MapAtlas>
</div>

<style>
  .city-atlas-navigation { display:flex; justify-content:flex-start; flex-wrap:nowrap; gap:5px; width:max-content; min-width:100%; }
  .city-atlas-navigation button { min-height:36px; padding:5px 9px; border:1px solid #d3c39a66; border-radius:6px; background:#18231ee0; color:#fff0c9; font:inherit; font-size:11px; cursor:pointer; }
  .city-atlas-navigation button.last { color:#bdf5dd; border-color:#8bd1b366; }
  .city-atlas-navigation button:hover,.city-atlas-navigation button:focus-visible { background:#514c39; outline:2px solid #e5c783; outline-offset:1px; }
  .region-view {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
    gap: 16px;
    overflow-y: auto;
    color: #eef1ff;
    /* 背景由 style:background 内联注入（4 档玻璃，见 glassBg） */
    backdrop-filter: blur(10px) saturate(1.08);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    /* v0.91：地图文字统一加深色描边 */
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
  }
</style>
