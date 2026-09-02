<script lang="ts">
  // 都市生活 v0.991 — 关系 App（手机第 9 个应用）：NPC 好感列表 / 详情 / 互动
  // v0.991：恋爱线（约会/表白/分手）暂缓至 1.0，本版本聚焦人际/社交关系；
  // 人物名陌生人显示「？？？」，建立初步关系后显示占位称呼（真名留待 1.0）。
  import { gameState } from "../stores/gameStore.svelte";
  import { showToast } from "../stores/uiStore.svelte";
  import type { PhoneResult } from "../game/core/phone";
  import { getNpcDef } from "../game/core/npcs";
  import { getItem } from "../game/core/items";
  import {
    callNpc,
    giftNpc,
    crashAtNpc,
    borrowFrom,
    repayLoan,
    socialActionsAvailable,
    giftableCount,
    isGiftable,
    npcDisplayName,
  } from "../game/core/romance";
  import {
    findRelationship,
    currentState,
    STATE_LABEL,
  } from "../game/core/relationships";

  interface Props {
    onClose: () => void;
    onResult: (r: PhoneResult) => void;
  }
  let { onClose, onResult }: Props = $props();

  let selected = $state<string | null>(null);
  let giftOpen = $state(false);
  let borrowOpen = $state(false);
  let borrowAmt = $state(100);

  const rels = $derived(
    [...gameState.relationships].sort((a, b) => b.affinity - a.affinity),
  );
  const sel = $derived(selected ? findRelationship(gameState, selected) : undefined);
  const selDef = $derived(selected ? getNpcDef(selected) : undefined);
  const avail = $derived(selected ? socialActionsAvailable(gameState, selected) : null);
  const giftable = $derived(giftableCount(gameState));

  /** 背包物品列表（送礼候选：仅消耗品/礼物类，v0.992 过滤掉手机/驾照等功能性物品） */
  const giftItems = $derived(
    Object.entries(gameState.inventory)
      .map(([id, qty]) => ({ id, qty, def: getItem(id) }))
      .filter((x) => x.qty > 0 && x.def && isGiftable(x.id)),
  );

  function run(fn: () => PhoneResult): void {
    const r = fn();
    onResult(r);
    if (!r.ok && r.reason) showToast(r.reason ?? "操作失败");
    if (r.ok) {
      giftOpen = false;
      borrowOpen = false;
    }
  }

  function likeHint(npcId: string, itemId: string): string {
    const def = getNpcDef(npcId);
    if (def?.likes?.includes(itemId)) return "  TA喜欢 +3";
    if (def?.dislikes?.includes(itemId)) return "  TA讨厌 -3";
    return "";
  }
</script>

