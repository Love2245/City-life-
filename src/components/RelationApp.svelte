<script lang="ts">
  // 关系 App：人物资料与关系记录。旧档已有欠款仍可在此归还。
  import { gameState } from "../stores/gameStore.svelte";
  import { showToast } from "../stores/uiStore.svelte";
  import type { PhoneResult } from "../game/core/phone";
  import { getNpcDef, npcNick } from "../game/core/npcs";
  import { getItem } from "../game/core/items";
  import { gameDay } from "../game/core/calendar";
  import {
    repayLoan,
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

  const rels = $derived(
    [...gameState.relationships].sort((a, b) => b.affinity - a.affinity),
  );
  const sel = $derived(selected ? findRelationship(gameState, selected) : undefined);
  const selDef = $derived(selected ? getNpcDef(selected) : undefined);

  function run(fn: () => PhoneResult): void {
    const r = fn();
    onResult(r);
    if (!r.ok && r.reason) showToast(r.reason ?? "操作失败");
  }
</script>

<div class="relapp">
  <div class="rel-head">
    <span>💞 关系</span>
    <button class="rel-close" onclick={onClose}>✕</button>
  </div>

  {#if !sel}
    <div class="rel-hint dim">去对应地点走动会偶遇新朋友；常去同一地方必能混熟，朋友还会给你介绍新朋友。</div>
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

      <!-- v1.01：相识途径提示（介绍 / 常客保底 / 偶遇） -->
      {#if selDef}
        <div class="d-meet dim">
          {#if selDef.introducedBy}
            🤝 经{npcNick(selDef.introducedBy)}介绍认识（TA 的好感够高后自然引荐）
          {:else if selDef.meetLocation}
            📍 常去 {selDef.meetLocation} 会碰到 TA（去 {selDef.meetVisitCount ?? 3} 次必遇）
          {/if}
        </div>
      {/if}

      {#if sel?.loan}
        {@const repayAmount = Math.min(sel.loan.amount, gameState.player.money)}
        <div class="rel-loan">
          💳 欠款 {sel.loan.amount} 元（已借 {gameDay(gameState.time) - sel.loan.since} 天）
          <!-- 现金不足时 Math.min 实为部分还款，按钮文案必须如实反映，不能承诺"还清" -->
          <button
            disabled={repayAmount <= 0}
            onclick={() => run(() => repayLoan(gameState, selected!, repayAmount))}
          >{repayAmount >= sel.loan.amount ? "还清" : `还款 ${Math.max(0, repayAmount)} 元`}</button>
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
  .d-meet {
    font-size: 11.5px;
    line-height: 1.5;
    background: rgba(91, 140, 255, 0.08);
    border: 1px solid rgba(91, 140, 255, 0.2);
    border-radius: 8px;
    padding: 6px 8px;
    margin: 4px 0;
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
  .rel-back {
    background: transparent;
    font-size: 13px;
  }
  .dim {
    opacity: 0.75;
    color: #93a0bd;
  }
</style>
