<script lang="ts">
  import { uiState } from "../../stores/uiStore.svelte";

  type TabId = "scene" | "attrs" | "quest" | "log";

  const tabs: Array<{ id: TabId; icon: string; label: string }> = [
    { id: "scene", icon: "🗺️", label: "场景" },
    { id: "attrs", icon: "📊", label: "属性" },
    { id: "quest", icon: "📋", label: "任务" },
    { id: "log", icon: "📜", label: "日志" },
  ];

  function select(id: TabId): void {
    uiState.mobileTab = id;
    // 移动端切到该面板时强制展开，确保内容完整显示
    if (id === "attrs") uiState.attrPanelOpen = true;
    if (id === "quest") uiState.questPanelOpen = true;
  }
</script>

<div class="mobile-tabbar hud-scope">
  {#each tabs as t}
    <button class="tab" class:active={uiState.mobileTab === t.id} onclick={() => select(t.id)}>
      <span class="tab-icon">{t.icon}</span>
      <span class="tab-label">{t.label}</span>
    </button>
  {/each}
</div>

<style>
  .mobile-tabbar {
    display: none; /* 桌面端隐藏，移动端媒体查询中显示 */
    align-items: stretch;
    justify-content: space-around;
  }
  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    color: var(--text-dim);
    font-size: 11px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .tab:active {
    background: rgba(255, 209, 102, 0.15);
    transform: scale(0.95);
  }
  .tab.active {
    color: var(--accent);
    background: rgba(255, 209, 102, 0.1);
  }
  .tab-icon {
    font-size: 20px;
    line-height: 1;
  }
  .tab-label {
    font-weight: 600;
  }
</style>
