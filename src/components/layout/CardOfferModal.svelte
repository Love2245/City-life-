<script lang="ts">
  /**
   * v1.37 卡包刷新弹窗：户外锻炼 / 对决胜利 / 比赛胜利刷出新卡，
   * 玩家自由选择收入卡包（下次对决进入抽牌堆）或放弃。
   */
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { acceptCardOffer, QUALITY_LABEL } from "../../game/core/cardPack";
  import { getCardDef } from "../../game/core/catBattle";
  import { playSound } from "../../lib/audio";
  import type { CatCardDef } from "../../game/types";

  const offer = $derived(uiState.cardOfferPayload);
  const def = $derived(offer ? getCardDef(offer.defId) : undefined);
  const pet = $derived(offer ? gameState.pets.find((p) => p.uid === offer.petUid) : undefined);

  const SOURCE_TEXT: Record<string, string> = {
    train: "🏕️ 户外锻炼的意外收获",
    duel: "⚔️ 对决胜利的战利品",
    tournament: "🏆 比赛胜利的奖励（稀有度提升）",
  };

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

  const quality = $derived(def?.quality ?? 0);
  const qColor = $derived(QUALITY_COLOR[quality] ?? QUALITY_COLOR[0]);

  function close(): void {
    uiState.cardOfferPayload = null;
    uiState.modal = null;
  }

  function accept(): void {
    if (!offer) return close();
    const r = acceptCardOffer(gameState, offer.petUid, offer.defId);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "收入卡包失败"}`);
      return;
    }
    playSound("success");
    showToast(`📦 已加入「${pet?.name ?? "猫咪"}」的卡包，下次对决生效`);
    close();
  }

  function decline(): void {
    playSound("error");
    close();
  }
</script>

{#if offer && def}
  <div class="overlay hud-scope" onclick={decline} transition:fade={{ duration: 150 }}>
    <div class="modal" onclick={(e) => e.stopPropagation()} style="--q-color: {qColor}">
      <div class="head">
        <span class="head-icon">📦</span>
        <div>
          <div class="head-title">获得一张新卡牌</div>
          <div class="head-sub">{SOURCE_TEXT[offer.source] ?? "意外的收获"}</div>
        </div>
      </div>

      <div class="card-preview">
        <div class="card-strip"></div>
        <div class="card-cost">{def.cost}</div>
        <div class="card-icon">{def.icon}</div>
        <div class="card-name">{def.name}</div>
        <div class="card-quality" style="color: {qColor}; border-color: {qColor}">{QUALITY_LABEL[quality as 0 | 1 | 2 | 3]}</div>
        <div class="card-desc">{def.desc}</div>
        <div class="card-effect">{effectSummary(def)}</div>
      </div>

      <div class="pack-info">
        {#if pet}
          「{pet.name}」当前卡包 {pet.cardPack?.length ?? 0} 张 · 收入后下次对决进入抽牌堆
        {/if}
      </div>

      <div class="btn-row">
        <button class="btn ghost" onclick={decline}>放弃</button>
        <button class="btn primary" onclick={accept}>收入卡包</button>
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
    width: 380px;
    background: var(--bg-card, #1c1a2e);
    border: 1px solid var(--border, #3a3654);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .head-icon { font-size: 26px; }
  .head-title { font-size: 16px; font-weight: 900; }
  .head-sub { font-size: 11.5px; opacity: 0.75; margin-top: 2px; }

  .card-preview {
    position: relative;
    border: 1.5px solid var(--q-color);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.25));
    padding: 16px 14px 12px;
    text-align: center;
    overflow: hidden;
  }
  .card-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--q-color);
  }
  .card-cost {
    position: absolute;
    top: 10px;
    left: 10px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff5c2, #ffb020);
    color: #2a1f08;
    font-size: 13px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card-icon { font-size: 44px; }
  .card-name { font-size: 15px; font-weight: 900; margin-top: 4px; }
  .card-quality {
    display: inline-block;
    font-size: 10.5px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid;
    margin-top: 6px;
  }
  .card-desc { font-size: 11px; opacity: 0.8; margin-top: 8px; line-height: 1.45; }
  .card-effect { font-size: 12.5px; font-weight: 800; margin-top: 8px; color: var(--q-color); }

  .pack-info { font-size: 11px; opacity: 0.7; text-align: center; margin: 12px 0; }
  .btn-row { display: flex; gap: 10px; }
  .btn {
    flex: 1;
    font: inherit;
    font-size: 13.5px;
    font-weight: 900;
    padding: 11px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn.primary {
    color: #1a1206;
    background: linear-gradient(135deg, #ffd166, #ff9f3d);
    box-shadow: 0 4px 14px rgba(255, 160, 60, 0.3);
  }
  .btn.primary:hover {
    box-shadow: 0 6px 20px rgba(255, 160, 60, 0.45);
    transform: translateY(-1px);
  }
  .btn.primary:active { transform: translateY(1px); box-shadow: 0 2px 8px rgba(255, 160, 60, 0.25); }
  .btn.ghost {
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    border: 1px solid var(--border, #3a3654);
  }
  .btn.ghost:hover { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.3); }
  .btn.ghost:active { transform: scale(0.97); }
</style>
