<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import {
    ACTIONS,
    getLocation,
    canPerform,
    checkRequirements,
    moveTo,
    performAction,
    isLocationOpen,
    travelHours,
    travelText,
    locationOpenPhase,
    closedReason,
    canArriveEarly,
    waitHere,
    waitOptions,
    type ActionDef,
    type PerformOptions,
    actionTagsOf,
    effectsOf,
    isPetForbiddenLocation,
  } from "../../game/core/actions";
  import { getItem } from "../../game/core/items";
  import { activePetOf, TRAIN_LABEL, getCatItem, CAT_FOOD_SIZE } from "../../game/core/catCare";
  import { getAccessoryDef } from "../../game/core/catAccessory";
  import { getCatDef } from "../../game/core/cat";
  import { enterTournamentArena } from "../../game/core/tournament"; // v1.33 P4d 赛场进入对决赛
  import { freeTrainCat, startFunMatch } from "../../game/core/catBattle"; // v1.34 休闲对决
  import { formatMoney } from "../../lib/format";
  import { currentResidenceName, currentRegion } from "../../game/core/housing";
  import { isWeekend } from "../../game/core/calendar";
  import { performJob, localJobsOf, getJobDef } from "../../game/core/jobs";
  import { getMiniGameConfigFor } from "../../game/core/minigame";
  import { isPunctual, latenessOfJob } from "../../game/core/quests";
  import { FATIGUE_WARN_THRESHOLD } from "../../game/core/fatigue";
  import { jobRequirementBonus } from "../../game/core/difficulty";
  import { uiState, showToast, showResult, presentJobResult, openNpcTalk, playSceneTransition } from "../../stores/uiStore.svelte";
  import { rollEvent } from "../../game/core/events";
  import { playSound } from "../../lib/audio";
  import { tarotCard } from "../../game/core/tarot";
  import JobBoard from "./JobBoard.svelte";
  import CityMapView from "./CityMapView.svelte";
  import MainMapView from "./MainMapView.svelte";
  import RegionMapView from "./RegionMapView.svelte";
  import { getRegion, locationsOfRegion, enterRegion, goToMap } from "../../game/core/regions";
  import { projectProgress, isProjectDone } from "../../game/core/projects";
  import { presentNpcs, meetSpecificNpc } from "../../game/core/npcTalk";
  import type { Effects } from "../../game/engine";

  /** v0.97 家庭操作分组入口（做菜 → 烹饪页）；开发/设计已整合进笔记本工作台（v1.3） */
  const ACTION_GROUPS = [
    { id: "cook", icon: "🍳", name: "烹饪", desc: "下厨做点吃的（需灶台）" },
    /** v1.20 图书馆读书分组 */
    { id: "read", icon: "📚", name: "读书", desc: "在图书馆挑一本书读" },
    /** v1.32 猫咪交互分组（家里） */
    { id: "cat", icon: "🐱", name: "猫咪", desc: "照顾 / 携带你的猫咪" },
    /** v1.33 公园猫咪户外训练分组（需携带猫咪） */
    { id: "cat_train", icon: "🏋️", name: "猫咪训练", desc: "带猫咪到户外训练四维属性（需携带）" },
    /** v1.38 宠物用品店二级菜单（食品 / 玩具 / 寝具 / 训练 / 特殊 / 饰品 / 领养） */
    { id: "pet_food", icon: "🍖", name: "食品", desc: "各等级猫粮" },
    { id: "pet_toy", icon: "🧶", name: "玩具", desc: "陪玩用的玩具" },
    { id: "pet_bed", icon: "🛏️", name: "寝具", desc: "猫窝床垫" },
    { id: "pet_train", icon: "💪", name: "训练用品", desc: "训练辅助道具" },
    { id: "pet_special", icon: "🧪", name: "特殊道具", desc: "药水 / 净化剂 / 复活石" },
    { id: "pet_acc", icon: "💎", name: "饰品", desc: "佩戴获得对决加成" },
    { id: "pet_adopt", icon: "🐾", name: "领养", desc: "带一只猫咪回家" },
    /** v1.38 宠物医院二级菜单（治疗 / 训练 / 特殊） */
    { id: "hos_treat", icon: "💉", name: "治疗", desc: "治疗伤势与疾病" },
    { id: "hos_train", icon: "🏋️", name: "专项训练", desc: "专注训练 / 删卡" },
    { id: "hos_special", icon: "🧪", name: "特殊道具", desc: "治疗用药水" },
  ];
  let openGroup = $state<string | null>(null);
  /** v1.39 问题5：切换地点时收起已展开的分组，避免「猫咪」分组内容残留到禁止入内的场所 */
  $effect(() => {
    gameState.locationId;
    openGroup = null;
  });

  /** v1.32 当前携带的猫咪（家里猫咪分组状态展示） */
  const activeCat = $derived(activePetOf(gameState));

  /**
   * 收益标签 / 行动标签统一走 core 的 actionTagsOf。
   * v1.33-hotfix：原先在此直接读 action.effects.money，遇到无 effects 的行动
   * （如游乐场赛场入口）会抛 TypeError，导致整个场景面板渲染中断——
   * 表现为「背景切到游乐场，但地点内容一片空白，像进不去」。已下沉到 core 并做空值兜底。
   */
  const actionTags = (a: ActionDef) => actionTagsOf(a, gameState);

  /** v1.38 P8：购买类行动显示价格标签（用品店/饰品店与其他设施一致） */
  function priceForAction(a: ActionDef): number | undefined {
    if (a.handler === "buy_cat_item" && a.catItemId) return getCatItem(a.catItemId)?.price;
    if (a.handler === "buy_accessory" && a.accessoryId) return getAccessoryDef(a.accessoryId)?.price;
    return undefined;
  }

  /** v1.38 P9：购买猫粮时弹出小/中/大包选择 */
  type FoodModal = { action: ActionDef; item: NonNullable<ReturnType<typeof getCatItem>> };
  const FOOD_SIZES = ["small", "medium", "large"] as const;
  let foodModal = $state<FoodModal | null>(null);
  function openFoodBuy(a: ActionDef): void {
    const item = a.catItemId ? getCatItem(a.catItemId) : undefined;
    if (item) foodModal = { action: a, item };
  }
  function buyFood(size: "small" | "medium" | "large"): void {
    if (!foodModal) return;
    const a = foodModal.action;
    foodModal = null;
    runAction(a, { catFoodSize: size });
  }
  function foodPrice(size: "small" | "medium" | "large"): number {
    if (!foodModal) return 0;
    const sz = CAT_FOOD_SIZE[size];
    return Math.round(foodModal.item.price * sz.qty * sz.priceMul);
  }

  function doAction(a: ActionDef): void {
    // v1.38 P9：猫粮购买先弹规格选择（小/中/大包）
    if (a.handler === "buy_cat_item") {
      const it = a.catItemId ? getCatItem(a.catItemId) : undefined;
      if (it && it.cat === "food") {
        openFoodBuy(a);
        return;
      }
    }
    // 睡觉行动卡：打开睡眠弹窗（绕过疲劳拦截）
    if (a.handler === "sleep_modal") {
      openSleep();
      return;
    }
    // v1.3：使用笔记本（打开全屏桌面）
    if (a.handler === "use_laptop") {
      const hasLaptop =
        !!gameState.flags["item_laptop"] ||
        !!gameState.flags["item_laptop_mid"] ||
        !!gameState.flags["item_laptop_pro"];
      if (!hasLaptop) {
        showToast("🚫 你还没有笔记本电脑（商场/二手市场可购买）");
        return;
      }
      uiState.modal = "laptop";
      return;
    }
    // v1.33：宠物用品店领养猫咪（打开领养弹窗）
    if (a.handler === "pet_adopt") {
      uiState.modal = "pet_adopt";
      return;
    }
    // v1.33 P4d：游乐场赛场进入对决赛（开赛并开战，战斗界面由 pending 标记弹出）
    if (a.handler === "tournament_arena") {
      openTournamentArena(a);
      return;
    }
    // v1.34：公园「猫咪自由锻炼」（50% 加属性 / 50% 遭遇敌人，遭遇可决斗或逃跑）
    if (a.handler === "cat_free_train") {
      openFreeTrain(a);
      return;
    }
    // v1.34：游乐场「喵喵娱乐赛」（无需门票，立即开战，失败无惩罚）
    if (a.handler === "fun_match") {
      openFunMatch(a);
      return;
    }
    // v1.37：宠物医院「猫咪特殊训练 / 专注性训练」（打开卡牌训练弹窗）
    if (a.handler === "cat_special_train" || a.handler === "cat_focus_train") {
      const checkHosp = canPerform(gameState, a);
      if (!checkHosp.ok) {
        showToast(`🚫 ${checkHosp.reason ?? "现在做不了这件事"}`);
        return;
      }
      uiState.hospitalTrainMode = a.handler === "cat_special_train" ? "special" : "focus";
      uiState.modal = "hospital_train";
      return;
    }
    // v0.92：不满足条件时给出明确原因（原先静默返回，玩家不知道为什么点不动）
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在做不了这件事"}`);
      return;
    }
    // v0.92 便利店/水果摊：先问「堂食还是打包」
    if ((a.handler === "buy_food" || a.handler === "buy_fresh") && a.itemId) {
      openDineChoice(a);
      return;
    }
    runAction(a);
  }

  /** 真正执行行动（可带堂食/打包等选项） */
  function runAction(a: ActionDef, opts?: PerformOptions): void {
    // v0.91：体力 < 20 提示休息（不阻断）
    if (gameState.player.attrs.stamina < FATIGUE_WARN_THRESHOLD && gameState.player.attrs.stamina > 0) {
      showToast("😮‍💨 很累了，需要休息一下");
    }
    const r = performAction(gameState, a.id, opts);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "行动没能完成"}`);
      return;
    }
    if (r.result) {
      const ev = rollEvent(gameState, a.eventChance);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 行动小游戏（锻炼 / 卖唱 / 摆摊等）：minigames.json 按 actionId 查配置
      const cfg = getMiniGameConfigFor(gameState, a.id);
      presentJobResult(r.result, cfg, { id: a.id, name: a.name, icon: a.icon });
    }
  }

  /** v1.33 P4d 游乐场赛场：进入对决赛（开赛并开战，战斗界面由 pending 标记弹出） */
  function openTournamentArena(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在进不了赛场"}`);
      return;
    }
    const r = enterTournamentArena(gameState);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在进不了赛场"}`);
      return;
    }
    if (r.battleStarted) {
      gameState.flags["cat_battle_pending"] = true; // GameView 捕获后弹出战斗界面
    } else {
      showToast(r.reason ?? "已进入赛场");
    }
  }

  /** v1.34 公园自由锻炼：50% 属性提升直接结算；50% 遭遇敌人弹抉择框（决斗 / 逃跑） */
  function openFreeTrain(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在锻炼不了"}`);
      return;
    }
    const r = freeTrainCat(gameState);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "锻炼失败"}`);
      return;
    }
    if (r.kind === "battle") {
      uiState.encounterPayload = r.encounter;
      uiState.modal = "cat_encounter";
      return;
    }
    playSound("success");
    const label = TRAIN_LABEL[r.attr] ?? r.attr;
    // v1.37 卡包刷新：锻炼较低概率刷出新卡，直接弹入包抉择框（属性提升在弹窗关闭后由日志体现）
    if (r.cardOffer) {
      uiState.cardOfferPayload = { defId: r.cardOffer.defId, source: r.cardOffer.source, petUid: gameState.activePet ?? "" };
      uiState.modal = "card_offer";
      return;
    }
    showResult({
      actionId: a.id,
      icon: "🏋️",
      name: "猫咪自由锻炼",
      duration: a.duration ?? 0.5,
      deltas: [{ key: `cat_${r.attr}`, label, value: r.gain }],
      verdict: `「${activePetOf(gameState)?.name ?? "猫咪"}」在${gameState.locationId === "lake_park" ? "环湖公园" : "公园"}撒欢锻炼，${label} +${r.gain}！`,
    });
  }

  /** v1.34 游乐场喵喵娱乐赛：无需门票立即开战（casual：失败无惩罚，胜利随机加属性） */
  function openFunMatch(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在开不了赛"}`);
      return;
    }
    const r = startFunMatch(gameState);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "开赛失败"}`);
      return;
    }
    if (r.encounter) {
      uiState.encounterPayload = r.encounter;
    }
    gameState.flags["cat_battle_pending"] = true; // GameView 捕获后直接弹出战斗界面
  }

  /** 打开堂食/打包选择弹窗 */
  function openDineChoice(a: ActionDef): void {
    const item = a.itemId ? getItem(a.itemId) : undefined;
    if (!item) {
      runAction(a); // 兜底：物品数据缺失时按打包处理
      return;
    }
    uiState.dinePayload = {
      actionId: a.id,
      actionName: a.name,
      actionIcon: a.icon,
      itemName: item.name,
      itemIcon: item.icon,
      effectText: useEffectSummary(item.useEffects),
      price: Math.abs(effectsOf(a).money ?? 0),
    };
    uiState.modal = "dine";
  }

  /** 物品使用效果摘要（"饱腹 +30 · 心情 +4"） */
  function useEffectSummary(e: Effects | undefined): string {
    if (!e) return "";
    const parts: string[] = [];
    const push = (label: string, v?: number) => {
      if (v) parts.push(`${label} ${v > 0 ? "+" : ""}${v}`);
    };
    push("饱腹", e.satiety);
    push("心情", e.mood);
    push("体力", e.stamina);
    push("健康", e.health);
    push("干净度", e.hygiene);
    return parts.join(" · ");
  }

  function openSleep(): void {
    uiState.modal = "sleep";
  }

  /** 本地岗位（当前地点：日结/周结/月结/固定） */
  const localJobs = $derived(localJobsOf(gameState.locationId));

  /** 岗位类型标签 */
  function jobKindTag(kind: string): { text: string; cls: string } {
    switch (kind) {
      case "weekly":
        return { text: "周结", cls: "tag info" };
      case "monthly":
        return { text: "正式工", cls: "tag gain" };
      case "fixed":
        return { text: "固定", cls: "tag info" };
      default:
        return { text: "日结", cls: "tag cost" };
    }
  }

  /** 是否已就职该岗 */
  function isHired(jobId: string): boolean {
    return gameState.career.jobId === jobId;
  }

  function doFixedJob(jobId: string): void {
    // v0.91：体力 < 20 提示休息（不阻断）
    if (gameState.player.attrs.stamina < FATIGUE_WARN_THRESHOLD && gameState.player.attrs.stamina > 0) {
      showToast("😮‍💨 很累了，需要休息一下");
    }
    const r = performJob(gameState, jobId);
    if (r.ok && r.result) {
      const ev = rollEvent(gameState);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 工作小游戏：minigames.json 按 jobId 查配置
      const cfg = getMiniGameConfigFor(gameState, jobId);
      const job = getJobDef(jobId);
      presentJobResult(r.result, cfg, job ? { id: job.id, name: job.name, icon: job.icon } : { id: jobId, name: "工作", icon: "💼" });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  // v1.3b5：玻璃强度扩为 4 档，三级操作面板（action-card / loc-card / npc-panel）统一跟随。
  const GLASS_BG: Record<string, string> = {
    low: "linear-gradient(145deg, rgba(15,25,48,0.14), rgba(5,10,24,0.06))",
    medium: "linear-gradient(145deg, rgba(15,25,48,0.20), rgba(5,10,24,0.12))",
    high: "linear-gradient(145deg, rgba(15,25,48,0.38), rgba(5,10,24,0.30))",
    dark: "linear-gradient(145deg, rgba(8,12,26,0.82), rgba(3,6,16,0.76))",
  };
  const glassBg = $derived(GLASS_BG[uiState.mapGlass] ?? GLASS_BG.low);

  function go(locId: string): void {
    const r = moveTo(gameState, locId);
    if (!r.ok) {
      showToast(r.reason ?? "无法前往");
      return;
    }
    // v1.3b5：地点间移动不再播放完整过场（跨一级大区的 goRegion 过场保留），操作更跟手。
    playSound("walk");
  }

  function goRegion(regionId: string): void {
    const r = enterRegion(gameState, regionId);
    if (!r.ok) {
      showToast(r.reason ?? "无法前往");
      return;
    }
    playSound("walk");
    const destination = getRegion(regionId);
    // 一级地图之间的移动播放过场；二级地图只是打开区域菜单，不播放。
    if (destination && !destination.parent) {
      playSceneTransition("bus", destination.name, 1800, regionId);
    }
  }

  /** 当前地点（派生） */
  const loc = $derived(
    gameState.locationId === "map" ? undefined : getLocation(gameState.locationId)
  );
  /** home 地点动态名称 */
  const homeName = $derived(currentResidenceName(gameState));

  /** v1.3b3 当前在场、可被搭话/聊天的 NPC 列表（含关系状态） */
  const locNpcs = $derived(presentNpcs(gameState));

  /** v1.3b3 对未结识的在场 NPC 定向搭话 */
  function doMeet(id: string): void {
    const r = meetSpecificNpc(gameState, id);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在没法搭话"}`);
      return;
    }
    showToast("👋 认识了一位新朋友");
  }

  /** 区域地点 items（用于 CityMapView L3）。v0.97 周末限定地点仅周末显示。
   *  v1.25：住处(home)按当前住宿实际区域动态归属——住在郊区寺庙则郊区的二级导航也显示住处 */
  const regionItems = $derived(
    gameState.region && gameState.region !== "downtown"
      ? (() => {
          const base = locationsOfRegion(gameState.region);
          const home = getLocation("home");
          const list =
            currentRegion(gameState) === gameState.region && home && !base.some((l) => l.id === "home")
              ? [...base, home]
              : base;
          return list
            .filter((l) => !l.weekendOnly || isWeekend(gameState.time))
            .map((l) => {
            const open = isLocationOpen(l, gameState.time.hour);
            const phase = locationOpenPhase(l, gameState.time.hour);
            return {
              id: l.id,
              name: l.id === "home" ? homeName : l.name,
              icon: l.icon,
              locked: !!l.locked,
              closed: !open,
              notYetOpen: phase === "before",
              // v0.935：开门前 2 小时内允许提前过去等着（工业园区提前到岗场景）
              early: !open && canArriveEarly(l, gameState.time.hour),
              closedText: open ? "" : closedReason(l, gameState.time.hour),
              gradient: l.gradient,
              travelHours: travelHours(gameState, l),
              travelText: travelText(gameState, l),
            };
          });
        })()
      : []
  );

  /* ==================== v0.935 P1：原地等待 ==================== */

  /** 当前地点是否处于"还没开门"（可候场）状态 */
  const waitingForOpen = $derived(
    !!loc && !isLocationOpen(loc, gameState.time.hour) && locationOpenPhase(loc, gameState.time.hour) === "before"
  );
  /** 未开门提示文案 */
  const notOpenText = $derived(loc ? closedReason(loc, gameState.time.hour) : "");
  /** 可用等待档位 */
  const waitTiers = $derived(waitOptions(gameState));

  function doWait(hours: number): void {
    const r = waitHere(gameState, hours);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在没法等"}`);
      return;
    }
    playSound("walk");
    if (r.result) showResult(r.result);
  }

  /** 面包屑层级 */
  type Crumb = { id: string; label: string; icon: string };
  const crumbs = $derived.by((): Crumb[] => {
    const out: Crumb[] = [{ id: "map", label: "城市", icon: "🗺️" }];
    for (const id of gameState.navStack) {
      if (id === "map") continue;
      const r = getRegion(id);
      out.push({ id, label: r?.name ?? id, icon: r?.icon ?? "📍" });
    }
    if (loc) {
      out.push({ id: loc.id, label: loc.id === "home" ? homeName : loc.name, icon: loc.icon });
    }
    return out;
  });

  /** v0.98 场景切换方向：深度 → 向右滑入；返回 → 向左滑出 */
  let prevDepth = $state(0);
  let flyX = $state(60);
  $effect(() => {
    const cur = gameState.navStack.length + (gameState.locationId !== "map" ? 1 : 0);
    flyX = cur > prevDepth ? 60 : -40;
    prevDepth = cur;
  });

  /** 点击面包屑回退到指定层 */
  function crumbTo(i: number): void {
    if (gameState.flags["hospitalized"]) {
      showToast("正在住院，先到医院办理出院");
      return;
    }
    if (i <= 0) {
      goToMap(gameState);
      return;
    }
    const id = crumbs[i]?.id;
    if (!id) return;
    // 地点层（最后一层）→ 回退到所在区域视图
    if (loc && i === crumbs.length - 1) {
      if (gameState.region) enterRegion(gameState, gameState.region);
      else goToMap(gameState);
      return;
    }
    // 区域层
    const r = getRegion(id);
    if (r) enterRegion(gameState, id);
  }

  /** 出门按钮文案 */
  const exitLabel = $derived.by(() => {
    if (gameState.region) {
      const r = getRegion(gameState.region);
      return `🚪 出门 / 回${r?.name ?? "区域"}`;
    }
    return "🚪 出门 / 回主地图";
  });

  function exitLocation(): void {
    // 住院拦截
    if (gameState.flags["hospitalized"]) {
      showToast("正在住院，先到医院办理出院");
      return;
    }
    if (gameState.region) enterRegion(gameState, gameState.region);
    else goToMap(gameState);
    playSound("walk");
  }

  /** v0.985：消费引擎写入的待弹窗塔罗牌解锁队列，逐条弹 toast 后清空 */
  const ROMAN = [
    "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
  ];
  $effect(() => {
    if (gameState.pendingTarot.length === 0) return;
    for (const id of gameState.pendingTarot) {
      const card = tarotCard(id);
      showToast(
        card
          ? `🔮 塔罗牌点亮：${ROMAN[card.id]} · ${card.name}（${card.symbol}）`
          : `🔮 塔罗牌点亮：${id}`,
      );
    }
    gameState.pendingTarot = [];
  });
