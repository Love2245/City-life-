<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, toggleQuestPanel, showToast, presentJobResult } from "../../stores/uiStore.svelte";
  import { activeQuests, lateness, locationName, formatDuration, isRestDayFor } from "../../game/core/quests";
  import { workQuestJob, getJobDef } from "../../game/core/jobs";
  import { getMiniGameConfig } from "../../game/core/minigame";
  import { moveTo, getLocation, travelHours, travelLabel } from "../../game/core/actions";
  import { rollEvent } from "../../game/core/events";
  import {
    callFamily,
    callFriend,
    playGame,
    studyOnline,
    replySms,
    unreadSmsCount,
    type PhoneResult,
  } from "../../game/core/phone";
  import { callContact, smsContact, CONTACT_GROUP_LABEL } from "../../game/core/contacts";
  import { FATIGUE_WARN_THRESHOLD } from "../../game/core/fatigue";
  import { getFamily } from "../../game/core/families";
  import { playSound } from "../../lib/audio";
  import { formatTime } from "../../game/core/time";
  import { formatMoney } from "../../lib/format";
  import type { Quest, SmsMessage, ContactRelation } from "../../game/types";
  import { activeStoryCards, remitToFamily, currentArc } from "../../game/core/story";
  import {
    storyStageHint,
    storyGoalProgress,
    storyGoalDesc,
    storyNextDrawIn,
    storyDeadlineLeft,
    storyStageName,
    arcGoalGap,
  } from "../../game/core/story";
  import { gameDay } from "../../game/core/calendar";

  /**
   * v0.91 修复2（方案B）：手机与任务栏融合。
   * 右侧栏变成一部"手机"，任务栏改为手机内的待办事项（To-Do）App，
   * 与通信/游戏/学习/招聘并列展示在手机桌面上。
   */

  /** 手机内当前打开的 App */
  type PhoneApp = "home" | "todo" | "comm" | "game" | "study";
  let app = $state<PhoneApp>("todo");
  let phoneResult = $state<PhoneResult | null>(null);
  /** v0.975 通信应用：通话/短信/联系人 tab + 当前打开的短信 */
  let commTab = $state<"call" | "sms" | "contacts">("call");
  let smsOpen = $state<SmsMessage | null>(null);
  const unreadSms = $derived(unreadSmsCount(gameState));

  /** v0.978 联系人分组 */
  const RELATION_ORDER: ContactRelation[] = [
    "parent",
    "leader",
    "manager",
    "mentor",
    "employee",
    "customer",
    "friend",
    "special",
  ];
  const contactGroups = $derived(
    RELATION_ORDER.map((rel) => ({
      rel,
      label: CONTACT_GROUP_LABEL[rel],
      items: gameState.contacts.filter((c) => c.relation === rel),
    })).filter((g) => g.items.length > 0),
  );

  /** v0.975：今天是否为在职岗位休息日（用于待办空态提示） */
  const todayIsRest = $derived.by(() => {
    const jid = gameState.career.jobId;
    if (!jid) return false;
    const job = getJobDef(jid);
    return job ? isRestDayFor(job, gameState.time) : false;
  });

  const quests = $derived(activeQuests(gameState));
  const pendingCount = $derived(quests.filter((q) => q.status === "pending").length);
  const family = $derived(getFamily(gameState.family));

  /** v1.0 剧情模式：人情债（意外卡）清单 */
  const storyCards = $derived(activeStoryCards(gameState));
  const storyArc = $derived(currentArc(gameState));
  const gamblerActive = $derived(
    !!gameState.story.activeCards.find((a) => a.cardId === "neutral_gambler_arrives" && a.status === "active"),
  );
  const storyConscience = $derived(gameState.story.conscience);
  const storyMoneyArc = $derived(!!storyArc && storyArc.goalTotal > 0);
  // v1.01 剧情引导：目标统一进度 / 描述 / 阶段提示 / 抽卡倒计时 / 硬期限
  const storyGoalPct = $derived(storyGoalProgress(gameState));
  const storyGoalTxt = $derived(storyGoalDesc(gameState));
  const storyHint = $derived(storyStageHint(gameState));
  const storyNext = $derived(storyNextDrawIn(gameState));
  const storyDeadline = $derived(storyDeadlineLeft(gameState));
  const storyStage = $derived(storyStageName(gameState));
  const storyFailed = $derived(gameState.story.failedObligations);
  const storyGoalGap = $derived(arcGoalGap(gameState));

  /** 当前时刻（分钟精度），用于倒计时响应式重算 */
  const nowHour = $derived(gameState.time.hour + gameState.time.minute / 60);

  type Urgency = "normal" | "warn" | "urgent" | "over" | "done" | "failed";

  function urgencyOf(q: Quest): Urgency {
    if (q.status === "done") return "done";
    if (q.status === "failed" || q.status === "missed") return "failed";
    if (q.startHour === undefined) return "normal";
    const late = lateness(gameState, q);
    if (late > 2) return "over";
    if (late > 0) return "urgent";
    const remain = (((q.startHour - nowHour) % 24) + 24) % 24;
    return remain <= 1 ? "warn" : "normal";
  }

  function countdownText(q: Quest): string {
    if (q.status === "done") return "✅ 已完成";
    if (q.status === "failed") return "❌ 旷工";
    if (q.status === "missed") return "⏳ 已过期";
    if (q.startHour === undefined) return "🕐 时间自由，随时可做";
    const late = lateness(gameState, q);
    if (late > 2) return `⛔ 已旷工（迟 ${formatDuration(late)}）`;
    if (late > 0) return `🔥 已迟到 ${formatDuration(late)}`;
    const remain = (((q.startHour - nowHour) % 24) + 24) % 24;
    if (remain <= 1) return `⚠️ 快迟到了！还有 ${formatDuration(remain)}`;
    return `还有 ${formatDuration(remain)} 开工`;
  }

  /** 卡片上的行动按钮文案：需要先走过去时提示耗时 */
  function actionText(q: Quest): string {
    if (!q.locationId || gameState.locationId === q.locationId) return "▶ 开工";
    const loc = getLocation(q.locationId);
    return `🚶 前往（${travelLabel(travelHours(gameState, loc))}）`;
  }

  function doQuest(q: Quest): void {
    if (q.status !== "pending") return;
    // v0.91：体力 < 20 提示休息（不阻断）
    if (gameState.player.attrs.stamina < FATIGUE_WARN_THRESHOLD && gameState.player.attrs.stamina > 0) {
      showToast("😮‍💨 很累了，需要休息一下");
    }
    // 不在岗位地点 → 先走过去（耗通行时间，可能因此迟到）
    if (q.locationId && gameState.locationId !== q.locationId) {
      const mv = moveTo(gameState, q.locationId);
      if (!mv.ok) {
        showToast(mv.reason ?? "过不去");
        return;
      }
      playSound("walk");
      const late = lateness(gameState, q);
      if (late > 0) showToast(`赶到时已经迟了 ${formatDuration(late)}`);
      return; // 到了地方先让玩家看一眼场景，再点一次开工
    }
    const r = workQuestJob(gameState, q);
    if (r.ok && r.result) {
      const ev = rollEvent(gameState);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 工作小游戏
      const job = getJobDef(q.jobId ?? "");
      presentJobResult(r.result, getMiniGameConfig(q.jobId ?? ""), job ? { id: job.id, name: job.name, icon: job.icon } : { id: q.jobId ?? "", name: "工作", icon: "💼" });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  /** 手机内 App 操作：执行后显示结果条 */
  function runPhone(fn: () => PhoneResult, sound?: string): void {
    const r = fn();
    phoneResult = r;
    if (r.ok && sound) playSound(sound as never);
    if (!r.ok && r.reason) showToast(r.reason);
  }

  function openApp(a: PhoneApp): void {
    app = a;
    phoneResult = null;
    if (a !== "comm") {
      commTab = "call";
      smsOpen = null;
    }
  }

  /** 回复当前打开的短信 */
  function onReplySms(optionIndex: number): void {
    if (!smsOpen) return;
    const r = replySms(gameState, smsOpen.id, optionIndex);
    if (r.ok) {
      phoneResult = r;
      playSound("phone");
      smsOpen = null;
    } else if (r.reason) {
      showToast(r.reason);
    }
  }

  function toneLabel(tone: "warm" | "neutral" | "cold"): string {
    return tone === "warm" ? "暖心" : tone === "cold" ? "冷淡" : "平实";
  }

  /** 招聘 App：打开完整手机弹窗（含完整招聘页） */
  function openJobs(): void {
    uiState.modal = "phone";
  }

  /** v1.0 剧情模式：打开意外卡弹窗 */
  function openStoryCard(cardId: string): void {
    uiState.storyCardPayload = { cardId };
    uiState.modal = "storyCard";
  }

  /** v1.0 剧情模式：寄钱回家（转入目标资金） */
  function remit(amount: number): void {
    const r = remitToFamily(gameState, amount);
    if (!r.ok) showToast(r.reason ?? "寄不了");
    else showToast(`💌 已寄出 ${amount} 元`);
  }

  /* ==================== v1.12 手机面板滑入隐藏（两模式） ==================== */
  let dragActive = false;
  let dragStartX = 0;

  /**
   * 按住手机向右滑动 → 收起（露出约 20% 边缘）；端游/手游均支持。
   * 热修：不在此处 setPointerCapture——capture 会把合成 click 的 target 重定向到 .phone，
   * 导致手机内所有按钮 onclick 永不触发（手机"不能用"）。仅记录起点，阈值判定后再处理。
   */
  function onPhoneDragDown(e: PointerEvent): void {
    dragActive = true;
    dragStartX = e.clientX;
  }
  function onPhoneDragMove(e: PointerEvent): void {
    if (!dragActive) return;
    // game-root 有 transform:scale(zoom)，位移需除以 zoom 换算
    const dx = (e.clientX - dragStartX) / uiState.zoom;
    if (dx > 40 && uiState.questPanelOpen) {
      dragActive = false;
      const el = e.currentTarget as HTMLElement;
      // 已决定收起：此刻才捕获，避免拖动动画期间指针丢失（不再影响普通点击）
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 捕获失败不影响收起 */
      }
      uiState.questPanelOpen = false;
    }
  }
  function onPhoneDragUp(e: PointerEvent): void {
    dragActive = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }
  /** 点击/拖拽露出的边缘 → 拉出手机 */
  function pullOut(): void {
    uiState.questPanelOpen = true;
  }
</script>

<aside class="quest-side hud-scope" class:collapsed={!uiState.questPanelOpen}>
  {#if uiState.questPanelOpen || uiState.gameMode === "mobile"}
    <!-- 手机外框（v1.10：按购买品质手机换皮肤；v1.12 手游模式常驻渲染供滑入/拉出） -->
    <div
      class="phone"
      data-phone-skin={gameState.phoneSkin ?? "default"}
      onpointerdown={onPhoneDragDown}
      onpointermove={onPhoneDragMove}
      onpointerup={onPhoneDragUp}
      onpointercancel={onPhoneDragUp}
    >
      <!-- 手机状态栏 -->
      <div class="p-statusbar">
        <span class="p-time">{formatTime(gameState.time.hour, gameState.time.minute)}</span>
        <span class="p-brand">📱</span>
        <span class="p-batt">🔋</span>
      </div>

      <!-- 手机屏幕内容 -->
      <div class="p-screen">
        {#if app === "home"}
          <!-- 手机桌面：App 网格 -->
          <div class="p-home">
            <div class="home-greeting">你好，{gameState.player.name}</div>
            <div class="apps">
              <button class="app" class:todo-badge={pendingCount > 0} onclick={() => openApp("todo")}>
                <span class="a-icon">📋</span>
                <span class="a-name">待办</span>
                {#if pendingCount > 0}<span class="a-badge">{pendingCount}</span>{/if}
              </button>
              <button class="app" class:todo-badge={unreadSms > 0} onclick={() => openApp("comm")}>
                <span class="a-icon">📱</span>
                <span class="a-name">通信</span>
                {#if unreadSms > 0}<span class="a-badge">{unreadSms}</span>{/if}
              </button>
              <button class="app" onclick={() => openApp("game")}>
                <span class="a-icon">🎮</span>
                <span class="a-name">游戏</span>
              </button>
              <button class="app" onclick={() => openApp("study")}>
                <span class="a-icon">📖</span>
                <span class="a-name">学习</span>
              </button>
              <button class="app" onclick={openJobs}>
                <span class="a-icon">💼</span>
                <span class="a-name">招聘</span>
              </button>
            </div>
            <div class="home-hint">
              <div>余额 {formatMoney(gameState.player.money)}</div>
              <div class="dim">{family?.name ?? ""}家庭</div>
            </div>
          </div>

        {:else if app === "todo"}
          <!-- 待办事项 App = 原任务栏 -->
          <div class="todo-page">
            <div class="app-head">
              <button class="back" onclick={() => openApp("home")}>‹</button>
              <span class="app-title">📋 待办事项</span>
              {#if pendingCount > 0}<span class="count">{pendingCount}</span>{/if}
            </div>
            {#if storyArc}
              <div class="story-section">
                <div class="story-head">
                  <span>📜 {storyArc.title}</span>
                  <span class="story-goal dim">{storyGoalTxt || storyArc.goal}</span>
                </div>
                <!-- v1.01：主线目标统一进度条（金钱/厨艺/证据/名声各类目标通用） -->
                {#if storyGoalTxt.length > 0}
                  <div class="story-bar">
                    <div class="story-fill" style="width:{storyGoalPct}%"></div>
                  </div>
                  <div class="story-goal-pct dim">{storyGoalPct}%</div>
                {/if}
                <!-- v1.01：五阶段进度点亮 -->
                <div class="stage-track">
                  {#each storyArc.stages as s, i}
                    <div class="stage-dot" class:done={i < gameState.story.stage} class:current={i === gameState.story.stage} title="{i + 1}. {s}"></div>
                  {/each}
                </div>
                <div class="story-meta">
                  <span>阶段 {gameState.story.stage + 1}/5 · {storyStage}</span>
                  <span class:bad={storyConscience < 0}>⚖️ 良心 {storyConscience > 0 ? "+" : ""}{storyConscience}</span>
                  {#if gamblerActive}<span class="gambler-badge">🎲 赌鬼在你这儿</span>{/if}
                </div>
                <!-- v1.01：下一步指引 + 关键倒计时 -->
                <div class="story-hint">💡 {storyHint}</div>
                {#if storyGoalGap && gameState.story.stage >= 4}
                  <div class="story-gap">⚠️ {storyGoalGap}</div>
                {/if}
                <div class="story-countdown dim">
                  <span>📬 下次来事约 {storyNext} 天后</span>
                  <span>🕰️ 硬期限剩 {storyDeadline} 天</span>
                  <span class:bad={storyFailed >= 2}>⏰ 失约 {storyFailed}/3</span>
                </div>
                {#if storyMoneyArc}
                  <div class="remit-row">
                    <span class="dim">寄钱回家</span>
                    <button class="mini-remit" onclick={() => remit(100)}>100</button>
                    <button class="mini-remit" onclick={() => remit(500)}>500</button>
                    <button class="mini-remit" onclick={() => remit(gameState.player.money)}>全部</button>
                  </div>
                {/if}
              </div>
            {/if}
            {#if storyCards.length > 0}
              <div class="story-cards">
                {#each storyCards as { act, def }}
                  {@const left = Math.max(0, act.deadlineDay - gameDay(gameState.time))}
                  <button class="story-card" class:urgent={left <= 2} onclick={() => openStoryCard(act.cardId)}>
                    <span class="sc-icon">{def.icon}</span>
                    <div class="sc-main">
                      <div class="sc-title">{def.title}</div>
                      <div class="sc-time dim">⏳ {left === 0 ? "今天必须处理" : `剩 ${left} 天`}</div>
                    </div>
                    <span class="sc-arrow">›</span>
                  </button>
                {/each}
              </div>
            {/if}
            <div class="q-list">
              {#each quests as q (q.id)}
                {@const u = urgencyOf(q)}
                <div class="q-card {u}">
                  <div class="q-top">
                    <span class="q-icon">{q.icon}</span>
                    <span class="q-title">{q.title}</span>
                  </div>

                  <div class="q-meta">
                    {#if q.locationId}<span>📍 {locationName(q.locationId)}</span>{/if}
                    {#if q.startHour !== undefined}
                      <span>🕐 {q.startHour}:00 上班{#if q.endHour !== undefined}～{q.endHour}:00{/if}</span>
                    {/if}
                  </div>

                  <div class="q-count {u}">{countdownText(q)}</div>

                  <div class="q-foot">
                    {#if q.reward}<span class="tag gain">{q.reward}</span>{/if}
                    {#if q.fine}<span class="tag cost">罚 {q.fine} 元</span>{/if}
                  </div>

                  {#if q.status === "pending"}
                    <button class="q-btn" onclick={() => doQuest(q)}>{actionText(q)}</button>
                  {/if}
                </div>
              {/each}

              {#if quests.length === 0}
                <div class="q-empty">
                  <div class="e-icon">{todayIsRest ? "📅" : "🍵"}</div>
                  <div class="e-title">{todayIsRest ? "今天休息" : "今天没有安排"}</div>
                  <div class="e-hint">
                    {#if todayIsRest}
                      今天是岗位休息日，好好享受周末吧
                    {:else}
                      去劳务市场接活，或打开招聘 App 应聘正式工作
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
            <div class="q-tip">迟到扣工资，超 2 小时算旷工</div>
          </div>

        {:else if app === "comm"}
          <div class="sub-page">
            <div class="app-head">
              <button class="back" onclick={() => openApp("home")}>‹</button>
              <span class="app-title">📱 通信</span>
            </div>
            <!-- 通话 / 短信 双 tab -->
            <div class="comm-tabs">
              <button class="comm-tab" class:active={commTab === "call"} onclick={() => { commTab = "call"; smsOpen = null; }}>
                📞 通话
              </button>
              <button class="comm-tab" class:active={commTab === "sms"} onclick={() => { commTab = "sms"; smsOpen = null; }}>
                💬 短信{#if unreadSms > 0}<span class="tab-badge">{unreadSms}</span>{/if}
              </button>
              <button class="comm-tab" class:active={commTab === "contacts"} onclick={() => { commTab = "contacts"; smsOpen = null; }}>
                👥 联系人
              </button>
            </div>

            {#if commTab === "call"}
              <button class="contact" onclick={() => runPhone(() => callFamily(gameState), "phone")}>
                <span class="c-icon">👨‍👩‍👧</span>
                <div>
                  <div class="c-name">家人（{family?.name ?? ""}）</div>
                  <div class="c-desc dim">聊聊家常，问问近况</div>
                </div>
              </button>
              <button class="contact" onclick={() => runPhone(() => callFriend(gameState), "phone")}>
                <span class="c-icon">🧑‍🤝‍🧑</span>
                <div>
                  <div class="c-name">朋友</div>
                  <div class="c-desc dim">找个能说话的人</div>
                </div>
              </button>
            {:else if commTab === "contacts"}
              {#if gameState.contacts.length === 0}
                <p class="dim center-hint">还没有联系人，多在公园、图书馆、咖啡厅、便利店走走，或许能结识一些人。</p>
              {:else}
                {#each contactGroups as g}
                  <div class="ct-group">
                    <div class="group-label">{g.label}</div>
                    {#each g.items as c}
                      <div class="ct-card">
                        <span class="c-icon">{c.avatar}</span>
                        <div class="c-main">
                          <div class="c-name">{c.name}<span class="c-title dim"> · {c.title}</span></div>
                          <div class="c-desc dim">{c.intro}</div>
                          {#if c.referralJob}
                            {@const rj = getJobDef(c.referralJob)}
                            <div class="referral-badge">🤝 内推：{rj?.name ?? c.referralJob}（免证书）</div>
                          {/if}
                          {#if c.tutorial}
                            <div class="referral-badge tut">📚 定期关切：教程 / 手稿 / 窍门</div>
                          {/if}
                        </div>
                        <div class="c-actions">
                          {#if c.canCall}
                            <button class="mini-btn" title="打电话" onclick={() => runPhone(() => callContact(gameState, c.id), "phone")}>📞</button>
                          {/if}
                          {#if c.canSms}
                            <!-- v0.99 修复：💬 真正发出一条问候（原只跳转收件箱翻旧消息） -->
                            <button class="mini-btn" title="发短信" onclick={() => runPhone(() => smsContact(gameState, c.id), "phone")}>💬</button>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/each}
              {/if}
            {:else}
              {#if smsOpen}
                <button class="back small" onclick={() => (smsOpen = null)}>← 收件箱</button>
                <div class="msg-card">
                  <div class="msg-from">{smsOpen.senderIcon} {smsOpen.sender}</div>
                  <p class="msg-text">{smsOpen.text}</p>
                  {#if smsOpen.replied && smsOpen.replyText}
                    <p class="msg-replied">你已回复：{smsOpen.replyText}</p>
                  {:else}
                    <div class="reply-list">
                      {#each smsOpen.options as opt, i}
                        <button class="reply-opt tone-{opt.tone}" onclick={() => onReplySms(i)}>
                          <span class="r-tone">{toneLabel(opt.tone)}</span>
                          <span class="r-label">{opt.label}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else if gameState.smsInbox.length > 0}
                <div class="sms-list">
                  {#each [...gameState.smsInbox].reverse() as m}
                    <button class="sms-item" class:unread={!m.replied} onclick={() => (smsOpen = m)}>
                      <span class="c-icon">{m.senderIcon}</span>
                      <div class="sms-body">
                        <div class="sms-head">
                          <span class="c-name">{m.sender}</span>
                          {#if !m.replied}<span class="sms-new">新</span>{/if}
                        </div>
                        <div class="sms-preview dim">{m.replied ? (m.replyText ?? "已读") : m.text}</div>
                      </div>
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="dim center-hint">收件箱空空如也，想家了就打个电话吧。</p>
              {/if}
            {/if}
          </div>

        {:else if app === "game"}
          <div class="sub-page">
            <div class="app-head">
              <button class="back" onclick={() => openApp("home")}>‹</button>
              <span class="app-title">🎮 游戏</span>
            </div>
            <button class="big-action" onclick={() => runPhone(() => playGame(gameState), "game")}>
              玩一小时小游戏<br />
              <span class="dim">+心情 · 解压 · 1 小时</span>
            </button>
          </div>

        {:else if app === "study"}
          <div class="sub-page">
            <div class="app-head">
              <button class="back" onclick={() => openApp("home")}>‹</button>
              <span class="app-title">📖 学习</span>
            </div>
            <button class="big-action" onclick={() => runPhone(() => studyOnline(gameState), "study")}>
              学一小时网课<br />
              <span class="dim">+智力 {gameState.flags["item_laptop"] ? "4（笔记本 ×2）" : "2"} · -3 元</span>
            </button>
          </div>
        {/if}

        <!-- 手机内操作结果 -->
        {#if phoneResult}
          <div class="result-bar">
            {phoneResult.text}
            {#if phoneResult.deltas && phoneResult.deltas.length > 0}
              <div class="r-deltas">
                {#each phoneResult.deltas as d}
                  <span class="tag {d.value > 0 ? "gain" : "cost"}">
                    {d.label} {d.value > 0 ? "+" : ""}{d.value}
                  </span>
                {/each}
              </div>
            {/if}
            <button class="r-ok" onclick={() => (phoneResult = null)}>知道了</button>
          </div>
        {/if}
      </div>

      <!-- 手机底部导航 -->
      <div class="p-dock">
        <button class="dock-btn" class:on={app === "home"} onclick={() => openApp("home")}>🏠</button>
        <button class="dock-btn" class:on={app === "todo"} onclick={() => openApp("todo")}>
          📋{#if pendingCount > 0}<span class="dock-badge">{pendingCount}</span>{/if}
        </button>
        <button class="dock-btn" class:on={app === "comm"} onclick={() => openApp("comm")}>
          📱{#if unreadSms > 0}<span class="dock-badge">{unreadSms}</span>{/if}
        </button>
        <button class="dock-btn" class:on={app === "game"} onclick={() => openApp("game")}>🎮</button>
        <button class="dock-btn" onclick={openJobs}>💼</button>
      </div>
    </div>
    <!-- v1.12 手游模式：收起时露出的边缘把手（点击/拖拽拉出） -->
    <div
      class="mobile-handle"
      class:visible={!uiState.questPanelOpen && uiState.gameMode === "mobile"}
      onpointerdown={pullOut}
      title="拉出手机"
    >📱</div>
  {:else}
    <!-- 折叠态：整块可点展开按钮（v0.89 修复，端游模式） -->
    <button class="collapse-btn-wide" onclick={toggleQuestPanel} title="展开手机">
      📱
    </button>
  {/if}
</aside>

<style>
  .quest-side {
    width: 250px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    border-left: 1px solid var(--border);
    overflow: hidden;
    transition: width 0.18s ease;
    padding: 8px 6px 8px 6px;
  }
  .quest-side.collapsed {
    width: 44px;
    min-width: 44px;
    padding: 6px;
    align-items: stretch;
  }
  .collapse-btn-wide {
    width: 100%;
    height: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    cursor: pointer;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .collapse-btn-wide:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  /* v1.12 手游模式：收起时露出的边缘把手（默认隐藏，收起态显示在容器左侧） */
  .mobile-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 56px;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    background: linear-gradient(90deg, rgba(91, 140, 255, 0.25), transparent);
    border-radius: 0 10px 10px 0;
    z-index: 10;
  }
  .mobile-handle.visible {
    display: flex;
  }

  /* ===== 手机外框 ===== */
  .phone {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #141824;
    border-radius: 18px;
    border: 2px solid #2a3040;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .p-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px 4px;
    font-size: 11px;
    color: #cdd6ee;
    background: rgba(255, 255, 255, 0.04);
  }
  .p-time {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .p-batt {
    font-size: 10px;
  }
  .p-screen {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: linear-gradient(160deg, #1e2536, #151a28);
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* ===== v1.10 手机皮肤：rice 简约灰 / flower 粉彩 / fruit 深色科技 ===== */
  .phone[data-phone-skin="rice"] {
    background: #20242b;
    border-color: #9aa4b2;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .phone[data-phone-skin="rice"] .p-statusbar {
    color: #e8ebf0;
    background: rgba(0, 0, 0, 0.15);
  }
  .phone[data-phone-skin="rice"] .p-screen {
    background: linear-gradient(160deg, #eceff3, #d7dce2);
  }
  .phone[data-phone-skin="rice"] .p-screen :global(.p-home),
  .phone[data-phone-skin="rice"] .p-screen :global(.app-name),
  .phone[data-phone-skin="rice"] .p-screen :global(.home-greeting),
  .phone[data-phone-skin="rice"] .p-screen :global(.home-hint),
  .phone[data-phone-skin="rice"] .p-screen :global(.a-name) {
    color: #2a2f36;
  }
  .phone[data-phone-skin="rice"] .p-screen :global(.app) {
    background: rgba(255, 255, 255, 0.75);
  }

  .phone[data-phone-skin="flower"] {
    background: #3a2333;
    border-color: #e8a0c0;
    box-shadow: 0 8px 24px rgba(232, 160, 192, 0.3);
  }
  .phone[data-phone-skin="flower"] .p-statusbar {
    color: #fff0f6;
    background: rgba(232, 160, 192, 0.2);
  }
  .phone[data-phone-skin="flower"] .p-screen {
    background: linear-gradient(160deg, #fde3ee, #f8cfe2);
  }
  .phone[data-phone-skin="flower"] .p-screen :global(.p-home),
  .phone[data-phone-skin="flower"] .p-screen :global(.home-greeting),
  .phone[data-phone-skin="flower"] .p-screen :global(.home-hint),
  .phone[data-phone-skin="flower"] .p-screen :global(.a-name) {
    color: #5c3040;
  }
  .phone[data-phone-skin="flower"] .p-screen :global(.app) {
    background: rgba(255, 255, 255, 0.7);
  }

  .phone[data-phone-skin="fruit"] {
    background: #0d1117;
    border-color: #58a6ff;
    box-shadow: 0 8px 28px rgba(88, 166, 255, 0.35);
  }
  .phone[data-phone-skin="fruit"] .p-statusbar {
    color: #9ecbff;
    background: rgba(88, 166, 255, 0.12);
  }
  .phone[data-phone-skin="fruit"] .p-screen {
    background: linear-gradient(165deg, #0f1b2e, #101828);
  }
  .phone[data-phone-skin="fruit"] .p-screen :global(.app) {
    background: rgba(88, 166, 255, 0.12);
  }
  .phone[data-phone-skin="fruit"] .p-screen :global(.a-name),
  .phone[data-phone-skin="fruit"] .p-screen :global(.home-greeting),
  .phone[data-phone-skin="fruit"] .p-screen :global(.home-hint) {
    color: #dcebff;
  }
  .phone[data-phone-skin="fruit"] .p-statusbar :global(.p-brand) {
    color: #58a6ff;
  }
  .p-dock {
    display: flex;
    gap: 2px;
    padding: 5px 6px;
    background: rgba(255, 255, 255, 0.05);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .dock-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    border-radius: 8px;
    font-size: 17px;
    position: relative;
    color: var(--text-dim);
    cursor: pointer;
  }
  .dock-btn.on {
    background: rgba(255, 209, 102, 0.18);
  }
  .dock-badge {
    position: absolute;
    top: -2px;
    right: 2px;
    min-width: 15px;
    height: 15px;
    line-height: 15px;
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    border-radius: 999px;
    background: var(--accent, #ffd166);
    color: #1a1a1a;
  }

  /* ===== 手机桌面 ===== */
  .p-home {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .home-greeting {
    font-size: 12px;
    color: var(--text-dim);
    text-align: center;
    margin: 6px 0 12px;
  }
  .apps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .app {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 12px 4px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
    color: #eef1ff;
    cursor: pointer;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .app:active {
    background: rgba(255, 209, 102, 0.15);
  }
  .a-icon {
    font-size: 22px;
  }
  .a-name {
    font-size: 11.5px;
    font-weight: 600;
  }
  .a-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    text-align: center;
    font-size: 9.5px;
    font-weight: 700;
    border-radius: 999px;
    background: var(--accent, #ffd166);
    color: #1a1a1a;
  }
  .home-hint {
    margin-top: auto;
    text-align: center;
    font-size: 11px;
    color: var(--text-dim);
    padding: 10px 0 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ===== App 页通用 ===== */
  .todo-page,
  .sub-page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    gap: 8px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .app-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .back {
    font-size: 18px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 0 4px;
    cursor: pointer;
    line-height: 1;
  }
  .app-title {
    font-size: 13px;
    font-weight: 700;
    color: #eef1ff;
  }
  .count {
    font-size: 10.5px;
    font-weight: 700;
    min-width: 17px;
    height: 17px;
    line-height: 17px;
    text-align: center;
    border-radius: 999px;
    background: var(--accent, #ffd166);
    color: #1a1a1a;
  }
  .q-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 0;
  }
  .q-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 9px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-2, #6cc6ff);
  }
  .q-card.warn {
    border-left-color: var(--warn, #ffb347);
    background: rgba(255, 179, 71, 0.07);
  }
  .q-card.urgent {
    border-left-color: var(--danger, #ff6b6b);
    background: rgba(255, 107, 107, 0.09);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .q-card.over,
  .q-card.failed {
    opacity: 0.5;
    border-left-color: var(--text-dim, #888);
  }
  .q-card.done {
    opacity: 0.6;
    border-left-color: var(--ok, #6ee7a8);
  }
  .q-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .q-icon {
    font-size: 15px;
  }
  .q-title {
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.25;
    color: #eef1ff;
  }
  .q-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10.5px;
    color: var(--text-dim, rgba(255, 255, 255, 0.62));
  }
  .q-count {
    font-size: 11px;
    font-weight: 600;
  }
  .q-count.warn {
    color: var(--warn, #ffb347);
  }
  .q-count.urgent,
  .q-count.over {
    color: var(--danger, #ff6b6b);
  }
  .q-count.done {
    color: var(--ok, #6ee7a8);
  }
  .q-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .q-btn {
    margin-top: 2px;
    padding: 6px 8px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 8px;
    border: 1px solid var(--accent, #ffd166);
    background: rgba(255, 209, 102, 0.12);
    color: var(--accent, #ffd166);
    cursor: pointer;
  }
  .q-btn:hover {
    background: rgba(255, 209, 102, 0.24);
  }
  .q-empty {
    text-align: center;
    padding: 24px 10px;
    color: var(--text-dim, rgba(255, 255, 255, 0.55));
  }
  .e-icon {
    font-size: 24px;
    margin-bottom: 6px;
  }
  .e-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    color: #eef1ff;
  }
  .e-hint {
    font-size: 10.5px;
    line-height: 1.5;
  }
  .q-tip {
    flex-shrink: 0;
    padding: 6px 8px;
    font-size: 10px;
    color: var(--text-dim, rgba(255, 255, 255, 0.45));
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    text-align: center;
  }

  /* ===== v1.0 剧情模式：人情债 ===== */
  .story-section {
    background: rgba(91, 140, 255, 0.08);
    border: 1px solid rgba(91, 140, 255, 0.25);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
  }
  .story-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12.5px;
    font-weight: 800;
    color: var(--accent, #5b8cff);
  }
  .story-goal {
    font-size: 10.5px;
    font-weight: 600;
  }
  .story-bar {
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
    position: relative;
  }
  .story-fill {
    height: 100%;
    background: linear-gradient(90deg, #5b8cff, #d9b3ff);
    transition: width 0.3s ease;
  }
  .story-goal-pct {
    font-size: 10px;
    text-align: right;
    margin-top: -3px;
  }
  /* v1.01：五阶段进度点亮 */
  .stage-track {
    display: flex;
    gap: 4px;
  }
  .stage-dot {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
  }
  .stage-dot.done {
    background: var(--accent, #5b8cff);
  }
  .stage-dot.current {
    background: #ffd166;
    box-shadow: 0 0 6px rgba(255, 209, 102, 0.4);
  }
  .story-hint {
    font-size: 10.5px;
    line-height: 1.5;
    color: #ffe6a8;
    background: rgba(255, 209, 102, 0.1);
    border-left: 2px solid var(--accent, #ffd166);
    border-radius: 4px;
    padding: 4px 6px;
  }
  .story-gap {
    font-size: 10.5px;
    line-height: 1.5;
    color: #ff8a8a;
    background: rgba(255, 100, 100, 0.1);
    border-left: 2px solid #ff6b6b;
    border-radius: 4px;
    padding: 4px 6px;
  }
  .story-countdown {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    flex-wrap: wrap;
  }
  .story-countdown .bad {
    color: #ff6b6b;
    font-weight: 800;
  }
  .story-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    flex-wrap: wrap;
  }
  .story-meta .bad {
    color: #ff6b6b;
    font-weight: 800;
  }
  .gambler-badge {
    color: #ffc46a;
    background: rgba(255, 179, 71, 0.14);
    border: 1px solid rgba(255, 179, 71, 0.35);
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10px;
  }
  .remit-row {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
  }
  .mini-remit {
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(123, 216, 143, 0.13);
    border: 1px solid rgba(123, 216, 143, 0.35);
    color: var(--ok, #7bd88f);
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .story-cards {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
  }
  .story-card {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 7px 9px;
    border-radius: 9px;
    background: rgba(255, 179, 71, 0.07);
    border: 1px solid rgba(255, 179, 71, 0.28);
    color: #eef1ff;
    cursor: pointer;
  }
  .story-card.urgent {
    background: rgba(255, 107, 107, 0.1);
    border-color: rgba(255, 107, 107, 0.45);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .sc-icon {
    font-size: 16px;
  }
  .sc-main {
    flex: 1;
    min-width: 0;
  }
  .sc-title {
    font-size: 12px;
    font-weight: 700;
  }
  .sc-time {
    font-size: 10px;
  }
  .sc-arrow {
    color: var(--text-dim, #93a0bd);
    font-size: 14px;
  }

  /* ===== 电话/游戏/学习页 ===== */
  .contact {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 11px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #eef1ff;
    cursor: pointer;
  }
  .c-icon {
    font-size: 22px;
  }
  .c-name {
    font-size: 13px;
    font-weight: 600;
  }
  .c-desc {
    font-size: 11px;
  }
  /* v0.978 联系人卡片 */
  .ct-group {
    margin-bottom: 10px;
  }
  .group-label {
    font-size: 12px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    opacity: 0.85;
    margin: 8px 2px 6px;
    padding-left: 6px;
    border-left: 3px solid var(--accent, #ffd166);
  }
  .ct-card {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 7px;
  }
  .ct-card .c-icon {
    font-size: 24px;
    flex-shrink: 0;
  }
  .c-main {
    flex: 1;
    min-width: 0;
  }
  .c-title {
    font-size: 11px;
    font-weight: 500;
  }
  .c-actions {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
  .mini-btn {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.3);
    font-size: 15px;
    cursor: pointer;
  }
  .mini-btn:hover {
    background: rgba(255, 209, 102, 0.22);
  }
  .referral-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    background: rgba(80, 200, 120, 0.18);
    color: #7ee0a0;
    border: 1px solid rgba(80, 200, 120, 0.35);
  }
  .referral-badge.tut {
    background: rgba(120, 170, 255, 0.16);
    color: #a9c7ff;
    border-color: rgba(120, 170, 255, 0.35);
  }
  .big-action {
    padding: 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.3);
    font-size: 13px;
    text-align: left;
    color: #eef1ff;
    cursor: pointer;
    line-height: 1.6;
  }
  .big-action .dim {
    font-size: 11px;
  }
  .result-bar {
    margin: 8px 10px 10px;
    padding: 9px 11px;
    border-radius: 10px;
    background: rgba(255, 209, 102, 0.08);
    border: 1px solid rgba(255, 209, 102, 0.25);
    font-size: 12px;
    color: #eef1ff;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .r-deltas {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .r-ok {
    align-self: flex-end;
    font-size: 12px;
    color: var(--accent);
    font-weight: 700;
    background: none;
    border: none;
    padding: 4px 10px;
    cursor: pointer;
  }

  /* ===== 通信 App（通话 / 短信） ===== */
  .comm-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .comm-tab {
    flex: 1;
    padding: 7px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    font-weight: 700;
    color: #eef1ff;
    position: relative;
    cursor: pointer;
  }
  .comm-tab.active {
    background: rgba(255, 209, 102, 0.15);
    border-color: rgba(255, 209, 102, 0.4);
    color: var(--accent, #ffd166);
  }
  .tab-badge {
    position: absolute;
    top: -6px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 999px;
    background: #ff6b6b;
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .back.small {
    margin-bottom: 6px;
    align-self: flex-start;
  }
  .sms-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sms-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    text-align: left;
    color: #eef1ff;
    cursor: pointer;
  }
  .sms-item.unread {
    border-color: rgba(255, 209, 102, 0.35);
    background: rgba(255, 209, 102, 0.07);
  }
  .sms-body {
    flex: 1;
    min-width: 0;
  }
  .sms-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sms-new {
    font-size: 10px;
    font-weight: 800;
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.15);
    padding: 1px 6px;
    border-radius: 999px;
  }
  .sms-preview {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg-card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 11px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg-from {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }
  .msg-text {
    font-size: 12.5px;
    line-height: 1.6;
    color: #eef1ff;
  }
  .msg-replied {
    font-size: 11.5px;
    color: var(--ok, #7bd88f);
    font-style: italic;
    margin-top: 4px;
  }
  .reply-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }
  .reply-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left-width: 3px;
    color: #eef1ff;
    cursor: pointer;
  }
  .reply-opt.tone-warm {
    border-left-color: var(--ok, #7bd88f);
  }
  .reply-opt.tone-neutral {
    border-left-color: var(--accent-2, #6cc6ff);
  }
  .reply-opt.tone-cold {
    border-left-color: var(--danger, #ff6b6b);
  }
  .r-tone {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }
  .reply-opt.tone-warm .r-tone {
    color: var(--ok, #7bd88f);
  }
  .reply-opt.tone-neutral .r-tone {
    color: var(--accent-2, #6cc6ff);
  }
  .reply-opt.tone-cold .r-tone {
    color: var(--danger, #ff6b6b);
  }
  .r-label {
    font-size: 12px;
  }
  .center-hint {
    text-align: center;
    font-size: 11.5px;
    margin: 16px 0;
    color: var(--text-dim, rgba(255, 255, 255, 0.55));
  }
</style>
