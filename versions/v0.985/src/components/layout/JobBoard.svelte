<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { getTodayOffers, takeJobOffer, performJob, checkJobRequirements, JOB_DEFS, resolveVehicle, mergedJobEffects, getJobDef } from "../../game/core/jobs";
  import { getMiniGameConfig } from "../../game/core/minigame";
  import { checkRequirements } from "../../game/core/actions";
  import { moveTo, isLocationOpen, getLocation, canArriveEarly, closedReason } from "../../game/core/actions";
  import { locationName } from "../../game/core/quests";
  import { showToast, uiState, presentJobResult } from "../../stores/uiStore.svelte";
  import { rollEvent } from "../../game/core/events";
  import { isReferred } from "../../game/core/contacts";
  import { formatMoney } from "../../lib/format";

  const offers = $derived(getTodayOffers(gameState));
  const vehicle = $derived(resolveVehicle(gameState));

  function tierDesc(def: (typeof JOB_DEFS)[number]): string {
    const t = def.incomeTiers?.[vehicle];
    if (t?.desc) return `${t.desc} +${formatMoney(t.money)}`;
    return "";
  }

  /**
   * 抢活（v0.86）：定时岗没到点就只排进任务栏，到点了才真正开工。
   */
  function doJob(uid: string): void {
    const r = takeJobOffer(gameState, uid);
    if (r.ok && r.mode === "scheduled") {
      showToast(`✅ 活儿接下了！${r.startHour}:00 准时到岗，任务栏盯着点`);
    } else if (r.ok && r.result) {
      const ev = rollEvent(gameState);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 工作小游戏（日结岗：收银/分拣/清洁等）
      const jid = r.result.actionId;
      const cfg = jid ? getMiniGameConfig(jid) : undefined;
      const job = jid ? getJobDef(jid) : undefined;
      presentJobResult(r.result, cfg, job ? { id: job.id, name: job.name, icon: job.icon } : { id: jid ?? "", name: "工作", icon: "💼" });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  /** 固定岗「前往」按钮：移动到对应地点，到点后再上班 */
  function goToJobLoc(locationId: string): void {
    const loc = getLocation(locationId);
    // v0.935：开门前 2h 允许提前过去候场，其余情况才拦（并区分未开门/已打烊）
    if (loc && !isLocationOpen(loc, gameState.time.hour) && !canArriveEarly(loc, gameState.time.hour)) {
      showToast(`🚫 岗位地点${closedReason(loc, gameState.time.hour)}`);
      return;
    }
    const r = moveTo(gameState, locationId);
    if (!r.ok) showToast(r.reason ?? "过不去");
  }

  /**
   * v0.93 固定岗「一键应聘」：自动前往岗位地点并立即开工（固定岗无证可走实习）。
   * 地点打烊或硬性技能门槛不满足时给出提示，不浪费时间。
   */
  function applyFixed(j: (typeof JOB_DEFS)[number]): void {
    const loc = getLocation(j.locationId ?? "");
    if (loc && !isLocationOpen(loc, gameState.time.hour) && !canArriveEarly(loc, gameState.time.hour)) {
      showToast(`🚫 岗位地点${closedReason(loc, gameState.time.hour)}`);
      return;
    }
    // 硬性技能/ money 门槛不满足（非实习情形）→ 直接提示，不移动
    const req = checkJobRequirements(gameState, j);
    if (!req.ok && !req.intern) {
      showToast(req.reason ?? "条件未满足");
      return;
    }
    // 自动前往（同区瞬间，跨区半小时）
    const mv = moveTo(gameState, j.locationId ?? "");
    if (!mv.ok) {
      showToast(mv.reason ?? "过不去");
      return;
    }
    // 立即开工
    const r = performJob(gameState, j.id);
    if (r.ok && r.result) {
      const ev = rollEvent(gameState);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 工作小游戏
      presentJobResult(r.result, getMiniGameConfig(j.id), { id: j.id, name: j.name, icon: j.icon });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }
</script>

<div class="board hud-scope">
  <div class="head">
    <span class="title">📋 今日岗位</span>
    <span class="dim">每日 3~6 个，先到先得</span>
  </div>

  {#if offers.length === 0}
    <div class="empty">
      <div class="empty-icon">🍵</div>
      <div>今天没什么活儿，明天再来吧</div>
    </div>
  {:else}
    <div class="grid">
      {#each offers as { offer, def }}
        {@const check = checkRequirements(gameState, def.requirements)}
        <div class="job-card" class:disabled={!check.ok}>
          <div class="job-head">
            <span class="job-icon">{def.icon}</span>
            <div class="job-info">
              <div class="job-name">{def.name}</div>
              <div class="job-desc">{def.desc}</div>
            </div>
            <div class="job-right">
              <span class="job-hours">🕐 {def.duration}h</span>
              <div class="job-price">+{formatMoney(mergedJobEffects(gameState, def).money ?? def.effects.money ?? 0)}</div>
            </div>
          </div>
          <div class="job-tags">
            {#if def.startHour !== undefined}
              <span class="tag warn">⏰ {def.startHour}:00 开工</span>
            {:else}
              <span class="tag info">🕐 时间自由</span>
            {/if}
            <span class="tag cost">⚡ {def.effects.stamina}</span>
            {#if def.effects.stress && def.effects.stress > 0}
              <span class="tag cost">🔥 +{def.effects.stress}</span>
            {/if}
            {#if def.effects.skills}
              {#each Object.entries(def.effects.skills) as [k, v]}
                {#if v && v > 0}
                  <span class="tag info">+{v} {k}</span>
                {/if}
              {/each}
            {/if}
          </div>
          <div class="job-foot">
            <span class="quota">还剩 {offer.quota} 个名额</span>
            <button class="btn btn-primary small" onclick={() => doJob(offer.uid)} disabled={!check.ok || offer.quota <= 0}>
              抢活
            </button>
          </div>
          {#if def.incomeTiers}
            <div class="tier-line">
              <span>🚲 {tierDesc(def)}</span>
              {#if vehicle === "none"}
                <span class="tier-hint">有自行车可 +30/天，电动车 +80/天</span>
              {:else if vehicle === "bicycle"}
                <span class="tier-hint">电动车可再 +50/天</span>
              {/if}
            </div>
          {/if}
          {#if !check.ok}
            <div class="job-lock">🔒 {check.reason}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- 固定岗位（不在劳务市场打烊也可看见） -->
  <div class="fixed-section">
    <div class="sub-head">📌 固定岗位（需技能 / 证书 · 无证可实习 3 天）</div>
    <div class="fixed-list">
      {#each JOB_DEFS.filter((j) => j.kind === "fixed" && j.locationId) as j}
        {@const loc = getLocation(j.locationId ?? "")}
        {@const open = loc ? isLocationOpen(loc, gameState.time.hour) : false}
        {@const req = checkJobRequirements(gameState, j)}
        <div class="fixed-row">
          <span>{j.icon}</span>
          <span class="fn">{j.name}</span>
          <span class="dim">
            {locationName(j.locationId)} · {j.startHour !== undefined ? `${j.startHour}:00 打卡` : "自由时间"} · +{j.effects.money ?? 0}元
          </span>
          <button class="btn small fixed-go" onclick={() => goToJobLoc(j.locationId ?? "")} disabled={!open}>
            📍 前往
          </button>
          {#if isReferred(gameState, j.id)}
            <span class="tag gain">🤝 内推免证书</span>
          {/if}
          <button class="btn small fixed-apply" onclick={() => applyFixed(j)} disabled={!open || (!req.ok && !req.intern)}>
            ✅ 一键应聘
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .board {
    background: var(--grad-panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
  }
  .empty {
    text-align: center;
    padding: 24px;
    color: var(--text-dim);
  }
  .empty-icon {
    font-size: 36px;
    margin-bottom: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .job-card {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .job-card.disabled {
    opacity: 0.55;
  }
  .job-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .job-icon {
    font-size: 22px;
  }
  .job-info {
    flex: 1;
    min-width: 0;
  }
  .job-name {
    font-size: 13.5px;
    font-weight: 700;
  }
  .job-desc {
    font-size: 11px;
    color: var(--text-dim);
  }
  .job-price {
    font-size: 14px;
    font-weight: 800;
    color: var(--ok);
  }
  .job-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .job-hours {
    font-size: 11px;
    color: var(--accent-2);
    background: rgba(108, 198, 255, 0.13);
    padding: 1px 6px;
    border-radius: 999px;
  }
  .job-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .job-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
  }
  .quota {
    font-size: 11px;
    color: var(--text-dim);
  }
  .small {
    padding: 4px 12px;
    font-size: 12px;
  }
  .job-lock {
    font-size: 11px;
    color: var(--warn);
  }
  .tier-line {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 11px;
    color: var(--accent-2);
    border-top: 1px dashed rgba(51, 59, 99, 0.5);
    padding-top: 6px;
    margin-top: 4px;
  }
  .tier-hint {
    color: var(--text-dim);
  }
  .fixed-section {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(51, 59, 99, 0.5);
  }
  .sub-head {
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  .fixed-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fixed-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.04);
    flex-wrap: wrap;
  }
  .fn {
    font-weight: 600;
  }
  .fixed-go {
    margin-left: auto;
  }
  .fixed-apply {
    background: var(--ok);
    color: #0c1a10;
    font-weight: 700;
    border: 1px solid var(--ok);
  }
  .fixed-apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>