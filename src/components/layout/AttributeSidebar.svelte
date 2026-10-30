<script lang="ts">
  import { onMount } from "svelte";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, setAttrWidth, MOBILE_COMPACT_WIDTH } from "../../stores/uiStore.svelte";
  import { isMobileLayout } from "../../stores/uiStore.svelte";
  import { ATTR_NAMES } from "../../lib/icons";
  import { getMaxStamina } from "../../game/core/stats";
  import { STATUS_NAMES } from "../../game/core/statuses";
  import { attrSeverity, type SurvivalSeverity } from "../../game/core/survival";
  import { activePetOf, CARE_LOW } from "../../game/core/catCare";
  import { getAccessoryDef } from "../../game/core/catAccessory";
  import { showToast, showResult } from "../../stores/uiStore.svelte";
  import { playSound } from "../../lib/audio";
  import { waitHere, waitOptions, WAIT_MAX_HOURS } from "../../game/core/actions";
  import CharacterAbilities from '../CharacterAbilities.svelte';

  /** v1.43.x 手游：等待集成进侧栏（原场景等待条占整行、悬浮开关遮挡视线，均已移除）。 */
  const waitTiers = $derived(waitOptions(gameState));
  function doWaitHere(hours: number): void {
    const r = waitHere(gameState, hours, hours > WAIT_MAX_HOURS ? { max: 24 } : undefined);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在没法等"}`);
      return;
    }
    playSound("walk");
    if (r.result) showResult(r.result);
  }

  const survivalKeys = ["stamina", "health", "mood", "hygiene", "satiety"] as const;

  let isCollapsed = $state(
    typeof window !== "undefined" && isMobileLayout() && window.innerWidth < MOBILE_COMPACT_WIDTH,
  );
  /** 低宽度手游默认收起；玩家主动切换后尊重其选择。 */
  let userToggledCollapse = false;
  let compactApplied = false;

  /** 手游下状态/技能区默认折叠以节省纵向空间，但状态栏本身只要放得下就保持展开。 */
  function syncCompactDefault(): void {
    if (typeof window === "undefined") return;
    const portrait = window.matchMedia?.("(orientation: portrait)")?.matches ?? false;
    const shouldCompact =
      (isMobileLayout() && (window.innerWidth < MOBILE_COMPACT_WIDTH || portrait)) ||
      (uiState.gameMode === "pc" && window.innerWidth <= 600);
    if (shouldCompact && !userToggledCollapse) {
      isCollapsed = true;
      compactApplied = true;
    } else if (!shouldCompact && compactApplied && !userToggledCollapse) {
      isCollapsed = false;
      compactApplied = false;
    } else if (!shouldCompact && !userToggledCollapse) {
      isCollapsed = false;
    }
  }

  onMount(() => {
    syncCompactDefault();
    // initZoom 可能在组件挂载后才恢复本地模式配置，再补一次初始判定。
    const initialSync = window.setTimeout(syncCompactDefault, 0);
    window.addEventListener("resize", syncCompactDefault);
    window.addEventListener("orientationchange", syncCompactDefault);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("resize", syncCompactDefault);
      window.removeEventListener("orientationchange", syncCompactDefault);
    };
  });

  /** 体力上限（可超 100） */
  const maxStamina = $derived(getMaxStamina(gameState));

  /* ==================== v1.38 猫咪状态条 ==================== */
  /** 携带中的猫咪（决定「携带外出」时是否显示状态条） */
  const activeCat = $derived(activePetOf(gameState));
  /** 没有任何猫咪时不显示空的猫咪状态区；有猫时在家/外出均可查看。 */
  const showCatBar = $derived(gameState.pets.length > 0);

  const CAT_CARE_KEYS: Array<{ key: "satiety" | "mood" | "hygiene"; name: string }> = [
    { key: "satiety", name: "饱食" },
    { key: "mood", name: "心情" },
    { key: "hygiene", name: "干净" },
  ];
  function catCareCls(v: number): string {
    if (v < 30) return "sev-danger";
    if (v < 60) return "sev-warn";
    return "sev-ok";
  }
  function catCareColor(v: number): string {
    if (v < 30) return "var(--danger)";
    if (v < 60) return "var(--warn)";
    return "var(--ok)";
  }

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
    // v1.44.1 全局 UI 缩放（app-zoom 的 CSS zoom）：clientX 是视觉 px，attrWidth 是布局 px，
    // 需除以有效缩放系数换算。端游 = uiState.zoom；手游 = 钳制后的 zoom（渲染分辨率不影响布局）
    // （与 mobile.css --m-ui-zoom 的 clamp 0.7~1.3 保持一致）。
    const effZoom = isMobileLayout()
      ? Math.min(1.3, Math.max(0.7, uiState.zoom))
      : uiState.zoom;
    const dx = (e.clientX - startX) / (effZoom || 1);
    setAttrWidth(startW + dx);
  }
  function onResizeUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }
  /** 双击重置默认宽度（pc 250 / mobile 144） */
  function onResizeDbl(): void {
    if (isMobileLayout()) setAttrWidth(144);
    else setAttrWidth(250);
  }
  function onResizeKey(e: KeyboardEvent): void {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setAttrWidth(uiState.attrWidth + (e.key === "ArrowRight" ? 16 : -16));
  }
