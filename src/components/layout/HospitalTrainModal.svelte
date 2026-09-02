<script lang="ts">
  /**
   * v1.37 宠物医院「猫咪卡牌训练」弹窗：
   * - special 特殊训练：付费强化一张卡（攻 +伤害 / 防 +格挡 / 治疗 +效果），略高于自行锻炼
   * - focus 专注训练：付费永久删除一张卡精简卡组（至少各保留 1 张攻/防）
   * 每周各限 3 次，按本周次数定价 200/400/600。
   */
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import {
    cardTrainable,
    ensureCardPack,
    focusTrainCard,
    hospitalPrice,
    hospitalWeeklyUsed,
    HOSPITAL_WEEK_LIMIT,
    QUALITY_LABEL,
    specialTrainCard,
    parseVariantId,
    TRAIN_BONUS_MAX,
  } from "../../game/core/cardPack";
  import { getCardDef } from "../../game/core/catBattle";
  import { playSound } from "../../lib/audio";
  import type { CatCardDef } from "../../game/types";

  const mode = $derived(uiState.hospitalTrainMode);
  const pet = $derived(gameState.pets.find((p) => p.uid === gameState.activePet));
  const pack = $derived(pet ? ensureCardPack(pet) : []);
  const used = $derived(gameState ? hospitalWeeklyUsed(gameState, mode) : 0);
  const price = $derived(hospitalPrice(used));
  const full = $derived(used >= HOSPITAL_WEEK_LIMIT);

  const QUALITY_COLOR: Record<number, string> = {
    0: "#9aa0b5",
    1: "#58c470",
    2: "#4aa3ff",
    3: "#ffb020",
  };

  function effectSummary(d: CatCardDef): string {
    const e = d.effect;
    if (!e) return "";
    const parts: string[] = [];
    if (e.power != null) parts.push(`伤害 ${e.power}${e.hits && e.hits > 1 ? ` ×${e.hits}` : ""}`);
    if (e.block != null) parts.push(`格挡 ${e.block}`);
    if (e.healPct != null) parts.push(`回复 ${Math.round(e.healPct * 100)}% HP`);
    if (e.heal != null) parts.push(`回复 ${e.heal} HP`);
    if (e.draw != null) parts.push(`抽 ${e.draw} 张牌`);
    if (e.strength != null) parts.push(`力量 +${e.strength}`);
    if (e.status) {
      const label: Record<string, string> = { poison: "中毒", paralysis: "麻痹", sleep: "睡眠", burn: "灼伤" };
      parts.push(`${label[e.status] ?? e.status}${e.statusChance != null ? ` ${Math.round(e.statusChance * 100)}%` : ""}`);
    }
    if (e.pierce) parts.push("无视格挡");
    if (e.cure) parts.push("清除异常");
    return parts.join(" · ");
  }

  function bonusOf(defId: string): number {
    return parseVariantId(defId).b;
  }

  function close(): void {
    uiState.modal = null;
  }

  function train(entryUid: string, defId: string): void {
    if (!pet) return;
    const r =
      mode === "special" ? specialTrainCard(gameState, pet.uid, entryUid) : focusTrainCard(gameState, pet.uid, entryUid);
    if (!r.ok) {
      playSound("error");
      showToast(`🚫 ${r.reason ?? "训练失败"}`);
      return;
    }
    playSound("coin");
    const def = getCardDef(defId);
    if (mode === "special") {
      showToast(`💪 「${def?.name ?? "卡牌"}」强化成功（- ${r.cost ?? 0} 元，耗时 1 小时）`);
    } else {
      showToast(`🗑️ 「${def?.name ?? "卡牌"}」已从卡组永久移除（- ${r.cost ?? 0} 元，耗时 1 小时）`);
    }
  }
</script>

