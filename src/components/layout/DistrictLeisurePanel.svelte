<script lang="ts">
  import {overlayPortal} from '../../lib/overlayPortal';
  import { onDestroy, tick } from "svelte";
  import { fly } from "svelte/transition";
  import { beginMinigameMusic } from "../../lib/audio";
  import {nightlifeVenue,nightlifeMood,NIGHTLIFE_MOOD_LABEL} from '../../lib/nightlifeMusic';
  import {currentWeather,WEATHER_LABEL} from '../../game/core/weather';
  import {isWeekend} from '../../game/core/calendar';
  import { gameState, currentView, markSessionDirty, checkpointAutoSave } from "../../stores/gameStore.svelte";
  import { uiState, showToast, showResult, uiConfirm } from "../../stores/uiStore.svelte";
  import { canUseDistrictLeisure, startDistrictLeisure, stepDistrictLeisure, settleDistrictLeisure, DANCE_TRACKS, districtLeisureNight, enterCasinoRoom, leaveCasinoRoom, buyCasinoChips, redeemCasinoChips, takeCasinoSnack, type CasinoRoom, type LeisureKind, type LeisureInput, type LeisureResult } from "../../game/core/districtLeisure";
  import CardTable from "./districtLeisure/CardTable.svelte";
  import CasinoTableGame from "./districtLeisure/CasinoTableGame.svelte";
  import ClawMachine from "./districtLeisure/ClawMachine.svelte";
  import PlatformGame from "./districtLeisure/PlatformGame.svelte";
  import RhythmGame from "./districtLeisure/RhythmGame.svelte";
  import { districtArcadeCost, CASINO_ROOMS, casinoBetRange } from "../../game/core/districtLeisure";
  import "../../styles/districtUi.css";
  import "../../styles/casinoUi.css";

  const locationKinds: Record<string, LeisureKind[]> = { boyue_texas_shop: ["blackjack","poker"], boyue_arcade: ["claw","platform"], boyue_nightclub: ["dance"], boyue_lounge_bar: ["singing"] };
  const definitions: Record<LeisureKind, { name: string; icon: string; category: string; description: string; cost: string; rules: string }> = {
    blackjack: { name:"21 点", icon:"♠", category:"周末牌桌", description:"看好手牌，决定补牌或停牌。与庄家比点数，挑战天然 21 点。", cost:"底注按所选场次 · 5 分钟", rules:"一副 52 张牌，无放回发牌；A 为 1 或 11，花牌为 10。庄家不足 17 补牌、软 17 停牌；双方同点且都未爆牌时平局退注。天然 21 点优先于补牌得到的 21 点，双方天然则平局。普通胜利返还底注 2 倍，天然 21 点返还 2.5 倍（均含本金）。" },
    poker: { name:"对庄德州", icon:"♦", category:"周末牌桌", description:"两张手牌，先看三张翻牌；选择弃牌，或追加底注开出转牌与河牌。", cost:"底注按所选场次 · 10 分钟", rules:"一副 52 张牌，无放回发牌，七张中选最强五张，牌型相同则比较踢脚牌，不以花色分胜负。继续需追加同额底注。胜利返还总投入的 2 倍（含本金）；最佳五张相同则平局分池，退回底注与追加注。弃牌损失已付底注。" },
    high_low: { name:"比大小", icon:"♣", category:"牌类", description:"选大或小，翻开两张牌比点数。", cost:"单局 5 分钟", rules:"一副 52 张牌中无放回抽出两张，A 最大。选大猜自己的牌比庄家大，选小猜自己的牌比庄家小；猜中返还下注的 2 倍（含本金），同点平局退注。" },
    slots: { name:"幸运老虎机", icon:"🎰", category:"老虎机", description:"按下旋杆，看看转出的图案。", cost:"单局 5 分钟", rules:"三图相同返还 3、5、8、14、22 或 40 倍；两图相同返还底注，其余未中。所有倍率含本金。" },
    roulette_redblack: { name:"押红黑", icon:"🔴", category:"轮盘", description:"选红或黑，等轮盘停下。", cost:"单局 5 分钟", rules:"采用 0—36 单零轮盘，0 为绿；红黑猜中返还 2 倍下注（含本金）。" },
    roulette_highlow: { name:"押大小", icon:"🎲", category:"轮盘", description:"选 1—18 或 19—36。", cost:"单局 5 分钟", rules:"采用 0—36 单零轮盘，0 不计大小；猜中返还 2 倍下注（含本金）。" },
    roulette_number: { name:"押单号", icon:"🎯", category:"轮盘", description:"选一个号码，等待轮盘结果。", cost:"单局 5 分钟", rules:"选择 0—36 中的一个号码；命中返还 36 倍下注（含本金）。" },
    claw: { name:"玩偶捕手", icon:"♧", category:"街机小乐趣", description:"移动爪子，降下机械手。小熊、兔兔、橘猫、熊猫和恐龙等你带回家。", cost:"每轮 ¥5 · 5 分钟", rules:"用左右按钮移动爪子，再按“降爪”。" },
    platform: { name:"跃过泊月街", icon:"★", category:"横版街机", description:"三条生命，在月色街台上跳跃，收集星币，越过路障跑向终点。", cost:"每轮 ¥5 · 30 分钟", rules:"按住左右按钮移动，点击跳跃；键盘也可使用方向键和空格。" },
    dance: { name:"五轨舞蹈", icon:"♫", category:"霓虹舞池", description:"跟着音乐的节拍，去舞池里跳一支舞。", cost:"免费 · 30 分钟", rules:"跟着音符点击五轨，或使用 D / F / 空格 / J / K。" },
    singing: { name:"临时驻唱", icon:"♪", category:"清吧小舞台", description:"选一首歌，站上月光小舞台。完成三轨演出，获得当天驻唱报酬。", cost:"2 小时", rules:"跟着节拍演唱，点击五轨或使用 D / F / 空格 / J / K。" },
  };
  let opened = $state(false);
  let casinoMenuOpen = $state(false), casinoStage = $state<"rooms" | "games">("rooms");
  let casinoRoomSelection = $state<CasinoRoom>("leisure");
  let casinoCategory = $state<"cards" | "slots" | "roulette">("cards");
  let selectedCasinoGame = $state<LeisureKind>("blackjack");
  let casinoBet = $state<number>(CASINO_ROOMS.leisure.minBet), casinoChoice = $state<"high" | "low" | "red" | "black">("high"), casinoNumberChoice = $state(0);
  let exchangeCash = $state(20), redeemChips = $state(100), swipeStart = $state<number | undefined>(undefined);
  const kinds = $derived(locationKinds[gameState.locationId] ?? []);
  const venue=$derived(nightlifeVenue(gameState.locationId));
  const musicMood=$derived(nightlifeMood(currentWeather(gameState),isWeekend(gameState.time)));
  const active = $derived(gameState.districtLeisure?.active ?? null);
  const playingMusic = $derived(opened && !!active);
  $effect(() => {
    if (playingMusic) return beginMinigameMusic("scene");
  });
  const permitted = $derived.by(() => Object.fromEntries(kinds.map(kind => [kind, canUseDistrictLeisure(gameState,kind)])));
  const selectedCasinoAllowed = $derived(canUseDistrictLeisure(gameState, selectedCasinoGame));
  const enabled = $derived(opened && uiState.modal === null && currentView.name === "game");
  let blackjackBet = $state<number | undefined>(20), pokerBet = $state<number | undefined>(20), track = $state(0);
  const isCasino = $derived(gameState.locationId === "boyue_texas_shop");
  const chips = $derived(gameState.districtLeisure?.casinoChips ?? 0);
  const snackClaimed = $derived(gameState.districtLeisure?.casinoSnackNight === districtLeisureNight(gameState));
  const casinoCategories = ["cards", "slots", "roulette"] as const;
  const gamesByCategory: Record<typeof casinoCategory, LeisureKind[]> = { cards: ["blackjack", "high_low", "poker"], slots: ["slots"], roulette: ["roulette_redblack", "roulette_highlow", "roulette_number"] };
  const selectedDefinition = $derived(definitions[selectedCasinoGame]);
  const roomMinBet = $derived(casinoBetRange(casinoRoomSelection)[0]);
  const roomMaxBet = $derived(casinoBetRange(casinoRoomSelection)[1]);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  /** All progress belongs to the persisted session; local state only controls presentation. */
  function persist(immediate = true) {
    markSessionDirty();
    if (immediate) { if(saveTimer) clearTimeout(saveTimer); saveTimer = undefined; void checkpointAutoSave(); }
    else if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = undefined; void checkpointAutoSave(); },1000);
  }
  function start(kind: LeisureKind) {
    if (active) { showToast("请先完成当前这一轮"); return; }
    const casinoGame = gameState.locationId === "boyue_texas_shop" && ["blackjack","high_low","poker","slots","roulette_redblack","roulette_highlow","roulette_number"].includes(kind);
    const check = startDistrictLeisure(gameState,kind,{ bet: casinoGame ? casinoBet : kind === "blackjack" ? blackjackBet ?? NaN : kind === "poker" ? pokerBet ?? NaN : undefined, track, ...(casinoGame ? { currency:"chips" as const, room:gameState.districtLeisure?.casinoRoom, choice:kind === "roulette_number" ? casinoNumberChoice : casinoChoice } : {}) });
    if (!check.ok) { showToast(check.reason); return; }
    casinoMenuOpen = false; opened = true; persist();
  }
  function input(value: LeisureInput) {
    if (!active) return;
    const check = stepDistrictLeisure(gameState,active.id,value);
    if (!check.ok) { showToast(check.reason); return; }
    persist(active?.phase === "ready" || value.type !== "platform_tick" && value.type !== "dance_tick");
  }
  function presentSettlement(settled: LeisureResult | undefined) {
    opened = false;
    if (settled?.chipDelta !== undefined) { casinoMenuOpen = true; casinoStage = "games"; }
    persist();
    if (settled) showResult({
      actionId: `district_leisure_${settled.kind}`, icon: definitions[settled.kind].icon,
      name: definitions[settled.kind].name, duration: settled.durationMinutes / 60,
      verdict: settled.summary,
      deltas: [
        {key:settled.chipDelta === undefined ? "money" : "casino_chips",label:settled.chipDelta === undefined ? "金钱" : "筹码",value:settled.chipDelta ?? settled.moneyDelta},
        {key:"mood",label:"心情",value:settled.moodDelta},
        {key:"stamina",label:"体力",value:settled.staminaDelta},
        {key:"fame",label:"影响力",value:settled.kind === "singing" ? 2 : 0},
        {key:"stress",label:"压力",value:settled.kind === "singing" ? -5 : 0},
      ].filter(delta => delta.value !== 0),
    });
  }
  function settle() {
    if (!active) return;
    const check = settleDistrictLeisure(gameState,active.id);
    if (!check.ok) { showToast(check.reason); return; }
    presentSettlement(check.result);
  }
  async function close() {
    const session = gameState.districtLeisure?.active;
    if (session?.phase === "playing") {
      const confirmed = await uiConfirm("提前结束本轮？已付费用不退，并按原定时长推进游戏时间。", { confirmLabel: "提前结束", danger: true });
      if (!confirmed || gameState.districtLeisure?.active?.id !== session.id) return;
      const forfeit = stepDistrictLeisure(gameState, session.id, { type: "forfeit" });
      if (!forfeit.ok) { showToast(forfeit.reason); return; }
    }
    if (session) {
      const check = settleDistrictLeisure(gameState, session.id);
      if (!check.ok) { showToast(check.reason); return; }
      presentSettlement(check.result);
      return;
    }
    opened = false;
    // Stop the frame loop before taking the final snapshot for refresh recovery.
    await tick();
    if (gameState.districtLeisure?.active) { if(saveTimer) clearTimeout(saveTimer); saveTimer = undefined; markSessionDirty(); await checkpointAutoSave(); }
  }
  let cardBusy=$state(false);
  const cardMode=$derived(!!active && ["blackjack","high_low","poker","slots","roulette_redblack","roulette_highlow","roulette_number"].includes(active.kind));
  function keyboard(event: KeyboardEvent) {
    if (uiState.modal !== null) return;
    if (casinoMenuOpen && casinoStage === "games" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); shiftCasinoCategory(event.key === "ArrowRight" ? 1 : -1); return; }
    if (opened && event.key === "Escape" && uiState.modal === null) { event.preventDefault(); close(); }
    else if (casinoMenuOpen && event.key === "Escape") { event.preventDefault(); backCasinoMenu(); }
  }
  function persistChange() { persist(); }
  function enterRoom(room: CasinoRoom) {
    const r = enterCasinoRoom(gameState, room); if (!r.ok) { showToast(r.reason); return; }
    casinoRoomSelection = room; casinoBet = casinoBetRange(room)[0]; casinoStage = "games"; persistChange();
  }
  function backCasinoMenu() { if (casinoStage === "games") { leaveCasinoRoom(gameState); casinoStage = "rooms"; casinoMenuOpen = false; persist(); } else casinoMenuOpen = false; }
  function chooseCategory(category: typeof casinoCategory) { casinoCategory = category; selectedCasinoGame = gamesByCategory[category][0]; casinoChoice = category === "roulette" ? "red" : "high"; casinoNumberChoice = 0; }
  function shiftCasinoCategory(delta: number) { const i = casinoCategories.indexOf(casinoCategory); chooseCategory(casinoCategories[(i + delta + casinoCategories.length) % casinoCategories.length]); }
  function swipeBegin(event: PointerEvent) { if (casinoStage !== "games" || (event.target instanceof Element && event.target.closest("input,button,select,summary"))) return; swipeStart = event.clientX; }
  function swipeEnd(event: PointerEvent) { if (swipeStart === undefined) return; const delta = event.clientX - swipeStart; swipeStart = undefined; if (Math.abs(delta) > 70) shiftCasinoCategory(delta < 0 ? 1 : -1); }
  function convertCash() { const r = buyCasinoChips(gameState, Number(exchangeCash)); if (!r.ok) showToast(r.reason); else { showToast(`兑换获得 ${Number(exchangeCash) * 5} 筹码`); persist(); } }
  function convertBack() { const r = redeemCasinoChips(gameState, Number(redeemChips)); if (!r.ok) showToast(r.reason); else { showToast(`收到 ${Number(redeemChips) / 5} 元`); persist(); } }
  function getSnack() { const r = takeCasinoSnack(gameState); if (!r.ok) showToast(r.reason); else { showToast("免费小吃：饱腹略有恢复"); persist(); } }
  const portal = overlayPortal;
  onDestroy(() => { if(saveTimer) clearTimeout(saveTimer); if(active) persist(); });
