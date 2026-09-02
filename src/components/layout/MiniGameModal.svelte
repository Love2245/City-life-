<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showResult, showToast } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { applyMiniGameReward, gradeOf, GRADE_LABEL, isAmusementGame, applyAmusementPrize } from "../../game/core/minigame";
  import { workDialogue } from "../../game/core/workDialogue";
  import { playSound } from "../../lib/audio";
  import { advanceHours } from "../../game/core/time";
  import { recordMoney } from "../../game/core/weekly";
  import { pushLog } from "../../game/engine";
  import { addItem, getItem } from "../../game/core/items";
  import { rollBlindBox } from "../../game/core/actions";
  import { chance } from "../../game/rng";
  import { gameDay } from "../../game/core/calendar";
  import MiniGameHost from "./MiniGameHost.svelte";

  const payload = uiState.minigamePayload;
  const cfg = payload?.config;

  let finished = false;
  /** v1.3b2 餐饮类加班日：服务 8-10 人，工资基数 ×1.5 */
  let overtime = false;
  /** v1.3b2 摆摊：本局实际服务人数（多劳多得） */
  let stallServed = 0;
  /** v1.3b2 便利店：本次下班 33% 概率免费盲盒（每天限一次，防刷） */
  const CONVENIENCE_JOBS = new Set(["job_convenience_day", "job_convenience_clerk"]);

  function onOvertime(v: boolean): void {
    overtime = v;
  }
  function onStallResult(served: number): void {
    stallServed = served;
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
  function finish(scoreRatio: number): void {
    if (finished) return;
    finished = true;
    if (payload && cfg) {
      // v1.3b2 摆摊：多劳多得，按服务人数直接发钱 + 扣体力 + 经过时间（不走工资加成）
      if (cfg.type === "restaurant" && cfg.stall) {        const perCust = cfg.stallPerCustomerPay ?? 0;
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
    maybeFreeBlindBox();
    // 弹回结算窗（其关闭时再弹随机事件，保持原链路）
    uiState.modal = null;
    const pending = uiState.resultPayload;
    uiState.resultPayload = null;
    if (pending) showResult(pending);
  }

  /** 跳过（视为 0 分，不卡流程） */
  function skip(): void {
    finish(0);
  }
</script>

<div class="overlay hud-scope" transition:fade={{ duration: 150 }}>
  <!-- 工作小游戏统一强制全屏，避免旧版 localStorage 的关闭状态把新布局压回小卡片。 -->
  <div class="mg-card fs" class:wide={cfg?.type === "delivery" || cfg?.type === "restaurant"} class:restaurant={cfg?.type === "restaurant"} class:factory={cfg?.type === "factory"} class:delivery={cfg?.type === "delivery"} class:arcade={cfg?.type === "sequence" || cfg?.type === "rhythm" || cfg?.type === "whack"} onclick={(e) => e.stopPropagation()}>
    <div class="mg-head">
      <div class="mg-title"><span class="gi-emoji" style="font-size:24px;line-height:1">{payload?.icon}</span> {payload?.title} · {cfg?.type === "restaurant" && cfg.stall ? "摆摊营业" : "迷你挑战"}</div>
      <button class="mg-close" onclick={skip} title="跳过">✕</button>
    </div>

    <!-- v1.3b3-fix2 全屏适配：舞台容器负责居中撑满，避免引擎各自局促 -->
    <div class="mg-stage fs">
      <MiniGameHost
        {cfg}
        onFinish={finish}
        onSkip={skip}
        onOvertime={onOvertime}
        onStallResult={onStallResult}
        stallStamina={gameState.player.attrs.stamina}
        stallHour={gameState.time.hour}
      />
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, rgba(70, 110, 180, 0.18), transparent 42%), rgba(5, 8, 16, 0.84);
    backdrop-filter: blur(14px) saturate(120%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 130;
    padding: clamp(8px, 2vw, 24px);
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
    width: 100vw;
    height: 100dvh;
    min-height: 100vh;
    max-width: 100vw;
    max-height: 100dvh;
    border-radius: 0;
    padding: clamp(14px, 2vw, 32px);
    background: radial-gradient(circle at 50% -10%, rgba(67, 132, 220, 0.22), transparent 42%), #0b1222;
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
    inset: -2px;
    z-index: -1;
    pointer-events: none;
    background:
      linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
      radial-gradient(circle at 50% 40%, rgba(83, 151, 232, .12), transparent 52%);
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
  .mg-card.delivery .mg-stage.fs::before {
    background:
      linear-gradient(115deg, transparent 0 42%, rgba(255,255,255,.08) 43% 44%, transparent 45%),
      radial-gradient(circle at 25% 30%, rgba(65, 170, 181, .2), transparent 32%),
      #101b29;
  }
  .mg-stage.fs > :global(*) {
    width: 100%;
    max-width: min(1180px, 100%);
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
  .mg-card.fs :global(button) {
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
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
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
  .mg-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
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
      width: 100vw;
      max-width: none;
      height: 100dvh;
      max-height: 100dvh;
      border-radius: 0;
    }
    .mg-card:not(.fs) { padding: 14px; }
  }
</style>
