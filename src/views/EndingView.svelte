<script lang="ts">
  import { gameState, profile, goto, backToMenu, settleEndingProfile } from "../stores/gameStore.svelte";
  import { formatMoney } from "../lib/format";
  import { getEnding, endingGallery, isStoryExclusiveEnding } from "../game/core/endings";
  import { gameDay } from "../game/core/calendar";
  /** 当前结局（已触发则展示，否则展示图鉴空态） */
  const ended = $derived(gameState.endingId ? getEnding(gameState.endingId) : null);
  const gallery = $derived(endingGallery(gameState, profile.unlockedEndings));
  const unlockedEndingCount = $derived(gallery.filter((entry) => entry.unlocked).length);

  /** v0.99 修复：存活时长 = 从开局（2026-08-01）起累计的绝对天数（原显示当前日期而非存活天数） */
  const survived = $derived(
    gameDay({ year: gameState.time.year, month: gameState.time.month, day: gameState.time.day }),
  );

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
      <div class="h1"><span class="gi-emoji" style="font-size:34px;line-height:1">{ended.icon}</span> {ended.name}</div>
      <p class="ending-desc dim">{ended.desc}</p>
      <p class="ending-text">{ended.text}</p>
      <div class="stats">
        <div>存活 {Math.floor(survived / 360)} 年 {Math.floor((survived % 360) / 30)} 月 {(survived % 30) + 1} 天</div>
        <div>余额 {formatMoney(gameState.player.money)}</div>
        <div>解锁结局 {unlockedEndingCount}/{gallery.length}</div>
      </div>
      {#if !gameState.flags["fate_settled"]}
        <div class="settlement-warning" role="status">
          <span>结局奖励还没成功保存。请检查存储空间，并在开始新生活前重试。</span>
          <button class="btn" onclick={settleEndingProfile}>重试保存结局奖励</button>
        </div>
      {/if}
      <div class="btns">
        <button class="btn btn-primary" onclick={() => goto("background")}>🆕 开始新生活</button>
        <button class="btn" onclick={() => backToMenu()}>返回主菜单</button>
      </div>
    </div>
  {:else}
    <div class="gallery-empty-head">
      <div class="h1">🎬 结局图鉴</div>
      <button class="btn" onclick={() => backToMenu()}>← 返回主菜单</button>
    </div>
    <p class="dim">尚未触发任何结局，继续在都市里生活吧。</p>
  {/if}

  <!-- 结局图鉴（含未解锁占位） -->
  <div class="gallery">
    <div class="gallery-head">📖 结局图鉴（{unlockedEndingCount}/{gallery.length}）</div>
    <div class="gallery-grid">
      {#each gallery as g (g.ending.id)}
        {@const tt = tierTag(g.ending.tier)}
        {@const storyExcl = isStoryExclusiveEnding(g.ending.id)}
        <div class="g-card" class:locked={!g.unlocked}>
          <span class="gi-emoji" style="font-size:30px;line-height:1">{g.unlocked ? g.ending.icon : "❓"}</span>
          <div class="g-name">{g.unlocked ? g.ending.name : (storyExcl ? "剧情模式结局" : "？？？")}</div>
          <div class="g-desc dim">{g.unlocked ? g.ending.desc : (storyExcl ? "需开启剧情模式才能达成，普通模式默认不可达" : "尚未解锁")}</div>
          {#if storyExcl}
            <span class="story-excl-badge">🎭 剧情模式专属</span>
          {:else if g.unlocked}
            <span class={tt.cls}>{tt.text}</span>
          {/if}
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
  .gallery-empty-head {
    width: min(760px, 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
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
  .ending-epilogue {
    background: rgba(91, 140, 255, 0.08);
    border: 1px solid rgba(91, 140, 255, 0.28);
    border-left: 3px solid var(--accent, #5b8cff);
    border-radius: 10px;
    padding: 12px 14px;
    text-align: left;
  }
  .ep-title {
    font-size: 12px;
    font-weight: 800;
    color: var(--accent, #5b8cff);
    margin-bottom: 5px;
  }
  .ending-epilogue p {
    font-size: 13.5px;
    line-height: 1.8;
    margin: 0;
  }
  .stats {
    font-size: 13px;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .settlement-warning {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid rgba(230, 173, 92, .45);
    border-radius: 10px;
    background: rgba(120, 79, 26, .18);
    color: var(--text-main);
    font-size: 12px;
    line-height: 1.5;
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
  /* v1.43 修复：剧情模式专属结局标记（清晰说明并非 bug 缺失） */
  .story-excl-badge {
    align-self: center;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(201, 139, 255, 0.16);
    border: 1px solid rgba(201, 139, 255, 0.45);
    color: #d9b8ff;
  }

  /* 低高度窗口不能继续把整张图鉴垂直居中，否则顶部返回按钮会被挤到视口外。 */
  @media (max-height: 700px) {
    .ending-root {
      justify-content: flex-start;
      padding-top: 12px;
    }
  }
</style>
