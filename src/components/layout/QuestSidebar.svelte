<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, toggleQuestPanel } from "../../stores/uiStore.svelte";
  import { generateDailyGoals, tickDailyGoals } from "../../game/core/quests";
  import { pushLog } from "../../game/engine";
  import PhoneScreen from "../PhoneScreen.svelte";

  /**
   * v0.91：手机与任务栏融合 —— 右侧栏就是一部手机。
   * v1.26：右侧面板直接复用完整手机（PhoneScreen，panel 模式），
   * 主页即统一入口，所有 App（待办/通信/游戏/学习/招聘/应用市场/外卖/资产/关系/目标/塔罗/设置）
   * 默认全部直达，游戏内直接集成 4 款可玩小游戏，不再需要跳全屏弹窗或二级菜单。
   */

  /* ==================== 面板滑入隐藏（两模式） ==================== */
  let dragActive = false;
  let dragStartX = 0;

  /**
   * 按住手机向右滑动 → 收起。热修：不在此处 setPointerCapture——capture 会把合成
   * click 的 target 重定向到容器，导致手机内所有按钮 onclick 永不触发（手机"不能用"）。
   * 仅记录起点，阈值判定后才捕获。
   */
  function onPhoneDragDown(e: PointerEvent): void {
    dragActive = true;
    dragStartX = e.clientX;
  }
  function onPhoneDragMove(e: PointerEvent): void {
    if (!dragActive) return;
    const dx = (e.clientX - dragStartX) / uiState.zoom;
    if (dx > 40 && uiState.questPanelOpen) {
      dragActive = false;
      const el = e.currentTarget as HTMLElement;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 捕获失败不影响收起 */
      }
      uiState.questPanelOpen = false;
    }
  }
  function onPhoneDragUp(e: PointerEvent): void {
    dragActive = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }
  /** 点击/拖拽露出的边缘 → 拉出手机 */
  function pullOut(): void {
    uiState.questPanelOpen = true;
  }

  /** v1.215 修复：每日小目标在挂载/跨天时生成（幂等），完成即实时发奖。
   *  绝不能放进 $derived（Svelte 5 严格禁止 derived 改状态，否则 state_unsafe_mutation 崩溃）。 */
  $effect(() => {
    generateDailyGoals(gameState);
    tickDailyGoals(gameState, (mood: number) => {
      gameState.player.attrs.mood = Math.min(100, Math.max(0, gameState.player.attrs.mood + mood));
      pushLog(gameState, "✅", `完成今日小目标，心情 +${mood}`);
    });
  });
</script>

<aside class="quest-side hud-scope" class:collapsed={!uiState.questPanelOpen}>
  {#if uiState.questPanelOpen || uiState.gameMode !== "pc"}
    <!-- 手机外框（panel 模式，撑满面板；拖拽右滑可收起） -->
    <div
      class="phone-host"
      onpointerdown={onPhoneDragDown}
      onpointermove={onPhoneDragMove}
      onpointerup={onPhoneDragUp}
      onpointercancel={onPhoneDragUp}
    >
      <PhoneScreen variant="panel" onClose={() => (uiState.questPanelOpen = false)} />
    </div>
    <!-- 手游/平板模式：收起时露出的边缘把手（点击/拖拽拉出） -->
    <div
      class="mobile-handle"
      class:visible={!uiState.questPanelOpen && uiState.gameMode !== "pc"}
      onpointerdown={pullOut}
      title="拉出手机"
    >📱</div>
  {:else}
    <!-- 折叠态：整块可点展开按钮（端游模式） -->
    <button class="collapse-btn-wide" onclick={toggleQuestPanel} title="展开手机">
      📱
    </button>
  {/if}
</aside>

<style>
  .quest-side {
    width: 250px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    border-left: 1px solid var(--border);
    overflow: hidden;
    transition: width 0.18s ease;
    padding: 8px 6px 8px 6px;
  }
  .quest-side.collapsed {
    width: 44px;
    min-width: 44px;
    padding: 6px;
    align-items: stretch;
  }
  .collapse-btn-wide {
    width: 100%;
    height: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    cursor: pointer;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .collapse-btn-wide:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  /* 手机容器：撑满面板，承载 PhoneScreen（panel 模式） */
  .phone-host {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  /* 手游模式：收起时露出的边缘把手（默认隐藏，收起态显示在容器左侧） */
  .mobile-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 56px;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    background: linear-gradient(90deg, rgba(91, 140, 255, 0.25), transparent);
    border-radius: 0 10px 10px 0;
    z-index: 10;
  }
  .mobile-handle.visible {
    display: flex;
  }
</style>
