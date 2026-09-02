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
  } from "../../game/core/actions";
  import { getItem } from "../../game/core/items";
  import { formatMoney } from "../../lib/format";
  import { SKILL_NAMES } from "../../lib/icons";
  import { currentResidenceName } from "../../game/core/housing";
  import { isWeekend } from "../../game/core/calendar";
  import { performJob, localJobsOf, getJobDef } from "../../game/core/jobs";
  import { getMiniGameConfig } from "../../game/core/minigame";
  import { isPunctual, latenessOfJob } from "../../game/core/quests";
  import { FATIGUE_WARN_THRESHOLD } from "../../game/core/fatigue";
  import { jobRequirementBonus } from "../../game/core/difficulty";
  import { uiState, showToast, showResult, presentJobResult } from "../../stores/uiStore.svelte";
  import { rollEvent } from "../../game/core/events";
  import { playSound } from "../../lib/audio";
  import { tarotCard } from "../../game/core/tarot";
  import JobBoard from "./JobBoard.svelte";
  import CityMapView from "./CityMapView.svelte";
  import MainMapView from "./MainMapView.svelte";
  import RegionMapView from "./RegionMapView.svelte";
  import { getRegion, locationsOfRegion, enterRegion, goToMap } from "../../game/core/regions";
  import { projectProgress, isProjectDone } from "../../game/core/projects";
  import type { Effects } from "../../game/engine";

  /** v0.97 家庭操作分组入口（做菜 → 烹饪页 / 独立游戏+App → 开发页） */
  const ACTION_GROUPS = [
    { id: "cook", icon: "🍳", name: "烹饪", desc: "下厨做点吃的（需灶台）" },
    { id: "dev", icon: "💻", name: "开发", desc: "坐在电脑前写代码" },
  ];
  let openGroup = $state<string | null>(null);

  /** 收益标签 */
  function effectTags(e: Effects): Array<{ text: string; cls: "gain" | "cost" | "info" }> {
    const tags: Array<{ text: string; cls: "gain" | "cost" | "info" }> = [];
    if (e.money && e.money > 0) tags.push({ text: `+${formatMoney(e.money)}💰`, cls: "gain" });
    if (e.money && e.money < 0) tags.push({ text: `-${formatMoney(-e.money)}💰`, cls: "cost" });
    if (e.stamina && e.stamina < 0) tags.push({ text: `-${-e.stamina}⚡`, cls: "cost" });
    if (e.stamina && e.stamina > 0) tags.push({ text: `+${e.stamina}⚡`, cls: "gain" });
    if (e.health && e.health < 0) tags.push({ text: `-${-e.health}❤️`, cls: "cost" });
    if (e.stress && e.stress > 0) tags.push({ text: `+${e.stress}🔥`, cls: "cost" });
    if (e.stress && e.stress < 0) tags.push({ text: `-${-e.stress}🔥`, cls: "gain" });
    if (e.fame && e.fame > 0) tags.push({ text: `+${e.fame}🌟`, cls: "info" });
    if (e.skills) {
      for (const [k, v] of Object.entries(e.skills)) {
        if (v && v > 0) tags.push({ text: `+${v}${SKILL_NAMES[k as keyof typeof SKILL_NAMES] ?? k}`, cls: "info" });
      }
    }
    return tags;
  }

  function doAction(a: ActionDef): void {
    // 睡觉行动卡：打开睡眠弹窗（绕过疲劳拦截）
    if (a.handler === "sleep_modal") {
      openSleep();
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
      const cfg = getMiniGameConfig(a.id);
      presentJobResult(r.result, cfg, { id: a.id, name: a.name, icon: a.icon });
    }
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
      price: Math.abs(a.effects.money ?? 0),
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
      const cfg = getMiniGameConfig(jobId);
      const job = getJobDef(jobId);
      presentJobResult(r.result, cfg, job ? { id: job.id, name: job.name, icon: job.icon } : { id: jobId, name: "工作", icon: "💼" });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  function go(locId: string): void {
    const r = moveTo(gameState, locId);
    if (!r.ok) showToast(r.reason ?? "无法前往");
    else playSound("walk");
  }

  function goRegion(regionId: string): void {
    const r = enterRegion(gameState, regionId);
    if (!r.ok) showToast(r.reason ?? "无法前往");
    else playSound("walk");
  }

  /** 当前地点（派生） */
  const loc = $derived(
    gameState.locationId === "map" ? undefined : getLocation(gameState.locationId)
  );
  /** home 地点动态名称 */
  const homeName = $derived(currentResidenceName(gameState));

  /** 区域地点 items（用于 CityMapView L3）。v0.97 周末限定地点仅周末显示 */
  const regionItems = $derived(
    gameState.region && gameState.region !== "downtown"
      ? locationsOfRegion(gameState.region)
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
        })
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

<div class="scene hud-scope">
  <!-- 面包屑导航 -->
  {#if crumbs.length > 1}
    <nav class="breadcrumbs">
      {#each crumbs as c, i (c.id)}
        {#if i > 0}<span class="sep">›</span>{/if}
        <button class="crumb" onclick={() => crumbTo(i)} class:last={i === crumbs.length - 1}>
          {c.icon} {c.label}
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
        <div class="loc-emoji">{loc.icon}</div>
        <div class="loc-info">
          <div class="loc-name">{loc.id === "home" ? homeName : loc.name}</div>
          <div class="loc-desc">{loc.desc}</div>
        </div>
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
              <span class="action-icon">{job.icon}</span>
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
          {#if items.length > 0}
            <button class="group-card" class:open={openGroup === g.id} onclick={() => (openGroup = openGroup === g.id ? null : g.id)}>
              <span class="group-icon">{g.icon}</span>
              <span class="group-name">{g.name}</span>
              <span class="group-count dim">{items.length} 种</span>
            </button>
          {/if}
        {/each}
      </div>

      {#if openGroup}
        <div class="action-grid group-open">
          {#each ACTIONS.filter((a) => a.locationId === gameState.locationId && a.group === openGroup) as action}
            {@const check = canPerform(gameState, action)}
            {@const tags = effectTags(action.effects)}
            {@const proj = action.handler === "work_project" && action.projectId ? projectProgress(gameState, action.projectId) : null}
            {@const projDone = action.handler === "work_project" && action.projectId ? isProjectDone(gameState, action.projectId) : false}
            <button class="action-card" class:disabled={!check.ok} onclick={() => doAction(action)}>
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

      <div class="action-grid">
        {#each ACTIONS.filter((a) => a.locationId === gameState.locationId && !a.group) as action}
          {@const check = canPerform(gameState, action)}
          {@const tags = effectTags(action.effects)}
          {@const proj = action.handler === "work_project" && action.projectId ? projectProgress(gameState, action.projectId) : null}
          {@const projDone = action.handler === "work_project" && action.projectId ? isProjectDone(gameState, action.projectId) : false}
          <button class="action-card" class:disabled={!check.ok} onclick={() => doAction(action)}>
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
    bottom: 200px;
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
    background: rgba(13, 17, 32, 0.45);
    -webkit-backdrop-filter: blur(5px);
    backdrop-filter: blur(5px);
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
  }
  .action-card {
    text-align: left;
    background: var(--grad-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .action-card:hover:not(.disabled) {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
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
</style>