<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast, closeModal } from "../../stores/uiStore.svelte";
  import {
    VISIBLE_CLOTHING_SLOTS,
    equippedClothing,
    clothingItemsForSlot,
    outfitCatalogFor,
    ensureWardrobeDefaults,
    type ClothingSlot,
  } from "../../game/core/clothing";
  import { playerOutfitSet } from "../../game/core/playerOutfitSets";
  import { itemCount } from "../../game/core/items";
  import { storedItems } from "../../game/core/storage";
  import { equipItem, unequipItem } from "../../game/core/equipment";
  import { playerPortraitForReply } from "../../game/core/npcPortraits";
  import { clothingOccasionTags } from "../../game/core/playerOutfitResolver";
  import PortraitStack from "./PortraitStack.svelte";

  ensureWardrobeDefaults(gameState);

  const SLOT_LABELS: Record<ClothingSlot, string> = {
    hat: "帽子",
    clothes: "整套服装",
    underlayer: "内搭",
    pants: "裤子",
  };
  const SLOT_ICONS: Record<ClothingSlot, string> = {
    hat: "🧢",
    clothes: "👕",
    underlayer: "👚",
    pants: "👖",
  };

  const current = $derived(equippedClothing(gameState));
  const preview = $derived(playerPortraitForReply(undefined, current));
  const accessories = $derived(storedItems(gameState, "wardrobe").filter(({ item }) => item.slot === "accessory"));

  function close(): void {
    closeModal();
  }

  function ownedItems(slot: ClothingSlot) {
    return (slot === "clothes" ? outfitCatalogFor(gameState) : clothingItemsForSlot(slot)).filter((item) => itemCount(gameState, item.id) > 0);
  }

  function putOn(itemId: string): void {
    const result = equipItem(gameState, itemId);
    if (!result.ok) {
      showToast(result.reason ?? "无法穿戴这件服装");
      return;
    }
    showToast("穿搭已更新");
  }

  function takeOffHat(): void {
    const result = unequipItem(gameState, "hat");
    if (!result.ok) {
      showToast(result.reason ?? "当前没有戴帽子");
      return;
    }
    showToast("已摘下帽子");
  }

  function clothingName(slot: ClothingSlot, itemId: string | undefined, fallback: string): string {
    if (!itemId) return fallback;
    if (slot === "clothes") return playerOutfitSet(itemId)?.name ?? fallback;
    return clothingItemsForSlot(slot).find((item) => item.id === itemId)?.name ?? fallback;
  }

  function itemBonus(item: { bonus?: Record<string, number> }): string {
    if (!item.bonus) return "无额外属性";
    const labels: Record<string, string> = {
      charm: "魅力",
      mood: "心情",
      health: "健康",
      hygiene: "干净度",
      fame: "影响力",
      fitness: "体质",
      intelligence: "智力",
    };
    return Object.entries(item.bonus).map(([key, value]) => `${labels[key] ?? key} +${value}`).join(" · ") || "无额外属性";
  }

  function occasionText(itemId: string): string {
    const tags = clothingOccasionTags(itemId);
    return tags.length > 0 ? `👔 ${tags.join(" · ")}` : "👔 日常穿搭";
  }
</script>

