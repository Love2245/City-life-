<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
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
  import LaptopDesktopView from "../components/layout/LaptopDesktopView.svelte";
  import CatPanel from "../components/CatPanel.svelte";
  import BattleView from "../components/BattleView.svelte";
  import AdoptModal from "../components/layout/AdoptModal.svelte";
  import CatEncounterModal from "../components/layout/CatEncounterModal.svelte";
  import CardOfferModal from "../components/layout/CardOfferModal.svelte";
  import HospitalTrainModal from "../components/layout/HospitalTrainModal.svelte";
  import { uiState, initZoom, closeNpcTalk } from "../stores/uiStore.svelte";
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

  /** v1.39 全局 Escape 关闭弹窗：按优先级逐层关闭 */
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    // 最高层：NPC 对话
    if (uiState.npcTalk) { closeNpcTalk(); return; }
    // 故事卡片：允许 Escape 关闭（即使未完成选择也可关闭）
    if (uiState.storyCardPayload) { uiState.storyCardPayload = null; return; }
    // 战斗界面不响应 Escape（防止误触）
    if (uiState.modal === "battle") return;
    // 其他弹窗统一关闭
    if (uiState.modal) { uiState.modal = null; return; }
  }

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

  /** v1.4 P4 外出遭遇野生对决：自动弹出战斗界面（一次性标记） */
  $effect(() => {
    if (gameState.flags["cat_battle_pending"]) {
      gameState.flags["cat_battle_pending"] = false;
      uiState.modal = "battle";
    }
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

<svelte:window onkeydown={handleKeydown} />

{#if uiState.transition}
  <div class="scene-transition-overlay" transition:fade={{ duration: 200 }}>
    <div class="scene-transition-card">
      <div class="scene-transition-icon">{uiState.transition.kind === "bus" ? "🚌" : uiState.transition.kind === "train" ? "🚄" : "🚶"}</div>
      <div class="scene-transition-label">正在前往 {uiState.transition.label}</div>
      <div class="scene-transition-bar"><div class="scene-transition-fill"></div></div>
    </div>
  </div>
{/if}

<div class="zoom-wrapper">
  <!-- v1.12 背景移到 zoom-wrapper 层：zoom-wrapper 无 transform，fixed 背景可铺满整个视口（修复手游 letterbox 黑边） -->
  <SceneBackground />
<div class="game-root" data-tab={uiState.mobileTab}>
  <TopBar />

  <div class="main">
    <AttributeSidebar />
    <ScenePanel />
    <QuestSidebar />
    <!-- v0.92 生存告警横幅（覆盖在场景区顶部） -->
    <SurvivalBanner />
  </div>

  <!-- v1.21-beta3 手游/平板模式隐藏行动日志，避免挤占横屏空间 -->
  {#if uiState.gameMode === "pc"}
    <LogPanel />
  {/if}

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

  <!-- v1.3 笔记本全屏桌面 -->
  {#if uiState.modal === "laptop"}
    <LaptopDesktopView />
  {/if}

  <!-- v1.4 P2 猫咪面板 -->
  {#if uiState.modal === "cat"}
    <CatPanel />
  {/if}

  <!-- v1.4 P3 耄耋对决战斗界面 -->
  {#if uiState.modal === "battle"}
    <BattleView />
  {/if}

  <!-- v1.33 宠物用品店领养猫咪 -->
  {#if uiState.modal === "pet_adopt"}
    <AdoptModal />
  {/if}

  <!-- v1.34 公园自由锻炼遭遇战：决斗 / 逃跑 -->
  {#if uiState.modal === "cat_encounter"}
    <CatEncounterModal />
  {/if}

  <!-- 背包 -->
  {#if uiState.modal === "inventory"}
    <InventoryModal />
  {/if}

  <!-- v1.37 卡包刷新：新卡入包抉择 -->
  {#if uiState.modal === "card_offer"}
    <CardOfferModal />
  {/if}

  <!-- v1.37 宠物医院卡牌训练：特殊训练 / 专注训练 -->
  {#if uiState.modal === "hospital_train"}
    <HospitalTrainModal />
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
    /* v1.21-beta2 热修：由 100vw/100vh 改为 100%，使旋转后的 #app 容器能正确包裹游戏 */
    width: 100%;
    height: 100%;
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
    flex: 1;
    display: flex;
    min-height: 0;
  }
  :global(.log-panel) {
    position: relative;
    z-index: 5;
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

  /* v1.39 场景切换过渡动画 */
  .scene-transition-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(8, 10, 18, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .scene-transition-card {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .scene-transition-icon {
    font-size: 48px;
    animation: sceneIconBounce 0.6s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
  }
  @keyframes sceneIconBounce {
    from { transform: translateY(0); }
    to { transform: translateY(-8px); }
  }
  .scene-transition-label {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-main, #eef1ff);
    letter-spacing: 1px;
  }
  .scene-transition-bar {
    width: 200px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }
  .scene-transition-fill {
    height: 100%;
    background: var(--accent, #ffd166);
    border-radius: 2px;
    animation: sceneBarFill 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  @keyframes sceneBarFill {
    from { width: 0%; }
    to { width: 100%; }
  }
</style>
