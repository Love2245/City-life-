<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { sleep, nap, naturalWakeHours, formatTime, alarmCappedHours, sleepQualityOf } from "../../game/core/time";
  import { currentResidenceName, getEffectiveLodging } from "../../game/core/housing";
  import { statusSleepPenalty } from "../../game/core/statuses";
  import { playSound } from "../../lib/audio";

  const place = $derived(currentResidenceName(gameState));
  const lodging = $derived(getEffectiveLodging(gameState));
  const naturalHours = $derived(naturalWakeHours(gameState));

  /** 滑块选择的睡眠小时数（计划时长） */
  let hours = $state(8);

  /** 起床闹钟开关与时刻（与 gameState.alarmHour 双向同步） */
  let alarmOn = $state(gameState.alarmHour !== undefined);
  let alarmHour = $state(gameState.alarmHour ?? 7);
  $effect(() => {
    gameState.alarmHour = alarmOn ? alarmHour : undefined;
  });

  /** 计划醒来时刻（当前 + hours，含分钟） */
  const planWakeMin = $derived((gameState.time.hour * 60 + gameState.time.minute + hours * 60) % 1440);
  const wakeTxt = $derived(formatTime(Math.floor(planWakeMin / 60), planWakeMin % 60));
  /** 闹钟生效时的实际睡眠时长（被闹钟提前叫醒） */
  const actualHours = $derived(alarmOn ? alarmCappedHours(gameState, hours) : hours);
  /** 实际醒来时刻（闹钟提前则更早；v1.215 分钟精度） */
  const actualWakeMin = $derived((gameState.time.hour * 60 + gameState.time.minute + actualHours * 60) % 1440);
  const actualWakeTxt = $derived(formatTime(Math.floor(actualWakeMin / 60), actualWakeMin % 60));

  /** 体力恢复预估（只读展示，复用 sleepQualityOf 单一公式，v0.936 修正预览与真实不一致）
   *  v0.99 修复：补上熬夜 ×0.85 系数（原预览未算，与真实结算不一致） */
  const recoveryPct = $derived.by(() => {
    const q = sleepQualityOf(actualHours);
    const stayedUp = gameState.time.stayedUp || gameState.time.hour >= 23;
    const r = lodging.recovery * q * statusSleepPenalty(gameState) * (stayedUp ? 0.85 : 1);
    return Math.round(r * 100);
  });

  function blocked(): boolean {
    const okHere = gameState.locationId === "home" || !!gameState.flags["hospitalized"];
    if (okHere) return false;
    showToast("只有回到住处（或住院病房）才能睡觉");
    return true;
  }

  function capped(h: number): number {
    return alarmOn ? alarmCappedHours(gameState, h) : h;
  }

  function doSleep(h: number): void {
    if (blocked()) return;
    playSound("sleep");
    sleep(gameState, capped(h));
    uiState.modal = null;
  }
  function doNap(): void {
    if (blocked()) return;
    playSound("nap");
    nap(gameState, 2);
    uiState.modal = null;
  }
  const canNap = $derived(gameState.time.hour >= 10 && gameState.time.hour <= 18);
</script>

<div class="overlay hud-scope" onclick={() => (uiState.modal = null)} transition:fade={{ duration: 150 }}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-title">🛏️ 睡觉</div>
    <button class="close-btn" onclick={() => (uiState.modal = null)} aria-label="关闭">✕</button>
    <p class="hint">
      当前 {formatTime(gameState.time.hour, gameState.time.minute)} · 今晚住：{place}（恢复 {Math.round(lodging.recovery * 100)}%）
    </p>

    <!-- 时长滑块 -->
    <div class="slider-box">
      <div class="slider-head">
        <span>计划睡 {hours} 小时</span>
        <span class="dim">
          {#if alarmOn}
            闹钟叫醒约 {actualWakeTxt} · 体力恢复约 {recoveryPct}%
          {:else}
            醒来约 {wakeTxt} · 体力恢复约 {recoveryPct}%
          {/if}
        </span>
      </div>
      <input type="range" min="1" max="12" step="1" bind:value={hours} />
      <div class="presets">
        <button class="preset" class:on={hours === 4} onclick={() => (hours = 4)}>4h</button>
        <button class="preset" class:on={hours === 6} onclick={() => (hours = 6)}>6h</button>
        <button class="preset" class:on={hours === 8} onclick={() => (hours = 8)}>8h</button>
        <button class="preset" class:on={hours === 10} onclick={() => (hours = 10)}>10h</button>
      </div>

      <!-- v0.93 起床闹钟 -->
      <div class="alarm-box">
        <label class="alarm-toggle">
          <input type="checkbox" bind:checked={alarmOn} />
          <span>🔔 起床闹钟</span>
        </label>
        {#if alarmOn}
          <div class="alarm-set">
            <span class="dim">叫醒时刻</span>
            <input type="range" min="0" max="23" step="1" bind:value={alarmHour} />
            <span class="alarm-val">{alarmHour}:00</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="opts">
      <button class="opt primary" onclick={() => doSleep(hours)}>
        <span class="o-icon">😴</span>
        <div class="o-info">
          <div class="o-name">睡 {hours} 小时</div>
          <div class="o-desc dim">按选择的时长入睡</div>
        </div>
      </button>
      <button class="opt" onclick={() => doSleep(naturalHours)}>
        <span class="o-icon">🌅</span>
        <div class="o-info">
          <div class="o-name">睡到自然醒</div>
          <div class="o-desc dim">约 {naturalHours} 小时，次日 7:00 起床</div>
        </div>
      </button>
      <button class="opt" onclick={() => doNap()} disabled={!canNap}>
        <span class="o-icon">💤</span>
        <div class="o-info">
          <div class="o-name">小睡 2 小时</div>
          <div class="o-desc dim">白天补觉（10-18 点可用），恢复上限 30%</div>
        </div>
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 440px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    position: relative;
  }
  .modal-title {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 6px;
    padding-right: 28px;
  }
  /* v1.39 统一关闭按钮 */
  .close-btn {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .close-btn:hover {
    background: rgba(255, 80, 80, 0.2);
    border-color: rgba(255, 80, 80, 0.4);
    color: #ff6b6b;
  }
  .close-btn:active { transform: scale(0.9); }
  .hint {
    font-size: 12.5px;
    color: var(--text-dim);
    margin-bottom: 14px;
  }
  .slider-box {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .slider-head {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
  }
  .presets {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .preset {
    flex: 1;
    padding: 4px 0;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid transparent;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .preset:hover:not(.on) { background: rgba(255, 255, 255, 0.12); color: #ccc; }
  .preset:active { transform: scale(0.95); }
  .preset.on {
    background: rgba(255, 209, 102, 0.15);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }
  .alarm-box {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
  }
  .alarm-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .alarm-toggle input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  .alarm-set {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }
  .alarm-set input[type="range"] {
    flex: 1;
  }
  .alarm-val {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
    min-width: 42px;
    text-align: right;
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    transition: all 0.15s ease;
  }
  .opt.primary {
    border-color: var(--accent);
  }
  .opt:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .opt:active:not(:disabled) { transform: scale(0.98); }
  .opt:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .o-icon {
    font-size: 22px;
  }
  .o-name {
    font-size: 14px;
    font-weight: 700;
  }
  .o-desc {
    font-size: 11.5px;
  }
</style>
