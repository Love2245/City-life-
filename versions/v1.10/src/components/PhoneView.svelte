<script lang="ts">
  import { onMount } from "svelte";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { setZoom } from "../stores/uiStore.svelte";
  import {
    callFamily,
    callFriend,
    playGame,
    studyOnline,
    tryReceiveFamilyMessage,
    replyFamilyMessage,
    replySms,
    unreadSmsCount,
  } from "../game/core/phone";
  import type { FamilyMessageScenario, SmsMessage } from "../game/core/phone";
  import { JOB_DEFS, getJobDef } from "../game/core/jobs";
  import { acceptJobQuest, locationName, isPunctual } from "../game/core/quests";
  import { checkRequirements } from "../game/core/actions";
  import { getFamily } from "../game/core/families";
  import { formatTime } from "../game/core/time";
  import { formatMoney } from "../lib/format";
  import { playSound, isMuted, toggleMute, unlockAudio } from "../lib/audio";
  import { resetAllSaves } from "../lib/save";
  import { VERSION, GAME_NAME, CHANGELOG } from "../version";
  import type { PhoneResult } from "../game/core/phone";
  import { callContact, CONTACT_GROUP_LABEL, isReferred } from "../game/core/contacts";
  import type { ContactRelation } from "../game/types";
  import type { JobDef, SoundId } from "../game/types";
  import TarotGallery from "./TarotGallery.svelte";
  import RelationApp from "./RelationApp.svelte";
  import { jobRequirementBonus } from "../game/core/difficulty";
  import { currentResidenceName } from "../game/core/housing";
  import { VEHICLE_NAMES } from "../game/core/vehicle";
  import {
    INVEST_PRODUCTS,
    investmentTotal,
    buyInvestment,
    sellInvestment,
    investProductById,
  } from "../game/core/invest";
  import { getItem } from "../game/core/items";
  import { completeTutorialStep, isTutorialDone, currentTutorialStep, TUTORIAL_STEPS } from "../game/core/tutorial";

  type AppId = "home" | "call" | "game" | "study" | "jobs" | "settings" | "family" | "tarot" | "assets" | "goals" | "relation";

  let app = $state<AppId>("home");
  let result = $state<PhoneResult | null>(null);
  /** v0.97 通信应用：电话/短信/联系人 tab 切换 + 当前打开的短信 */
  let commTab = $state<"call" | "sms" | "contacts">("call");
  let smsOpen = $state<SmsMessage | null>(null);
  const unreadSms = $derived(unreadSmsCount(gameState));

  /** v0.978 联系人分组（按关系归类展示） */
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

  const family = $derived(getFamily(gameState.family));

  /** v0.94 资产：净资产 / 投资组合 / 载具 / 奢侈品 */
  const investTotal = $derived(investmentTotal(gameState));
  const netWorth = $derived(gameState.player.money + investTotal);
  const investments = $derived(
    gameState.economy.investments.map((inv) => ({ inv, prod: investProductById(inv.productId) })),
  );
  const ownedVehicles = $derived(
    Object.entries(gameState.vehicles)
      .filter(([, v]) => v.owned)
      .map(([type]) => type),
  );
  const rentedVehicles = $derived(
    Object.entries(gameState.vehicles)
      .filter(([, v]) => !v.owned)
      .map(([type]) => type),
  );
  const ownedLuxuryItems = $derived(
    gameState.economy.ownedLuxury
      .map((id) => getItem(id))
      .filter((d): d is NonNullable<typeof d> => !!d),
  );
  /** 投资买入金额输入（按产品 id 记忆草稿） */
  const amtDraft = $state<Record<string, string>>({});
  function onBuyInvest(productId: string): void {
    const amount = Number((amtDraft[productId] ?? "").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("请输入买入金额");
      return;
    }
    const r = buyInvestment(gameState, productId, amount);
    const paid = Math.round(amount);
    if (r.ok) {
      result = {
        ok: true,
        text: "买入成功，静待月结",
        deltas: [{ key: "金钱", label: "金钱", value: -paid }],
      };
      playSound("coin");
    } else {
      showToast(r.reason ?? "买入失败");
    }
    amtDraft[productId] = "";
  }
  function onSellInvest(id: string, value: number): void {
    const r = sellInvestment(gameState, id);
    if (r.ok) {
      result = {
        ok: true,
        text: `卖出成功，变现 ${formatMoney(value)} 元`,
        deltas: [{ key: "金钱", label: "金钱", value }],
      };
      playSound("coin");
    } else {
      showToast(r.reason ?? "卖出失败");
    }
  }

  function close(): void {
    uiState.modal = null;
    app = "home";
    result = null;
  }

  /** 打开手机时尝试接收家人消息（每天至多一条，按概率触发） */
  onMount(() => {
    const m = tryReceiveFamilyMessage(gameState);
    if (m) {
      uiState.pendingFamilyMsg = m;
      showToast("📨 收到家人的消息");
    }
    // v0.94 新手引导：首次打开手机即完成「熟悉手机」，并提示下一步目标
    if (completeTutorialStep(gameState, "open_phone")) {
      const next = currentTutorialStep(gameState);
      if (next) showToast(`${next.def.icon} 新目标：${next.def.title} — ${next.def.desc}`);
    }
  });

  /** 回复家人消息（三条不同态度） */
  function replyToFamily(optionIndex: number): void {
    const scenario = uiState.pendingFamilyMsg;
    if (!scenario) return;
    run(() => replyFamilyMessage(gameState, scenario, optionIndex), "phone");
    uiState.pendingFamilyMsg = null;
  }

  /** v0.97 回复短信 */
  function onReplySms(optionIndex: number): void {
    if (!smsOpen) return;
    const r = replySms(gameState, smsOpen.id, optionIndex);
    if (r.ok) {
      result = r;
      playSound("phone");
      smsOpen = null;
    } else {
      showToast(r.reason ?? "回复失败");
    }
  }

  function toneLabel(tone: FamilyMessageScenario["options"][number]["tone"]): string {
    return tone === "warm" ? "暖心" : tone === "cold" ? "冷淡" : "平实";
  }

  /** 音效开关（本地镜像，持久化在 audio 模块） */
  let muted = $state(isMuted());
  function onMute(): void {
    muted = toggleMute();
  }

  /** 设置页：重置全部存档 */
  let resetting = $state(false);
  async function resetSaves(): Promise<void> {
    if (!confirm("确定删除所有存档？此操作不可恢复！")) return;
    resetting = true;
    try {
      await resetAllSaves();
      close();
    } finally {
      resetting = false;
    }
  }

  function run(fn: () => PhoneResult, sound?: SoundId): void {
    const r = fn();
    result = r;
    if (r.ok && sound) playSound(sound);
    if (!r.ok && r.reason) showToast(r.reason);
  }

  /** 已就职岗位的固定岗/正式工 */
  const hiredJob = $derived(gameState.career.jobId ? getJobDef(gameState.career.jobId) : undefined);

  /** 手机招聘可投递的岗位：fixed / weekly / monthly */
  const formalJobs = $derived(JOB_DEFS.filter((j) => j.kind !== "day"));
  const fixedJobs = $derived(formalJobs.filter((j) => j.kind === "fixed"));
  const cycleJobs = $derived(formalJobs.filter((j) => j.kind === "weekly" || j.kind === "monthly"));

  /** 简版需求摘要（手机端展示用） */
  function reqSummary(job: JobDef): string {
    const parts: string[] = [];
    const req = job.requirements;
    if (!req) return parts.join(" · ");
    if (req.attr) {
      for (const [k, v] of Object.entries(req.attr)) parts.push(`${k} ≥ ${v}`);
    }
    if (req.skill) {
      for (const [k, v] of Object.entries(req.skill)) parts.push(`${k}技能 ${v}`);
    }
    if (req.flag) {
      if (isReferred(gameState, job.id)) {
        parts.push(`内推免${req.flag === "item_certificate" ? "技能证书" : req.flag === "item_driving_license" ? "驾驶本" : "证书"}`);
      } else {
        parts.push(`需${req.flag === "item_driving_license" ? "驾驶本" : req.flag === "item_certificate" ? "技能证书" : req.flag}`);
      }
    }
    if (req.money) parts.push(`押金 ${req.money}`);
    return parts.join(" · ");
  }

  /** 手机应聘 = 只签合同，不当场干活（v0.86/0.89）。
   *  v0.89：career 冲突检查只针对正式工（weekly/monthly），固定岗放行。 */
  function applyJob(jobId: string): void {
    const job = getJobDef(jobId);
    if (!job) return;

    const c = gameState.career;
    if ((job.kind === "weekly" || job.kind === "monthly") && c.jobId && c.jobId !== job.id) {
      showToast("已有正式工作，请到劳务公司办理离职后再换");
      return;
    }
    const check = checkRequirements(gameState, job.requirements, { reqBonus: jobRequirementBonus(gameState), jobId: job.id });
    if (!check.ok) {
      showToast(check.reason ?? "还不符合应聘条件");
      return;
    }

    const quest = acceptJobQuest(gameState, job);
    playSound("phone");
    const where = locationName(job.locationId) || "岗位";
    if (isPunctual(job) && quest.startHour !== undefined) {
      showToast(`✅ 录用了！${quest.startHour}:00 到${where}打卡，别迟到`);
    } else {
      showToast(`✅ 录用了！时间自由，到${where}就能开工`);
    }
    close();
  }
