<script lang="ts">
  import { gameState, currentPeriodLabel, currentTimeLabel } from "../../stores/gameStore.svelte";
  import { formatMoney, formatDate } from "../../lib/format";
  import { uiState } from "../../stores/uiStore.svelte";
  import { getLodging } from "../../game/core/housing";
  import { unlockAudio } from "../../lib/audio";
  import { difficultyLevel, priceMultiplier, difficultyLabel } from "../../game/core/difficulty";
  import { currentWeather, WEATHER_LABEL } from "../../game/core/weather";
  import { SEASON_LABEL, seasonOf, weekdayLabel, isWeekend } from "../../game/core/calendar";

  /** v0.95 季节/天气指示 */
  const seasonLabel = $derived(SEASON_LABEL[seasonOf(gameState.time.month)]);
  const weatherLabel = $derived(WEATHER_LABEL[currentWeather(gameState)]);
  /** v0.97 星期几（周末高亮） */
  const weekday = $derived(weekdayLabel(gameState.time));
  const weekend = $derived(isWeekend(gameState.time));

  /** 距下次交租还有几天（每月 1 号） */
  const daysToRent = $derived((30 - gameState.time.day + 1) % 30);
  /** 今天是否交租日 */
  const isRentDay = $derived(gameState.time.day === 1);

  /** 距午夜剩余小时 */
  const hoursToMidnight = $derived((24 - gameState.time.hour - gameState.time.minute / 60).toFixed(1));

  /** v0.93 起床闹钟标签 */
  const alarmLabel = $derived(
    gameState.alarmHour === undefined || gameState.alarmHour === null ? null : `${gameState.alarmHour}:00`,
  );

  /** 按天住宿今晚选择 */
  const tonightLodging = $derived(
    gameState.living.mode === "nightly" ? getLodging(gameState.living.nightly?.lodgingId ?? "atm") : null,
  );

  function openLodging(): void {
    uiState.modal = "lodging";
  }

  /** v0.94 难度递增：实时难度等级与物价倍率（供顶栏展示，让难度变化可见） */
  const diffLevel = $derived(difficultyLevel(gameState));
  const diffLabel = $derived(difficultyLabel(diffLevel));
  const priceMul = $derived(priceMultiplier(gameState));
</script>

