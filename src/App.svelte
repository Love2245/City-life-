<script lang="ts">
  import CatDuelPracticeOverlay from "./components/CatDuelPracticeOverlay.svelte";
  import {initializeMobileDisplay} from './stores/mobileDisplay.svelte';
  onMount(() => initializeMobileDisplay({ shouldEnterFullscreen: () => isMobileLayout() && ['menu', 'game', 'arcade'].includes(currentView.name) }));
  import {installDragScroll} from './lib/dragScroll';
  onMount(()=>installDragScroll());
  import {sceneLoading,cancelSceneLoading} from './stores/sceneLoading.svelte';
  onMount(()=>{
    const block=(event:Event)=>{
      if(!sceneLoading.current)return;
      if(event.target instanceof Element&&event.target.closest('[data-scene-loading-overlay]'))return;
      event.preventDefault();event.stopImmediatePropagation();
    };
    const events=['pointerdown','pointerup','click','dblclick','wheel','touchstart','keydown','keyup'] as const;
    for(const event of events)window.addEventListener(event,block,{capture:true,passive:false});
    return()=>{for(const event of events)window.removeEventListener(event,block,true);cancelSceneLoading();};
  });
  $effect(()=>{if(currentView.name!=='game'&&currentView.name!=='arcade')cancelSceneLoading();});
  import { currentView, gameState, musicSession, goto, backFromPage, settleEndingProfile, checkpointAutoSave, markSessionDirty, checkpointFingerprint, autoSaveStatus, markSessionClean, persistUnlockedEndings, shouldCheckpointGameSession } from "./stores/gameStore.svelte";
  import { saveGameImmediately } from "./lib/save";
  import { initializeDesktopWindow } from './lib/desktopWindow.svelte';
  import { ARCHIVE_ONLY_SAVE_FAILURE } from "./lib/saveStatus";
  import { onMount } from "svelte";
  import { themeOfHour } from "./game/core/time";
  import { fade } from "svelte/transition";
  import { motionDurationMs, motionEasing } from "./lib/motion";
  import { setMusicScene, pauseAudio, resumeAudio, unlockAudio } from "./lib/audio";
  import { getLocation, isLocationOpen, locationOpenPhase } from "./game/core/actions";
  import { isResidenceLocation } from "./game/core/residence";
  import {currentWeather} from './game/core/weather';
  import {isWeekend} from './game/core/calendar';
  import './styles/regionTransition.css';
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
  import ConfirmDialog from "./components/layout/ConfirmDialog.svelte";
  import ReaderModal from "./components/ReaderModal.svelte";
  import NpcTaskPanel from './components/NpcTaskPanel.svelte';
  import DeviceSetupModal from "./components/DeviceSetupModal.svelte";
  import DeveloperPanel from "./components/DeveloperPanel.svelte";
  import { developerState, developerSessionAvailable, closeDeveloperPanel, openDeveloperPanel } from "./stores/developerStore.svelte";
  import { uiState, isMobileLayout, dismissToast, closeModal, resolveConfirm, uiConfirm, closeNpcTaskPanel, closeNpcTalk, showToast } from "./stores/uiStore.svelte";

  onMount(() => {
    let disposed = false, cleanup: (() => void) | undefined;
    void initializeDesktopWindow({
      saveBeforeClose: async () => {
        if (!shouldCheckpointGameSession()) return;
        if (autoSaveTimer != null) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined; }
        const profileSaved = persistUnlockedEndings(gameState);
        saveGameImmediately('auto', gameState);
        if (!profileSaved) throw new Error(ARCHIVE_ONLY_SAVE_FAILURE);
        markSessionClean(); autoSaveStatus.status = 'saved'; autoSaveStatus.error = '';
      },
      onError: message => { autoSaveStatus.status = 'failed'; autoSaveStatus.error = message; showToast(message); },
    }).then(stop => { if (disposed) stop(); else cleanup = stop; }).catch(error => showToast(`桌面窗口初始化失败：${String(error)}`));
    return () => { disposed = true; cleanup?.(); };
  });

  /** Translate Android's system back gesture into a safe UI action. */
  onMount(() => {
    const guard = { urbanLifeBackGuard: true };
    history.pushState(guard, "", location.href);
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || currentView.name === "game") return;
      if (uiState.confirmRequest) { event.preventDefault(); resolveConfirm(false); return; }
      if (uiState.modal) { closeModal(); return; }
      if (["saveLoad", "settings", "fate", "memoir", "weeklyReport", "ending"].includes(currentView.name)) backFromPage();
    };
    const onPopState = (): void => {
      if(sceneLoading.current){history.pushState(guard,"",location.href);return;}
      if (developerState.open) {
        closeDeveloperPanel();
      } else if (uiState.npcTaskPanel) {
        closeNpcTaskPanel();
      } else if (uiState.npcTalk) {
        closeNpcTalk();
      } else if (uiState.confirmRequest) {
        resolveConfirm(false);
      } else if (uiState.modal) {
        closeModal();
      } else if (["saveLoad", "settings", "fate", "memoir", "weeklyReport", "ending"].includes(currentView.name)) {
        backFromPage();
      } else {
        void uiConfirm("要退出都市生活吗？当前进度会先自动保存。", { confirmLabel: "退出" }).then((ok) => {
          if (!ok) return;
          if ("__TAURI_INTERNALS__" in window) {
            void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
          } else {
            window.close();
          }
        });
      }
      // Keep an in-app history entry so later system back gestures are handled too.
      history.pushState(guard, "", location.href);
    };
    window.addEventListener("keydown", onEscape);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("popstate", onPopState);
    };
  });

  $effect(() => {
    if (!developerState.enabled || !developerSessionAvailable()) closeDeveloperPanel();
  });

  function syncMusicScene(): void {
    const hour = gameState.time.hour;
    const location = gameState.locationId === "map" ? undefined : getLocation(gameState.locationId);
    // Match ScenePanel's waiting page; registered temple lodging remains an indoor scene.
    const waitingForOpen = !!location && !isResidenceLocation(gameState)
      && !isLocationOpen(location, hour, gameState)
      && locationOpenPhase(location, hour, gameState) === "before";
    setMusicScene({
      hour,
      locationId: gameState.locationId,
      regionId: gameState.region,
      inGame: shouldCheckpointGameSession(),
      admitted: !waitingForOpen,
      sessionKey: musicSession.value,
      weather: currentWeather(gameState),
      weekend: isWeekend(gameState.time),
    });
  }

  /** 昼夜主题和音乐随当前时段、实际设施场景同步；游戏内设置页保留场景曲。 */
  $effect(() => {
    const theme = themeOfHour(gameState.time.hour);
    document.documentElement.dataset.theme = theme;
    syncMusicScene();
  });

  /** 结局路由：endingId 一旦非空且处于游戏视图 → 结算命运点/回忆录/解锁模式 → 跳转结局页 */
  $effect(() => {
    if (gameState.endingId && currentView.name === "game") {
      settleEndingProfile(); // v0.991：多周目结算（幂等）
      goto("ending");
    }
  });

  /** v1.395 检查点自动存档：状态稳定变化后写入自动槽，覆盖行动/日结/小游戏等所有入口。 */
  let autoSaveTimer: number | undefined;
  let lastAutoSaveFingerprint = "";
  $effect(() => {
    if (!shouldCheckpointGameSession()) return;
    const fingerprint = checkpointFingerprint(gameState);
    if (fingerprint === lastAutoSaveFingerprint) return;
    lastAutoSaveFingerprint = fingerprint;
    markSessionDirty();
    if (autoSaveTimer != null) return;
    const activeFrameGame = !!gameState.work?.active || !!gameState.districtLeisure?.active || !!gameState.fishing?.active;
    const delay = gameState.fishing?.active ? 5000 : activeFrameGame ? 1500 : 450;
    autoSaveTimer = window.setTimeout(() => {
      autoSaveTimer = undefined;
      void checkpointAutoSave();
    }, delay);
  });

  /** 首次触控/按键解锁 Web Audio；应用切入后台时立即停音并暂停 AudioContext。 */
  onMount(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        pauseAudio();
        onPageHide();
        return;
      }
      resumeAudio();
      syncMusicScene();
    };
    const onPageHide = () => {
      pauseAudio();
      if (!shouldCheckpointGameSession()) return;
      if (autoSaveTimer != null) { window.clearTimeout(autoSaveTimer); autoSaveTimer = undefined; }
      try {
        const profileSaved = persistUnlockedEndings(gameState);
        saveGameImmediately("auto", gameState);
        markSessionClean();
        if (profileSaved) {
          autoSaveStatus.status = "saved";
          autoSaveStatus.error = "";
        } else {
          autoSaveStatus.status = "failed";
          autoSaveStatus.error = ARCHIVE_ONLY_SAVE_FAILURE;
        }
      } catch (error) {
        autoSaveStatus.status = "failed";
        autoSaveStatus.error = error instanceof Error ? error.message : "自动保存失败";
      }
    };
    const onUserGesture = () => unlockAudio();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pointerdown", onUserGesture, { passive: true, capture: true });
    window.addEventListener("keydown", onUserGesture);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pointerdown", onUserGesture, true);
      window.removeEventListener("keydown", onUserGesture);
      pauseAudio();
    };
  });
