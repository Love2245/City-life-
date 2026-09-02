<script lang="ts">
  import { onMount } from "svelte";
  import TopBar from "../components/layout/TopBar.svelte";
  import AttributeSidebar from "../components/layout/AttributeSidebar.svelte";
  import ScenePanel from "../components/layout/ScenePanel.svelte";
  import QuestSidebar from "../components/layout/QuestSidebar.svelte";
  import LogPanel from "../components/layout/LogPanel.svelte";
  import MobileTabBar from "../components/layout/MobileTabBar.svelte";
  import LodgingModal from "../components/layout/LodgingModal.svelte";
  import SleepModal from "../components/layout/SleepModal.svelte";
  import DineChoiceModal from "../components/layout/DineChoiceModal.svelte";
  import SurvivalBanner from "../components/layout/SurvivalBanner.svelte";
  import { worstSeverity } from "../game/core/survival";
  import SceneBackground from "../components/layout/SceneBackground.svelte";
  import ResultModal from "../components/ResultModal.svelte";
  import EventModal from "../components/EventModal.svelte";
  import PhoneView from "../components/PhoneView.svelte";
  import InventoryModal from "../components/InventoryModal.svelte";
  import MiniGameModal from "../components/layout/MiniGameModal.svelte";
  import { uiState, initZoom } from "../stores/uiStore.svelte";
  import { gameState, goto, backToMenu } from "../stores/gameStore.svelte";
  import { saveGame } from "../lib/save";
  import { formatDate, formatMoney } from "../lib/format";
  import { LOCATION_NAMES } from "../lib/icons";

  /** v0.92 当前最严重的生存告警等级，驱动整屏红色描边 */
  const severity = $derived(worstSeverity(gameState));

  let saving = $state(false);
  /** 今晚是否已提醒选住宿（防止重复弹窗） */
  let lodgingReminded = $state(false);

  onMount(() => initZoom());

  /** 入睡前提醒：mode=nightly 且 22 点后且未选住宿 → 弹窗 */
  $effect(() => {
    const hour = gameState.time.hour;
    const mode = gameState.living.mode;
    if (mode === "nightly" && hour >= 22 && !gameState.living.nightly && !lodgingReminded) {
      uiState.modal = "lodging";
      lodgingReminded = true;
    }
    // 次日清晨重置提醒
    if (hour < 7) lodgingReminded = false;
  });

  async function handleSave(): Promise<void> {
    saving = true;
    try {
      await saveGame("auto", gameState);
      uiState.modal = null;
    } finally {
      saving = false;
    }
  }
</script>

<div class="zoom-wrapper">
<div class="game-root" data-tab={uiState.mobileTab}>
  <SceneBackground />
  <TopBar />

  <div class="main">
    <AttributeSidebar />
    <ScenePanel />
    <QuestSidebar />
    <!-- v0.92 生存告警横幅（覆盖在场景区顶部） -->
    <SurvivalBanner />
  </div>

  <LogPanel />

  <!-- v0.981 移动端底部标签栏（桌面端隐藏） -->
  <MobileTabBar />

  <!-- v0.92 严重生存危机：整屏红色描边呼吸 -->
  {#if severity === "danger" || severity === "critical"}
    <div class="danger-vignette" class:critical={severity === "critical"}></div>
  {/if}

  <!-- 住宿选择弹层 -->
  {#if uiState.modal === "lodging"}
    <LodgingModal />
  {/if}

  <!-- 睡觉弹层 -->
  {#if uiState.modal === "sleep"}
    <SleepModal />
  {/if}

  <!-- v0.92 堂食 / 打包选择 -->
  {#if uiState.modal === "dine"}
    <DineChoiceModal />
  {/if}

  <!-- v0.95 工作小游戏 -->
  {#if uiState.modal === "minigame"}
    <MiniGameModal />
  {/if}

  <!-- 结算弹窗 -->
  {#if uiState.modal === "result"}
    <ResultModal />
  {/if}

  <!-- 随机事件弹窗 -->
  {#if uiState.modal === "event"}
    <EventModal />
  {/if}

  <!-- 手机 -->
  {#if uiState.modal === "phone"}
    <PhoneView />
  {/if}

  <!-- 背包 -->
  {#if uiState.modal === "inventory"}
    <InventoryModal />
  {/if}

  <!-- 菜单弹层 -->
  {#if uiState.modal === "settings"}
    <div class="overlay" onclick={() => (uiState.modal = null)}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-title">⚙️ 菜单</div>
        <div class="modal-body">
          <div class="info-row dim">
            {formatDate(gameState.time.year, gameState.time.month, gameState.time.day)} ·
            {LOCATION_NAMES[gameState.locationId] ?? gameState.locationId} · 余额 {formatMoney(gameState.player.money)}
          </div>
          <div class="btn-col">
            <button class="btn btn-primary" onclick={() => handleSave()} disabled={saving}>
              {saving ? "保存中…" : "💾 快速存档（自动槽）"}
            </button>
            <button class="btn" onclick={() => goto("saveLoad")}>📂 存档 / 读档</button>
            <button class="btn" onclick={() => goto("settings")}>🎛️ 设置</button>
            <button class="btn btn-danger" onclick={() => backToMenu()}>🏠 返回主菜单</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
</div>

<style>
  .zoom-wrapper {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }
  .game-root {
    width: calc(100% / var(--ui-zoom));
    height: calc(100% / var(--ui-zoom));
    transform: scale(var(--ui-zoom));
    transform-origin: top left;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .main {
    position: relative;
    z-index: 5;
  }
  :global(.log-panel) {
    position: relative;
    z-index: 5;
  }
  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 340px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .modal-title {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 14px;
  }
  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .info-row {
    font-size: 12.5px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
