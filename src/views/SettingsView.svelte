<script lang="ts">
  import { onMount } from "svelte";
  import { backFromPage, gameState } from "../stores/gameStore.svelte";
  import { resetAllSaves } from "../lib/save";
  import { developerState, setDeveloperEnabled, openDeveloperPanel, developerSessionAvailable } from "../stores/developerStore.svelte";
  import { uiState, setZoom, setShowLog, setGameMode, setMapGlass, setActionCardBackground, uiConfirm } from "../stores/uiStore.svelte";
  import SceneDisplayControls from '../components/SceneDisplayControls.svelte';
  import MobileDisplayControls from '../components/MobileDisplayControls.svelte';
  import { FAMILIES } from "../game/core/families";
  import { locationName } from "../game/core/quests";
  import { VERSION, REVISION, GAME_NAME, CHANGELOG } from "../version";
  import type { GameMode } from "../lib/mobileLayout";
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
  let showHistory = $state(false);
  /** 本地状态与持久化同步 */
  let bgmVol = $state(getBgmVolume());
  let bgmOn = $state(isBgmEnabled());
  let sfxVol = $state(getSfxVolume());
  let bgmSel = $state<BgmTrackId | "auto">(getBgmSelection());
  let uiZoom = $state(uiState.zoom);
  let showLog = $state(uiState.showLog);
  let gameMode = $state<Exclude<GameMode, "mobile">>(uiState.gameMode === "mobile" ? "pe" : uiState.gameMode);
  let mapGlass = $state(uiState.mapGlass);
  let actionCardBackground = $state(uiState.actionCardBackground);
  let tapPrivacyAvailable = $state(false);
  /** 页内隐私政策兜底层：原生弹窗不可用时的降级通道 */
  let privacyFallbackOpen = $state(false);

  onMount(() => {
    tapPrivacyAvailable = typeof window !== "undefined" && typeof window.UrbanLifeTap?.showPrivacyPolicy === "function";
  });

  /**
   * 打开隐私政策。
   *
   * 审核反馈「隐私政策点击无反应」的防御性处理：原生桥可能在部分 ROM 上
   * 因弹窗测量异常而静默失败，因此这里捕获异常并回退到页内弹层，
   * 保证用户点击后一定能看到规则全文，不存在无响应路径。
   */
  function openPrivacyPolicy(): void {
    try {
      const bridge = typeof window !== "undefined" ? window.UrbanLifeTap : undefined;
      if (typeof bridge?.showPrivacyPolicy === "function") {
        bridge.showPrivacyPolicy();
        return;
      }
    } catch (error) {
      console.warn("[privacy] native dialog failed, falling back to in-page panel", error);
    }
    privacyFallbackOpen = true;
  }

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
  /** v1.44.1 端游底部常驻行动日志条显隐（手游日志走顶栏 📜 弹层，不受影响） */
  function onShowLog(): void {
    showLog = !showLog;
    setShowLog(showLog);
  }
  function onGameMode(m: Exclude<GameMode, "mobile">): void {
    gameMode = m;
    setGameMode(m);
    // 模式预设会顺带改缩放与日志条，同步本地表单状态
    uiZoom = uiState.zoom;
    showLog = uiState.showLog;
  }
  function onMapGlass(v: "low" | "medium" | "high" | "dark"): void {
    mapGlass = v;
    setMapGlass(v);
  }
  function onActionCardBackground(v: "texture" | "glass"): void {
    actionCardBackground = v;
    setActionCardBackground(v);
  }

  async function doReset(): Promise<void> {
    if (!(await uiConfirm("确定删除所有存档？此操作不可恢复！", { confirmLabel: "删除全部", danger: true }))) return;
    resetting = true;
    try {
      await resetAllSaves();
      uiState.modal = null;
    } finally {
      resetting = false;
    }
  }
</script>

