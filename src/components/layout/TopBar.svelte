<script lang="ts">
  import { onDestroy } from "svelte";
  import { developerState, openDeveloperPanel } from "../../stores/developerStore.svelte";
  import { gameState, currentPeriodLabel, currentTimeLabel, goto } from "../../stores/gameStore.svelte";
  import { formatMoney, formatDate } from "../../lib/format";
  import { uiState, toggleTopbarInfo } from "../../stores/uiStore.svelte";
  import { isMobileLayout } from "../../stores/uiStore.svelte";
import { getLodging, nightlyCost, daysUntilNextRent } from "../../game/core/housing";
  import { unlockAudio } from "../../lib/audio";
  import { difficultyLevel, priceMultiplier, difficultyLabel, jobRequirementBonus, eventProbability, negativeWeightBoost, daysSurvived, netWorth } from "../../game/core/difficulty";
  import { currentWeather, WEATHER_LABEL } from "../../game/core/weather";
  import { SEASON_LABEL, seasonOf, weekdayLabel, isWeekend } from "../../game/core/calendar";
  import { currentArc } from "../../game/core/story";
  import { JOB_DEFS } from "../../game/core/jobs";
  import { upcomingQuest, formatDuration } from "../../game/core/quests";
  import SaveStatusIndicator from './SaveStatusIndicator.svelte';

  /** v0.95 季节/天气指示 */
  const seasonLabel = $derived(SEASON_LABEL[seasonOf(gameState.time.month)]);
  const weatherLabel = $derived(WEATHER_LABEL[currentWeather(gameState)]);
  /** v0.97 星期几（周末高亮） */
  const weekday = $derived(weekdayLabel(gameState.time));
  const weekend = $derived(isWeekend(gameState.time));

  /** 距下次交租的游戏日数（按签约日起每 30 天续期） */
  const daysToRent = $derived(daysUntilNextRent(gameState) ?? 0);
  const isRentDay = $derived(daysToRent === 0);

  /** 距午夜剩余小时 */
  const hoursToMidnight = $derived(formatDuration((1440 - gameState.time.hour * 60 - gameState.time.minute) / 60));

  /** v0.93 起床闹钟标签 */
  const alarmLabel = $derived(
    gameState.alarmHour === undefined || gameState.alarmHour === null ? null : `${gameState.alarmHour}:00`,
  );

  /** 按天住宿今晚选择 */
  const tonightLodging = $derived(
    gameState.living.mode === "nightly" ? getLodging(gameState.living.nightly?.lodgingId ?? "atm") : null,
  );

  /** v1.43：有固定住处时，今晚在外住一晚的选择（只影响当晚）。 */
  const awayNight = $derived(
    gameState.living.mode === "nightly" ? null : getLodging(gameState.living.awayNight?.lodgingId ?? ""),
  );

  function openLodging(): void {
    uiState.modal = "lodging";
  }

  /** v0.94 难度递增：实时难度等级与物价倍率（供顶栏展示，让难度变化可见） */
  const diffLevel = $derived(difficultyLevel(gameState));
  const diffLabel = $derived(difficultyLabel(diffLevel));
  const priceMul = $derived(priceMultiplier(gameState));
  const difficultyDetails = $derived(`难度由存活天数（每 30 天提升）与净资产（每 ¥25,000 提升）共同决定。当前求职门槛 +${jobRequirementBonus(gameState)}，随机事件触发率 ${(eventProbability(gameState) * 100).toFixed(1)}%，负面事件权重 ×${negativeWeightBoost(gameState).toFixed(2)}。已存活 ${daysSurvived(gameState)} 天，净资产约 ¥${Math.round(netWorth(gameState)).toLocaleString()}。`);
  const difficultyEffects = $derived(`求职门槛 +${jobRequirementBonus(gameState)} · 随机事件 ${(eventProbability(gameState) * 100).toFixed(1)}% · 负面权重 ×${negativeWeightBoost(gameState).toFixed(2)}`);

  /** v1.0 剧情模式：主线与良心指示 */
  const storyArc = $derived(gameState.mode === "story" ? currentArc(gameState) : undefined);
  const storyConscience = $derived(gameState.story.conscience);

  /** v1.463：今日待上班次提醒。
   *  接通此前定义了却从未被调用的 upcomingQuest()（quests.ts:419 注释即写「顶栏提醒用」），
   *  解决玩家反馈「上班没有提醒、待办不会主动提示」的问题。 */
  const upcomingShift = $derived(upcomingQuest(gameState));
  const shiftInfo = $derived.by(() => {
    const q = upcomingShift;
    if (!q || q.startHour === undefined) return null;
    const job = JOB_DEFS.find((j) => j.id === q.jobId);
    const now = gameState.time.hour + gameState.time.minute / 60;
    const late = now > q.startHour;
    const soon = !late && q.startHour - now <= 2;
    return { hour: q.startHour, name: job?.name ?? "上班", late, soon };
  });

  /** v1.44 手游：顶栏只放高频信息，次要信息（难度/物价/距午夜/闹钟/剧情/良心）
   *  收进可展开的第二行，保证手游与端游信息量完全一致而非直接丢弃。 */
  const mobileInfo = $derived(isMobileLayout());
  const infoOpen = $derived(mobileInfo && uiState.topbarInfoOpen);

  /** v1.492 金钱反馈：工资到账/消费扣款时 chip 闪一下（收入绿/支出红），
   *  资金为负切换危险配色——与破产预警口径一致（连续 7 天资金为负或债务逾期 3 天触发结局）。 */
  let moneyFlash = $state<"up" | "down" | null>(null);
  let moneyFlashTimer: ReturnType<typeof setTimeout> | undefined;
  let lastMoney: number | undefined;
  $effect(() => {
    const money = gameState.player.money;
    if (lastMoney === undefined) { lastMoney = money; return; }
    if (money === lastMoney) return;
    moneyFlash = money > lastMoney ? "up" : "down";
    lastMoney = money;
    clearTimeout(moneyFlashTimer);
    moneyFlashTimer = setTimeout(() => { moneyFlash = null; }, 600);
  });
  onDestroy(() => clearTimeout(moneyFlashTimer));