</script>

<div class="overlay hud-scope" onclick={() => close()}>
  <div class="phone" onclick={(e) => e.stopPropagation()}>
    <div class="phone-screen">
      <div class="p-top">
        <span class="p-time">{formatTime(gameState.time.hour, gameState.time.minute)}</span>
        <button class="p-close" onclick={() => close()}>✕</button>
      </div>

      {#if app === "home"}
        <!-- 桌面：4 个 app -->
        <div class="apps">
          <button class="app" onclick={() => { app = "call"; result = null; commTab = "call"; }}>
            <span class="a-icon">📱</span>
            <span class="a-name">通信</span>
            {#if unreadSms > 0}<span class="app-badge">{unreadSms}</span>{/if}
          </button>
          <button class="app" onclick={() => { app = "game"; result = null; }}>
            <span class="a-icon">🎮</span>
            <span class="a-name">游戏</span>
          </button>
          <button class="app" onclick={() => { app = "study"; result = null; }}>
            <span class="a-icon">📖</span>
            <span class="a-name">学习</span>
          </button>
          <button class="app" onclick={() => { app = "jobs"; result = null; }}>
            <span class="a-icon">💼</span>
            <span class="a-name">招聘</span>
          </button>
          <button class="app" onclick={() => { app = "settings"; result = null; }}>
            <span class="a-icon">⚙️</span>
            <span class="a-name">设置</span>
          </button>
          <button class="app" onclick={() => { app = "tarot"; result = null; }}>
            <span class="a-icon">🔮</span>
            <span class="a-name">塔罗</span>
          </button>
          <button class="app" onclick={() => { app = "assets"; result = null; }}>
            <span class="a-icon">📊</span>
            <span class="a-name">资产</span>
          </button>
          <button class="app" onclick={() => { app = "goals"; result = null; }}>
            <span class="a-icon">🎯</span>
            <span class="a-name">目标</span>
          </button>
          <button class="app" onclick={() => { app = "relation"; result = null; }}>
            <span class="a-icon">💞</span>
            <span class="a-name">关系</span>
          </button>
        </div>
        <div class="home-hint dim">余额 {formatMoney(gameState.player.money)} · {family?.name ?? ""}家庭</div>

      {:else if app === "call"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <!-- v0.97 通信应用：电话 / 短信 双 tab -->
          <div class="comm-tabs">
            <button class="comm-tab" class:active={commTab === "call"} onclick={() => { commTab = "call"; smsOpen = null; }}>
              📞 电话
            </button>
            <button class="comm-tab" class:active={commTab === "sms"} onclick={() => { commTab = "sms"; smsOpen = null; }}>
              💬 短信{#if unreadSms > 0}<span class="tab-badge">{unreadSms}</span>{/if}
            </button>
            <button class="comm-tab" class:active={commTab === "contacts"} onclick={() => { commTab = "contacts"; smsOpen = null; }}>
              👥 联系人
            </button>
          </div>

          {#if commTab === "call"}
            <div class="page-title">📞 打电话</div>
            <div class="contact-list">
              <button class="contact" onclick={() => { app = "family"; result = null; }}>
                <span class="c-icon">👨‍👩‍👧</span>
                <div>
                  <div class="c-name">家人（{family?.name ?? ""}）</div>
                  <div class="c-desc dim">
                    {#if uiState.pendingFamilyMsg}📨 有{1}条新消息{:else}聊聊家常，问问近况{/if}
                  </div>
                </div>
              </button>
              <button class="contact" onclick={() => run(() => callFriend(gameState), "phone")}>
                <span class="c-icon">🧑‍🤝‍🧑</span>
                <div>
                  <div class="c-name">朋友</div>
                  <div class="c-desc dim">找个能说话的人</div>
                </div>
              </button>
            </div>
          {:else if commTab === "contacts"}
            <div class="page-title">👥 联系人（{gameState.contacts.length}）</div>
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
                          <button class="mini-btn" title="打电话" onclick={() => run(() => callContact(gameState, c.id), "phone")}>📞</button>
                        {/if}
                        {#if c.canSms}
                          <button class="mini-btn" title="发短信" onclick={() => { commTab = "sms"; smsOpen = [...gameState.smsInbox].reverse().find((m) => m.sender === c.name) ?? null; }}>💬</button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            {/if}
          {:else}
            <div class="page-title">💬 短信</div>
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

      {:else if app === "family"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "call")}>← 返回</button>
          <div class="page-title">👨‍👩‍👧 家人（{family?.name ?? ""}）</div>

          {#if uiState.pendingFamilyMsg}
            {@const msg = uiState.pendingFamilyMsg}
            <div class="msg-card">
              <div class="msg-from">📨 新消息</div>
              <p class="msg-text">{msg.text}</p>
              <div class="reply-list">
                {#each msg.options as opt, i}
                  <button class="reply-opt tone-{opt.tone}" onclick={() => replyToFamily(i)}>
                    <span class="r-tone">{toneLabel(opt.tone)}</span>
                    <span class="r-label">{opt.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <p class="dim center-hint">今天暂时没有新消息，想家了就打个电话吧。</p>
          {/if}

          <button class="big-action" onclick={() => run(() => callFamily(gameState), "phone")}>📞 直接打电话</button>
        </div>

      {:else if app === "game"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">🎮 手机游戏</div>
          <button class="big-action" onclick={() => run(() => playGame(gameState), "game")}>
            玩一小时小游戏（+心情，-1 小时）
          </button>
        </div>

      {:else if app === "study"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">📖 在线学习</div>
          <button class="big-action" onclick={() => run(() => studyOnline(gameState), "study")}>
            学一小时网课（+智力 2{gameState.flags["item_laptop"] ? "（笔记本 ×2）" : ""}，-3 元流量费）
          </button>
        </div>

      {:else if app === "jobs"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">💼 招聘信息</div>

          {#if hiredJob}
            <div class="hired-banner">
              ✅ 当前在职：<b>{hiredJob.name}</b>
              <span class="dim">（换工作请到劳务公司办理离职）</span>
            </div>
          {/if}
          <p class="jobs-hint dim">应聘后今天的班会自动排进任务栏，需按时到岗。📌 日结岗请前往<b>劳务市场</b>接活</p>

          <div class="jobs-group">
            <div class="g-head">🏢 正式工（周结/月结）</div>
            <div class="job-list">
              {#each cycleJobs as job}
                {@const req = reqSummary(job)}
                {@const ck = checkRequirements(gameState, job.requirements, { reqBonus: jobRequirementBonus(gameState), jobId: job.id })}
                {@const ok = ck.ok}
                {@const hired = gameState.career.jobId === job.id}
                <button class="job-item" class:disabled={!ok || hired} onclick={() => applyJob(job.id)}>
                  <span class="j-icon">{job.icon}</span>
                  <div class="j-info">
                    <div class="j-name">{job.name} {#if hired}<span class="tag gain">✅ 在职</span>{/if}</div>
                    <div class="j-desc dim">{job.desc} · {job.duration}h · {job.kind === "weekly" ? "周结" : "月结"} +{job.effects.money ?? 0}元/天</div>
                    {#if req}<div class="j-req">📋 {req}</div>{/if}
                    {#if isReferred(gameState, job.id)}<div class="j-req referral">🤝 内推免证书，可直接入职</div>{/if}
                    {#if job.startHour !== undefined}
                      <div class="j-time">⏰ {job.startHour}:00 打卡 · {locationName(job.locationId)}</div>
                    {/if}
                    {#if !ok && ck.reason}<div class="j-lock">🔒 {ck.reason}</div>{/if}
                  </div>
                  <span class="j-apply">{hired ? "已就职" : "应聘"}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="jobs-group">
            <div class="g-head">🛠️ 固定岗（无证书可实习 3 天）</div>
            <div class="job-list">
              {#each fixedJobs as job}
                {@const req = reqSummary(job)}
                <button class="job-item" onclick={() => applyJob(job.id)}>
                  <span class="j-icon">{job.icon}</span>
                  <div class="j-info">
                    <div class="j-name">{job.name}</div>
                    <div class="j-desc dim">{job.desc} · {job.duration}h · +{job.effects.money ?? 0}元/天</div>
                    {#if req}<div class="j-req">📋 {req}</div>{/if}
                    {#if isReferred(gameState, job.id)}<div class="j-req referral">🤝 内推免证书，可直接入职</div>{/if}
                    {#if job.startHour !== undefined && job.locationId}
                      <div class="j-time">⏰ {job.startHour}:00 打卡 · {locationName(job.locationId)}</div>
                    {/if}
                  </div>
                  <span class="j-apply">应聘</span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {:else if app === "settings"}
        <div class="app-page settings-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">⚙️ 设置</div>

          <div class="set-card">
            <div class="set-row">
              <span class="set-label">🔊 音效</span>
              <button class="switch" class:on={!muted} onclick={onMute} onpointerdown={() => unlockAudio()}>
                <span class="switch-state">{muted ? "关" : "开"}</span>
                <span class="knob"></span>
              </button>
            </div>
          </div>

          <div class="set-card">
            <div class="set-row">
              <span class="set-label">🔍 UI 缩放</span>
              <span class="dim" style="font-size:11px;">{Math.round(uiState.zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5" max="1.5" step="0.1"
              value={uiState.zoom}
              oninput={(e) => setZoom(parseFloat(e.currentTarget.value))}
              class="zoom-slider"
            />
            <div class="zoom-marks">
              <span>50%</span><span>100%</span><span>150%</span>
            </div>
          </div>

          <div class="set-card">
            <div class="h2">关于</div>
            <p class="dim">{GAME_NAME} v{VERSION}</p>
            <p class="dim">灵感来自安卓游戏《属性与生活》，桌面端重制。</p>
          </div>

          <div class="set-card">
            <div class="h2">更新日志</div>
            <div class="changelog">
              {#each CHANGELOG as entry}
                <div class="cl-entry">
                  <div class="cl-head">
                    <span class="cl-ver">v{entry.version}</span>
                    <span class="cl-date">{entry.date}</span>
                    <span class="cl-title">{entry.title}</span>
                  </div>
                  <ul class="cl-notes">
                    {#each entry.notes as n}
                      <li>{n}</li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </div>
          </div>

          <div class="set-card danger-zone">
            <div class="h2">危险操作</div>
            <p class="dim">删除全部存档（3 个手动槽 + 自动槽）</p>
            <button class="btn btn-danger" onclick={() => resetSaves()} disabled={resetting}>
              {resetting ? "删除中…" : "🗑️ 重置所有存档"}
            </button>
          </div>
        </div>

      {:else if app === "goals"}
        <div class="app-page goals-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">🎯 目标清单</div>
          {#if isTutorialDone(gameState)}
            <div class="goals-done">
              <div class="goals-done-icon">🎉</div>
              <div class="goals-done-text">新手引导全部完成，<br />都市生活正式开始！</div>
            </div>
          {:else}
            {@const cur = currentTutorialStep(gameState)}
            <div class="goals-list">
              {#each TUTORIAL_STEPS as step, i}
                {@const isDone = gameState.tutorial.done.includes(step.id)}
                {@const isCur = cur?.index === i}
                <div class="goal-item" class:done={isDone} class:active={isCur}>
                  <span class="goal-icon">{isDone ? "✅" : isCur ? step.icon : "⬜"}</span>
                  <div class="goal-info">
                    <div class="goal-name">
                      {step.title}
                      {#if isDone}<span class="tag gain">完成</span>{/if}
                      {#if isCur}<span class="tag">当前</span>{/if}
                    </div>
                    <div class="goal-desc dim">{step.desc}</div>
                    {#if isCur}<div class="goal-hint">💡 {step.hint}</div>{/if}
                  </div>
                </div>
              {/each}
            </div>
            <p class="dim center-hint">进度 {gameState.tutorial.done.length}/{TUTORIAL_STEPS.length}，按顺序完成即可</p>
          {/if}
        </div>

      {:else if app === "assets"}
        <div class="app-page ast-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <div class="page-title">📊 资产</div>

          <div class="ast-net">
            <div class="ast-net-label dim">净资产（现金 + 投资市值）</div>
            <div class="ast-net-value">{formatMoney(netWorth)}</div>
            <div class="ast-cash dim">现金 {formatMoney(gameState.player.money)} · 投资 {formatMoney(investTotal)}</div>
          </div>

          <div class="ast-card">
            <div class="h2">🏠 房产</div>
            <div class="ast-row">
              <span>{currentResidenceName(gameState)}</span>
              {#if gameState.living.mode === "own"}
                <span class="tag gain">自有</span>
              {:else if gameState.living.mode === "lease"}
                <span class="tag">月租</span>
              {:else if gameState.living.mode === "nightly"}
                <span class="tag cost">按天</span>
              {:else}
                <span class="tag">过渡</span>
              {/if}
            </div>
            {#if gameState.living.mode !== "own"}
              <p class="dim">💡 攒够钱可去「房屋中介」一次性买断产权房，从此免租</p>
            {/if}
          </div>

          <div class="ast-card">
            <div class="h2">🚗 载具</div>
            {#if ownedVehicles.length === 0 && rentedVehicles.length === 0}
              <p class="dim">暂无载具，可在「汽车租赁行」租用或买断</p>
            {:else}
              {#each ownedVehicles as type}
                <div class="ast-row"><span>{VEHICLE_NAMES[type] ?? type}</span><span class="tag gain">自有</span></div>
              {/each}
              {#each rentedVehicles as type}
                <div class="ast-row"><span>{VEHICLE_NAMES[type] ?? type}</span><span class="tag">租用中</span></div>
              {/each}
            {/if}
          </div>

          <div class="ast-card">
            <div class="h2">📈 投资理财 <span class="dim">（每月 1 号按行情结算）</span></div>
            {#if investments.length > 0}
              {#each investments as { inv, prod }}
                <div class="ast-inv">
                  <div class="ast-row">
                    <span>{prod?.icon ?? "💼"} {prod?.name ?? inv.productId}</span>
                    <span class="dim">本金 {formatMoney(inv.principal)}</span>
                  </div>
                  <div class="ast-row">
                    <span class="ast-value">市值 {formatMoney(inv.value)}</span>
                    <span class="tag {inv.value >= inv.principal ? "gain" : "cost"}">
                      {inv.value >= inv.principal ? "+" : ""}{formatMoney(inv.value - inv.principal)}
                    </span>
                    <button class="btn btn-sm" onclick={() => onSellInvest(inv.id, inv.value)}>卖出</button>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="dim">暂无投资。存款保本、基金平稳、股票刺激，盈亏按月结算。</p>
            {/if}

            <div class="ast-buy">
              <div class="g-head">买入</div>
              {#each INVEST_PRODUCTS as prod}
                <div class="ast-buy-row">
                  <div class="ast-prod">
                    <div>{prod.icon} {prod.name} <span class="dim">（最低 {prod.minAmount} 元）</span></div>
                    <div class="dim">{prod.desc}</div>
                  </div>
                  <input class="ast-input" type="number" min="0" placeholder="金额" bind:value={amtDraft[prod.id]} />
                  <button class="btn btn-sm" onclick={() => onBuyInvest(prod.id)}>买入</button>
                </div>
              {/each}
            </div>
          </div>

          <div class="ast-card">
            <div class="h2">💎 奢侈品</div>
            {#if ownedLuxuryItems.length === 0}
              <p class="dim">暂无奢侈品收藏，可在「名牌店」入手（集齐 3 件解锁成就）</p>
            {:else}
              {#each ownedLuxuryItems as item}
                <div class="ast-row"><span>{item.icon} {item.name}</span><span class="tag gain">收藏</span></div>
              {/each}
            {/if}
          </div>
        </div>

      {:else if app === "tarot"}
        <div class="app-page ach-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <TarotGallery />
        </div>

      {:else if app === "relation"}
        <div class="app-page">
          <button class="back" onclick={() => (app = "home")}>← 返回</button>
          <RelationApp onClose={() => (app = "home")} onResult={(r) => (result = r)} />
        </div>
      {/if}

      <!-- 结果反馈 -->
      {#if result}
        <div class="result-bar">
          {result.text}
          {#if result.deltas && result.deltas.length > 0}
            <div class="r-deltas">
              {#each result.deltas as d}
                <span class="tag {d.value > 0 ? "gain" : "cost"}">
                  {d.label} {d.value > 0 ? "+" : ""}{d.value}
                </span>
              {/each}
            </div>
          {/if}
          <button class="r-ok" onclick={() => (result = null)}>知道了</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.7);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    animation: fadeIn 0.2s ease;
  }
  .phone {
    width: 340px;
    height: 560px;
    background: #141824;
    border-radius: 28px;
    padding: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    border: 2px solid #2a3040;
  }
  .phone-screen {
    width: 100%;
    height: 100%;
    border-radius: 20px;
    background: linear-gradient(160deg, #1e2536, #151a28);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .p-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px 6px;
  }
  .p-time {
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .p-close {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 12px;
    color: var(--text-dim);
  }
  .apps {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    padding: 24px 20px;
  }
  .app {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 8px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
  }
  .app:active {
    background: rgba(255, 209, 102, 0.12);
  }
  .app-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ff6b6b;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .comm-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .comm-tab {
    flex: 1;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 13px;
    font-weight: 700;
    position: relative;
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
  /* v0.978 联系人卡片 */
  .ct-group {
    margin-bottom: 12px;
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
    gap: 10px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 8px;
  }
  .ct-card .c-icon {
    font-size: 26px;
    flex-shrink: 0;
  }
  .c-main {
    flex: 1;
    min-width: 0;
  }
  .c-title {
    font-size: 12px;
    font-weight: 500;
  }
  .c-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .mini-btn {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.3);
    font-size: 16px;
    cursor: pointer;
  }
  .mini-btn:hover {
    background: rgba(255, 209, 102, 0.22);
  }
  .referral-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
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
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    text-align: left;
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
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .msg-replied {
    font-size: 12px;
    color: var(--ok, #7bd88f);
    font-style: italic;
    margin-top: 6px;
  }
  .a-icon {
    font-size: 28px;
  }
  .a-name {
    font-size: 13px;
    font-weight: 600;
  }
  .home-hint {
    text-align: center;
    font-size: 12px;
    margin-top: auto;
    padding-bottom: 20px;
  }
  .app-page {
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .back {
    align-self: flex-start;
    font-size: 12px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 2px;
  }
  .page-title {
    font-size: 15px;
    font-weight: 700;
  }
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .contact {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .c-icon {
    font-size: 24px;
  }
  .c-name {
    font-size: 14px;
    font-weight: 600;
  }
  .c-desc {
    font-size: 11.5px;
  }
  .big-action {
    padding: 16px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.3);
    font-size: 13.5px;
    text-align: left;
  }
  .job-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .jobs-hint {
    font-size: 11.5px;
    line-height: 1.6;
  }
  .job-item {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .j-icon {
    font-size: 22px;
  }
  .j-info {
    flex: 1;
    min-width: 0;
  }
  .j-name {
    font-size: 13.5px;
    font-weight: 600;
  }
  .j-desc {
    font-size: 11px;
  }
  .j-time {
    font-size: 11px;
    color: var(--warn);
    margin-top: 2px;
  }
  .j-req {
    font-size: 10.5px;
    color: var(--accent-2, #6cc6ff);
    margin-top: 2px;
  }
  .j-lock {
    font-size: 10.5px;
    color: var(--danger);
    margin-top: 2px;
  }
  .jobs-group {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .g-head {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.5px;
    padding-left: 4px;
  }
  .hired-banner {
    background: rgba(123, 216, 143, 0.12);
    border: 1px solid rgba(123, 216, 143, 0.35);
    color: var(--ok, #7bd88f);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .job-item.disabled {
    opacity: 0.5;
  }
  .j-apply {
    font-size: 12px;
    color: var(--accent);
    font-weight: 700;
  }
  .result-bar {
    margin: 8px 14px 14px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 209, 102, 0.08);
    border: 1px solid rgba(255, 209, 102, 0.25);
    font-size: 12.5px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
  }
  .settings-page {
    gap: 12px;
  }
  .set-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .set-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .set-label {
    font-size: 13.5px;
    font-weight: 600;
  }
  .switch {
    position: relative;
    min-width: 58px;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 107, 107, 0.22);
    border: 1px solid rgba(255, 107, 107, 0.4);
    color: var(--danger);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 10px;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .switch.on {
    background: rgba(123, 216, 143, 0.2);
    border-color: rgba(123, 216, 143, 0.45);
    color: var(--ok, #7bd88f);
    justify-content: flex-end;
  }
  .switch-state {
    letter-spacing: 0.5px;
  }
  .h2 {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
  }
  .changelog {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cl-entry {
    border-left: 2px solid var(--accent);
    padding-left: 8px;
  }
  .cl-head {
    font-size: 12px;
    font-weight: 700;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }
  .cl-ver {
    color: var(--accent);
  }
  .cl-date {
    font-size: 10.5px;
    color: var(--text-dim);
    font-weight: 500;
  }
  .cl-title {
    font-size: 11.5px;
    font-weight: 600;
  }
  .cl-notes {
    margin: 4px 0 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cl-notes li {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.5;
  }
  .danger-zone {
    border-color: rgba(255, 107, 107, 0.4);
  }
  .btn-danger {
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid var(--danger);
    color: var(--danger);
    font-weight: 700;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12.5px;
  }
  .center-hint {
    text-align: center;
    font-size: 12px;
    margin: 16px 0;
  }
  .msg-card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px;
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
    font-size: 13px;
    line-height: 1.6;
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
    padding: 9px 11px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left-width: 3px;
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
    font-size: 10.5px;
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
    font-size: 12.5px;
  }
  /* v0.985 塔罗图鉴页容器（内容由 TarotGallery 组件渲染） */
  .ach-page {
    gap: 10px;
  }

  /* v0.94 资产页 */
  .ast-net {
    background: linear-gradient(135deg, #1f3a5f, #274a7a);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 10px;
    text-align: center;
  }
  .ast-net-label {
    font-size: 11px;
  }
  .ast-net-value {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    margin: 2px 0;
  }
  .ast-cash {
    font-size: 11px;
  }
  .ast-card {
    background: #1c2333;
    border: 1px solid #2a3248;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .ast-card .h2 {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .ast-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    padding: 4px 0;
  }
  .ast-value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ast-inv {
    border-top: 1px dashed #2a3248;
    padding: 4px 0;
  }
  .ast-inv:first-of-type {
    border-top: none;
  }
  .ast-buy {
    margin-top: 8px;
    border-top: 1px dashed #2a3248;
    padding-top: 8px;
  }
  .ast-buy-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
  }
  .ast-prod {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  .ast-input {
    width: 70px;
    background: #141a28;
    border: 1px solid #2a3248;
    border-radius: 6px;
    color: #e8ecf5;
    padding: 5px 6px;
    font-size: 12px;
    text-align: right;
  }
  .btn-sm {
    padding: 4px 10px;
    font-size: 12px;
  }

  /* v0.94 目标清单 */
  .goals-done {
    text-align: center;
    padding: 32px 16px;
  }
  .goals-done-icon {
    font-size: 40px;
    margin-bottom: 10px;
  }
  .goals-done-text {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.6;
  }
  .goal-item {
    display: flex;
    gap: 10px;
    background: #1c2333;
    border: 1px solid #2a3248;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .goal-item.done {
    opacity: 0.65;
  }
  .goal-item.active {
    border-color: #4a7fc0;
    box-shadow: 0 0 0 1px #4a7fc0;
  }
  .goal-icon {
    font-size: 20px;
    flex-shrink: 0;
  }
  .goal-info {
    flex: 1;
    min-width: 0;
  }
  .goal-name {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .goal-desc {
    font-size: 11px;
    line-height: 1.5;
    margin-top: 2px;
  }
  .goal-hint {
    font-size: 11px;
    color: #9fc2e8;
    margin-top: 4px;
  }
  /* v0.98 缩放滑块 */
  .zoom-slider {
    width: 100%;
    margin: 6px 0 4px;
    accent-color: var(--accent, #ffd166);
    height: 6px;
  }
  .zoom-marks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-dim, #a8b2d6);
  }
</style>