<header class="topbar hud-scope">
  <div class="brand">
    <span class="logo">🌆</span>
    <span class="name">都市生活</span>
  </div>

  <!-- 时钟（放大版） -->
  <div class="clock">
    <div class="date-line">
      <span class="date">{formatDate(gameState.time.year, gameState.time.month, gameState.time.day)}</span>
      <span class="weekday" class:weekend>{weekday}</span>
      <span class="clock-time">{currentTimeLabel()}</span>
      <span class="period-badge" class:is-night={gameState.time.hour >= 23 || gameState.time.hour < 5}>
        {currentPeriodLabel()}
      </span>
    </div>
    <div class="remaining">
      距午夜 {hoursToMidnight} 小时
      {#if alarmLabel}<span class="alarm-chip">🔔 闹钟 {alarmLabel}</span>{/if}
    </div>
  </div>

  <div class="spacer"></div>

  <!-- 金钱 + 住宿状态 -->
  <div class="money-box">
    <span class="chip money">💰 {formatMoney(gameState.player.money)}</span>

    {#if gameState.living.mode === "gov"}
      <span class="chip gov">🏛️ 政府住宿剩 {gameState.living.govDaysLeft} 晚</span>
    {:else if gameState.living.mode === "nightly"}
      <button class="chip lodging" onclick={() => openLodging()}>
        🛏️ {tonightLodging?.name ?? "未选住宿"} {tonightLodging?.price ? `¥${tonightLodging.price}` : ""}
      </button>
    {:else if gameState.living.mode === "lease"}
      {#if !isRentDay}
        <span class="chip rent">🏠 {daysToRent}天后交租 {formatMoney(gameState.living.lease?.rent ?? 0)}</span>
      {:else}
        <span class="chip rent danger-chip">🏠 今日交租 {formatMoney(gameState.living.lease?.rent ?? 0)}</span>
      {/if}
    {/if}

    <span class="chip diff">⚡ 难度 Lv.{diffLevel} {diffLabel}</span>
    {#if priceMul > 1.001}
      <span class="chip inflate">📈 物价 ×{priceMul.toFixed(2)}</span>
    {/if}
    <span class="chip weather" class:hot={weatherLabel.includes("热浪")} class:cold={weatherLabel.includes("寒潮") || weatherLabel.includes("雪")}>
      {weatherLabel} · {seasonLabel}季
    </span>
  </div>

  <div class="menu-box">
    <button class="btn btn-ghost phone-btn" onclick={() => (uiState.modal = "phone")} onpointerdown={() => unlockAudio()}>📱</button>
    <button class="btn btn-ghost phone-btn" onclick={() => (uiState.modal = "inventory")}>🎒</button>
    <button class="btn btn-ghost" onclick={() => (uiState.modal = "settings")} onpointerdown={() => unlockAudio()}>⚙️ 菜单</button>
  </div>
</header>

<style>
  .topbar {
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.62);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 18px;
    background: rgba(16, 19, 31, 0.75);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
    min-height: 56px;
    position: relative;
    z-index: 10;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo {
    font-size: 22px;
  }
  .name {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 1px;
  }
  .clock {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 14px;
    border-left: 2px solid var(--accent);
    background: rgba(255, 209, 102, 0.06);
    border-radius: 10px;
  }
  .date-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .date {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
  }
  .weekday {
    font-size: 12px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(108, 198, 255, 0.15);
    color: var(--accent-2, #6cc6ff);
  }
  .weekday.weekend {
    background: rgba(255, 209, 102, 0.2);
    color: var(--accent, #ffd166);
  }
  .clock-time {
    font-size: 20px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    transition: transform 0.15s ease;
  }
  .period-badge {
    font-size: 13px;
    font-weight: 800;
    padding: 3px 12px;
    border-radius: 999px;
    background: var(--accent);
    color: #1a1a2e;
    letter-spacing: 1px;
  }
  .period-badge.is-night {
    background: #4a5488;
    color: #fff;
  }
  .remaining {
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .alarm-chip {
    color: var(--accent);
    background: rgba(255, 209, 102, 0.12);
    padding: 1px 8px;
    border-radius: 999px;
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .money-box {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chip {
    font-size: 12.5px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
    border: none;
    font-family: inherit;
  }
  .money {
    background: rgba(255, 209, 102, 0.15);
    color: var(--accent);
    font-weight: 700;
  }
  .gov {
    background: rgba(108, 198, 255, 0.13);
    color: var(--accent-2);
    font-weight: 600;
  }
  .lodging {
    background: rgba(123, 216, 143, 0.13);
    color: var(--ok);
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .lodging:hover {
    transform: translateY(-1px);
  }
  .rent {
    color: var(--text-dim);
  }
  .danger-chip {
    background: rgba(255, 107, 107, 0.15);
    color: var(--danger);
    font-weight: 700;
  }
  .diff {
    background: rgba(108, 198, 255, 0.13);
    color: var(--accent-2, #6cc6ff);
    font-weight: 700;
  }
  .inflate {
    background: rgba(255, 179, 71, 0.15);
    color: #ffb347;
    font-weight: 700;
  }
  .weather {
    background: rgba(108, 198, 255, 0.1);
    color: #9fc2e8;
    font-weight: 600;
  }
  .weather.hot {
    background: rgba(255, 107, 107, 0.15);
    color: #ff8a7a;
  }
  .weather.cold {
    background: rgba(123, 216, 255, 0.13);
    color: #7ad7ff;
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    padding: 5px 12px;
    font-size: 12.5px;
  }
  .phone-btn {
    font-size: 16px;
    padding: 4px 10px;
  }
  .menu-box {
    display: flex;
    gap: 6px;
  }
</style>
