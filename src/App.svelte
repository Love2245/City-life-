<script lang="ts">
  import { currentView, gameState, goto, settleEndingProfile } from "./stores/gameStore.svelte";
  import { themeOfHour } from "./game/core/time";
  import { fade } from "svelte/transition";
  import { applyBgmForHour, stopBgm, isBgmEnabled } from "./lib/audio";
  import MainMenuView from "./views/MainMenuView.svelte";
  import BackgroundView from "./views/BackgroundView.svelte";
  import GameView from "./views/GameView.svelte";
  import EndingView from "./views/EndingView.svelte";
  import SaveLoadView from "./views/SaveLoadView.svelte";
  import SettingsView from "./views/SettingsView.svelte";
  import FateView from "./views/FateView.svelte";
  import MemoirView from "./views/MemoirView.svelte";
  import WeeklyReportView from "./views/WeeklyReportView.svelte";
  import ArcadeView from "./views/ArcadeView.svelte";
  import TransitionOverlay from "./components/layout/TransitionOverlay.svelte";
  import NpcTalkModal from "./components/layout/NpcTalkModal.svelte";
  import StoryCardModal from "./components/layout/StoryCardModal.svelte";
  import { uiState } from "./stores/uiStore.svelte";

  /** 昼夜主题联动：随游戏时刻切换 data-theme；并同步切换五时段背景音乐（v1.11） */
  $effect(() => {
    const theme = themeOfHour(gameState.time.hour);
    document.documentElement.dataset.theme = theme;
    if (isBgmEnabled()) {
      applyBgmForHour(gameState.time.hour);
    } else {
      stopBgm();
    }
  });

  /** 结局路由：endingId 一旦非空且处于游戏视图 → 结算命运点/回忆录/解锁模式 → 跳转结局页 */
  $effect(() => {
    if (gameState.endingId && currentView.name === "game") {
      settleEndingProfile(); // v0.991：多周目结算（幂等）
      goto("ending");
    }
  });

  /** v1.10 周记：周日结算后置 pending，在游戏视图观察并跳转周记页 */
  $effect(() => {
    if (gameState.weekly.pending && currentView.name === "game" && !gameState.endingId) {
      goto("weeklyReport");
    }
  });

</script>

<!-- v0.91 修复6：视图切换淡入过渡，消除生硬跳转 -->
{#key currentView.name}
  <div class="view-fade" transition:fade={{ duration: 240 }}>
    {#if currentView.name === "menu"}
      <MainMenuView />
    {:else if currentView.name === "background"}
      <BackgroundView />
    {:else if currentView.name === "game"}
      <GameView />
    {:else if currentView.name === "ending"}
      <EndingView />
    {:else if currentView.name === "saveLoad"}
      <SaveLoadView />
    {:else if currentView.name === "settings"}
      <SettingsView />
    {:else if currentView.name === "fate"}
      <FateView />
    {:else if currentView.name === "memoir"}
      <MemoirView />
    {:else if currentView.name === "weeklyReport"}
      <WeeklyReportView />
    {:else if currentView.name === "arcade"}
      <ArcadeView />
    {/if}
  </div>
{/key}

  <TransitionOverlay />
  <NpcTalkModal />
  {#if uiState.modal === "storyCard"}
    <StoryCardModal />
  {/if}

<style>
  .view-fade {
    height: 100%;
  }
</style>
