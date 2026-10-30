<script lang="ts">
  import CatDuelHub from "../components/CatDuelHub.svelte";
  import {duelLobby} from "../stores/catDuelStore.svelte";
  import { onMount } from "svelte";
  import TopBar from "../components/layout/TopBar.svelte";
  import AttributeSidebar from "../components/layout/AttributeSidebar.svelte";
  import ScenePanel from "../components/layout/ScenePanel.svelte";
  import { currentHomeSceneId } from "../game/core/homeInterior";
  import { companyOfficeHere } from '../game/core/companyOverview';
  import { isCafeLocation } from "../lib/cafeScene";
  import { isConvenienceStore } from "../lib/convenienceStore/facilities";
  import QuestSidebar from "../components/layout/QuestSidebar.svelte";
  import LogPanel from "../components/layout/LogPanel.svelte";
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
  import CityTipModal from "../components/layout/CityTipModal.svelte";
  import BookshelfModal from "../components/BookshelfModal.svelte";
  import TempleGiftShopModal from "../components/TempleGiftShopModal.svelte";
  import WardrobeModal from "../components/layout/WardrobeModal.svelte";
  import ClothingStoreModal from "../components/layout/ClothingStoreModal.svelte";
  import FacilityShoppingModal from '../components/layout/FacilityShoppingModal.svelte';
  import MiniGameModal from "../components/layout/MiniGameModal.svelte";
  import LaptopDesktopView from "../components/layout/LaptopDesktopView.svelte";
  import CatPanel from "../components/CatPanel.svelte";
  import BattleView from "../components/BattleView.svelte";
  import AdoptModal from "../components/layout/AdoptModal.svelte";
  import CatEncounterModal from "../components/layout/CatEncounterModal.svelte";
  import CardOfferModal from "../components/layout/CardOfferModal.svelte";
  import HospitalTrainModal from "../components/layout/HospitalTrainModal.svelte";
  import IntercityTransitModal from "../components/layout/IntercityTransitModal.svelte";
  import CookingWorkbench from "../components/layout/CookingWorkbench.svelte";
  import FridgePanel from "../components/layout/FridgePanel.svelte";
  import { uiState, presentStreetPerformance, presentWorkSession, showToast, closeModal, resolveConfirm } from "../stores/uiStore.svelte";
  import { gameState, goto, backToMenu } from "../stores/gameStore.svelte";
  import { saveGame } from "../lib/save";