</script>

<!-- v0.91 修复6：视图切换淡入过渡，消除生硬跳转 -->
<!-- v1.44.1 全局 UI 缩放：.app-zoom 包住全部视图与 App 级弹窗，
     端游模式按 --ui-zoom 整体 zoom（含主菜单/设置/独立小游戏/NPC 会话等此前不受缩放的界面）；
     手游模式在 mobile.css 里改用钳制后的 --m-ui-zoom，同样是全局生效。 -->
<div class="app-zoom" inert={uiState.deviceSetupOpen||!!sceneLoading.current} aria-hidden={uiState.deviceSetupOpen||!!sceneLoading.current}>
{#key currentView.name}
  <div class="view-fade" transition:fade={{ duration: motionDurationMs("--dur-base"), easing: motionEasing("--ease-out") }}>
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

  {#if uiState.toast}
    <div class="app-toast" role="status" aria-live="polite"><span>{uiState.toast}</span><button aria-label="关闭提示" onclick={dismissToast}>×</button></div>
  {/if}

  <NpcTalkModal />
  <!-- v1.43.1：应用内确认弹窗（替代在 Tauri 下失效的 window.confirm） -->
  <ConfirmDialog />
  {#if uiState.modal === "storyCard"}
    <StoryCardModal />
  {/if}
  <CatDuelPracticeOverlay />
</div>

<!-- 阅读器脱离全局 UI zoom，避免 PE 的缩放预设将正文缩成难以阅读的尺寸。 -->
{#if uiState.modal === "reader"}
  <ReaderModal />
{/if}

<!-- 任务纸物与阅读器一样按视口排版，避免 PE 全局缩放把票据文字缩小。 -->
<NpcTaskPanel />
{#if developerState.unlocked && developerState.enabled && developerState.open}
  <DeveloperPanel />
{/if}
{#if developerState.unlocked && developerState.enabled && currentView.name === "ending" && gameState.endingId && !developerState.open}
  <button class="ending-developer-entry" onclick={openDeveloperPanel}>🛠️ 超级开发者模式</button>
{/if}

{#if uiState.deviceSetupOpen}
  <DeviceSetupModal />
{/if}

<TransitionOverlay />


<style>
  .ending-developer-entry { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); z-index: 1000; border: 1px solid #d4b779; background: #172738; color: #ffe0a0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
  .view-fade {
    height: 100%;
  }
  .app-toast {
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(90vw, 680px);
    background: #241a18;
    color: #fff4e8;
    border: 1px solid #f1a16f;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 13px;
    line-height: 1.45;
    text-align: center;
    z-index: 12000;
    animation: fadeIn var(--dur-base) var(--ease-out);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .app-toast button {
    flex: 0 0 auto;
    min-width: 36px;
    min-height: 36px;
    border: 1px solid rgba(255, 244, 232, .55);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-size: 22px;
    cursor: pointer;
  }
  /* v1.44.1 全局 UI 缩放：.app-zoom 包住全部视图与 App 级弹窗（主菜单/设置/独立小游戏/NPC 会话…）。
     Chrome 标准化 zoom 语义（qa-zoom-lab 实测）：百分比盒不受 zoom 缩放（自身与祖先都不缩放），
     px/vh 才按 zoom 缩放 —— 因此这里 100% 即可精确铺满视口，内容 px 由 zoom 统一缩放；
     任何 1/zoom 百分比补偿都会精确溢出 1/zoom 倍（旧实现「半个画布溢出」的真正根因）。
     手游模式在 mobile.css 里以更高特异性把 zoom 换成钳制后的 --m-ui-zoom，同样全局生效。 */
  .app-zoom {
    zoom: var(--ui-zoom);
    width: 100%;
    height: 100%;
  }
</style>