<div class="page settings-page">
  <div class="page-head">
    <button class="btn" onclick={() => backFromPage()}>← 返回</button>
    <span class="h1">设置</span>
    <span></span>
  </div>

  <div class="page-intro"><span class="page-eyebrow">你的游戏，你的节奏</span><p>调整显示、声音与界面，让这座城市更适合你。</p></div>

  <!-- 卡片按列紧凑排布：两列等高流动，避免 grid 行高被最高卡片撑开留出大块空白 -->
  <div class="settings-cards">

  {#if developerState.unlocked}
    <div class="card setting-card">
      <div class="h2">🛠️ 超级开发者模式</div>
      <div class="row"><span class="dim">启用游戏内调试工具</span><button class="switch" class:on={developerState.enabled} role="switch" aria-label="启用超级开发者模式" aria-checked={developerState.enabled} onclick={() => setDeveloperEnabled(!developerState.enabled)}>{developerState.enabled ? "开" : "关"}</button></div>
      <p class="dim small">已通过标题十连点解锁。开启后，游戏顶栏显示调试入口，可调整物品、现金、人物关系、时间、地点、任务与完整游戏状态。调试修改会保存到当前游戏。</p>
      {#if developerState.enabled}
        <button class="btn" disabled={!developerSessionAvailable()} onclick={openDeveloperPanel}>打开超级开发者面板</button>
        {#if !developerSessionAvailable()}<p class="dim small">先开始新生活或读取存档，进入游戏后即可使用。</p>{/if}
      {/if}
    </div>
  {/if}

  <div class="card setting-card display-card">
    <div class="h2">🖥️ 显示与布局</div>
    <div class="row display-mode-row">
      <span class="dim">模式预设</span>
      <div class="seg wrap">
        <button class="seg-btn" class:on={gameMode === "pc"} onclick={() => onGameMode("pc")}>PC 模式</button>
        <button class="seg-btn" class:on={gameMode === "pe"} onclick={() => onGameMode("pe")}>PE 模式（手机）</button>
        <button class="seg-btn" class:on={gameMode === "tablet"} onclick={() => onGameMode("tablet")}>平板模式</button>
      </div>
    </div>
    <div class="row">
      <span class="dim">UI 缩放 {Math.round(uiZoom * 100)}%</span>
      <input type="range" min="0.5" max="1.5" step="0.1" value={uiZoom} oninput={(e) => onZoom(parseFloat((e.currentTarget as HTMLInputElement).value))} />
    </div>
    {#if gameMode === "pc"}
    <div class="row">
      <span class="dim">显示底部行动日志（端游布局）</span>
      <button class="switch" class:on={showLog} onclick={onShowLog}>
        {showLog ? "开" : "关"}
      </button>
    </div>
    {:else}
    <div class="row">
      <span class="dim">底部行动日志</span>
      <span class="mode-status">{gameMode === "tablet" ? "平板模式默认关闭" : "PE 模式默认关闭"}</span>
    </div>
    {/if}
    <p class="dim small">缩放对所有界面一起生效；小屏上关掉底部日志能多留些画面。</p>
    <p class="dim small">换模式会套用对应预设，之后照样能自己调。</p>
    {#if gameMode === 'pe'}<MobileDisplayControls/>{/if}
  </div>

  <div class="card setting-card">
    <div class="h2">场景与画面</div>
    <SceneDisplayControls home/>
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
      <span class="dim">地图配乐</span>
      <div class="seg wrap">
        <button class="seg-btn" class:on={bgmSel === "auto"} onclick={() => onBgmSel("auto")}>自动</button>
        <button class="seg-btn" class:on={bgmSel === "dawn"} onclick={() => onBgmSel("dawn")}>深夜 00–06</button>
        <button class="seg-btn" class:on={bgmSel === "morning"} onclick={() => onBgmSel("morning")}>早间 06–12</button>
        <button class="seg-btn" class:on={bgmSel === "noon"} onclick={() => onBgmSel("noon")}>午间 12–18</button>
        <button class="seg-btn" class:on={bgmSel === "night"} onclick={() => onBgmSel("night")}>晚间 18–24</button>
      </div>
    </div>
    <p class="dim small">自动模式跟着时段换曲；夜总会、清吧、寺庙这些地方有各自的配乐。</p>
  </div>

  <div class="card setting-card map-style-card">
    <div class="h2">🗺️ 地图与动效</div>
    <div class="row">
      <span class="dim">地图玻璃强度</span>
      <div class="seg">
        <button class="seg-btn" class:on={mapGlass === "low"} onclick={() => onMapGlass("low")}>低 · 最透</button>
        <button class="seg-btn" class:on={mapGlass === "medium"} onclick={() => onMapGlass("medium")}>中 · 轻玻璃</button>
        <button class="seg-btn" class:on={mapGlass === "high"} onclick={() => onMapGlass("high")}>高 · 平衡</button>
        <button class="seg-btn" class:on={mapGlass === "dark"} onclick={() => onMapGlass("dark")}>深色 · 文字最清晰</button>
      </div>
    </div>
    <div class="row card-background-row">
      <span class="dim">场景卡底纹</span>
      <div class="seg">
        <button class="seg-btn" class:on={actionCardBackground === "texture"} onclick={() => onActionCardBackground("texture")}>抽象艺术纹理</button>
        <button class="seg-btn" class:on={actionCardBackground === "glass"} onclick={() => onActionCardBackground("glass")}>经典半透明</button>
      </div>
    </div>
    <p class="dim small">只改地图动效、标牌透明度和行动卡底纹，底图不受影响。</p>
  </div>

  <div class="card setting-card">
    <div class="h2">关于</div>
    <p class="dim">{GAME_NAME} v{VERSION}（游戏模式 · 四时段地图配乐 · 设施专属配乐 · 独立双音量）</p>
    <p class="dim small">更新批次：{REVISION}</p>
  </div>

  {#if tapPrivacyAvailable}
  <div class="card setting-card">
    <div class="h2">隐私与账号</div>
    <p class="dim small">查看 TapTap 登录邮箱、授权标识与云存档的处理规则。</p>
    <button class="btn" onclick={openPrivacyPolicy}>查看个人信息处理规则</button>
  </div>
  {/if}

  </div>

  <div class="settings-rest">
  <div class="card setting-card updates-card">
    <div class="h2">更新日志</div>
    <div class="changelog">
      {#each (showHistory ? CHANGELOG : CHANGELOG.slice(0, 3)) as entry}
        <details class="cl-entry" open={entry.version === VERSION}>
          <summary class="cl-head">
            <span class="cl-ver">v{entry.version}</span>
            <span class="cl-date">{entry.date}</span>
            <span class="cl-title">{entry.title}</span>
          </summary>
          <ul class="cl-notes">
            {#each entry.notes as n}
              <li>{n}</li>
            {/each}
          </ul>
        </details>
      {/each}
    </div>
  {#if CHANGELOG.length > 3}
    <button class="btn" aria-expanded={showHistory} onclick={() => showHistory = !showHistory}>{showHistory ? "收起历史更新" : `展开历史更新（${CHANGELOG.length - 3} 条）`}</button>
  {/if}
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
    <p class="dim">当前地点：{locationName(gameState.locationId)}</p>
  </div>
  </div>
</div>

{#if privacyFallbackOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="privacy-mask" role="presentation" onclick={() => (privacyFallbackOpen = false)}>
    <div
      class="privacy-panel"
      role="dialog"
      aria-modal="true"
      aria-label="个人信息处理规则"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h3 class="privacy-title">个人信息处理规则与邮箱告知</h3>
      <div class="privacy-body">
        <p>一、TapTap 登录邮箱</p>
        <p>你先阅读并勾选本规则，再点击“TapTap 登录”时，本游戏才会启动 TapTap 登录 SDK。若你选择邮箱方式登录，需要在 TapTap 账号登录页面输入 TapTap 账号邮箱及登录凭据。邮箱及登录凭据由易玩（上海）网络科技有限公司的 TapTap 账号服务接收并用于 TapTap 账号验证和登录；本游戏客户端不读取、不记录、不保存或上传这些输入内容。</p>
        <p>二、登录授权标识</p>
        <p>本游戏向 TapTap 登录 SDK 请求 basic_info 授权范围。游戏业务代码只读取 OpenID，用于账号识别、实名认证和防沉迷校验；不读取 UnionID、邮箱或密码。</p>
        <p>三、设备信息与网络权限</p>
        <p>本 APK 声明的 Android 权限为INTERNET（联网）和 ACCESS_NETWORK_STATE（读取网络连接状态）；没有申请通讯录、定位、相机、麦克风、电话状态或外部存储权限。</p>
        <p>四、实名认证与防沉迷</p>
        <p>登录后本游戏会将 TapTap OpenID 提交给 TapTap 合规服务，用于实名认证、游戏时长与防沉迷校验。实名信息由 TapTap 合规服务处理。</p>
        <p>五、云存档</p>
        <p>只有你点击“上传”时存档才会上传，点击“恢复”时才会下载。游戏不会在后台自动上传进度。</p>
        <p>六、本地存储与规则查阅</p>
        <p>未上传的游戏进度保存在本机。你可以随时在游戏“设置”中重新查看本规则。</p>
      </div>
      <button class="btn privacy-close" onclick={() => (privacyFallbackOpen = false)}>关闭</button>
    </div>
  </div>
{/if}

<style>
  .privacy-mask {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(2, 6, 23, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  /* max-height + 内部滚动：横屏矮屏也不会把关闭按钮挤出可视区 */
  .privacy-panel {
    width: min(560px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    color: #334155;
    border-radius: 12px;
    padding: 16px;
    gap: 12px;
    box-shadow: 0 18px 48px rgba(2, 6, 23, 0.45);
  }
  .privacy-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
  }
  .privacy-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.6;
  }
  .privacy-body p {
    margin: 0 0 8px;
  }
  .privacy-close {
    flex: 0 0 auto;
    min-height: 44px;
  }
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
    min-width: 0;
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
    color: var(--accent-ink);
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
    color: var(--accent-ink);
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
