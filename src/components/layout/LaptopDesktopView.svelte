<script lang="ts">
  /**
   * v1.3 笔记本全屏桌面（Win11 风）
   * ------------------------------------------------------------------
   * 在家「使用笔记本」进入：全屏桌面，含
   *  - 设置（系统）
   *  - 手机除电话外的所有 App（Moments / 外卖 / 网购 / 直播等）
   *  - 笔记本专属 App（论坛博客、编程/设计工作台）
   * 窗口化呈现，可关闭回到桌面。
   */
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { gameState } from "../../stores/gameStore.svelte";
  import { formatMoney } from "../../lib/format";
  import { playSound } from "../../lib/audio";
  import { createPost, toggleSelfLike, commentOnPost, simulateReactionsFor } from "../../game/core/moments";
  import { allCitizens } from "../../game/core/citizens";
  import { TAKEOUT_MENU, placeTakeout, claimOrder as claimTakeoutOrder, arrivedOrders as arrivedTakeout, activeOrders as activeTakeout } from "../../game/core/takeout";
  import { SHOP_CATALOG, placeShopOrder, claimOrder as claimShopOrder, arrivedOrders as arrivedShop, activeOrders as activeShop } from "../../game/core/shop";
  import { canLive, startLive, liveToday } from "../../game/core/live";
  import { forumPosts, postToForum, seedForum } from "../../game/core/forum";
  import { allTournaments, getTournamentDef, tournamentCleared } from "../../game/core/catBattle";
  import {
    signupCheck,
    signupTournament,
    ticketStatusText,
    expireTicketIfMissed,
    daysUntilMatchday,
  } from "../../game/core/tournament";
  import { activePetOf } from "../../game/core/catCare";
  import { momentsPostsOf } from "../../game/core/moments";
  import { gameDay } from "../../game/core/calendar";
  import { MARKET_APPS } from "../../game/core/apps";
  import { workOnProject, projectProgress, isProjectDone, PROJECTS, laptopTier, checkProjectRequirements } from "../../game/core/projects";
  import { advanceTime } from "../../game/engine";
  import { getContact, smsContact, callContact } from "../../game/core/contacts";
  import {
    buyInvestment, sellInvestment,
    investProductById,
  } from "../../game/core/invest";
  import type { SmsMessage } from "../../game/types";
  import { replySms, markSmsRead } from "../../game/core/phone";

  /** 桌面图标：所有图标均可点击进入对应程序（含新增软件商城 / 微信） */
  type LaptopAppId =
    | "settings"
    | "moments"
    | "takeout"
    | "shop"
    | "live"
    | "forum"
    | "dev"
    | "store"
    | "wechat"
    | "invest";

  /** 桌面图标清单：干净网格（左上 2 列对齐，真实可点，无装饰废图标） */
  /** 桌面图标：规整网格（3 列顺序排布），不再用绝对 top/left 避免错位/重叠 */

  const DESKTOP_ICONS: ReadonlyArray<{ id: LaptopAppId; name: string; icon: string }> = [
    { id: "settings", name: "设置", icon: "⚙️" },
    { id: "wechat", name: "微信", icon: "💬" },
    { id: "moments", name: "朋友圈", icon: "🌈" },
    { id: "forum", name: "城市论坛", icon: "📢" },
    { id: "store", name: "软件商城", icon: "🛍️" },
    { id: "dev", name: "编程/设计", icon: "💻" },
    { id: "shop", name: "网购商城", icon: "🛒" },
    { id: "takeout", name: "外卖到家", icon: "🍔" },
    { id: "live", name: "自媒体直播", icon: "📡" },
    { id: "invest", name: "投资理财", icon: "💰" },
  ];
  /** 任务栏钉住的固定应用 + 当前打开的应用（Win11 居中任务栏） */
  const TASKBAR_PINNED: ReadonlyArray<{ id: LaptopAppId | "home"; icon: string; name: string }> = [
    { id: "home", icon: "🏠", name: "主页" },
    { id: "settings", icon: "⚙️", name: "设置" },
    { id: "wechat", icon: "💬", name: "微信" },
    { id: "moments", icon: "🌈", name: "朋友圈" },
    { id: "takeout", icon: "🍔", name: "外卖" },
    { id: "shop", icon: "🛒", name: "商城" },
    { id: "live", icon: "📡", name: "直播" },
    { id: "forum", icon: "📢", name: "论坛" },
    { id: "dev", icon: "💻", name: "编程" },
  ];

  /** 当前打开的窗口（null = 桌面） */
  let openApp = $state<LaptopAppId | null>(null);
  /** Moments 草稿 */
  let momentDraft = $state("");
  let momentCat = $state<"daily" | "fun" | "task">("daily");
  let commentDraft = $state<Record<string, string>>({});
  let expandedPost = $state<string | null>(null);

  /** v1.3 开关：自己发帖功能（与手机端一致，暂时关闭） */
  const SELF_POST_ENABLED = false;

  /** v1.3b6 PC 端投资：仅展示 + 买入/赎回定期存款（按月计息，标准死期利率 1.55% 年化） */
  let investDraft = $state("");
  /** 现有存款：只过滤 productId === "deposit" 的笔 */
  const investDeposits = $derived(
    gameState.economy.investments
      .map((inv) => ({ inv, prod: investProductById(inv.productId) }))
      .filter((x) => x.prod?.id === "deposit"),
  );
  const investTotalValue = $derived(
    investDeposits.reduce((s, x) => s + x.inv.value, 0),
  );
  function onBuyDeposit(): void {
    // v1.3b7 修复：<input type="number"> bind:value 绑定为 number，.trim() 抛 TypeError 导致存入无反应
    const raw = typeof investDraft === "number" ? investDraft : String(investDraft ?? "").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) { showToast("金额须为正数"); return; }
    const r = buyInvestment(gameState, "deposit", amount);
    if (!r.ok) { showToast(r.reason ?? "存入失败"); return; }
    showToast(`已存入定期存款 ${formatMoney(Math.round(amount))} 元`);
    investDraft = "";
  }
  function onRedeemDeposit(id: string): void {
    const r = sellInvestment(gameState, id);
    if (!r.ok) { showToast(r.reason ?? "支取失败"); return; }
    showToast("已支取，现金已到账");
  }

  /** v1.3b4 朋友圈仅显示自己与联系人的动态；论坛/市民帖由 forumPosts 独占 */
  const momentsFeed = $derived(momentsPostsOf(gameState));

  function open(id: LaptopAppId): void {
    // v1.3b8 开局种子帖：首次打开论坛时补种（幂等），保证第一天就有帖子可看
    if (id === "forum") seedForum(gameState, allCitizens());
    // v1.33 P4d 打开论坛时结算缺席作废（过了周日 14:00 未到赛场 → 门票作废）
    if (id === "forum") expireTicketIfMissed(gameState);
    openApp = id;
  }
  function closeWindow(): void {
    openApp = null;
  }
  function closeLaptop(): void {
    uiState.modal = null;
    showToast("已合上笔记本");
  }

  // ---- Moments 交互（与手机端共用逻辑） ----
  function postMoment(): void {
    const text = momentDraft.trim();
    if (!text) { showToast("说点什么吧"); return; }
    createPost(gameState, { text, category: momentCat });
    momentDraft = "";
    showToast("🌈 已发布到 Moments");
  }
  function likeMoment(postId: string): void {
    toggleSelfLike(gameState, postId);
  }
  function sendComment(postId: string): void {
    const text = (commentDraft[postId] ?? "").trim();
    if (!text) return;
    commentOnPost(gameState, postId, {
      id: `c_self_${postId}_${Date.now().toString(36)}`,
      authorId: "self", authorName: "我", authorIcon: "🙂",
      text, day: gameState.time.day,
    });
    commentDraft[postId] = "";
  }
  function simulateMyPostReactions(postId: string): void {
    const reactors = allCitizens().map((c) => ({ id: c.id, name: c.name, icon: c.avatar }));
    const r = simulateReactionsFor(gameState, postId, reactors);
    showToast(`收到 ${r.likes} 赞 / ${r.comments} 评论`);
  }

  /** v1.3 外卖（笔记本端） */
  const laptopTakeoutMenu = TAKEOUT_MENU;
  const laptopTakeoutPending = $derived(activeTakeout(gameState));
  const laptopTakeoutReady = $derived(arrivedTakeout(gameState));
  function laptopOrderTakeout(itemId: string): void {
    const r = placeTakeout(gameState, itemId); showToast(r.text);
  }
  function laptopReceiveTakeout(orderId: string): void {
    const r = claimTakeoutOrder(gameState, orderId); showToast(r.text);
  }

  /** v1.3 网购（笔记本端） */
  const laptopShopCatalog = SHOP_CATALOG;
  const laptopShopPending = $derived(activeShop(gameState));
  const laptopShopReady = $derived(arrivedShop(gameState));
  function laptopOrderShop(itemId: string): void {
    const r = placeShopOrder(gameState, itemId); showToast(r.text);
  }
  function laptopReceiveShop(orderId: string): void {
    const r = claimShopOrder(gameState, orderId); showToast(r.text);
  }

  /** v1.3 直播（笔记本端） */
  const laptopLiveReady = $derived(canLive(gameState));
  const laptopLiveDone = $derived(liveToday(gameState));
  function laptopGoLive(): void {
    const r = startLive(gameState); showToast(r.text);
  }

  /** v1.3b5 笔记本软件商城：与手机应用市场共用 MARKET_APPS，下载即同步 flag（手机/电脑通用） */
  const laptopStoreApps = MARKET_APPS;
  function laptopInstallApp(flag: string, name: string): void {
    // v1.3b7 修复：电脑下载软件写入 laptop_* flags（不再与手机 app_* 混用 → 不再"装进手机"）
    gameState.flags[`laptop_${flag}`] = true;
    showToast(`✅ 已安装：${name}（已放到电脑桌面）`);
    playSound("coin");
  }
  /** 电脑端已下载的 App → 桌面图标（仅映射笔记本有对应窗口的应用；外卖接单/游戏类属手机端不映射） */
  const LAPTOP_DOWNLOAD_MAP: Record<string, { id: LaptopAppId; name: string; icon: string }> = {
    app_takeout: { id: "takeout", name: "外卖到家", icon: "🍔" },
    app_shop: { id: "shop", name: "网购商城", icon: "🛒" },
    app_live: { id: "live", name: "自媒体直播", icon: "📡" },
  };
  const laptopDownloadedIcons = $derived(
    Object.entries(LAPTOP_DOWNLOAD_MAP)
      .filter(([flag]) => gameState.flags[`laptop_${flag}`])
      .map(([, v]) => v),
  );

  /** v1.3b5 微信（PC 端）：与手机通信 App 共用 gameState.smsInbox，两端同步 */
  let wechatThread = $state<string | null>(null);
  /** 会话列表：按联系人聚合 out+in 消息 */
  const wechatThreads = $derived.by(() => {
    const map = new Map<string, { key: string; name: string; icon: string; msgs: SmsMessage[] }>();
    for (const m of gameState.smsInbox) {
      // v1.3b8 修复会话分裂（与手机端一致）：无 contactId 的历史消息按 sender 名字回退解析为联系人 id
      const key = m.contactId ?? gameState.contacts.find((c) => c.name === m.sender)?.id ?? m.sender;
      let t = map.get(key);
      if (!t) { t = { key, name: m.sender, icon: m.senderIcon, msgs: [] }; map.set(key, t); }
      t.msgs.push(m);
    }
    return [...map.values()].map((t) => {
      const sorted = [...t.msgs].sort((a, b) => a.day - b.day);
      const unread = sorted.filter((m) => !m.replied && !m.read && m.dir === "in").length;
      return { key: t.key, name: t.name, icon: t.icon, msgs: sorted, last: sorted[sorted.length - 1], unread };
    }).sort((a, b) => b.last.day - a.last.day);
  });
  /** 当前会话的完整消息流 */
  const wechatCurrent = $derived(
    wechatThread
      ? wechatThreads.find((t) => t.key === wechatThread)?.msgs ?? []
      : [],
  );
  /**
   * v1.3b6 微信回复：三选项按钮替代文本输入框。
   * tone: positive/消极、neutral/平淡、消极/retreatful。
   * 玩家按态度回复 → 主角按语气发开场白 → NPC 自动回信。
   */
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
   * v1.3b8b 恢复前代短信回复体验（与手机端一致）：
   * SMS_SCENARIOS 场景短信（sms_ 前缀）/垃圾短信（junk_ 前缀）自带三档回复选项，
   * 选中后施加效果并得到对方回应；v1.3b5 微信化重构时此入口被遗漏。
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
    const t = wechatThreads.find((x) => x.key === key);
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
  /** 当前会话对应的联系人；奶奶/朋友/老同学等场景发送人不是联系人 */
  const threadContact = $derived(getContact(gameState, wechatThread ?? ""));

  /** v1.3b5 论坛（贴吧风）：3 列布局 + 排序/分类/吧切换 */
  const laptopForumFeed = $derived(forumPosts(gameState));
  let laptopForumDraft = $state("");
  let laptopForumBar = $state<string>("all");
  let laptopForumSort = $state<"latest" | "hot">("latest");
  type ForumCat = "daily" | "fun" | "task";
  let laptopForumCat = $state<ForumCat>("daily");

  interface ForumBar { id: string; name: string; icon: string; count: number }
  /** 论坛栏目录：吧 = 城市话题分组（与 forum.ts FORUM_BARS 对应；count 为展示用虚拟热度） */
  const FORUM_BARS: ReadonlyArray<ForumBar> = [
    { id: "all", name: "全部", icon: "🌐", count: 0 },
    { id: "suburb", name: "跳蚤市场", icon: "🛒", count: 12 },
    { id: "cafe", name: "咖啡馆", icon: "☕", count: 8 },
    { id: "religion", name: "教堂团契", icon: "⛪", count: 6 },
    { id: "volunteer", name: "志愿服务", icon: "🤝", count: 5 },
    { id: "rent", name: "同城租房", icon: "🏠", count: 21 },
    /** v1.33 P4d 喵喵对决赛报名（无帖，渲染报名面板） */
    { id: "tournament", name: "喵喵对决赛", icon: "🏆", count: 4 },
  ];

  function currentBar(): ForumBar {
    return FORUM_BARS.find((b) => b.id === laptopForumBar) ?? FORUM_BARS[0];
  }
  /** 当前吧过滤后的帖（按 forumBar 归属，全部=不过滤） */
  function filteredForum() {
    const bar = currentBar();
    if (bar.id === "all") return laptopForumFeed;
    return laptopForumFeed.filter((p) => (p.forumBar ?? "forum") === bar.id);
  }
  /** 排序后的帖 */
  function sortedForum() {
    const arr = [...filteredForum()];
    if (laptopForumSort === "hot") {
      arr.sort((a, b) => (b.reactions.length + b.comments.length) - (a.reactions.length + a.comments.length));
    } else {
      arr.sort((a, b) => b.day - a.day);
    }
    return arr.slice(0, 30);
  }
  /** 热议榜：按互动数排序，取前 8 */
  function hotForum() {
    return [...laptopForumFeed]
      .sort((a, b) => (b.reactions.length + b.comments.length * 2) - (a.reactions.length + a.comments.length * 2))
      .slice(0, 8);
  }
  function laptopPostForum(): void {
    const t = laptopForumDraft.trim();
    if (!t) { showToast("说点什么吧"); return; }
    postToForum(gameState, t, laptopForumCat);
    laptopForumDraft = "";
    showToast("💬 已发布到城市论坛");
  }

  /** v1.33 P4d 喵喵对决赛报名面板辅助 */
  const tournamentEntry = $derived(gameState.catTournament?.entry);
  const tournamentCarriedPet = $derived(activePetOf(gameState));
  function tournamentPoolText(t: { pools?: { normal?: number; intermediate?: number; boss?: number }; ultimate?: boolean }): string {
    const parts: string[] = [];
    if (t.pools?.normal) parts.push(`${t.pools.normal} 普通`);
    if (t.pools?.intermediate) parts.push(`${t.pools.intermediate} 进阶`);
    if (t.pools?.boss) parts.push(`${t.pools.boss} Boss`);
    if (t.ultimate) parts.push("圆头猫咪");
    return parts.join(" + ") || "—";
  }
  function tournamentSignup(tierId: string): void {
    const r = signupTournament(gameState, tierId);
    if (!r.ok) { showToast(`🚫 ${r.reason ?? "报名失败"}`); return; }
    showToast(`🎟️ 已报名「${getTournamentDef(tierId)?.name ?? ""}」，门票已放入背包`);
    playSound("success");
  }
  /** 距开赛天数文案（面板标题用） */
  const tournamentCountdownText = $derived.by(() => {
    if (!gameState.catTournament?.entry) return "";
    const d = daysUntilMatchday(gameState);
    return d === 0 ? "今天 14:00 开赛" : `距开赛还有 ${d} 天`;
  });

  /** v1.3 编程/设计工作台：列出编程与设计类创业项目，可逐项推进（接真实 workOnProject 逻辑） */
  const laptopTierLabel = $derived((() => {
    const t = laptopTier(gameState);
    return t === "high" ? "电竞本（效率 ×1.8）" : t === "mid" ? "办公本（效率 ×1.35）" : t === "low" ? "老旧笔记本（效率 ×1.0）" : "无笔记本";
  })());
  /** 笔记本工作台展示的创业项目：编程类 + 设计类 */
  const devProjects = $derived(
    PROJECTS.filter((p) => p.category === "programming" || p.category === "design"),
  );
  function devProjProgress(id: string): number {
    return projectProgress(gameState, id);
  }
  function devProjDone(id: string): boolean {
    return isProjectDone(gameState, id);
  }
  /** 项目门槛未达时给出禁用原因（空串 = 可推进） */
  function devBlockReason(id: string): string {
    const proj = PROJECTS.find((x) => x.id === id);
    if (!proj) return "";
    const check = checkProjectRequirements(gameState, proj);
    return check.ok ? "" : (check.reason ?? "");
  }
  /** v1.3b8 编程/设计每日限一次：flag 记录上次推进的游戏天（跨天自动解锁） */
  const DEV_WORK_FLAG = "dev_work_day";
  const devWorkedToday = $derived(Number(gameState.flags[DEV_WORK_FLAG] ?? -9999) === gameDay(gameState.time));
  function laptopWorkProject(projectId: string): void {
    // v1.3b8 修复"连续点击几秒钟搓完软件"：每天只能推进一次
    if (devWorkedToday) {
      showToast("今天已经肝过一轮了，休息一下，明天再来");
      return;
    }
    const r = workOnProject(gameState, projectId);
    if (!r.ok) { showToast(r.reason ?? "推进失败"); return; }
    // 在 advanceTime 之前记录（advanceTime 可能跨天，跨天后即新的一天可再次推进）
    gameState.flags[DEV_WORK_FLAG] = gameDay(gameState.time);
    // v1.3b7 推进一晚真正消耗约 3 小时（与文案一致）
    advanceTime(gameState, 3);
    if (r.completed) {
      showToast(`✅ ${PROJECTS.find((p) => p.id === projectId)?.name ?? "项目"} 完成！`);
      playSound("success");
    } else {
      const p = PROJECTS.find((x) => x.id === projectId);
      showToast(`💻 ${p?.name ?? "项目"} 推进 +${devProjProgress(projectId)}%`);
      playSound("computer");
    }
  }
