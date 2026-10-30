<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";

  /** 最近 100 条日志（新→旧），存储保留 200 条用于兼容。 */
  const recent = $derived([...gameState.log].reverse().slice(0, 100));

  function periodText(p: string): string {
    return { morning: "上午", afternoon: "下午", evening: "晚上", night: "深夜" }[p] ?? p;
  }

  let logBody: HTMLElement;

  /** v1.42 日志按新→旧排列，新日志自动回到顶部 */
  $effect(() => {
    gameState.log[gameState.log.length - 1];
    const el = logBody;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
  });
</script>

<div class="log-panel hud-scope">
  <div class="log-head">
    <span class="log-title"><span class="log-mark" aria-hidden="true"></span>行动日志</span>
    <span class="dim count">最近 {recent.length} 条</span>
  </div>
  <div class="log-body" bind:this={logBody}>
    {#if recent.length === 0}
      <div class="empty">还没有任何记录，去做点什么吧</div>
    {:else}
      {#each recent as entry, i}
        <div class="log-entry" class:new={i === 0}>
          <span class="icon">{entry.icon}</span>
          <span class="meta">D{entry.day} {entry.hour != null ? `${String(entry.hour).padStart(2, "0")}:00` : periodText(entry.period)}</span>
          <span class="entry-text">{entry.text}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .log-panel { color: var(--hud-text); border-top: 1px solid var(--hud-border); background: var(--hud-surface); height: 158px; display: flex; flex-direction: column; text-shadow: var(--hud-text-shadow); }
  .log-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px 7px; font-size: 11px; font-weight: 650; flex: 0 0 auto; }
  .log-title { display: flex; align-items: center; gap: 8px; letter-spacing: 1px; }
  .log-mark { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
  .count { font-size: 10px; font-weight: 400; color: var(--text-dim); }
  .log-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 15px 8px; scrollbar-width: thin; }
  .log-entry { display: grid; grid-template-columns: 20px 86px minmax(0, 1fr); align-items: start; gap: 6px; padding: 5px 9px; border-left: 2px solid transparent; border-bottom: 1px solid color-mix(in srgb, var(--hud-text) 4%, transparent); border-radius: 0; font-size: 11.5px; line-height: 1.6; color: var(--text-dim); }
  .log-entry.new { color: var(--text-main); border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); border-radius: 0 5px 5px 0; }
  .icon { font-size: 12px; margin: 0; }
  .meta { padding-top: 1px; font-size: 10px; color: var(--text-dim); opacity: 0.8; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .entry-text { min-width: 0; overflow-wrap: anywhere; }
  .empty { color: var(--text-dim); font-size: 12px; text-align: center; padding: 24px 0; }
  @media (max-width: 640px) { .log-entry { grid-template-columns: 17px 70px minmax(0, 1fr); gap: 3px; padding-left: 6px; padding-right: 6px; } .log-head { padding-left: 14px; padding-right: 14px; } .log-body { padding-left: 9px; padding-right: 9px; } }
</style>