</script>

<header class="topbar hud-scope" class:info-open={infoOpen}>
  <div class="brand">
    <span class="logo" aria-hidden="true">🌆</span>
    <span class="name">都市生活<small>CITY LIFE</small></span>
  </div>

  <!-- 时钟（放大版）；手游下同一个位置兼任「详细信息」开关，改用原生 button 保证语义与可聚焦性 -->
  {#snippet clockFace()}
    <div class="date-line">
      <span class="date">{formatDate(gameState.time.year, gameState.time.month, gameState.time.day)}</span>
      <span class="weekday" class:weekend>{weekday}</span>
      <span class="clock-time">{currentTimeLabel()}</span>
      <span class="period-badge" class:is-night={gameState.time.hour >= 23 || gameState.time.hour < 5}>
        {currentPeriodLabel()}
      </span>
      {#if mobileInfo}
        <span class="info-caret" aria-hidden="true">{uiState.topbarInfoOpen ? "▴" : "▾"}</span>
      {/if}
    </div>
  {/snippet}

  {#if mobileInfo}
    <button
      class="clock clock-toggle"
      type="button"
      aria-expanded={uiState.topbarInfoOpen}
      aria-controls="topbar-extra"
      title="查看距午夜 / 闹钟 / 难度 / 物价 / 剧情等详细信息"
      onclick={() => toggleTopbarInfo()}
    >
      {@render clockFace()}
    </button>
  {:else}
    <div class="clock">
      {@render clockFace()}
      <div class="remaining">
        距午夜 {hoursToMidnight}
        {#if alarmLabel}<span class="alarm-chip">🔔 闹钟 {alarmLabel}</span>{/if}
      </div>
    </div>
  {/if}

  <div class="spacer"></div>
  <SaveStatusIndicator/>

  <!-- 金钱 + 住宿状态 -->
  <div class="money-box">
    <span class="chip money" class:danger={gameState.player.money < 0} class:flash-up={moneyFlash === "up"} class:flash-down={moneyFlash === "down"} title={gameState.player.money < 0 ? "资金为负：尽快赚钱补上。连续 7 天资金为负，或债务逾期 3 天，将触发破产结局" : "可用资金"}><span class="money-label">可用资金</span><strong>{formatMoney(gameState.player.money)}</strong></span>

    <!-- v1.463：今日班次提醒（迟到/即将开工会变色），接通 upcomingQuest -->
    {#if shiftInfo}
      <span
        class="chip shift"
        class:is-soon={shiftInfo.soon}
        class:is-late={shiftInfo.late}
        title={shiftInfo.late ? "已过开工时间，到岗会按迟到扣钱" : "今天有班要上，别迟到"}
      >
        {shiftInfo.late ? "⚠️ 已到开工时间" : "⏰"} {shiftInfo.hour}:00 {shiftInfo.name}
      </span>
    {/if}

    {#if gameState.living.mode === "gov"}
      <span class="chip gov">🏛️ 政府住宿剩 {gameState.living.govDaysLeft} 晚</span>
    {:else if gameState.living.mode === "nightly"}
      <button class="chip lodging" onclick={() => openLodging()}>
        🛏️ {tonightLodging?.name ?? "未选住宿"} {tonightLodging?.price ? `¥${nightlyCost(gameState, tonightLodging.price)}` : ""}
      </button>
    {:else if gameState.living.mode === "lease"}
      {#if !isRentDay}
        <span class="chip rent">🏠 {daysToRent}天后交租 {formatMoney(gameState.living.lease?.rent ?? 0)}</span>
      {:else}
        <span class="chip rent danger-chip">🏠 今日交租 {formatMoney(gameState.living.lease?.rent ?? 0)}</span>
      {/if}
    {/if}

    {#if gameState.weekly.pending}
      <button class="chip weekly-report" onclick={() => goto("weeklyReport")} title="查看并确认本周收支与工作记录">📖 本周周记</button>
    {/if}

    <!-- v1.43：有固定住处也可以在外住一晚（酒店 / 民宿 / 寺庙借宿），只影响当晚 -->
    {#if gameState.living.mode === "lease" || gameState.living.mode === "own"}
      <button class="chip lodging" onclick={() => openLodging()} title="有固定住处，也可以在外住一晚">
        {awayNight ? `🛏️ 今晚外宿：${awayNight.name} · ¥${nightlyCost(gameState, awayNight.price)}` : "🛏️ 今晚外宿"}
      </button>
    {/if}

    {#if !mobileInfo}
      <span class="chip diff" title={difficultyDetails}>⚡ 难度 Lv.{diffLevel} {diffLabel}</span>
      {#if priceMul > 1.001}
        <span class="chip inflate">📈 物价 ×{priceMul.toFixed(2)}</span>
      {/if}
    {/if}
    <span class="chip weather" class:hot={weatherLabel.includes("热浪")} class:cold={weatherLabel.includes("寒潮") || weatherLabel.includes("雪")}>
      {weatherLabel} · {seasonLabel}季
    </span>
    {#if !mobileInfo && storyArc}
      <span class="chip story-chip">🎬 {storyArc.title}</span>
      <span class="chip conscience-chip" class:low={storyConscience < 0} class:high={storyConscience >= 4}>
        ⚖️ 良心 {storyConscience > 0 ? "+" : ""}{storyConscience}
      </span>
    {/if}
  </div>

  <div class="menu-box">
    {#if developerState.unlocked && developerState.enabled}
      <button class="btn btn-ghost phone-btn" aria-label="超级开发者模式" title="超级开发者模式" onclick={openDeveloperPanel}>🛠️</button>
    {/if}
    <button class="btn btn-ghost phone-btn" title="手机与待办" aria-label="手机与待办" onclick={() => (uiState.modal = "phone")} onpointerdown={() => unlockAudio()}>📱</button>
    <button class="btn btn-ghost phone-btn" title="背包" aria-label="背包" onclick={() => (uiState.modal = "inventory")}>🎒</button>
    <!-- v1.44 手游：行动日志不常驻（会吃掉半个横屏画布），改为按需全屏查看，
         内容与端游的常驻日志条完全一致（最近 50 条 + 时间戳）。
         v1.44.2：常驻日志条被关闭时（PE 模式 / 手动关闭）同样显示 📜 入口。 -->
    {#if mobileInfo || !uiState.showLog}
      <button class="btn btn-ghost phone-btn" onclick={() => (uiState.modal = "log")} title="行动日志" aria-label="行动日志">📜</button>
    {/if}
    <button class="btn btn-ghost menu-open-btn" aria-label="菜单与存档" onclick={() => (uiState.modal = "settings")} onpointerdown={() => unlockAudio()}>
      <span class="menu-open-glyph">⚙️</span><span class="menu-open-text">菜单</span>
    </button>
  </div>

  <!-- v1.44 手游第二行：端游常驻但横屏放不下的次要信息，点时钟展开 -->
  {#if infoOpen}
    <div class="topbar-extra" id="topbar-extra">
      <button class="chip" onclick={() => { uiState.modal = 'settings'; uiState.topbarInfoOpen = false; }}>菜单与存档</button>
      <span class="chip">🕛 距午夜 {hoursToMidnight}</span>
      {#if alarmLabel}<span class="chip">🔔 闹钟 {alarmLabel}</span>{/if}
      <span class="chip" title={difficultyDetails}>⚡ 难度 Lv.{diffLevel} {diffLabel}</span>
      <span class="chip" title={difficultyDetails}>{difficultyEffects}</span>
      {#if priceMul > 1.001}
        <span class="chip">📈 物价 ×{priceMul.toFixed(2)}</span>
      {/if}
      {#if storyArc}
        <span class="chip">🎬 {storyArc.title}</span>
        <span class="chip" class:low={storyConscience < 0} class:high={storyConscience >= 4}>
          ⚖️ 良心 {storyConscience > 0 ? "+" : ""}{storyConscience}
        </span>
      {/if}
    </div>
  {/if}
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 10px 20px;
    min-height: 68px;
    position: relative;
    z-index: 10;
    color: var(--hud-text);
    background: var(--hud-surface);
    border-bottom: 1px solid var(--hud-border);
    box-shadow: 0 5px 24px rgba(4, 17, 20, 0.14);
    backdrop-filter: blur(16px);
    text-shadow: var(--hud-text-shadow);
  }
  .brand { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
  .logo {
    display: grid; place-items: center; width: 36px; height: 38px;
    font-size: 23px; border-radius: 10px;
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
  }
  .name { font-weight: 750; font-size: 15px; letter-spacing: 2px; white-space: nowrap; }
  .name small { display: block; margin-top: 3px; font-size: 8px; font-weight: 500; color: var(--text-dim); letter-spacing: 2.9px; }
  .clock {
    display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto;
    padding: 3px 16px; border: 0; border-left: 1px solid var(--hud-border);
    background: transparent; border-radius: 0;
  }
  .clock-toggle { font: inherit; color: inherit; text-align: left; align-items: flex-start; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .clock-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .date-line { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .date { font-size: 12px; font-weight: 550; font-variant-numeric: tabular-nums; color: var(--text-dim); }
  .weekday { font-size: 10px; font-weight: 600; color: var(--text-dim); }
  .weekday.weekend { color: var(--accent); }
  .clock-time { font-size: 23px; font-weight: 750; letter-spacing: 0.3px; font-variant-numeric: tabular-nums; color: var(--text-main); }
  .period-badge { padding: 3px 7px; border-radius: 5px; font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); letter-spacing: 1px; }
  .period-badge.is-night { background: color-mix(in srgb, var(--accent-2) 14%, transparent); color: var(--accent-2); }
  .remaining { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--text-dim); }
  .alarm-chip { color: var(--accent); }
  .spacer { display: none; }
  .money-box { display: flex; align-items: center; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; gap: 5px 7px; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px; min-height: 25px;
    font: inherit; font-size: 10.5px; padding: 4px 8px; border: 0; border-radius: 6px;
    background: color-mix(in srgb, var(--hud-text) 5%, transparent); color: var(--text-dim);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .money { gap: 9px; padding: 5px 10px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .money.danger { color: var(--danger); background: color-mix(in srgb, var(--danger) 13%, transparent); font-weight: 650; }
  .money.flash-up { animation: money-flash-up 0.6s ease-out; }
  .money.flash-down { animation: money-flash-down 0.6s ease-out; }
  @keyframes money-flash-up { from { box-shadow: 0 0 0 2px var(--ok); } to { box-shadow: 0 0 0 0 transparent; } }
  @keyframes money-flash-down { from { box-shadow: 0 0 0 2px var(--danger); } to { box-shadow: 0 0 0 0 transparent; } }
  .money-label { font-size: 9px; opacity: 0.8; }
  .money strong { font-size: 15px; line-height: 1; letter-spacing: 0.2px; font-weight: 750; }
  .shift, .gov { color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 9%, transparent); }
  .shift.is-soon, .inflate, .weekly-report { color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); font-weight: 650; }
  .shift.is-late, .danger-chip, .conscience-chip.low, .weather.hot { color: var(--danger); background: color-mix(in srgb, var(--danger) 13%, transparent); font-weight: 650; }
  .lodging, .conscience-chip.high { color: var(--ok); background: color-mix(in srgb, var(--ok) 10%, transparent); }
  .lodging, .weekly-report { cursor: pointer; }
  .lodging:hover, .weekly-report:hover { box-shadow: inset 0 0 0 1px currentColor; }
  .diff { color: var(--text-dim); background: transparent; }
  .weather, .weather.cold { color: var(--accent-2); background: transparent; }
  .story-chip { color: var(--accent); }
  .menu-box { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; padding-left: 12px; border-left: 1px solid var(--hud-border); }
  .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; padding: 6px 10px; font-size: 12px; background: color-mix(in srgb, var(--hud-text) 5%, transparent); border: 1px solid transparent; border-radius: 9px; color: var(--text-main); }
  .btn-ghost:hover { border-color: var(--hud-border); background: color-mix(in srgb, var(--accent-2) 12%, transparent); }
  .btn-ghost:focus-visible, .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .phone-btn { width: 36px; padding: 0; font-size: 17px; }
  :global(:root[data-game-mode="mobile"]) .money-label { display: none; }
  :global(:root[data-game-mode="mobile"]) .money strong { font-size: inherit; }
  :global(:root[data-game-mode="mobile"]) .money-box { flex-wrap: nowrap; }
  :global(:root[data-game-mode="mobile"]) .menu-box { border: 0; padding-left: 0; }
  :global(:root[data-game-mode="mobile"]) .clock { padding-left: 0; border: 0; }
  @media (max-width: 1200px) {
    .topbar { gap: 10px; padding-left: 14px; padding-right: 14px; }
    .brand { gap: 6px; }
    .logo { display: none; }
    .clock { padding-left: 10px; padding-right: 3px; }
    .menu-box { padding-left: 7px; }
  }
</style>