</script>

<div class="laptop-desktop">
  <!-- 桌面背景（Win11 蓝调壁纸渐变） -->
  <div class="desktop-bg">
    <div class="desktop-glow g1"></div>
    <div class="desktop-glow g2"></div>
    <div class="desktop-glow g3"></div>
  </div>

  <!-- 桌面图标：规整栅格，全部可点击进入对应程序（含电脑商城下载的 App） -->
  <div class="desktop-icons">
    {#each DESKTOP_ICONS as icon (icon.id)}
      <button class="desk-icon" onclick={() => open(icon.id)}>
        <span class="gi-emoji" style="font-size:40px;line-height:1">{icon.icon}</span>
        <span class="di-label">{icon.name}</span>
      </button>
    {/each}
    {#each laptopDownloadedIcons as icon (icon.id)}
      <button class="desk-icon" onclick={() => open(icon.id)}>
        <span class="gi-emoji" style="font-size:40px;line-height:1">{icon.icon}</span>
        <span class="di-label">{icon.name}</span>
      </button>
    {/each}
  </div>

  <!-- 底部居中任务栏（Win11 风：开始 + 钉住 + 运行中 + 系统托盘 + 时钟） -->
  <div class="taskbar">
    <div class="tb-cluster tb-left">
      <!-- 开始按钮（点击回到桌面 = 关闭所有窗口） -->
      <button class="tb-start" onclick={() => (openApp = null)} title="开始">⊞</button>
    </div>

    <div class="tb-cluster tb-pinned">
      {#each TASKBAR_PINNED as p}
        <button
          class="tb-pin"
          class:on={openApp === p.id}
          onclick={() => (p.id === "home" ? (openApp = null) : open(p.id))}
          title={p.name}
        >
          <span class="gi-emoji" style="font-size:22px;line-height:1">{p.icon}</span>
          {#if openApp === p.id}<span class="tb-pin-indicator"></span>{/if}
        </button>
      {/each}
    </div>

    <div class="tb-cluster tb-running">
      {#if openApp}
        <div class="tb-run">
          <span class="tb-run-icon">{DESKTOP_ICONS.find((i) => i.id === openApp)?.icon ?? "🪟"}</span>
          <span class="tb-run-name">{DESKTOP_ICONS.find((i) => i.id === openApp)?.name ?? openApp}</span>
        </div>
      {/if}
    </div>

    <div class="tb-cluster tb-right">
      <span class="tb-ico" title="网络">📶</span>
      <span class="tb-ico" title="音量">🔊</span>
      <span class="tb-ico" title="电池">🔋</span>
      <div class="tb-clock">
        <span class="tb-time">{String(gameState.time.hour).padStart(2, "0")}:{String(gameState.time.minute).padStart(2, "0")}</span>
        <span class="tb-date">{gameState.time.month}/{gameState.time.day}</span>
      </div>
      <button class="tb-close" onclick={closeLaptop} title="合上笔记本">⏻</button>
    </div>
  </div>

  <!-- 应用窗口 -->
  {#if openApp === "settings"}
    <div class="win">
      <div class="win-bar"><span>⚙️ 设置</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body">
        <p class="dim">笔记本系统设置（与手机设置同步）。</p>
        <div class="set-row"><span>玻璃强度</span><span class="dim">{uiState.mapGlass}</span></div>
        <div class="set-row"><span>过场动画</span><span class="dim">{uiState.sceneTransition ? "开" : "关"}</span></div>
      </div>
    </div>
  {:else if openApp === "moments"}
    <!-- v1.3b5 朋友圈：微信风（白底单列时间线 + 顶部封面 + 悬浮头像） -->
    <div class="win moments-win">
      <div class="moments-cover">
        <div class="moments-cover-bg"></div>
        <!-- v1.3b8 修复：朋友圈窗口无关闭入口（win-bar 被隐藏），补浮动关闭键 -->
        <button class="moments-close" onclick={closeWindow} title="关闭朋友圈">✕</button>
        <div class="moments-cover-me">
          <span class="mcover-name">我的朋友圈</span>
          <span class="mcover-avatar">🙂</span>
        </div>
      </div>
      <div class="win-body scroll moments-scroll">
        {#if SELF_POST_ENABLED}
          <div class="moment-editor">
            <textarea class="moment-input" placeholder="这一刻的想法…" bind:value={momentDraft} rows="2"></textarea>
            <div class="moment-tools">
              <div class="seg small">
                <button class="seg-btn" class:on={momentCat === "daily"} onclick={() => (momentCat = "daily")}>日常</button>
                <button class="seg-btn" class:on={momentCat === "fun"} onclick={() => (momentCat = "fun")}>趣事</button>
                <button class="seg-btn" class:on={momentCat === "task"} onclick={() => (momentCat = "task")}>里程碑</button>
              </div>
              <button class="moment-pub" onclick={postMoment}>发表</button>
            </div>
          </div>
        {/if}
        {#if momentsFeed.length === 0}
          <p class="dim" style="text-align:center;padding:20px 0;color:#999">还没有动态，记录第一条朋友圈吧。</p>
        {:else}
          {#each momentsFeed as post (post.id)}
            <div class="timeline-card">
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
                    {#each post.comments as c (c.id)}<div class="tl-comment"><span class="tlc-name">{c.authorIcon} {c.authorName}：</span>{c.text}</div>{/each}
                    <div class="tl-comment-input"><input placeholder="写评论…" bind:value={commentDraft[post.id]} /><button class="moment-pub sm" onclick={() => sendComment(post.id)}>发送</button></div>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {:else if openApp === "dev"}
    <div class="win wide">
      <div class="win-bar"><span>💻 编程 / 设计工作台</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body scroll">
        <p class="dim" style="margin:0 0 12px">当前设备：{laptopTierLabel}。编程类作品完成后转为每周版税，设计类交付即结算奖金。</p>
        {#each devProjects as p (p.id)}
          {@const prog = devProjProgress(p.id)}
          {@const done = devProjDone(p.id)}
          <div class="dev-card">
            <div class="dev-head">
              <span class="gi-emoji" style="font-size:26px;line-height:1">{p.icon}</span>
              <div class="dev-meta">
                <div class="dev-name">{p.name}</div>
                <div class="dev-desc dim">{p.category === "design" ? "设计单（一次性奖金）" : "编程作品（周版税）"}</div>
              </div>
            </div>
            <div class="dev-bar-wrap">
              <div class="dev-bar"><div class="dev-fill" style="width:{prog}%"></div></div>
              <span class="dev-pct">{done ? "✅ 已完成" : `${prog}%`}</span>
            </div>
            {#if done}
              <p class="dim" style="margin:6px 0 0">已完成，可继续下一部 / 下一单。</p>
            {:else if devBlockReason(p.id)}
              {@const why = devBlockReason(p.id)}
              <button class="dev-btn" disabled title={why}>🔒 {why}</button>
            {:else}
              <button class="dev-btn" onclick={() => laptopWorkProject(p.id)}>▶ 推进一晚（约 3 小时）</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if openApp === "forum"}
    <div class="win tieba">
      <div class="win-bar"><span>💬 城市论坛 · 贴吧</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="tieba-body">
        <!-- LEFT：我喜欢的吧 + 我关注 -->
        <aside class="tieba-side tieba-left">
          <section class="tieba-section">
            <div class="tieba-section-title">我喜欢的吧</div>
            {#each FORUM_BARS as b}
              <div class="tieba-bar" class:active={laptopForumBar === b.id} onclick={() => (laptopForumBar = b.id)}>
                <span class="gi-emoji" style="font-size:18px;line-height:1">{b.icon}</span>
                <span class="bar-name">{b.name}</span>
                <span class="bar-count dim">{b.count}</span>
              </div>
            {/each}
          </section>
          <section class="tieba-section">
            <div class="tieba-section-title">我关注的话题</div>
            <div class="tieba-bar"><span class="bar-icon">📰</span><span class="bar-name">城市新闻</span></div>
            <div class="tieba-bar"><span class="bar-icon">🏷️</span><span class="bar-name">二手交易</span></div>
            <div class="tieba-bar"><span class="bar-icon">🤝</span><span class="bar-name">志愿服务</span></div>
          </section>
        </aside>

        <!-- CENTER：发帖编辑 + 帖子流（喵喵对决赛吧 = 报名面板） -->
        <section class="tieba-center">
          {#if currentBar().id === "tournament"}
            <div class="tourney">
              <!-- 吧头 -->
              <div class="tourney-head">
                <div class="th-avatar">🐱</div>
                <div class="th-meta">
                  <div class="th-title-row">
                    <span class="tourney-title">喵喵对决赛</span>
                    <span class="tourney-badge">🏆 官方赛事</span>
                  </div>
                  <div class="tourney-sub dim">城市论坛 × 城市边缘游乐场 · 每周日 14:00 开赛 · 凭门票入场{tournamentEntry && tournamentCountdownText ? ` · ${tournamentCountdownText}` : ""}</div>
                </div>
              </div>

              <!-- 报名状态条 -->
              {#if tournamentEntry}
                <div class="tourney-entry">
                  <div class="te-row"><span class="te-k">已报名</span><b class="te-v">{getTournamentDef(tournamentEntry.tierId)?.name ?? "赛事"}</b></div>
                  <div class="te-row"><span class="te-k">门票状态</span><b class="te-v te-status">{ticketStatusText(gameState)}</b></div>
                  {#if tournamentEntry.started && !tournamentEntry.settled}
                    <div class="te-row"><span class="te-k">当前进度</span><b class="te-v">已击败 {tournamentEntry.beaten.length}/{tournamentEntry.queue.length}，连赢 {tournamentEntry.queue.length} 场夺冠</b></div>
                  {/if}
                  {#if tournamentEntry.settled && tournamentEntry.rank}
                    <div class="te-row"><span class="te-k">上届名次</span><b class="te-v">{tournamentEntry.rank === 1 ? "🥇 冠军" : tournamentEntry.rank === 2 ? "🥈 亚军" : tournamentEntry.rank === 3 ? "🥉 季军" : `第 ${tournamentEntry.rank} 名`}{tournamentEntry.prizeMoney ? ` · 奖金 ${tournamentEntry.prizeMoney} 元` : ""}</b></div>
                  {/if}
                  <div class="te-hint dim">凭门票到城市边缘游乐场的赛场参赛（周六 / 周日开放）</div>
                </div>
              {:else if !tournamentCarriedPet}
                <div class="tourney-notice">
                  <span class="tn-icon">🐾</span>
                  <span>还没有携带猫咪——先领养一只并设为携带，再来报名参赛。</span>
                </div>
              {/if}

              <!-- 档位列表 -->
              <div class="tourney-list">
                {#each allTournaments() as t (t.id)}
                  {@const check = signupCheck(gameState, t.id)}
                  {@const cleared = tournamentCleared(gameState, t.id)}
                  {@const currentTier = tournamentEntry?.tierId === t.id && !tournamentEntry?.settled}
                  <div class="tourney-card" class:on={currentTier}>
                    <div class="tc-head">
                      <span class="tc-icon">{t.icon}</span>
                      <div class="tc-meta">
                        <div class="tc-name">
                          {t.name}
                          {#if cleared}<span class="tc-cleared">✅ 已夺冠</span>{/if}
                          {#if currentTier}<span class="tc-now">报名中</span>{/if}
                        </div>
                        <div class="tc-sub dim">报名费 {t.fee} 元 · 需 Lv.{t.minLevel} · 对手：{tournamentPoolText(t)}</div>
                      </div>
                    </div>
                    <div class="tc-desc dim">{t.desc}</div>
                    <div class="tc-prize">
                      <span class="prize-icon">🏅</span>
                      {t.fee > 0
                        ? `冠军 ${t.fee * t.prize.champion} 元 / 亚军 ${t.fee * t.prize.second} 元 / 季军 ${t.fee * t.prize.third} 元`
                        : "荣誉之战：夺得「耄耋之王」称号"}
                    </div>
                    <div class="tc-act">
                      {#if currentTier}
                        <span class="tc-tag">🎟️ 已报名 · {ticketStatusText(gameState)}</span>
                      {:else}
                        <button class="tc-btn" onclick={() => tournamentSignup(t.id)} disabled={!check.ok}>立即报名 · {t.fee} 元</button>
                        {#if !check.ok}<div class="tc-block">{check.reason}</div>{/if}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
          <!-- 发帖 -->
          <div class="tieba-composer">
            <div class="tieba-composer-head">
              <span class="tieba-composer-icon">🧑</span>
              <span class="tieba-composer-label">在 <b>{currentBar().name}</b> 发帖</span>
            </div>
            <textarea class="tieba-input" placeholder="说说城市里的新鲜事…" bind:value={laptopForumDraft} rows="2"></textarea>
            <div class="tieba-tools">
              <div class="seg small">
                <button class="seg-btn" class:on={laptopForumCat === "daily"} onclick={() => (laptopForumCat = "daily")}>日常</button>
                <button class="seg-btn" class:on={laptopForumCat === "fun"} onclick={() => (laptopForumCat = "fun")}>趣事</button>
                <button class="seg-btn" class:on={laptopForumCat === "task"} onclick={() => (laptopForumCat = "task")}>里程碑</button>
              </div>
              <button class="tieba-pub" onclick={laptopPostForum}>发布</button>
            </div>
          </div>
          <!-- 排序 tabs -->
          <div class="tieba-tabs">
            <button class="tieba-tab" class:on={laptopForumSort === "latest"} onclick={() => (laptopForumSort = "latest")}>最新</button>
            <button class="tieba-tab" class:on={laptopForumSort === "hot"} onclick={() => (laptopForumSort = "hot")}>热议</button>
            <span class="tieba-count dim">共 {laptopForumFeed.length} 帖</span>
          </div>
          <!-- 帖子流 -->
          {#if sortedForum().length === 0}
            <div class="tieba-empty">
              <div class="te-icon">💬</div>
              <div class="te-title">该吧还没有帖</div>
              <div class="te-sub">来发第一帖吧。</div>
            </div>
          {:else}
            <div class="tieba-feed">
              {#each sortedForum() as post (post.id)}
                <article class="tieba-post">
                  <div class="tp-head">
                    <span class="gi-emoji" style="font-size:32px;line-height:1">{post.authorIcon ?? "🏙️"}</span>
                    <div class="tp-meta">
                      <div class="tp-name">{post.authorName ?? "市民"}</div>
                      <div class="tp-sub dim">第 {post.day} 天 · {post.category === "fun" ? "趣事" : post.category === "task" ? "里程碑" : "日常"}</div>
                    </div>
                  </div>
                  <div class="tp-text">{post.text}</div>
                  <!-- v1.3b9 市民跟帖（盖楼） -->
                  {#if post.comments.length > 0}
                    <div class="tp-comments">
                      {#each post.comments as c (c.id)}
                        <div class="tp-comment"><span class="tpc-name">{c.authorIcon ?? "🙂"} {c.authorName}</span>：{c.text}</div>
                      {/each}
                    </div>
                  {/if}
                  <div class="tp-bar">
                    <button class="tp-act" class:liked={post.selfLiked} onclick={() => toggleSelfLike(gameState, post.id)}>
                      <span>👍</span><span>{post.reactions.length + (post.selfLiked ? 1 : 0)}</span>
                    </button>
                    <button class="tp-act"><span>💬</span><span>{post.comments.length}</span></button>
                    <button class="tp-act"><span>↗︎</span><span>回复</span></button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
          {/if}
        </section>

        <!-- RIGHT：热议榜 -->
        <aside class="tieba-side tieba-right">
          <section class="tieba-section">
            <div class="tieba-section-title">24 小时热议榜</div>
            {#if hotForum().length === 0}
              <p class="dim tieba-empty-mini">暂无热议</p>
            {:else}
              {#each hotForum() as p, i (p.id)}
                <div class="tieba-hot">
                  <span class="th-rank" class:top3={i < 3}>{i + 1}</span>
                  <div class="th-body">
                    <div class="th-title">{p.text}</div>
                    <div class="th-sub dim">{p.authorName ?? "市民"} · 👍 {p.reactions.length}</div>
                  </div>
                </div>
              {/each}
            {/if}
          </section>
          <section class="tieba-section">
            <div class="tieba-section-title">最新动态</div>
            <div class="tieba-mini dim">每日 {laptopForumFeed.length > 12 ? "12+" : laptopForumFeed.length} 条新帖</div>
          </section>
        </aside>
      </div>
    </div>
  {:else if openApp === "takeout"}
    <div class="win">
      <div class="win-bar"><span>🍔 外卖到家</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body scroll">
        {#if laptopTakeoutReady.length > 0}
          <div class="set-row"><span>待领取</span></div>
          {#each laptopTakeoutReady as o (o.id)}
            <div class="set-row"><span><span class="gi-emoji" style="font-size:18px;line-height:1">{o.icon}</span> {o.name}</span><button class="mini-btn" onclick={() => laptopReceiveTakeout(o.id)}>领取</button></div>
          {/each}
        {/if}
        <p class="dim">在线点餐，约 1 小时送达（跨天到达）。</p>
        {#each laptopTakeoutMenu as m (m.id)}
          <div class="set-row"><span><span class="gi-emoji" style="font-size:18px;line-height:1">{m.icon}</span> {m.name}<br><span class="dim" style="font-size:10px">{m.desc}</span></span><button class="mini-btn" onclick={() => laptopOrderTakeout(m.id)}>{formatMoney(m.price)}</button></div>
        {/each}
        {#if laptopTakeoutPending.length > 0}<p class="dim">配送中：{laptopTakeoutPending.map((o) => o.name).join("、")}</p>{/if}
      </div>
    </div>
  {:else if openApp === "shop"}
    <div class="win wide">
      <div class="win-bar"><span>🛒 网购商城</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body scroll">
        {#if laptopShopReady.length > 0}
          <div class="set-row"><span>待领取</span></div>
          {#each laptopShopReady as o (o.id)}
            <div class="set-row"><span><span class="gi-emoji" style="font-size:18px;line-height:1">{o.icon}</span> {o.name}</span><button class="mini-btn" onclick={() => laptopReceiveShop(o.id)}>领取</button></div>
          {/each}
        {/if}
        <p class="dim" style="margin:6px 0 10px">线上购买，价格比实体店低约 1 成，3 天快递配送。</p>
        {#each laptopShopCatalog as m (m.id)}
          <div class="shop-row">
            <span class="gi-emoji" style="font-size:22px;line-height:1">{m.icon}</span>
            <div class="shop-info">
              <div class="shop-name">{m.name}<span class="shop-cat dim"> · {m.cat}</span></div>
              <div class="shop-price"><span class="shop-now">{formatMoney(m.price)}</span></div>
            </div>
            <button class="mini-btn" onclick={() => laptopOrderShop(m.id)}>下单</button>
          </div>
        {/each}
        {#if laptopShopPending.length > 0}<p class="dim">配送中：{laptopShopPending.map((o) => o.name).join("、")}</p>{/if}
      </div>
    </div>
  {:else if openApp === "live"}
    <div class="win">
      <div class="win-bar"><span>📡 自媒体直播</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body">
        {#if !laptopLiveReady.ok}
          <p class="dim">{laptopLiveReady.reason}</p>
        {:else}
          <p class="dim">直播才艺赚影响力与打赏，每天限 1 次。</p>
          <div class="set-row"><span>累计影响力</span><span>{gameState.player.stats.fame}</span></div>
          <div class="set-row"><span>累计直播 fame</span><span>{gameState.live?.totalFameGain ?? 0}</span></div>
          <button class="mini-btn" disabled={laptopLiveDone} onclick={laptopGoLive}>{laptopLiveDone ? "今日已直播" : "开始直播"}</button>
        {/if}
      </div>
    </div>
  {:else if openApp === "store"}
    <div class="win wide">
      <div class="win-bar"><span>🛍️ 软件商城</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="win-body scroll">
        <p class="dim" style="margin:6px 0 10px">下载后软件图标出现在电脑桌面；手机端请在手机应用市场单独下载。</p>
        {#each laptopStoreApps as m (m.id)}
          <div class="shop-row">
            <span class="gi-emoji" style="font-size:22px;line-height:1">{m.icon}</span>
            <div class="shop-info">
              <div class="shop-name">{m.name}</div>
              <div class="shop-cat dim">{m.desc}</div>
            </div>
            {#if gameState.flags[`laptop_${m.flag}`]}
              <span class="referral-badge">✓ 已安装</span>
            {:else}
              <button class="mini-btn" onclick={() => laptopInstallApp(m.flag, m.name)}>下载</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if openApp === "invest"}
    <!-- v1.3b6 PC 端投资理财：仅定期存款（标准死期利率 1.55% 年化，按月结息） -->
    <div class="win invest-win">
      <div class="win-bar">
        <span>💰 投资理财</span>
        <button class="tb-close" onclick={() => (openApp = null)}>✕</button>
      </div>
      <div class="win-body scroll invest-body">
        <div class="iv-summary">
          <div class="iv-label dim">现金</div>
          <div class="iv-cash">{formatMoney(gameState.player.money)}</div>
          <div class="iv-label dim">定期存款本金（年化 1.55%，每月 1 号按月结息）</div>
          <div class="iv-dep">{formatMoney(investTotalValue)}</div>
        </div>

        <div class="iv-card">
          <div class="h2">🏦 存入定期存款</div>
          <p class="dim">稳赚不赔：每月 1 号按月息 0.13% 计息（年化 1.55%，参照 2024 标准死期利率）。最低 100 元起存。</p>
          <div class="iv-input-row">
            <input type="number" min="0" placeholder="存入金额（元）" bind:value={investDraft} />
            <button class="btn btn-pri" onclick={onBuyDeposit}>存入</button>
          </div>
        </div>

        <div class="iv-card">
          <div class="h2">📋 现有存款</div>
          {#if investDeposits.length === 0}
            <p class="dim">暂无定期存款</p>
          {:else}
            {#each investDeposits as { inv, prod } (inv.id)}
              <div class="iv-row">
                <div class="iv-row-top">
                  <span>{prod?.icon ?? "💼"} {prod?.name ?? inv.productId}</span>
                  <span class="dim">本金 {formatMoney(inv.principal)}</span>
                </div>
                <div class="iv-row-bot">
                  <span>当前 {formatMoney(inv.value)}</span>
                  <span class="tag {inv.value >= inv.principal ? 'gain' : 'cost'}">
                    {inv.value >= inv.principal ? '+' : ''}{formatMoney(inv.value - inv.principal)}
                  </span>
                  <button class="btn btn-sm" onclick={() => onRedeemDeposit(inv.id)}>支取</button>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <p class="dim iv-foot">注：本页仅展示定期存款。基金/股票暂未上线。</p>
      </div>
    </div>
  {:else if openApp === "wechat"}
    <!-- v1.3b5 微信（PC 端）：会话列表 + 聊天窗，与手机通信同步 -->
    <div class="win wechat-win">
      <div class="win-bar"><span>💬 微信</span><button class="win-x" onclick={closeWindow}>✕</button></div>
      <div class="wechat-body">
        <!-- 左侧会话列表 -->
        <aside class="wechat-list">
          <div class="wechat-list-head">
            <span>会话</span>
            {#if wechatThreads.some((t) => t.unread > 0)}
              <button class="read-all-btn" onclick={markAllRead}>全部已读</button>
            {/if}
          </div>
          {#if wechatThreads.length === 0}
            <p class="dim" style="padding:20px 12px;color:#999;font-size:12px">暂无会话，去联系人里发条消息吧。</p>
          {:else}
            {#each wechatThreads as th (th.key)}
              <button class="wc-item" class:on={wechatThread === th.key} onclick={() => openThread(th.key)}>
                <span class="gi-emoji" style="font-size:30px;line-height:1">{th.icon}</span>
                <div class="wc-main">
                  <div class="wc-name">{th.name}</div>
                  <div class="wc-prev dim">{th.last.replied ? (th.last.replyText ?? "已读") : th.last.text}</div>
                </div>
                {#if th.unread > 0}<span class="wc-badge">{th.unread}</span>{/if}
              </button>
            {/each}
          {/if}
        </aside>
        <!-- 右侧聊天窗 -->
        <section class="wechat-chat">
          {#if !wechatThread}
            <div class="wc-empty">
              <div class="wce-icon">💬</div>
              <div class="wce-title">选择一个会话开始聊天</div>
            </div>
          {:else}
            {@const peer = wechatThreads.find((t) => t.key === wechatThread)}
            <div class="wc-chat-head">{peer?.name}</div>
            <div class="wc-msgs scroll">
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
                <div class="wc-noncontact">💬 {peer?.name ?? "对方"}不是常用联系人，点击上方短信的回复按钮继续对话</div>
              {/if}
            </div>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .laptop-desktop {
    /* 全屏覆盖层：钉成深色柔光玻璃，不随昼夜主题翻转（与手机 .phone 同理） */
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
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
    color: var(--text-main);
  }
  .desktop-bg {
    position: absolute; inset: 0;
    background: linear-gradient(150deg, #093060 0%, #142a55 35%, #1f1535 65%, #2a1c4d 100%);
    overflow: hidden;
  }
  .desktop-glow {
    position: absolute; border-radius: 50%;
    filter: blur(64px);
    opacity: 0.55;
    pointer-events: none;
  }
  .desktop-glow.g1 { width: 480px; height: 480px; top: -120px; left: 25%; background: #4d8eff; }
  .desktop-glow.g2 { width: 380px; height: 380px; bottom: 5%; right: -60px; background: #8a4dff; opacity: 0.4; }
  .desktop-glow.g3 { width: 300px; height: 300px; top: 38%; left: 45%; background: #1ec9a8; opacity: 0.3; }
  /* 桌面图标：散乱分布（绝对定位由内联 style.top/style.left 控制） */
  .desktop-icons {
    position: absolute; top: 14px; left: 14px;
    z-index: 1;
    display: grid; grid-template-columns: repeat(3, 84px); grid-auto-rows: 88px;
    gap: 4px;
    pointer-events: none;
  }
  .desk-icon {
    pointer-events: auto;
    width: 84px; height: 88px;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 4px;
    padding: 8px 4px 4px 4px;
    background: transparent; border: 1px solid transparent; border-radius: 6px;
    color: #fff; cursor: pointer;
    transition: background 0.14s ease, border-color 0.14s ease;
  }
  .desk-icon:disabled { cursor: default; }
  .desk-icon:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
  .desk-icon:active:not(:disabled) { transform: scale(0.97); }
  .di-glyph { font-size: 30px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); }
  .di-label {
    font-size: 10.5px; line-height: 1.2; text-align: center;
    text-shadow: 0 1px 2px rgba(0,0,0,0.55);
    word-break: keep-all;
    max-width: 64px;
  }

  /* Win11 风格底部居中任务栏 */
  .taskbar {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 4;
    height: 50px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 8px;
    background: rgba(20, 25, 45, 0.62);
    backdrop-filter: blur(28px) saturate(1.2);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #eef1ff;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  .tb-cluster { display: flex; align-items: center; gap: 4px; }
  .tb-left { padding-right: 4px; }
  .tb-right { padding-left: 4px; gap: 2px; }
  .tb-pinned { flex: 0 1 auto; justify-content: center; }
  .tb-running { flex: 0 1 auto; padding-left: 6px; }
  .tb-start {
    width: 40px; height: 36px;
    background: transparent; border: 1px solid transparent; border-radius: 6px;
    color: #eef1ff; cursor: pointer; font-size: 18px;
    transition: background 0.14s ease;
  }
  .tb-start:hover { background: rgba(255, 255, 255, 0.1); }
  .tb-pin {
    width: 40px; height: 36px;
    background: transparent; border: 1px solid transparent; border-radius: 6px;
    color: #eef1ff; cursor: pointer; font-size: 17px;
    position: relative;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.14s ease;
  }
  .tb-pin:hover { background: rgba(255, 255, 255, 0.1); }
  .tb-pin.on { background: rgba(255, 255, 255, 0.08); }
  .tb-pin-ic { line-height: 1; }
  /* 当前应用指示点（Win11 风：小竖条在底部） */
  .tb-pin-indicator {
    position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
    width: 4px; height: 4px; border-radius: 50%;
    background: var(--accent, #0084ff);
  }
  /* 运行中的应用预览 */
  .tb-run {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11.5px;
    color: #eef1ff;
    max-width: 140px;
  }
  .tb-run-icon { font-size: 14px; }
  .tb-run-name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* 系统托盘图标 */
  .tb-ico { font-size: 13px; padding: 4px 6px; border-radius: 4px; cursor: default; }
  .tb-ico:hover { background: rgba(255, 255, 255, 0.08); }
  .tb-clock {
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
    padding: 4px 10px; border-radius: 6px;
    font-size: 10.5px; color: #eef1ff;
    line-height: 1.2; text-align: right;
    cursor: default;
  }
  .tb-clock:hover { background: rgba(255, 255, 255, 0.08); }
  .tb-time { font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .tb-date { font-size: 10.5px; opacity: 0.85; }
  .tb-close {
    background: rgba(255, 90, 90, 0.16); border: 1px solid rgba(255, 90, 90, 0.35);
    color: #ff9a9a; border-radius: 6px; padding: 5px 9px; cursor: pointer; font-size: 13px;
    margin-left: 4px;
  }
  .tb-close:hover { background: rgba(255, 90, 90, 0.28); }
  .win {
    position: absolute; z-index: 3; top: 24px; left: 50%; transform: translateX(-50%);
    width: 420px; max-height: calc(100% - 88px);
    background: var(--glass-2); border: 1px solid var(--stroke-2); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: var(--lift-lg), inset 0 0 0 1px var(--stroke);
    backdrop-filter: blur(18px) saturate(1.1);
  }
  .win.wide { width: 520px; }
  .win-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--glass); color: var(--text-main); font-size: 13px; font-weight: 700;
    border-bottom: 1px solid var(--stroke);
  }
  .win-x { background: transparent; border: none; color: var(--text-dim); cursor: pointer; font-size: 15px; padding: 4px; border-radius: 8px; }
  .win-x:hover { background: var(--tint); color: var(--text-main); }
  .win-body { padding: 16px; overflow-y: auto; color: var(--text-main); font-size: 13px; }
  .win-body.scroll { max-height: calc(100vh - 180px); }
  /* v1.3b9 滚轮适配：电脑端各软件窗口统一细滚动条 */
  .win-body.scroll {
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-main) 24%, transparent) transparent;
  }
  .win-body.scroll::-webkit-scrollbar { width: 8px; }
  .win-body.scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-main) 22%, transparent); border-radius: 999px; }
  .win-body.scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--text-main) 38%, transparent); }
  .win-body.scroll::-webkit-scrollbar-track { background: transparent; }
  .set-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--stroke); font-size: 12.5px; }
  .dim { color: var(--text-dim); }
  .mini-btn {
    min-width: 44px; height: 38px; border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
    color: var(--text-main); font-size: 13px; cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease;
  }
  .mini-btn:hover { background: color-mix(in srgb, var(--accent) 26%, transparent); }
  .mini-btn:active { transform: scale(0.94); }
  .mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .moment-editor { background: var(--glass); border: 1px solid var(--stroke-2); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .moment-input { width: 100%; background: color-mix(in srgb, var(--bg-deep) 60%, transparent); border: 1px solid var(--stroke); border-radius: 10px; color: var(--text-main); padding: 8px; font-size: 13px; resize: none; font-family: inherit; }
  .moment-tools { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .seg { display: inline-flex; background: var(--tint); border-radius: 10px; padding: 3px; gap: 3px; }
  .seg-btn { border: none; background: transparent; color: var(--text-dim); font-size: 12px; padding: 5px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .seg-btn.on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent, #ffd166); }
  .seg.small .seg-btn { padding: 4px 8px; font-size: 11px; }
  .moment-card { background: var(--glass); border: 1px solid var(--stroke); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .moment-head { display: flex; align-items: center; gap: 8px; }
  .moment-avatar { font-size: 22px; }
  .moment-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
  .moment-sub { font-size: 10px; color: var(--text-dim); }
  .moment-text { font-size: 13px; line-height: 1.5; color: var(--text-main); }
  .moment-hint { font-size: 11px; color: var(--accent-2, #ffd479); }
  .moment-actions { display: flex; gap: 12px; margin-top: 2px; }
  .moment-act { background: transparent; border: none; color: var(--text-dim); font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
  .moment-act:hover { color: var(--text-main); }
  .moment-act.liked { color: #ff6b9d; }
  .moment-comments { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--stroke); }
  .moment-comment { font-size: 12px; color: var(--text-dim); }
  .mc-name { color: var(--text-dim); opacity: 0.85; }
  .moment-comment-input { display: flex; gap: 6px; }
  .moment-comment-input input { flex: 1; background: color-mix(in srgb, var(--bg-deep) 60%, transparent); border: 1px solid var(--stroke); border-radius: 8px; color: var(--text-main); padding: 5px 8px; font-size: 12px; }
  /* v1.3 编程/设计工作台卡片 */
  .dev-card { background: var(--glass); border: 1px solid var(--stroke); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
  .dev-head { display: flex; align-items: center; gap: 10px; }
  .dev-icon { font-size: 24px; }
  .dev-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
  .dev-desc { font-size: 10.5px; }
  .dev-bar-wrap { display: flex; align-items: center; gap: 10px; }
  .dev-bar { flex: 1; height: 8px; background: var(--tint); border-radius: 999px; overflow: hidden; }
  .dev-fill { height: 100%; background: linear-gradient(90deg, var(--accent-2, #6cc6ff), var(--accent, #ffd166)); border-radius: 999px; transition: width 0.3s ease; }
  .dev-pct { font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
  .dev-btn { margin-top: 4px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 16%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent); color: var(--text-main); font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.16s ease; }
  .dev-btn:hover { background: color-mix(in srgb, var(--accent) 28%, transparent); }
  .dev-btn:disabled { opacity: 0.55; cursor: not-allowed; background: var(--stroke); border-color: var(--stroke-2); }
  .dev-btn:disabled:hover { background: var(--stroke); }
  .dev-btn:active { transform: scale(0.98); }
  /* v1.3 网购商城行 */
  .shop-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--glass); border: 1px solid var(--stroke); margin-bottom: 8px; }
  .shop-icon { font-size: 22px; flex-shrink: 0; }
  .shop-info { flex: 1; min-width: 0; }
  .shop-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
  .shop-cat { font-size: 10.5px; }
  .shop-price { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; }
  .shop-off { font-size: 11px; color: var(--text-dim); text-decoration: line-through; }
  .shop-now { font-size: 13px; font-weight: 700; color: var(--accent, #ffd166); }
  .shop-save { font-size: 10.5px; color: var(--ok, #7bd88f); }

  /* ===== v1.3b4 论坛贴吧风（3 列布局 + 浅色主题） ===== */
  .win.tieba {
    width: 760px; max-width: calc(100% - 64px);
    max-height: calc(100% - 80px);
    background: #ffffff; color: #1a1a1a;
    border: 1px solid #d8dbe0;
    border-radius: 8px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  }
  .win.tieba .win-bar {
    background: #f5f6f8; color: #1a1a1a;
    border-bottom: 1px solid #e0e2e6;
    font-weight: 600;
  }
  .win.tieba .win-x { color: #555; }
  .tieba-body {
    display: flex; flex-direction: row;
    width: 100%; height: calc(100% - 41px);
    background: #ffffff;
  }
  .tieba-side {
    background: #f5f6f8;
    border-right: 1px solid #e6e8eb;
    padding: 12px 10px;
    overflow-y: auto;
    flex-shrink: 0;
    /* v1.3b9 滚轮适配 */
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.18) transparent;
  }
  .tieba-side::-webkit-scrollbar { width: 6px; }
  .tieba-side::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.16); border-radius: 999px; }
  .tieba-side::-webkit-scrollbar-track { background: transparent; }
  .tieba-left { width: 156px; }
  .tieba-right {
    width: 168px;
    border-right: none;
    border-left: 1px solid #e6e8eb;
  }
  .tieba-section { margin-bottom: 18px; }
  .tieba-section-title {
    font-size: 12px; font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 8px;
    padding-left: 4px;
    border-left: 3px solid #0084ff;
    line-height: 1;
  }
  .tieba-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 6px; border-radius: 4px; cursor: pointer;
    color: #333; font-size: 12.5px;
  }
  .tieba-bar:hover { background: rgba(0, 0, 0, 0.04); }
  .tieba-bar.active { background: rgba(0, 132, 255, 0.1); color: #0084ff; font-weight: 600; }
  .bar-icon { font-size: 16px; width: 22px; text-align: center; }
  .bar-name { flex: 1; }
  .bar-count { font-size: 10.5px; }

  /* CENTER */
  .tieba-center {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    background: #ffffff;
  }
  .tieba-composer {
    margin: 12px 12px 8px 12px;
    border: 1px solid #d8dbe0; border-radius: 6px;
    background: #ffffff;
    padding: 10px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .tieba-composer-head { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
  .tieba-composer-icon {
    width: 24px; height: 24px; border-radius: 50%;
    background: linear-gradient(135deg, #cce8ff 0%, #aedaf5 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
  }
  .tieba-input {
    width: 100%; box-sizing: border-box;
    border: 1px solid #d8dbe0; border-radius: 4px;
    background: #fafbfc;
    padding: 8px 10px; font-size: 12.5px; color: #222;
    resize: none; outline: none;
    font-family: inherit;
  }
  .tieba-input:focus { border-color: #0084ff; background: #ffffff; }
  .tieba-tools {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 4px;
    border-top: 1px solid #f0f1f3;
  }
  .tieba-tools .seg.small .seg-btn {
    padding: 3px 8px; font-size: 11px;
    border: 1px solid #d8dbe0;
    border-radius: 3px;
    background: #ffffff;
    color: #555;
  }
  .tieba-tools .seg.small .seg-btn.on {
    background: #0084ff; color: #ffffff;
    border-color: #0084ff;
  }
  .tieba-pub {
    background: #07c160; color: #fff;
    border: none; padding: 5px 14px; border-radius: 4px;
    font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .tieba-pub:hover { background: #06ae57; }
  /* tabs */
  .tieba-tabs {
    display: flex; align-items: center; gap: 4px;
    padding: 0 12px; margin: 4px 0 8px 0;
    border-bottom: 1px solid #f0f1f3;
  }
  .tieba-tab {
    background: transparent; border: none;
    color: #576b95; font-size: 13.5px; font-weight: 600;
    padding: 6px 12px; cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .tieba-tab:hover { color: #0084ff; }
  .tieba-tab.on { color: #0084ff; border-bottom-color: #0084ff; }
  .tieba-count { margin-left: auto; font-size: 11px; }
  /* feed */
  .tieba-feed {
    flex: 1; overflow-y: auto;
    padding: 0 4px 12px 4px;
    /* v1.3b9 滚轮适配：独立滚动区 + 平滑滚动 + 淡色细滚动条 */
    overscroll-behavior: contain;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.22) transparent;
  }
  .tieba-feed::-webkit-scrollbar { width: 8px; }
  .tieba-feed::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.18); border-radius: 999px; border: 2px solid #fff; }
  .tieba-feed::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.32); }
  .tieba-feed::-webkit-scrollbar-track { background: transparent; }
  .tieba-post {
    border-bottom: 1px solid #f0f1f3;
    padding: 10px 8px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .tieba-post:hover { background: rgba(0, 132, 255, 0.03); }
  .tp-head { display: flex; align-items: flex-start; gap: 8px; }
  .tp-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #fff5d8 0%, #ffe1b6 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .tp-meta { flex: 1; min-width: 0; }
  .tp-name { font-size: 13px; font-weight: 600; color: #576b95; line-height: 1.2; }
  .tp-sub { font-size: 10.5px; color: #b2b6bb; margin-top: 1px; }
  .tp-text {
    font-size: 13.5px; line-height: 1.55; color: #1a1a1a;
    white-space: pre-wrap; word-break: break-word;
    margin-left: 40px;
  }
  .tp-bar {
    display: flex; align-items: center; gap: 14px;
    margin-left: 40px;
    color: #576b95;
    padding: 2px 0;
  }
  .tp-act {
    background: transparent; border: none;
    color: #576b95; cursor: pointer;
    font-size: 11.5px;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 4px; border-radius: 4px;
  }
  .tp-act:hover { background: rgba(0, 0, 0, 0.04); }
  .tp-act.liked { color: #f5567b; }
  /* v1.3b9 市民跟帖（盖楼） */
  .tp-comments {
    margin-left: 40px;
    background: #f5f6f8;
    border-radius: 4px;
    padding: 6px 10px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .tp-comment { font-size: 12px; color: #444; line-height: 1.5; }
  .tpc-name { color: #576b95; font-weight: 600; }

  /* RIGHT - hot list */
  .tieba-hot {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px dashed #e6e8eb;
  }
  .tieba-hot:last-child { border-bottom: none; }
  .th-rank {
    width: 18px; height: 18px; border-radius: 3px;
    background: #f0f1f3; color: #999;
    font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .th-rank.top3 {
    background: #f5567b; color: #fff;
  }
  .th-body { flex: 1; min-width: 0; }
  .th-title {
    font-size: 12px; color: #1a1a1a; line-height: 1.35;
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .th-sub { font-size: 10px; margin-top: 2px; }

  /* empty */
  .tieba-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #999; padding: 32px 12px; gap: 6px;
  }
  .te-icon { font-size: 50px; opacity: 0.55; }
  .te-title { font-size: 14px; color: #576b95; font-weight: 600; }
  .te-sub { font-size: 12px; color: #a0a3a8; }
  .tieba-empty-mini { padding: 10px 4px; font-size: 11.5px; }
  .tieba-mini { font-size: 11.5px; padding: 4px; }

  /* ===== v1.3b5 朋友圈微信风（白底 + 顶部封面 + 悬浮头像 + 单列时间线） ===== */
  .win.moments-win {
    width: 440px; max-width: calc(100% - 64px);
    background: #ededed; color: #1a1a1a;
    border: 1px solid #d8dbe0; border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  }
  .moments-cover {
    position: relative; height: 140px; border-radius: 10px 10px 0 0; overflow: hidden;
    flex-shrink: 0;
  }
  .moments-cover-bg {
    position: absolute; inset: 0;
    background: linear-gradient(150deg, #2b5876 0%, #4e4376 55%, #6a5b8c 100%);
  }
  /* v1.3b8 朋友圈浮动关闭键（win-bar 被隐藏后的唯一关闭入口） */
  .moments-close {
    position: absolute; top: 10px; right: 12px; z-index: 3;
    width: 30px; height: 30px; border: none; border-radius: 8px;
    background: rgba(0, 0, 0, 0.35); color: #fff; font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .moments-close:hover { background: rgba(0, 0, 0, 0.6); }
  .moments-cover-me {
    position: absolute; right: 16px; bottom: -26px;
    display: flex; align-items: flex-end; gap: 10px;
  }
  .mcover-name { color: #fff; font-size: 16px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,.5); margin-bottom: 6px; }
  .mcover-avatar {
    width: 56px; height: 56px; border-radius: 8px;
    background: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 30px; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3);
  }
  .moments-scroll { background: #ededed; padding-top: 34px; }
  /* v1.3b9 滚轮适配 */
  .moments-scroll {
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.18) transparent;
  }
  .moments-scroll::-webkit-scrollbar { width: 6px; }
  .moments-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.16); border-radius: 999px; }
  .moments-scroll::-webkit-scrollbar-track { background: transparent; }
  .moments-win .win-bar { display: none; }
  .moment-editor {
    margin: 0 12px 12px 12px; background: #fff; border: 1px solid #e3e5e8;
    border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;
  }
  .moment-pub {
    background: #07c160; color: #fff; border: none; padding: 5px 16px; border-radius: 4px;
    font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-end;
  }
  .moment-pub:hover { background: #06ae57; }
  .moment-pub.sm { padding: 4px 12px; align-self: stretch; }
  .timeline-card {
    display: flex; gap: 10px; padding: 12px; background: #fff;
    border: 1px solid #e3e5e8; border-radius: 6px; margin: 0 12px 10px 12px;
  }
  .tl-avatar {
    width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0;
    background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 22px;
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

  /* ===== v1.3b6 PC 投资（仅定期存款，月计息） ===== */
  .win.invest-win {
    width: 520px; max-width: calc(100% - 48px);
    height: 560px; max-height: calc(100% - 88px);
    background: var(--glass-2); color: var(--text-main);
  }
  .iv-summary {
    padding: 16px;
    background: linear-gradient(180deg, var(--glass), transparent);
    border-bottom: 1px solid var(--stroke);
  }
  .iv-summary .iv-cash { font-size: 22px; font-weight: 700; margin: 4px 0 12px; }
  .iv-summary .iv-dep { font-size: 18px; font-weight: 700; color: #4caf82; margin-top: 4px; }
  .iv-card { padding: 14px 16px; border-bottom: 1px solid var(--stroke); }
  .iv-input-row { display: flex; gap: 8px; margin-top: 10px; }
  .iv-input-row input { flex: 1; min-width: 0; padding: 9px 10px; border: 1px solid var(--stroke); border-radius: 6px; font-size: 14px; background: var(--bg-deep); color: var(--text-main); }
  .iv-row { padding: 10px 0; border-bottom: 1px dashed var(--stroke); display: flex; flex-direction: column; gap: 4px; }
  .iv-row:last-child { border-bottom: none; }
  .iv-row-top, .iv-row-bot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .iv-foot { padding: 12px 16px; font-size: 12px; }

  /* ===== v1.3b6 微信（PC 端）：固定大小窗口 ===== */
  .win.wechat-win {
    width: 700px; height: 560px;
    max-width: calc(100% - 48px); max-height: calc(100% - 88px);
    background: #f5f5f5; color: #1a1a1a;
    border: 1px solid #d8dbe0; border-radius: 8px;
    overflow: hidden;
  }
  .wechat-body { display: flex; flex-direction: row; height: calc(100% - 41px); }
  .wechat-list {
    width: 200px; flex-shrink: 0; background: #e9e9e9;
    border-right: 1px solid #d5d5d5; overflow-y: auto; padding: 6px 0;
  }
  .wechat-list-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 12px 8px; font-size: 12px; font-weight: 700; color: #555;
  }
  .read-all-btn {
    padding: 2px 8px; font-size: 11px; color: #07c160;
    background: rgba(7, 193, 96, 0.12); border: 1px solid rgba(7, 193, 96, 0.35);
    border-radius: 999px; cursor: pointer;
  }
  .read-all-btn:hover { background: rgba(7, 193, 96, 0.2); }
  .wc-item {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 10px 12px; background: transparent; border: none; cursor: pointer; text-align: left;
  }
  .wc-item:hover { background: #dfdfdf; }
  .wc-item.on { background: #c9c9c9; }
  .wc-avatar { font-size: 26px; flex-shrink: 0; }
  .wc-main { flex: 1; min-width: 0; }
  .wc-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  .wc-prev { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .wc-badge {
    min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: #fa5151; color: #fff; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .wechat-chat { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #f5f5f5; }
  .wc-chat-head {
    padding: 12px 16px; font-size: 14px; font-weight: 600; color: #1a1a1a;
    border-bottom: 1px solid #e3e3e3; background: #f5f5f5;
  }
  .wc-msgs {
    flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
    /* v1.3b9 滚轮适配 */
    overscroll-behavior: contain;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }
  .wc-msgs::-webkit-scrollbar { width: 6px; }
  .wc-msgs::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.18); border-radius: 999px; }
  .wc-msgs::-webkit-scrollbar-track { background: transparent; }
  .wc-row { display: flex; align-items: flex-start; gap: 8px; }
  /* me 行：bubble 在内左侧 / 头像在外右侧（默认 row 顺序即可） */
  .wc-row.me { justify-content: flex-end; }
  .wc-av { font-size: 22px; flex-shrink: 0; width: 30px; height: 30px; border-radius: 4px; background: #e0e0e0; display: flex; align-items: center; justify-content: center; }
  .wc-bubble {
    max-width: 70%; padding: 8px 12px; border-radius: 6px; font-size: 13px; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
  }
  .wc-bubble.me { background: #95ec69; color: #1a1a1a; }
  .wc-bubble.them { background: #fff; color: #1a1a1a; border: 1px solid #e3e3e3; }
  .wc-reply { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid #e3e3e3; background: #f5f5f5; }
  .wc-call { background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
  .wc-call:hover { background: rgba(0,0,0,.06); }
  /* v1.3b7 三选回复按钮（真实按钮样式） */
  .wc-tone-row { display: flex; flex: 1; gap: 6px; min-width: 0; }
  .wc-tone {
    flex: 1; min-width: 0; padding: 9px 4px; border-radius: 6px;
    border: 1px solid #d8dbe0; background: #fff;
    color: #1a1a1a; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit;
    transition: transform 0.06s ease, background 0.14s ease;
  }
  .wc-tone:hover { background: #e9f7ef; }
  .wc-tone:active { transform: translateY(1px); }
  .wc-tone.pos { color: #1d7a3f; }
  .wc-tone.neu { color: #555; }
  .wc-tone.neg { color: #8a4a4a; }
  /* v1.3b8b 场景短信回复按钮（恢复前代三档交互，与手机端一致） */
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
  .wc-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #b2b6bb; gap: 8px; }
  .wce-icon { font-size: 48px; opacity: .5; }
  .wce-title { font-size: 13px; }

  /* ===== v1.34 喵喵对决赛报名面板（贴吧同档次卡片） ===== */
  .tourney {
    display: flex; flex-direction: column; gap: 12px;
    padding: 4px 2px 16px;
  }
  /* 吧头 */
  .tourney-head {
    display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, #fff9ec 0%, #fff3d6 100%);
    border: 1px solid #f0d9a8;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .th-avatar {
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, #ffd88a, #ff9d4a);
    display: flex; align-items: center; justify-content: center;
    font-size: 30px;
    box-shadow: 0 4px 12px rgba(255, 157, 74, 0.35);
    flex-shrink: 0;
  }
  .th-meta { flex: 1; min-width: 0; }
  .th-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tourney-title { font-size: 18px; font-weight: 800; color: #1a1a1a; }
  .tourney-badge {
    font-size: 10.5px; font-weight: 700; color: #b0564f;
    background: #fde9e6; border: 1px solid #f5c9c2;
    padding: 2px 8px; border-radius: 999px;
  }
  .tourney-sub { font-size: 11px; color: #8a8f96; margin-top: 3px; line-height: 1.5; }
  /* 已报名状态卡 */
  .tourney-entry {
    background: #f2f7ff; border: 1px solid #cfe0f5;
    border-radius: 8px; padding: 10px 14px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .te-row { display: flex; align-items: baseline; gap: 10px; font-size: 12.5px; }
  .te-k { color: #8a93a0; font-size: 11.5px; width: 64px; flex-shrink: 0; }
  .te-v { color: #1a1a1a; font-weight: 600; }
  .te-status { color: #0f88eb; }
  .te-hint { font-size: 11px; margin-top: 3px; padding-top: 6px; border-top: 1px dashed #d4e2f5; }
  /* 无猫提示条 */
  .tourney-notice {
    display: flex; align-items: center; gap: 10px;
    background: #fff8e6; border: 1px solid #f2e0ae;
    border-radius: 8px; padding: 10px 14px;
    font-size: 12.5px; color: #8a6d1f;
  }
  .tn-icon { font-size: 20px; }
  /* 档位列表 */
  .tourney-list { display: flex; flex-direction: column; gap: 10px; }
  .tourney-card {
    background: #ffffff; border: 1px solid #e6e8eb;
    border-radius: 10px; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .tourney-card:hover { box-shadow: 0 6px 18px rgba(0, 0, 0, 0.09); }
  .tourney-card.on {
    border-color: #0f88eb;
    box-shadow: 0 0 0 2px rgba(15, 136, 235, 0.12), 0 4px 14px rgba(15, 136, 235, 0.12);
  }
  .tc-head { display: flex; align-items: center; gap: 10px; }
  .tc-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #fff3d0, #ffd88a);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; flex-shrink: 0;
  }
  .tc-meta { flex: 1; min-width: 0; }
  .tc-name { font-size: 14px; font-weight: 700; color: #1a1a1a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tc-cleared { font-size: 11px; color: #0f9d58; background: #e6f7ec; padding: 1px 7px; border-radius: 999px; }
  .tc-now { font-size: 11px; color: #fff; background: #0f88eb; padding: 1px 7px; border-radius: 999px; }
  .tc-sub { font-size: 11px; color: #8a8f96; margin-top: 2px; }
  .tc-desc { font-size: 12px; color: #5a6472; line-height: 1.55; }
  .tc-prize {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #b0564f; font-weight: 600;
    background: #fdf3f1; border: 1px dashed #f0d3cd;
    border-radius: 6px; padding: 6px 10px;
  }
  .prize-icon { font-size: 14px; }
  .tc-act { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .tc-btn {
    font: inherit; font-size: 13px; font-weight: 700; color: #fff;
    background: #0f88eb; border: none; border-radius: 6px;
    padding: 7px 18px; cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .tc-btn:hover:not(:disabled) { background: #0a76cc; }
  .tc-btn:active:not(:disabled) { transform: scale(0.96); }
  .tc-btn:disabled { background: #c8cdd4; cursor: not-allowed; }
  .tc-block { font-size: 11px; color: #e05a4a; }
  .tc-tag {
    font-size: 12px; font-weight: 700; color: #0f88eb;
    background: #eaf4ff; border: 1px solid #c3ddf5;
    padding: 4px 12px; border-radius: 999px;
  }
</style>
