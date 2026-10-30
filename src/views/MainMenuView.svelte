<script lang="ts">
  import { onDestroy } from "svelte";
  import { goto, setPendingMode, profile, loadProfileIntoStore, gameState } from "../stores/gameStore.svelte";
  import { loadGameIntoState, listSaves } from "../lib/save";
  import type { SaveMeta } from "../lib/save";
  import { uiState, uiConfirm, showToast, SKINS, setSkin, type SkinId } from "../stores/uiStore.svelte";
  import { formatMoney, formatDate } from "../lib/format";
  import { VERSION } from "../version";
  import { isMuted, setMuted, getBgmVolume, setBgmVolume, getSfxVolume, setSfxVolume, isBgmEnabled, setBgmEnabled, applyBgmForHour, unlockAudio } from "../lib/audio";
  import MenuIcon from "../components/MenuIcon.svelte";
  import AnnouncementModal from "../components/AnnouncementModal.svelte";
  import { desktopWindowState, quitDesktopWindow } from "../lib/desktopWindow.svelte";
  import type { WarmupProgress } from "../lib/assetWarmup";
  import menuLogo from "../assets/bg/menu/urban-life-wordmark-v148.webp";
  import { titleDeveloperTap, resetDeveloperTitleTaps } from "../stores/developerStore.svelte";
  import continueBackground from "../assets/bg/menu/city-evening-v148.webp";
  import newLifeBackground from "../assets/bg/menu/city-dawn-sunny-v148.webp";
  import savesBackground from "../assets/bg/menu/city-archive-v148.webp";
  import settingsBackground from "../assets/bg/menu/city-workshop-v148.webp";

  type MenuBackdrop = "continue" | "new" | "saves" | "settings";
  const menuBackdrops: { id: MenuBackdrop; image: string }[] = [
    { id: "continue", image: continueBackground },
    { id: "new", image: newLifeBackground },
    { id: "saves", image: savesBackground },
    { id: "settings", image: settingsBackground },
  ];

  let autoSaveInfo = $state<SaveMeta | null>(null);
  let muted = $state(isMuted());
  let bgmVolume = $state(getBgmVolume());
  let sfxVolume = $state(getSfxVolume());
  let bgmEnabled = $state(isBgmEnabled());
  let audioPanelOpen = $state(false);
  let tonePanelOpen = $state(false);
  let warmup = $state<WarmupProgress | null>(null);
  let activeBackdrop = $state<MenuBackdrop | null>(null);
  let announcementOpen = $state(false);
  let announcementChecked = $state(false);
  const announcementStorageKey = `urban-life-announcement-dismissed-v${VERSION}`;
  const canContinue = $derived(!!autoSaveInfo && (autoSaveInfo.status === undefined || autoSaveInfo.status === "valid"));

  // 首次进入本版本的主菜单时展示公告；等待设备设置结束，避免两个弹窗同时抢焦点。
  $effect(() => {
    if (uiState.deviceSetupOpen || announcementChecked) return;
    announcementChecked = true;
    try {
      announcementOpen = localStorage.getItem(announcementStorageKey) !== "shown";
    } catch {
      announcementOpen = true;
    }
  });

  function dismissAnnouncement(): void {
    announcementOpen = false;
    try { localStorage.setItem(announcementStorageKey, "shown"); } catch { /* 无持久存储时本次仍可正常关闭 */ }
  }

  // 展示层沿用原有多周目档案、自动存档和新游戏入口。
  loadProfileIntoStore();
  let menuAlive = true;
  onDestroy(() => { menuAlive = false; });
  async function checkAutoSave(): Promise<void> {
    const saves = await listSaves();
    // 玩家可能在这期间点了「继续游戏」离开主菜单：挂载守卫避免写已卸载组件的状态。
    if (!menuAlive) return;
    autoSaveInfo = saves.find((save) => save.slot === "auto") ?? null;
  }
  checkAutoSave();
  async function continueGame(): Promise<void> {
    // The destination's scene-loading cover owns its resources. Do not parse
    // all four 3D engines before we even know the saved location.
    warmup = { done: 0, total: 1, label: '读取存档' };
    const ok = await loadGameIntoState("auto");
    warmup = null;
    if (ok) goto("game");
  }
  function newGame(): void {
    setPendingMode("normal");
    goto("background");
  }
  function toggleMuted(): void {
    unlockAudio();
    muted = !isMuted();
    setMuted(muted);
  }
  function toggleAudioPanel(): void {
    // 与设置页共享音频偏好，展开时读取最新值。
    if (!audioPanelOpen) tonePanelOpen = false;
    muted = isMuted();
    bgmVolume = getBgmVolume();
    sfxVolume = getSfxVolume();
    bgmEnabled = isBgmEnabled();
    audioPanelOpen = !audioPanelOpen;
  }
  function toggleTonePanel(): void {
    if (!tonePanelOpen) audioPanelOpen = false;
    tonePanelOpen = !tonePanelOpen;
  }
  function openAnnouncement(): void {
    audioPanelOpen = false;
    tonePanelOpen = false;
    announcementOpen = true;
  }
  async function quitGame(): Promise<void> {
    if (!desktopWindowState.available) return;
    // window.confirm is silent in Tauri/WebView2 (always reads as cancel), so the
    // quit control needs the app's own confirm layer before it may close anything.
    const ok = await uiConfirm("确定要退出游戏吗？会尽量先保存进度。", { confirmLabel: "退出游戏", danger: true });
    if (!ok) return;
    try { await quitDesktopWindow(); } catch (error) { showToast(`退出失败：${String(error)}`); }
  }
  function chooseTone(id: SkinId): void { setSkin(id); }
  function previewMenuOption(event: PointerEvent): void {
    const nav = event.currentTarget as HTMLElement;
    const hit = Array.from(nav.querySelectorAll<HTMLButtonElement>("[data-menu-background]")).find((button) => {
      const rect = button.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const id = hit?.dataset.menuBackground;
    activeBackdrop = id === "continue" || id === "new" || id === "saves" || id === "settings" ? id : null;
  }
  function toggleBgm(): void {
    unlockAudio();
    bgmEnabled = !isBgmEnabled();
    setBgmEnabled(bgmEnabled);
    if (bgmEnabled) applyBgmForHour(gameState.time.hour);
  }
  function updateBgmVolume(value: number): void { bgmVolume = value; setBgmVolume(value); }
  function updateSfxVolume(value: number): void { sfxVolume = value; setSfxVolume(value); }
</script>

<svelte:window onclick={resetDeveloperTitleTaps} onkeydown={(event) => { if (event.key === "Escape") { audioPanelOpen = false; tonePanelOpen = false; resetDeveloperTitleTaps(); } }} />

<main class="title-screen">
  {#each menuBackdrops as backdrop (backdrop.id)}
    <div class="menu-backdrop" class:active={activeBackdrop === backdrop.id} class:default-active={activeBackdrop === null && backdrop.id === "continue"} style={`--backdrop-image: url("${backdrop.image}")`} aria-hidden="true"></div>
  {/each}
  <div class="menu-shade" aria-hidden="true"></div>
  <div class="title-frame">
    <div class="title-hero">
      <header class="title-logo">
        <p class="eyebrow"><span class="title-rule"></span> URBAN LIFE <span class="edition">城市生活模拟</span></p>
        <h1><button class="title-logo-trigger" aria-label="都市生活游戏标题" onclick={(event) => { event.stopPropagation(); titleDeveloperTap(); }}><img src={menuLogo} alt="都市生活" draggable="false" /></button></h1>
        <p class="title-subtitle">在这座城市，写下自己的故事。</p>
      </header>
      <div class="title-content">
        <nav class="main-options" aria-label="开始游戏" onpointermove={previewMenuOption} onpointerleave={() => activeBackdrop = null}>
          <button class="title-action continue-option" data-menu-background="continue" disabled={!canContinue} onpointerenter={() => activeBackdrop = "continue"} onfocus={() => activeBackdrop = "continue"} onblur={() => activeBackdrop = null} onclick={continueGame}>
            <span class="option-icon"><MenuIcon name="resume" size={21} /></span>
            <span class="option-copy"><span class="option-label">继续生活</span>
              <span class="save-hint">
                {#if autoSaveInfo?.status === "future" || autoSaveInfo?.status === "corrupt"}
                  {autoSaveInfo.problem ?? "自动存档无法读取，请到存档页处理"}
                {:else if autoSaveInfo}
                  {formatDate(autoSaveInfo.year, autoSaveInfo.month, autoSaveInfo.day)} · ¥{formatMoney(autoSaveInfo.money)}
                {:else}
                  从一段新的生活开始
                {/if}
              </span>
            </span><span class="option-arrow" aria-hidden="true">↗</span>
          </button>
          <button class="title-action" data-menu-background="new" class:new-primary={!canContinue} onpointerenter={() => activeBackdrop = "new"} onfocus={() => activeBackdrop = "new"} onblur={() => activeBackdrop = null} onclick={newGame}>
            <span class="option-icon"><MenuIcon name="new" /></span><span class="option-copy"><span class="option-label">开始新生活</span><span class="option-detail">新的起点，无限可能</span></span><span class="option-arrow" aria-hidden="true">↗</span>
          </button>
          <button class="title-action compact-option" data-menu-background="saves" onpointerenter={() => activeBackdrop = "saves"} onfocus={() => activeBackdrop = "saves"} onblur={() => activeBackdrop = null} onclick={() => goto("saveLoad")}>
            <span class="option-icon"><MenuIcon name="save" /></span><span class="option-copy"><span class="option-label">存档 / 读档</span></span><span class="option-arrow" aria-hidden="true">↗</span>
          </button>
          <button class="title-action compact-option" data-menu-background="settings" onpointerenter={() => activeBackdrop = "settings"} onfocus={() => activeBackdrop = "settings"} onblur={() => activeBackdrop = null} onclick={() => goto("settings")}>
            <span class="option-icon"><MenuIcon name="settings" /></span><span class="option-copy"><span class="option-label">设置</span></span><span class="option-arrow" aria-hidden="true">↗</span>
          </button>
        </nav>
        <nav class="other-options" aria-label="更多玩法与档案">
          <p class="section-caption">城市之外 / 生活之间</p>
          <div class="other-grid">
            <button class="other-option arcade-option" onclick={() => goto("arcade")} title="试玩小游戏与参观房屋"><MenuIcon name="game" size={18} /><span>小游戏</span><span class="tiny-badge">玩法 / 看房</span></button>
            <button class="other-option" onclick={() => goto("fate")}><MenuIcon name="spark" size={18} /><span>命运</span><span class="fate-points">{profile.fatePoints}</span></button>
            <button class="other-option" onclick={() => goto("memoir")}><MenuIcon name="book" size={18} /><span>回忆录</span></button>
            <button class="other-option" onclick={() => goto("ending")}><MenuIcon name="ending" size={18} /><span>结局图鉴</span></button>
          </div>
        </nav>
      </div>
    </div>
    <footer class="title-footer">
      <div class="release-info"><span>{VERSION}</span><span class="footer-divider" aria-hidden="true"></span><span>官方群 QQ 1125965732</span></div>
      <div class="audio-tools">
        {#if tonePanelOpen}
          <section class="tone-panel" id="menu-tone-panel" aria-label="更换色调">
            <div class="audio-panel-heading"><span>更换色调</span><button class="icon-button" aria-label="关闭色调选择" onclick={() => tonePanelOpen = false}><MenuIcon name="close" size={18} /></button></div>
            <p class="tone-panel-note">所选色调会应用到游戏界面并自动保存。</p>
            <div class="tone-grid" role="group" aria-label="界面色调">
              {#each SKINS as skin (skin.id)}
                <button class="tone-option" class:selected={uiState.skin === skin.id} aria-pressed={uiState.skin === skin.id} title={skin.desc} onclick={() => chooseTone(skin.id)}>
                  <span class="tone-swatch" style={`--tone-bg:${skin.swatch.bg};--tone-accent:${skin.swatch.accent};--tone-secondary:${skin.swatch.accent2}`} aria-hidden="true"><i></i><i></i></span>
                  <span>{skin.name}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
        {#if audioPanelOpen}
          <section class="audio-panel" id="menu-audio-panel" aria-label="声音快捷设置">
            <div class="audio-panel-heading"><span>声音设置</span><button class="icon-button" aria-label="关闭声音设置" onclick={() => audioPanelOpen = false}><MenuIcon name="close" size={18} /></button></div>
            <div class="bgm-toggle"><span>背景音乐</span><button class="audio-switch" class:enabled={bgmEnabled} aria-pressed={bgmEnabled} onclick={toggleBgm}>{bgmEnabled ? "开启" : "关闭"}<span class="switch-dot"></span></button></div>
            <label class="volume-control" for="menu-bgm-volume"><span>音乐音量</span><output>{bgmVolume}%</output><input id="menu-bgm-volume" type="range" min="0" max="100" step="1" value={bgmVolume} oninput={(event) => updateBgmVolume(Number(event.currentTarget.value))} /></label>
            <label class="volume-control" for="menu-sfx-volume"><span>音效音量</span><output>{sfxVolume}%</output><input id="menu-sfx-volume" type="range" min="0" max="100" step="1" value={sfxVolume} oninput={(event) => updateSfxVolume(Number(event.currentTarget.value))} /></label>
            {#if muted}<p class="muted-hint">当前已静音，点击下方扬声器恢复声音。</p>{/if}
          </section>
        {/if}
        <button class="icon-button" class:is-muted={muted} aria-label={muted ? "取消静音" : "静音"} aria-pressed={muted} title={muted ? "取消静音" : "静音"} onclick={toggleMuted}><MenuIcon name={muted ? "mute" : "volume"} /></button>
        <span class="audio-divider" aria-hidden="true"></span>
        <button class="icon-button" class:active={tonePanelOpen} aria-label="更换色调" aria-expanded={tonePanelOpen} aria-controls="menu-tone-panel" title="更换色调" onclick={toggleTonePanel}><MenuIcon name="palette" /></button>
        <span class="audio-divider" aria-hidden="true"></span>
        <button class="icon-button" class:active={audioPanelOpen} aria-label="音量快捷设置" aria-expanded={audioPanelOpen} aria-controls="menu-audio-panel" title="音量快捷设置" onclick={toggleAudioPanel}><MenuIcon name="sliders" /></button>
        <span class="audio-divider" aria-hidden="true"></span>
        <button class="icon-button" class:active={announcementOpen} aria-label="重新查看版本公告" aria-expanded={announcementOpen} aria-controls="version-announcement-dialog" title="版本公告" onclick={openAnnouncement}><MenuIcon name="announcement" /></button>
        {#if desktopWindowState.available}
          <span class="audio-divider" aria-hidden="true"></span>
          <button class="icon-button quit-button" aria-label="退出游戏" title="退出游戏（会先自动存档）" onclick={quitGame}><MenuIcon name="power" /></button>
        {/if}
      </div>
    </footer>
  </div>
  {#if announcementOpen}
    <AnnouncementModal onClose={dismissAnnouncement} />
  {/if}
  {#if warmup}
    <div class="warmup-overlay" role="status" aria-live="polite">
      <div class="warmup-card">
        <span class="warmup-eyebrow">正在准备场景资源</span>
        <strong>{warmup.label}</strong>
        <div class="warmup-bar" aria-hidden="true"><i style={`width:${Math.round((warmup.done / Math.max(1, warmup.total)) * 100)}%`}></i></div>
        <span class="warmup-count">{warmup.done} / {warmup.total}</span>
      </div>
    </div>
  {/if}
</main>

<style>
  .title-screen {
    --menu-ink: #f5f1e7; --menu-dim: #b5c6c3; --menu-gold: var(--accent, #ffd166);
    --title-tap: max(44px, calc(44px / var(--eff-zoom, 1)));
    --title-sai-t: calc(var(--sai-top, env(safe-area-inset-top, 0px)) / var(--eff-zoom, 1));
    --title-sai-r: calc(var(--sai-right, env(safe-area-inset-right, 0px)) / var(--eff-zoom, 1));
    --title-sai-b: calc(var(--sai-bottom, env(safe-area-inset-bottom, 0px)) / var(--eff-zoom, 1));
    --title-sai-l: calc(var(--sai-left, env(safe-area-inset-left, 0px)) / var(--eff-zoom, 1));
    height: 100%; min-height: 100%; overflow-y: auto; overflow-x: hidden; color: var(--menu-ink); position: relative; isolation: isolate; background: #10131f;
  }
  .menu-backdrop { position: absolute; z-index: -2; inset: 0; background-image: var(--backdrop-image); background-position: 59% center; background-size: cover; background-repeat: no-repeat; opacity: 0; transition: opacity .75s ease; pointer-events: none; }
  .menu-backdrop.active, .menu-backdrop.default-active { opacity: 1; }
  .menu-shade { position: absolute; z-index: -1; inset: 0; background: linear-gradient(90deg, rgba(8,10,18,.94) 0%, rgba(8,10,18,.82) 27%, rgba(8,10,18,.3) 63%, rgba(8,10,18,.16) 100%), linear-gradient(0deg, rgba(8,10,18,.72), transparent 31%); pointer-events: none; }
  .title-screen::before { content: ""; position: absolute; z-index: 1; top: 0; left: 0; width: 100%; height: 1px; background: linear-gradient(90deg, var(--menu-gold), transparent 65%); opacity: .45; pointer-events: none; }
  .title-frame { position: relative; z-index: 0; min-height: 100%; width: 100%; padding: max(clamp(24px, 5vh, 58px), var(--title-sai-t)) max(clamp(26px, 6vw, 100px), var(--title-sai-r)) max(22px, var(--title-sai-b)) max(clamp(26px, 6vw, 100px), var(--title-sai-l)); display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
  .title-hero { width: min(100%, 398px); display: flex; flex-direction: column; gap: clamp(24px, 4vh, 38px); animation: menu-in .65s ease-out both; }
  .eyebrow { display: flex; gap: 12px; align-items: center; color: var(--menu-gold); font-size: 10px; font-weight: 650; letter-spacing: 3.2px; white-space: nowrap; }
  .title-rule { width: 28px; height: 1px; background: var(--menu-gold); opacity: .75; }
  .edition { color: #b4c6c2; letter-spacing: 2px; font-size: 10px; font-weight: 400; }
  .title-logo h1 { width: min(100%, 390px); margin: 8px 0 9px; line-height: 0; }
  .title-logo h1 img { display: block; width: 100%; height: auto; max-height: 160px; object-fit: contain; object-position: left center; }
  .title-logo-trigger { display: block; width: 100%; border: 0; padding: 0; background: transparent; line-height: 0; cursor: pointer; touch-action: manipulation; user-select: none; }
  .title-logo-trigger:focus-visible { outline: 2px solid #ffd575; outline-offset: 5px; border-radius: 4px; }
  .title-subtitle { color: var(--menu-dim); font-size: 13px; letter-spacing: 2px; line-height: 1.8; }
  .title-content { display: flex; flex-direction: column; gap: 23px; }
  .main-options { display: flex; flex-direction: column; gap: 8px; }
  .title-action { width: 100%; min-height: max(64px, var(--title-tap)); display: flex; align-items: center; gap: 16px; text-align: left; padding: 12px 20px; border: 1px solid rgba(203,211,230,.2); border-radius: 4px; color: var(--menu-ink); background: linear-gradient(100deg, rgba(34,40,66,.7), rgba(24,28,46,.42)); cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
  .title-action:hover:not(:disabled) { background: color-mix(in srgb, var(--bg-card) 84%, transparent); border-color: color-mix(in srgb, var(--menu-gold) 72%, transparent); transform: translateX(3px); }
  .title-action:active:not(:disabled) { transform: translateX(1px); }
  .continue-option:not(:disabled), .new-primary { background: linear-gradient(110deg, color-mix(in srgb, var(--menu-gold) 90%, white), var(--menu-gold)); border-color: var(--menu-gold); color: var(--accent-ink, #1a1a2e); box-shadow: 0 4px 24px rgba(5,10,18,.2); }
  .continue-option:not(:disabled):hover, .new-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--menu-gold) 84%, white); border-color: color-mix(in srgb, var(--menu-gold) 70%, white); }
  .title-action:disabled { opacity: .65; cursor: default; }
  .option-icon { display: flex; align-items: center; width: 22px; flex-shrink: 0; }
  .option-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .option-label { font-size: 16px; font-weight: 600; line-height: 1.45; letter-spacing: 2px; }
  .save-hint, .option-detail { font-size: 10px; line-height: 1.5; opacity: .8; font-weight: 400; letter-spacing: .3px; overflow-wrap: anywhere; }
  .option-arrow { font-size: 19px; font-weight: 300; opacity: .6; }
  .compact-option { min-height: max(52px, var(--title-tap)); }
  .other-options { border-top: 1px solid rgba(203,223,217,.14); padding-top: 17px; }
  .section-caption { color: #a9bdb8; font-size: 10px; line-height: 1.5; letter-spacing: 2px; margin: 0 0 9px; }
  .other-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; }
  .other-option { display: flex; align-items: center; gap: 9px; min-height: var(--title-tap); border: 0; border-radius: 4px; background: transparent; color: #d8e2dd; padding: 9px 10px; font-size: 12px; text-align: left; cursor: pointer; white-space: nowrap; transition: background .18s ease, color .18s ease; }
  .other-option:hover { color: color-mix(in srgb, var(--menu-gold) 68%, white); background: rgba(255,255,255,.08); }
  .other-option :global(svg) { color: var(--menu-gold); flex-shrink: 0; }
  .tiny-badge { color: #a9beb7; font-size: 9px; letter-spacing: .2px; margin-left: auto; }
  .fate-points { margin-left: auto; color: var(--menu-gold); font-size: 11px; font-variant-numeric: tabular-nums; }
  .title-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; width: 100%; position: relative; }
  .release-info { display: flex; align-items: center; gap: 12px; min-height: 44px; color: rgba(233,239,255,.72); font-size: 10px; letter-spacing: .45px; line-height: 1.6; white-space: nowrap; }
  .footer-divider { width: 1px; height: 10px; background: rgba(233,239,255,.6); opacity: .45; }
  .audio-tools { display: flex; align-items: center; position: relative; flex-shrink: 0; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--bg-panel); }
  .icon-button { display: flex; align-items: center; justify-content: center; min-width: var(--title-tap); min-height: var(--title-tap); padding: 8px; background: transparent; color: #d5e0da; border: 0; border-radius: 5px; cursor: pointer; transition: background .18s ease, color .18s ease; }
  .icon-button:hover, .icon-button.active { color: var(--menu-gold); background: rgba(255,255,255,.1); }
  .icon-button.is-muted { color: #93a9a3; }
  .icon-button.quit-button:hover, .icon-button.quit-button:focus-visible { color: #ff8f7a; background: rgba(255,120,100,.14); }
  .warmup-overlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(8,10,18,.74); backdrop-filter: blur(2px); }
  .warmup-card { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 240px; padding: 22px 26px; border: 1px solid var(--glass-border, rgba(196,216,208,.2)); border-radius: 14px; background: rgba(16,19,31,.94); text-align: center; }
  .warmup-eyebrow { font-size: 11px; letter-spacing: .16em; color: var(--menu-dim); }
  .warmup-card strong { font-size: 15px; font-weight: 500; color: var(--menu-ink); }
  .warmup-bar { width: 100%; height: 4px; border-radius: 999px; background: rgba(196,216,208,.16); overflow: hidden; }
  .warmup-bar i { display: block; height: 100%; background: var(--menu-gold); transition: width .25s ease; }
  .warmup-count { font-size: 11px; color: var(--menu-dim); }
  .audio-divider { width: 1px; height: 16px; background: var(--glass-border); }
  .audio-panel, .tone-panel { position: absolute; z-index: 8; right: 0; bottom: calc(100% + 12px); width: 306px; max-width: calc((100vw - 40px) / var(--eff-zoom, 1)); padding: 14px 18px 16px; border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text-main); background: var(--bg-panel); box-shadow: 0 12px 45px rgba(0,0,0,.36); backdrop-filter: blur(14px); }
  .audio-panel-heading { display: flex; align-items: center; justify-content: space-between; font-size: 13px; letter-spacing: 1px; margin: -6px -8px 4px 0; }
  .audio-panel-heading .icon-button { color: var(--text-main); }
  .bgm-toggle { display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(196,216,208,.13); }
  .audio-switch { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 74px; min-height: var(--title-tap); font-size: 11px; color: #b5c6c3; border: 0; border-radius: 4px; background: rgba(196,216,208,.05); cursor: pointer; }
  .switch-dot { width: 6px; height: 6px; border-radius: 50%; background: #738e88; }
  .audio-switch.enabled { color: var(--menu-gold); }
  .audio-switch.enabled .switch-dot { background: var(--menu-gold); }
  .volume-control { display: grid; grid-template-columns: 1fr auto; font-size: 11px; color: var(--text-dim); padding-top: 13px; }
  .volume-control output { color: var(--menu-gold); font-variant-numeric: tabular-nums; }
  .volume-control input { grid-column: 1 / -1; display: block; width: 100%; min-height: var(--title-tap); margin: 0; accent-color: var(--menu-gold); cursor: pointer; }
  .muted-hint, .tone-panel-note { margin-top: 6px; color: var(--text-dim); font-size: 10px; line-height: 1.7; }
  .tone-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
  .tone-option { display: flex; align-items: center; gap: 9px; min-height: 42px; padding: 6px 8px; border: 1px solid transparent; border-radius: 5px; color: var(--text-main); background: color-mix(in srgb, var(--bg-card) 76%, transparent); text-align: left; font-size: 11px; cursor: pointer; }
  .tone-option:hover, .tone-option.selected { border-color: color-mix(in srgb, var(--accent) 76%, transparent); }
  .tone-swatch { display: inline-flex; align-items: center; gap: 3px; width: 35px; height: 22px; padding: 3px; flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); border-radius: 4px; background: var(--tone-bg); }
  .tone-swatch i { width: 11px; height: 11px; border-radius: 50%; background: var(--tone-accent); }
  .tone-swatch i + i { background: var(--tone-secondary); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 4px; }
  @keyframes menu-in { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
  @media (max-width: 560px) {
    .menu-backdrop { background-position: 63% center; }
    .menu-shade { background: linear-gradient(90deg, rgba(8,10,18,.92), rgba(8,10,18,.7) 54%, rgba(8,10,18,.25)), linear-gradient(0deg, rgba(8,10,18,.8), transparent 42%); }
    .title-frame { padding: max(32px, var(--title-sai-t)) max(26px, var(--title-sai-r)) max(22px, var(--title-sai-b)) max(26px, var(--title-sai-l)); gap: 24px; }
    .title-hero { gap: 26px; }
    .title-logo h1 { width: min(100%, 360px); margin-top: 5px; margin-bottom: 8px; }
    .title-logo h1 img { max-height: 148px; }
    .eyebrow { gap: 8px; letter-spacing: 2px; }
    .edition { font-size: 9px; letter-spacing: 1px; }
    .title-subtitle { font-size: 12px; letter-spacing: 1px; }
    .title-action { padding-left: 16px; padding-right: 16px; }
    .option-label { font-size: 15px; }
    .other-grid { column-gap: 4px; }
    .other-option { padding-left: 6px; padding-right: 6px; gap: 7px; }
    .release-info { flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; font-size: 9px; letter-spacing: .4px; }
    .footer-divider { display: none; }
  }
  @media (max-height: 650px) and (min-width: 650px) {
    .title-screen { overflow: hidden; }
    .title-frame { box-sizing: border-box; height: 100%; min-height: 0; padding-top: max(10px, var(--title-sai-t)); padding-bottom: max(10px, var(--title-sai-b)); gap: 8px; }
    .title-hero { width: min(100%, 398px); min-height: 0; flex: 1 1 auto; gap: 6px; zoom: 1.1; }
    .title-logo h1 { width: min(100%, 300px); margin: 0; }
    .title-logo h1 img { max-height: min(20vh, 110px); }
    .eyebrow { font-size: 9px; }
    .title-subtitle { font-size: 10px; line-height: 1.3; letter-spacing: .6px; }
    .title-content { display: flex; flex-direction: column; align-items: stretch; gap: 4px; flex: 1 1 auto; min-height: 0; }
    .main-options { display: flex; flex-direction: column; gap: 3px; }
    .title-action { min-height: max(40px, calc(40px / var(--eff-zoom, 1))); padding: 2px 10px; gap: 8px; }
    .compact-option { min-height: max(40px, calc(40px / var(--eff-zoom, 1))); }
    .option-label { font-size: 14px; letter-spacing: 1px; }
    .save-hint, .option-detail { font-size: 9px; }
    .other-options { width: 100%; min-width: 0; padding-top: 4px; }
    .section-caption { font-size: 9px; line-height: 1.2; margin-bottom: 1px; }
    .other-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 4px; }
    .other-option { min-width: 0; min-height: max(32px, calc(32px / var(--eff-zoom, 1))); padding: 2px 6px; gap: 5px; font-size: 10px; }
    .title-footer { min-height: var(--title-tap); align-items: center; gap: 8px; }
    .release-info { min-height: 0; font-size: 9px; }
  }
  @media (prefers-reduced-motion: reduce) { .title-hero { animation: none; } .title-action, .other-option, .icon-button { transition: none; } }
</style>

