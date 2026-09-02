<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";

  /** 最近 50 条日志（新→旧） */
  const recent = $derived([...gameState.log].reverse().slice(0, 50));

  function periodText(p: string): string {
    return { morning: "上午", afternoon: "下午", evening: "晚上", night: "深夜" }[p] ?? p;
  }

  let logBody: HTMLElement;

  /** v1.39 新日志自动滚动到底部 */
  $effect(() => {
    gameState.log.length;
    const el = logBody;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
</script>

<div class="log-panel hud-scope">
  <div class="log-head">
    <span>📜 行动日志</span>
    <span class="dim count">{gameState.log.length} 条</span>
  </div>
  <div class="log-body" bind:this={logBody}>
    {#if recent.length === 0}
      <div class="empty">还没有任何记录，去做点什么吧</div>
    {:else}
      {#each recent as entry, i}
        <div class="log-entry" class:new={i === 0}>
          <span class="icon">{entry.icon}</span>
          <span class="meta">D{entry.day} {entry.hour != null ? `${String(entry.hour).padStart(2, "0")}:00` : periodText(entry.period)}</span>
          {entry.text}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .log-panel {
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.62);
    border-top: 1px solid var(--border);
    background: rgba(16, 19, 31, 0.68);
    height: 180px;
    display: flex;
    flex-direction: column;
    /* v0.91：日志文字加深色描边 */
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .log-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid rgba(51, 59, 99, 0.5);
  }
  .count {
    font-size: 11px;
    font-weight: 400;
  }
  .log-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 12.5px;
    text-align: center;
    padding: 20px 0;
  }
  .meta {
    font-size: 11px;
    color: var(--text-dim);
    margin-right: 6px;
    opacity: 0.75;
  }
</style>
