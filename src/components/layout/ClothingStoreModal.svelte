<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import {
    VISIBLE_CLOTHING_SLOTS,
    clothingItemsForSlot,
    outfitCatalogFor, outfitPrice,
    clothingTryOnItemsForSlot,
    CLOTHING_STORES,
    isClothingStoreId,
    clothingPrice,
    checkoutClothing,
    equippedClothing,
    isOwnedClothing,
    type ClothingSlot,
  } from "../../game/core/clothing";
  import { playerOutfitSet } from "../../game/core/playerOutfitSets";
  import { advanceHours } from "../../game/core/time";
  import { autoExitIfClosed } from "../../game/core/actions";
  import { playerPortraitForReply } from "../../game/core/npcPortraits";
  import { clothingOccasionTags } from "../../game/core/playerOutfitResolver";
  import PortraitStack from "./PortraitStack.svelte";

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

  let draft = $state<Record<ClothingSlot, string | undefined>>(equippedClothing(gameState));
  const store = $derived(isClothingStoreId(gameState.locationId) ? CLOTHING_STORES[gameState.locationId] : undefined);
  const preview = $derived(playerPortraitForReply(undefined, draft));
  const selectedIds = $derived(VISIBLE_CLOTHING_SLOTS.map((slot) => draft[slot]).filter((id): id is string => !!id));
  const total = $derived(selectedIds.reduce((sum, id) => {
    return sum + (isOwnedClothing(gameState, id) ? 0 : playerOutfitSet(id) ? outfitPrice(gameState, id) : clothingPrice(gameState, id));
  }, 0));
  const newCount = $derived(selectedIds.filter((id) => !isOwnedClothing(gameState, id)).length);

  function close(): void {
    uiState.modal = null;
  }

  function choose(slot: ClothingSlot, itemId: string): void {
    draft[slot] = itemId;
    const set = playerOutfitSet(itemId);
    if (set) { draft.pants = set.pants; draft.underlayer = "underlayer_white"; }
  }

  function clearHat(): void {
    draft.hat = undefined;
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

  function confirmPurchase(): void {
    if (selectedIds.length === 0) {
      showToast("请先选择一套穿搭");
      return;
    }
    const result = checkoutClothing(gameState, selectedIds, { removeHat: !draft.hat });
    if (!result.ok) {
      showToast(`🚫 ${result.reason ?? "服装结算失败"}`);
      return;
    }
    // 新商品付款后占用 1 小时；只试穿已拥有服装不消耗时间。
    if (result.purchasedIds.length > 0) {
      advanceHours(gameState, 1);
      autoExitIfClosed(gameState);
    }
    showToast(result.purchasedIds.length > 0 ? `已换上新穿搭` : "已换上试穿搭配");
    uiState.modal = null;
  }
</script>

<div class="overlay hud-scope" role="presentation" onclick={close} onkeydown={(event) => event.stopPropagation()} transition:fade={{ duration: 150 }}>
  <div class="store-modal" role="dialog" aria-modal="true" aria-label={store?.name ?? "衣柜"} tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
    <header class="store-head">
      <div>
        <div class="eyebrow">{store?.description ?? "搭配已拥有的服装"}</div>
        <h2>👗 {store?.name ?? "衣柜"} · 试穿与搭配</h2>
        <p>整套试穿，帽子可单独搭配。</p>
      </div>
      <button class="close" type="button" onclick={close} aria-label="取消试穿">✕</button>
    </header>

    <div class="store-layout">
      <aside class="try-on-card">
        <div class="try-on-label">试穿预览</div>
        <div class="preview-stage">
          <PortraitStack portrait={preview} className="store-portrait" alt="试穿中的穿搭" />
        </div>
        <div class="try-on-summary">
          <span>🧢 {clothingName("hat", draft.hat, "未戴帽子")}</span>
          <span>👕 {clothingName("clothes", draft.clothes, "基础衣服")}</span>
        </div>
        {#if draft.hat}
          <button class="clear-btn" type="button" onclick={clearHat}>摘下帽子</button>
        {/if}
        <div class="checkout-total">
          <span>本次待付款</span>
          <strong>¥{total}</strong>
        </div>
        <div class="money-line">当前余额：¥{gameState.player.money}</div>
        <button class="pay-btn" type="button" disabled={selectedIds.length === 0 || gameState.player.money < total} onclick={confirmPurchase}>
          {#if gameState.player.money < total}余额不足{:else if newCount > 0}确认付款并穿上{:else}确认穿上{/if}
        </button>
      </aside>

      <div class="catalog">
        {#each VISIBLE_CLOTHING_SLOTS as slot}
          <section class="catalog-section">
            <div class="section-title">
              <h3>{SLOT_ICONS[slot]} {SLOT_LABELS[slot]}</h3>
              <span class="section-note">{slot === "hat" ? "可不戴 · " : ""}本店商品与自有服装</span>
            </div>
            <div class="catalog-grid">
              {#if slot === "hat"}
                <button class="catalog-card no-hat" class:selected={!draft.hat} type="button" onclick={clearHat}>
                  <span class="catalog-icon">🚫</span>
                  <span class="catalog-copy">
                    <strong>不戴帽子</strong>
                    <small>恢复自然发型</small>
                  </span>
                  <span class="catalog-price">免费</span>
                </button>
              {/if}
              {#each (slot === "clothes" ? outfitCatalogFor(gameState, gameState.locationId) : clothingTryOnItemsForSlot(gameState, slot)) as item (item.id)}
                {@const owned = isOwnedClothing(gameState, item.id)}
                {@const selected = draft[slot] === item.id}
                <button class="catalog-card" class:selected class:owned type="button" onclick={() => choose(slot, item.id)}>
                  <span class="catalog-icon">{item.icon}</span>
                  <span class="catalog-copy">
                    <strong>{item.name}</strong>
                    {#if slot === "hat"}<small>{item.desc}</small>{/if}
                    <small>{itemBonus(item)}</small>
                    <small>{occasionText(item.id)}</small>
                  </span>
                  <span class="catalog-price">{owned ? "已拥有" : item.shopPrice === 0 ? "免费" : `¥${slot === "clothes" ? outfitPrice(gameState, item.id) : clothingPrice(gameState, item)}`}</span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </div>

    <footer class="store-foot">
      <span class="tip">已拥有的套装不重复收费。</span>
      <button class="cancel-btn" type="button" onclick={close}>取消试穿</button>
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
  .store-modal {
    width: min(1060px, 100%);
    max-height: min(92vh, 900px);
    overflow: auto;
    padding: clamp(16px, 3vw, 26px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 22px;
    background: linear-gradient(145deg, rgba(43, 30, 65, 0.98), rgba(19, 20, 43, 0.98));
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    color: var(--text-main, #eef1ff);
  }
  .store-head, .store-foot, .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .eyebrow { color: #ffa6d4; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; }
  h2, h3, p { margin: 0; }
  h2 { margin-top: 3px; font-size: clamp(20px, 3vw, 28px); }
  .store-head p { margin-top: 5px; color: var(--text-dim, #b7afd0); font-size: 12px; }
  .close {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 10px;
    background: rgba(255,255,255,.07);
    color: var(--text-dim, #b7afd0);
    cursor: pointer;
  }
  .store-layout { display: grid; grid-template-columns: minmax(220px, 290px) 1fr; gap: 18px; margin-top: 18px; }
  .try-on-card {
    position:sticky;
    top:12px;
    align-self:start;
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-height: 0;
    padding: 14px;
    border: 1px solid rgba(255, 166, 212, .3);
    border-radius: 16px;
    background: linear-gradient(160deg, rgba(255, 166, 212, .1), rgba(255,255,255,.035));
  }
  .try-on-label { color: #ffc4e3; font-size: 12px; font-weight: 800; }
  .preview-stage { position:relative;flex:none;aspect-ratio:2/3;min-height:270px;overflow:hidden;border-radius:12px;background:radial-gradient(circle at 50% 20%,rgba(255,166,212,.22),transparent 60%),rgba(4,9,22,.5); }
  :global(.portrait-stack[data-portrait-class~="store-portrait"]) { position:absolute;top:0;left:50%;width:100%;height:100%;aspect-ratio:1024/1536;transform:translateX(-50%); }
  :global(.portrait-stack[data-portrait-class~="store-portrait"] .portrait-stack-image) { width: 100%; height: 100%; object-fit: contain; object-position: center top; }
  .try-on-summary { display: grid; gap: 3px; color: var(--text-dim, #c1b7d5); font-size: 11px; }
  .clear-btn, .pay-btn, .cancel-btn { min-height: 36px; padding: 7px 12px; border-radius: 10px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
  .clear-btn { border: 1px solid rgba(255, 122, 122, .35); background: rgba(255, 122, 122, .1); color: #ffb3b3; }
  .checkout-total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.12); color: #ffe4f2; font-size: 12px; }
  .checkout-total strong { color: #ffd166; font-size: 22px; }
  .money-line { color: var(--text-dim, #c1b7d5); font-size: 11px; }
  .pay-btn { border: 1px solid rgba(126, 224, 160, .5); background: rgba(126, 224, 160, .18); color: #c5ffd6; }
  .pay-btn:disabled { opacity: .45; cursor: not-allowed; }
  .catalog { display: grid; gap: 13px; min-width: 0; }
  .catalog-section { padding: 13px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: rgba(255,255,255,.035); }
  .section-title { margin-bottom: 9px; }
  .section-title h3 { font-size: 14px; }
  .section-note { color: var(--text-dim, #b7afd0); font-size: 11px; }
  .catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
  .catalog-card { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 8px; min-width: 0; padding: 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 11px; background: rgba(4,9,22,.28); color: inherit; text-align: left; cursor: pointer; }
  .catalog-card:hover, .catalog-card.selected { border-color: rgba(255, 166, 212, .7); background: rgba(255, 166, 212, .12); }
  .catalog-card.owned { border-color: rgba(126, 224, 160, .22); }
  .catalog-card.no-hat { border-color: rgba(255, 255, 255, .18); }
  .catalog-card.no-hat.selected { border-color: rgba(255, 166, 212, .7); background: rgba(255, 166, 212, .12); }
  .catalog-icon { font-size: 26px; text-align: center; }
  .catalog-copy { display: grid; gap: 2px; min-width: 0; }
  .catalog-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
  .catalog-copy small { color: var(--text-dim, #b7afd0); font-size: 10.5px; }
  .catalog-price { color: #ffd166; font-size: 10.5px; font-weight: 800; white-space: nowrap; }
  .catalog-card.owned .catalog-price { color: #a9efc0; }
  .store-foot { margin-top: 16px; }
  .tip { color: var(--text-dim, #b7afd0); font-size: 11px; }
  .cancel-btn { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.07); color: var(--text-dim, #c1b7d5); }
  @media (max-width: 740px) {
    .store-layout { grid-template-columns: 1fr; }
    .try-on-card { position:static;min-height:0; }
    .store-foot { align-items: stretch; flex-direction: column; }
    .cancel-btn { width: 100%; }
  }
  @media (max-height:620px) {
    .try-on-card {gap:6px;padding:10px;}
    .preview-stage {min-height:0;width:146px;height:219px;align-self:center;}
  }
</style>
