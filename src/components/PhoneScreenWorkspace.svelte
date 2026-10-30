<script lang="ts">
  import { stockAccountEquity, stockDebtTotal } from "../game/core/stockMath";
  import { socialThreadsOf } from "../game/core/socialInbox";
  import { livingBudgetOf } from '../game/core/livingBudget';
  import { onMount, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { motionDurationMs, motionEasing } from "../lib/motion";
  import { gameState } from "../stores/gameStore.svelte";
import { uiState, showToast, showResult, presentJobResult, uiConfirm, pushModal, openNpcTaskPanel } from "../stores/uiStore.svelte";
  import { npcTaskSummary } from '../game/core/npcTasks';
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
  import type { SmsMessage } from "../game/types";
import { JOB_DEFS, getJobDef, applyForJob, completeWork, deliveryParttime, deliveryOrdersRemaining, rideHailingParttime, rideHailingParttimeBasePay, rideHailingOrdersRemaining, resolveVehicle, previewWork, workStatusReason } from "../game/core/jobs";
  import { checkJobRequirements, describeJobRequirements } from "../game/core/jobRequirements";
  import { getWorkShift, resignationSalaryPreview } from "../game/core/career";
  import { getDifficulty, getMiniGameConfigFor, setDifficulty, type DifficultyTier } from "../game/core/minigame";
  import { locationName, activeQuests } from "../game/core/quests";
  import { getFamily } from "../game/core/families";
  import { formatTime } from "../game/core/time";
  import { formatMoney, signed } from "../lib/format";
  import { playSound, isMuted, toggleMute, unlockAudio, getBgmVolume, setBgmVolume, getSfxVolume, setSfxVolume } from "../lib/audio";
  import { resetAllSaves } from "../lib/save";
  import { MARKET_APPS } from "../game/core/apps";
  import type { PhoneResult } from "../game/core/phone";
  import { smsContact, callContact, getContact, contactSmsTopics, CONTACT_GROUP_LABEL } from "../game/core/contacts";
  import { contactIdFromConversationId, formatSmsTimestamp, groupSmsThreads, normalizeMessages } from "../game/core/sms";
  import { createPost, momentsPostsOf, toggleSelfLike, commentOnPost, simulateReactionsFor } from "../game/core/moments";
  import { allCitizens } from "../game/core/citizens";
  import { claimOrder, activeOrders, arrivedOrders } from "../game/core/orders";
  import { canLive, startLive, liveToday } from "../game/core/live";
  import { moveTo } from "../game/core/actions";
  import { startNetbarSession } from "../game/core/projects";
  import type { Quest } from "../game/types";
  import type { SoundId } from "../game/types";
  import TarotGallery from "./TarotGallery.svelte";
  import RelationApp from "./RelationApp.svelte";
  import PhoneHomeApp from "./PhoneHomeApp.svelte";
  import PhoneAppIcon from "./PhoneAppIcon.svelte";
  import PhoneGameApp from "./PhoneGameApp.svelte";
  import PhoneCalendarApp from "./PhoneCalendarApp.svelte";
  import PhoneSettingsApp from "./PhoneSettingsApp.svelte";
  import WorkPanel from "./WorkPanel.svelte";

  /** v1.3 开关：自己发帖功能（朋友圈/论坛入口）。用户反馈"没什么意义"，暂时关闭。 */
  const SELF_POST_ENABLED = false;
  import { todoCommitmentsOf } from "../game/core/todoSummary";
  import { currentResidenceName } from "../game/core/housing";
  import { VEHICLE_NAMES } from "../game/core/vehicle";
  import { getItem } from "../game/core/items";
  import { netWorth as calculateNetWorth } from "../game/core/difficulty";
  import { companyOverview } from '../game/core/companyOverview';
  import {
    claimNextGrowthHint,
    completeTutorialStep,
    getLongTermGoals,
    isTutorialDone,
    checkTutorialProgress,
    currentTutorialStep,
    TUTORIAL_STEPS,
  } from "../game/core/tutorial";
  import { gameDay, weekdayOf, WEEKDAY_LABEL } from "../game/core/calendar";
  import { eternalChallengeOf } from "../game/core/eternal";
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
  let { onClose = () => {}, variant = "full", initialApp = "home" }: { onClose?: () => void; initialApp?: "home" | "todo" | "jobs"; variant?: "full" | "panel" } = $props();

  type AppId = "home" | "todo" | "calendar" | "jobs" | "call" | "game" | "study" | "settings" | "family" | "tarot" | "assets" | "goals" | "relation" | "market" | "delivery" | "ride_hailing" | "moments" | "live";

  let app = $state<AppId>(untrack(() => initialApp));
  let result = $state<PhoneResult | null>(null);
  let gameOpenToken = $state(0);
  const deliveryVehicle = $derived(resolveVehicle(gameState));
  const deliveryInProgress = $derived(gameState.work?.active?.jobId === "job_delivery" && gameState.work.active.source === "delivery");
  /** v1.20 手机小游戏：当前打开的游戏（null=列表） */
  const unreadSms = $derived(unreadSmsCount(gameState));
  const unreadMoments = $derived(Math.max(0,gameState.social?.unreadMoments??0));
  /** 打开朋友圈即已读。旧实现用 effect 自写 app/wechatTab/unreadMoments（反模式）：
   *  moments 重定向永不可达（无任何入口写 app="moments"），未读清零改在显式点击处理里做。 */
  function openMomentsTab(): void {
    wechatThread = null;
    wechatTab = "moments";
    if (gameState.social && gameState.social.unreadMoments > 0) gameState.social.unreadMoments = 0;
  }
  const longTermGoals = $derived(getLongTermGoals(gameState));
  const activeTutorialStep = $derived(currentTutorialStep(gameState));
  const tutorialFinished = $derived(isTutorialDone(gameState));
  const requiredTutorialSteps = TUTORIAL_STEPS.filter((step) => !step.optional);
  const completedRequiredTutorialSteps = $derived(
    requiredTutorialSteps.filter((step) => gameState.tutorial.done.includes(step.id)).length,
  );
  const growthHintProgressKey = $derived.by(() => {
    const skills = gameState.player?.skills ?? {};
    const relationships = gameState.relationships ?? [];
    return [
      gameState.player?.money ?? 0,
      gameState.area ?? "",
      gameState.region ?? "",
      gameState.locationId ?? "",
      gameState.seen?.locationsVisited?.join(",") ?? "",
      Object.values(skills).join(","),
      relationships.map((relation) => `${relation.npcId}:${relation.state}:${relation.affinity}`).join(","),
      gameState.endingId ?? "",
      gameState.unlockedEndings?.join(",") ?? "",
    ].join("|");
  });

  /** 手机与笔记本统一从稳定 recipient identity 聚合来往消息。 */
  const smsThreads = $derived(groupSmsThreads(gameState));
  const livingBudget = $derived(livingBudgetOf(gameState));

  /** v1.3b5 微信风通信：当前打开的会话 key + 草稿 */
  let wechatThread = $state<string | null>(null);
  let wechatTab = $state<"chat" | "contacts" | "services" | "requests" | "moments">("chat");
  let chatQuery = $state('');
  let composerOpen = $state(false);
  let peerDetails = $state(false);
  const socialThreads = $derived(socialThreadsOf(gameState));
  const messageRequests = $derived(socialThreads.filter(t=>t.channel==='requests'));
  const serviceUnread = $derived(socialThreads.filter(t=>t.channel==='services').reduce((sum,t)=>sum+t.unread,0));
  const visibleThreads = $derived(socialThreads.filter(t=>t.channel===wechatTab &&
    (!chatQuery.trim() || (t.name+' '+t.preview).toLocaleLowerCase().includes(chatQuery.trim().toLocaleLowerCase()))));
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
  $effect(() => {
    if (app !== "call" || !wechatThread) return;
    for (const message of wechatCurrent) {
      if (message.dir === "in" && !message.read && !message.replied) markSmsRead(gameState, message.id);
    }
  });
  /** v1.3b9 状态栏日期（周几 · 月/日） */
  const statusDate = $derived.by(() => {
    const t = gameState.time;
    return `${WEEKDAY_LABEL[weekdayOf(t)]} ${t.month}/${t.day}`;
  });
  /** v1.3b8 微信回复：三选项按钮替代文本输入框。
   *  修复"联系人不存在"：会话线程 key 可能是 sender 名字（历史消息无 contactId），
   *  改用 getContact（id 或 name 双重回退，与 LaptopDesktopView 一致）。 */
  function wechatReply(topicId: string): void {
    if (!wechatThread) return;
    const contactId = contactIdFromConversationId(wechatThread) ?? wechatThread;
    const c = getContact(gameState, contactId)
      ?? gameState.contacts.find((candidate) => candidate.npcId && wechatThread === `npc:${candidate.npcId}`);
    if (!c) { showToast("联系人不存在"); return; }
    const r = smsContact(gameState, c.id, topicId);
    if (r.ok) showToast(r.text);
    else showToast(r.reason ?? r.text ?? "消息发送失败");
  }
  function wechatCall(): void {
    if (!wechatThread) return;
    const c = threadContact;
    if (!c) return;
    const r = callContact(gameState, c.id);
    showToast(r.text);
    if (r.ok) playSound("phone");
  }

  /**
   * v1.3b8b 恢复前代短信回复体验：
   * 场景短信与垃圾短信保留各自的具体回复选项；普通通知不提供假回复。
   * v1.3b5 微信化重构时此入口被遗漏，本轮恢复。
   */
  function isScenarioSms(m: SmsMessage): boolean {
    return m.dir === "in" && !m.replied && Array.isArray(m.options) && m.options.length > 0;
  }
  function replyScenarioSms(m: SmsMessage, optionIndex: number): void {
    const r = replySms(gameState, m.id, optionIndex);
    showToast(r.text);
    if (r.ok) playSound("phone");
  }
  /** v1.39 打开会话：把该会话内所有未回复消息标记为已读（通知可消除） */
  function openThread(key: string): void {
    const contact = getContact(gameState, key);
    const conversationKey = contact ? `contact:${contact.id}` : key;
    wechatThread = conversationKey;
    composerOpen=false; peerDetails=false;
    const t = smsThreads.find((x) => x.key === conversationKey);
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
  const threadContact = $derived.by(() => {
    const contactId = contactIdFromConversationId(wechatThread) ?? wechatThread ?? "";
    return getContact(gameState, contactId)
      ?? gameState.contacts.find((candidate) => candidate.npcId && wechatThread === `npc:${candidate.npcId}`);
  });
  const threadTopics = $derived(threadContact ? contactSmsTopics(gameState, threadContact) : []);

  type AddressCategory = "all" | "recent" | "parent" | "work" | "mentor" | "friend" | "customer" | "special";
  const addressCategoryOptions: Array<{ id: AddressCategory; label: string }> = [
    { id: "all", label: "全部" },
    { id: "recent", label: "最近联系" },
    { id: "parent", label: "家人" },
    { id: "work", label: "工作" },
    { id: "mentor", label: "前辈" },
    { id: "friend", label: "朋友" },
    { id: "customer", label: "顾客" },
    { id: "special", label: "其他" },
  ];
  let addressQuery = $state("");
  let addressCategory = $state<AddressCategory>("all");
  const contactLastActivity = $derived.by(() => new Map(
    smsThreads.flatMap((thread) => {
      const contactId = contactIdFromConversationId(thread.key);
      return contactId ? [[contactId, thread.last.sentAt ?? thread.last.day * 1440] as const] : [];
    }),
  ));
  const addressContacts = $derived.by(() => {
    const query = addressQuery.trim().toLocaleLowerCase();
    return gameState.contacts
      .map((contact, index) => ({ contact, index, lastActivity: contactLastActivity.get(contact.id) }))
      .filter(({ contact, lastActivity }) => {
        const matchesSearch = !query || `${contact.name} ${contact.title} ${contact.intro}`.toLocaleLowerCase().includes(query);
        const matchesCategory = addressCategory === "all"
          || (addressCategory === "recent" ? lastActivity !== undefined
            : addressCategory === "work" ? ["manager", "leader", "employee"].includes(contact.relation)
              : contact.relation === addressCategory);
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => (b.lastActivity ?? -1) - (a.lastActivity ?? -1)
        || b.contact.addedDay - a.contact.addedDay
        || a.index - b.index);
  });
  const addressGroups = $derived.by(() => {
    const grouped = new Map<string, typeof addressContacts>();
    for (const entry of addressContacts) {
      const label = CONTACT_GROUP_LABEL[entry.contact.relation] ?? "其他";
      const current = grouped.get(label) ?? [];
      current.push(entry);
      grouped.set(label, current);
    }
    return [...grouped.entries()];
  });

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
    showToast("🌈 已发布到朋友圈");
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

  const pendingOrders = $derived(activeOrders(gameState));
  const readyOrders = $derived(arrivedOrders(gameState));
  function receiveOrder(orderId: string): void {
    const r = claimOrder(gameState, orderId);
    showToast(r.text);
    if (r.ok) playSound("coin");
  }

  /** v1.3 直播：前置校验 + 开播 */
  const liveReady = $derived(canLive(gameState));
  const liveDoneToday = $derived(liveToday(gameState));
  function goLive(): void {
    const r = startLive(gameState);
    showToast(r.text);
    if (r.ok) playSound("success");
  }
  function prepareLiveComputer(): void {
    if (gameState.locationId === "internet_cafe") {
      const result = startNetbarSession(gameState);
      showToast(result.ok ? "网吧机位已开通，可以开始直播" : result.reason ?? "暂时无法上机");
      return;
    }
    const result = moveTo(gameState, "internet_cafe");
    showToast(result.ok ? "已到网吧，请点击上机开通机位" : result.reason ?? "暂时无法前往网吧");
  }

  /** v1.3 论坛为笔记本专属（见 LaptopDesktopView），手机端不提供入口 */


  const family = $derived(getFamily(gameState.family));

  /** 待办（原任务栏）：工作任务 / 每日目标 / 剧情人情债 */
  const eternalChallenge = $derived(eternalChallengeOf(gameState));
  const quests = $derived(activeQuests(gameState).filter((q) => !q.jobId));
  const pendingCount = $derived(quests.filter((q) => q.status === "pending" || (q.npcTask && q.status === 'active')).length + (gameState.career.jobId && ["early", "working", "travel"].includes(getWorkShift(gameState).phase) ? 1 : 0));
  const todayIsRest = $derived.by(() => {
    const jid = gameState.career.jobId;
    if (!jid) return false;
    const job = getJobDef(jid);
    return job ? getWorkShift(gameState, job).phase === "rest" : false;
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

  type Urgency = "normal" | "warn" | "urgent" | "over" | "done" | "failed";

  function urgencyOf(q: Quest): Urgency {
    if (q.status === "done") return "done";
    if (q.status === "failed" || q.status === "missed") return "failed";
    if (q.npcTask) return npcTaskSummary(gameState, q).urgent ? 'urgent' : 'normal';
    if (q.commission?.commissionId) {
      const deadline = q.commission.deadlineDay ?? q.commission.startDay + q.commission.days;
      const left = deadline - gameDay(gameState.time);
      return left <= 0 ? "urgent" : left <= 1 ? "urgent" : left <= 3 ? "warn" : "normal";
    }
    return "normal";
  }

  function countdownText(q: Quest): string {
    if (q.npcTask) {
      const task = npcTaskSummary(gameState, q);
      return q.status === 'failed' ? `❌ ${q.npcTask.failureReason ?? '委托未完成'}` : q.status === 'done' ? '✅ 已完成 · 查看结果记录' : task.deadlineText;
    }
    if (q.status === "done") return "✅ 已完成";
    if (q.status === "failed") return "❌ 旷工";
    if (q.status === "missed") return "⏳ 已过期";
    if (q.commission?.commissionId) {
      const deadline = q.commission.deadlineDay ?? q.commission.startDay + q.commission.days;
      const left = Math.max(0, deadline - gameDay(gameState.time));
      return left === 0 ? "⏰ 今天是城市委托最后期限" : `⏳ 城市委托 · 剩 ${left} 天`;
    }
    return "查看详情";
  }

  /** 剧情模式：打开意外卡弹窗 */
  function openStoryCard(cardId: string): void {
    uiState.storyCardPayload = { cardId };
    pushModal("storyCard");
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
  /** 兼职外卖完成整班小游戏后，按实际送达报酬结算八小时班次。 */
  function onDeliveryOrder(): void {
    const r = deliveryParttime(gameState);
    if (!r.ok) {
      showToast(r.reason ?? "暂时无法接单");
      return;
    }
    presentJobResult(
      r.result,
      getMiniGameConfigFor(gameState, "job_delivery"),
      { id: "job_delivery", name: "外卖接单（兼职）", icon: "🛵" },
    );
  }
  function endDeliveryWithoutVehicle(): void {
    const session = gameState.work?.active;
    if (!session || session.jobId !== "job_delivery" || session.source !== "delivery" || session.status !== "paused" || resolveVehicle(gameState) !== "none") return;
    // 无车时没有运行中的配送画面；使用已保存的订单收入走原本的提前结束结算。
    const settled = completeWork(gameState, session.id, 0, false, true);
    if (!settled.ok || !settled.result) {
      showToast(settled.reason ?? "暂时无法结束本班，请稍后重试");
      return;
    }
    showResult(settled.result);
  }
  /** 网约车每天开启一班；单场接送游戏结束后按累计送达数结算。 */
  function onRideHailingOrder(): void {
    const r = rideHailingParttime(gameState);
    if (!r.ok) {
      showToast(r.reason ?? "暂时无法接单");
      return;
    }
    const job = getJobDef("job_ride_hailing");
    presentJobResult(
      r.result,
      getMiniGameConfigFor(gameState, "job_ride_hailing"),
      { id: "job_ride_hailing", name: job?.name ?? "网约车接单", icon: job?.icon ?? "🚖" },
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
  const netWorth = $derived(calculateNetWorth(gameState));
  const VEHICLE_TYPES = ["bicycle", "e_bike", "tricycle", "car"] as const;
  /** 载具页同时读取产权记录和 item_* 兼容标记，避免旧档只写 flag 时显示为空。 */
  const vehicleEntries = $derived(
    VEHICLE_TYPES.flatMap((type) => {
      const entry = gameState.vehicles[type];
      if (!entry && !gameState.flags[`item_${type}`]) return [];
      return [{ type, owned: entry?.owned === true || !entry }];
    }),
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
  }

  function openHomeApp(next: AppId): void {
    if (next === "goals") {
      // 睡觉会先结算再跨日；玩家在次日打开目标页时补做边界条件检查。
      const completed = checkTutorialProgress(gameState);
      for (const id of completed) {
        const step = TUTORIAL_STEPS.find((candidate) => candidate.id === id);
        if (step) pushLog(gameState, step.icon, `✔ 新手目标完成「${step.title}」`);
      }
      if (completed.length > 0) {
        const current = currentTutorialStep(gameState);
        pushLog(
          gameState,
          current ? "🎯" : "🎉",
          current
            ? `下一步：${current.def.title} —— ${current.def.desc}`
            : "新手引导全部完成，都市生活正式开始！",
        );
      }
    }
    app = next;
    result = null;
    if (next === "game") gameOpenToken += 1;
  }

  /** 打开手机时尝试接收家人消息（每天至多一条，按概率触发） */
  onMount(() => {
    normalizeMessages(gameState);
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

  // 手机打开后或成长条件变化时最多认领一条，避免读档后多项条件已满足时连续弹窗。
  // flags 写入不作为 effect 依赖；下一次条件变化或再次打开手机才会检查下一条。
  $effect(() => {
    void growthHintProgressKey;
    if (!tutorialFinished) return;
    const hint = untrack(() => claimNextGrowthHint(gameState));
    if (hint) showToast(`${hint.icon} ${hint.hint}`);
  });

  /** 回复家人消息（三条不同态度） */
  function replyToFamily(optionIndex: number): void {
    const scenario = uiState.pendingFamilyMsg;
    if (!scenario) return;
    const r = replyFamilyMessage(gameState, scenario, optionIndex);
    result = r;
    if (r.ok) {
      playSound("phone");
      uiState.pendingFamilyMsg = null;
    } else {
      showToast(r.reason ?? r.text);
    }
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
    if (!(await uiConfirm("确定删除所有存档？此操作不可恢复！", { confirmLabel: "删除全部", danger: true }))) return;
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

  /** v1.42 待办聚合：把已应聘的正式工作与月租承诺一并放进手机待办，避免只显示每日目标。 */
  const todoCommitments = $derived(todoCommitmentsOf(gameState));

  const formalJobs = $derived(JOB_DEFS.filter((j) => j.kind === "formal"));

  /** 核心负责原合同结清与新合同入职，界面只询问换岗意愿。 */
  async function applyJob(jobId: string): Promise<void> {
    const job = getJobDef(jobId);
    if (!job) return;
    const replacing = !!gameState.career.jobId && gameState.career.jobId !== job.id;
    if (replacing) {
      const settlement = resignationSalaryPreview(gameState);
      if (!(await uiConfirm(`确定从「${hiredJob?.name ?? "当前工作"}」换到「${job.name}」？原岗位待发工资 ${formatMoney(settlement)} 元将立即结清。`, { confirmLabel: "结清并换岗" }))) return;
    }
    const applied = applyForJob(gameState, job, replacing);
    if (!applied.ok) {
      showToast(applied.reason ?? "暂时无法入职");
      return;
    }
    playSound("phone");
    const next = getWorkShift(gameState, job);
    showToast(`✅ 已入职 ${job.name}；${next.label}，地点：${locationName(job.locationId)}`);
  }

  /** v1.42：桌面端鼠标滚轮显式驱动手机内层滚动；嵌套列表优先，触底后自然交给外层。 */
  function handlePhoneWheel(event: WheelEvent): void {
    if (app === "home") return;
    const root = event.currentTarget as HTMLElement | null;
    if (!root) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    let node = event.target instanceof HTMLElement ? event.target : root;
    let consumed = false;
    while (node) {
      const canScroll = node.scrollHeight > node.clientHeight;
      const atStart = node.scrollTop <= 0;
      const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      if (canScroll && ((direction > 0 && !atEnd) || (direction < 0 && !atStart))) {
        node.scrollTop += event.deltaY;
        consumed = true;
        break;
      }
      if (node === root) break;
      node = node.parentElement ?? root;
    }
    if (!consumed && root.scrollHeight > root.clientHeight) root.scrollTop += event.deltaY;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div class="phone" class:panel={variant === "panel"} class:app-active={app !== "home"} class:communication-active={app === "call"} data-phone-app={app} data-phone-skin={gameState.phoneSkin ?? "default"} onclick={(e) => e.stopPropagation()}>
  <div class="p-top">
    <div class="p-camera" aria-hidden="true"><i></i></div>
    <div class="p-status">
      <span class="p-signal" title="信号良好">📶</span>
      <span class="p-time">{formatTime(gameState.time.hour, gameState.time.minute)}</span>
      <span class="p-date">{statusDate}</span>
    </div>
    <div class="device-status-icons">
      <svg viewBox="0 0 26 14" width="25" height="13" fill="currentColor" aria-hidden="true"><rect x="0" y="10" width="3" height="4" rx="1"/><rect x="5" y="7" width="3" height="7" rx="1"/><rect x="10" y="4" width="3" height="10" rx="1"/><path d="M17 6q4-4 8 0l-2 2q-2-2-4 0zM20 11l1 2 1-2z"/></svg>
      <span class="device-battery" title="电量充足" aria-hidden="true"><i></i></span>
      <button type="button" class="p-close" onclick={() => onClose()} title="收起手机" aria-label="关机并收起手机">⏻</button>
    </div>
  </div>

  <div class="phone-screen" class:home-screen={app === "home"} onwheel={handlePhoneWheel}>
  {#key app}
  <div class="p-content" in:fade={{ duration: motionDurationMs("--dur-base"), easing: motionEasing("--ease-out") }} out:fade={{ duration: motionDurationMs("--dur-base"), easing: motionEasing("--ease-out") }}>
  {#if app === "home"}
    <PhoneHomeApp
      variant={variant}
      phoneSkin={gameState.phoneSkin ?? "default"}
      familyName={family?.name ?? ""}
      balance={gameState.player.money}
      timeLabel={formatTime(gameState.time.hour, gameState.time.minute)}
      dayLabel={statusDate}
      unreadSms={unreadSms+unreadMoments}
      hasTodo={!!hiredJob || !!gameState.work?.active || todoCommitments.length > 0 || quests.some(q => ['pending', 'active'].includes(q.status))}
      hasDelivery={!!gameState.flags["app_delivery"]}
      hasRideHailing={!!gameState.flags["app_ride_hailing"]}
      hasLive={!!gameState.flags["app_live"]}
      onOpen={openHomeApp}
    />

  {:else if app === "calendar"}
    <PhoneCalendarApp onBack={goHome}/>
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
      {#if hiredJob || gameState.work?.active}
        <WorkPanel compact />
      {/if}
      {#if todoCommitments.length > 0}
        <div class="todo-commitments">
          <div class="dg-head"><span class="dg-title">📌 已接受事项</span><span class="dg-progress dim">{todoCommitments.length}</span></div>
          {#each todoCommitments as item}
            <div class="commitment-item" class:warn={item.tone === "warn"}>
              <span class="commitment-icon">{item.icon}</span>
              <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            </div>
          {/each}
        </div>
      {/if}
      {#if eternalChallenge}
        <div class="eternal-challenge" class:complete={eternalChallenge.complete}>
          <div class="ec-head">
            <span class="dg-title">♾️ 永恒赛季 · {eternalChallenge.title}</span>
            <span class="dg-progress">{eternalChallenge.progress}/{eternalChallenge.target}</span>
          </div>
          <div class="ec-hint dim">{eternalChallenge.hint}</div>
          <div class="ec-track"><div class="ec-fill" style="width:{Math.round(eternalChallenge.progress / eternalChallenge.target * 100)}%"></div></div>
          {#if eternalChallenge.complete}<div class="ec-done">✅ 本赛季目标已完成，下一周刷新新挑战</div>{/if}
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
              {#if q.startHour !== undefined}<span>🕐 {q.startHour}:00</span>{/if}
            </div>
            {#if q.commission?.commissionId}<div class="q-desc">{q.desc}</div>{/if}
            {#if q.npcTask}<div class="q-desc">{npcTaskSummary(gameState, q).detail}</div>{/if}
            <div class="q-count {u}">{countdownText(q)}</div>
            <div class="q-foot">
              {#if q.reward}<span class="tag gain">{q.reward}</span>{/if}
              {#if q.npcTask}<button class="task-detail-button" onclick={() => openNpcTaskPanel({ kind: 'quest', taskId: q.npcTask!.taskId })}>详情、附件与记录 ›</button>{/if}
            </div>
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
      <div class="q-tip">正式工迟到只计算剩余工时；连续 3 个应出勤班次未上班会解除合同并结清工资。</div>
    </div>

  {:else if app === "call"}
    <!-- v1.3b5 微信风通信：会话列表 + 通讯录 + 聊天窗（手机/电脑同步同一 smsInbox） -->
    <div class="app-page wechat-page">
      {#if wechatThread}
        {@const peer = smsThreads.find((t) => t.key === wechatThread) ?? threadContact}
        <div class="social-chat-bar">
          <button class="back" aria-label="返回会话" onclick={() => (wechatThread = null)}>‹</button>
          <div><strong>{peer?.name ?? "联系人"}</strong><small>{threadContact?.title ?? (wechatTab==='services'?'服务消息':'消息请求')}</small></div>
          <button class="peer-info" aria-label="查看会话资料" onclick={()=>peerDetails=!peerDetails}>···</button>
        </div>
        {#if peerDetails}<div class="peer-card"><strong>{peer?.name ?? '联系人'}</strong><p>{threadContact?.intro ?? '保留这段会话，方便查看消息和处理事项。'}</p>{#if threadContact?.canCall}<button onclick={wechatCall}>语音通话</button>{/if}</div>{/if}
        <div class="wc-msgs" bind:this={wcMsgsEl}>
          {#each wechatCurrent as m (m.id)}
            {#if m.dir === "out"}
              <div class="wc-row me">
                <div class="wc-bubble me">{(m.replyText && m.replied) ? m.replyText : m.text}<small class="wc-time">{formatSmsTimestamp(m.sentAt, m.day, m.timestampEstimated)}</small></div>
                <span class="wc-av">🙂</span>
              </div>
            {:else}
              <div class="wc-row them">
                <span class="wc-av">{m.senderIcon}</span>
                <div class="wc-bubble them">
                  {m.text}
                  <small class="wc-time">{formatSmsTimestamp(m.sentAt, m.day, m.timestampEstimated)}</small>
                </div>
              </div>
              {#if isScenarioSms(m)}
                <div class="wc-opt-group">
                  {#each m.options as opt, i}
                    <button class="wc-opt tone-{opt.tone}" onclick={() => replyScenarioSms(m, i)}>
                      <span class="wc-opt-label">{opt.label}</span>
                    </button>
                  {/each}
                </div>
              {:else if wechatTab === "services" && m.options.length === 0 && !m.replied}
                <div class="wc-notice-note">通知 · 无需回复</div>
              {/if}
            {/if}
          {/each}
          {#if wechatCurrent.length === 0}
            <p class="dim center-hint">还没有消息，发送第一条吧。</p>
          {/if}
        </div>
        <div class="wc-reply">
          {#if threadContact && !hasPendingScenario(wechatCurrent)}
            {#if threadContact.canCall}<button class="wc-call" title="语音通话" aria-label="语音通话" onclick={wechatCall}>📞</button>{/if}
            <button class="composer-toggle" aria-expanded={composerOpen} onclick={()=>composerOpen=!composerOpen}>💬 {composerOpen?'收起话题':'聊些什么…'}</button>
            {#if composerOpen}<div class="wc-topic-row" role="group" aria-label="选择聊天话题">
              {#each threadTopics as topic (topic.id)}
                <button class="wc-topic" onclick={() => wechatReply(topic.id)}>💬 {topic.label}</button>
              {/each}
            </div>{/if}
          {:else if !threadContact}
            <div class="wc-noncontact">{hasPendingScenario(wechatCurrent)?'选择消息下方的回应，继续这段对话。':'消息已送达。此会话暂时没有可发送的话题。'}</div>
          {/if}
        </div>
      {:else}
        <div class="social-top"><div><strong>{wechatTab==='moments'?'朋友圈':wechatTab==='contacts'?'通讯录':wechatTab==='services'?'服务通知':wechatTab==='requests'?'消息请求':'都市信'}</strong><small>{wechatTab==='moments'?'熟悉的人，平常的日子':wechatTab==='chat'?'与熟悉的人保持联系':wechatTab==='services'?'账单、平台与生活服务':wechatTab==='requests'?'尚未加入通讯录的来信':'相识之后，常来常往'}</small></div>{#if unreadSms > 0 && wechatTab !== "moments"}<button class="read-all-btn" onclick={markAllRead}>全部已读</button>{/if}</div>
        <nav class="wc-tabs" aria-label="通讯分类">
          <button class="wc-tab" class:on={wechatTab === "chat" || wechatTab === "requests"} onclick={() => (wechatTab = "chat")}>聊天</button>
          <button class="wc-tab" class:on={wechatTab === "contacts"} onclick={() => (wechatTab = "contacts")}>通讯录</button>
          <button class="wc-tab" class:on={wechatTab === "services"} onclick={() => (wechatTab = "services")}>通知 {#if serviceUnread}<span class="social-dot">{serviceUnread}</span>{/if}</button>
          <button class="wc-tab" class:on={wechatTab === "moments"} onclick={openMomentsTab}>朋友圈 {#if unreadMoments}<span class="social-dot">{unreadMoments}</span>{/if}</button>
        </nav>
        {#if wechatTab === "moments"}
    <div class="app-page moments-page">


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
                {#if post.image}
                  <div class="tl-image-placeholder">{post.image}</div>
                {/if}
                <div class="tl-foot">
                  <span class="tl-day">第 {post.day} 天</span>
                  <span class="tl-category">{post.category === "fun" ? "趣事" : post.category === "task" ? "里程碑" : "日常"}</span>
                  {#if post.momentSource === "dedicated"}<span class="tl-source">生活记录</span>{/if}
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

        {:else if wechatTab !== "contacts"}
          <div class="social-search"><input type="search" bind:value={chatQuery} aria-label="搜索会话" placeholder="搜索名字或消息" /></div>
          {#if wechatTab === "chat" && messageRequests.length}
            <button class="request-inbox" onclick={()=>{wechatTab='requests';chatQuery='';}}><span>✉ 消息请求</span><small>{messageRequests.reduce((sum,t)=>sum+t.unread,0)||messageRequests.length} · 尚未加入通讯录</small><span>›</span></button>
          {:else if wechatTab === "requests"}<button class="back request-back" onclick={()=>{wechatTab='chat';chatQuery='';}}>‹ 返回聊天</button>{/if}
          <div class="sms-list social-list">
            {#if visibleThreads.length === 0}<p class="dim center-hint">{chatQuery?'没有找到符合条件的会话。':wechatTab==='chat'?'还没有会话，到通讯录找熟悉的人聊聊吧。':'暂时没有新的来信。'}</p>{/if}
            {#each visibleThreads as th (th.key)}
              <button class="sms-item" class:unread={th.unread > 0} onclick={() => openThread(th.key)}>
                <span class="social-avatar">{th.icon}{#if th.unread > 0}<span class="social-badge">{th.unread>99?'99+':th.unread}</span>{/if}</span>
                <div class="sms-body"><div class="sms-head"><span class="c-name">{th.name}</span><time class="sms-time">{formatSmsTimestamp(th.last.sentAt, th.last.day, th.last.timestampEstimated)}</time></div>
                  <div class="sms-preview dim">{#if th.pending}<span class="pending-response">待回应 · </span>{/if}{th.preview}</div>
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="page-title">通讯录（{gameState.contacts.length}）</div>
          <div class="addr-tools">
            <input class="addr-search" type="search" bind:value={addressQuery} aria-label="搜索联系人" placeholder="搜索姓名、身份或介绍" />
            <div class="addr-filters" aria-label="通讯录分类">
              {#each addressCategoryOptions as category (category.id)}
                <button class="addr-filter" class:on={addressCategory === category.id} onclick={() => (addressCategory = category.id)}>{category.label}</button>
              {/each}
            </div>
            <p class="addr-explainer">这里只列出已经认识、解锁或因服务办理而加入的人；按最近消息排序。新联系人会在相识后出现。</p>
          </div>
          <div class="addr-list">
            {#if addressContacts.length === 0}
              <p class="dim center-hint">没有符合条件的联系人。清除搜索或切换分类试试。</p>
            {:else}
              {#each addressGroups as [label, members] (label)}
                <section class="addr-group">
                  <h3>{label} <span>{members.length}</span></h3>
                  {#each members as entry (`${entry.contact.id}:${entry.index}`)}
                    {@const c = entry.contact}
                    <div class="addr-item">
                      <span class="gi-emoji" style="font-size:30px;line-height:1">{c.avatar}</span>
                      <div class="addr-body">
                        <div class="addr-head">
                          <span class="c-name">{c.name}</span>
                          <span class="addr-rel dim">{c.title}</span>
                        </div>
                        <div class="addr-intro dim">{c.intro}</div>
                        <div class="addr-last dim">
                          {#if entry.lastActivity !== undefined}
                            最近联系 · {formatSmsTimestamp(entry.lastActivity)}
                          {:else}
                            已加入通讯录 · 第 {c.addedDay + 1} 天
                          {/if}
                        </div>
                      </div>
                      <div class="addr-actions">
                        {#if c.canSms}<button class="mini-btn" title={`打开与${c.name}的会话`} aria-label={`打开与${c.name}的会话`} onclick={() => { openThread(c.id); wechatTab = "chat"; }}>💬</button>{/if}
                        {#if c.canCall}<button class="mini-btn" title={`给${c.name}打电话`} aria-label={`给${c.name}打电话`} onclick={() => { openThread(c.id); wechatTab = "chat"; wechatCall(); }}>📞</button>{/if}
                      </div>
                    </div>
                  {/each}
                </section>
              {/each}
            {/if}
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
    <PhoneGameApp
      visible={variant === "full" || uiState.modal === null}
      installedGames={installedGames}
      phonePerfectUnlocked={phonePerfectUnlocked}
      resetSignal={gameOpenToken}
      onBack={goHome}
      onGoMarket={() => { app = "market"; result = null; }}
      onPlay={() => run(() => playGame(gameState), "game")}
      onPerfect={onPhoneGamePerfect}
    />

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
      <p class="jobs-hint dim">每天可开始一班，每班消耗 8 小时。完成一场配送挑战后，按较低的完班底薪加送达订单提成到账；未送达订单不计提成。</p>
      <p class="jobs-hint dim">每单按距离提前报价，货品品质影响该单实际提成，多送单不会压低后续单价。提前结束仅结算已完成提成；交通罚款当场扣除，下班不再重复扣款。暂停或保存可继续本班。</p>
      <p class="jobs-hint dim">配送车辆：{deliveryVehicle === "none" ? "❌ 暂无车辆" : `✅ ${VEHICLE_NAMES[deliveryVehicle]}（自有或租用）`}</p>
      {#if deliveryVehicle === "none"}<p class="jobs-hint">请先购买自行车，或租用电动车、三轮车、汽车，再开始配送。</p>{/if}
      <p class="jobs-hint dim">今日班次：{deliveryInProgress ? "进行中" : deliveryOrdersRemaining(gameState) > 0 ? "尚未开始" : "已开始"} · 本班已送达 {deliveryInProgress ? gameState.work?.active?.completedOrders ?? 0 : 0} 单</p>
      {#if workStatusReason(gameState)}<p class="jobs-hint">⚠️ {workStatusReason(gameState)}</p>{/if}
      <button class="big-action" disabled={deliveryVehicle === "none" || (deliveryOrdersRemaining(gameState) <= 0 && !deliveryInProgress) || (!!gameState.work?.active && !deliveryInProgress)} onclick={onDeliveryOrder}>{deliveryInProgress ? "▶ 继续本班" : "🛵 开始今日外卖班次（8 小时）"}</button>
      {#if deliveryInProgress && deliveryVehicle === "none" && gameState.work?.active?.status === "paused"}
        <p class="jobs-hint dim">也可以提前结束：已送达订单照常结算，不领取完班底薪，并按原班次推进时间。</p>
        <button class="big-action ghost" data-end-delivery-without-vehicle onclick={endDeliveryWithoutVehicle}>提前结束本班</button>
      {/if}
    </div>

  {:else if app === "ride_hailing"}
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🚖 网约车接单</div>
      <p class="jobs-hint dim">持有驾驶证和自有或租用的汽车即可开班。每天最多开始一班，每班 10 小时；跨午夜仍按开班日记一次。</p>
      <p class="jobs-hint dim">完成一场接送挑战后，按本班实际送达单数 × {rideHailingParttimeBasePay()} 元结算；未送达的订单不计入，不受小游戏评级、证书、技能或物价倍率影响。暂停或保存后可继续同一班次。</p>
      <p class="jobs-hint dim">驾驶证：{gameState.flags.item_driving_license ? "✅ 已取得" : "❌ 尚未取得（驾校报名 1500 元，考试 500 元；智力需达到 40）"}</p>
      <p class="jobs-hint dim">汽车：{gameState.flags.item_car ? "✅ 自有或租用中" : "❌ 暂无（可在汽车租赁行租用或买断）"}</p>
      <p class="jobs-hint dim">今日班次：{gameState.work?.active?.jobId === "job_ride_hailing" ? "进行中" : rideHailingOrdersRemaining(gameState) > 0 ? "尚未开始" : "已开始"}</p>
      {#if workStatusReason(gameState)}<p class="jobs-hint">⚠️ {workStatusReason(gameState)}</p>{/if}
      <button class="big-action" disabled={(rideHailingOrdersRemaining(gameState) <= 0 && gameState.work?.active?.jobId !== "job_ride_hailing") || (!!gameState.work?.active && gameState.work.active.jobId !== "job_ride_hailing")} onclick={onRideHailingOrder}>{gameState.work?.active?.jobId === "job_ride_hailing" ? gameState.work.active.workedMinutes < 600 ? "▶ 继续旧订单" : "▶ 继续本班" : "🚖 开始今日网约车班次（10 小时）"}</button>
    </div>

  {:else if app === "live"}
    <!-- v1.3 自媒体直播 -->
    <div class="app-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">📡 自媒体直播</div>
      {#if !liveReady.ok}
        <p class="jobs-hint dim">{liveReady.reason}</p>
        {#if liveReady.missing === "installation"}
          <button class="big-action" onclick={() => (app = "market")}>打开手机应用市场</button>
        {:else if liveReady.missing === "computer"}
          <button class="big-action" onclick={prepareLiveComputer}>{gameState.locationId === "internet_cafe" ? "上网吧机位" : "前往网吧"}</button>
        {/if}
      {:else}
        <p class="jobs-hint dim">直播才艺赚影响力与打赏，收益随笔记本档位提升。每天限 1 次。</p>
        <div class="live-stat">
          <span>累计影响力：{gameState.player.stats.fame}</span>
          <span>累计直播名气：{gameState.live?.totalFameGain ?? 0}</span>
        </div>
        <button class="big-action" disabled={liveDoneToday} onclick={goLive}>
          {liveDoneToday ? "今日已直播" : "📡 开始直播"}
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
      <div class="page-title">💼 正式工招聘</div>
      <WorkPanel />
      <p class="jobs-hint dim">岗位会按属性、技能和证件要求审核；难度提升时，申请门槛也会提高。按班次到单位上班，每七天发薪。日结工作请去劳务市场。</p>
      <div class="jobs-group">
        <div class="g-head">🏢 正式工 · 周结</div>
        <div class="job-list">
          {#each formalJobs as job}
            {@const hired = gameState.career.jobId === job.id}
            {@const requirements = checkJobRequirements(gameState, job)}
            {@const preview = previewWork(gameState, job)}
            <button class="recruit-card" class:hired disabled={hired || !requirements.ok} title={!requirements.ok ? requirements.reason : undefined} onclick={() => applyJob(job.id)}>
              <span class="recruit-heading"><span aria-hidden="true">{job.icon}</span><strong>{job.name}</strong></span>
              <span class="recruit-pay">约 ¥{formatMoney(preview.wage)}<small> / 班 · 每七天发薪</small></span>
              <span class="recruit-schedule">{locationName(job.locationId)} · {job.startHour ?? 9}:00—{job.endHour ?? (job.startHour ?? 9) + job.duration}:00<br />标准班 {job.duration} 小时</span>
              <span class="recruit-description dim">{job.desc}</span>
              <span class="recruit-conditions">{describeJobRequirements(gameState, job)}<br />体力 {preview.stamina} · 压力 +{preview.stress}</span>
              <span class="recruit-apply">{hired ? "✓ 当前在职" : !requirements.ok ? requirements.reason : gameState.career.jobId ? "申请换岗 →" : "应聘入职 →"}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else if app === "settings"}
    <PhoneSettingsApp
      zoom={uiState.zoom}
      muted={muted}
      phoneSfxVol={phoneSfxVol}
      phoneBgmVol={phoneBgmVol}
      difficulty={getDifficulty(gameState)}
      resetting={resetting}
      onBack={goHome}
      onMute={() => { unlockAudio(); onMute(); }}
      onPhoneSfxVol={onPhoneSfxVol}
      onPhoneBgmVol={onPhoneBgmVol}
      onDifficulty={(tier: DifficultyTier) => setDifficulty(gameState, tier)}
      onZoom={setZoom}
      onReset={resetSaves}
    />

  {:else if app === "goals"}
    <div class="app-page goals-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">🎯 目标清单</div>
      <section class="goals-section">
        <div class="goals-section-title">📘 新手引导</div>
        {#if isTutorialDone(gameState)}
          <div class="goals-done">
            <div class="goals-done-icon">🎉</div>
            <div class="goals-done-text">新手引导全部完成，<br />都市生活正式开始！</div>
          </div>
        {/if}
        <div class="goals-list">
          {#each TUTORIAL_STEPS as step, i (step.id)}
            {@const isDone = gameState.tutorial.done.includes(step.id)}
            {@const isCur = activeTutorialStep?.index === i}
            <div class="goal-item" class:done={isDone} class:active={isCur}>
              <span class="goal-icon">{isDone ? "✅" : isCur ? step.icon : "⬜"}</span>
              <div class="goal-info">
                <div class="goal-name">
                  {step.title}
                  {#if isDone}<span class="tag gain">完成</span>{/if}
                  {#if step.optional}<span class="tag">可选</span>{/if}
                  {#if isCur}<span class="tag">当前</span>{/if}
                </div>
                <div class="goal-desc dim">{step.desc}</div>
                {#if isCur}<div class="goal-hint">💡 {step.hint}</div>{/if}
              </div>
            </div>
          {/each}
        </div>
        <p class="dim center-hint">
          {#if activeTutorialStep}
            主线进度 {completedRequiredTutorialSteps}/{requiredTutorialSteps.length}，按顺序完成即可
          {:else}
            主线进度 {requiredTutorialSteps.length}/{requiredTutorialSteps.length}，随时可以回来查看
          {/if}
        </p>
      </section>

      <section class="goals-section">
        <div class="goals-section-title">🌱 人生阶段目标</div>
        <p class="dim goals-intro">没有唯一的通关路线，按自己的节奏在城市里生活、成长。</p>
        <div class="goals-list">
          {#each longTermGoals as goal (goal.id)}
            {@const percent = Math.round(goal.progress * 100)}
            <div class="goal-item life-goal" class:done={percent >= 100}>
              <span class="goal-icon">{percent >= 100 ? "✅" : goal.icon}</span>
              <div class="goal-info">
                <div class="goal-name">
                  {goal.title}
                  {#if percent >= 100}<span class="tag gain">完成</span>{/if}
                </div>
                <div class="goal-desc dim">{goal.desc}</div>
                <div class="goal-progress" role="progressbar" aria-label={`${goal.title}进度`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
                  <div class="goal-progress-fill" style={`width: ${percent}%`}></div>
                </div>
                <div class="goal-detail-list">
                  {#each goal.details as detail (detail)}
                    <div class="goal-detail">· {detail}</div>
                  {/each}
                </div>
              </div>
              <span class="goal-percent">{percent}%</span>
            </div>
          {/each}
        </div>
      </section>
    </div>

  {:else if app === "assets"}
    <div class="app-page ast-page">
      <button class="back" onclick={() => (app = "home")}>← 返回</button>
      <div class="page-title">📊 资产</div>
      <section class="ast-card" aria-label="30 天固定收支">
        <div class="h2">30 天固定收支</div>
        <p class="dim">{livingBudget.employed ? `${livingBudget.job} · ${livingBudget.shifts} 班` : '暂无固定工作'}</p>
        <div class="ast-row"><span>工作收入参考</span><strong>{formatMoney(livingBudget.salary)}</strong></div>
        {#if livingBudget.propertyIncome > 0}<div class="ast-row"><span>房产租金</span><strong>{formatMoney(livingBudget.propertyIncome)}</strong></div>{/if}
        <div class="ast-row"><span>{livingBudget.housingLabel}</span><span>{formatMoney(livingBudget.rent)}</span></div>
        <div class="ast-row"><span>固定收支差额</span><strong>{formatMoney(livingBudget.balance)}</strong></div>
        {#if livingBudget.pendingSalary > 0}<div class="ast-row"><span>另有待发工资</span><span>{formatMoney(livingBudget.pendingSalary)}</span></div>{/if}
        <div class="ast-row"><span>本周实收 / 实支</span><span>{formatMoney(livingBudget.weeklyEarned)} / {formatMoney(livingBudget.weeklySpent)}</span></div>
        <small class="dim">未含餐食、出行等日常消费。{livingBudget.housingNote}</small>
      </section>
      {#if livingBudget.financialDebt > 0 || livingBudget.securitiesAvailable > 0 || livingBudget.securitiesFrozen > 0}
        <section class="ast-card" aria-label="证券资金与还款预留">
          <div class="h2">证券资金与还款预留</div>
          <div class="ast-row"><span>生活现金（当前）</span><strong>{formatMoney(gameState.player.money)}</strong></div>
          <div class="ast-row"><span>证券可用资金</span><span>{formatMoney(livingBudget.securitiesAvailable)}</span></div>
          <div class="ast-row"><span>委托冻结资金</span><span>{formatMoney(livingBudget.securitiesFrozen)}</span></div>
          <div class="ast-row"><span>金融待还（当前本息）</span><strong>{formatMoney(livingBudget.financialDebt)}</strong></div>
          <div class="ast-row"><span>预留还款后生活现金</span><strong>{formatMoney(livingBudget.cashAfterDebtReserve)}</strong></div>
          <small class="dim">预留按当前本息与证券可用资金估算，不会自动扣款；冻结资金与持仓不计入可还现金。期限见日历或待办，还款请使用电脑顺顺花。</small>
        </section>
      {/if}
      {#if readyOrders.length > 0 || pendingOrders.length > 0}
        <section class="ast-card" aria-label="待收货订单">
          <div class="h2">📦 待收货订单</div>
          {#each readyOrders as order (order.id)}
            <div class="ast-row"><span>{order.icon} {order.name}</span><button class="mini-btn" onclick={() => receiveOrder(order.id)}>领取（入包）</button></div>
          {/each}
          {#each pendingOrders as order (order.id)}
            <div class="ast-row"><span>{order.icon} {order.name}</span><small class="dim">配送中</small></div>
          {/each}
        </section>
      {/if}

      <div class="ast-net">
        <div class="ast-net-label dim">净资产（现金 + 投资净值 + 公司净资产 − 欠款）</div>
        <div class="ast-net-value">{formatMoney(netWorth)}</div>
        <div class="ast-cash dim">现金 + 投资市值 + 证券净权益 + 公司净资产 − 其他欠款</div>
        {#if gameState.economy.stockMarket}<div class="ast-cash dim">顺顺花净权益 {formatMoney(stockAccountEquity(gameState.economy.stockMarket)/100)} · 金融待还 {formatMoney(stockDebtTotal(gameState.economy.stockMarket)/100)} · 交易请使用游戏内电脑</div>{/if}
      </div>

      {#if gameState.company}
        {@const company = companyOverview(gameState)!}
        <section class="ast-card" aria-label="公司资产"><div class="h2">🏢 {gameState.company.name}</div><div class="ast-row"><span>{company.stage.name}</span><span>{company.people} 人</span></div><div class="ast-row"><span>公司现金</span><span>{formatMoney(gameState.company.balanceCents / 100)} 元</span></div><div class="ast-row"><span>已计提工资／到期欠款</span><span>{formatMoney(company.reservedCents / 100)} 元</span></div><div class="ast-row"><span>公司净资产</span><span>{formatMoney(company.netAssetsCents / 100)} 元</span></div><p class="dim">包含现金、电脑成本、保证金、未用租金，扣除工资及到期欠款。{company.stopped ? '到期欠款停工中，请到公司处理。' : '经营与开发请前往公司。'}</p></section>
      {/if}
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
          <p class="dim">💡 攒够钱可去「房屋租赁所」一次性买断产权房，从此免租</p>
        {/if}
      </div>

      <div class="ast-card">
        <div class="h2">🚗 载具</div>
        {#if vehicleEntries.length === 0}
          <p class="dim">暂无载具，可在「汽车租赁行」租用或买断</p>
        {:else}
          {#each vehicleEntries as vehicle (vehicle.type)}
            <div class="ast-row"><span>{VEHICLE_NAMES[vehicle.type] ?? vehicle.type}</span><span class={vehicle.owned ? "tag gain" : "tag"}>{vehicle.owned ? "自有" : "租用中"}</span></div>
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
              {d.label} {signed(d.value)}
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
  {#if app === "home"}
  <div class="p-dock">
    <button class="dock-btn" class:on={app === "home"} aria-label="主页" title="主页" onclick={() => (app = "home")}><PhoneAppIcon id="home" compact /><small>桌面</small></button>
    <button class="dock-btn" aria-label="待办" title="待办" onclick={() => { app = "todo"; result = null; }}>
      <PhoneAppIcon id="todo" compact /><small>待办</small>
    </button>
    <button class="dock-btn" aria-label="通信" title="通信" onclick={() => { app = "call"; result = null; }}>
      <PhoneAppIcon id="call" compact /><small>通信</small>{#if unreadSms+unreadMoments > 0}<span class="dock-badge">{unreadSms+unreadMoments}</span>{/if}
    </button>
    <button class="dock-btn" aria-label="设置" title="设置" onclick={() => { app = "settings"; result = null; }}><PhoneAppIcon id="settings" compact /><small>设置</small></button>
  </div>
  {/if}
  <button type="button" class="home-indicator" aria-label="返回手机桌面" title="返回手机桌面" onclick={() => { app = "home"; result = null; }}><i aria-hidden="true"></i></button>
</div>

<style>
  .task-detail-button { background: #6d91b01a; color: inherit; border: 1px solid #8eabc45c; border-radius: 7px; padding: 8px 10px; min-height: 36px; font-size: 12px; cursor: pointer; margin-left: auto; }
  .job-list { display: grid; gap: 10px; min-width: 0; }
  .recruit-card { display: grid; gap: 9px; width: 100%; min-width: 0; padding: 14px 12px; text-align: left; border-radius: 16px; border: 1px solid var(--stroke); background: linear-gradient(145deg, var(--glass), rgba(50, 73, 107, .13)); color: var(--text-main); overflow-wrap: break-word; line-height: 1.55; }
  .recruit-heading { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; }
  .recruit-heading > span { flex: 0 0 auto; font-size: 23px; }
  .recruit-heading strong { min-width: 0; }
  .recruit-pay { color: var(--accent); font-size: 17px; font-weight: 750; }
  .recruit-pay small { display: block; color: var(--text-dim); font-size: 10px; font-weight: 400; }
  .recruit-schedule { font-size: 11px; }
  .recruit-description { font-size: 11px; }
  .recruit-conditions { color: var(--accent-2, #6cc6ff); font-size: 10px; }
  .recruit-apply { padding-top: 9px; border-top: 1px solid var(--stroke); color: var(--accent); font-size: 12px; font-weight: 700; }
  .recruit-card.hired { border-color: var(--ok, #7bd88f); opacity: .8; }
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
    /* 应用 keyed 切换时新旧页面共用同一滚动格，淡出页不再把内容高度叠加。 */
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
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
    box-sizing: border-box;
    padding: 10px;
    border-radius: 26px;
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
    transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
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
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    border-radius: 27px;
    background:
      radial-gradient(125% 62% at 50% -18%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 58%),
      linear-gradient(168deg, color-mix(in srgb, var(--bg-card) 50%, var(--bg-deep)), var(--bg-deep));
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-main) 22%, transparent) transparent;
  }
  .phone-screen.home-screen { overflow: hidden; touch-action: none; }
  .p-content {
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
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
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
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
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
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
    transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
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
    transition: transform var(--dur-fast) var(--ease-out);
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
  .sms-time { margin-left: auto; color: var(--text-dim); font-size: 10px; font-weight: 400; white-space: nowrap; }
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
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
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
    transition: transform var(--dur-fast) var(--ease-out);
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
    transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
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
    transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
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
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  /* 应用市场/游戏列表使用紧凑单元，避免手机页面被单个卡片撑满。 */
  .job-item > .gi-emoji {
    font-size: 26px !important;
  }
  .job-item > .mini-btn, .job-item > .referral-badge { grid-column: 2; justify-self: start; }
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
    transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
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
    transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
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
  .goals-section + .goals-section {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--stroke);
  }
  .goals-section-title {
    font-size: 14px;
    font-weight: 800;
    margin: 4px 2px 9px;
  }
  .goals-intro {
    font-size: 11px;
    margin: 0 2px 10px;
  }
  .goals-done {
    text-align: center;
    padding: 12px 16px 16px;
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
  .goal-percent {
    flex-shrink: 0;
    color: var(--accent, #ffd166);
    font-size: 11px;
    font-weight: 800;
    padding-top: 2px;
  }
  .goal-progress {
    width: 100%;
    height: 7px;
    overflow: hidden;
    margin-top: 8px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--text-main) 12%, transparent);
    box-shadow: inset 0 0 0 1px var(--stroke);
  }
  .goal-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent, #ffd166), var(--accent-2, #6cc6ff));
  }
  .goal-detail-list {
    display: grid;
    gap: 2px;
    margin-top: 7px;
  }
  .goal-detail {
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1.45;
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
    transition: background var(--dur-fast) var(--ease-out);
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
  .q-desc {
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--text-dim, rgba(255, 255, 255, 0.72));
    white-space: pre-line;
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
    transition: opacity var(--dur-base) var(--ease-out);
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
  .todo-commitments {
    background: rgba(120, 209, 255, 0.07);
    border: 1px solid rgba(120, 209, 255, 0.2);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
  }
  .commitment-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .commitment-item.warn { color: #ffcf8a; }
  .commitment-icon { font-size: 21px; width: 25px; text-align: center; }
  .commitment-item strong { display: block; font-size: 11.5px; }
  .commitment-item small { display: block; margin-top: 2px; color: var(--text-dim); font-size: 10.5px; }
  .eternal-challenge {
    background: rgba(255, 209, 102, 0.08);
    border: 1px solid rgba(255, 209, 102, 0.3);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
  }
  .eternal-challenge.complete { border-color: rgba(123, 216, 143, 0.55); background: rgba(123, 216, 143, 0.08); }
  .ec-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 800; color: var(--accent, #ffd166); }
  .ec-hint { font-size: 11px; }
  .ec-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .ec-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ffd166, #7bd88f); transition: width var(--dur-base) var(--ease-out); }
  .ec-done { font-size: 10.5px; color: var(--ok, #7bd88f); }

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
    transition: width var(--dur-base) var(--ease-out);
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
  .tl-image-placeholder {
    display: inline-block;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px dashed #c8ccd2;
    border-radius: 4px;
    background: #f7f8fa;
    color: #8a9098;
    font-size: 12px;
  }
  .tl-foot { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
  .tl-day { font-size: 11px; color: #b2b6bb; }
  .tl-category, .tl-source { font-size: 11px; color: #9aa0a8; }
  .tl-source { color: #6e9bc7; }
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
  .wechat-page { gap: 0; padding: 0 !important; overflow: hidden; }
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
  .addr-tools { flex: none; padding: 9px 10px 2px; }
  .addr-search { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--stroke); border-radius: 9px; color: var(--text-main); background: var(--glass-2); outline: none; }
  .addr-search:focus { border-color: #07c160; }
  .addr-filters { display: flex; gap: 6px; overflow-x: auto; padding: 8px 0 4px; overscroll-behavior-x: contain; scrollbar-width: none; }
  .addr-filters::-webkit-scrollbar { display: none; }
  .addr-filter { flex: none; padding: 5px 9px; border: 1px solid var(--stroke); border-radius: 999px; color: var(--text-dim); background: var(--glass); font-size: 11px; cursor: pointer; white-space: nowrap; }
  .addr-filter.on { border-color: #07c160; color: #07c160; background: color-mix(in srgb, #07c160 12%, var(--glass)); }
  .addr-explainer { margin: 2px 0 0; color: var(--text-dim); font-size: 10px; line-height: 1.4; }
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
  .addr-last { margin-top: 4px; font-size: 10px; }
  .addr-group h3 { display: flex; align-items: center; gap: 6px; margin: 5px 2px 7px; color: var(--text-dim); font-size: 11px; font-weight: 600; }
  .addr-group h3 span { color: var(--text-main); opacity: .7; }
  .addr-group { display: flex; flex-direction: column; gap: 7px; }
  .addr-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .mini-btn {
    width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--stroke);
    background: var(--glass); font-size: 16px; cursor: pointer; color: var(--text-main);
  }
  .mini-btn:hover { background: var(--tint); }

  /* 右侧手机面板：以窄屏仪表盘而不是被压扁的全尺寸手机呈现。 */
  .phone.panel {
    padding: 8px;
    border-radius: 26px;
    background: linear-gradient(160deg, color-mix(in srgb, var(--bg-card) 86%, #070a14), var(--bg-deep));
    box-shadow: inset 0 0 0 1px var(--stroke), 0 8px 22px rgba(0, 0, 0, 0.24);
  }
  .phone.panel .p-top { padding: 8px 6px 5px; }
  .phone.panel .p-date { display: none; }
  .phone.panel .phone-screen { border-radius: 18px; }
  .phone.panel .p-content { min-height: 100%; }
  .phone.panel .p-hero {
    margin: 2px 7px 0;
    padding: 10px;
    gap: 8px;
    border-radius: 13px;
  }
  .phone.panel .p-hero-avatar { width: 36px; height: 36px; font-size: 18px; }
  .phone.panel .p-hero-label { font-size: 10px; }
  .phone.panel .p-hero-balance { font-size: 19px; }
  .phone.panel .p-hero-sub { margin-top: 1px; font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .phone.panel .apps {
    flex: 1 1 auto;
    min-height: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(50px, 1fr);
    align-content: stretch;
    gap: 7px;
    padding: 8px 7px 10px;
  }
  .phone.panel .app { min-height: 0; gap: 3px; padding: 7px 3px; border-radius: 11px; }
  .phone.panel .app .gi-emoji,
  .phone.panel .app .a-icon { font-size: 20px !important; }
  .phone.panel .a-name {
    max-width: 100%;
    overflow: hidden;
    color: var(--text-main);
    font-size: 10px;
    line-height: 1.15;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .phone.panel .app-badge { top: 4px; right: 4px; min-width: 14px; height: 14px; padding: 0 3px; font-size: 8.5px; }
  .phone.panel .p-dock { padding: 4px 5px; }
  .phone.panel .dock-btn { height: 30px; font-size: 15px; }

  /* 通讯录在右侧窄面板中仍保持可读比例，不让操作按钮挤压联系人内容。 */
  .phone.panel .addr-list { padding: 6px; gap: 6px; }
  .phone.panel .addr-item { gap: 6px; padding: 8px; }
  .phone.panel .addr-head { gap: 3px 5px; flex-wrap: wrap; }
  .phone.panel .addr-head .c-name { font-size: 13px; }
  .phone.panel .addr-rel { font-size: 10px; }
  .phone.panel .addr-intro {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    line-height: 1.35;
  }
  .phone.panel .addr-actions { gap: 4px; }
  .phone.panel .mini-btn { width: 28px; height: 28px; font-size: 14px; }

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
  .wc-topic-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: 1; gap: 6px; min-width: 0; }
  .wc-topic {
    min-width: 0; padding: 7px 8px; border-radius: 8px;
    border: 1px solid var(--stroke); background: var(--bg-deep);
    color: var(--text-main); cursor: pointer; font-size: 11px; font-weight: 600;
    line-height: 1.35; text-align: left; font-family: inherit;
    transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
  }
  .wc-topic:hover { background: var(--tint); }
  .wc-topic:active { transform: translateY(1px); }

  /* v1.3b8b 场景短信回复按钮（恢复前代三档交互） */
  .wc-opt-group { display: flex; flex-direction: column; gap: 6px; margin: 0 0 4px 38px; }
  .wc-opt {
    display: flex; align-items: center; gap: 8px; text-align: left;
    padding: 8px 10px; border-radius: 8px; border: 1px solid #d8dbe0;
    background: #fff; cursor: pointer; font-family: inherit;
    transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  .wc-opt:hover { background: #f0f4f8; }
  .wc-opt:active { transform: translateY(1px); }
  .wc-opt-label { font-size: 13px; color: #1f2430; line-height: 1.35; }
  .wc-time { display: block; margin-top: 4px; text-align: right; color: #72806b; font-size: 9px; line-height: 1.1; }
  .wc-bubble.them .wc-time { color: var(--text-dim); }
  .wc-notice-note { margin: -5px 0 4px 38px; color: var(--text-dim); font-size: 10px; }
  .wc-answered { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cfd4da; color: #5a6472; font-size: 12px; }
  .wc-noncontact { flex: 1; font-size: 12px; color: #8a93a0; padding: 6px 2px; line-height: 1.4; }

  /* Shared physical device shell for the sidebar and the larger phone overlay. */
  .phone { width:min(388px,calc((100dvh / var(--eff-zoom, 1) - 44px) * .48),calc(100vw / var(--eff-zoom, 1) - 28px));height:min(808px,calc(100dvh / var(--eff-zoom, 1) - 44px));box-sizing:border-box;container-type:inline-size;container-name:handset;padding:4px;border:4px solid #202a39;border-radius:38px;background:#0a111c;grid-template-rows:38px minmax(0,1fr) auto 13px;box-shadow:0 24px 70px #0008,0 0 0 1px #8996aa88,inset 0 0 0 1px #ffffff25;--phone-wallpaper:radial-gradient(140% 75% at 105% 0%,#586799 0%,transparent 66%),radial-gradient(110% 70% at -15% 100%,#537da0 0%,transparent 73%),linear-gradient(160deg,#172c51,#323963 60%,#1b3b4b); }
  .phone.panel { width:100%;height:100%;padding:3px;border-radius:34px; }
  .p-top { position:relative;padding:3px 11px 1px;gap:8px;background:transparent;color:#f4f7ff;border-radius:27px 27px 0 0; }
  .p-status { gap:0; }.p-time,.phone[data-phone-skin] .p-time { color:#f4f7ff;font-size:10px;font-weight:700; }.p-date,.p-signal { display:none; }
  .p-camera { position:absolute;left:50%;top:8px;transform:translateX(-50%);width:67px;height:17px;border-radius:99px;background:#070b11;box-shadow:inset 0 1px 2px #000; }.p-camera i { position:absolute;right:8px;top:5px;width:6px;height:6px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#587bad,#152237 55%,#05080c); }
  .device-status-icons { display:flex;align-items:center;gap:5px;color:#edf3ff; }.device-battery { position:relative;width:16px;height:9px;padding:1px;border:1px solid #ffffffb0;border-radius:3px;box-sizing:border-box; }.device-battery:after { content:"";position:absolute;right:-3px;top:2px;width:2px;height:3px;background:#ffffff80;border-radius:0 1px 1px 0; }.device-battery i { display:block;width:85%;height:100%;background:#edf3ff;border-radius:1px; }
  .p-close { width:19px;height:22px;font-size:11px;background:transparent;color:#b9c9e0;border:0; }
  .phone-screen { border-radius:0 0 15px 15px;background:transparent;scrollbar-width:thin;scrollbar-color:#ffffff30 transparent; }
  .phone-screen::-webkit-scrollbar { width:3px; }.phone-screen::-webkit-scrollbar-thumb { background:#ffffff35; }
  .p-dock,.phone.panel .p-dock { margin:5px 8px 0;padding:5px 5px;border:1px solid #ffffff1d;border-radius:19px;background:#e5edff15;backdrop-filter:blur(18px); }
  .dock-btn,.phone.panel .dock-btn { height:45px;display:flex;flex-direction:column;gap:3px;border-radius:12px;background:transparent; }.dock-btn small { font-size:8px;color:#d8e3f8;line-height:1; }.dock-btn.on { background:#ffffff14; }.dock-btn:focus-visible { outline:2px solid #ffe09b;outline-offset:-1px; }
  .home-indicator { display:grid;place-items:center; }.home-indicator i { width:30%;height:3px;background:#e6edf9b0;border-radius:99px; }
  .phone[data-phone-skin="rice"] { --phone-wallpaper:radial-gradient(130% 80% at 90% 0%,#718293,transparent 70%),linear-gradient(165deg,#24364b,#172839); }
  .phone[data-phone-skin="flower"] { --phone-wallpaper:radial-gradient(130% 75% at 105% 5%,#c17d9f,transparent 72%),linear-gradient(155deg,#58344f,#28334f); }
  .phone[data-phone-skin="fruit"] { --phone-wallpaper:radial-gradient(130% 85% at 95% 5%,#3a77a8,transparent 72%),linear-gradient(155deg,#18385c,#202245); }
  .phone-screen :global(.back) { min-height:32px;border-radius:10px; }.phone-screen :global(.page-title) { color:#f0f5ff; }.phone-screen :global(input),.phone-screen :global(select) { border-radius:9px; }
  .phone,.phone[data-phone-skin] { background:var(--phone-wallpaper); }
  .phone-screen.home-screen { overflow:hidden;touch-action:pan-y; }
  .home-screen .p-content { height:100%;overflow:hidden; }
  @container handset (max-width:220px) {
    .p-camera { width:44px; }.p-top { padding-left:7px;padding-right:7px; }.device-status-icons { gap:3px; }.device-status-icons svg { width:18px; }.device-battery { width:12px; }.p-close { width:14px; }
  }

  .social-top{display:flex;justify-content:space-between;align-items:center;padding:16px 14px 10px;flex:none;background:var(--glass)}
  .social-top strong{font-size:19px;letter-spacing:.08em}.social-top small{display:block;font-size:10px;color:var(--text-dim);margin-top:5px}
  .wechat-page .wc-tabs{order:3;border-top:1px solid var(--stroke);border-bottom:0;background:var(--glass);padding-bottom:4px}
  .wechat-page .wc-tab{min-height:44px;border-bottom:0;border-top:2px solid transparent}.wechat-page .wc-tab.on{color:#72d4af;border-top-color:#72d4af}
  .social-search{padding:8px 12px;flex:none}.social-search input{box-sizing:border-box;width:100%;border:1px solid var(--stroke);background:var(--glass-2);color:var(--text-main);border-radius:10px;padding:9px 12px;font:inherit;font-size:12px}
  .request-inbox{display:flex;align-items:center;gap:8px;padding:10px 14px;border:0;border-bottom:1px solid var(--stroke);background:var(--glass-2);color:var(--text-main);cursor:pointer;text-align:left;flex:none}.request-inbox small{flex:1;text-align:right;font-size:9px;color:var(--text-dim)}
  .social-list{flex:1;min-height:0;overflow:auto;padding:0 10px}.social-list .sms-item{border:0;border-radius:0;border-bottom:1px solid var(--stroke);padding:12px 4px;background:transparent;min-height:68px}.social-list .sms-item:hover{background:var(--glass-2)}
  .social-avatar{position:relative;display:grid;place-items:center;width:43px;height:43px;border-radius:12px;background:var(--tint);font-size:27px;flex:none}.social-badge{position:absolute;top:-4px;right:-5px;background:#e77780;color:white;border-radius:20px;font-size:9px;min-width:14px;line-height:16px;padding:0 2px}
  .social-list .sms-head{display:flex;justify-content:space-between;gap:8px}.social-list .sms-time{font-size:9px;flex:none}.social-list .sms-preview{margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.pending-response{color:#e3bb72}.social-dot{color:#e77780;font-size:10px}
  .social-chat-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--glass);border-bottom:1px solid var(--stroke);flex:none}.social-chat-bar>div{flex:1;text-align:center;min-width:0}.social-chat-bar strong{font-size:14px}.social-chat-bar small{display:block;font-size:9px;color:var(--text-dim);margin-top:3px}.social-chat-bar .back,.peer-info{width:36px;min-height:36px;margin:0;border:0;background:transparent;color:var(--text-main);font-size:24px;cursor:pointer}.peer-info{font-size:18px}
  .peer-card{padding:12px;background:var(--glass-2);flex:none}.peer-card p{font-size:11px;color:var(--text-dim);margin:6px 0}.peer-card button{background:var(--tint);color:var(--text-main);border:1px solid var(--stroke);border-radius:8px;padding:6px 12px;cursor:pointer}
  .wechat-page .wc-reply{flex-wrap:wrap;gap:8px}.composer-toggle{flex:1;text-align:left;border:1px solid var(--stroke);border-radius:10px;background:var(--glass-2);color:var(--text-dim);padding:10px;font:inherit;font-size:12px;cursor:pointer}.wechat-page .wc-topic-row{flex-basis:100%}.wechat-page .wc-bubble.me{background:#b1dbc8;color:#19372d}.wechat-page .wc-msgs{background:linear-gradient(160deg,#20334544,#17253544)}
  .request-back{margin-left:12px}.social-list .sms-body{min-width:0}.wechat-page .addr-list{flex:1;min-height:0}
  .phone.app-active { grid-template-rows:38px minmax(0,1fr) 26px; }
  .home-indicator { width:100%;height:100%;padding:0;border:0;background:transparent;cursor:pointer; }
  .home-indicator:focus-visible { outline:2px solid #07c160;outline-offset:-3px;border-radius:9px; }
  .phone.communication-active {
    --bg-deep:#ededed;--bg-soft:#f7f7f7;--bg-card:#fff;--bg-card-hover:#e5e5e5;
    --text-main:#202326;--text-dim:#737b80;--glass:#f7f7f7;--glass-2:#fff;
    --stroke:#dedfe1;--stroke-2:#cfd3d6;--tint:#eef0f1;--accent:#07a952;
    --text-shadow:none;--text-shadow-strong:none;--hud-text-shadow:none;
    background:#ededed;color:#202326;text-shadow:none;
  }
  .communication-active .p-top { background:#f7f7f7;color:#202326; }
  .phone.communication-active .p-time,.communication-active .device-status-icons,.communication-active .p-close { color:#202326; }
  .communication-active .device-battery { border-color:#343a40; }
  .communication-active .device-battery i,.communication-active .device-battery:after { background:#343a40; }
  .communication-active .home-indicator { background:#ededed; }
  .communication-active .home-indicator i { background:#3f444a; }
  .communication-active .phone-screen { border-radius:0;background:#ededed;scrollbar-color:#b7bdc1 transparent; }
  .communication-active .phone-screen :global(.page-title) { color:#202326; }
  .communication-active .wechat-page { background:#ededed;color:#202326; }
  .communication-active .social-top { border-bottom:1px solid #e2e3e5; }
  .communication-active .social-top strong { font-size:18px;letter-spacing:0; }
  .communication-active .social-list { padding:0;background:#fff; }
  .communication-active .social-list .sms-item { padding:12px; }
  .communication-active .social-list .sms-item:hover { background:#f3f4f4; }
  .communication-active .social-search { background:#f7f7f7; }
  .communication-active .social-search input { border:0;background:#e9eaeb;text-align:center; }
  .communication-active .social-avatar { border-radius:7px;background:#e9f3ee; }
  .communication-active .social-badge { background:#fa5151; }
  .communication-active .social-dot { color:#e14949; }
  .communication-active .pending-response { color:#d36b38; }
  .communication-active .wechat-page .wc-tab { color:#737b80;border-top:0; }
  .communication-active .wechat-page .wc-tab.on { color:#07a952;border-top:0; }
  .communication-active .wechat-page .wc-msgs { background:#ededed; }
  .communication-active .wechat-page .wc-bubble.me { background:#95ec69;color:#172519; }
  .communication-active .wc-bubble.them { background:#fff;border:1px solid #e4e5e6; }
  .communication-active .wc-bubble { border-radius:6px;box-shadow:none; }
  .communication-active .wc-reply { background:#f7f7f7; }
  .communication-active .wc-topic,.communication-active .addr-filter { background:#fff;color:#3b4449;border-color:#dce0e2; }
  .communication-active .wc-topic:hover,.communication-active .addr-filter.on { background:#e4f6eb;color:#087c41; }
  .communication-active .addr-list { background:#fff; }
  .communication-active .addr-item { background:#fff; }
</style>
