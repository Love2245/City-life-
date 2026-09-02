<script lang="ts">
  import { gameState, goto, backToMenu } from "../stores/gameStore.svelte";
  import { formatMoney } from "../lib/format";
  import { getEnding, endingGallery } from "../game/core/endings";

  /** 当前结局（已触发则展示，否则展示图鉴空态） */
  const ended = $derived(gameState.endingId ? getEnding(gameState.endingId) : null);
  const gallery = $derived(endingGallery(gameState));

  /** 结局类型标签 */
  function tierTag(tier: string | undefined): { text: string; cls: string } {
    switch (tier) {
      case "bad":
        return { text: "失败结局", cls: "tag danger" };
      case "good":
        return { text: "成功结局", cls: "tag gain" };
      case "secret":
        return { text: "隐藏结局", cls: "tag info" };
      default:
        return { text: "结局", cls: "tag info" };
    }
  }
</script>

<div class="ending-root">
  {#if ended}
    <div class="ending-main card">
      <div class="h1">{ended.icon} {ended.name}</div>
      <p class="ending-desc dim">{ended.desc}</p>
      <p class="ending-text">{ended.text}</p>
      <div class="stats">
        <div>存活 {gameState.time.year} 年 {gameState.time.month} 月 {gameState.time.day} 天</div>
        <div>余额 {formatMoney(gameState.player.money)}</div>
        <div>解锁结局 {gameState.unlockedEndings.length}/{gallery.length}</div>
      </div>
      <div class="btns">
        <button class="btn btn-primary" onclick={() => goto("background")}>🆕 开始新生活</button>
        <button class="btn" onclick={() => backToMenu()}>返回主菜单</button>
      </div>
    </div>
  {:else}
    <div class="h1">🎬 结局图鉴</div>
    <p class="dim">尚未触发任何结局，继续在都市里生活吧。</p>
  {/if}

  <!-- 结局图鉴（含未解锁占位） -->
  <div class="gallery">
    <div class="gallery-head">📖 结局图鉴（{gameState.unlockedEndings.length}/{gallery.length}）</div>
    <div class="gallery-grid">
      {#each gallery as g (g.ending.id)}
        {@const tt = tierTag(g.ending.tier)}
        <div class="g-card" class:locked={!g.unlocked}>
          <div class="g-icon">{g.unlocked ? g.ending.icon : "❓"}</div>
          <div class="g-name">{g.unlocked ? g.ending.name : "？？？"}</div>
          <div class="g-desc dim">{g.unlocked ? g.ending.desc : "尚未解锁"}</div>
          {#if g.unlocked}<span class={tt.cls}>{tt.text}</span>{/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .ending-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 24px;
    overflow-y: auto;
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
  }
  .ending-main {
    width: 420px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 28px;
  }
  .ending-desc {
    font-size: 14px;
    font-weight: 600;
  }
  .ending-text {
    font-size: 14px;
    line-height: 1.8;
    color: var(--text-main);
  }
  .stats {
    font-size: 13px;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .btns {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .gallery {
    width: min(720px, 92%);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gallery-head {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .g-card {
    background: var(--grad-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  .g-card.locked {
    opacity: 0.55;
    filter: grayscale(0.6);
  }
  .g-icon {
    font-size: 30px;
  }
  .g-name {
    font-size: 14px;
    font-weight: 700;
  }
  .g-desc {
    font-size: 12px;
    line-height: 1.4;
  }
</style>
