<script lang="ts">
  import { showToast } from "../../stores/uiStore.svelte";
  import { playSound } from "../../lib/audio";
  import { childrenOf, getRegion } from "../../game/core/regions";
  import { regionTravelPlan } from "../../game/core/actions";
  import { planLabel } from "../../game/core/transit";
  import type { Region } from "../../game/types";
  import { gameState } from "../../stores/gameStore.svelte";

  /** 进入该二级区域的预计通行方案文案（同区则空白） */
  function travelHint(rid: string): string {
    const plan = regionTravelPlan(gameState, rid);
    return plan.mode === "same" ? "" : planLabel(plan);
  }

  /** 区域地图（L2）：子区域网格 */
  let {
    parentRegionId = "downtown",
    onSelect,
  }: {
    parentRegionId?: string;
    onSelect: (regionId: string) => void;
  } = $props();

  const regions = $derived(childrenOf(parentRegionId) as Region[]);
  const parent = $derived(getRegion(parentRegionId));

  function select(r: Region): void {
    if (r.locked) {
      showToast("该区域暂未开放，下次更新推出");
      return;
    }
    playSound("walk");
    onSelect(r.id);
  }
</script>

<div class="region-grid-view hud-scope" style:background={parent?.gradient ?? "linear-gradient(135deg,#1a2440,#2b3a67)"}>
  <div class="head">
    <div class="title">{parent?.icon ?? "🗺️"} {parent?.name ?? "区域"}</div>
    <div class="hint dim">{parent?.desc ?? ""} · 当前 {gameState.time.hour}:00</div>
  </div>

  <div class="grid">
    {#each regions as r (r.id)}
      <button
        class="r-card"
        class:locked={r.locked}
        onclick={() => select(r)}
        disabled={r.locked}
        style:background={r.gradient}
      >
        <span class="r-icon">{r.icon}</span>
        <span class="r-name">{r.name}</span>
        {#if travelHint(r.id)}<span class="r-travel">{travelHint(r.id)}</span>{/if}
        {#if r.locked}<span class="r-badge">🔒 暂未开放</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .region-grid-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
    gap: 16px;
    overflow-y: auto;
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.7);
    /* v0.91：地图文字统一加深色描边 */
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 1px;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .hint {
    font-size: 12.5px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .r-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(6px);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    text-align: center;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .r-card:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  }
  .r-card:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .r-icon {
    font-size: 38px;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  }
  .r-name {
    font-size: 14px;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .r-badge {
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(255, 107, 107, 0.25);
    color: #ff8a8a;
    font-weight: 700;
  }
  .dim {
    color: rgba(255, 255, 255, 0.7);
  }
</style>