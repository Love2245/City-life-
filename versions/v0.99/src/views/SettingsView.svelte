<script lang="ts">
  import { goto, gameState } from "../stores/gameStore.svelte";
  import { resetAllSaves } from "../lib/save";
  import { uiState } from "../stores/uiStore.svelte";
  import { FAMILIES } from "../game/core/families";
  import { VERSION, GAME_NAME, CHANGELOG } from "../version";

  let resetting = $state(false);

  async function doReset(): Promise<void> {
    if (!confirm("确定删除所有存档？此操作不可恢复！")) return;
    resetting = true;
    try {
      await resetAllSaves();
      uiState.modal = null;
    } finally {
      resetting = false;
    }
  }
</script>

<div class="page">
  <div class="page-head">
    <button class="btn" onclick={() => goto("game")}>← 返回</button>
    <span class="h1">🎛️ 设置</span>
    <span></span>
  </div>

  <div class="card setting-card">
    <div class="h2">关于</div>
    <p class="dim">{GAME_NAME} v{VERSION}（驾校 · 实习期 · UI 美化 · 任务栏修复 · 求职改版 · 事件增强）</p>
    <p class="dim">灵感来自安卓游戏《属性与生活》，桌面端重制。</p>
  </div>

  <div class="card setting-card">
    <div class="h2">更新日志</div>
    <div class="changelog">
      {#each CHANGELOG as entry}
        <div class="cl-entry">
          <div class="cl-head">
            <span class="cl-ver">v{entry.version}</span>
            <span class="cl-date">{entry.date}</span>
            <span class="cl-title">{entry.title}</span>
          </div>
          <ul class="cl-notes">
            {#each entry.notes as n}
              <li>{n}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>

  <div class="card setting-card danger-zone">
    <div class="h2">危险操作</div>
    <p class="dim">删除全部存档（3 个手动槽 + 自动槽）</p>
    <button class="btn btn-danger" onclick={() => doReset()} disabled={resetting}>
      {resetting ? "删除中…" : "🗑️ 重置所有存档"}
    </button>
  </div>

  <div class="card setting-card">
    <div class="h2">开发信息</div>
    <p class="dim">家庭条件：{FAMILIES.find((f) => f.id === gameState.family)?.name ?? gameState.family}</p>
    <p class="dim">当前天数：{gameState.time.day} / {gameState.time.month}月 / {gameState.time.year}年</p>
    <p class="dim">当前地点：{gameState.locationId}</p>
  </div>
</div>

<style>
  .page {
    height: 100%;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .setting-card {
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .danger-zone {
    border-color: rgba(255, 107, 107, 0.4);
  }
  .changelog {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cl-entry {
    border-left: 2px solid var(--accent);
    padding-left: 10px;
  }
  .cl-head {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }
  .cl-ver {
    color: var(--accent);
  }
  .cl-date {
    font-size: 11px;
    color: var(--text-dim);
    font-weight: 500;
  }
  .cl-title {
    font-size: 12px;
    font-weight: 600;
  }
  .cl-notes {
    margin: 4px 0 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cl-notes li {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.6;
  }
</style>
