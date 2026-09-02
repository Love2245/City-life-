<script lang="ts">
  import { showToast } from "../../stores/uiStore.svelte";
  import { playSound } from "../../lib/audio";
  import { gameState } from "../../stores/gameStore.svelte";
  import { REGIONS } from "../../game/core/regions";
  import { regionTravelPlan } from "../../game/core/actions";
  import { planLabel } from "../../game/core/transit";

  /** 主地图（L1）：动态读取一级区域（无 parent），锁定状态以 regions.json 为准 */
  const districts = $derived(REGIONS.filter((r) => !r.parent));

  /** 进入该一级区域的预计通行方案文案（同区则空白） */
  function travelHint(rid: string): string {
    const plan = regionTravelPlan(gameState, rid);
    return plan.mode === "same" ? "" : planLabel(plan);
  }

  function select(id: string): void {
    const d = districts.find((x) => x.id === id);
    if (!d) return;
    if (d.locked) {
      showToast("该区域暂未开放，下次更新推出");
      return;
    }
    playSound("walk");
    // 由 ScenePanel 提供的 onSelect 改用直接调用 moveTo
    void import("../../game/core/actions").then(({ moveTo }) => {
      const r = moveTo(gameState, id);
      if (!r.ok) showToast(r.reason ?? "无法前往");
    });
  }
</script>

<div class="main-view hud-scope">
  <div class="head">
    <div class="title">🗺️ 城市</div>
    <div class="hint dim">选择想去的地方 · 当前 {gameState.time.hour}:00</div>
  </div>

  <div class="districts">
    {#each districts as d (d.id)}
      <button
        class="district"
        class:locked={d.locked}
        onclick={() => select(d.id)}
        disabled={d.locked}
        style:background={d.gradient}
      >
        <div class="d-icon">{d.icon}</div>
        <div class="d-name">{d.name}</div>
        <div class="d-desc">{d.desc}</div>
        {#if travelHint(d.id)}<div class="d-travel">{travelHint(d.id)}</div>{/if}
        {#if d.locked}<div class="d-badge">🔒 暂未开放</div>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .main-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 20px;
    overflow-y: auto;
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.7);
    /* v0.91：地图文字统一加深色描边，昼夜背景都清晰 */
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
    padding: 8px 0 4px;
  }
  .title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 2px;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }
  .hint {
    font-size: 12.5px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .districts {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
  }
  @media (min-width: 720px) {
    .districts {
      grid-template-columns: 1fr 1fr;
    }
  }
  .district {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 36px 24px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }
  .district:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.45);
  }
  .district:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .d-icon {
    font-size: 56px;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
  }
  .d-name {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 2px;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .d-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.6;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .d-badge {
    margin-top: 6px;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(255, 107, 107, 0.25);
    color: #ff8a8a;
    font-weight: 700;
  }
  .dim {
    color: rgba(255, 255, 255, 0.7);
  }
</style>