import { shouldShowRotatePrompt } from "../lib/mobileLayout";
  import { formatDate, formatMoney } from "../lib/format";
  import { LOCATION_NAMES } from "../lib/icons";
  import { pendingStreetPerformance } from "../game/core/streetPerformance";
  import { pauseWork } from "../game/core/jobs";
  

  /** v0.92 当前最严重的生存告警等级，驱动整屏红色描边 */
  const severity = $derived(worstSeverity(gameState));
  /** 地图选择态使用独立画布，暂时收起会遮挡地图的 HUD。 */
  const mapSelection = $derived(gameState.locationId === "map");
  const homeSelection = $derived(!!currentHomeSceneId(gameState));
  const immersiveSelection = $derived(companyOfficeHere(gameState) || homeSelection || isCafeLocation(gameState.locationId) || isConvenienceStore(gameState.locationId));

  let saving = $state(false);
  /** 今晚是否已提醒选住宿（防止重复弹窗） */
  let lodgingReminded = $state(false);

  let isPortrait = $state(false);
  onMount(() => {
    // initZoom 已上移到 main.ts（挂载前执行），此处只维护竖屏判定。
    const updateOrientation = () => {
      isPortrait = window.matchMedia?.("(orientation: portrait)")?.matches ?? window.innerHeight > window.innerWidth;
    };
    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);
    return () => {
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  });

  // A loaded shift is persisted while the modal is not. Lock the scene and
  // resume on a pause screen, so no other action can advance time first.
  $effect(() => {
    const active = gameState.work?.active;
    if (active && uiState.modal !== "minigame" && uiState.dismissedWorkSessionId !== active.id) {
      pauseWork(gameState);
      presentWorkSession();
    }
  });

  $effect(() => {
    if (pendingStreetPerformance(gameState) && !uiState.modal) presentStreetPerformance();
  });

  /** v1.43 全局 Escape 关闭弹窗：NPC 会话只能通过对话选项结束。 */
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    if (uiState.npcTaskPanel) return;
    if (uiState.confirmRequest) { e.preventDefault(); resolveConfirm(false); return; }
    // 阅读器自行收束延迟的读书结算；避免全局快捷键绕过关闭回调。
    if (uiState.modal === "reader") return;
    // NPC 全屏会话不响应 Escape，也不让 Escape 穿透关闭下面的弹窗。
    if (uiState.npcTalk) return;
    // 故事卡片：允许 Escape 关闭（即使未完成选择也可关闭）
    if (uiState.storyCardPayload) { closeModal(); return; }
    if (uiState.modal === "battle" || uiState.modal === "card_offer") return;
    // v1.43：烹饪弹窗自己处理 Escape——关它必须先结算已完成的成品（存冰箱 / 立即食用），
    // 否则「已扣食材、成品只在本地状态」的那一步会被直接丢弃。
    if (uiState.modal === "cooking") return;
    // 小游戏弹窗的 Escape 完全交给 MiniGameModal 裁决（正式班次走暂停、休闲局走跳过，
    // 与其 ✕ 按钮一致）。此处若再兜底 closeModal，两条 keydown 路径会竞态：
    // 一边关弹窗一边 finish(0) 弹 0 分结算窗。
    if (uiState.modal === "minigame") return;
    // 其他弹窗统一关闭
    if (uiState.modal) { closeModal(); return; }
  }

  /** 入睡前提醒：mode=nightly 且 22 点后且未选住宿 → 弹窗 */
  $effect(() => {
    const hour = gameState.time.hour;
    const mode = gameState.living.mode;
    // v1.43.x：已定「今晚外宿」（awayNight）也视为安排好住宿，不再重复提醒
    if (mode === "nightly" && hour >= 22 && !gameState.living.nightly && !gameState.living.awayNight && !lodgingReminded && uiState.modal === null) {
      uiState.modal = "lodging";
      lodgingReminded = true;
    }
    // 次日清晨重置提醒
    if (hour < 7) lodgingReminded = false;
  });

  /** v1.4 P4 外出遭遇野生对决：自动弹出战斗界面（一次性标记） */
  $effect(() => {
    if ((gameState.catBattle || gameState.flags["cat_battle_pending"]) && uiState.modal === null) {
      gameState.flags["cat_battle_pending"] = false;
      // 试玩场标记必须随之清除：否则 shouldCheckpointGameSession 会静默跳过本次会话的
      // 全部自动存档（含 backToMenu 的脏进度确认），且该 flag 会随手动存档永久污染角色。
      delete gameState.flags["cat_battle_sandbox"];
      uiState.modal = "battle";
    }
  });

  $effect(() => {
    if(gameState.catDuel?.offer && !gameState.catBattle && uiState.modal === null) uiState.modal = "card_offer";
  });

  async function handleSave(): Promise<void> {
    saving = true;
    try {
      await saveGame("auto", gameState);
      uiState.modal = null;
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "快速存档失败，请在存档页检查存储空间");
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />


{#if shouldShowRotatePrompt(uiState.gameMode, isPortrait)}
  <div class="mobile-portrait-block" role="status" aria-live="polite">
    <div class="rotate-icon">🔄</div>
    <div class="rotate-title">请将手机横置</div>
    <div class="rotate-text">{uiState.gameMode === "pe" ? "PE 模式为手机横屏设计，旋转设备后即可继续游玩。" : "手游模式按 20:9 横屏设计，旋转设备后即可继续游玩。"}</div>
  </div>
{/if}

<div class="zoom-wrapper" class:minigame-open={uiState.modal === "minigame"} class:phone-open={uiState.modal === "phone"}>
  <!-- v1.12 背景移到 zoom-wrapper 层：zoom-wrapper 无 transform，fixed 背景可铺满整个视口（修复手游 letterbox 黑边） -->
  {#if !immersiveSelection}<SceneBackground />{/if}
  <div class="game-root" class:home-immersive={immersiveSelection}>
  {#if !immersiveSelection}<TopBar />{/if}

  <!-- v1.44：地图态的精简生存速览由 ScenePanel 的 .map-survival-strip 独家承担
       （饱食/精力/心情，带进度条，按容器宽度自适应）。此处原有一份等价实现是重复渲染，
       已删除——它在 PC 与手游下都会与 ScenePanel 的那份同时出现在屏幕上。 -->

  <div class="main" class:map-selection={mapSelection || immersiveSelection} class:home-selection={immersiveSelection} class:phone-pocket-layout={!mapSelection && !immersiveSelection}>
    {#if !mapSelection && !immersiveSelection}
      <AttributeSidebar />
    {/if}
    <ScenePanel />
    {#if !mapSelection && !immersiveSelection}

      <!-- v0.92 生存告警横幅（覆盖在场景区顶部） -->
      <SurvivalBanner />
    {/if}
  </div>

  {#if !immersiveSelection}<QuestSidebar />{/if}

  <!-- v1.21-beta3 手游/平板模式不常驻行动日志（会吃掉半个横屏画布），
       v1.44 起改由顶栏 📜 按需全屏查看，内容与端游常驻日志条完全一致。 -->
  {#if uiState.gameMode === "pc" && !mapSelection && !immersiveSelection && uiState.showLog}
    <LogPanel />
  {/if}

  <!-- v1.44 手游：行动日志全屏弹层（与端游日志条同源同一组件） -->
  {#if uiState.modal === "log"}
    <div
      class="overlay hud-scope"
      role="presentation"
      onclick={() => (uiState.modal = null)}
      onkeydown={(e) => { if (e.key === "Escape") uiState.modal = null; }}
    >
      <div
        class="log-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="行动日志"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <LogPanel />
        <div class="log-sheet-foot">
          <button class="btn btn-primary" onclick={() => (uiState.modal = null)}>关闭</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- v0.92 严重生存危机：整屏红色描边呼吸 -->
  {#if severity === "danger" || severity === "critical"}
    <div class="danger-vignette" class:critical={severity === "critical"}></div>
  {/if}

  <!-- 住宿选择弹层 -->
  {#if uiState.modal === "city_tip"}<CityTipModal/>{/if}
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
  {#if uiState.modal === "phone" || uiState.modalStack.some((frame) => frame.modal === "phone")}
    <PhoneView underlay={uiState.modal !== "phone"} />
  {/if}

  <!-- v1.3 笔记本全屏桌面 -->
  {#if uiState.modal === "laptop"}
    <LaptopDesktopView />
  {/if}

  <!-- v1.4 P2 猫咪面板 -->
  {#if uiState.modal === "cat"}
    <CatPanel />
  {/if}

  {#if uiState.modal === "cat_duel"}
    <CatDuelHub source={duelLobby.source} />
  {/if}

  <!-- v1.4 P3 耄耋对决战斗界面 -->
  {#if uiState.modal === "battle"}
    <BattleView />
  {/if}

  <!-- v1.4 城际车站交通面板 -->
  {#if uiState.modal === "intercity"}
    <IntercityTransitModal />
  {/if}

  <!-- v1.42 自由烹饪工作台 -->
  {#if uiState.modal === "cooking"}
    <CookingWorkbench />
  {/if}
  {#if uiState.modal === "fridge"}
    <FridgePanel />
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
  {#if uiState.modal === "inventory" || uiState.modal === "home_storage" || uiState.modalStack.some((frame) => frame.modal === "inventory" || frame.modal === "home_storage")}
    <InventoryModal storage={uiState.modal === "home_storage"} underlay={uiState.modal !== "inventory" && uiState.modal !== "home_storage"} />
  {/if}
  {#if uiState.modal === "bookshelf" || uiState.modalStack.some((frame) => frame.modal === "bookshelf")}
    <BookshelfModal underlay={uiState.modal !== "bookshelf"} />
  {/if}
  {#if uiState.modal === "temple_gift_shop"}
    <TempleGiftShopModal />
  {/if}
  <!-- v1.45 玩家衣柜与商场服装店 -->
  {#if uiState.modal === "wardrobe"}
    <WardrobeModal />
  {/if}
  {#if uiState.modal === "clothing_store"}
    <ClothingStoreModal />
  {/if}
  {#if uiState.modal === 'facility_shop'}
    <FacilityShoppingModal />
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
  .mobile-portrait-block {
    position: fixed;
    inset: 0;
    z-index: 15000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    color: #eef2ff;
    background: radial-gradient(120% 120% at 50% 0%, #1b2440 0%, #0b1020 55%, #070b16 100%);
  }
  .rotate-icon { font-size: 52px; animation: rotate-hint 1.8s ease-in-out infinite; }
  .rotate-title { font-size: 20px; font-weight: 800; }
  .rotate-text { max-width: 320px; color: rgba(238, 242, 255, 0.72); line-height: 1.6; }
  @keyframes rotate-hint { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(90deg); } }
  .game-root {
    /* v1.44.1 UI 缩放上移到 App 壳层 .app-zoom（全局生效，含小游戏），
       此处退回纯布局：不再自带 transform scale 与 1/zoom 尺寸补偿。
       手游模式的专属缩放/安全区让位仍由 mobile.css 覆盖。 */
    width: 100%;
    height: 100%;
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
  .game-root.home-immersive { padding:0; }
  .main.home-selection { width:100%;height:100%;margin:0;gap:0; }
  :global(:root[data-game-mode="mobile"]) .game-root.home-immersive { padding:0; }
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

  /* v1.44 手游行动日志弹层 */
  .log-sheet {
    display: flex;
    flex-direction: column;
    width: min(760px, 100%);
    max-height: 100%;
    min-height: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .log-sheet :global(.log-panel) {
    flex: 1;
    min-height: 0;
    height: auto;
    border-top: none;
  }
  .log-sheet-foot {
    display: flex;
    justify-content: flex-end;
    padding: 10px 12px;
    border-top: 1px solid var(--border);
  }

</style>
