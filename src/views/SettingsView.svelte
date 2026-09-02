<script lang="ts">
  import { goto, gameState } from "../stores/gameStore.svelte";
  import { resetAllSaves } from "../lib/save";
  import { uiState, setZoom, setGameMode, setTestMode, setArcadeMode, setSceneTransition, setSceneTransitionL2, setMapGlass, SKINS } from "../stores/uiStore.svelte";
  import ThemePicker from "../components/ThemePicker.svelte";
  import { FAMILIES } from "../game/core/families";
  import { VERSION, GAME_NAME, CHANGELOG } from "../version";
  import {
    getBgmVolume,
    setBgmVolume,
    isBgmEnabled,
    setBgmEnabled,
    getSfxVolume,
    setSfxVolume,
    getBgmSelection,
    setBgmSelection,
    applyBgmForHour,
    stopBgm,
    unlockAudio,
    type BgmTrackId,
  } from "../lib/audio";

  let resetting = $state(false);
  /** 本地状态与持久化同步 */
  let bgmVol = $state(getBgmVolume());
  let bgmOn = $state(isBgmEnabled());
  let sfxVol = $state(getSfxVolume());
  let bgmSel = $state<BgmTrackId | "auto">(getBgmSelection());
  let uiZoom = $state(uiState.zoom);
  let gameMode = $state(uiState.gameMode);
  let testMode = $state(uiState.testMode);
  let arcadeMode = $state(uiState.arcadeMode);
  let sceneTransition = $state(uiState.sceneTransition);
  let sceneTransitionL2 = $state(uiState.sceneTransitionL2);
  let mapGlass = $state(uiState.mapGlass);

  function onBgmVol(v: number): void {
    bgmVol = v;
    setBgmVolume(v);
  }
  function onSfxVol(v: number): void {
    sfxVol = v;
    setSfxVolume(v);
  }
  function onBgmToggle(): void {
    bgmOn = !bgmOn;
    setBgmEnabled(bgmOn);
    if (bgmOn) {
      applyBgmForHour(gameState.time.hour);
    } else {
      stopBgm();
    }
  }
  function onBgmSel(sel: BgmTrackId | "auto"): void {
    bgmSel = sel;
    setBgmSelection(sel);
    if (bgmOn) applyBgmForHour(gameState.time.hour);
  }
  function onZoom(v: number): void {
    uiZoom = v;
    setZoom(v);
  }
  function onGameMode(m: "pc" | "mobile" | "tablet"): void {
    gameMode = m;
    setGameMode(m);
  }
  /** v1.25 测试模式：解锁剧情模式入口（持久化） */
  function onTestMode(): void {
    testMode = !testMode;
    setTestMode(testMode);
  }
  /** v1.3-beta2 独立小游戏模式：解锁主菜单「小游戏」入口（持久化） */
  function onArcadeMode(): void {
    arcadeMode = !arcadeMode;
    setArcadeMode(arcadeMode);
  }
  /** v1.3b3 场景切换动画（默认开，跨一级地图播放载入/移动动画） */
  function onSceneTransition(): void {
    sceneTransition = !sceneTransition;
    setSceneTransition(sceneTransition);
  }
  /** v1.3b3-fix5 二级区域过场动画（默认关，开启后二级区域带特色背景的简短过场） */
  function onSceneTransitionL2(): void {
    sceneTransitionL2 = !sceneTransitionL2;
    setSceneTransitionL2(sceneTransitionL2);
  }
  function onMapGlass(v: "low" | "medium" | "high" | "dark"): void {
    mapGlass = v;
    setMapGlass(v);
  }

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
    <div class="h2">🎨 界面主题</div>
    <p class="dim small">
      共 5 套皮肤，点击即时生效并自动记忆。当前：<b>{SKINS.find((s) => s.id === uiState.skin)?.name}</b>
    </p>
    <ThemePicker />
    <p class="dim small">
      皮肤只改配色与圆角质感，不影响玩法数据；昼夜氛围（天空渐变）仍会随游戏时间变化。
    </p>
  </div>

  <div class="card setting-card">
    <div class="h2">🖥️ 显示</div>
    <div class="row">
      <span class="dim">游戏模式</span>
      <div class="seg">
        <button class="seg-btn" class:on={gameMode === "pc"} onclick={() => onGameMode("pc")}>端游模式</button>
        <button class="seg-btn" class:on={gameMode === "tablet"} onclick={() => onGameMode("tablet")}>平板模式</button>
        <button class="seg-btn" class:on={gameMode === "mobile"} onclick={() => onGameMode("mobile")}>手游模式</button>
      </div>
    </div>
    <div class="row">
      <span class="dim">测试模式（解锁剧情模式）</span>
      <button class="switch" class:on={testMode} onclick={onTestMode}>
        {testMode ? "开" : "关"}
      </button>
    </div>
    <div class="row">
      <span class="dim">独立小游戏模式（解锁小游戏入口）</span>
      <button class="switch" class:on={arcadeMode} onclick={onArcadeMode}>
        {arcadeMode ? "开" : "关"}
      </button>
    </div>
    <div class="row">
      <span class="dim">小游戏全屏（占满视口，固定开启）</span>
      <button class="switch on" disabled title="工作小游戏统一使用全屏舞台">开</button>
    </div>
    <div class="row">
      <span class="dim">一级地图过场动画（跨市区/郊区，默认开）</span>
      <button class="switch" class:on={sceneTransition} onclick={onSceneTransition}>
        {sceneTransition ? "开" : "关"}
      </button>
    </div>
    <div class="row">
      <span class="dim">二级区域过场动画（工业区/市中心/农村等，默认关）</span>
      <button class="switch" class:on={sceneTransitionL2} onclick={onSceneTransitionL2}>
        {sceneTransitionL2 ? "开" : "关"}
      </button>
    </div>
      <div class="row">
        <span class="dim">地图玻璃强度</span>
        <div class="seg">
          <button class="seg-btn" class:on={mapGlass === "low"} onclick={() => onMapGlass("low")}>低 · 最透</button>
          <button class="seg-btn" class:on={mapGlass === "medium"} onclick={() => onMapGlass("medium")}>中 · 轻玻璃</button>
          <button class="seg-btn" class:on={mapGlass === "high"} onclick={() => onMapGlass("high")}>高 · 平衡</button>
          <button class="seg-btn" class:on={mapGlass === "dark"} onclick={() => onMapGlass("dark")}>深色 · 文字最清晰</button>
        </div>
      </div>
    <div class="row">
      <span class="dim">UI 缩放 {Math.round(uiZoom * 100)}%</span>
      <input type="range" min="0.5" max="1.5" step="0.1" value={uiZoom} oninput={(e) => onZoom(parseFloat((e.currentTarget as HTMLInputElement).value))} />
    </div>
    <p class="dim small">端游模式随窗口自适应；手游模式为 20:9 横版，居中显示不拉伸；平板模式为 16:9 加宽手机布局（左右栏更宽），适合平板与宽屏手机。</p>
  </div>

  <div class="card setting-card">
    <div class="h2">🎵 音乐</div>
    <div class="row">
      <span class="dim">背景音乐</span>
      <button class="switch" class:on={bgmOn} onclick={onBgmToggle} onpointerdown={() => unlockAudio()}>
        {bgmOn ? "开" : "关"}
      </button>
    </div>
    <div class="row">
      <span class="dim">音乐音量 {bgmVol}%</span>
      <input type="range" min="0" max="100" value={bgmVol} oninput={(e) => onBgmVol(Number((e.currentTarget as HTMLInputElement).value))} />
    </div>
    <div class="row">
      <span class="dim">音效音量 {sfxVol}%</span>
      <input type="range" min="0" max="100" value={sfxVol} oninput={(e) => onSfxVol(Number((e.currentTarget as HTMLInputElement).value))} />
    </div>
    <div class="row">
      <span class="dim">时段 BGM</span>
      <div class="seg wrap">
        <button class="seg-btn" class:on={bgmSel === "auto"} onclick={() => onBgmSel("auto")}>自动</button>
        <button class="seg-btn" class:on={bgmSel === "dawn"} onclick={() => onBgmSel("dawn")}>凌晨</button>
        <button class="seg-btn" class:on={bgmSel === "morning"} onclick={() => onBgmSel("morning")}>早上</button>
        <button class="seg-btn" class:on={bgmSel === "noon"} onclick={() => onBgmSel("noon")}>中午</button>
        <button class="seg-btn" class:on={bgmSel === "afternoon"} onclick={() => onBgmSel("afternoon")}>下午</button>
        <button class="seg-btn" class:on={bgmSel === "night"} onclick={() => onBgmSel("night")}>晚上</button>
      </div>
    </div>
  </div>

  <div class="card setting-card">
    <div class="h2">关于</div>
    <p class="dim">{GAME_NAME} v{VERSION}（游戏模式 · 五时段 BGM · 独立双音量）</p>
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
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .row input[type="range"] {
    flex: 1;
    accent-color: var(--accent, #5b8cff);
  }
  .switch {
    min-width: 64px;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-main);
    cursor: pointer;
    font-size: 12px;
  }
  .switch.on {
    background: var(--accent, #5b8cff);
    color: #fff;
    border-color: transparent;
  }
  .seg {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .seg-btn {
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-main);
    cursor: pointer;
    font-size: 12px;
  }
  .seg-btn.on {
    background: var(--accent, #5b8cff);
    color: #fff;
    border-color: transparent;
  }
  .small {
    font-size: 11px;
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
