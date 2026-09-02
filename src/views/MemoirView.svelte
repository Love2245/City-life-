<script lang="ts">
  // 都市生活 v0.991 — 回忆录：历次生平的结局记录
  import { profile, goto } from "../stores/gameStore.svelte";
  import { formatMoney } from "../lib/format";

  const TIER_LABEL: Record<string, string> = { bad: "失败", good: "成功", secret: "隐藏" };
  const MODE_LABEL: Record<string, string> = { normal: "普通", eternal: "永恒", story: "剧情" };
</script>

<div class="memoir-root">
  <div class="memoir-panel">
    <div class="memoir-head">
      <button class="btn" onclick={() => goto("menu")}>← 返回</button>
      <h2 class="memoir-title">📖 回忆录</h2>
      <span class="memoir-count dim">共 {profile.memoirs.length} 段人生</span>
    </div>

    {#if profile.memoirs.length === 0}
      <p class="memoir-empty dim">还没有任何记录。在这座城市走完一段人生，它会出现在这里。</p>
    {:else}
      <div class="memoir-list">
        {#each profile.memoirs as m}
          <div class="memoir-card">
            <div class="m-top">
              <span class="m-name">{m.endingName}</span>
              <span class="m-tier {m.tier}">{TIER_LABEL[m.tier]}</span>
            </div>
            <div class="m-meta dim">
              <span>存活 {m.survivedDays} 天</span>
              <span>· {MODE_LABEL[m.mode] ?? m.mode}</span>
              <span>· 余额 {formatMoney(m.money)}</span>
              <span>· ✦{m.fatePoints}</span>
            </div>
            <div class="m-reason dim">{m.reason}</div>
            <div class="m-at dim">{m.at}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .memoir-root {
    height: 100%;
    display: flex;
    justify-content: center;
    padding: 32px 16px;
    background: var(--bg, #11151c);
    overflow: auto;
  }
  .memoir-panel {
    width: 560px;
    max-width: 100%;
  }
  .memoir-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  .memoir-title {
    flex: 1;
    font-size: 22px;
    margin: 0;
  }
  .memoir-empty {
    font-size: 14px;
  }
  .memoir-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .memoir-card {
    background: var(--panel, #1e2636);
    border: 1px solid var(--line, #2c3650);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .m-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .m-name {
    font-size: 15px;
    font-weight: 600;
  }
  .m-tier {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 8px;
  }
  .m-tier.bad {
    color: #ff5c72;
    border: 1px solid #ff5c72;
  }
  .m-tier.good {
    color: #46d18a;
    border: 1px solid #46d18a;
  }
  .m-tier.secret {
    color: #b48cff;
    border: 1px solid #b48cff;
  }
  .m-meta {
    font-size: 12px;
    margin-top: 6px;
  }
  .m-reason {
    font-size: 12px;
    margin-top: 4px;
  }
  .m-at {
    font-size: 11px;
    margin-top: 4px;
  }
</style>