</script>

<aside class="sidebar hud-scope" class:collapsed={isCollapsed} class:resizing={dragging} style={`--attr-w:${uiState.attrWidth || (isMobileLayout() ? 144 : 250)}px`}>
  <!-- 侧栏不再显示没有信息量的玩家姓名标题，保留窄边折叠把手。 -->
  <button class="collapse-btn sidebar-edge-toggle" aria-label={isCollapsed ? "展开状态栏" : "收起状态栏"} onclick={() => { userToggledCollapse = true; isCollapsed = !isCollapsed; }}>
    {isCollapsed ? "▶" : "◀"}
  </button>

  {#if !isCollapsed}
    <div class="side-head"><span class="sidebar-title">人物状态</span></div>
    <!-- 状态与压力：合并为同一块告警面板，减少视觉断裂。 -->
    <div class="section alert-section">
      {#if gameState.statuses.length > 0}
        <div class="statuses">
          <div class="section-title"><span class="section-mark status-section-mark" aria-hidden="true"></span>状态</div>
          {#each gameState.statuses as st}
            <div class="status-chip" class:sick={st.id === "sick"}>
              <span class="status-mark" aria-hidden="true"></span>
              <span class="st-name">{STATUS_NAMES[st.id]}</span>
              <span class="st-lv">Lv{st.severity}</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="stress">
        <div class="stat-bar" class:danger={gameState.player.stress >= 60}>
          <span class="label"><span class="status-mark stress-mark" aria-hidden="true"></span>压力</span>
          <div class="track">
            <div
              class="fill"
              style="width:{gameState.player.stress}%;background:{gameState.player.stress >= 80 ? "var(--danger)" : gameState.player.stress >= 60 ? "var(--warn)" : "var(--accent-2)"}"
            ></div>
          </div>
          <span class="val">{Math.round(gameState.player.stress)}</span>
        </div>
      </div>
    </div>

    <!-- 生存属性 -->
    <div class="section stat-section survival-section" aria-label="身体状态">
      {#each survivalKeys as key}
        <div class="stat-row">
          <div class="stat-bar sev-{sevOf(key)}" class:danger={gameState.player.attrs[key] <= 20}>
            <span class="label"><span class="attr-mark attr-{key}" aria-hidden="true"></span>{ATTR_NAMES[key]}</span>
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

    <!-- v1.38 猫咪状态条：仅回家 / 携带外出时显示 -->
    {#if showCatBar}
      <div class="section cat-status">
        <div class="section-title"><span class="section-mark cat-mark" aria-hidden="true"></span>猫咪状态</div>
        {#if activeCat}
          {@const pet = activeCat}
          <div class="cat-status-name">
            <span>{pet.icon} {pet.name}</span>
            {#if pet.accessory}{@const acc = getAccessoryDef(pet.accessory)}<span class="cat-acc" title={acc?.name}> {acc?.icon}</span>{/if}
            {#if pet.sick}<span class="cat-sick">生病</span>{/if}
          </div>
          {#each CAT_CARE_KEYS as ck}
            {@const v = pet.care[ck.key]}
            <div class="stat-bar cat-bar {catCareCls(v)}">
              <span class="label"><span class="attr-mark cat-care-mark" aria-hidden="true"></span>{ck.name}</span>
              <div class="track"><div class="fill" style="width:{v}%;background:{catCareColor(v)}"></div></div>
              <span class="val">{v}</span>
            </div>
          {/each}
          {#if pet.care.satiety < CARE_LOW || pet.care.mood < CARE_LOW || pet.care.hygiene < CARE_LOW}
            <div class="cat-warn">状态偏低，记得喂食 / 陪玩 / 洗澡</div>
          {/if}
        {:else}
          {#each gameState.pets as p (p.uid)}
            <div class="cat-home-row">
              <span class="chr-icon">{p.icon}</span>
              <span class="chr-name">{p.name}</span>
              {#each CAT_CARE_KEYS as ck}
                <span class="mini-bar"><i style="width:{p.care[ck.key]}%;background:{catCareColor(p.care[ck.key])}"></i></span>
              {/each}
              {#if p.sick}<span class="cat-sick">生病</span>{/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="section abilities-section"><CharacterAbilities /></div>

    <!-- v1.43.x 手游：等待档位（原场景等待条已删，功能收进侧栏） -->
    {#if isMobileLayout()}
      <div class="section wait-section">
        <div class="section-title"><span class="section-mark wait-mark" aria-hidden="true"></span>等待</div>
        <div class="wait-grid">
          {#each waitTiers as t}
            <button class="wait-chip" class:smart={t.smart} onclick={() => doWaitHere(t.hours)}>{t.label}</button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</aside>
<!-- v1.12 左侧栏宽度拖拽分隔条（flex 兄弟，紧贴侧栏右缘） -->
<div
  class="resize-handle"
  role="slider"
  tabindex="0"
  aria-label="调整状态栏宽度"
  aria-valuemin={isMobileLayout() ? 104 : 140}
  aria-valuemax={260}
  aria-valuenow={uiState.attrWidth}
  onpointerdown={onResizeDown}
  onpointermove={onResizeMove}
  onpointerup={onResizeUp}
  onpointercancel={onResizeUp}
  ondblclick={onResizeDbl}
  onkeydown={onResizeKey}
  title="拖拽调整左侧栏宽度（双击重置）"
></div>

<style>
  .sidebar {
    width: var(--attr-w, 250px); min-width: var(--attr-w, 250px);
    position: relative; isolation: isolate; display: flex; flex-direction: column;
    overflow-y: auto; color: var(--hud-text); background: var(--hud-surface);
    border-right: 1px solid var(--hud-border); backdrop-filter: blur(12px);
    transition: width 0.2s ease, min-width 0.2s ease;
    text-shadow: var(--hud-text-shadow);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .sidebar::-webkit-scrollbar { display: none; width: 0; height: 0; }
  .sidebar.resizing { transition: none !important; }
  .sidebar.collapsed { width: 44px; min-width: 44px; }
  .sidebar-edge-toggle { position: absolute; top: 14px; right: 10px; z-index: 3; }
  .collapse-btn { display: grid; place-items: center; width: 26px; height: 28px; border: 1px solid var(--hud-border); border-radius: 7px; background: color-mix(in srgb, var(--hud-text) 5%, transparent); font-size: 10px; color: var(--text-dim); cursor: pointer; }
  .collapse-btn:hover { color: var(--accent); border-color: var(--accent); }
  .sidebar.collapsed .collapse-btn { right: 6px; width: 30px; }
  .side-head { display: flex; align-items: center; min-height: 46px; padding: 10px 42px 8px 16px; flex: 0 0 auto; }
  .sidebar-title { font-size: 13px; font-weight: 750; color: var(--text-main); letter-spacing: 0.8px; }
  .section { margin: 0 14px; padding: 10px 0; border-top: 1px solid var(--hud-border); }
  .section-title { display: flex; align-items: center; justify-content: flex-start; gap: 7px; font-size: 10px; font-weight: 650; color: var(--text-dim); letter-spacing: .5px; margin-bottom: 8px; }
  .section-mark { display: inline-block; width: 3px; height: 10px; border-radius: 2px; flex: 0 0 auto; background: var(--accent-2); }
  .status-section-mark { background: var(--warn); }
  .cat-mark { background: var(--accent); }
  .alert-section { padding-top: 11px; }
  .statuses { display: flex; flex-direction: column; gap: 5px; margin-bottom: 11px; }
  .statuses .section-title { margin-bottom: 3px; }
  .status-chip { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 6px 8px; border-radius: 6px; background: color-mix(in srgb, var(--warn) 9%, transparent); color: var(--warn); border: 0; }
  .status-chip.sick { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .st-name { font-weight: 650; }
  .st-lv { margin-left: auto; font-size: 10px; opacity: 0.85; font-variant-numeric: tabular-nums; }
  .status-mark, .attr-mark { display: inline-block; flex: 0 0 auto; width: 4px; height: 4px; border-radius: 50%; background: var(--accent-2); }
  .status-mark { background: currentColor; }
  .stress-mark { background: var(--warn); }
  .attr-mark { width: 4px; height: 8px; border-radius: 2px; }
  .attr-health { background: var(--ok); }
  .attr-mood, .attr-satiety, .cat-care-mark { background: var(--accent); }
  .stat-row { margin-bottom: 7px; }
  .stat-row:last-child { margin-bottom: 0; }
  .sidebar .stat-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 8px; }
  .sidebar .stat-bar .label { width: auto; min-width: 0; gap: 6px; grid-column: 1; grid-row: 1; font-size: 11px; color: var(--text-dim); }
  .sidebar .stat-bar .val { grid-column: 2; grid-row: 1; min-width: 0; max-width: none; font-size: 12px; font-weight: 650; color: var(--text-main); font-variant-numeric: tabular-nums; line-height: 1.2; }
  .sidebar .stat-bar .track { grid-column: 1 / -1; grid-row: 2; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--hud-text) 10%, transparent); box-shadow: none; }
  .sidebar .stat-bar .fill { border-radius: 3px; box-shadow: none; }
  .sidebar .stat-bar.danger .label, .sidebar .stat-bar.danger .val,
  .sidebar .stat-bar.sev-danger .label, .sidebar .stat-bar.sev-danger .val,
  .sidebar .stat-bar.sev-critical .label, .sidebar .stat-bar.sev-critical .val { color: var(--danger); }
  .sidebar .stat-bar.sev-warn .label, .sidebar .stat-bar.sev-warn .val { color: var(--warn); }
  .sidebar .stat-bar.danger .attr-mark, .sidebar .stat-bar.sev-danger .attr-mark, .sidebar .stat-bar.sev-critical .attr-mark { background: var(--danger); }
  .sidebar .stat-bar.sev-warn .attr-mark { background: var(--warn); }
  .cat-status-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; margin-bottom: 10px; }
  .cat-acc { font-size: 13px; }
  .cat-sick { margin-left: auto; font-size: 10px; color: var(--danger); border-radius: 4px; padding: 2px 5px; background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .cat-bar.stat-bar { margin-bottom: 8px; }
  .cat-warn { margin-top: 8px; font-size: 10px; line-height: 1.5; color: var(--warn); }
  .cat-home-row { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; font-size: 11px; }
  .chr-icon { font-size: 14px; }
  .chr-name { width: 50px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini-bar { flex: 1; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--hud-text) 10%, transparent); overflow: hidden; }
  .mini-bar i { display: block; height: 100%; }
  .wait-section .wait-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
  .wait-chip { min-height: 28px; padding: 3px 5px; border: 1px solid var(--hud-border); border-radius: 5px; background: transparent; color: var(--text-main); font: inherit; font-size: 10px; line-height: 1.2; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wait-chip.smart { grid-column: 1 / -1; color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  .wait-chip:active { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .wait-chip:focus-visible, .collapse-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .resize-handle { flex-shrink: 0; width: 8px; cursor: col-resize; touch-action: none; background: transparent; position: relative; z-index: 40; display: none; }
  :global(:root[data-game-mode="mobile"]) .resize-handle { display: block; }
  .resize-handle:hover, .resize-handle:active { background: color-mix(in srgb, var(--accent-2) 30%, transparent); }
  :global(:root[data-game-mode="mobile"]) .side-head { padding: 0; }
  :global(:root[data-game-mode="mobile"]) .sidebar-title { display: none; }
  :global(:root[data-game-mode="mobile"]) .section { margin-left: 0; margin-right: 0; }
</style>
