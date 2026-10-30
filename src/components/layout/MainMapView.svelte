<script lang="ts">
  import {beginTravelLoading} from '../../stores/sceneLoadingRoute.svelte';
  import { showToast } from "../../stores/uiStore.svelte";
  import { playSound } from "../../lib/audio";
  import { gameState } from "../../stores/gameStore.svelte";
  import { REGIONS, isRegionUnlocked } from "../../game/core/regions";
  import { regionTravelPlan, travelToRegion } from "../../game/core/actions";
  import { planLabel } from "../../game/core/transit";
  import MapAtlas from "./MapAtlas.svelte";

  const districts = $derived(REGIONS.filter((r) => !r.parent));
  const markers = $derived(districts.map(d => {
    const plan = regionTravelPlan(gameState, d.id);
    const locked = !isRegionUnlocked(gameState, d);
    return { id: d.id, name: d.name, description: d.desc, locked, current: plan.mode === "same", crossRegion: true,
      hint: locked ? (d.unlockFlag ? "路线尚未解锁" : "暂未开放") : plan.mode === "same" ? "当前所在 · 查看区域" : planLabel(plan) };
  }));

  function select(id: string): void {
    const d = districts.find((x) => x.id === id);
    if (!d) return;
    if (!isRegionUnlocked(gameState, d)) {
      showToast(d.unlockFlag ? "路线尚未解锁：先在劳务公司办理城市通行证" : "该区域暂未开放，下次更新推出");
      return;
    }
    const plan = regionTravelPlan(gameState, id);
    const r = travelToRegion(gameState, id);
    if (!r.ok) { showToast(r.reason ?? "无法前往"); return; }
    playSound("walk");
    if (plan.mode !== "same") {
      beginTravelLoading();
    }
  }
</script>

<div class="main-view hud-scope scene-atlas">
  <MapAtlas mapId="main" title="城市地图" subtitle="树堰区、紫羊区、伯月新区与泊月区" items={markers} onSelect={select} />
</div>

<style>
  .main-view.scene-atlas { position:relative; flex:1; min-height:0; width:100%; display:flex !important; flex-direction:column; padding:0 !important; gap:0 !important; overflow:hidden; }
</style>