<div class="overlay hud-scope" role="presentation" onclick={close} onkeydown={(event) => {if(event.key==='Escape')close();event.stopPropagation();}} transition:fade={{ duration: 150 }}>
  <div class="wardrobe-modal" role="dialog" aria-modal="true" aria-label="衣柜" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => {if(event.key==='Escape')close();event.stopPropagation();}}>
    <header class="modal-head">
      <div>
        <div class="eyebrow">住宅衣柜</div>
        <h2>👔 我的穿搭</h2>
        <p>整套更换，帽子可单独搭配。不消耗时间。</p>
      </div>
      <button class="close" type="button" onclick={close} aria-label="关闭衣柜">✕</button>
    </header>

    <div class="wardrobe-layout">
      <div class="wardrobe-preview-card">
        <div class="preview-label">当前完整穿搭</div>
        <div class="preview-stage">
          <PortraitStack portrait={preview} className="wardrobe-portrait" alt="主角当前穿搭" zoomable />
        </div>
        <div class="preview-summary">
          <span>🧢 {clothingName("hat", current.hat, "未戴帽子")}</span>
          <span>👕 {clothingName("clothes", current.clothes, "基础衣服")}</span>
        </div>
        {#if current.hat}
          <button class="secondary-btn" type="button" onclick={takeOffHat}>摘下帽子</button>
        {/if}
      </div>

      <div class="slot-list">
        {#each VISIBLE_CLOTHING_SLOTS as slot}
          <section class="slot-section">
            <div class="slot-heading">
              <h3>{SLOT_ICONS[slot]} {SLOT_LABELS[slot]}</h3>
              <span>{ownedItems(slot).length} {slot === "clothes" ? "套" : "件"}已拥有</span>
            </div>
            <div class="item-grid">
              {#if slot === "hat"}
                <button class="clothing-card no-hat" class:active={!current.hat} type="button" onclick={takeOffHat}>
                  <span class="item-icon">🚫</span>
                  <span class="item-copy">
                    <strong>不戴帽子</strong>
                    <small>恢复自然发型</small>
                  </span>
                  <span class="item-status">{current.hat ? "摘下" : "当前状态"}</span>
                </button>
              {/if}
              {#each ownedItems(slot) as item (item.id)}
                {@const active = current[slot] === item.id}
                <button class="clothing-card" class:active type="button" onclick={() => putOn(item.id)}>
                  <span class="item-icon">{item.icon}</span>
                  <span class="item-copy">
                    <strong>{item.name}</strong>
                    <small>{itemBonus(item)}</small>
                    <small>{occasionText(item.id)}</small>
                  </span>
                  <span class="item-status">{active ? "已穿着" : "穿上"}</span>
                </button>
              {/each}
              {#if ownedItems(slot).length === 0}
                <div class="empty-slot">还没有已拥有的{SLOT_LABELS[slot]}。</div>
              {/if}
            </div>
          </section>
        {/each}
        {#if accessories.length > 0}
          <section class="slot-section">
            <div class="slot-heading"><h3>💍 配饰</h3><span>{accessories.length} 件已拥有</span></div>
            <div class="item-grid">
              {#each accessories as { item } (item.id)}
                {@const active = gameState.equipped.accessory === item.id}
                <button class="clothing-card" class:active type="button" onclick={() => putOn(item.id)}>
                  <span class="item-icon">{item.icon}</span><span class="item-copy"><strong>{item.name}</strong><small>{itemBonus(item)}</small></span><span class="item-status">{active ? "已佩戴" : "佩戴"}</span>
                </button>
              {/each}
            </div>
            {#if gameState.equipped.accessory}<button class="secondary-btn" onclick={() => unequipItem(gameState, "accessory")}>摘下配饰</button>{/if}
          </section>
        {/if}
      </div>
    </div>

    <footer class="modal-foot">
      <span class="tip">服装与配饰在衣柜管理，工具和家居在家中收纳。</span>
      <button class="secondary-btn" onclick={() => (uiState.modal = "home_storage")}>家中收纳</button>
      <button class="primary-btn" type="button" onclick={close}>完成</button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 130;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(7, 10, 20, 0.72);
    backdrop-filter: blur(7px);
  }
  .wardrobe-modal {
    width: min(940px, 100%);
    max-height: min(90vh, 860px);
    overflow: auto;
    padding: clamp(16px, 3vw, 26px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 22px;
    background: linear-gradient(145deg, rgba(28, 35, 65, 0.98), rgba(16, 21, 42, 0.98));
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    color: var(--text-main, #eef1ff);
  }
  .modal-head, .modal-foot, .slot-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .eyebrow {
    color: #83d7ff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  h2, h3, p { margin: 0; }
  h2 { margin-top: 3px; font-size: clamp(20px, 3vw, 28px); }
  .modal-head p { margin-top: 5px; color: var(--text-dim, #9aa3c7); font-size: 12px; }
  .close {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 10px;
    background: rgba(255,255,255,.07);
    color: var(--text-dim, #9aa3c7);
    cursor: pointer;
  }
  .wardrobe-layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) 1fr;
    gap: 18px;
    margin-top: 18px;
  }
  .wardrobe-preview-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 360px;
    padding: 14px;
    border: 1px solid rgba(255, 209, 102, .25);
    border-radius: 16px;
    background: linear-gradient(160deg, rgba(255, 209, 102, .1), rgba(255,255,255,.035));
  }
  .preview-label { color: #ffe5a4; font-size: 12px; font-weight: 800; }
  .preview-stage {
    position: relative;
    flex: 1;
    min-height: 240px;
    overflow: hidden;
    border-radius: 12px;
    background: radial-gradient(circle at 50% 20%, rgba(111, 210, 255, .22), transparent 60%), rgba(4, 9, 22, .5);
  }
  :global(.portrait-stack[data-portrait-class~="wardrobe-portrait"]) {
    position: absolute;
    top: 3%;
    left: 50%;
    width: auto;
    max-width: 100%;
    height: 94%;
    aspect-ratio: 1024 / 1536;
    transform: translateX(-50%);
  }
  :global(.portrait-stack[data-portrait-class~="wardrobe-portrait"] .portrait-stack-image) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center top;
  }
  .preview-summary { display: grid; gap: 3px; color: var(--text-dim, #b8c0df); font-size: 11px; }
  .secondary-btn, .primary-btn {
    min-height: 36px;
    padding: 7px 12px;
    border-radius: 10px;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .secondary-btn { border: 1px solid rgba(255, 122, 122, .35); background: rgba(255, 122, 122, .1); color: #ffb3b3; }
  .primary-btn { border: 1px solid rgba(126, 224, 160, .5); background: rgba(126, 224, 160, .18); color: #b9ffd0; }
  .slot-list { display: grid; gap: 13px; min-width: 0; }
  .slot-section { padding: 13px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: rgba(255,255,255,.035); }
  .slot-heading { margin-bottom: 9px; }
  .slot-heading h3 { font-size: 14px; }
  .slot-heading span { color: var(--text-dim, #9aa3c7); font-size: 11px; }
  .item-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
  .clothing-card {
    display: grid;
    grid-template-columns: 34px 1fr auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 9px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 11px;
    background: rgba(4, 9, 22, .28);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .clothing-card:hover, .clothing-card.active { border-color: rgba(255, 209, 102, .65); background: rgba(255, 209, 102, .1); }
  .clothing-card.no-hat { border-color: rgba(255, 255, 255, .18); }
  .clothing-card.no-hat.active { border-color: rgba(255, 209, 102, .65); background: rgba(255, 209, 102, .1); }
  .item-icon { font-size: 26px; text-align: center; }
  .item-copy { display: grid; gap: 2px; min-width: 0; }
  .item-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
  .item-copy small { color: var(--text-dim, #9aa3c7); font-size: 10.5px; }
  .item-status { color: #ffd166; font-size: 10.5px; white-space: nowrap; }
  .empty-slot { padding: 13px 4px; color: var(--text-dim, #9aa3c7); font-size: 12px; }
  .modal-foot { margin-top: 16px; }
  .tip { color: var(--text-dim, #9aa3c7); font-size: 11px; }
  @media (max-width: 700px) {
    .wardrobe-layout { grid-template-columns: 1fr; }
    .wardrobe-preview-card { min-height: 300px; }
    .modal-foot { align-items: stretch; flex-direction: column; }
    .primary-btn { width: 100%; }
  }
</style>
