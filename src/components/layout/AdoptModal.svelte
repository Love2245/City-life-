<script lang="ts">
  /**
   * v1.33 宠物用品店「领养猫咪」弹窗。
   * 展示全部可领养猫种（按稀有度分组、明码标价），已拥有的显示已养，钱不够的置灰。
   */
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { adoptableCats, CAT_ADOPT_PRICE, adoptCat, hasCat, getCatDef } from "../../game/core/cat";
  import { applyEffects } from "../../game/engine";
  import { formatMoney } from "../../lib/format";
  import { playSound } from "../../lib/audio";

  const RARITY_LABEL: Record<string, string> = {
    common: "普通",
    rare: "稀有",
    super: "超稀有",
    legend: "传说",
  };
  const RARITY_CLS: Record<string, string> = {
    common: "r-common",
    rare: "r-rare",
    super: "r-super",
    legend: "r-legend",
  };
  const RARITY_ORDER = ["common", "rare", "super", "legend"] as const;

  /** 按稀有度排序展示 */
  const cats = $derived(
    adoptableCats().sort((a, b) => {
      const o = (r: string) => RARITY_ORDER.indexOf(r as (typeof RARITY_ORDER)[number]);
      return o(a.rarity) - o(b.rarity);
    }),
  );

  function close(): void {
    uiState.modal = null;
  }

  function priceOf(rarity: string): number {
    return CAT_ADOPT_PRICE[rarity as keyof typeof CAT_ADOPT_PRICE] ?? 0;
  }

  function adopt(catId: string): void {
    const def = getCatDef(catId);
    if (!def) return;
    if (hasCat(gameState, catId)) {
      showToast("🐱 你已经拥有这只猫咪了");
      return;
    }
    const price = priceOf(def.rarity);
    if (gameState.player.money < price) {
      showToast(`🚫 钱不够，领养需要 ${formatMoney(price)}`);
      return;
    }
    applyEffects(gameState, { money: -price });
    const pet = adoptCat(gameState, catId);
    if (!pet) {
      showToast("🚫 领养失败了");
      return;
    }
    playSound("coin");
    const label = RARITY_LABEL[def.rarity] ?? def.rarity;
    showToast(
      gameState.activePet === pet.uid
        ? `🐾 你领养了「${pet.name}」（${label}）！已设为携带`
        : `🐾 你领养了「${pet.name}」（${label}），加入了你的伙伴`,
    );
  }
</script>

<div class="overlay hud-scope" onclick={close} transition:fade={{ duration: 150 }}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <div class="modal-title">🐾 领养猫咪</div>
      <button class="close-btn" onclick={close}>✕</button>
    </div>
    <p class="hint">
      店员热情地介绍：<b>「这里的猫咪都明码标价，看中哪只直接领养带走，保证健康好养！」</b>
      当前余额：<b class="money">{formatMoney(gameState.player.money)}</b>
    </p>

    <div class="cat-list">
      {#each cats as def}
        {@const owned = hasCat(gameState, def.id)}
        {@const price = priceOf(def.rarity)}
        {@const enough = gameState.player.money >= price}
        <div class="cat-card" class:owned>
          <div class="cat-icon">{def.icon}</div>
          <div class="cat-info">
            <div class="cat-name">
              {def.name}
              <span class="rarity {RARITY_CLS[def.rarity]}">{RARITY_LABEL[def.rarity]}</span>
            </div>
            <div class="cat-desc">{def.desc}</div>
          </div>
          {#if owned}
            <button class="adopt-btn owned" disabled>已拥有</button>
          {:else}
            <button
              class="adopt-btn"
              class:disabled={!enough}
              disabled={!enough}
              onclick={() => adopt(def.id)}
            >
              {enough ? `领养 ${formatMoney(price)}` : `差 ${formatMoney(price - gameState.player.money)}`}
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <p class="foot-note dim">💡 街头、公园偶尔也会遇到流浪猫——缘分到了免费带回家。</p>
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
    width: 460px;
    max-width: calc(100vw - 32px);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: popIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
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
  .close-btn {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    color: var(--text-dim);
    width: 26px;
    height: 26px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    transition: all 0.15s ease;
  }
  .close-btn:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .close-btn:active { transform: scale(0.9); }
  .hint {
    font-size: 12.5px;
    color: var(--text-dim);
    line-height: 1.7;
    margin: 8px 0 14px;
  }
  .hint b {
    color: var(--text);
  }
  .money {
    color: #ffd166;
  }
  .cat-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .cat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
  }
  .cat-card.owned {
    opacity: 0.55;
  }
  .cat-icon {
    font-size: 30px;
    line-height: 1;
    flex-shrink: 0;
  }
  .cat-info {
    flex: 1;
    min-width: 0;
  }
  .cat-name {
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rarity {
    font-size: 10.5px;
    padding: 1px 7px;
    border-radius: 999px;
    font-weight: 600;
  }
  .r-common {
    background: rgba(160, 170, 200, 0.2);
    color: #aab3d6;
  }
  .r-rare {
    background: rgba(108, 198, 255, 0.2);
    color: #6cc6ff;
  }
  .r-super {
    background: rgba(216, 132, 255, 0.2);
    color: #d9b3ff;
  }
  .r-legend {
    background: rgba(255, 209, 102, 0.22);
    color: #ffd166;
  }
  .cat-desc {
    font-size: 11.5px;
    color: var(--text-dim);
    line-height: 1.5;
    margin-top: 2px;
  }
  .adopt-btn {
    flex-shrink: 0;
    padding: 7px 12px;
    border-radius: 10px;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .adopt-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .adopt-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }
  .adopt-btn.disabled,
  .adopt-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .adopt-btn.owned {
    opacity: 0.7;
  }
  .foot-note {
    margin-top: 12px;
    font-size: 11.5px;
  }
  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
