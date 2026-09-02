<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast, presentJobResult, SKINS } from "../stores/uiStore.svelte";
  import { setZoom } from "../stores/uiStore.svelte";
  import { pushLog } from "../game/engine";
  import {
    callFamily,
    playGame,
    studyOnline,
    tryReceiveFamilyMessage,
    replyFamilyMessage,
    unreadSmsCount,
    replySms,
    markSmsRead,
  } from "../game/core/phone";
  import type { FamilyMessageScenario } from "../game/core/phone";
  import type { SmsMessage } from "../game/types";
  import { JOB_DEFS, getJobDef, deliveryParttime, deliveryParttimeBasePay, resolveVehicle } from "../game/core/jobs";
  import { getMiniGameConfigFor } from "../game/core/minigame";
  import { acceptJobQuest, locationName, isPunctual, activeQuests, lateness, formatDuration, isRestDayFor } from "../game/core/quests";
  import { checkRequirements, moveTo, getLocation, travelHours, travelLabel } from "../game/core/actions";
  import { getFamily } from "../game/core/families";
  import { formatTime } from "../game/core/time";
  import { formatMoney } from "../lib/format";
  import { playSound, isMuted, toggleMute, unlockAudio, getBgmVolume, setBgmVolume, getSfxVolume, setSfxVolume } from "../lib/audio";
  import { resetAllSaves } from "../lib/save";
  import { VERSION, GAME_NAME, CHANGELOG } from "../version";
  import { MARKET_APPS } from "../game/core/apps";
  import type { PhoneResult } from "../game/core/phone";
  import { isReferred, smsContact, callContact, getContact } from "../game/core/contacts";
  import { createPost, momentsPostsOf, toggleSelfLike, commentOnPost, simulateReactionsFor } from "../game/core/moments";
  import { allCitizens } from "../game/core/citizens";
  import { TAKEOUT_MENU, placeTakeout, claimOrder as claimTakeoutOrder, arrivedOrders as arrivedTakeout, activeOrders as activeTakeout } from "../game/core/takeout";
  import { SHOP_CATALOG, placeShopOrder, claimOrder as claimShopOrder, arrivedOrders as arrivedShop, activeOrders as activeShop } from "../game/core/shop";
  import { canLive, startLive, liveToday } from "../game/core/live";
  import type { Quest } from "../game/types";
  import type { JobDef, SoundId } from "../game/types";
  import TarotGallery from "./TarotGallery.svelte";
  import RelationApp from "./RelationApp.svelte";
  import ThemePicker from "./ThemePicker.svelte";
  import PhoneMinesweeper from "./layout/minigames/PhoneMinesweeper.svelte";

  /** v1.3 开关：自己发帖功能（朋友圈/论坛入口）。用户反馈"没什么意义"，暂时关闭。 */
  const SELF_POST_ENABLED = false;
  import PhoneSokoban from "./layout/minigames/PhoneSokoban.svelte";
  import PhoneSnake from "./layout/minigames/PhoneSnake.svelte";
  import Phone2048 from "./layout/minigames/Phone2048.svelte";
  import { jobRequirementBonus } from "../game/core/difficulty";
  import { currentResidenceName } from "../game/core/housing";
  import { VEHICLE_NAMES } from "../game/core/vehicle";
  import {
  } from "../game/core/invest";
  import { getItem } from "../game/core/items";
  import { completeTutorialStep, isTutorialDone, currentTutorialStep, TUTORIAL_STEPS } from "../game/core/tutorial";
  import { workQuestJob } from "../game/core/jobs";
  import { rollEvent } from "../game/core/events";
  import { FATIGUE_WARN_THRESHOLD } from "../game/core/fatigue";
  import { gameDay, weekdayOf, WEEKDAY_LABEL } from "../game/core/calendar";
  import {
    activeStoryCards,
    remitToFamily,
    currentArc,
    storyStageHint,
    storyGoalProgress,
    storyGoalDesc,
    storyNextDrawIn,
    storyDeadlineLeft,
    storyStageName,
    arcGoalGap,
  } from "../game/core/story";

  /** 由父组件注入：关闭当前手机表面（全屏弹窗→关弹窗；右侧面板→收起面板） */
  let { onClose = () => {}, variant = "full" }: { onClose?: () => void; variant?: "full" | "panel" } = $props();

  type AppId = "home" | "todo" | "call" | "game" | "study" | "jobs" | "settings" | "family" | "tarot" | "assets" | "goals" | "relation" | "market" | "delivery" | "moments" | "takeout" | "shop" | "live";

  let app = $state<AppId>("home");
  let result = $state<PhoneResult | null>(null);
  /** v1.20 手机小游戏：当前打开的游戏（null=列表） */
  let phoneGame = $state<null | "minesweeper" | "sokoban" | "snake" | "2048">(null);
  const unreadSms = $derived(unreadSmsCount(gameState));

  /** v1.3 短信会话分组：按联系人 / 发送人聚合 out+in 消息，呈现真实对话流 */
  const smsThreads = $derived.by(() => {
    const map = new Map<string, { key: string; name: string; icon: string; msgs: SmsMessage[] }>();
    for (const m of gameState.smsInbox) {
      // v1.3b8 修复会话分裂：NPC 自动消息（欢迎/教程）无 contactId，key=sender 名字；
      // 玩家回复后产生的消息 key=contactId → 同一联系人分裂成两个会话。
      // 归一化：sender 名字能匹配联系人时统一用其 id 作 key。
      const key = m.contactId ?? gameState.contacts.find((c) => c.name === m.sender)?.id ?? m.sender;
      let t = map.get(key);
      if (!t) { t = { key, name: m.sender, icon: m.senderIcon, msgs: [] }; map.set(key, t); }
      t.msgs.push(m);
    }
    const out = [...map.values()].map((t) => {
      const sorted = [...t.msgs].sort((a, b) => a.day - b.day);
      const unread = sorted.filter((m) => !m.replied && !m.read && m.dir === "in").length;
      return { key: t.key, name: t.name, icon: t.icon, msgs: sorted, last: sorted[sorted.length - 1], unread };
    });
    return out.sort((a, b) => b.last.day - a.last.day);
  });

  /** v1.3b5 微信风通信：当前打开的会话 key + 草稿 */
  let wechatThread = $state<string | null>(null);
  let wechatTab = $state<"chat" | "contacts">("chat");
  const wechatCurrent = $derived(
    wechatThread ? smsThreads.find((t) => t.key === wechatThread)?.msgs ?? [] : [],
  );
  /** v1.3b9 聊天窗自动滚底：打开会话 / 收发新消息时贴到底部（真实聊天软件体验） */
  let wcMsgsEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    void wechatCurrent.length;
    void wechatThread;
    if (wcMsgsEl) wcMsgsEl.scrollTop = wcMsgsEl.scrollHeight;
  });
  /** v1.3b9 状态栏日期（周几 · 月/日） */
  const statusDate = $derived.by(() => {
    const t = gameState.time;
    return `${WEEKDAY_LABEL[weekdayOf(t)]} ${t.month}/${t.day}`;
  });
  /** v1.3b8 微信回复：三选项按钮替代文本输入框。
   *  修复"联系人不存在"：会话线程 key 可能是 sender 名字（历史消息无 contactId），
   *  改用 getContact（id 或 name 双重回退，与 LaptopDesktopView 一致）。 */
  function wechatReply(tone: "positive" | "neutral" | "negative"): void {
    if (!wechatThread) return;
    const c = getContact(gameState, wechatThread);
    if (!c) { showToast("联系人不存在"); return; }
    const r = smsContact(gameState, c.id, tone);
    if (r.ok) showToast(r.text);
    else showToast(r.reason ?? r.text ?? "消息发送失败");
  }
  function wechatCall(): void {
    if (!wechatThread) return;
    const c = getContact(gameState, wechatThread);
    if (!c) return;
    const r = callContact(gameState, c.id);
    showToast(r.text);
    if (r.ok) playSound("phone");
  }

  /**
   * v1.3b8b 恢复前代短信回复体验：
   * SMS_SCENARIOS 场景短信（sms_ 前缀）/垃圾短信（junk_ 前缀）自带三档回复选项
   * （warm 友好 / neutral 平淡 / cold 消极），选中后施加效果并得到对方回应。
   * v1.3b5 微信化重构时此入口被遗漏，本轮恢复。
   */
  function isScenarioSms(m: SmsMessage): boolean {
    return (
      m.dir === "in" &&
      (m.id.startsWith("sms_") || m.id.startsWith("junk_") || m.id.startsWith("sys_")) &&
      !!m.options &&
      m.options.length > 0
    );
  }
  const TONE_LABEL: Record<string, string> = { warm: "友好", neutral: "平淡", cold: "消极" };
  function replyScenarioSms(m: SmsMessage, optionIndex: number): void {
    const r = replySms(gameState, m.id, optionIndex);
    showToast(r.text);
    if (r.ok) playSound("phone");
  }
  /** v1.39 打开会话：把该会话内所有未回复消息标记为已读（通知可消除） */
  function openThread(key: string): void {
    wechatThread = key;
    const t = smsThreads.find((x) => x.key === key);
    if (t) for (const m of t.msgs) markSmsRead(gameState, m.id);
  }
  /** v1.39 全部已读：清空所有未读角标 */
  function markAllRead(): void {
    for (const m of gameState.smsInbox) markSmsRead(gameState, m.id);
    showToast("已全部标记为已读");
  }
  /** v1.39 会话内是否还有未回复的场景短信（有则隐藏底部语气条，避免两套回复入口打架） */
  function hasPendingScenario(msgs: SmsMessage[]): boolean {
    return msgs.some((m) => isScenarioSms(m) && !m.replied);
  }
  /** 当前会话对应的联系人（妈妈/爸爸/房东…）；奶奶/朋友/老同学等场景发送人不是联系人 */
  const threadContact = $derived(getContact(gameState, wechatThread ?? ""));

  /** v1.3 Moments：动态流（自动倒序，unshift 已保证最新在前） */
  /** v1.3b4 朋友圈仅显示自己与联系人的动态；论坛/市民帖由 forum 独占 */
  const momentsFeed = $derived(momentsPostsOf(gameState));
  /** v1.3 Moments 发帖编辑器状态 */
  let momentDraft = $state("");
  let momentCat = $state<"daily" | "fun" | "task">("daily");
  /** v1.3 Moments 评论输入：postId -> 文本 */
  let commentDraft = $state<Record<string, string>>({});
  /** v1.3 Moments 展开评论的帖子 id */
  let expandedPost = $state<string | null>(null);

  function postMoment(): void {
    const text = momentDraft.trim();
    if (!text) { showToast("说点什么吧"); return; }
    createPost(gameState, { text, category: momentCat });
    momentDraft = "";
    showToast("🌈 已发布到 Moments");
    playSound("coin");
  }
  function likeMoment(postId: string): void {
    toggleSelfLike(gameState, postId);
  }
  function sendComment(postId: string): void {
    const text = (commentDraft[postId] ?? "").trim();
    if (!text) return;
    commentOnPost(gameState, postId, {
      id: `c_self_${postId}_${Date.now().toString(36)}`,
      authorId: "self",
      authorName: "我",
      authorIcon: "🙂",
      text,
      day: gameDayLocal(),
    });
    commentDraft[postId] = "";
  }
  /** 本地游戏日（用于评论时间戳） */
  function gameDayLocal(): number {
    const t = gameState.time;
    return (t.year - 2026) * 360 + (t.month - 1) * 30 + (t.day - 1);
  }
  /** 模拟联系人/市民对主角帖子的互动（调试/演示用，正式游戏由跨天 tick 触发） */
  function simulateMyPostReactions(postId: string): void {
    const reactors = allCitizens().map((c) => ({ id: c.id, name: c.name, icon: c.avatar }));
    const r = simulateReactionsFor(gameState, postId, reactors);
    showToast(`收到 ${r.likes} 赞 / ${r.comments} 评论`);
  }

  /** v1.3 外卖：菜单 + 进行中/可领取订单（响应式） */
  const takeoutMenu = TAKEOUT_MENU;
  const takeoutPending = $derived(activeTakeout(gameState));
  const takeoutReady = $derived(arrivedTakeout(gameState));
  function orderTakeout(itemId: string): void {
    const r = placeTakeout(gameState, itemId);
    showToast(r.text);
    if (r.ok) playSound("coin");
  }
  function receiveTakeout(orderId: string): void {
    const r = claimTakeoutOrder(gameState, orderId);
    showToast(r.text);
    if (r.ok) playSound("eat");
  }

  /** v1.3 网购：目录 + 进行中/可领取订单 */
  const shopCatalog = SHOP_CATALOG;
  const shopPending = $derived(activeShop(gameState));
  const shopReady = $derived(arrivedShop(gameState));
  function orderShop(itemId: string): void {
    const r = placeShopOrder(gameState, itemId);
    showToast(r.text);
    if (r.ok) playSound("coin");
  }
  function receiveShop(orderId: string): void {
    const r = claimShopOrder(gameState, orderId);
    showToast(r.text);
    if (r.ok) playSound("success");
  }

  /** v1.3 直播：前置校验 + 开播 */
  const liveReady = $derived(canLive(gameState));
  const liveDoneToday = $derived(liveToday(gameState));
  function goLive(): void {
    const r = startLive(gameState);
    showToast(r.text);
    if (r.ok) playSound("success");
  }

  /** v1.3 论坛为笔记本专属（见 LaptopDesktopView），手机端不提供入口 */


  const family = $derived(getFamily(gameState.family));

  /** 待办（原任务栏）：工作任务 / 每日目标 / 剧情人情债 */
  const dailyGoals = $derived(gameState.dailyGoals ?? []);
  const quests = $derived(activeQuests(gameState));
  const pendingCount = $derived(quests.filter((q) => q.status === "pending").length);
  const todayIsRest = $derived.by(() => {
    const jid = gameState.career.jobId;
    if (!jid) return false;
    const job = getJobDef(jid);
    return job ? isRestDayFor(job, gameState.time) : false;
  });

  const storyCards = $derived(activeStoryCards(gameState));
  const storyArc = $derived(currentArc(gameState));
  const gamblerActive = $derived(
    !!gameState.story.activeCards.find((a) => a.cardId === "neutral_gambler_arrives" && a.status === "active"),
  );
  const storyConscience = $derived(gameState.story.conscience);
  const storyMoneyArc = $derived(!!storyArc && storyArc.goalTotal > 0);
  const storyGoalPct = $derived(storyGoalProgress(gameState));
  const storyGoalTxt = $derived(storyGoalDesc(gameState));
  const storyHint = $derived(storyStageHint(gameState));
  const storyNext = $derived(storyNextDrawIn(gameState));
  const storyDeadline = $derived(storyDeadlineLeft(gameState));
  const storyStage = $derived(storyStageName(gameState));
  const storyFailed = $derived(gameState.story.failedObligations);
  const storyGoalGap = $derived(arcGoalGap(gameState));

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

  function actionText(q: Quest): string {
    if (!q.locationId || gameState.locationId === q.locationId) return "▶ 开工";
    const loc = getLocation(q.locationId);
    return `🚶 前往（${travelLabel(travelHours(gameState, loc))}）`;
  }

  function doQuest(q: Quest): void {
    if (q.status !== "pending") return;
    if (gameState.player.attrs.stamina < FATIGUE_WARN_THRESHOLD && gameState.player.attrs.stamina > 0) {
      showToast("😮‍💨 很累了，需要休息一下");
    }
    if (q.locationId && gameState.locationId !== q.locationId) {
      const mv = moveTo(gameState, q.locationId);
      if (!mv.ok) {
        showToast(mv.reason ?? "过不去");
        return;
      }
      playSound("walk");
      const late = lateness(gameState, q);
      if (late > 0) showToast(`赶到时已经迟了 ${formatDuration(late)}`);
      return;
    }
    const r = workQuestJob(gameState, q);
    if (r.ok && r.result) {
      const ev = rollEvent(gameState);
      if (ev) uiState.pendingEvent = ev;
      const job = getJobDef(q.jobId ?? "");
      presentJobResult(r.result, getMiniGameConfigFor(gameState, q.jobId ?? ""), job ? { id: job.id, name: job.name, icon: job.icon } : { id: q.jobId ?? "", name: "工作", icon: "💼" });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  /** 剧情模式：打开意外卡弹窗 */
  function openStoryCard(cardId: string): void {
    uiState.storyCardPayload = { cardId };
    uiState.modal = "storyCard";
  }

  /** 剧情模式：寄钱回家（转入目标资金） */
  function remit(amount: number): void {
    const r = remitToFamily(gameState, amount);
    if (!r.ok) showToast(r.reason ?? "寄不了");
    else showToast(`💌 已寄出 ${amount} 元`);
  }

  /** v1.20 手机小游戏清单 */
  const PHONE_GAMES = [
    { id: "minesweeper", name: "扫雷", icon: "💣", desc: "翻开所有非雷格即满分" },
    { id: "sokoban", name: "推箱子", icon: "📦", desc: "通关全部关卡即满分" },
    { id: "snake", name: "贪吃蛇", icon: "🐍", desc: "吃到 20 个食物即满分" },
    { id: "2048", name: "2048", icon: "🎯", desc: "合成出 2048 即满分" },
  ] as const;
  const phonePerfectUnlocked = $derived(PHONE_GAMES.filter((g) => gameState.flags[`phone_game_perfect_${g.id}`]));

  /** v1.25 已安装的游戏（需在应用市场下载后才能玩） */
  const installedGames = $derived(PHONE_GAMES.filter((g) => gameState.flags[`app_game_${g.id}`]));
  /** v1.3 应用市场商品清单（来自 apps.ts 注册表，含游戏/外卖/消费/内容类 App） */
  /** v1.25 应用市场下载 */
  function installApp(flag: string, name: string): void {
    gameState.flags[flag] = true;
    showToast(`✅ 已安装：${name}`);
    playSound("coin");
  }
  /** v1.25 兼职外卖接单（下载 App 后可用）：先结算收入，再弹送单小游戏加成 */
  function onDeliveryOrder(): void {
    const r = deliveryParttime(gameState);
    if (!r.ok) {
      showToast(r.reason ?? "暂时无法接单");
      return;
    }
    playSound("cashier");
    presentJobResult(
      { actionId: "job_delivery", deltas: r.deltas },
      getMiniGameConfigFor(gameState, "job_delivery"),
      { id: "job_delivery", name: "外卖接单（兼职）", icon: "🛵" },
    );
  }

  /** v1.20 隐藏成就：任意一个游戏满分 → 一次性 +30 元 + 心情 */
  function onPhoneGamePerfect(gameId: string): void {
    const flag = `phone_game_perfect_${gameId}`;
    if (gameState.flags[flag]) return;
    gameState.flags[flag] = true;
    gameState.player.money += 30;
    gameState.player.attrs.mood = Math.min(100, gameState.player.attrs.mood + 5);
    pushLog(gameState, "🏆", `隐藏成就解锁：「${gameId}」满分！奖金 +30 元`);
    showToast("🏆 隐藏成就解锁：游戏满分！+30 元");
    playSound("success");
  }

  /** v0.94 资产：净资产 / 投资组合 / 载具 / 奢侈品 */
  // v1.3b6 手机端不显示投资；净资产 = 当前现金（PC 端「投资 App」展示定期存款并按月计息）
  const netWorth = $derived(gameState.player.money);
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

  /** 返回手机桌面（应用内重置，不关闭整个手机表面） */
  function goHome(): void {
    app = "home";
    result = null;
    phoneGame = null;
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

  function toneLabel(tone: FamilyMessageScenario["options"][number]["tone"]): string {
    return tone === "warm" ? "暖心" : tone === "cold" ? "冷淡" : "平实";
  }

  /** 音效开关（本地镜像，持久化在 audio 模块） */
  let muted = $state(isMuted());
  function onMute(): void {
    muted = toggleMute();
  }

  /** v1.11 音乐/音效独立音量（本地镜像 + 持久化） */
  let phoneBgmVol = $state(getBgmVolume());
  let phoneSfxVol = $state(getSfxVolume());
  function onPhoneBgmVol(v: number): void {
    phoneBgmVol = v;
    setBgmVolume(v);
  }
  function onPhoneSfxVol(v: number): void {
    phoneSfxVol = v;
    setSfxVolume(v);
  }

  /** 设置页：重置全部存档 */
  let resetting = $state(false);
  async function resetSaves(): Promise<void> {
    if (!confirm("确定删除所有存档？此操作不可恢复！")) return;
    resetting = true;
    try {
      await resetAllSaves();
      goHome();
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
      if (req.flag === "item_certificate" && gameState.flags["item_training_cert"]) {
        parts.push(`培训证书已解锁`);
      } else if (isReferred(gameState, job.id)) {
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
    goHome();
  }
</script>

<div class="phone" class:panel={variant === "panel"} data-phone-skin={gameState.phoneSkin ?? "default"} onclick={(e) => e.stopPropagation()}>
  <div class="p-top">
    <div class="p-status">
      <span class="p-signal" title="信号良好">📶</span>
      <span class="p-time">{formatTime(gameState.time.hour, gameState.time.minute)}</span>
      <span class="p-date">{statusDate}</span>
    </div>
    <button class="p-close" onclick={() => onClose()} title="关闭手机">✕</button>
  </div>

  <div class="phone-screen" onwheel={(e) => { e.stopPropagation(); }}>
  {#key app}
  <div class="p-content" in:fade={{ duration: 150 }} out:fade={{ duration: 100 }}>
  {#if app === "home"}
    <div class="p-hero">
      <div class="p-hero-avatar">📱</div>
      <div class="p-hero-info">
        <div class="p-hero-label dim">我的都市</div>
        <div class="p-hero-balance">{formatMoney(gameState.player.money)}</div>
        <div class="p-hero-sub dim">{family?.name ?? ""}家庭 · {formatTime(gameState.time.hour, gameState.time.minute)}</div>
      </div>
    </div>
    <!-- 应用：首页统一入口，全部功能默认直达，无需二级菜单 -->
    <div class="apps">
      <button class="app" onclick={() => { app = "todo"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">📋</span>
        <span class="a-name">待办</span>
        {#if gameState.dailyGoals?.some((g) => !g.done)}<span class="app-badge">!</span>{/if}
      </button>
      <button class="app" onclick={() => { app = "call"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">📱</span>
        <span class="a-name">通信</span>
        {#if unreadSms > 0}<span class="app-badge">{unreadSms}</span>{/if}
      </button>
      <button class="app" onclick={() => { app = "game"; result = null; phoneGame = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">🎮</span>
        <span class="a-name">游戏</span>
      </button>
      <button class="app" onclick={() => { app = "study"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">📖</span>
        <span class="a-name">学习</span>
      </button>
      <button class="app" onclick={() => { app = "jobs"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">💼</span>
        <span class="a-name">招聘</span>
      </button>
      <button class="app" onclick={() => { app = "market"; result = null; }}>
        <span class="a-icon">🛍️</span>
        <span class="a-name">应用市场</span>
      </button>
      {#if gameState.flags["app_delivery"]}
        <button class="app" onclick={() => { app = "delivery"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">🛵</span>
        <span class="a-name">外卖接单</span>
        </button>
      {/if}
      <!-- v1.3 社交分支：Moments（类朋友圈）-->
      <button class="app" onclick={() => { app = "moments"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">🌈</span>
        <span class="a-name">Moments</span>
      </button>
      <!-- v1.3 消费侧 App（市场下载后出现）-->
      {#if gameState.flags["app_takeout"]}
        <button class="app" onclick={() => { app = "takeout"; result = null; }}>
          <span class="gi-emoji" style="font-size:26px;line-height:1">🍔</span>
          <span class="a-name">外卖到家</span>
        </button>
      {/if}
      {#if gameState.flags["app_shop"]}
        <button class="app" onclick={() => { app = "shop"; result = null; }}>
          <span class="gi-emoji" style="font-size:26px;line-height:1">🛒</span>
          <span class="a-name">网购商城</span>
        </button>
      {/if}
      {#if gameState.flags["app_live"]}
        <button class="app" onclick={() => { app = "live"; result = null; }}>
          <span class="gi-emoji" style="font-size:26px;line-height:1">📡</span>
          <span class="a-name">直播</span>
        </button>
      {/if}
      <button class="app" onclick={() => { app = "assets"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">📊</span>
        <span class="a-name">资产</span>
      </button>
      <button class="app" onclick={() => { app = "relation"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">💞</span>
        <span class="a-name">关系</span>
      </button>
      <button class="app" onclick={() => { app = "goals"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">🎯</span>
        <span class="a-name">目标</span>
      </button>
      <button class="app" onclick={() => { app = "tarot"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">🔮</span>
        <span class="a-name">塔罗</span>
      </button>
      <button class="app" onclick={() => { app = "settings"; result = null; }}>
        <span class="gi-emoji" style="font-size:26px;line-height:1">⚙️</span>
        <span class="a-name">设置</span>
      </button>
    </div>

  {:else if app === "todo"}
    <div class="todo-page">
      <div class="app-head">
        <button class="back" onclick={() => (app = "home")}>‹</button>
        <span class="app-title">📋 待办事项</span>
        {#if pendingCount > 0}<span class="count">{pendingCount}</span>{/if}
      </div>
      {#if storyArc}
        <div class="story-section">
          <div class="story-head">
            <span>📜 {storyArc.title}</span>
            <span class="story-goal dim">{storyGoalTxt || storyArc.goal}</span>
          </div>
          {#if storyGoalTxt.length > 0}
            <div class="story-bar">
              <div class="story-fill" style="width:{storyGoalPct}%"></div>
            </div>
            <div class="story-goal-pct dim">{storyGoalPct}%</div>
          {/if}
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
              <span class="gi-emoji" style="font-size:24px;line-height:1">{def.icon}</span>
              <div class="sc-main">
                <div class="sc-title">{def.title}</div>
                <div class="sc-time dim">⏳ {left === 0 ? "今天必须处理" : `剩 ${left} 天`}</div>
              </div>
              <span class="sc-arrow">›</span>
            </button>
          {/each}
        </div>
      {/if}
      {#if dailyGoals.length > 0}
        <div class="daily-goals">
          <div class="dg-head">
            <span class="dg-title">🎯 每日目标</span>
            <span class="dg-progress dim">{dailyGoals.filter((g) => g.done).length}/{dailyGoals.length}</span>
          </div>
          {#each dailyGoals as g}
            <div class="dg-item" class:done={g.done}>
              <span class="dg-check">{g.done ? "✔" : "○"}</span>
              <span class="dg-text">{g.text}</span>
              <span class="dg-reward dim">+{g.reward.mood} 心情</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="q-list">
        {#each quests as q (q.id)}
          {@const u = urgencyOf(q)}
          <div class="q-card {u}">
            <div class="q-top">
              <span class="gi-emoji" style="font-size:22px;line-height:1">{q.icon}</span>
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

  {:else if app === "call"}
    <!-- v1.3b5 微信风通信：会话列表 + 通讯录 + 聊天窗（手机/电脑同步同一 smsInbox） -->
    <div class="app-page wechat-page">
      {#if wechatThread}
        {@const peer = smsThreads.find((t) => t.key === wechatThread) ?? gameState.contacts.find((c) => c.id === wechatThread)}
        <button class="back" onclick={() => (wechatThread = null)}>‹ 会话</button>
        <div class="wc-chat-head">{peer?.name ?? "联系人"}</div>
        <div class="wc-msgs" bind:this={wcMsgsEl}>
          {#each wechatCurrent as m (m.id)}
            {#if m.dir === "out"}
              <div class="wc-row me">
                <div class="wc-bubble me">{(m.replyText && m.replied) ? m.replyText : m.text}</div>
                <span class="wc-av">🙂</span>
              </div>
            {:else}
              <div class="wc-row them">
                <span class="wc-av">{m.senderIcon}</span>
                <div class="wc-bubble them">
                  {m.text}
                </div>
              </div>
              <!-- v1.3b8b 场景短信的三档回复按钮（友好/平淡/消极），恢复前代交互 -->
              {#if isScenarioSms(m) && !m.replied && m.options && m.options.length > 0}
                <div class="wc-opt-group">
                  {#each m.options as opt, i}
                    <button class="wc-opt tone-{opt.tone}" onclick={() => replyScenarioSms(m, i)}>
                      <span class="wc-opt-tone">{TONE_LABEL[opt.tone] ?? "回复"}</span>
                      <span class="wc-opt-label">{opt.label}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          {/each}
          {#if wechatCurrent.length === 0}
            <p class="dim center-hint">还没有消息，发送第一条吧。</p>
          {/if}
        </div>
        <div class="wc-reply">
          {#if threadContact && !hasPendingScenario(wechatCurrent)}
            <button class="wc-call" title="语音通话" onclick={wechatCall}>📞</button>
            <div class="wc-tone-row" role="group" aria-label="回复态度">
              <button class="wc-tone pos" onclick={() => wechatReply("positive")}>😊 积极</button>
              <button class="wc-tone neu" onclick={() => wechatReply("neutral")}>😐 平淡</button>
              <button class="wc-tone neg" onclick={() => wechatReply("negative")}>😔 消极</button>
            </div>
          {:else if !threadContact}
            <div class="wc-noncontact">💬 {smsThreads.find((t) => t.key === wechatThread)?.name ?? "对方"}不是常用联系人，点击上方短信的回复按钮继续对话</div>
          {/if}
        </div>
      {:else}
        <div class="wc-tabs">
          <button class="wc-tab" class:on={wechatTab === "chat"} onclick={() => (wechatTab = "chat")}>💬 会话</button>
          <button class="wc-tab" class:on={wechatTab === "contacts"} onclick={() => (wechatTab = "contacts")}>👥 通讯录</button>
        </div>
        {#if wechatTab === "chat"}
          <div class="page-title">微信{#if unreadSms > 0}<button class="read-all-btn" onclick={markAllRead}>全部已读</button>{/if}</div>
          {#if smsThreads.length === 0}
            <p class="dim center-hint">暂无会话，去通讯录里发条消息吧。</p>
          {:else}
            <div class="sms-list">
              {#each smsThreads as th (th.key)}
                <button class="sms-item" class:unread={th.unread > 0} onclick={() => openThread(th.key)}>
                  <span class="gi-emoji" style="font-size:34px;line-height:1">{th.icon}</span>
                  <div class="sms-body">
                    <div class="sms-head">
                      <span class="c-name">{th.name}</span>
                      {#if th.unread > 0}<span class="sms-new">{th.unread}</span>{/if}
                    </div>
                    <div class="sms-preview dim">{th.last.text || "已读"}</div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="page-title">通讯录（{gameState.contacts.length}）</div>
          <div class="addr-list">
            {#each gameState.contacts as c (c.id)}
              <div class="addr-item">
                <span class="gi-emoji" style="font-size:30px;line-height:1">{c.avatar}</span>
                <div class="addr-body">
                  <div class="addr-head">
                    <span class="c-name">{c.name}</span>
                    <span class="addr-rel dim">{c.title}</span>
                  </div>
                  <div class="addr-intro dim">{c.intro}</div>
                </div>
                <div class="addr-actions">
                  {#if c.canSms}<button class="mini-btn" title="发消息" onclick={() => { openThread(c.id); wechatTab = "chat"; }}>💬</button>{/if}
                  {#if c.canCall}<button class="mini-btn" title="打电话" onclick={() => { openThread(c.id); wechatTab = "chat"; wechatCall(); }}>📞</button>{/if}
                </div>
              </div>
            {/each}
          </div>
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
      {#if phoneGame}
        <button class="back small" onclick={() => (phoneGame = null)}>← 游戏列表</button>
        <div class="page-title">🎮 {PHONE_GAMES.find((g) => g.id === phoneGame)?.name}</div>
        {#if phoneGame === "minesweeper"}
          <PhoneMinesweeper onPerfect={onPhoneGamePerfect} />
        {:else if phoneGame === "sokoban"}
          <PhoneSokoban onPerfect={onPhoneGamePerfect} />
        {:else if phoneGame === "snake"}
          <PhoneSnake onPerfect={onPhoneGamePerfect} />
        {:else if phoneGame === "2048"}
          <Phone2048 onPerfect={onPhoneGamePerfect} />
        {/if}
      {:else}
        <div class="page-title">🎮 手机游戏</div>
        {#if installedGames.length === 0}
          <p class="jobs-hint dim">还没有游戏，先去「应用市场」下载一个吧。</p>
          <button class="big-action" onclick={() => { app = "market"; result = null; }}>🛍️ 前往应用市场</button>
        {:else}
        <button class="big-action" onclick={() => { phoneGame = installedGames[Math.floor(Math.random() * installedGames.length)].id; }}>
          🎲 随便玩一个（随机小游戏）
        </button>
        <div class="g-head">🎲 已安装游戏</div>
        <div class="job-list">
          {#each installedGames as g}
            <button class="job-item" onclick={() => { phoneGame = g.id; result = null; }}>
              <span class="gi-emoji" style="font-size:34px;line-height:1">{g.icon}</span>
              <div class="j-info">
                <div class="j-name">{g.name}</div>
                <div class="j-desc dim">{g.desc}</div>
                {#if gameState.flags[`phone_game_perfect_${g.id}`]}
                  <div class="referral-badge">🏆 已满分</div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
        {/if}
        <button class="big-action ghost" onclick={() => run(() => playGame(gameState), "game")}>
          💤 摸鱼一小时（放松：+心情，-1 小时）
        </button>
        <div class="jobs-group">
          <div class="g-head">🏆 隐藏成就</div>
          {#if phonePerfectUnlocked.length > 0}
            {#each phonePerfectUnlocked as g}
              <div class="hired-banner">🏆 隐藏成就「{g.name}满分」已解锁（+30 元奖金）</div>
            {/each}
          {:else}
            <p class="jobs-hint dim">任意一个游戏拿到满分即可解锁隐藏成就（仅一次奖励）。</p>
          {/if}
        </div>
      {/if}
    </div>

  {:else if app === "market"}
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🛍️ 应用市场</div>
      <p class="jobs-hint dim">下载后应用会出现在手机里；游戏需下载后才能玩。</p>
      <div class="job-list">
        {#each MARKET_APPS as m}
          <div class="job-item">
            <span class="gi-emoji" style="font-size:34px;line-height:1">{m.icon}</span>
            <div class="j-info">
              <div class="j-name">{m.name}</div>
              <div class="j-desc dim">{m.desc}</div>
            </div>
            {#if gameState.flags[m.flag]}
              <span class="referral-badge">✓ 已安装</span>
            {:else}
              <button class="mini-btn" onclick={() => installApp(m.flag, m.name)}>下载</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>

  {:else if app === "delivery"}
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🛵 外卖接单（兼职）</div>
      <p class="jobs-hint dim">兼职送外卖，按当前交通工具计酬：步行 35 · 自行车 50 · 三轮车 60 · 电动车 70 · 汽车 90 元/单；影响力越高赚得越多。</p>
      <p class="jobs-hint dim">
        当前档位：
        {resolveVehicle(gameState) === "car" ? "汽车" : resolveVehicle(gameState) === "e_bike" ? "电动车" : resolveVehicle(gameState) === "tricycle" ? "三轮车" : resolveVehicle(gameState) === "bicycle" ? "自行车" : "步行"}
        · {deliveryParttimeBasePay(gameState)} 元/单
      </p>
      <button class="big-action" onclick={onDeliveryOrder}>🛵 开始接单（约 1 小时）</button>
    </div>

    {:else if app === "moments"}
    <!-- v1.3b5 朋友圈：微信风（顶部封面 + 悬浮头像 + 白底单列时间线） -->
    <div class="app-page moments-page">
      <button class="back moments-back" onclick={() => (app = "home")}>← 返回</button>

      <div class="moments-cover">
        <div class="moments-cover-bg"></div>
        <div class="moments-cover-me">
          <span class="mcover-name">我的朋友圈</span>
          <span class="mcover-avatar">🙂</span>
        </div>
      </div>

      <div class="moments-scroll">
        <!-- 顶部发布框（自己发帖功能暂时关闭） -->
        {#if SELF_POST_ENABLED}
          <div class="moments-composer">
            <textarea class="moment-c-input" placeholder="这一刻的想法…" bind:value={momentDraft} rows="2"></textarea>
            <div class="moment-c-tools">
              <div class="seg small">
                <button class="seg-btn" class:on={momentCat === "daily"} onclick={() => (momentCat = "daily")}>日常</button>
                <button class="seg-btn" class:on={momentCat === "fun"} onclick={() => (momentCat = "fun")}>趣事</button>
                <button class="seg-btn" class:on={momentCat === "task"} onclick={() => (momentCat = "task")}>里程碑</button>
              </div>
              <button class="moment-c-pub" onclick={postMoment}>发表</button>
            </div>
          </div>
        {/if}

        {#if momentsFeed.length === 0}
          <div class="moments-empty">
            <div class="me-icon">📷</div>
            <div class="me-title">还没有动态</div>
            <div class="me-sub">多和联系人互动，他们的动态会出现在这里。</div>
          </div>
        {:else}
          {#each momentsFeed as post (post.id)}
            <article class="tl-card">
              <span class="gi-emoji" style="font-size:32px;line-height:1">{post.authorIcon ?? "👤"}</span>
              <div class="tl-main">
                <div class="tl-name">{post.authorName ?? (post.author === "self" ? "我" : "联系人")}</div>
                <div class="tl-text">{post.text}</div>
                <div class="tl-foot">
                  <span class="tl-day">第 {post.day} 天</span>
                  <button class="tl-like" class:liked={post.selfLiked} onclick={() => likeMoment(post.id)}>👍 {post.reactions.length + (post.selfLiked ? 1 : 0)}</button>
                  <button class="tl-cmt" onclick={() => (expandedPost = expandedPost === post.id ? null : post.id)}>💬 {post.comments.length}</button>
                  {#if post.author === "self"}<button class="tl-sim" onclick={() => simulateMyPostReactions(post.id)}>✨ 模拟</button>{/if}
                </div>
                {#if expandedPost === post.id}
                  <div class="tl-comments">
                    {#each post.comments as c (c.id)}
                      <div class="tl-comment"><span class="tlc-name">{c.authorIcon} {c.authorName}：</span>{c.text}</div>
                    {/each}
                    <div class="tl-comment-input">
                      <input placeholder="写评论…" bind:value={commentDraft[post.id]} />
                      <button class="moment-c-pub sm" onclick={() => sendComment(post.id)}>发送</button>
                    </div>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </div>

  {:else if app === "takeout"}
    <!-- v1.3 消费侧：外卖到家 -->
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🍔 外卖到家</div>
      <p class="jobs-hint dim">在线点餐，快餐 / 轻食送上门，约 1 小时送达。</p>

      {#if takeoutReady.length > 0}
        <div class="order-box">
          <div class="order-box-title">📦 待领取</div>
          {#each takeoutReady as o (o.id)}
            <div class="order-row">
              <span>{o.icon} {o.name}</span>
              <button class="mini-btn" onclick={() => receiveTakeout(o.id)}>领取（即食）</button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="menu-grid">
        {#each takeoutMenu as m (m.id)}
          <button class="menu-card" onclick={() => orderTakeout(m.id)}>
            <span class="gi-emoji" style="font-size:30px;line-height:1">{m.icon}</span>
            <span class="menu-name">{m.name}</span>
            <span class="menu-desc dim">{m.desc}</span>
            <span class="menu-price">{formatMoney(m.price)}</span>
          </button>
        {/each}
      </div>

      {#if takeoutPending.length > 0}
        <p class="jobs-hint dim">配送中：{takeoutPending.map((o) => o.name).join("、")}（跨天到达）</p>
      {/if}
    </div>

  {:else if app === "shop"}
    <!-- v1.3 消费侧：网购商城 -->
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🛒 网购商城</div>
      <p class="jobs-hint dim">线上购买商场同款，价格更低，但需 3 天快递配送。</p>

      {#if shopReady.length > 0}
        <div class="order-box">
          <div class="order-box-title">📦 待领取</div>
          {#each shopReady as o (o.id)}
            <div class="order-row">
              <span>{o.icon} {o.name}</span>
              <button class="mini-btn" onclick={() => receiveShop(o.id)}>领取（入包）</button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="menu-grid">
        {#each shopCatalog as m (m.id)}
          <button class="menu-card" onclick={() => orderShop(m.id)}>
            <span class="gi-emoji" style="font-size:30px;line-height:1">{m.icon}</span>
            <span class="menu-name">{m.name}</span>
            <span class="menu-desc dim">{m.cat}</span>
            <span class="menu-row">
              <span class="menu-off">{formatMoney(m.offline)}</span>
              <span class="menu-price">{formatMoney(m.price)}</span>
            </span>

          </button>
        {/each}
      </div>

      {#if shopPending.length > 0}
        <p class="jobs-hint dim">配送中：{shopPending.map((o) => o.name).join("、")}（{shopPending[0].etaDays} 天后到达）</p>
      {/if}
    </div>

  {:else if app === "live"}
    <!-- v1.3 自媒体直播 -->
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">📡 自媒体直播</div>
      {#if !liveReady.ok}
        <p class="jobs-hint dim">{liveReady.reason}（需安装 App + 拥有笔记本）</p>
      {:else}
        <p class="jobs-hint dim">直播才艺赚影响力与打赏，收益随笔记本档位提升。每天限 1 次。</p>
        <div class="live-stat">
          <span>累计影响力：{gameState.player.stats.fame}</span>
          <span>累计直播 fame：{gameState.live?.totalFameGain ?? 0}</span>
        </div>
        <button class="big-action" disabled={liveDoneToday} onclick={goLive}>
          {liveDoneToday ? "今日已直播" : "📡 开始直播（约 1 小时）"}
        </button>
      {/if}
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
              <span class="gi-emoji" style="font-size:34px;line-height:1">{job.icon}</span>
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
              <span class="gi-emoji" style="font-size:34px;line-height:1">{job.icon}</span>
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
        <div class="set-row">
          <span class="set-label">🔊 音效音量 {phoneSfxVol}%</span>
        </div>
        <input type="range" min="0" max="100" value={phoneSfxVol} oninput={(e) => onPhoneSfxVol(parseInt(e.currentTarget.value, 10))} class="zoom-slider" />
        <div class="set-row">
          <span class="set-label">🎵 音乐音量 {phoneBgmVol}%</span>
        </div>
        <input type="range" min="0" max="100" value={phoneBgmVol} oninput={(e) => onPhoneBgmVol(parseInt(e.currentTarget.value, 10))} class="zoom-slider" />
      </div>

      <div class="set-card">
        <div class="set-row">
          <span class="set-label">🎨 界面主题</span>
          <span class="dim" style="font-size:11px;">{SKINS.find((s) => s.id === uiState.skin)?.name}</span>
        </div>
        <ThemePicker compact />
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
        <div class="ast-cash dim">现金（净资产）</div>
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
  {/key}
  </div>

  <!-- 底部导航 -->
  <div class="p-dock">
    <button class="dock-btn" class:on={app === "home"} onclick={() => (app = "home")}>🏠</button>
    <button class="dock-btn" class:on={app === "todo"} onclick={() => { app = "todo"; result = null; }}>
      📋
    </button>
    <button class="dock-btn" class:on={app === "call"} onclick={() => { app = "call"; result = null; }}>
      📱{#if unreadSms > 0}<span class="dock-badge">{unreadSms}</span>{/if}
    </button>
    <button class="dock-btn" class:on={app === "game"} onclick={() => { app = "game"; result = null; phoneGame = null; }}>🎮</button>
    <button class="dock-btn" class:on={app === "settings"} onclick={() => { app = "settings"; result = null; }}>⚙️</button>
  </div>
</div>

<style>
  /* ============ 移动端 UI 重做 · 柔光玻璃（Soft Glass）============ */
  .phone {
    /* 手机是独立设备 UI：固定深色玻璃，不随昼夜主题(data-theme)翻转，
       否则白天 --bg-deep 变 #e9eef7、--bg-card 变 #fff，配合 .hud-scope 浅字 → 白底白字。
       这里在 .phone 子树内把会翻转的令牌钉成深色，强调色(--accent 等)仍随 UI 皮肤联动。 */
    --bg-deep: #10131f;
    --bg-soft: #181c2e;
    --bg-card: #222842;
    --bg-card-hover: #2a3152;
    --border: #333b63;
    --text-main: #eef1ff;
    --text-dim: #a8b2d6;
    --glass: color-mix(in srgb, var(--bg-card) 60%, transparent);
    --glass-2: color-mix(in srgb, var(--bg-card) 80%, transparent);
    --stroke: color-mix(in srgb, var(--text-main) 9%, transparent);
    --stroke-2: color-mix(in srgb, var(--text-main) 15%, transparent);
    --tint: color-mix(in srgb, var(--text-main) 6%, transparent);
    --lift: 0 8px 22px rgba(0, 0, 0, 0.22);
    --lift-lg: 0 16px 40px rgba(0, 0, 0, 0.32);
    position: relative;
    width: 440px;
    height: 780px;
    background: color-mix(in srgb, var(--bg-deep) 90%, #000 6%);
    border-radius: 30px;
    padding: 14px;
    box-shadow:
      var(--lift-lg),
      inset 0 0 0 1px var(--stroke),
      inset 0 1px 0 color-mix(in srgb, var(--text-main) 12%, transparent);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: contain;
  }
  /* 嵌入右侧面板时：撑满可用空间，去掉固定尺寸与夸张圆角 */
  .phone.panel {
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
    border-radius: 18px;
  }
  /* 屏幕背景：柔和渐变 + 顶部光晕 */
  .p-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px 8px;
    flex-shrink: 0;
  }
  .p-time {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  /* v1.3b9 仿手机状态栏：信号 + 时间 + 周几日期 */
  .p-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .p-signal { font-size: 12px; opacity: 0.85; }
  .p-date {
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.8;
    white-space: nowrap;
  }
  .p-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--tint);
    color: var(--text-dim);
    font-size: 12px;
    transition: background 0.18s ease, transform 0.18s ease;
  }
  .p-close:hover {
    background: color-mix(in srgb, var(--text-main) 18%, transparent);
  }
  .p-close:active {
    transform: scale(0.92);
  }
  .phone-screen {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    touch-action: pan-y;
    display: flex;
    flex-direction: column;
    border-radius: 27px;
    background:
      radial-gradient(125% 62% at 50% -18%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 58%),
      linear-gradient(168deg, color-mix(in srgb, var(--bg-card) 50%, var(--bg-deep)), var(--bg-deep));
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-main) 22%, transparent) transparent;
  }
  /* 强制可见滚动条（webkit），确保滚轮/拖拽均有轨道可操作 */
  .phone-screen::-webkit-scrollbar { width: 8px; }
  .phone-screen::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-main) 26%, transparent); border-radius: 999px; }
  .phone-screen::-webkit-scrollbar-track { background: transparent; }
  /* v1.21-beta4：主屏改为 3 列更紧凑网格，单行容纳更多应用 */
  .apps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 14px 16px 22px;
  }
  .app {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 14px 6px;
    border-radius: 16px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    position: relative;
    transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }
  .app:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.28), inset 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .app:active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    transform: translateY(0) scale(0.98);
  }
  .app-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--danger, #ff6b6b);
    color: #fff;
    font-size: 10.5px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  /* 主屏英雄条：余额 / 家庭 */
  .p-hero {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 6px 16px 0;
    padding: 16px 18px;
    border-radius: 20px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, transparent), color-mix(in srgb, var(--accent-2, #6cc6ff) 16%, transparent));
    box-shadow: var(--lift), inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .p-hero-avatar {
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    background: color-mix(in srgb, var(--bg-deep) 55%, transparent);
    box-shadow: inset 0 0 0 1px var(--stroke);
  }
  .p-hero-info {
    min-width: 0;
  }
  .p-hero-label {
    font-size: 12px;
    font-weight: 600;
  }
  .p-hero-balance {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.25;
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
  }
  .p-hero-sub {
    font-size: 12px;
    margin-top: 2px;
  }
  /* 通信分段控件 */
  .comm-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 14px;
    padding: 4px;
    border-radius: 14px;
    background: var(--tint);
    box-shadow: inset 0 0 0 1px var(--stroke);
  }
  .comm-tab {
    flex: 1;
    padding: 9px 6px;
    border-radius: 11px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    position: relative;
    transition: background 0.16s ease, color 0.16s ease;
  }
  .comm-tab:active {
    transform: scale(0.95);
  }
  .comm-tab.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent, #ffd166);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .tab-badge {
    position: absolute;
    top: -4px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--danger, #ff6b6b);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* 联系人分组 */
  .ct-group {
    margin-bottom: 16px;
  }
  .group-label {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent, #ffd166);
    opacity: 0.9;
    margin: 6px 4px 8px;
    padding: 2px 10px;
    display: inline-block;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .ct-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    margin-bottom: 10px;
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
    gap: 8px;
    flex-shrink: 0;
  }
  .mini-btn {
    min-width: 40px;
    height: 40px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: none;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent);
    font-size: 16px;
    cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease;
  }
  .mini-btn:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .mini-btn:active {
    transform: scale(0.94);
  }
  .referral-badge {
    display: inline-block;
    margin-top: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    background: color-mix(in srgb, var(--ok, #7bd88f) 16%, transparent);
    color: color-mix(in srgb, var(--ok, #7bd88f) 75%, var(--text-main));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok, #7bd88f) 35%, transparent);
  }
  .referral-badge.tut {
    background: color-mix(in srgb, var(--accent-2, #6cc6ff) 16%, transparent);
    color: color-mix(in srgb, var(--accent-2, #6cc6ff) 75%, var(--text-main));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-2, #6cc6ff) 35%, transparent);
  }
  .back.small {
    margin-bottom: 8px;
    align-self: flex-start;
  }
  .sms-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sms-item {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    transition: transform 0.14s ease;
  }
  .sms-item:active {
    transform: scale(0.99);
  }
  .sms-item.unread {
    box-shadow: var(--lift), inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
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
    color: #fff;
    background: var(--danger, #ff6b6b);
    padding: 1px 7px;
    border-radius: 999px;
  }
  .sms-preview {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }
  .msg-replied {
    font-size: 11.5px;
    color: var(--ok, #7bd88f);
    font-style: italic;
    margin-top: 6px;
  }
  .a-icon {
    font-size: 24px;
  }
  .a-name {
    font-size: 11.5px;
    font-weight: 600;
  }
  .app-page {
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .back {
    align-self: flex-start;
    font-size: 13px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
  }
  .back:active {
    transform: scale(0.95);
  }
  .page-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-main);
  }
  .read-all-btn {
    margin-left: 8px;
    padding: 2px 10px;
    font-size: 12px;
    color: #07c160;
    background: rgba(7, 193, 96, 0.1);
    border: 1px solid rgba(7, 193, 96, 0.35);
    border-radius: 999px;
    cursor: pointer;
    vertical-align: middle;
  }
  .read-all-btn:hover { background: rgba(7, 193, 96, 0.18); }
  .read-all-btn:active { transform: scale(0.95); }
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .contact {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 14px;
    border-radius: 16px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    transition: transform 0.14s ease;
  }
  .contact:active {
    transform: scale(0.99);
  }
  .c-icon {
    font-size: 22px;
  }
  .c-name {
    font-size: 13px;
    font-weight: 600;
  }
  .c-desc {
    font-size: 11.5px;
    margin-top: 2px;
  }
  .big-action {
    padding: 13px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent);
    font-size: 12px;
    text-align: left;
    line-height: 1.5;
    transition: transform 0.14s ease, background 0.16s ease;
  }
  .big-action:active {
    transform: scale(0.99);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .big-action.ghost {
    background: var(--tint);
    box-shadow: inset 0 0 0 1px var(--stroke);
    color: var(--text-dim);
    font-weight: 600;
  }
  .big-action.ghost:hover {
    background: color-mix(in srgb, var(--text-main) 12%, transparent);
  }
  .job-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .jobs-hint {
    font-size: 11.5px;
    line-height: 1.6;
  }
  /* v1.3 外卖/网购：菜单网格 + 订单盒 */
  .menu-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .menu-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    text-align: left;
    padding: 12px;
    border-radius: 14px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    color: var(--text-main);
    cursor: pointer;
    transition: transform 0.14s ease, border-color 0.15s ease;
  }
  .menu-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent, #ffd166);
  }
  .menu-card:active { transform: scale(0.98); }
  .menu-icon { font-size: 22px; }
  .menu-name { font-size: 13px; font-weight: 600; }
  .menu-desc { font-size: 11.5px; line-height: 1.45; }
  .menu-price { font-size: 12px; color: var(--accent); font-weight: 600; margin-top: 2px; }
  .menu-row { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
  .menu-off { font-size: 10.5px; color: var(--text-dim); text-decoration: line-through; }
  .menu-save { font-size: 10px; color: var(--ok, #7bd88f); margin-top: 1px; }
  .order-box {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px var(--stroke);
  }
  .order-box-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
  .order-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; padding: 5px 0;
  }
  .live-stat {
    display: flex; gap: 16px; flex-wrap: wrap;
    font-size: 12px; color: var(--text-dim);
    margin: 10px 0 14px;
  }
  .job-item {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 14px;
    border-radius: 16px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    transition: transform 0.14s ease;
  }
  .job-item:active {
    transform: scale(0.99);
  }
  .j-icon {
    font-size: 20px;
    flex-shrink: 0;
  }
  .j-info {
    flex: 1;
    min-width: 0;
  }
  .j-name {
    font-size: 13px;
    font-weight: 600;
  }
  .j-desc {
    font-size: 11px;
    margin-top: 2px;
  }
  .j-time {
    font-size: 11px;
    color: var(--warn);
    margin-top: 3px;
  }
  .j-req {
    font-size: 10.5px;
    color: var(--accent-2, #6cc6ff);
    margin-top: 3px;
  }
  .j-lock {
    font-size: 10.5px;
    color: var(--danger);
    margin-top: 3px;
  }
  .jobs-group {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .g-head {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.4px;
    padding-left: 4px;
  }
  .hired-banner {
    background: color-mix(in srgb, var(--ok, #7bd88f) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok, #7bd88f) 34%, transparent);
    color: color-mix(in srgb, var(--ok, #7bd88f) 72%, var(--text-main));
    padding: 10px 14px;
    border-radius: 14px;
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
    flex-shrink: 0;
  }
  .result-bar {
    margin: 10px 16px 16px;
    padding: 12px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
    font-size: 12.5px;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
  .r-deltas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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
    gap: 14px;
  }
  .set-card {
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .set-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .set-label {
    font-size: 13px;
    font-weight: 600;
  }
  .switch {
    position: relative;
    min-width: 58px;
    height: 32px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 38%, transparent);
    color: var(--danger);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 12px;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
  }
  .switch:active {
    transform: scale(0.95);
  }
  .switch.on {
    background: color-mix(in srgb, var(--ok, #7bd88f) 18%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok, #7bd88f) 42%, transparent);
    color: color-mix(in srgb, var(--ok, #7bd88f) 72%, var(--text-main));
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
    gap: 12px;
  }
  .cl-entry {
    border-left: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
    padding-left: 10px;
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
    margin: 5px 0 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cl-notes li {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.55;
  }
  .danger-zone {
    box-shadow: var(--lift), inset 0 0 0 1px color-mix(in srgb, var(--danger) 40%, transparent);
  }
  .btn-danger {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    box-shadow: inset 0 0 0 1px var(--danger);
    color: var(--danger);
    font-weight: 700;
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 12.5px;
  }
  .center-hint {
    text-align: center;
    font-size: 12px;
    margin: 16px 0;
    line-height: 1.6;
  }
  .msg-card {
    background: var(--glass-2);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    border-radius: 16px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }
  .reply-opt {
    flex: 1 1 120px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--glass);
    box-shadow: inset 0 0 0 1px var(--stroke), inset 0 0 0 1px color-mix(in srgb, var(--accent-2, #6cc6ff) 50%, transparent);
    transition: transform 0.14s ease, background 0.16s ease;
  }
  .reply-opt:active {
    transform: scale(0.99);
  }
  .reply-opt.tone-warm {
    box-shadow: inset 0 0 0 1px var(--stroke), inset 0 0 0 1px color-mix(in srgb, var(--ok, #7bd88f) 55%, transparent);
  }
  .reply-opt.tone-neutral {
    box-shadow: inset 0 0 0 1px var(--stroke), inset 0 0 0 1px color-mix(in srgb, var(--accent-2, #6cc6ff) 55%, transparent);
  }
  .reply-opt.tone-cold {
    box-shadow: inset 0 0 0 1px var(--stroke), inset 0 0 0 1px color-mix(in srgb, var(--danger) 55%, transparent);
  }
  .r-tone {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-main) 10%, transparent);
    flex-shrink: 0;
  }
  .reply-opt.tone-warm .r-tone {
    color: color-mix(in srgb, var(--ok, #7bd88f) 78%, var(--text-main));
  }
  .reply-opt.tone-neutral .r-tone {
    color: color-mix(in srgb, var(--accent-2, #6cc6ff) 78%, var(--text-main));
  }
  .reply-opt.tone-cold .r-tone {
    color: color-mix(in srgb, var(--danger) 80%, var(--text-main));
  }
  .r-label {
    font-size: 11.5px;
  }
  /* 塔罗图鉴页 */
  .ach-page {
    gap: 12px;
  }
  /* 资产页 */
  .ast-net {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 28%, var(--bg-deep)), color-mix(in srgb, var(--accent-2, #6cc6ff) 22%, var(--bg-deep)));
    border-radius: 18px;
    padding: 16px 18px;
    margin-bottom: 14px;
    text-align: center;
    box-shadow: var(--lift), inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
  }
  .ast-net-label {
    font-size: 11px;
  }
  .ast-net-value {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    margin: 3px 0;
    color: var(--text-main);
  }
  .ast-cash {
    font-size: 11px;
  }
  .ast-card {
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    border-radius: 16px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .ast-card .h2 {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .ast-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    padding: 5px 0;
  }
  .ast-value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ast-inv {
    border-top: 1px dashed var(--stroke-2);
    padding: 6px 0;
  }
  .ast-inv:first-of-type {
    border-top: none;
  }
  .ast-buy {
    margin-top: 10px;
    border-top: 1px dashed var(--stroke-2);
    padding-top: 10px;
  }
  .ast-buy-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }
  .ast-prod {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  .ast-input {
    width: 72px;
    background: color-mix(in srgb, var(--bg-deep) 60%, transparent);
    box-shadow: inset 0 0 0 1px var(--stroke-2);
    border: none;
    border-radius: 10px;
    color: var(--text-main);
    padding: 7px 8px;
    font-size: 12px;
    text-align: right;
  }
  .ast-input:focus {
    outline: none;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .btn-sm {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    font-weight: 700;
  }
  /* 目标清单 */
  .goals-done {
    text-align: center;
    padding: 36px 16px;
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
    gap: 12px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .goal-item.done {
    opacity: 0.6;
  }
  .goal-item.active {
    box-shadow: var(--lift), inset 0 0 0 1px color-mix(in srgb, var(--accent-2, #6cc6ff) 55%, transparent);
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
    margin-top: 3px;
  }
  .goal-hint {
    font-size: 11px;
    color: color-mix(in srgb, var(--accent-2, #6cc6ff) 80%, var(--text-main));
    margin-top: 5px;
  }
  /* 缩放滑块 */
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
    color: var(--text-dim);
  }
  /* 底部导航 */
  .p-dock {
    display: flex;
    gap: 2px;
    padding: 5px 6px;
    background: var(--tint);
    border-top: 1px solid var(--stroke);
    flex-shrink: 0;
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
    transition: background 0.15s ease;
  }
  .dock-btn:active {
    transform: scale(0.92);
  }
  .dock-btn.on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
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

  /* ============ 手机皮肤：rice / flower / fruit ============ */
  .phone[data-phone-skin="rice"] {
    background: #20242b;
    border-color: #9aa4b2;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .phone[data-phone-skin="rice"] .p-time,
  .phone[data-phone-skin="rice"] .p-hero-label,
  .phone[data-phone-skin="rice"] .p-hero-sub,
  .phone[data-phone-skin="rice"] .a-name {
    color: #2a2f36;
  }
  .phone[data-phone-skin="rice"] .p-hero {
    background: linear-gradient(135deg, rgba(154,164,178,0.35), rgba(154,164,178,0.18));
    box-shadow: var(--lift), inset 0 0 0 1px rgba(154,164,178,0.4);
  }
  .phone[data-phone-skin="rice"] .app {
    background: rgba(255, 255, 255, 0.75);
    box-shadow: var(--lift), inset 0 0 0 1px rgba(154,164,178,0.3);
  }
  .phone[data-phone-skin="rice"] .p-hero-balance,
  .phone[data-phone-skin="rice"] .a-name,
  .phone[data-phone-skin="rice"] .page-title {
    color: #2a2f36;
  }

  .phone[data-phone-skin="flower"] {
    background: #3a2333;
    border-color: #e8a0c0;
    box-shadow: 0 8px 24px rgba(232, 160, 192, 0.3);
  }
  .phone[data-phone-skin="flower"] .p-time,
  .phone[data-phone-skin="flower"] .p-hero-label,
  .phone[data-phone-skin="flower"] .p-hero-sub {
    color: #5c3040;
  }
  .phone[data-phone-skin="flower"] .p-hero {
    background: linear-gradient(135deg, rgba(232,160,192,0.4), rgba(232,160,192,0.2));
    box-shadow: var(--lift), inset 0 0 0 1px rgba(232,160,192,0.5);
  }
  .phone[data-phone-skin="flower"] .app {
    background: rgba(255, 255, 255, 0.7);
    box-shadow: var(--lift), inset 0 0 0 1px rgba(232,160,192,0.3);
  }
  .phone[data-phone-skin="flower"] .p-hero-balance,
  .phone[data-phone-skin="flower"] .a-name,
  .phone[data-phone-skin="flower"] .page-title {
    color: #5c3040;
  }

  .phone[data-phone-skin="fruit"] {
    background: #0d1117;
    border-color: #58a6ff;
    box-shadow: 0 8px 28px rgba(88, 166, 255, 0.35);
  }
  .phone[data-phone-skin="fruit"] .p-time {
    color: #9ecbff;
  }
  .phone[data-phone-skin="fruit"] .p-hero {
    background: linear-gradient(135deg, rgba(88,166,255,0.35), rgba(88,166,255,0.18));
    box-shadow: var(--lift), inset 0 0 0 1px rgba(88,166,255,0.5);
  }
  .phone[data-phone-skin="fruit"] .app {
    background: rgba(88, 166, 255, 0.12);
  }
  .phone[data-phone-skin="fruit"] .p-hero-balance,
  .phone[data-phone-skin="fruit"] .a-name,
  .phone[data-phone-skin="fruit"] .page-title {
    color: #dcebff;
  }

  /* ===== 待办（原任务栏）页 ===== */
  .todo-page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    gap: 8px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .todo-page .app-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .todo-page .back {
    font-size: 18px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 0 4px;
    cursor: pointer;
    line-height: 1;
  }
  .todo-page .app-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
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
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
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
    color: var(--text-main);
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
  .q-count.warn { color: var(--warn, #ffb347); }
  .q-count.urgent,
  .q-count.over { color: var(--danger, #ff6b6b); }
  .q-count.done { color: var(--ok, #6ee7a8); }
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
    color: var(--text-main);
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

  /* ===== 每日目标 ===== */
  .daily-goals {
    background: rgba(123, 216, 143, 0.07);
    border: 1px solid rgba(123, 216, 143, 0.22);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
  }
  .dg-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
  }
  .dg-progress {
    font-size: 10.5px;
    font-weight: 600;
  }
  .dg-item {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-main, #eef1ff);
    transition: opacity 0.2s ease;
  }
  .dg-check {
    font-size: 13px;
    color: var(--text-dim, #9aa3c7);
    width: 14px;
    text-align: center;
  }
  .dg-item.done .dg-check { color: var(--ok, #7bd88f); }
  .dg-item.done .dg-text {
    text-decoration: line-through;
    opacity: 0.55;
  }
  .dg-reward {
    font-size: 10.5px;
    margin-left: auto;
  }

  /* ===== 剧情模式：人情债 ===== */
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
    color: var(--text-main);
    cursor: pointer;
  }
  .story-card.urgent {
    background: rgba(255, 107, 107, 0.1);
    border-color: rgba(255, 107, 107, 0.45);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .sc-icon { font-size: 16px; }
  .sc-main { flex: 1; min-width: 0; }
  .sc-title { font-size: 12px; font-weight: 700; }
  .sc-time { font-size: 10px; }
  .sc-arrow {
    color: var(--text-dim, #93a0bd);
    font-size: 14px;
  }

  /* ===== v1.3b4 Moments 社交：类微信朋友圈（浅色主题） ===== */
  .moments-page {
    gap: 0;
    padding: 0 !important;
    background: #f5f6f8 !important;
    color: #1a1a1a;
    overflow: hidden;
    position: relative;
  }
  .moments-back {
    position: absolute; top: 6px; right: 8px; z-index: 5;
    background: rgba(255, 255, 255, 0.78) !important;
    border: 1px solid rgba(0, 0, 0, 0.08) !important;
    color: #333 !important;
    padding: 3px 10px !important;
    font-size: 11.5px !important;
    border-radius: 4px !important;
  }
  /* v1.3b5 朋友圈微信风：顶部封面 + 悬浮头像 + 白底单列时间线 */
  .moments-cover {
    position: relative; height: 116px;
    flex-shrink: 0; overflow: hidden;
  }
  .moments-cover-bg {
    position: absolute; inset: 0;
    background: linear-gradient(150deg, #2b5876 0%, #4e4376 55%, #6a5b8c 100%);
  }
  .moments-cover-me {
    position: absolute; right: 14px; bottom: -22px;
    display: flex; align-items: flex-end; gap: 8px;
  }
  .mcover-name { color: #fff; font-size: 15px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,.5); margin-bottom: 4px; }
  .mcover-avatar {
    width: 50px; height: 50px; border-radius: 6px;
    background: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 28px; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3);
  }
  .moments-scroll {
    flex: 1; min-height: 0; overflow-y: auto;
    background: #f5f6f8; padding-top: 30px;
    /* v1.3b9 滚轮适配 */
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }
  .moments-scroll::-webkit-scrollbar { width: 6px; }
  .moments-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,.18); border-radius: 999px; }
  /* 右侧帖子流（白底卡片） */
  .moments-feed {
    flex: 1; min-width: 0;
    background: #f5f6f8;
    display: flex; flex-direction: column;
    padding: 0 10px 12px 10px;
  }
  .moments-empty {
    text-align: center; padding: 30px 12px; color: #909499;
  }
  .me-icon { font-size: 40px; opacity: .5; margin-bottom: 8px; }
  .me-title { font-size: 14px; color: #576b95; font-weight: 600; }
  .me-sub { font-size: 12px; margin-top: 4px; }
  /* 顶部发布框 */
  .moments-composer {
    background: #ffffff;
    border: 1px solid #e6e8eb;
    border-radius: 6px;
    padding: 8px;
    display: flex; flex-direction: column; gap: 6px;
    margin-bottom: 10px;
  }
  .moment-c-input {
    flex: 1; width: 100%; box-sizing: border-box;
    background: #f5f6f8;
    border: 1px solid #e6e8eb;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 12.5px; color: #222;
    outline: none; resize: none;
    font-family: inherit;
  }
  .moment-c-input:focus { border-color: #c9ccd1; }
  .moment-c-tools {
    display: flex; justify-content: space-between; align-items: center; gap: 6px;
    padding-top: 4px;
    border-top: 1px solid #eef0f3;
  }
  .moment-c-tools .seg.small .seg-btn { padding: 3px 7px; font-size: 10.5px; }
  .moment-c-tools .seg.small .seg-btn.on { background: rgba(0, 132, 255, 0.1); color: #0084ff; border-color: #0084ff; }
  .moment-c-pub {
    background: #07c160; border: none; color: #fff;
    padding: 5px 14px; border-radius: 4px;
    font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .moment-c-pub:hover { background: #06ae57; }
  .moment-c-pub:active { transform: scale(0.97); }
  .moment-c-pub.sm { padding: 4px 12px; align-self: stretch; }
  /* 时间线卡片 */
  .tl-card {
    display: flex; gap: 10px;
    padding: 12px 10px;
    background: #fff;
    border: 1px solid #e6e8eb; border-radius: 6px;
    margin-bottom: 10px;
  }
  .tl-avatar {
    width: 38px; height: 38px; border-radius: 5px; flex-shrink: 0;
    background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 21px;
  }
  .tl-main { flex: 1; min-width: 0; }
  .tl-name { font-size: 14px; font-weight: 600; color: #576b95; margin-bottom: 3px; }
  .tl-text { font-size: 14px; line-height: 1.55; color: #1a1a1a; white-space: pre-wrap; word-break: break-word; }
  .tl-foot { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
  .tl-day { font-size: 11px; color: #b2b6bb; }
  .tl-like, .tl-cmt, .tl-sim {
    background: transparent; border: none; color: #576b95; cursor: pointer;
    font-size: 12px; padding: 2px 4px; border-radius: 4px;
  }
  .tl-like:hover, .tl-cmt:hover, .tl-sim:hover { background: rgba(0,0,0,.04); }
  .tl-like.liked { color: #f5567b; }
  .tl-comments { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 5px; }
  .tl-comment { font-size: 12.5px; color: #444; background: #f7f7f7; border-radius: 4px; padding: 4px 8px; }
  .tlc-name { color: #576b95; }
  .tl-comment-input { display: flex; gap: 6px; margin-top: 4px; }
  .tl-comment-input input { flex: 1; border: 1px solid #d8dbe0; border-radius: 4px; padding: 5px 8px; font-size: 12px; }
  .moment-head { display: flex; align-items: flex-start; gap: 8px; }
  .moment-avatar {
    width: 36px; height: 36px; border-radius: 4px;
    background: linear-gradient(135deg, #cce8ff 0%, #aedaf5 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .moment-meta { flex: 1; min-width: 0; }
  .moment-name { font-size: 13.5px; font-weight: 600; color: #576b95; line-height: 1.2; }
  .moment-sub { font-size: 10.5px; color: #b2b6bb; margin-top: 2px; }
  .moment-text {
    font-size: 13.5px; line-height: 1.55;
    color: #1a1a1a;
    white-space: pre-wrap; word-break: break-word;
    margin-left: 44px;
  }
  .moment-bar {
    display: flex; align-items: center; gap: 14px;
    margin-left: 44px;
    color: #576b95;
    padding: 4px 0 2px 0;
  }
  .moment-act {
    background: transparent; border: none;
    color: #576b95; cursor: pointer;
    font-size: 11.5px;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .moment-act:hover { background: rgba(0, 0, 0, 0.04); }
  .moment-act.liked { color: #f5567b; }
  .ma-icon { font-size: 13px; }
  .moment-comments {
    background: #f5f6f8;
    border-radius: 4px;
    padding: 6px 8px;
    margin-left: 44px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .moment-comment { font-size: 12px; color: #1a1a1a; line-height: 1.45; }
  .mc-name { color: #576b95; font-weight: 600; }
  .moment-comment-input {
    display: flex; gap: 6px; margin-top: 4px;
    border-top: 1px solid #e6e8eb; padding-top: 6px;
  }
  .moment-comment-input input {
    flex: 1; background: #fff; border: 1px solid #d9dbe0; border-radius: 4px;
    padding: 4px 8px; font-size: 12px; color: #222; outline: none;
    font-family: inherit;
  }
  .moment-comment-input input:focus { border-color: #0084ff; }
  .moment-comment-input .mini-btn {
    background: #576b95; color: #fff;
    border: none; padding: 4px 10px; border-radius: 4px;
    font-size: 11.5px; cursor: pointer;
  }
  /* 空状态 */
  .moments-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
    color: #999; padding: 32px 12px; gap: 6px;
  }
  .me-icon { font-size: 56px; opacity: 0.55; }
  .me-title { font-size: 14px; color: #576b95; font-weight: 600; }
  .me-sub { font-size: 12px; color: #a0a3a8; max-width: 220px; line-height: 1.5; }

  /* ===== v1.3b5 微信通讯（手机端）：会话列表 + 聊天窗 ===== */
  .wechat-page { gap: 0; padding: 0 !important; }
  .wc-tabs {
    display: flex; gap: 0; padding: 0 10px; flex-shrink: 0;
    border-bottom: 1px solid var(--stroke); background: var(--glass);
  }
  .wc-tab {
    flex: 1; background: transparent; border: none; cursor: pointer;
    padding: 12px 0; font-size: 13px; font-weight: 600; color: var(--text-dim);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .wc-tab.on { color: #07c160; border-bottom-color: #07c160; }
  .addr-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
  /* v1.3b9 滚轮适配：通讯录独立滚动 + 细滚动条 */
  .addr-list { overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--text-main) 20%, transparent) transparent; }
  .addr-list::-webkit-scrollbar { width: 6px; }
  .addr-list::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-main) 18%, transparent); border-radius: 999px; }
  .addr-list::-webkit-scrollbar-track { background: transparent; }
  .addr-item {
    display: flex; align-items: center; gap: 10px; padding: 10px;
    background: var(--glass-2); border: 1px solid var(--stroke); border-radius: 10px;
  }
  .addr-av { font-size: 22px; width: 38px; height: 38px; border-radius: 8px;
    background: var(--tint); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .addr-body { flex: 1; min-width: 0; }
  .addr-head { display: flex; align-items: baseline; gap: 8px; }
  .addr-head .c-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
  .addr-rel { font-size: 11px; }
  .addr-intro { font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .addr-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .mini-btn {
    width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--stroke);
    background: var(--glass); font-size: 16px; cursor: pointer; color: var(--text-main);
  }
  .mini-btn:hover { background: var(--tint); }

  .wc-chat-head {
    padding: 12px 14px; font-size: 14px; font-weight: 600; color: var(--text-main);
    border-bottom: 1px solid var(--stroke); background: var(--glass);
    flex-shrink: 0;
  }
  .wc-msgs {
    flex: 1; min-height: 0; overflow-y: auto;
    display: flex; flex-direction: column; gap: 12px;
    padding: 14px 12px;
    /* v1.3b9 滚轮适配：消息区独立滚动 + 平滑滚动 */
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-main) 20%, transparent) transparent;
  }
  .wc-msgs::-webkit-scrollbar { width: 6px; }
  .wc-msgs::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-main) 22%, transparent); border-radius: 999px; }
  .wc-row { display: flex; align-items: flex-start; gap: 8px; }
  /* me 行：bubble 在内左侧 / 头像在外右侧（默认 row 顺序即可） */
  .wc-row.me { justify-content: flex-end; }
  .wc-av {
    font-size: 20px; flex-shrink: 0; width: 30px; height: 30px; border-radius: 5px;
    background: var(--tint); display: flex; align-items: center; justify-content: center;
  }
  .wc-bubble {
    max-width: 72%; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
  }
  .wc-bubble.me { background: #95ec69; color: #1a1a1a; }
  .wc-bubble.them { background: var(--glass-2); color: var(--text-main); border: 1px solid var(--stroke); }
  .wc-reply {
    display: flex; align-items: center; gap: 8px; padding: 10px 12px;
    border-top: 1px solid var(--stroke); background: var(--glass); flex-shrink: 0;
  }
  .wc-call {
    background: transparent; border: none; font-size: 20px; cursor: pointer;
    padding: 4px 6px; border-radius: 6px; color: var(--text-main);
  }
  .wc-call:hover { background: var(--tint); }
  /* v1.3b7 三选回复按钮（真实按钮样式） */
  .wc-tone-row { display: flex; flex: 1; gap: 6px; min-width: 0; }
  .wc-tone {
    flex: 1; min-width: 0; padding: 9px 4px; border-radius: 8px;
    border: 1px solid var(--stroke); background: var(--bg-deep);
    color: var(--text-main); cursor: pointer; font-size: 13px; font-weight: 600;
    font-family: inherit; transition: transform 0.06s ease, background 0.14s ease;
  }
  .wc-tone:hover { background: var(--tint); }
  .wc-tone:active { transform: translateY(1px); }
  .wc-tone.pos { color: #1d7a3f; }
  .wc-tone.neu { color: var(--text-main); }
  .wc-tone.neg { color: #8a4a4a; }

  /* v1.3b8b 场景短信回复按钮（恢复前代三档交互） */
  .wc-opt-group { display: flex; flex-direction: column; gap: 6px; margin: 0 0 4px 38px; }
  .wc-opt {
    display: flex; align-items: center; gap: 8px; text-align: left;
    padding: 8px 10px; border-radius: 8px; border: 1px solid #d8dbe0;
    background: #fff; cursor: pointer; font-family: inherit;
    transition: background 0.14s ease, transform 0.06s ease;
  }
  .wc-opt:hover { background: #f0f4f8; }
  .wc-opt:active { transform: translateY(1px); }
  .wc-opt-tone {
    flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 2px 7px;
    border-radius: 999px; color: #fff;
  }
  .wc-opt.tone-warm .wc-opt-tone { background: #2e9e5b; }
  .wc-opt.tone-neutral .wc-opt-tone { background: #7a8494; }
  .wc-opt.tone-cold .wc-opt-tone { background: #b0564f; }
  .wc-opt-label { font-size: 13px; color: #1f2430; line-height: 1.35; }
  .wc-answered { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cfd4da; color: #5a6472; font-size: 12px; }
  .wc-noncontact { flex: 1; font-size: 12px; color: #8a93a0; padding: 6px 2px; line-height: 1.4; }

</style>
