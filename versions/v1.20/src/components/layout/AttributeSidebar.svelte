<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, setAttrWidth } from "../../stores/uiStore.svelte";
  import { ATTR_ICONS, ATTR_NAMES, SKILL_ICONS, SKILL_NAMES } from "../../lib/icons";
  import { getMaxStamina } from "../../game/core/stats";
  import { STATUS_NAMES, STATUS_ICONS } from "../../game/core/statuses";
  import { attrSeverity, type SurvivalSeverity } from "../../game/core/survival";

  const survivalKeys = ["stamina", "health", "mood", "hygiene", "satiety"] as const;
  const growthKeys = ["intelligence", "charm", "fitness", "fame"] as const;
  const skillKeys = [
    "programming",
    "design",
    "writing",
    "operation",
    "cooking",
    "service",
    "driving",
    "management",
  ] as const;

  let isCollapsed = $state(false);

  /** 体力上限（可超 100） */
  const maxStamina = $derived(getMaxStamina(gameState));

  function attrColor(key: string, v: number): string {
    if (v <= 20) return "var(--danger)";
    if (v <= 40) return "var(--warn)";
    return key === "health" ? "var(--ok)" : "var(--accent-2)";
  }

  /** v0.92 分级告警：warn 闪烁 / danger 脉冲 / critical 脉冲 + 抖动 */
  function sevOf(key: string): SurvivalSeverity {
    const attrs = gameState.player.attrs as unknown as Record<string, number>;
    return attrSeverity(key, attrs[key] ?? 100);
  }

  /* ==================== v1.12 左侧栏宽度拖拽 ==================== */
  /** 热修：dragging 改为 $state，供 class:resizing 响应式绑定（拖拽中禁用 width 过渡） */
  let dragging = $state(false);
  let startX = 0;
  let startW = 0;

  /** 分隔条按下：记录起始位置与宽度，捕获指针 */
  function onResizeDown(e: PointerEvent): void {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = uiState.attrWidth;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: PointerEvent): void {
    if (!dragging) return;
    // game-root 有 transform:scale(zoom)，dx 需除以 zoom 换算为画布坐标
    const dx = (e.clientX - startX) / uiState.zoom;
    setAttrWidth(startW + dx);
  }
  function onResizeUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }
  /** 双击重置默认宽度 */
  function onResizeDbl(): void {
    setAttrWidth(uiState.gameMode === "mobile" ? 200 : 250);
  }
</script>