<div class="relapp">
  <div class="rel-head">
    <span>💞 关系</span>
    <button class="rel-close" onclick={onClose}>✕</button>
  </div>

  {#if !sel}
    <div class="rel-hint dim">好感从高到低。去对应地点走动，能偶遇新朋友。</div>
    <div class="rel-list">
      {#each rels as r}
        {@const def = getNpcDef(r.npcId)}
        <button class="rel-row" onclick={() => (selected = r.npcId)}>
          <span class="r-ic">{def?.icon ?? "🙂"}</span>
          <span class="r-main">
            <span class="r-name">{npcDisplayName(gameState, r.npcId)}</span>
            <span class="r-state">{STATE_LABEL[currentState(r)]}</span>
          </span>
          <span class="r-aff">❤ {r.affinity}</span>
        </button>
      {/each}
      {#if rels.length === 0}
        <p class="rel-empty dim">还没有认识的人。去城里走走，说不定就遇上了。</p>
      {/if}
    </div>
  {:else}
    <div class="rel-detail">
      <div class="d-top">
        <span class="d-ic">{selDef?.icon ?? "🙂"}</span>
        <div>
          <div class="d-name">{selected ? npcDisplayName(gameState, selected) : ""}</div>
          <div class="d-state dim">{sel ? STATE_LABEL[currentState(sel)] : ""} · ❤ {sel?.affinity ?? 0}</div>
        </div>
      </div>
      <div class="aff-bar"><div class="aff-fill" style="width:{(sel?.affinity ?? 0)}%"></div></div>

      {#if selDef?.likes?.length || selDef?.dislikes?.length}
        <div class="d-meta dim">
          {#if selDef?.likes?.length}<div>喜欢：{selDef.likes.map((i) => getItem(i)?.name ?? i).join("、")}</div>{/if}
          {#if selDef?.dislikes?.length}<div>讨厌：{selDef.dislikes.map((i) => getItem(i)?.name ?? i).join("、")}</div>{/if}
        </div>
      {/if}

      {#if selDef?.desc}<div class="d-desc dim">{selDef.desc}</div>{/if}

      {#if sel?.loan}
        <div class="rel-loan">
          💳 欠款 {sel.loan.amount} 元（已借 {sel.loan.since} 天）
          <button onclick={() => run(() => repayLoan(gameState, selected!, Math.min(sel!.loan!.amount, gameState.player.money)))}>还清</button>
        </div>
      {/if}

      <div class="rel-acts">
        <button disabled={!avail?.call} onclick={() => run(() => callNpc(gameState, selected!))}>📞 打电话</button>
        <button disabled={!avail?.gift || giftable <= 0} onclick={() => (giftOpen = !giftOpen)}>🎁 送礼</button>
        <button disabled={!avail?.crash} onclick={() => run(() => crashAtNpc(gameState, selected!))}>🛏️ 蹭住</button>
        <button disabled={!avail?.borrow} onclick={() => (borrowOpen = !borrowOpen)}>💸 借钱</button>
      </div>
      <!-- v0.991：恋爱线（约会/表白/分手）暂缓，1.0 随剧情模式开放 -->

      {#if giftOpen}
        <div class="rel-sub">
          <div class="dim sub-title">选择礼物（共 {giftable} 件可送）：</div>
          {#if giftItems.length === 0}
            <p class="dim">背包里没有可送的礼物，先去商店买点日常用品。</p>
          {:else}
            {#each giftItems as g}
              <button class="gift-row" onclick={() => run(() => giftNpc(gameState, selected!, g.id))}>
                {g.def!.name} ×{g.qty}{likeHint(selected ?? "", g.id)}
              </button>
            {/each}
          {/if}
        </div>
      {/if}

      {#if borrowOpen}
        <div class="rel-sub">
          <div class="dim sub-title">借款金额：</div>
          <div class="borrow-row">
            <input type="number" min="10" max="500" bind:value={borrowAmt} />
            <button onclick={() => run(() => borrowFrom(gameState, selected!, borrowAmt))}>确认</button>
          </div>
        </div>
      {/if}

      <button class="rel-back" onclick={() => (selected = null)}>← 返回列表</button>
    </div>
  {/if}
</div>

<style>
  .relapp {
    padding: 4px 2px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }
  .rel-close {
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--text-dim, #93a0bd);
  }
  .rel-hint {
    font-size: 12px;
  }
  .rel-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: var(--panel, #1e2636);
    border: 1px solid var(--line, #2c3650);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .r-ic {
    font-size: 22px;
  }
  .r-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .r-name {
    font-size: 14px;
  }
  .r-state {
    font-size: 12px;
    opacity: 0.7;
  }
  .r-aff {
    color: #ff5d8f;
    font-size: 14px;
  }
  .rel-empty {
    font-size: 13px;
  }
  .rel-meet {
    margin-top: 8px;
  }
  .rel-meet h5 {
    margin: 0 0 6px;
    font-size: 12px;
  }
  .m-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--line, #2c3650);
  }
  .rel-detail .d-top {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .d-ic {
    font-size: 34px;
  }
  .d-name {
    font-size: 16px;
    font-weight: 600;
  }
  .d-state {
    font-size: 12px;
  }
  .aff-bar {
    height: 8px;
    background: var(--panel, #1a2030);
    border-radius: 6px;
    overflow: hidden;
    margin: 8px 0;
  }
  .aff-fill {
    height: 100%;
    background: #ff5d8f;
    border-radius: 6px;
    transition: width 0.3s;
  }
  .d-meta,
  .d-desc {
    font-size: 12px;
  }
  .rel-loan {
    background: #2a2330;
    border: 1px solid #ff5c72;
    border-radius: 10px;
    padding: 8px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 6px 0;
  }
  .rel-acts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .rel-acts button {
    padding: 8px;
    font-size: 13px;
  }
  .rel-sub {
    background: var(--panel, #1e2636);
    border: 1px solid var(--line, #2c3650);
    border-radius: 10px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sub-title {
    font-size: 12px;
  }
  .gift-row {
    text-align: left;
    font-size: 12px;
    padding: 6px 8px;
  }
  .borrow-row {
    display: flex;
    gap: 6px;
  }
  .borrow-row input {
    width: 100px;
  }
  .rel-back {
    background: transparent;
    font-size: 13px;
  }
  .dim {
    opacity: 0.75;
    color: #93a0bd;
  }
</style>
