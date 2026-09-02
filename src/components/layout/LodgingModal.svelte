<script lang="ts">
  import { fade } from "svelte/transition";
  import { HOUSING, selectLodging, getEffectiveLodging } from "../../game/core/housing";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState } from "../../stores/uiStore.svelte";
  const tiers = HOUSING.nightly;
  const current = $derived(getEffectiveLodging(gameState));

  function choose(id: string): void {
    selectLodging(gameState, id);
    uiState.modal = null;
  }

  function recoveryLabel(r: number): string {
    return `${Math.round(r * 100)}%`;
  }
</script>

<div class="overlay hud-scope" onclick={() => (uiState.modal = null)} transition:fade={{ duration: 150 }}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <div class="modal-title">🛏️ 选择今晚住宿</div>
      <button class="close" onclick={() => (uiState.modal = null)}>✕</button>
    </div>
    <p class="hint">你还没有固定的住处，今晚睡哪？</p>

    <div class="tier-list">
      {#each tiers.filter((t) => !t.hidden) as tier}
        <button
          class="tier-card"
          class:selected={current.id === tier.id}
          onclick={() => choose(tier.id)}
        >
          <div class="tier-top">
            <span class="gi-emoji" style="font-size:32px;line-height:1">{tier.icon}</span>
            <div class="tier-info">
              <div class="tier-name">{tier.name}</div>
              <div class="tier-desc">{tier.desc}</div>
            </div>
            <span class="tier-price" class:free={tier.price === 0}>
              {tier.price === 0 ? "免费" : `¥${tier.price}/晚`}
            </span>
          </div>
          <div class="tier-tags">
            <span class="tag {tier.area === "center" ? "gain" : "info"}">
              {tier.area === "center" ? "🏙️ 市中心" : "🏘️ 住宅区"}
            </span>
            <span class="tag info">恢复 {recoveryLabel(tier.recovery)}</span>
            {#if tier.moodBonus !== 0}
              <span class="tag {tier.moodBonus > 0 ? "gain" : "cost"}">
                心情 {tier.moodBonus > 0 ? `+${tier.moodBonus}` : tier.moodBonus}
              </span>
            {/if}
            {#if tier.facilities.includes("shower")}
              <span class="tag info">🫧 可洗澡</span>
            {/if}
            {#if tier.sideEffects}
              <span class="tag cost">
                {tier.sideEffects.health ? `健康${tier.sideEffects.health} ` : ""}
                {tier.sideEffects.stress ? `压力+${tier.sideEffects.stress} ` : ""}
                {tier.sideEffects.hygiene ? `干净${tier.sideEffects.hygiene}` : ""}
              </span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-title {
    font-size: 17px;
    font-weight: 700;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-dim);
    font-size: 13px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .close:hover { background: rgba(255, 90, 90, 0.2); color: #ff6b6b; }
  .close:active { transform: scale(0.92); }
  .hint {
    font-size: 12.5px;
    color: var(--text-dim);
    margin: 8px 0 14px;
  }
  .tier-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tier-card {
    text-align: left;
    padding: 14px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    transition: all 0.15s ease;
  }
  .tier-card:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .tier-card:active { transform: translateY(0) scale(0.99); }
  .tier-card.selected {
    border-color: var(--accent);
    background: rgba(255, 209, 102, 0.08);
  }
  .tier-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tier-icon {
    font-size: 26px;
  }
  .tier-info {
    flex: 1;
    min-width: 0;
  }
  .tier-name {
    font-size: 14.5px;
    font-weight: 700;
  }
  .tier-desc {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 2px;
  }
  .tier-price {
    font-size: 14px;
    font-weight: 800;
    color: var(--accent);
    white-space: nowrap;
  }
  .tier-price.free {
    color: var(--ok);
  }
  .tier-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
</style>