<aside class="sidebar hud-scope" class:collapsed={isCollapsed} class:resizing={dragging} style={`--attr-w:${uiState.attrWidth || 250}px`}>
  <div class="side-head">
    <span class="player-name">🧑 {gameState.player.name}</span>
    <button class="collapse-btn" onclick={() => (isCollapsed = !isCollapsed)}>
      {isCollapsed ? "▶" : "◀"}
    </button>
  </div>

  {#if !isCollapsed}
    <!-- 状态（debuff）栏 -->
    {#if gameState.statuses.length > 0}
      <div class="section statuses">
        <div class="section-title">状态</div>
        {#each gameState.statuses as st}
          <div class="status-chip" class:sick={st.id === "sick"}>
            <span>{STATUS_ICONS[st.id]}</span>
            <span class="st-name">{STATUS_NAMES[st.id]}</span>
            <span class="st-lv">Lv{st.severity}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- 压力条 -->
    <div class="section stress">
      <div class="stat-bar" class:danger={gameState.player.stress >= 60}>
        <span class="label">🔥 压力</span>
        <div class="track">
          <div
            class="fill"
            style="width:{gameState.player.stress}%;background:{gameState.player.stress >= 80 ? "var(--danger)" : gameState.player.stress >= 60 ? "var(--warn)" : "var(--accent-2)"}"
          ></div>
        </div>
        <span class="val">{Math.round(gameState.player.stress)}</span>
      </div>
    </div>

    <!-- 生存属性 -->
    <div class="section">
      <div class="section-title">生存状态</div>
      {#each survivalKeys as key}
        <div class="stat-row">
          <div class="stat-bar sev-{sevOf(key)}" class:danger={gameState.player.attrs[key] <= 20}>
            <span class="label">{ATTR_ICONS[key]} {ATTR_NAMES[key]}</span>
            <div class="track">
              <div
                class="fill"
                style="width:{key === "stamina" ? Math.min(100, (gameState.player.attrs[key] / maxStamina) * 100) : gameState.player.attrs[key]}%;background:{attrColor(key, gameState.player.attrs[key])}"
              ></div>
            </div>
            <span class="val">
              {#if key === "stamina"}
                {Math.round(gameState.player.attrs[key])}/{maxStamina}
              {:else}
                {Math.round(gameState.player.attrs[key])}
              {/if}
            </span>
          </div>
        </div>
      {/each}
    </div>

    <!-- 发展属性 -->
    <div class="section">
      <div class="section-title">能力</div>
      {#each growthKeys as key}
        <div class="stat-row">
          <div class="stat-bar">
            <span class="label">{ATTR_ICONS[key]} {ATTR_NAMES[key]}</span>
            <div class="track">
              <div
                class="fill"
                style="width:{gameState.player.stats[key]}%;background:var(--accent-2)"
              ></div>
            </div>
            <span class="val">{Math.round(gameState.player.stats[key])}</span>
          </div>
        </div>
      {/each}
    </div>

    <!-- 技能 -->
    <div class="section">
      <div class="section-title">技能</div>
      {#each skillKeys as key}
        <div class="skill-row">
          <span class="skill-name">{SKILL_ICONS[key]} {SKILL_NAMES[key]}</span>
          <div class="skill-dots">
            {#each Array(10) as _, i}
              <span class="dot" class:on={i < gameState.player.skills[key]}></span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</aside>
<!-- v1.12 左侧栏宽度拖拽分隔条（flex 兄弟，紧贴侧栏右缘） -->
<div
  class="resize-handle"
  onpointerdown={onResizeDown}
  onpointermove={onResizeMove}
  onpointerup={onResizeUp}
  onpointercancel={onResizeUp}
  ondblclick={onResizeDbl}
  title="拖拽调整左侧栏宽度（双击重置）"
></div>

<style>
  .resize-handle {
    flex-shrink: 0;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
    position: relative;
    z-index: 40;
    /* 热修：拖拽条仅手游模式显示（端游不出现额外控件） */
    display: none;
  }
  :global(:root[data-game-mode="mobile"]) .resize-handle {
    display: block;
  }
  .resize-handle:hover,
  .resize-handle:active {
    background: rgba(91, 140, 255, 0.35);
  }
  .sidebar {
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.62);
    width: var(--attr-w, 250px);
    min-width: var(--attr-w, 250px);
    background: rgba(16, 19, 31, 0.68);
    backdrop-filter: blur(8px);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    transition: width 0.2s ease, min-width 0.2s ease;
    display: flex;
    flex-direction: column;
    /* v0.91：HUD 文字加深色描边，任何背景可读 */
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  /* 热修：拖拽中禁用 width 过渡，消除跟手滞后 */
  .sidebar.resizing {
    transition: none !important;
  }
  .sidebar.collapsed {
    width: 44px;
    min-width: 44px;
  }
  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .player-name {
    font-weight: 700;
    font-size: 14px;
  }
  .collapse-btn {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 11px;
    color: var(--text-dim);
  }
  .section {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(51, 59, 99, 0.5);
  }
  .section-title {
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 2px;
    margin-bottom: 8px;
  }
  .statuses {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .status-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 179, 71, 0.12);
    color: var(--warn);
    border: 1px solid rgba(255, 179, 71, 0.3);
  }
  .status-chip.sick {
    background: rgba(255, 107, 107, 0.13);
    color: var(--danger);
    border-color: rgba(255, 107, 107, 0.4);
  }
  .st-name {
    font-weight: 600;
  }
  .st-lv {
    font-size: 10px;
    opacity: 0.8;
    margin-left: auto;
  }
  .stat-row {
    margin-bottom: 6px;
  }
  .stress {
    padding-top: 12px;
  }
  .skill-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .skill-name {
    font-size: 12px;
    color: var(--text-dim);
  }
  .skill-dots {
    display: flex;
    gap: 2px;
  }
  .dot {
    width: 5px;
    height: 9px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.12);
  }
  .dot.on {
    background: var(--accent);
  }
</style>
