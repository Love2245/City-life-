<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { claimTempleGift, templeGiftClaimedThisWeek, templeGiftItem, templeGiftWeekIndex, TEMPLE_GIFT_OFFERS } from "../game/core/templeGiftShop";
  import { playSound } from "../lib/audio";

  const claimedThisWeek = $derived(templeGiftClaimedThisWeek(gameState));
  const gameWeek = $derived(templeGiftWeekIndex(gameState) + 1);
  const offers = $derived(TEMPLE_GIFT_OFFERS.flatMap((offer) => {
    const item = templeGiftItem(offer.itemId);
    return item ? [{ ...offer, item }] : [];
  }));

  function close(): void {
    uiState.modal = null;
  }

  function claim(itemId: string): void {
    const result = claimTempleGift(gameState, itemId);
    if (!result.ok) {
      showToast(result.reason);
      return;
    }
    playSound("success");
    showToast(`🛕 已免费领取「${result.item.name}」，本周结缘礼已领完`);
  }
</script>

<div class="gift-overlay hud-scope" role="presentation" onclick={close} transition:fade={{ duration: 150 }}>
  <section class="gift-modal" role="dialog" aria-modal="true" aria-label="结缘院" onclick={(event) => event.stopPropagation()}>
    <header class="gift-header">
      <div class="gift-mark" aria-hidden="true">🛕</div>
      <div class="gift-heading">
        <p class="eyebrow">寺院赠礼 · 随喜结缘</p>
        <h2>结缘院</h2>
        <p>愿你带走一件纪念，也留下一份安宁。</p>
      </div>
      <button class="close" aria-label="关闭结缘院" onclick={close}>✕</button>
    </header>

    <div class="week-note">
      <span>🎁 每个游戏周可免费领取一件</span>
      <span>游戏周 {gameWeek}</span>
    </div>

    {#if claimedThisWeek}
      <div class="claimed-note" role="status">本周的结缘礼已领取，下个游戏周会再次开放。</div>
    {/if}

    <div class="gift-list">
      {#each offers as offer (offer.itemId)}
        <article class="gift-item" class:unavailable={claimedThisWeek}>
          <div class="item-icon" aria-hidden="true">{offer.item.icon}</div>
          <div class="item-copy">
            <h3>{offer.item.name}</h3>
            <p>{offer.note}</p>
            <small>{offer.item.desc}</small>
          </div>
          <button class="claim-button" disabled={claimedThisWeek} onclick={() => claim(offer.itemId)}>
            {claimedThisWeek ? "本周已领" : "免费领取"}
          </button>
        </article>
      {/each}
    </div>

    <footer>
      <span>经文、手册与画印可在书架中阅读；腕珠会收入背包。</span>
      <button class="done" onclick={close}>收好</button>
    </footer>
  </section>
</div>

<style>
  .gift-overlay { position: fixed; inset: 0; z-index: 185; display: grid; place-items: center; padding: 18px; background: #080b15de; }
  .gift-modal { width: min(820px, 96vw); max-height: min(88dvh, 900px); display: flex; flex-direction: column; gap: 15px; padding: 22px; color: var(--text, #eef1ff); background: var(--bg-card, #222842); border: 1px solid var(--border, #454d6d); border-radius: 20px; box-shadow: 0 24px 76px #000a; }
  .gift-header { display: flex; align-items: center; gap: 14px; }
  .gift-mark { flex: none; width: 54px; height: 54px; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(145deg, #d2ad6840, #83a98d28); font-size: 29px; }
  .gift-heading { min-width: 0; flex: 1; }
  .eyebrow { margin: 0 0 3px; color: #e2c47c; font-size: 11px; letter-spacing: .08em; }
  h2 { margin: 0; font-size: 22px; }
  .gift-heading > p:last-child { margin: 4px 0 0; color: var(--text-dim, #aab1cf); font-size: 12px; }
  button { color: inherit; cursor: pointer; }
  .close { flex: none; width: 34px; height: 34px; border: 0; border-radius: 9px; background: #ffffff18; }
  .week-note { display: flex; justify-content: space-between; gap: 12px; padding: 11px 14px; border: 1px solid #d9bc7250; border-radius: 12px; color: #f2d897; background: #c8a14a12; font-size: 12px; }
  .claimed-note { padding: 10px 13px; border-radius: 10px; color: var(--text-dim, #bac0d8); background: #ffffff0a; font-size: 12px; }
  .gift-list { min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 350px), 1fr)); gap: 10px; padding: 1px 3px 2px 1px; }
  .gift-item { min-width: 0; display: flex; align-items: center; gap: 11px; padding: 12px; border: 1px solid #ffffff20; border-radius: 14px; background: #ffffff0a; }
  .gift-item.unavailable { opacity: .68; }
  .item-icon { flex: none; width: 46px; height: 50px; display: grid; place-items: center; border-radius: 12px; background: linear-gradient(145deg, #d2ad6825, #89a98a18); font-size: 25px; }
  .item-copy { min-width: 0; flex: 1; }
  .item-copy h3 { margin: 0; font-size: 14px; }
  .item-copy p { margin: 4px 0; color: #e3d4a9; font-size: 11px; }
  .item-copy small { display: block; color: var(--text-dim, #aab1cf); font-size: 10px; line-height: 1.45; }
  .claim-button { flex: none; padding: 8px 10px; border: 0; border-radius: 9px; color: #242218; background: #e4c675; font-size: 11px; font-weight: 750; }
  .claim-button:hover:not(:disabled) { background: #f3d88d; }
  .claim-button:disabled { color: #b0b3c1; background: #ffffff17; cursor: default; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 12px; color: var(--text-dim, #aab1cf); border-top: 1px solid #ffffff20; font-size: 11px; }
  .done { flex: none; padding: 8px 16px; border: 0; border-radius: 9px; color: #1b1c21; background: var(--accent, #ffd166); font-size: 12px; font-weight: 700; }
  @media (max-width: 540px) {
    .gift-modal { gap: 12px; padding: 16px; }
    .gift-list { grid-template-columns: 1fr; }
    .gift-item { gap: 8px; padding: 10px; }
    .item-icon { width: 40px; height: 44px; }
    .claim-button { padding: 8px; }
    footer { align-items: flex-start; }
  }
</style>
