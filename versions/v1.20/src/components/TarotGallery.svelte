<script lang="ts">
  /**
   * v0.985 塔罗图鉴
   * 22 张大阿卡纳（0 愚者 ~ 21 世界），替代 v0.94 的字符串成就系统。
   * 未解锁只显示牌背 + 条件提示；点击任意牌展开详情。
   */
  import { gameState } from "../stores/gameStore.svelte";
  import { TAROT_CARDS, tarotUnlockedCount, tarotTotal, type TarotCard } from "../game/core/tarot";

  /** 罗马数字（0 用 0 表示，符合塔罗惯例） */
  const ROMAN = [
    "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
  ];

  /** 每张牌的图标（与象征意义呼应） */
  const ICONS = [
    "🃏", "🎩", "📜", "👑", "🏛️", "⛪", "💞", "🏎️", "🦁", "🏮", "🎡",
    "⚖️", "🙃", "💀", "🍶", "😈", "🗼", "⭐", "🌙", "☀️", "📯", "🌍",
  ];

  const unlockedSet = $derived(new Set(gameState.tarot.unlocked));
  const uCount = $derived(tarotUnlockedCount(gameState));
  const tCount = $derived(tarotTotal());
  const pct = $derived(tCount ? (uCount / tCount) * 100 : 0);

  let selected = $state<number | null>(null);
  const selectedCard = $derived<TarotCard | undefined>(
    selected === null ? undefined : TAROT_CARDS[selected],
  );
  const selectedUnlocked = $derived(selected !== null && unlockedSet.has(selected));

  function pick(id: number) {
    selected = selected === id ? null : id;
  }
</script>

<div class="tarot">
  <div class="t-head">
    <span class="t-title">🔮 塔罗图鉴</span>
    <span class="t-progress">{uCount} / {tCount}</span>
  </div>
  <div class="t-bar"><div class="t-bar-fill" style="width:{pct.toFixed(1)}%"></div></div>
  <div class="t-sub dim">
    {#if uCount >= tCount}
      大阿卡纳已然圆满 —— 世界在你脚下。
    {:else if unlockedSet.has(21)}
      圆满。
    {:else if uCount >= 21}
      仅差最后一步，世界牌即将显现。
    {:else}
      集齐前 21 张后，「世界」将自动降临。
    {/if}
  </div>

  <div class="t-grid">
    {#each TAROT_CARDS as card (card.id)}
      {@const ok = unlockedSet.has(card.id)}
      <button
        class="t-card"
        class:locked={!ok}
        class:active={selected === card.id}
        onclick={() => pick(card.id)}
        title={ok ? card.name : "未解锁"}
      >
        <span class="t-num">{ROMAN[card.id]}</span>
        <span class="t-icon">{ok ? ICONS[card.id] : "🔒"}</span>
        <span class="t-name">{ok ? card.name : "???"}</span>
      </button>
    {/each}
  </div>

  {#if selectedCard}
    <div class="t-detail" class:locked={!selectedUnlocked}>
      <div class="t-d-head">
        <span class="t-d-icon">{selectedUnlocked ? ICONS[selectedCard.id] : "🔒"}</span>
        <div class="t-d-title">
          <div class="t-d-name">
            {ROMAN[selectedCard.id]} · {selectedCard.name}
            {#if selectedUnlocked}<span class="tag-ok">已解锁</span>{/if}
          </div>
          <div class="t-d-symbol dim">象征 · {selectedCard.symbol}</div>
        </div>
      </div>
      <div class="t-d-hint">{selectedCard.hint}</div>
    </div>
  {:else}
    <div class="t-tip dim">点击任意牌位查看象征与解锁条件。</div>
  {/if}
</div>

<style>
  .tarot {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .t-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .t-title {
    font-size: 14px;
    font-weight: 700;
  }
  .t-progress {
    font-size: 12px;
    font-weight: 700;
    color: #d9b3ff;
  }
  .t-bar {
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .t-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #8e6bff, #d9b3ff, #ffd166);
    transition: width 0.35s ease;
  }
  .t-sub {
    font-size: 11px;
    line-height: 1.5;
  }
  .t-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .t-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 7px 2px 6px;
    border-radius: 8px;
    cursor: pointer;
    color: inherit;
    font: inherit;
    background: linear-gradient(160deg, rgba(142, 107, 255, 0.22), rgba(255, 209, 102, 0.12));
    border: 1px solid rgba(217, 179, 255, 0.45);
    box-shadow: inset 0 0 8px rgba(217, 179, 255, 0.12);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }
  .t-card:hover {
    transform: translateY(-2px);
  }
  .t-card.locked {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: none;
    opacity: 0.62;
  }
  .t-card.active {
    border-color: #ffd166;
    box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.5);
  }
  .t-num {
    font-size: 9px;
    letter-spacing: 0.5px;
    opacity: 0.75;
  }
  .t-icon {
    font-size: 18px;
    line-height: 1.1;
  }
  .t-name {
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }
  .t-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(142, 107, 255, 0.12);
    border: 1px solid rgba(217, 179, 255, 0.35);
  }
  .t-detail.locked {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
  }
  .t-d-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .t-d-icon {
    font-size: 26px;
    flex-shrink: 0;
  }
  .t-d-title {
    min-width: 0;
    flex: 1;
  }
  .t-d-name {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tag-ok {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(107, 203, 119, 0.18);
    color: #6bcb77;
  }
  .t-d-symbol {
    font-size: 11px;
  }
  .t-d-hint {
    font-size: 11.5px;
    line-height: 1.6;
  }
  .t-tip {
    font-size: 11px;
    text-align: center;
    padding: 4px 0;
  }
  .dim {
    opacity: 0.68;
  }
</style>
