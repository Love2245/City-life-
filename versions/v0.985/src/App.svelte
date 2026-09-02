<script lang="ts">
  import { currentView, gameState, goto } from "./stores/gameStore.svelte";
  import { themeOfHour } from "./game/core/time";
  import { fade } from "svelte/transition";
  import MainMenuView from "./views/MainMenuView.svelte";
  import BackgroundView from "./views/BackgroundView.svelte";
  import GameView from "./views/GameView.svelte";
  import EndingView from "./views/EndingView.svelte";
  import SaveLoadView from "./views/SaveLoadView.svelte";
  import SettingsView from "./views/SettingsView.svelte";

  /** 昼夜主题联动：随游戏时刻切换 data-theme */
  $effect(() => {
    document.documentElement.dataset.theme = themeOfHour(gameState.time.hour);
  });

  /** 结局路由：endingId 一旦非空且处于游戏视图 → 跳转结局页 */
  $effect(() => {
    if (gameState.endingId && currentView.name === "game") {
      goto("ending");
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
    {/if}
  </div>
{/key}

<style>
  .view-fade {
    height: 100%;
  }
</style>
