<script lang="ts">
  import { onMount, tick } from "svelte";
  import { gameState, resetGameToMenuWithoutSaving, markSessionClean, checkpointAutoSave, waitForCheckpointAutoSave, markSessionDirty, autoSaveStatus, shouldCheckpointGameSession } from "../../stores/gameStore.svelte";
  import { uiState, showResult, showToast, closeModal } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { applyMiniGameReward, gradeOf, GRADE_LABEL, isAmusementGame, applyAmusementPrize } from "../../game/core/minigame";
  import { workDialogue } from "../../game/core/workDialogue";
  import { playSound, beginMinigameMusic } from "../../lib/audio";
  import { minigameMusicMode } from "../../lib/minigameMusic";
  import { advanceHours } from "../../game/core/time";
  import { recordMoney } from "../../game/core/weekly";
  import { pushLog } from "../../game/engine";
  import { addItem, getItem } from "../../game/core/items";
  import { rollBlindBox, autoExitIfClosed } from "../../game/core/actions";
  import { chance } from "../../game/rng";
  import { gameDay } from "../../game/core/calendar";
  import MiniGameHost from "./MiniGameHost.svelte";
  import { settleStreetPerformance } from "../../game/core/streetPerformance";
  import { completeWork, pauseWork, resumeWork } from "../../game/core/jobs";
  import { saveGame } from "../../lib/save";
  import { applyDeliveryTrafficIncident } from "../../game/core/deliveryTraffic";
  import type { TrafficIncident } from "../../game/core/deliveryShift";

  const payload = $derived(uiState.minigamePayload);
  const cfg = $derived(payload?.config);
  // Keep the same music while an opened work game displays its pause screen.
  const musicMode = $derived(cfg ? minigameMusicMode(cfg) : null);
  $effect(() => {
    if (musicMode) return beginMinigameMusic(musicMode);
  });
  const stallStartMinute = $derived(gameDay(gameState.time) * 1440 + gameState.time.hour * 60 + gameState.time.minute);
  const activeSession = $derived(payload?.sessionId && gameState.work?.active?.id === payload.sessionId ? gameState.work.active : undefined);
  const restorableProgress = $derived(activeSession?.minigameProgress ?? (
    cfg?.type === "delivery" && (cfg.mode === "rideshare" || cfg.actualIncome) && (activeSession?.completedOrders ?? 0) > 0
      ? { schema: "urban-life-street-dispatch", version: 0, sceneKey: payload?.key, kind: cfg.mode,
          delivered: activeSession?.completedOrders, earnedFare: activeSession?.deliveryEarnedFare ?? (cfg.mode === "rideshare" ? (activeSession?.completedOrders ?? 0) * (cfg.payPerOrder ?? 25) : 0) }
      : undefined));
  const endChallengeLabel = "提前结束（按 0 分结算；未完成工作无工资）";

  let finished = $state(false);
  let pendingFinish = $state<{scoreRatio:number;completedOrders?:number;reason?:string;earnedFare?:number}|undefined>(undefined);
  let saving = $state(false);
  let ending = $state(false);
  let saveFailed = $state(false);
  let backgroundPaused = $state(typeof document !== "undefined" && document.hidden);
  /** v1.3b2 餐饮类加班日：服务 8-10 人，工资基数 ×1.5 */
  let overtime = false;
  /** v1.3b2 摆摊：本局实际服务人数（多劳多得） */
  let stallServed = 0;
  let card: HTMLDivElement;
  let minigameHost = $state<{flushProgress:()=>Promise<void>} | undefined>();
  let oversizedProgressWarnedFor: string | undefined;
  /** v1.3b2 便利店：本次下班 33% 概率免费盲盒（每天限一次，防刷） */
  const CONVENIENCE_JOBS = new Set(["job_convenience_day", "job_convenience_clerk", "job_boyue_convenience_clerk"]);

  function onOvertime(v: boolean): void {
    overtime = v;
    if (activeSession) activeSession.overtime = v;
  }
  function onStallResult(served: number): void {
    stallServed = served;
  }

  function trafficIncident(incident: TrafficIncident): void {
    if (finished || cfg?.type !== 'delivery' || (payload?.sessionId && activeSession?.status !== 'playing')) return;
    const deducted = applyDeliveryTrafficIncident(gameState, incident);
    showToast(incident.kind === 'redlight' ? `🚦 闯红灯，钱包扣除 ¥${deducted}` : `🚧 车辆碰撞，钱包扣除 ¥${deducted}，货物品质或乘客满意度下降`);
  }

  function saveProgress(snapshot: unknown): void {
    if (finished || !activeSession || !payload?.sessionId) return;
    if (activeSession.status !== "playing" && activeSession.status !== "paused") return;
    // 保存纯数据，避免把 Svelte 代理或引擎对象留在存档中。
    try {
      const serialized = JSON.stringify(snapshot);
      if (new TextEncoder().encode(serialized).byteLength > 32 * 1024) {
        delete activeSession.minigameProgress;
        if (oversizedProgressWarnedFor !== activeSession.id) {
          oversizedProgressWarnedFor = activeSession.id;
          showToast("本次小游戏进度超过存档上限，当前班次已保留，部分局内进度无法恢复");
        }
        return;
      }
      activeSession.minigameProgress = JSON.parse(serialized);
    } catch { /* 引擎会在下一次进度提交时重试。 */ }
  }

  /** v1.3b2 便利店下班福利：33% 概率免费盲盒（随机两个食物/食材入包，每天限一次） */
  function maybeFreeBlindBox(): void {
    if (!payload || !CONVENIENCE_JOBS.has(payload.key)) return;
    const today = gameDay(gameState.time);
    if (gameState.flags["convFreeBoxDay"] === today) return; // 当天已领
    if (!chance(gameState.rng, 0.33)) return;
    gameState.flags["convFreeBoxDay"] = today;
    const { a, b } = rollBlindBox(gameState);
    addItem(gameState, a, 1);
    addItem(gameState, b, 1);
    const defA = getItem(a);
    const defB = getItem(b);
    pushLog(gameState, "🎁", `便利店下班福利：免费盲盒开出「${defA?.name ?? a}」和「${defB?.name ?? b}」`);
    showToast(`🎁 店长送的盲盒！开出了「${defA?.name ?? a}」和「${defB?.name ?? b}」`);
  }

  /** 各引擎完成回调：按得分比例结算奖励 → 弹回工作/行动结算窗 */
  function finish(scoreRatio: number, completedOrders?: number, final = true, _reason?: string, earnedFare?: number): void {
    if (finished) return;
    if (cfg?.type === "delivery" && payload?.sessionId && activeSession && (activeSession.status === "playing" || activeSession.status === "paused")) {
      if (typeof completedOrders === "number" && Number.isFinite(completedOrders)) {
        activeSession.completedOrders = Math.max(0, Math.floor(completedOrders));
      }
      if ((cfg.deliveryPay || cfg.mode === "rideshare" || (activeSession.jobId === "job_delivery" && activeSession.source === "delivery")) && typeof earnedFare === "number" && Number.isFinite(earnedFare)) {
        const maximumFare = (activeSession.completedOrders ?? 0) * (cfg.payPerOrder ?? 25);
        // Order commission already includes distance and delivery quality. Traffic fines were paid immediately.
        activeSession.deliveryEarnedFare = Math.round(Math.max(0, cfg.mode === "rideshare" ? Math.min(maximumFare, earnedFare) : earnedFare) * 100) / 100;
      }
    }
    if (!final) return;
    if (payload?.sessionId) {
      if (activeSession?.status === "paused" && _reason !== 'abandoned') {
        pendingFinish={scoreRatio,completedOrders,reason:_reason,earnedFare};
        return;
      }
      if (!activeSession || (activeSession.status !== "playing" && _reason !== 'abandoned')) return;
      finished = true;
      const settled = completeWork(gameState, payload.sessionId, scoreRatio, false, _reason==='abandoned');
      if (!settled.ok || !settled.result) {
        finished = false;
        showToast(settled.reason ?? "本班结算失败，请继续工作");
        return;
      }
      uiState.workDialogue = cfg?.type === 'delivery' && _reason === 'abandoned' ? null : workDialogue(payload.key, Math.max(0, Math.min(1, scoreRatio)), gameState.rng);
      if (scoreRatio >= .6) maybeFreeBlindBox();
      playSound(scoreRatio >= .6 ? "success" : "error");
      uiState.minigamePayload = null;
      showResult(settled.result);
      return;
    }
    finished = true;
    if (payload && cfg) {
      // v1.3b2 摆摊：多劳多得，按服务人数直接发钱 + 扣体力 + 经过时间（不走工资加成）
      if (payload.key === 'street_perform' && payload.performanceId) {
        const settled = settleStreetPerformance(gameState, payload.performanceId, scoreRatio);
        if (settled) {
          const pending = uiState.resultPayload as { verdict?:string; quality?:number; deltas?:Array<{key:string;value:number;label?:string}> } | null;
          if (pending) { pending.verdict=settled.verdict; pending.quality=settled.ratio; pending.deltas=[...(pending.deltas??[]), {key:'money',label:'金钱',value:settled.money}]; }
          showToast(settled.verdict);
          playSound(settled.ratio >= .6 ? 'success' : 'error');
        }
        uiState.workDialogue = null;
      } else if (cfg.type === "restaurant" && cfg.stall) {        const perCust = cfg.stallPerCustomerPay ?? 0;
        const staminaCost = (cfg.stallStaminaCost ?? 1) * stallServed;
        const hours = (cfg.stallHourPerCustomer ?? 0.25) * stallServed;
        const income = perCust * stallServed;
        if (income > 0) {
          gameState.player.money += income;
          recordMoney(gameState, income);
          pushLog(gameState, "🍢", `摆摊服务了 ${stallServed} 位顾客，收入 ${income} 元`);
        }
        gameState.player.attrs.stamina = Math.max(0, gameState.player.attrs.stamina - staminaCost);
        if (hours > 0) advanceHours(gameState, hours);
        autoExitIfClosed(gameState);
        showToast(`🍢 收摊！服务 ${stallServed} 位顾客，赚了 ${income} 元${staminaCost > 0 ? `，体力 -${staminaCost}` : ""}`);
        playSound("success");
        uiState.workDialogue = null;
      } else {
        const ratio = Math.max(0, Math.min(1, scoreRatio));
        const g = gradeOf(ratio);
        // v1.33 P5 游乐场小游戏：付费入场 + 分数换奖品（不走工资加成/心情补偿）
        if (isAmusementGame(payload.key)) {
          const tier = applyAmusementPrize(gameState, payload.key, ratio);
          if (ratio > 0) {
            showToast(`🎪 ${tier ? `奖品：「${tier.label}」` : "差一点点，下次再来"}（${GRADE_LABEL[g]}）`);
            playSound("success");
          } else {
            showToast("🎪 没玩好，下次再来试试~");
          }
        } else {
          // v1.3b2 加班日：工资基数上浮 50%（只影响加成，不影响本职工资）
          const pay = overtime ? Math.round(payload.todayPay * 1.5) : payload.todayPay;
          const r = applyMiniGameReward(gameState, payload.key, ratio, pay);
          // v0.965：按小游戏表现生成负责人对话（结算窗顶部展示）
          uiState.workDialogue = workDialogue(payload.key, ratio, gameState.rng);
          if (ratio > 0) {
            const moodGain = Math.round(ratio); // 无薪路径的心情补偿（round(1*ratio)）
            showToast(`🎮 表现 ${g} 级（${GRADE_LABEL[g]}，${Math.round(ratio * 100)} 分）！${r.bonus ? `加成 +${r.bonus} 元` : `心情 +${moodGain}`}${overtime ? " · 🚨 加班日 ×1.5" : ""}`);
            playSound("success");
          } else {
            showToast("🎮 完成！下次更准一些~");
          }
        }
      }
    }
    // v1.3b2 便利店下班福利：33% 概率免费盲盒
    if (scoreRatio >= .6) maybeFreeBlindBox();
    // 弹回结算窗（其关闭时再弹随机事件，保持原链路）
    uiState.minigamePayload = null;
    uiState.modal = null;
    const pending = uiState.resultPayload;
    uiState.resultPayload = null;
    if (pending) showResult(pending);
  }

  /** 跳过（视为 0 分，不卡流程） */
  function skip(): void {
    if (payload?.sessionId) {
      pause();
      return;
    }
    finish(0);
  }
  async function endShift(): Promise<void> {
    if (!payload?.sessionId || finished || saving || ending) return;
    ending = true;
    try {
      await minigameHost?.flushProgress();
      pendingFinish=undefined;
      finish(0,activeSession?.completedOrders,true,'abandoned',activeSession?.deliveryEarnedFare);
    } catch {
      showToast('未能取得最新订单收入，请重试结束或继续本班');
    } finally {
      ending = false;
    }
  }

  async function pause(): Promise<void> {
    if (!payload?.sessionId || finished) return;
    if (!activeSession) {
      // 载荷失配时暂停层不会显示；关闭旧弹窗，不触碰其他班次。
      if (uiState.modal === "minigame" && uiState.minigamePayload?.sessionId === payload.sessionId) {
        closeModal();
        showToast("当前班次已结束或失效，小游戏已关闭");
      }
      return;
    }
    pauseWork(gameState);
    saveFailed = false;
    markSessionDirty();
    await tick();
    try {
      await minigameHost?.flushProgress();
    } catch {
      saveFailed = true;
    }
    await checkpointAutoSave();
    if (shouldCheckpointGameSession() && autoSaveStatus.status === "failed") saveFailed = true;
    if (saveFailed) showToast("本班进度保存失败，可重试保存，或放弃未保存进度退出");
  }

  function resume(): void {
    if (!payload?.sessionId || finished) return;
    saveFailed = false;
    if (!resumeWork(gameState)) {
      showToast("无法继续本班，请先准备可用的配送车辆");
      return;
    }
    if(pendingFinish){const pending=pendingFinish;pendingFinish=undefined;finish(pending.scoreRatio,pending.completedOrders,true,pending.reason,pending.earnedFare);}
  }

  function skipMastered(): void {
    if (!payload?.sessionId || !activeSession?.canSkip || finished) return;
    finished = true;
    const settled = completeWork(gameState, payload.sessionId, 0, true);
    if (!settled.ok || !settled.result) {
      finished = false;
      showToast(settled.reason ?? "跳过失败，请继续工作");
      return;
    }
    uiState.workDialogue = null;
    maybeFreeBlindBox();
    uiState.minigamePayload = null;
    showResult(settled.result);
  }

  async function saveAndExit(): Promise<void> {
    if (saving) return;
    if (!payload?.sessionId || !activeSession) {
      closeModal();
      showToast("当前班次已结束或失效，小游戏已关闭");
      return;
    }
    pauseWork(gameState);
    markSessionDirty();
    saving = true;
    try {
      await tick();
      await minigameHost?.flushProgress();
      await waitForCheckpointAutoSave();
      await saveGame("auto", gameState);
      markSessionClean();
      uiState.modal = null;
      uiState.modalStack = [];
      uiState.minigamePayload = null;
      resetGameToMenuWithoutSaving();
    } catch {
      saveFailed = true;
      showToast("保存失败，请释放存储空间后重试");
    } finally {
      saving = false;
    }
  }

  function abandonWithoutSaving(): void {
    if (saving) return;
    uiState.modal = null;
    uiState.modalStack = [];
    uiState.minigamePayload = null;
    resetGameToMenuWithoutSaving();
  }

  onMount(() => {
    card?.focus();
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKeydown);
    const onVisibility = () => {
      if (document.hidden) {
        if (payload?.sessionId) pause();
        else backgroundPaused = true;
      } else {
        backgroundPaused = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      window.removeEventListener("keydown", onKeydown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
</script>

<div class="overlay hud-scope minigame-overlay" data-scene-render-cover transition:fade={{ duration: 150 }}>
  <!-- 工作小游戏统一强制全屏，避免旧版 localStorage 的关闭状态把新布局压回小卡片。 -->
  <div class="mg-card fs" role="dialog" aria-modal="true" aria-label={`${payload?.title ?? "小游戏"} · 迷你挑战`} tabindex="-1" bind:this={card} class:wide={cfg?.type === "delivery" || cfg?.type === "restaurant"} class:restaurant={cfg?.type === "restaurant"} class:restaurant-theme={cfg?.type === "restaurant"} class:checkout={cfg?.type === "checkout"} class:factory={cfg?.type === "factory"} class:delivery={cfg?.type === "delivery"} class:arcade={cfg?.type === "sequence" || cfg?.type === "rhythm" || cfg?.type === "whack"}>
    <div class="mg-head" class:restaurant-heading={cfg?.type === "restaurant"}>
      <div class="mg-title">{#if cfg?.type !== "rhythm"}<span class="gi-emoji" style="font-size:24px;line-height:1">{payload?.icon}</span>{/if} {payload?.title} · {cfg?.type === "delivery" && activeSession?.deliveryTimeLimitSec === 120 ? "加班挑战" : cfg?.type === "restaurant" && cfg.stall ? "摆摊营业" : "迷你挑战"}</div>
      <button class="mg-close" onclick={skip} title={payload?.sessionId ? "暂停工作" : endChallengeLabel} aria-label={payload?.sessionId ? "暂停工作" : endChallengeLabel}>✕</button>
    </div>
    {#if activeSession?.canSkip}
      <button class="mg-mastery-skip" onclick={skipMastered}>可选：跳过小游戏 · 工资 80%</button>
    {/if}

    <!-- v1.3b3-fix2 全屏适配：舞台容器负责居中撑满，避免引擎各自局促 -->
    <div class="mg-stage fs">
      {#if payload?.sessionId && activeSession?.status === "paused"}
        <div class="mg-pause" role="status">
          <h2>工作已暂停</h2>
          <p>{cfg?.type === "delivery" ? "车辆位置、取送清单、剩余时间和本班收入已保留，继续后从当前位置接着跑单。" : cfg?.type === "factory" ? "当前工序、已完成件数和剩余时间已保留，继续后从当前工位接着操作。" : cfg?.type === "restaurant" ? "顾客酒单、原料、耐心和制作动作已保留，继续后接着完成当前订单。" : cfg?.type === "rhythm"&&cfg.activity === "singing" ? "音符、乐句位置、得分与连击已保留，继续后从暂停的位置接着演唱。" : "本班次和小游戏随机种子已保留。继续会从同一挑战重新开始；完成挑战后才会结算工资。"}</p>
          {#if saveFailed || (shouldCheckpointGameSession() && autoSaveStatus.status === "failed")}
            <p class="mg-pause-error" role="alert">{autoSaveStatus.error || "本班进度尚未保存。你可以重试保存，或放弃未保存进度退出。"}</p>
          {/if}
          <div class="mg-pause-actions">
            <button class="mg-pause-primary" onclick={resume} disabled={ending || saving}>继续本班</button>
            <button onclick={saveAndExit} disabled={saving || ending}>{saving ? "保存中…" : "保存并返回菜单"}</button>
            <button class="mg-end-shift" onclick={endShift} disabled={saving || ending}>{ending ? '正在核对订单…' : `提前结束（${cfg?.type==='delivery'&&(cfg.mode==='rideshare'||cfg.actualIncome)?'只结算已完成订单，不领完班底薪':'本班无工资'}）`}</button>
            {#if saveFailed || (shouldCheckpointGameSession() && autoSaveStatus.status === "failed")}
              <button class="mg-pause-danger" onclick={abandonWithoutSaving}>放弃未保存进度并退出</button>
            {/if}
          </div>
        </div>
      {/if}
      {#if activeSession?.status !== "paused" || cfg?.type === "delivery" || cfg?.type === "factory" || cfg?.type === "restaurant" || cfg?.type === "rhythm"&&cfg.activity === "singing"}
      <MiniGameHost
        bind:this={minigameHost}
        cfg={cfg}
        seed={payload?.seed}
        paused={backgroundPaused || activeSession?.status === "paused"}
        initialProgress={restorableProgress}
        onProgress={saveProgress}
        onPause={pause}
        onFinish={finish}
        onIncident={trafficIncident}
        onSkip={skip}
        onOvertime={onOvertime}
        onStallResult={onStallResult}
        stallStamina={gameState.player.attrs.stamina}
        stallHour={gameState.time.hour}
        {stallStartMinute}
        sceneKey={payload?.key}
      />
      {/if}
    </div>
  </div>
</div>

<style>
  @media(max-height:580px) {
    .mg-card.fs.delivery,.mg-card.fs.factory{padding:6px 8px;gap:6px;}
    .mg-card.delivery .mg-head,.mg-card.factory .mg-head{min-height:28px;margin:0;}
    .mg-card.fs.delivery .mg-title,.mg-card.fs.factory .mg-title{font-size:13px;}
    .mg-card.fs.delivery .mg-close,.mg-card.fs.factory .mg-close{width:var(--m-tap,44px);height:var(--m-tap,44px);min-width:var(--m-tap,44px);min-height:var(--m-tap,44px);}
    .mg-card.delivery .mg-title :global(.gi-emoji),.mg-card.factory .mg-title :global(.gi-emoji){font-size:16px!important;}
    .mg-card.delivery .mg-stage.fs,.mg-card.factory .mg-stage.fs{gap:0;overflow:hidden;}
  }
  .mg-card.fs.checkout { background:#65765e; }
  .mg-card.checkout .mg-stage.fs::before { background:none; }
  .mg-card.fs.restaurant-theme { background:radial-gradient(ellipse at top,#a5794e,#493321); }
  .mg-card.fs.restaurant-theme .mg-stage.fs::before { background:none; }
  .restaurant-heading { color:#fff1d1; }
  .restaurant-heading .mg-close { color:#fbe6c3; border-color:#b48c5b; background:#694a2f; }
  .mg-card.fs.restaurant-theme :global(.rg-ing-tab) { min-height:34px; font-size:12px; }
  .mg-card.fs.restaurant-theme :global(.rg-undo) { min-height:26px; font-size:10px; }
  .mg-mastery-skip { align-self: flex-end; padding: 8px 14px; border: 1px solid #ba9b4b; border-radius: 8px; background: #443925; color: #ffe3a0; cursor: pointer; }
  .mg-pause { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 31, .96); text-align: center; color: var(--text-main, #eef1ff); }
  .mg-pause p { max-width: 440px; }
  .mg-pause p { line-height: 1.7; }
  .mg-pause-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; }
  .mg-pause-actions button { min-height: 44px; padding: 10px 18px; border-radius: 9px; cursor: pointer; }
  .mg-pause-primary { background: var(--accent, #ffd166); color: #1a2232; font-weight: 700; }
  .mg-pause-error { color: #ffb4a9; }
  .mg-pause-danger { border: 1px solid #d77b70; background: #542f32; color: #fff0ed; }
  .overlay {
    position: fixed;
    inset: 0;
    /* v1.43.x：氛围色改走皮肤变量，5 套皮肤下都自然（原先硬编码蓝在暖色皮肤下突兀） */
    background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent-2, #6cc6ff) 13%, transparent), transparent 42%), rgba(5, 8, 16, 0.9);
    backdrop-filter: blur(14px) saturate(120%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 130;
    padding: 0;
    animation: fadeIn 0.2s ease;
  }
  .mg-card {
    box-sizing: border-box;
    width: min(96vw, 470px);
    max-height: 92vh;
    overflow-y: auto;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 90px),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 60px),
      var(--bg-card, #181d33);
    border: 1px solid color-mix(in srgb, var(--border, #2a3050) 80%, var(--accent, #ffd166) 20%);
    border-radius: 24px;
    padding: clamp(14px, 2vw, 24px);
    display: flex;
    flex-direction: column;
    gap: clamp(10px, 1.5vw, 18px);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.07) inset,
      0 24px 70px rgba(0, 0, 0, 0.65),
      0 0 0 1px rgba(255, 255, 255, 0.03);
    position: relative;
    animation: mg-in 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.12);
  }
  /* v1.3b2：地图/多栏类小游戏需要更宽的舞台 */
  .mg-card.wide {
    width: min(96vw, 760px);
  }
  /* v1.3b3 全屏模式：小游戏占满视口，完成自动退出；增强沉浸感 */
  .mg-card.fs {
    box-sizing: border-box;
    /* 使用父级舞台的百分比盒，跟随祖先 .app-zoom 后仍占满游戏视口。 */
    width: 100%;
    height: 100%;
    min-height: 100%;
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
    padding: max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
    background: radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--accent-2, #6cc6ff) 18%, transparent), transparent 42%), #101829;
    color: #f4f7ff;
    /* v1.44.5：小游戏内容必须继承设置里的 UI 缩放；反向 zoom 会把 0.7 的手游缩放重新放大，造成挤压和裁切。 */
  }
  /* v1.3b3-fix2 全屏 UI 适配：舞台容器撑满剩余空间并居中内容 */
  .mg-stage {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .mg-stage.fs {
    box-sizing: border-box;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: clamp(12px, 2vw, 24px);
    overflow: auto;
    scrollbar-width: thin;
    position: relative;
    isolation: isolate;
  }
  .mg-stage.fs::before {
    content: "";
    position: absolute;
    /* Keep decoration inside the scrollport. Negative inset adds a tiny
       horizontal scroll range on Android WebView and can make the stage drift. */
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
      radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--accent-2, #6cc6ff) 11%, transparent), transparent 52%);
    background-size: 32px 32px, 32px 32px, auto;
    border-radius: 18px;
  }
  .mg-card.restaurant .mg-stage.fs::before {
    background:
      linear-gradient(90deg, transparent 49%, rgba(255,255,255,.035) 50%, transparent 51%),
      linear-gradient(0deg, rgba(255,255,255,.025) 1px, transparent 1px),
      radial-gradient(circle at 50% 0%, rgba(205, 132, 69, .18), transparent 58%),
      #151b28;
    background-size: 80px 80px, 100% 28px, auto, auto;
  }
  .mg-card.factory .mg-stage.fs::before {
    background:
      repeating-linear-gradient(0deg, transparent 0 31px, rgba(79, 179, 191, .045) 32px),
      linear-gradient(90deg, rgba(7, 17, 29, .95), rgba(23, 50, 65, .9));
  }
  .mg-card.delivery .mg-stage.fs::before { background:none; }
  .mg-stage.fs > :global(*) {
    width: 100%;
    max-width: 100%;
  }
  .mg-stage.fs > :global(.mgh-game) {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }
  .mg-stage.fs :global(.mgh-game > *) {
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: 100%;
    overflow: auto;
  }
  /* v1.3b3-fix2 全屏 UI 放大：标题与关闭按钮适配大屏 */
  .mg-card.fs .mg-title {
    font-size: 20px;
  }
  .mg-card.fs .mg-close {
    width: 52px;
    height: 52px;
    font-size: 17px;
  }
  /* v1.3b3-fix2 全屏 UI 放大：所有引擎的按钮统一加大（触控目标 ≥48px） */
  .mg-card.fs:not(.checkout):not(.delivery):not(.factory):not(.restaurant) :global(button:not(.cell)) {
    min-height: 48px;
    font-size: max(15px, 0.95rem);
    touch-action: manipulation;
  }
  .mg-card.fs :global(.seq-btn),
  .mg-card.fs :global(.whack-hole) {
    min-height: 64px;
  }
  :global([data-game-mode="mobile"]) .mg-card,
  :global([data-game-mode="mobile"]) .mg-card.wide {
    width: min(98vw, 560px);
    padding: 14px;
  }
  :global([data-game-mode="mobile"]) .mg-card.fs {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
    padding: 14px;
  }
  /* v1.3b3 全屏时：餐饮订单面板占据更大右侧（原手机区域），清晰明了（T7） */
  :global(.mg-card.fs .rg-main) {
    grid-template-columns: 150px 1fr 320px;
  }
  :global(.mg-card.fs .rg-ticket) {
    font-size: 0.95rem;
    max-height: none;
  }
  :global(.mg-card.fs .rg-ticket-title) {
    font-size: 1.05rem;
  }
  :global(.mg-card.fs .rg) {
    width: 100%;
    min-height: min(760px, 100%);
  }
  @media (max-width: 900px) {
    :global(.mg-card.fs .rg-main) {
      grid-template-columns: minmax(90px, 150px) minmax(0, 1fr) minmax(220px, 280px);
    }
  }
  @media (max-width: 680px) {
    :global(.mg-card.fs .rg-main) {
      grid-template-columns: 1fr;
      min-height: 0;
    }
    :global(.mg-card.fs .rg-queue) {
      flex-direction: row;
      max-height: 84px;
      overflow-x: auto;
      overflow-y: hidden;
    }
    :global(.mg-card.fs .rg-cust) { min-width: 118px; }
  }
  @keyframes mg-in {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  .mg-card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 18px;
    right: 18px;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: linear-gradient(90deg, var(--accent-2, #6cc6ff), var(--accent, #ffd166));
    opacity: 0.85;
  }
  .mg-card:focus { outline: 2px solid color-mix(in srgb, var(--accent, #ffd166) 65%, transparent); outline-offset: -4px; }
  .mg-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    /* v1.43.x：标题条加磨砂底与发丝分割线，头部与舞台分层更自然 */
    padding: 2px 2px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border, #2a3050) 55%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent, #ffd166) 4%, transparent), transparent);
  }
  .mg-title {
    font-size: 15px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* v1.3b2 UI 美化：标题装饰圆点 */
  .mg-title::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent, #ffd166), var(--accent-2, #6cc6ff));
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent, #ffd166) 60%, transparent);
    flex: none;
  }
  .mg-close {
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 14px;
    color: var(--text-dim, #9aa3c7);
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .mg-close:hover {
    background: rgba(255, 107, 107, 0.28);
    color: #fff;
    transform: rotate(90deg);
  }
  .mg-close:active { transform: scale(0.9) rotate(90deg); }
  @media (max-width: 640px) {
    .overlay { padding: 0; }
    .mg-card, .mg-card.wide, .mg-card.fs {
      width: 100%;
      max-width: none;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }
    .mg-card:not(.fs) { padding: 14px; }
  }
  /* v1.43.x 触感统一：引擎按钮补齐悬停提亮 / 按压回弹 / 聚焦描边。
     整条用 :where 保持零优先级，引擎自己写过的样式永远赢，这里只补空白。 */
  :where(.mg-card.fs) :global(:where(button:not(.mg-close))) {
    transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.15s ease;
  }
  :where(.mg-card.fs) :global(:where(button:not(.mg-close):hover)) {
    filter: brightness(1.07);
  }
  :where(.mg-card.fs) :global(:where(button:not(.mg-close):active)) {
    transform: scale(0.97);
  }
  :where(.mg-card.fs) :global(:where(button:not(.mg-close):focus-visible)) {
    outline: 2px solid color-mix(in srgb, var(--accent, #ffd166) 70%, transparent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .mg-card, .mg-close { animation: none !important; transition: none !important; }
  }
  @media(max-height:580px) and (orientation:landscape){
    .mg-card.fs{gap:4px;padding-top:max(4px,env(safe-area-inset-top));padding-bottom:max(4px,env(safe-area-inset-bottom))}
    .mg-card.fs .mg-head{padding:0;min-height:44px}
    .mg-card.fs .mg-title{font-size:14px}
    .mg-card.fs .mg-close{width:44px;height:44px;min-width:44px;min-height:44px}
  }
</style>
