<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { toastNewNotices } from "../../lib/notices";
  import { fade } from "svelte/transition";
  import { sleep, nap, naturalWakeHours, formatTime, alarmCappedHours, previewSleepStamina } from "../../game/core/time";
  import { napWindowOpen } from "../../game/core/actions";
  import { currentResidenceName, getEffectiveLodging, canSleepHere } from "../../game/core/housing";
  import { playSound } from "../../lib/audio";
  import { residenceSleepHours } from "../../game/core/residence";
  import { formatDuration } from "../../game/core/quests";
  let {embedded=false,timedOnly=false,onClose}:{embedded?:boolean;timedOnly?:boolean;onClose?:()=>void}=$props();
  function close():void {if(onClose)onClose();else uiState.modal=null;}

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

  /** 闹钟生效时的实际睡眠时长（被闹钟提前叫醒） */
  const actualHours = $derived(residenceSleepHours(gameState, alarmOn ? alarmCappedHours(gameState, hours) : hours));
  /** 实际醒来时刻（闹钟提前则更早；v1.215 分钟精度） */
  const actualWakeMin = $derived(Math.round(gameState.time.hour * 60 + gameState.time.minute + actualHours * 60) % 1440);
  const actualWakeTxt = $derived(formatTime(Math.floor(actualWakeMin / 60), actualWakeMin % 60));
  const naturalWakeTxt = $derived(formatTime(gameState.time.hour, gameState.time.minute + Math.round(capped(naturalHours) * 60)));

  /** 体力恢复预估（只读展示，复用 sleepQualityOf 单一公式，v0.936 修正预览与真实不一致）
   *  v0.99 修复：补上熬夜 ×0.85 系数（原预览未算，与真实结算不一致） */
  const expectedStamina = $derived(Math.round(previewSleepStamina(gameState, actualHours)));

  function blocked(): boolean {
    // 需要在登记建筑内，且住宿资格仍有效。
    if (canSleepHere(gameState)) return false;
    showToast("只有回到住处（或住院病房）才能睡觉");
    return true;
  }

  function capped(h: number): number {
    return residenceSleepHours(gameState, alarmOn ? alarmCappedHours(gameState, h) : h);
  }

  function doSleep(h: number): void {
    if (blocked()) return;
    playSound("sleep");
    // 用事件游标识别新增日志，保留条数达到上限后仍可提示发薪等事件。
    const logBefore = Number(gameState.flags.log_sequence) || 0;
    sleep(gameState, capped(h));
    close();
    // modal 关闭后再弹 toast（uiState.toast 与 modal 独立，置于此后不会被吞）
    toastNewNotices(gameState.log.filter(entry => (entry.sequence ?? 0) > logBefore));
  }
  function doNap(): void {
    if (blocked()) return;
    playSound("nap");
    nap(gameState, 2);
    close();
  }
  const canNap = $derived(napWindowOpen(gameState.time.hour));
</script>

<div class="overlay" class:hud-scope={!embedded} class:embedded role="presentation" onclick={close} onkeydown={(e)=>{if(e.key==='Escape')close();}} transition:fade={{ duration: embedded?0:150 }}>
  <div class="modal" role={embedded?'group':'dialog'} aria-label={timedOnly?'定时睡眠':'睡觉'} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e)=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
    <div class="modal-title">{timedOnly?'定时睡眠':'🛏️ 睡觉'}</div>
    <button class="close-btn" onclick={close} aria-label="关闭">✕</button>
    <p class="hint">
      当前 {formatTime(gameState.time.hour, gameState.time.minute)} · 今晚住：{place}（恢复 {Math.round(lodging.recovery * 100)}%）
    </p>

    <!-- 时长滑块 -->
    <div class="slider-box">
      <div class="slider-head">
        <span>计划睡 {hours} 小时</span>
        <span class="dim">
          {#if alarmOn}
            闹钟叫醒约 {actualWakeTxt} · 体力 {Math.round(gameState.player.attrs.stamina)} → {expectedStamina}
          {:else}
            醒来约 {actualWakeTxt} · 体力 {Math.round(gameState.player.attrs.stamina)} → {expectedStamina}
          {/if}
        </span>
      </div>
      {#if lodging.id === "temple"}<p class="hint">义工住宿资格按游戏日续期，已开始的睡眠不会中途打断。</p>{/if}
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
      {#if !timedOnly}
        {#if naturalHours > 0}<button class="opt" onclick={() => doSleep(naturalHours)}>
          <span class="o-icon">🌅</span>
          <div class="o-info">
            <div class="o-name">睡到自然醒</div>
            <div class="o-desc dim">约 {formatDuration(capped(naturalHours))}，{naturalWakeTxt} 起床</div>
          </div>
        </button>{/if}
        <button class="opt" onclick={() => doNap()} disabled={!canNap}>
          <span class="o-icon">💤</span>
          <div class="o-info">
            <div class="o-name">小睡 2 小时</div>
            <div class="o-desc dim">白天补觉（07-22 点可用），恢复上限 30%</div>
          </div>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay.embedded{position:static;inset:auto;display:block;background:transparent;backdrop-filter:none;z-index:auto;animation:none;--bg-soft:color-mix(in srgb,var(--hud-text) 6%,transparent)}.embedded .modal{width:100%;padding:0;background:transparent;border:0;box-shadow:none;border-radius:0;color:var(--text-main);text-shadow:none}.embedded .modal-title{font-size:14px}.embedded .slider-box{padding:8px;margin:8px 0;background:color-mix(in srgb,var(--hud-text) 6%,transparent)}.embedded .slider-head{flex-wrap:wrap}.embedded .hint{font-size:10px}.embedded .opts{gap:5px}.embedded .opt{padding:9px 11px}.embedded .o-desc{font-size:10px}.embedded .o-icon{display:none}.embedded .close-btn{top:0;right:0}.embedded .preset:hover:not(.on){color:var(--text-main)}
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
  :global(:root[data-game-mode="mobile"]) .overlay.embedded .modal{width:100%;padding:0}
  :global(:root[data-game-mode="mobile"]) .embedded .modal-title,:global(:root[data-game-mode="mobile"]) .embedded .o-name{font-size:var(--m-fs-md)}
  :global(:root[data-game-mode="mobile"]) .embedded .modal .hint,:global(:root[data-game-mode="mobile"]) .embedded .modal .slider-head,:global(:root[data-game-mode="mobile"]) .embedded .modal .o-desc,:global(:root[data-game-mode="mobile"]) .embedded .modal .alarm-toggle,:global(:root[data-game-mode="mobile"]) .embedded .modal .preset{font-size:var(--m-fs-xs)}
  :global(:root[data-game-mode="mobile"]) .embedded .modal .presets{display:grid;grid-template-columns:1fr 1fr}
  :global(:root[data-game-mode="mobile"]) .embedded .modal .preset,:global(:root[data-game-mode="mobile"]) .embedded .modal .opt,:global(:root[data-game-mode="mobile"]) .embedded .modal input[type="range"],:global(:root[data-game-mode="mobile"]) .embedded .modal .alarm-toggle{min-height:var(--m-tap)}
  :global(:root[data-game-mode="mobile"]) .embedded .close-btn{position:static;float:right;width:var(--m-tap);height:var(--m-tap);margin-top:calc(-1 * var(--m-tap));color:var(--text-main)}
  :global(:root[data-game-mode="mobile"]) .embedded .modal-title{min-height:var(--m-tap);display:flex;align-items:center;padding-right:var(--m-tap)}
</style>