</script>

<svelte:window onkeydown={keyboard}/>
{#if kinds.length || active}
  {#if isCasino}
    <section class="casino-lobby leisure-panel" aria-label="德州小店">
      <div class="section-heading"><strong>今夜牌桌</strong><span>暖灯下，坐下来玩一局。</span></div>
      {#if active}<div class="resume"><div><strong>{definitions[active.kind].name}</strong><span>{active.phase === "ready" ? "本局已完成，等待结算" : "牌局已保存，可以恢复"} · 已付 {active.currency === "chips" ? "筹码" : "¥"}{active.paid}</span></div><button onclick={() => { casinoMenuOpen = false; opened = true; }}>恢复牌局</button></div>{/if}
      <div class="casino-balance"><span>你的筹码</span><strong>🪙 {chips.toLocaleString()} 枚</strong><small>¥1 = 5 筹码 · 可在此兑换或兑回</small></div>
      <div class="casino-lobby-grid">
        <article class="casino-lobby-card">
          <div class="lobby-icon">🪙</div><h3>兑换游戏币</h3><p>现金与筹码按 1:5 兑换。</p>
          <label>现金金额 <span>¥<input type="number" min="1" step="1" bind:value={exchangeCash} /></span></label>
          <button onclick={convertCash} disabled={!!active}>兑换 {Math.max(0, Math.floor(Number(exchangeCash) || 0) * 5)} 筹码</button>
          <label>兑回筹码 <span><input type="number" min="5" step="5" bind:value={redeemChips} /> 枚</span></label>
          <button class="subtle" onclick={convertBack} disabled={!!active}>兑回 {Math.max(0, Math.floor(Number(redeemChips) / 5) || 0)} 元</button>
        </article>
        <article class="casino-lobby-card">
          <div class="lobby-icon">♠</div><h3>选择进场</h3><p>挑选场次，再选类别与具体玩法。</p>
          <button class="gold-button" onclick={() => { casinoStage = "rooms"; casinoMenuOpen = true; }}>进入场次选择 <span>→</span></button>
        </article>
        <article class="casino-lobby-card">
          <div class="lobby-icon">🥟</div><h3>免费小吃</h3><p>{snackClaimed ? "本营业夜已领取。" : "一份简单小吃，垫垫肚子。"}</p>
          <button class="subtle" onclick={getSnack} disabled={snackClaimed || !!active}>{snackClaimed ? "本夜已领取" : "领取免费小吃"}</button>
        </article>
      </div>
    </section>
  {:else}
  <section class="leisure-panel" aria-label="泊月娱乐">
    <div class="section-heading"><strong>{gameState.locationId === "boyue_lounge_bar" ? "月光小舞台" : gameState.locationId === "boyue_nightclub" ? "今夜舞池" : "街机游乐厅"}</strong></div>
    {#if venue}<p class="venue-mood" data-nightlife-mood={musicMood}>今夜氛围 · {NIGHTLIFE_MOOD_LABEL[musicMood]} <small>{WEATHER_LABEL[currentWeather(gameState)]} · {isWeekend(gameState.time)?'周末':'工作日'}</small></p>{/if}
    {#if active}<div class="resume"><div><strong>{definitions[active.kind].name}</strong><span>{active.phase === "ready" ? "本轮已完成，等待结算" : "进度已保存，可以随时恢复"} · 已付 ¥{active.paid}</span></div><button onclick={() => { opened = true; }}>恢复{active.phase === "ready" ? "结算" : "游戏"}</button></div>{/if}
    <div class="entries">
      {#each kinds as kind}
        <article class="entry">
          <div class="entry-heading"><div class="entry-icon">{definitions[kind].icon}</div><div><span>{definitions[kind].category}</span><h3>{definitions[kind].name}</h3></div></div>
          <p>{definitions[kind].description}</p><div class="cost">{kind === "claw" || kind === "platform" ? `每轮 ¥${districtArcadeCost(gameState)} · ${kind === "claw" ? 5 : 30} 分钟` : definitions[kind].cost}</div>
          {#if kind === "blackjack" || kind === "poker"}<label class="bet">本局底注 <div><span>¥</span>{#if kind === "blackjack"}<input aria-label="21点底注" type="number" min="20" max="2000" step="1" bind:value={blackjackBet} disabled={!!active}/>{:else}<input aria-label="德州底注" type="number" min="20" max="1000" step="1" bind:value={pokerBet} disabled={!!active}/>{/if}</div></label><div class="presets">{#each [20,50,100,200] as amount}<button disabled={!!active} onclick={() => { if(kind === "blackjack") blackjackBet = amount; else pokerBet = amount; }}>¥{amount}</button>{/each}</div>
          {:else if kind === "dance" || kind === "singing"}<label class="track">选择节奏模式<select bind:value={track} disabled={!!active}>{#each DANCE_TRACKS as _, index}<option value={index}>{index === 0 ? "轻松" : index === 1 ? "进阶" : "活力"}</option>{/each}</select></label>{/if}
          <details><summary>{kind === "blackjack" || kind === "poker" ? "牌桌规则" : "操作说明"}</summary><p>{definitions[kind].rules}</p></details>
          <button class="start" disabled={!!active || !permitted[kind]?.ok} onclick={() => start(kind)}>{kind === "singing" ? "登台驻唱" : kind === "blackjack" || kind === "poker" ? "下注开局" : kind === "dance" ? "进入舞池" : "开始一轮"}<span>→</span></button>
          {#if !permitted[kind]?.ok}<div class="unavailable">{permitted[kind]?.reason ?? "当前无法参加"}</div>{/if}
        </article>
      {/each}
    </div>
  </section>
  {/if}
{/if}

{#if casinoMenuOpen && isCasino && uiState.modal === null}
  <div class="casino-backdrop hud-scope" use:portal>
    <dialog open class="casino-menu" aria-modal="true" aria-label={casinoStage === "rooms" ? "选择赌场场次" : "选择赌场游戏"} style="position:relative;inset:auto;margin:0;max-width:none;max-height:none;border:0;border-radius:0;background:transparent;color:inherit" onpointerdown={swipeBegin} onpointerup={swipeEnd} onpointercancel={() => swipeStart = undefined}>
      <header class="casino-menu-head">
        <div><small>泊月夜市 · 德州小店</small><h2>{casinoStage === "rooms" ? "选择场次" : `${CASINO_ROOMS[casinoRoomSelection].name} · 选择游戏`}</h2></div>
        <div class="casino-head-right">{#if casinoStage === "games"}<span>🪙 {chips} 筹码</span>{/if}<button aria-label="关闭场次菜单" onclick={backCasinoMenu}>✕</button></div>
      </header>
      {#if casinoStage === "rooms"}
        <p class="casino-lead">选定场次后，再选择游戏类别和牌桌玩法。</p>
        <div class="room-grid">
          <button class="room-card" onclick={() => enterRoom("leisure")}>
            <span class="room-icon">♣</span><strong>{CASINO_ROOMS.leisure.name}</strong><small>免费进入</small><span>底注 {CASINO_ROOMS.leisure.minBet}—{CASINO_ROOMS.leisure.maxBet} 筹码</span><b>进入新手场　→</b>
          </button>
          <button class="room-card competition" onclick={() => enterRoom("competition")}>
            <span class="room-icon">♦</span><strong>{CASINO_ROOMS.competition.name}</strong><small>门票 ¥{CASINO_ROOMS.competition.entryFee}</small><span>底注 {CASINO_ROOMS.competition.minBet.toLocaleString()}—{CASINO_ROOMS.competition.maxBet.toLocaleString()} 筹码</span><b>支付门票并进场　→</b>
          </button>
        </div>
      {:else}
        <div class="casino-category-row"><button aria-label="上一个游戏类别" onclick={() => shiftCasinoCategory(-1)}>‹</button>
          <nav aria-label="游戏类别">{#each casinoCategories as category}<button class:active={casinoCategory === category} onclick={() => chooseCategory(category)}>{category === "cards" ? "棋牌类" : category === "slots" ? "老虎机" : "轮盘类"}</button>{/each}</nav>
          <button aria-label="下一个游戏类别" onclick={() => shiftCasinoCategory(1)}>›</button>
        </div>
        {#key casinoCategory}
        <div class="casino-game-layout" in:fly={{ y: 12, duration: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 180 }}>
          <div class="casino-preview" aria-hidden="true">
            <div class="preview-orbit"></div>
            {#if casinoCategory === "cards"}<div class="preview-card back-card">✦</div><div class="preview-card face-card"><small>A<br/>♠</small><span>♠</span></div>
            {:else if casinoCategory === "slots"}<div class="preview-slots"><small>LUCKY MOON</small><div><span>7</span><span>7</span><span>7</span></div></div>
            {:else}<div class="preview-wheel"><span>0</span><b>✦</b></div>{/if}
            <div class="preview-caption"><small>泊月 · 德州小店</small><strong>{casinoCategory === "cards" ? "每一张牌，都是新的可能。" : casinoCategory === "slots" ? "让幸运转起来。" : "等待那颗小球停下。"}</strong></div>
          </div>
        <div class="casino-game-content">
          <div class="casino-game-form">
          <div class="casino-game-heading"><span>{selectedDefinition.icon}</span><div><small>{selectedDefinition.category}</small><h3>{selectedDefinition.name}</h3></div></div>
          <p>{selectedDefinition.description}</p><details><summary>玩法与赔率</summary><p>{selectedDefinition.rules}</p></details>
          {#if casinoCategory === "cards"}
            <div class="game-picker">{#each gamesByCategory.cards as kind}<button class:active={selectedCasinoGame === kind} onclick={() => selectedCasinoGame = kind}>{definitions[kind].icon} {definitions[kind].name}</button>{/each}</div>
          {:else if casinoCategory === "roulette"}
            <div class="game-picker">{#each gamesByCategory.roulette as kind}<button class:active={selectedCasinoGame === kind} onclick={() => { selectedCasinoGame = kind; casinoChoice = kind === "roulette_highlow" ? "low" : "red"; }}>{definitions[kind].name}</button>{/each}</div>
          {/if}
          <label class="casino-wager">本局下注 <span>🪙 <input type="number" min={roomMinBet} max={roomMaxBet} step={selectedCasinoGame === "blackjack" ? 2 : 1} bind:value={casinoBet} /> 枚</span></label>
          <div class="wager-presets">{#each [roomMinBet, Math.min(roomMinBet * 2, roomMaxBet), Math.min(roomMinBet * 4, roomMaxBet), roomMaxBet] as amount, index (index)}<button class:selected={Number(casinoBet) === amount} onclick={() => casinoBet = amount}><span class="preset-chip" aria-hidden="true">◉</span>{amount}</button>{/each}</div>
          {#if selectedCasinoGame === "high_low" || selectedCasinoGame === "roulette_highlow" || selectedCasinoGame === "roulette_redblack"}
            <div class="choice-row">{#each (selectedCasinoGame === "roulette_redblack" ? ["red", "black"] : ["high", "low"]) as choice}<button class:chosen={casinoChoice === choice} class:red-choice={choice === "red"} class:black-choice={choice === "black"} onclick={() => casinoChoice = choice as "red" | "black" | "high" | "low"}>{choice === "red" ? "红" : choice === "black" ? "黑" : choice === "high" ? "大" : "小"}</button>{/each}</div>
          {:else if selectedCasinoGame === "roulette_number"}
            <label class="number-choice">选择号码 <input type="number" min="0" max="36" step="1" bind:value={casinoNumberChoice} /></label>
          {/if}
          </div>
          <div class="casino-game-footer"><button class="back-button" onclick={backCasinoMenu}>离开场次</button><button class="gold-button" disabled={!selectedCasinoAllowed.ok || Number(casinoBet) < roomMinBet || Number(casinoBet) > roomMaxBet || Number(casinoBet) > chips || (selectedCasinoGame === "blackjack" && Number(casinoBet) % 2 !== 0) || (selectedCasinoGame === "poker" && Number(casinoBet) * 2 > chips)} onclick={() => start(selectedCasinoGame)}>进入牌桌　·　下注 {Math.floor(Number(casinoBet) || 0)} 筹码</button></div>
          {#if !selectedCasinoAllowed.ok}<small class="casino-error">{selectedCasinoAllowed.reason}</small>{/if}
        </div>
        </div>
        {/key}
        <div class="casino-pager">← 左右滑动或按方向键切换类别 →</div>
      {/if}
    </dialog>
  </div>
{/if}

{#if opened && active}
  <div class="leisure-backdrop hud-scope" class:card-mode={cardMode} use:portal>
    <div class="leisure-dialog" class:rhythm-mode={active.kind === "dance" || active.kind === "singing"} class:card-mode={cardMode} role="dialog" aria-modal="true" aria-labelledby="leisure-title" tabindex="-1">
      <header><div>{#if cardMode}<small class="table-eyebrow">德州小店 · {CASINO_ROOMS[active.room ?? 'leisure'].name}</small>{/if}<h2 id="leisure-title">{definitions[active.kind].name}</h2></div><div class="table-header-right">{#if cardMode}<span class="table-wallet">◉ {chips.toLocaleString()}<small>筹码</small></span>{/if}<button class="close" onclick={close} aria-label="提前结束并结算娱乐本轮">✕</button></div></header>
      <div class="dialog-body">
        {#if active}
          {#key active.id}
            {#if active.kind === "blackjack" || active.kind === "poker"}<CardTable session={active} oninput={input} onbusy={(value)=>cardBusy=value}/>
            {:else if active.kind === "claw"}<ClawMachine session={active} oninput={input} {enabled}/>
            {:else if active.kind === "platform"}<PlatformGame session={active} oninput={input} onpause={() => persist()} {enabled}/>
            {:else if active.kind === "high_low" || active.kind === "slots" || active.kind === "roulette_redblack" || active.kind === "roulette_highlow" || active.kind === "roulette_number"}
              <CasinoTableGame session={active} oninput={input} onbusy={(value)=>cardBusy=value}/>
            {:else if active.kind === "dance" || active.kind === "singing"}<RhythmGame session={active} oninput={input} onpause={() => persist()} {enabled}/>{/if}
          {/key}
          {#if active.forfeited}<p class="abandoned">本轮已提前结束；已付费用不退，结算仍消耗 {active.durationMinutes} 分钟。</p>{/if}
          <div class="round-footer">{#if active.phase === "ready"}<button class="settle" disabled={cardMode&&cardBusy} onclick={settle}>确认结算 · {active.durationMinutes} 分钟</button>{:else}<span>可以先收起，稍后继续</span><button class="forfeit" disabled={cardMode&&cardBusy} onclick={() => input({type:"forfeit"})}>提前结束本轮</button>{/if}</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
.venue-mood{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:6px 16px;font-size:13px;color:var(--hud-text,#edf3ff);padding:10px 0;border-bottom:1px solid var(--hud-border,#ffffff22)}.venue-mood small{font-size:12px;color:var(--hud-text-dim,#a8b5c8)}

 .leisure-panel{margin:14px 0;min-width:0}.section-heading{display:flex;flex-direction:column;gap:5px;padding:0 2px 12px}.section-heading>strong{font-size:18px;color:var(--accent,#dcc18d)}.entries{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.entry{min-width:0;padding:18px;border:1px solid #bfa47344;border-radius:16px;box-shadow:0 5px 20px #0002}.entry-heading{display:flex;gap:13px;align-items:center}.entry-icon{width:47px;height:47px;display:grid;place-items:center;border:1px solid #d9be8755;border-radius:13px;font:30px Georgia;color:#e8c888}.entry-heading span{font-size:10px;letter-spacing:1px}.entry h3{font-size:18px;line-height:1.4;margin:3px 0 0}.entry>p{font-size:12px;line-height:1.8;margin:12px 0}.cost{font-size:12px;margin:10px 0}.bet,.track{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;margin:14px 0 10px}.bet>div{display:flex;align-items:center;gap:7px;max-width:65%;color:#e1c28a}.bet input{width:100%;min-width:0;box-sizing:border-box}.bet input,.track select{min-height:44px;border:1px solid #aac6b455;border-radius:9px;font:inherit;padding:10px}.track select{max-width:74%;min-width:0}.presets{display:flex;gap:6px}.presets button{min-height:44px;flex:1;border:1px solid #8fad9655;border-radius:8px;font:inherit;font-size:12px;cursor:pointer}details{margin:13px 0;font-size:12px;color:#b5c5b9}summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:#d8c494}summary::before{content:"▸";margin-right:7px}details[open] summary::before{content:"▾"}details p{line-height:1.8;margin:7px 0;color:#bac9bd}.start{display:flex;justify-content:space-between;align-items:center;min-height:46px;width:100%;border:1px solid #e7ce99;border-radius:10px;padding:10px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}button:disabled,input:disabled,select:disabled{opacity:.45;cursor:default}.unavailable{font-size:11px;line-height:1.5;margin-top:9px}.resume{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #dbbc7855;border-radius:13px;padding:13px;margin-bottom:12px}.resume>div{display:flex;flex-direction:column;gap:5px;min-width:0}.resume strong{font-size:13px;color:#e8d097}.resume span{font-size:11px;line-height:1.6}.resume button{min-height:44px;flex:0 0 auto;padding:8px 12px;border:1px solid #b69d6966;border-radius:9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.leisure-backdrop{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(5px)}.leisure-dialog{width:min(100%,620px);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;min-width:0;border:1px solid #d1b57b77;border-radius:20px;outline:none;overflow:hidden}.leisure-dialog>header{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:18px 22px;border-bottom:1px solid #c5b07933}.leisure-dialog h2{margin:5px 0 0;font-size:21px;color:#eace99}.close{flex:0 0 auto;min-height:44px;min-width:44px;border:1px solid #acb99244;border-radius:11px;font-size:20px;cursor:pointer}.dialog-body{padding:20px 22px;overflow-y:auto;overscroll-behavior:contain;min-height:0}.round-footer{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-top:19px;padding-top:15px;border-top:1px solid #aac4a633}.round-footer>span{font-size:11px;line-height:1.7;max-width:65%}.forfeit{min-height:44px;border:1px solid #b49b7566;border-radius:8px;padding:8px 12px;font:inherit;font-size:12px;cursor:pointer}.settle{width:100%;min-height:48px;border:1px solid #e4ca92;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}.abandoned{font-size:12px;line-height:1.7;border:1px solid #bc947c44;padding:12px;border-radius:10px}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(max-width:440px){.entry{padding:15px}.leisure-backdrop{padding:8px}.leisure-dialog{max-height:calc(100dvh - 16px);border-radius:15px}.leisure-dialog>header{padding:13px 15px}.dialog-body{padding:15px}.leisure-dialog h2{font-size:19px}.round-footer{gap:9px}.round-footer>span{max-width:58%}.forfeit{padding:8px 9px}}@media(max-height:600px) and (min-width:600px){.leisure-backdrop{padding:8px}.leisure-dialog{width:min(100%,700px);max-height:calc(100dvh - 16px)}.leisure-dialog>header{padding:10px 18px}.dialog-body{padding:14px 18px}.round-footer{margin-top:12px;padding-top:10px}}

 .leisure-backdrop.card-mode{padding:0;backdrop-filter:none;background:#184538;z-index:110}.leisure-dialog.card-mode{width:100%;height:100dvh;max-height:none;border:0;border-radius:0;background:radial-gradient(ellipse at 50% 45%,#326f50,#194c3c 65%,#12372d);color:#f1e9d3;box-shadow:inset 0 0 100px #072a2266;isolation:isolate}.card-mode>header{padding:10px max(20px,env(safe-area-inset-right));background:#092f2866;border-color:#d9ce9a2e;flex-shrink:0}.card-mode h2{font:600 18px Georgia;letter-spacing:3px;margin:0;color:#eee4c6}.card-mode .close{color:#e8dfbd;background:#0b302966;border-color:#d5d5b544}.card-mode .dialog-body{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:12px max(20px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom));min-height:0}.card-mode .round-footer{flex-shrink:0;width:min(600px,100%);margin:8px auto 0;padding-top:8px;border-color:#d4d5b52e;color:#c5d0bc}.card-mode .settle{background:#d7b67d;color:#203a31;border-color:#e2d0a7}.card-mode .forfeit{background:#153b30;color:#d5d8bf;border-color:#d3d3ba44}.card-mode .round-footer>span{color:#c6d0bd}.card-mode .abandoned{position:absolute;top:65px;left:50%;transform:translateX(-50%);z-index:3;background:#1d392f}.card-mode:before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.3;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='.18' filter='url(%23n)'/%3E%3C/svg%3E")}
 @media(max-height:500px) and (min-width:500px){.card-mode>header{padding:5px 16px}.card-mode h2{font-size:15px}.card-mode .close{min-height:32px;min-width:36px;font-size:16px}.card-mode .dialog-body{padding:4px 18px 7px}.card-mode .round-footer{margin-top:4px;padding-top:4px}.card-mode .settle,.card-mode .forfeit{min-height:34px}.card-mode .round-footer>span{font-size:10px}}
.casino-balance{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:14px 17px;border:1px solid #d3b36b55;border-radius:14px;background:linear-gradient(115deg,#352b1d,#132323 72%);margin-bottom:12px}.casino-balance>span{font-size:12px;color:#c7cbb9}.casino-balance strong{font-size:20px;color:#f2d28b}.casino-balance small{grid-column:1/-1;color:#aab8ae;font-size:10px}.casino-lobby-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.casino-lobby-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;padding:15px;border:1px solid #a9b78d33;border-radius:15px;background:linear-gradient(145deg,#182b2baa,#101c22cc);box-shadow:0 7px 24px #0002}.lobby-icon{font-size:26px}.casino-lobby-card h3{margin:0;font-size:15px;color:#ead6a0}.casino-lobby-card p{margin:0 0 5px;min-height:32px;color:#b9c4bd;font-size:11px;line-height:1.6}.casino-lobby-card label{width:100%;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:10px;color:#c4cabc}.casino-lobby-card label span{display:flex;align-items:center;gap:4px}.casino-lobby-card input,.casino-wager input,.number-choice input{width:78px;min-width:0;box-sizing:border-box;min-height:38px;padding:6px 8px;border:1px solid #afba9344;border-radius:8px;background:#091713;color:#f4e8cd;font:inherit}.casino-lobby-card>button,.gold-button,.back-button{width:100%;min-height:43px;border:1px solid #ddc17a88;border-radius:9px;background:#dac080;color:#1e3028;font:inherit;font-weight:800;cursor:pointer}.casino-lobby-card>button.subtle{border-color:#a8b99855;background:#12241fcc;color:#ddcfaa}.gold-button>span{float:right}.casino-lobby-card button:disabled,.gold-button:disabled{opacity:.45;cursor:default}.casino-backdrop{position:fixed;inset:0;z-index:106;display:flex;background:radial-gradient(ellipse at 50% 35%,#26493c,#0a1514 73%);color:#f1e9d3;overscroll-behavior:contain}.casino-menu{box-sizing:border-box;width:100%;height:100dvh;padding:max(18px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(15px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));display:flex;flex-direction:column;min-height:0;overflow:auto}.casino-menu-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 0 16px;border-bottom:1px solid #e7d59a33}.casino-menu-head small{font-size:11px;letter-spacing:1.5px;color:#b7c5a6}.casino-menu-head h2{margin:5px 0 0;color:#f0d596;font:600 clamp(20px,4vw,30px) Georgia,serif}.casino-head-right{display:flex;align-items:center;gap:14px;font-size:13px;color:#efd896}.casino-head-right button{width:44px;height:44px;border:1px solid #d6c38c55;border-radius:50%;background:#0a201ddd;color:#f1e9d3;font-size:20px;cursor:pointer}.casino-lead{font-size:13px;color:#bac7b9;margin:17px 0}.room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;width:min(960px,100%);margin:auto}.room-card{display:flex;flex-direction:column;align-items:flex-start;gap:11px;min-height:255px;padding:clamp(18px,4vw,34px);border:1px solid #c9b57355;border-radius:18px;background:linear-gradient(150deg,#1a3028,#121c20);color:#f2ebd8;text-align:left;cursor:pointer}.room-card.competition{border-color:#c5906855;background:linear-gradient(145deg,#352a25,#171a1d)}.room-icon{font-size:32px;color:#f2d28b}.room-card strong{font-size:clamp(20px,4vw,30px);color:#f0d596}.room-card small{font-size:12px;color:#c9c5ac}.room-card>span:not(.room-icon){font-size:15px;color:#e1e4d2}.room-card b{margin-top:auto;font-size:14px;color:#f2d28b}.casino-category-row{display:grid;grid-template-columns:44px 1fr 44px;gap:12px;align-items:center;margin:17px auto;width:min(880px,100%)}.casino-category-row>button{height:44px;border:1px solid #bba56755;border-radius:50%;background:#132820;color:#edd48f;font-size:28px;cursor:pointer}.casino-category-row nav{display:flex;justify-content:center;gap:8px}.casino-category-row nav button,.game-picker button{min-height:42px;padding:8px 16px;border:1px solid #cbb97844;border-radius:22px;background:#13241f;color:#d9d5bf;font:inherit;font-size:12px;cursor:pointer}.casino-category-row nav button.active,.game-picker button.active{background:#dfc47f;color:#172a22;border-color:#f3d78e;font-weight:800}.casino-game-content{width:min(760px,100%);margin:auto;touch-action:pan-y}.casino-game-heading{display:flex;align-items:center;gap:13px}.casino-game-heading>span{display:grid;place-items:center;width:56px;height:56px;border:1px solid #d9bd8066;border-radius:15px;background:#bd9c4830;font-size:30px}.casino-game-heading small{font-size:10px;color:#c4c8af}.casino-game-heading h3{margin:3px 0 0;font-size:clamp(20px,4vw,29px);color:#f0d596}.casino-game-form>p{font-size:13px;color:#cad3c5;line-height:1.6}.casino-game-content details{font-size:11px;color:#aebcac}.casino-game-content details summary{min-height:38px}.casino-game-content details p{margin:0;padding:5px 0 9px;line-height:1.7}.game-picker{display:flex;flex-wrap:wrap;gap:8px;margin:13px 0}.game-picker button{border-radius:10px}.casino-wager,.number-choice{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:15px 0 9px;font-size:12px;color:#e8dbad}.casino-wager span{display:flex;align-items:center;gap:7px;color:#f1d993}.casino-wager input{width:120px;font-size:15px}.wager-presets{display:flex;gap:8px}.wager-presets button{flex:1;min-height:40px;border:1px solid #b6c3a044;border-radius:9px;background:#12211d;color:#e5d5a6;cursor:pointer}.choice-row{display:flex;gap:9px;margin:14px 0}.choice-row button{flex:1;min-height:44px;border:1px solid #bfc5a244;border-radius:9px;background:#182822;color:#eadbb1;font:inherit;font-weight:800;cursor:pointer}.choice-row .chosen{outline:2px solid #e4c778}.choice-row .red-choice{background:#672f32}.choice-row .black-choice{background:#131719}.number-choice input{width:96px;font-size:16px}.casino-game-footer{display:flex;gap:10px;margin-top:18px}.casino-game-footer .back-button{width:38%;border-color:#9eaf9644;background:#16251f;color:#d5cda9}.casino-game-footer .gold-button{flex:1}.casino-error{display:block;margin-top:8px;color:#ffaaaa}.casino-pager{text-align:center;padding:13px 0 4px;font-size:10px;color:#a9b49f}
@media(max-width:720px){.casino-lobby-grid{grid-template-columns:1fr}.casino-lobby-card{padding:13px}.casino-lobby-card p{min-height:0}.room-grid{grid-template-columns:1fr;gap:11px}.room-card{min-height:175px;padding:18px}.casino-game-content{margin:10px auto}.casino-menu{padding-left:14px;padding-right:14px}.casino-game-footer{flex-direction:column}.casino-game-footer .back-button{width:100%}.casino-category-row{grid-template-columns:36px 1fr 36px;gap:5px}.casino-category-row>button{width:36px;height:36px}.casino-category-row nav{gap:4px}.casino-category-row nav button{min-height:39px;padding:7px 10px;font-size:10px}}
 .leisure-backdrop{padding:0;align-items:stretch;justify-content:stretch}
 .leisure-dialog{width:100%;height:100%;max-height:100%;border:0;border-radius:0}
.rhythm-mode{background:#111827!important;color:#d9e3f2}.rhythm-mode>header{padding:7px max(16px,env(safe-area-inset-right));flex-shrink:0}.rhythm-mode h2{font-size:15px;margin:0;color:#d9e3f2}.rhythm-mode .dialog-body{display:flex;flex-direction:column;flex:1;overflow:hidden;padding:0;min-height:0}.rhythm-mode .round-footer{flex-shrink:0;margin:0;padding:6px max(16px,env(safe-area-inset-right));border-top-color:#3b465a}.rhythm-mode .forfeit{min-height:32px;padding:4px 12px}.rhythm-mode .settle{min-height:36px}.rhythm-mode .close{min-height:32px;min-width:36px}.rhythm-mode .abandoned{margin:0;font-size:11px;padding:6px}
</style>