</script>

<div class="scene hud-scope" style:--panel-glass-bg={glassBg}>
  <!-- 面包屑导航 -->
  {#if crumbs.length > 1}
    <nav class="breadcrumbs">
      {#each crumbs as c, i (c.id)}
        {#if i > 0}<span class="sep">›</span>{/if}
        <button class="crumb" onclick={() => crumbTo(i)} class:last={i === crumbs.length - 1}>
          <span class="gi-emoji" style="font-size:13px;line-height:1">{c.icon}</span>
          {c.label}
        </button>
      {/each}
    </nav>
  {/if}

  {#key gameState.locationId + ":" + (gameState.region ?? "")}
    <div class="scene-body" in:fly={{ x: flyX, duration: 200 }} out:fade={{ duration: 90 }}>
  {#if gameState.locationId === "map"}
    <!-- 地图态：返回上一级（非主地图时） -->
    {#if gameState.region}
      <nav class="loc-nav">
        <button class="loc-chip back-chip" onclick={() => crumbTo(Math.max(0, crumbs.length - 2))}>← 返回上一级</button>
        {#if gameState.region !== "downtown"}
          <button class="loc-chip back-chip" onclick={() => crumbTo(1)}>🗺️ 回主地图</button>
        {/if}
      </nav>
    {/if}
    <!-- L1：主地图（市区/郊区） -->
    {#if !gameState.region}
      <MainMapView />
    {:else if !getRegion(gameState.region)?.parent}
      <!-- L2：一级区域（市区/郊区）→ 子区域网格 -->
      <RegionMapView parentRegionId={gameState.region} onSelect={(id) => goRegion(id)} />
    {:else}
      <!-- L3：区域地点网格 -->
      <CityMapView
        regionId={gameState.region}
        items={regionItems}
        onSelect={(id) => go(id)}
      />
      <!-- v0.935：街面等待（等园区/店铺开门） -->
      <div class="wait-bar">
        <span class="wait-label">⏳ 在街上等一会儿</span>
        {#each waitTiers as t}
          <button class="wait-btn" class:smart={t.smart} onclick={() => doWait(t.hours)}>{t.label}</button>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- 地点场景 -->
    <nav class="loc-nav">
      <button class="loc-chip exit-chip" onclick={exitLocation}>{exitLabel}</button>
    </nav>

    {#if loc}
      <div class="loc-card" style="background:{loc.gradient}">
        <span class="gi-emoji" style="font-size:46px;line-height:1">{loc.icon}</span>
        <div class="loc-info">
          <div class="loc-name">{loc.id === "home" ? homeName : loc.name}</div>
          <div class="loc-desc">{loc.desc}</div>
        </div>
      </div>
    {/if}

    {#if locNpcs.length > 0}
      <div class="npc-panel">
        <div class="npc-panel-head">🧑‍🤝‍🧑 这里的人</div>
        {#each locNpcs as n (n.id)}
          <div class="npc-row">
            <span class="gi-emoji" style="font-size:28px;line-height:1">{n.icon}</span>
            <div class="npc-row-info">
              <div class="npc-row-name">{n.known ? n.nick : "？？？"}</div>
              <div class="npc-row-badge" class:stranger={!n.known}>{n.stateLabel}</div>
            </div>
            {#if n.known}
              <button class="npc-row-btn" onclick={() => openNpcTalk(n.id)}>聊天</button>
            {:else}
              <button class="npc-row-btn meet" onclick={() => doMeet(n.id)}>搭话认识</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- v0.935：提前到岗候场提示 + 原地等待 -->
    {#if waitingForOpen}
      <div class="early-banner">
        <span class="eb-title">⏳ 还没开门</span>
        <span class="eb-text">{notOpenText}——你先在门口候着，等开门再进去。</span>
      </div>
    {/if}
    <div class="wait-bar">
      <span class="wait-label">⏳ 原地等待</span>
      {#each waitTiers as t}
        <button class="wait-btn" class:smart={t.smart} onclick={() => doWait(t.hours)}>{t.label}</button>
      {/each}
    </div>

    {#if localJobs.length > 0}
      <div class="fixed-jobs">
        <div class="fj-head">💼 本地工作</div>
        {#each localJobs as job}
          <!-- v0.99 修复：固定岗卡片改用 checkRequirements（与手机招聘页一致，无证玩家卡片置灰不可点） -->
          {@const check = checkRequirements(gameState, job.requirements, { reqBonus: jobRequirementBonus(gameState), jobId: job.id })}
          {@const kt = jobKindTag(job.kind)}
          {@const pastStart = isPunctual(job) && job.startHour !== undefined && latenessOfJob(gameState, job) > 2}
          <button class="action-card fj-card" class:disabled={!check.ok || pastStart} onclick={() => doFixedJob(job.id)}>
            <div class="action-head">
              <span class="gi-emoji" style="font-size:30px;line-height:1">{job.icon}</span>
              <div class="head-right">
                <span class={kt.cls}>{kt.text}</span>
                <span class="tag info duration">🕐 {job.duration}h</span>
                <span class="tag gain">
                  {isHired(job.id) ? "✅ 已就职" : job.kind === "weekly" || job.kind === "monthly" ? `发薪日结 +${formatMoney(job.effects.money ?? 0)}💰/天` : `+${formatMoney(job.effects.money ?? 0)}💰/天`}
                </span>
              </div>
            </div>
            <div class="action-name">{job.name}</div>
            <div class="action-desc">{job.desc}</div>
            {#if pastStart}<div class="action-lock">⛔ 已过开工时间（{job.startHour}:00），明天再来</div>{/if}
            {#if !check.ok && !pastStart}<div class="action-lock">🔒 {check.reason}</div>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if gameState.locationId === "labor_market"}
      <JobBoard />
    {:else}
      <!-- v0.97 分组入口（烹饪 / 开发）：点开展开组内具体操作 -->
      <div class="group-grid">
        {#each ACTION_GROUPS as g}
          {@const items = ACTIONS.filter((a) => a.locationId === gameState.locationId && a.group === g.id)}
          {#if items.length > 0 && !(g.id === "cat" && isPetForbiddenLocation(gameState.locationId))}
            <button class="group-card" class:open={openGroup === g.id} onclick={() => (openGroup = openGroup === g.id ? null : g.id)}>
              <span class="gi-emoji" style="font-size:30px;line-height:1">{g.icon}</span>
              <span class="group-name">{g.name}</span>
              <span class="group-count dim">{items.length} 种</span>
            </button>
          {/if}
        {/each}
      </div>

      {#snippet actionCard(action: ActionDef, i: number = 0)}
        {@const check = canPerform(gameState, action)}
        {@const tags = actionTags(action)}
        {@const proj = action.handler === "work_project" && action.projectId ? projectProgress(gameState, action.projectId) : null}
        {@const projDone = action.handler === "work_project" && action.projectId ? isProjectDone(gameState, action.projectId) : false}
        <button class="action-card" class:disabled={!check.ok} onclick={() => doAction(action)} style="--i: {i}">
          <div class="action-head">
            <span class="gi-emoji" style="font-size:30px;line-height:1">{action.icon}</span>
            <div class="head-right">
              <span class="tag info duration">🕐 {action.duration}h</span>
              <div class="tags">
                {#each tags.slice(0, 2) as t}
                  <span class="tag {t.cls}">{t.text}</span>
                {/each}
                {#if priceForAction(action) != null}
                  <span class="tag cost">💰 {formatMoney(priceForAction(action)!)}</span>
                {/if}
              </div>
            </div>
          </div>
          <div class="action-name">{action.name}</div>
          <div class="action-desc">{action.desc}</div>
          {#if proj !== null}
            <div class="proj-bar-wrap">
              <div class="proj-bar" class:done={projDone}>
                <div class="proj-fill" style="width:{proj}%"></div>
              </div>
              <span class="proj-pct">{projDone ? "✅ 已完成" : `${proj}%`}</span>
            </div>
          {/if}
          {#if !check.ok}<div class="action-lock">🔒 {check.reason}</div>{/if}
        </button>
      {/snippet}

      {#if openGroup}
        <div class="action-grid group-open">
          {#if openGroup === "cat" && gameState.pets.length > 0}
            <!-- v1.39：未携带但家里有猫时，显示家里的猫，可直接喂食/洗澡/玩耍 -->
            <button class="action-card cat-manage" onclick={() => (uiState.modal = "cat")}>
              <div class="action-head">
                <span class="gi-emoji" style="font-size:30px;line-height:1">{activeCat?.icon ?? (gameState.pets[0]?.icon ?? "🐾")}</span>
                <div class="head-right">
                  <span class="tag info">🐱 猫咪面板</span>
                </div>
              </div>
              <div class="action-name">
                {activeCat
                  ? `${activeCat.name} Lv.${activeCat.level}`
                  : gameState.pets.length > 0
                    ? `家里有 ${gameState.pets.length} 只猫咪（未携带）`
                    : "还没有猫咪"}
              </div>
              <div class="action-desc">
                {#if activeCat}
                  {@const def = getCatDef(activeCat.catId)}
                  携带中 · {def?.desc ?? ""} 点击打开猫咪面板：切换携带 / 喂食 / 洗澡 / 玩耍
                {:else if gameState.pets.length > 0}
                  {@const first = gameState.pets[0]}
                  猫咪都在家待着 · 下面的喂食 / 洗澡 / 玩耍会照顾「{first.name}」；打开猫咪面板可切换携带或指定其他猫
                {:else}
                  去宠物用品店领养一只，或在街上碰碰运气；领养后就能在这里照顾它
                {/if}
              </div>
            </button>
            {#each ACTIONS.filter((a) => a.locationId === gameState.locationId && a.group === "cat" && (a.id === "cat_feed" || a.id === "cat_clean" || a.id === "cat_play")) as action, idx}
              {@render actionCard(action, idx)}
            {/each}
            <!-- v1.39 问题3：原「更多」折叠只露出一个玩耍，其余互动都在猫咪面板，改为直达猫咪面板 -->
            <button class="action-card fold-toggle" onclick={() => (uiState.modal = "cat")}>
              <div class="action-head">
                <span class="gi-emoji" style="font-size:30px;line-height:1">🐱</span>
                <div class="head-right">
                  <span class="tag info">更多</span>
                </div>
              </div>
              <div class="action-name">更多照顾</div>
              <div class="action-desc">玩耍 / 卡包 / 饰品 / 图鉴 → 打开猫咪面板</div>
            </button>
          {:else if openGroup === "cat"}
            <!-- B12：0 猫时不露出「更多照顾」空面板，直接引导领养 -->
            <div class="action-grid group-open">
              <div class="empty-hint">🐾 还没有猫咪——去市中心宠物用品店领养，或在街上碰碰运气</div>
            </div>
          {:else}
            {#each ACTIONS.filter((a) => a.locationId === gameState.locationId && a.group === openGroup) as action, idx}
              {@render actionCard(action, idx)}
            {/each}
          {/if}
        </div>
      {/if}

      <div class="action-grid">
        {#each ACTIONS.filter((a) => a.locationId === gameState.locationId && !a.group) as action, idx}
          {@const check = canPerform(gameState, action)}
          {@const tags = actionTags(action)}
          {@const proj = action.handler === "work_project" && action.projectId ? projectProgress(gameState, action.projectId) : null}
          {@const projDone = action.handler === "work_project" && action.projectId ? isProjectDone(gameState, action.projectId) : false}
          <button class="action-card" class:disabled={!check.ok} onclick={() => doAction(action)} style="--i: {idx}">
            <div class="action-head">
              <span class="action-icon">{action.icon}</span>
              <div class="head-right">
                <span class="tag info duration">🕐 {action.duration}h</span>
                <div class="tags">
                  {#each tags.slice(0, 2) as t}
                    <span class="tag {t.cls}">{t.text}</span>
                  {/each}
                </div>
              </div>
            </div>
            <div class="action-name">{action.name}</div>
            <div class="action-desc">{action.desc}</div>
            {#if proj !== null}
              <div class="proj-bar-wrap">
                <div class="proj-bar" class:done={projDone}>
                  <div class="proj-fill" style="width:{proj}%"></div>
                </div>
                <span class="proj-pct">{projDone ? "✅ 已完成" : `${proj}%`}</span>
              </div>
            {/if}
            {#if !check.ok}<div class="action-lock">🔒 {check.reason}</div>{/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
    </div>
  {/key}

  {#if foodModal}
    <div class="overlay hud-scope food-overlay" onclick={() => (foodModal = null)}>
      <div class="food-box" onclick={(e) => e.stopPropagation()}>
        <button class="food-close" onclick={() => (foodModal = null)}>✕</button>
        <div class="food-title">🛒 购买猫粮 · {foodModal.item.name}</div>
        <div class="food-sub dim">小包 1 份 / 中包 5 份(九五折) / 大包 25 份(八折)</div>
        <div class="food-opts">
          {#each FOOD_SIZES as sz}
            <button class="food-opt" onclick={() => buyFood(sz)}>
              <span class="fo-label">{CAT_FOOD_SIZE[sz].label}</span>
              <span class="fo-qty">×{CAT_FOOD_SIZE[sz].qty} 份</span>
              <span class="fo-price">💰 {formatMoney(foodPrice(sz))}</span>
            </button>
          {/each}
        </div>
        <button class="food-cancel" onclick={() => (foodModal = null)}>取消</button>
      </div>
    </div>
  {/if}

  {#if uiState.toast}
    <div class="toast" class:show={uiState.toast !== null}>{uiState.toast}</div>
  {/if}
</div>

<style>
  .scene {
    color: #eef1ff;
    --text-dim: rgba(255, 255, 255, 0.68);
    flex: 1;
    overflow-y: auto;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: relative;
    /* v0.91 可读性：场景文字统一加深色描边，昼夜背景都清晰 */
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
    /* 供 CityMapView 网格做容器查询降级（三栏布局下宽度会变） */
    container-type: inline-size;
  }
  .scene-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    /* v0.92 场景切换：淡入的同时轻微上浮，弱化「瞬移」的生硬感 */
    animation: sceneEnter 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes sceneEnter {
    from {
      transform: translateY(10px) scale(0.995);
    }
    to {
      transform: translateY(0) scale(1);
    }
  }
  /* v0.935 P1：等待条 / 候场提示 */
  .wait-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .wait-label {
    font-size: 12.5px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.82);
  }
  .wait-btn {
    font: inherit;
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #eef1ff;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .wait-btn:hover {
    background: rgba(255, 209, 102, 0.16);
    border-color: var(--accent, #ffd166);
  }
  .wait-btn:active {
    transform: scale(0.95);
  }
  .wait-btn.smart {
    background: rgba(255, 209, 102, 0.18);
    border-color: rgba(255, 209, 102, 0.55);
    color: #ffe6a8;
    font-weight: 700;
  }
  .early-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.4);
  }
  .eb-title {
    font-size: 13px;
    font-weight: 800;
    color: #ffd166;
  }
  .eb-text {
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.85);
  }
  .breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
  }
  .crumb {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid transparent;
    color: var(--text-dim);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .crumb:hover {
    background: rgba(255, 209, 102, 0.12);
    color: var(--accent);
  }
  .crumb:active {
    transform: scale(0.95);
  }
  .crumb.last {
    background: rgba(255, 209, 102, 0.15);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
    cursor: default;
  }
  .sep {
    color: var(--text-dim);
    font-size: 14px;
  }
  .loc-nav {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .loc-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid transparent;
    font-size: 13px;
    color: var(--text-dim);
    transition: all 0.15s ease;
  }
  .loc-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-main);
  }
  .sleep-chip {
    margin-left: auto;
    background: rgba(123, 216, 143, 0.12);
    color: var(--ok);
    font-weight: 700;
    border: 1px solid rgba(123, 216, 143, 0.3);
  }
  .exit-chip {
    background: rgba(108, 198, 255, 0.13);
    color: var(--accent-2);
    font-weight: 700;
    border: 1px solid rgba(108, 198, 255, 0.3);
  }
  .back-chip {
    background: rgba(255, 209, 102, 0.1);
    color: var(--accent);
    font-weight: 700;
    border: 1px solid rgba(255, 209, 102, 0.25);
  }
  .fixed-jobs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fj-head {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 1px;
  }
  .head-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .duration {
    background: rgba(108, 198, 255, 0.13);
    color: var(--accent-2);
  }
  .toast {
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 107, 107, 0.92);
    color: #fff;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 13px;
    z-index: 200;
    animation: fadeIn 0.2s ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .loc-card {
    border-radius: var(--radius-lg);
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
    background: var(--panel-glass-bg);
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
  }
  .loc-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, transparent 40%, rgba(255, 255, 255, 0.12));
    pointer-events: none;
  }
  .loc-emoji {
    font-size: 44px;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35));
  }
  .loc-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .loc-name {
    font-size: 20px;
    font-weight: 800;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  .loc-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
    margin-top: 10px;
  }
  .group-grid {
    display: flex;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .group-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-radius: 14px;
    background: rgba(255, 209, 102, 0.08);
    border: 1px solid rgba(255, 209, 102, 0.25);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .group-card:hover {
    transform: translateY(-2px);
  }
  .group-card:active {
    transform: scale(0.97);
  }
  .group-card.open {
    background: rgba(255, 209, 102, 0.18);
    border-color: rgba(255, 209, 102, 0.5);
  }
  .group-icon {
    font-size: 22px;
  }
  .group-count {
    font-size: 11px;
    font-weight: 600;
  }
  .group-open {
    border-top: 1px dashed rgba(255, 209, 102, 0.25);
    padding-top: 12px;
    animation: groupOpen 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes groupOpen {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  /* v1.32 家里猫咪分组：管理入口卡（打开猫咪面板 / 切换携带） */
  .cat-manage {
    background: linear-gradient(145deg, rgba(255, 209, 102, 0.1), rgba(255, 209, 102, 0.02));
    border-color: rgba(255, 209, 102, 0.35);
  }
  .cat-manage:hover:not(.disabled) {
    border-color: var(--accent);
    box-shadow: 0 6px 20px rgba(255, 209, 102, 0.12);
  }
  /* v1.39 猫咪分组「更多」直达猫咪面板按钮 */
  .fold-toggle {
    align-items: flex-start;
    background: rgba(255, 255, 255, 0.03);
    border-style: dashed;
    opacity: 0.85;
  }
  /* v1.3b4：三级（地点）操作面板由纯色底纹改为磨砂玻璃，与一二级地图玻璃统一 */
  .action-card {
    text-align: left;
    background: var(--panel-glass-bg);
    -webkit-backdrop-filter: blur(12px) saturate(1.1);
    backdrop-filter: blur(12px) saturate(1.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--radius-md);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transition: all 0.15s ease;
    animation: cardStaggerIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
  @keyframes cardStaggerIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  .action-card:hover:not(.disabled) {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
  .action-card:active:not(.disabled) {
    transform: scale(0.97);
  }
  .action-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .action-icon {
    font-size: 26px;
  }
  .tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .action-name {
    font-size: 15px;
    font-weight: 700;
  }
  .action-desc {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.5;
    flex: 1;
  }
  .action-lock {
    font-size: 11px;
    color: var(--warn);
  }
  .proj-bar-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .proj-bar {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .proj-bar.done .proj-fill {
    background: var(--ok, #7bd88f);
  }
  .proj-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent, #ffd166);
    transition: width 0.3s ease;
  }
  .proj-pct {
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  /* v1.3b3 在场 NPC 面板 */
  .npc-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--panel-glass-bg);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    backdrop-filter: blur(10px) saturate(1.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
  }
  .npc-panel-head {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 1px;
  }
  .npc-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }
  .npc-row-ic {
    font-size: 26px;
  }
  .npc-row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .npc-row-name {
    font-size: 14px;
    font-weight: 700;
  }
  .npc-row-badge {
    font-size: 11px;
    font-weight: 700;
    color: #ffd166;
  }
  .npc-row-badge.stranger {
    color: rgba(255, 255, 255, 0.55);
  }
  .npc-row-btn {
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(108, 198, 255, 0.16);
    border: 1px solid rgba(108, 198, 255, 0.4);
    color: #cfeaff;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease;
  }
  .npc-row-btn:hover {
    background: rgba(108, 198, 255, 0.28);
  }
  .npc-row-btn:active {
    transform: scale(0.95);
  }
  .npc-row-btn.meet {
    background: rgba(255, 209, 102, 0.16);
    border-color: rgba(255, 209, 102, 0.45);
    color: #ffe6a8;
  }
  .npc-row-btn.meet:hover {
    background: rgba(255, 209, 102, 0.28);
  }

  /* v1.38 P9 猫粮规格选择弹窗 */
  .food-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 130;
    animation: fadeIn 0.16s ease;
  }
  .food-box {
    width: 360px;
    max-width: calc(100vw - 32px);
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    animation: fadeIn 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .food-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    font-size: 14px;
    color: var(--text-dim, #9aa3c7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .food-close:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
  .food-title {
    font-size: 16px;
    font-weight: 800;
  }
  .food-sub {
    font-size: 12px;
  }
  .food-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .food-opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.35);
    color: var(--text, #eef1ff);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .food-opt:hover {
    background: rgba(255, 209, 102, 0.22);
  }
  .fo-label {
    font-size: 15px;
  }
  .fo-qty {
    color: var(--text-dim, #9aa3c7);
    font-size: 12px;
  }
  .fo-price {
    margin-left: auto;
    color: var(--accent, #ffd166);
    font-weight: 800;
  }
  .food-cancel {
    padding: 8px 0;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border, #2a3050);
    color: var(--text-dim, #9aa3c7);
    font-size: 13px;
    cursor: pointer;
  }
</style>
