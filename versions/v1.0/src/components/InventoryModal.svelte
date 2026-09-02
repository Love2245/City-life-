<script lang="ts">
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { inventoryList, useItem, getItem } from "../game/core/items";
  import {
    equipItem,
    unequipItem,
    isEquipped,
    equippedSummary,
    SLOT_NAMES,
    SLOT_ICONS,
  } from "../game/core/equipment";
  import { playSound } from "../lib/audio";

  const list = $derived(inventoryList(gameState));
  const slots = $derived(equippedSummary(gameState));

  /** 加成字段中文名 */
  const BONUS_LABEL: Record<string, string> = {
    charm: "魅力",
    mood: "心情",
    health: "健康",
    hygiene: "干净度",
    fame: "影响力",
    fitness: "体质",
    intelligence: "智力",
  };

  function close(): void {
    uiState.modal = null;
  }

  function use(itemId: string): void {
    const r = useItem(gameState, itemId);
    if (!r.ok) {
      showToast(r.reason ?? "无法使用");
      return;
    }
    playSound("eat");
  }

  function equip(itemId: string): void {
    const r = equipItem(gameState, itemId);
    if (!r.ok) {
      showToast(r.reason ?? "无法装备");
      return;
    }
    playSound("success");
  }

  function unequip(slot: string): void {
    const r = unequipItem(gameState, slot as Parameters<typeof unequipItem>[1]);
    if (!r.ok) {
      showToast(r.reason ?? "无法卸下");
      return;
    }
  }
</script>

<div class="overlay hud-scope" onclick={close}>
  <div class="bag" onclick={(e) => e.stopPropagation()}>
    <div class="bag-head">
      <div class="bag-title">🎒 背包</div>
      <button class="bag-close" onclick={close}>✕</button>
    </div>

    <!-- v0.95 装备槽位 -->
    <div class="slot-row">
      {#each slots as s}
        <div class="slot" class:filled={!!s.itemId}>
          <span class="slot-icon">{SLOT_ICONS[s.slot]}</span>
          <div class="slot-info">
            <div class="slot-name">{SLOT_NAMES[s.slot]}</div>
            {#if s.itemId}
              <div class="slot-item">{getItem(s.itemId)?.name}</div>
              {#if Object.keys(s.bonus).length > 0}
                <div class="slot-bonus dim">
                  {Object.entries(s.bonus)
                    .map(([k, v]) => `${BONUS_LABEL[k] ?? k} +${v}`)
                    .join(" ")}
                </div>
              {/if}
              <button class="slot-unequip" onclick={() => unequip(s.slot)}>卸下</button>
            {:else}
              <div class="dim slot-empty">未装备</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="bag-grid">
      {#each list as entry (entry.item.id)}
        <div class="bag-item" class:usable={entry.item.consumable} class:equipped={isEquipped(gameState, entry.item.id)}>
          <span class="b-icon">{entry.item.icon}</span>
          <span class="b-name">{entry.displayName}</span>
          <span class="b-qty">×{entry.qty}</span>
          {#if entry.item.consumable}
            <button class="b-use" onclick={() => use(entry.item.id)}>使用</button>
          {:else if entry.item.slot}
            {#if isEquipped(gameState, entry.item.id)}
              <span class="b-tag tag-ok">✅ 已装备</span>
            {:else}
              <button class="b-use b-equip" onclick={() => equip(entry.item.id)}>装备</button>
            {/if}
          {:else}
            <span class="b-tag dim">持有</span>
          {/if}
        </div>
      {/each}
      {#if list.length === 0}
        <div class="empty dim">背包空空如也</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.7);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    animation: fadeIn 0.2s ease;
  }
  .bag {
    width: min(92vw, 460px);
    max-height: 78vh;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 18px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  .bag-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .bag-title {
    font-size: 18px;
    font-weight: 800;
  }
  .bag-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 13px;
    color: var(--text-dim, #9aa3c7);
  }
  .slot-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed rgba(255, 255, 255, 0.15);
  }
  .slot.filled {
    border-style: solid;
    border-color: rgba(255, 209, 102, 0.5);
    background: rgba(255, 209, 102, 0.08);
  }
  .slot-icon {
    font-size: 22px;
    flex-shrink: 0;
  }
  .slot-info {
    min-width: 0;
    flex: 1;
  }
  .slot-name {
    font-size: 10.5px;
    color: var(--text-dim, #9aa3c7);
  }
  .slot-item {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slot-bonus {
    font-size: 10px;
  }
  .slot-unequip {
    margin-top: 2px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 122, 122, 0.15);
    color: #ff8a8a;
    border: 1px solid rgba(255, 122, 122, 0.35);
    font-size: 10.5px;
    cursor: pointer;
  }
  .slot-empty {
    font-size: 11px;
  }
  .bag-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
    overflow-y: auto;
    max-height: 48vh;
  }
  .bag-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 14px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: center;
  }
  .bag-item.equipped {
    border-color: rgba(123, 216, 143, 0.5);
  }
  .b-icon {
    font-size: 30px;
  }
  .b-name {
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.3;
  }
  .b-qty {
    font-size: 11px;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .b-use {
    margin-top: 4px;
    padding: 4px 14px;
    border-radius: 999px;
    background: rgba(123, 216, 143, 0.15);
    color: var(--ok, #7bd88f);
    border: 1px solid rgba(123, 216, 143, 0.35);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .b-use:hover {
    background: rgba(123, 216, 143, 0.3);
  }
  .b-equip {
    background: rgba(255, 209, 102, 0.15);
    color: #ffd166;
    border-color: rgba(255, 209, 102, 0.35);
  }
  .b-equip:hover {
    background: rgba(255, 209, 102, 0.3);
  }
  .b-tag {
    font-size: 10.5px;
    margin-top: 4px;
  }
  .tag-ok {
    color: var(--ok, #7bd88f);
    font-weight: 700;
  }
  .empty {
    padding: 40px;
    text-align: center;
    grid-column: 1 / -1;
    font-size: 14px;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
