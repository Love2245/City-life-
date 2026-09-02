<script lang="ts">
  import { goto, setPendingMode, profile, loadProfileIntoStore, quickCatBattle } from "../stores/gameStore.svelte";
  import { loadGameIntoState, listSaves } from "../lib/save";
  import { showToast, uiState } from "../stores/uiStore.svelte";
  import { formatMoney, formatDate } from "../lib/format";

  let autoSaveInfo = $state<string | null>(null);

  /** v0.991：启动即载入多周目档案（命运点/解锁/回忆录） */
  loadProfileIntoStore();

  /** 检查自动存档是否存在 */
  async function checkAutoSave(): Promise<void> {
    const saves = await listSaves();
    const auto = saves.find((s) => s.slot === "auto");
    autoSaveInfo = auto ? `${formatDate(auto.year, auto.month, auto.day)} · 余额 ${formatMoney(auto.money)}` : null;
  }
  checkAutoSave();

  async function continueGame(): Promise<void> {
    const ok = await loadGameIntoState("auto");
    if (ok) goto("game");
  }

  /** 永恒模式入口：解锁后可进（未解锁显示锁定） */
  function startEternal(): void {
    if (!profile.unlocked.eternal) {
      showToast("🔒 先达成一次结局，才能开启永恒模式");
      return;
    }
    setPendingMode("eternal");
    goto("background");
  }
</script>

<div class="menu-root">
  <div class="menu-panel">
    <div class="game-logo">
      <span class="logo-icon">🌆</span>
      <h1 class="title">都市生活</h1>
      <p class="subtitle">在这座城市活下去，活出个人样</p>
    </div>

    <div class="menu-btns">
      <button
        class="btn btn-primary menu-btn"
        onclick={() => {
          // v0.992：点「开始新生活」重置上次预选的模式（点过永恒再点新游戏不该还是永恒）
          setPendingMode("normal");
          goto("background");
        }}
      >
        🆕 开始新生活
      </button>
      <button class="btn menu-btn" onclick={() => continueGame()} disabled={!autoSaveInfo}>
        ▶️ 继续生活
        {#if autoSaveInfo}
          <span class="save-hint">{autoSaveInfo}</span>
        {/if}
      </button>
      <button
        class="btn btn-primary menu-btn catbattle-btn"
        onclick={() => quickCatBattle()}
      >
        🐱 喵喵对决 <span class="save-hint">直接开打 · 休闲无惩罚</span>
      </button>
      <button class="btn menu-btn" onclick={() => startEternal()}>
        {profile.unlocked.eternal ? "♾️ 永恒模式" : "🔒 永恒模式（未解锁）"}
      </button>
      {#if uiState.arcadeMode}
        <button class="btn menu-btn" onclick={() => goto("arcade")}>
          🎮 小游戏 <span class="save-hint">全部工作 + 手机四款</span>
        </button>
      {/if}
      <button class="btn menu-btn" onclick={() => goto("fate")}>
        🔮 命运 <span class="fate-points">✦ {profile.fatePoints}</span>
      </button>
      <button class="btn menu-btn" onclick={() => goto("memoir")}>
        📖 回忆录
      </button>
      <button class="btn menu-btn" onclick={() => goto("saveLoad")}>📂 存档 / 读档</button>
      <button class="btn menu-btn" onclick={() => goto("ending")}>📖 结局图鉴</button>
      <button class="btn menu-btn" onclick={() => goto("settings")}>🎛️ 设置</button>
    </div>

    <p class="footnote dim">灵感来自《属性与生活》· 桌面端重制</p>
  </div>
</div>

<style>
  .menu-root {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      linear-gradient(rgba(10, 14, 26, 0.55), rgba(10, 14, 26, 0.75)),
      url("/src/assets/bg/menu/menu.webp") center / cover no-repeat,
      var(--grad-sky);
  }
  /* v1.3b2 UI 美化：主菜单面板毛玻璃 + 顶部光晕 + 按钮质感 */
  .menu-panel {
    width: 420px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding: 40px;
    background: var(--glass-bg);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border: 1px solid var(--glass-border);
    border-radius: 24px;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.08) inset,
      0 24px 60px rgba(0, 0, 0, 0.45);
    position: relative;
    overflow: hidden;
    animation: menu-in 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.1);
  }
  .menu-panel::before {
    content: "";
    position: absolute;
    top: -90px;
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    height: 180px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 32%, transparent), transparent);
    pointer-events: none;
  }
  @keyframes menu-in {
    from { opacity: 0; transform: translateY(18px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  .logo-icon {
    font-size: 64px;
    display: block;
    filter: drop-shadow(0 8px 20px rgba(108, 198, 255, 0.4));
    animation: logo-float 3.2s ease-in-out infinite;
  }
  @keyframes logo-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  .title {
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 6px;
    margin-top: 8px;
    background: linear-gradient(120deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .subtitle {
    color: var(--text-dim);
    font-size: 14px;
    letter-spacing: 2px;
  }
  .menu-btns {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .menu-btn {
    width: 100%;
    padding: 14px;
    font-size: 15px;
    border-radius: 14px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 85%, white 4%), var(--bg-card));
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 3px 10px rgba(0, 0, 0, 0.25);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
  }
  .menu-btn:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset,
      0 10px 26px color-mix(in srgb, var(--accent) 24%, rgba(0, 0, 0, 0.4));
  }
  .menu-btn:active {
    transform: translateY(0) scale(0.98);
  }
  .save-hint {
    font-size: 11px;
    opacity: 0.7;
    margin-left: 6px;
  }
  .footnote {
    font-size: 11px;
    letter-spacing: 1px;
  }
</style>