{#if pet}
  <div class="overlay hud-scope" onclick={close} transition:fade={{ duration: 150 }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="head">
        <span class="head-icon">{mode === "special" ? "💪" : "🗑️"}</span>
        <div class="head-text">
          <div class="head-title">{mode === "special" ? "猫咪特殊训练" : "猫咪专注性训练"}</div>
          <div class="head-sub">
            {#if mode === "special"}
              任选一张卡强化属性（攻击卡加伤害、防御卡加格挡、治疗卡加治疗），幅度略高于猫咪自行锻炼
            {:else}
              永久删除一张卡精简卡组（至少各保留 1 张进攻卡与防守卡）
            {/if}
          </div>
        </div>
        <button class="close-btn" onclick={close}>✕</button>
      </div>

      <div class="meta-row">
        <span class="meta-item">本周 {used}/{HOSPITAL_WEEK_LIMIT} 次</span>
        <span class="meta-item price" class:disabled={full}>本次 {full ? "次数用尽" : `${price} 元`}</span>
        <span class="meta-item">⏱ 1 小时/次</span>
      </div>

      <div class="card-list">
        {#each pack as entry (entry.uid)}
          {@const def = getCardDef(entry.defId)}
          {@const bonus = bonusOf(entry.defId)}
          {@const trainable = cardTrainable(def)}
          <div class="card-row">
            <span class="q-dot" style="background: {QUALITY_COLOR[def?.quality ?? 0]}"></span>
            <div class="row-main">
              <div class="row-name">
                {def?.name ?? entry.defId}
                {#if bonus > 0}<span class="bonus-tag">+{bonus}</span>{/if}
                <span class="q-tag" style="color: {QUALITY_COLOR[def?.quality ?? 0]}">{QUALITY_LABEL[(def?.quality ?? 0) as 0 | 1 | 2 | 3]}</span>
              </div>
              <div class="row-effect">{def ? effectSummary(def) : ""}{def ? ` · 能量 ${def.cost}` : ""}</div>
            </div>
            {#if mode === "special"}
              <button
                class="row-btn"
                class:disabled={!trainable || bonus >= TRAIN_BONUS_MAX || full}
                title={!trainable ? "该卡效果固定，无法强化" : bonus >= TRAIN_BONUS_MAX ? "已强化到顶（+5）" : ""}
                onclick={() => train(entry.uid, entry.defId)}
              >
                {#if !trainable}不可强化{:else if bonus >= TRAIN_BONUS_MAX}已满级{:else}{price} 元{/if}
              </button>
            {:else}
              <button class="row-btn danger" class:disabled={full} onclick={() => train(entry.uid, entry.defId)}>
                {full ? "次数用尽" : `删除 ${price} 元`}
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="foot-hint">
        {#if mode === "special"}
          强化立即生效并永久保留；纯抽牌/净化类功能卡无法强化
        {:else}
          删除不可恢复，请谨慎选择
        {/if}
      </div>
    </div>
  </div>
{/if}

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
  }
  .modal {
    width: min(520px, 92vw);
    max-height: 84vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-card, #1c1a2e);
    border: 1px solid var(--border, #3a3654);
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  }
  .head { display: flex; align-items: flex-start; gap: 10px; }
  .head-icon { font-size: 24px; }
  .head-text { flex: 1; min-width: 0; }
  .head-title { font-size: 16px; font-weight: 900; }
  .head-sub { font-size: 11px; opacity: 0.7; margin-top: 3px; line-height: 1.45; }
  .close-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .close-btn:hover { background: rgba(255, 90, 90, 0.28); border-color: rgba(255, 90, 90, 0.4); }
  .close-btn:active { transform: scale(0.92); }

  .meta-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
  .meta-item {
    font-size: 11px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .meta-item.price { color: #ffd166; border-color: rgba(255, 209, 102, 0.35); }
  .meta-item.price.disabled { color: #ff8a8a; border-color: rgba(255, 138, 138, 0.35); }

  .card-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .card-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .q-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .row-main { flex: 1; min-width: 0; }
  .row-name { font-size: 13px; font-weight: 800; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .bonus-tag {
    font-size: 10px;
    font-weight: 900;
    color: #ffd166;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.14);
  }
  .q-tag { font-size: 10px; font-weight: 800; }
  .row-effect { font-size: 10.5px; opacity: 0.7; margin-top: 2px; }
  .row-btn {
    font: inherit;
    font-size: 11.5px;
    font-weight: 900;
    padding: 7px 12px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    color: #1a1206;
    background: linear-gradient(135deg, #ffd166, #ff9f3d);
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .row-btn:hover:not(.disabled) {
    box-shadow: 0 3px 12px rgba(255, 160, 60, 0.35);
    transform: translateY(-1px);
  }
  .row-btn:active:not(.disabled) { transform: translateY(0) scale(0.96); }
  .row-btn.danger {
    color: #fff;
    background: linear-gradient(135deg, #ff6b6b, #d94f4f);
  }
  .row-btn.danger:hover:not(.disabled) {
    box-shadow: 0 3px 12px rgba(255, 80, 80, 0.35);
    transform: translateY(-1px);
  }
  .row-btn.danger:active:not(.disabled) { transform: translateY(0) scale(0.96); }
  .row-btn.disabled {
    background: rgba(255, 255, 255, 0.1);
    color: #8a84a0;
    cursor: not-allowed;
  }
  .foot-hint { font-size: 10.5px; opacity: 0.55; margin-top: 10px; text-align: center; }
</style>
