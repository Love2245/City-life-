<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { JOB_DEFS, getTodayOffers, takeJobOffer, previewWork, resolveVehicle, getJobDef, nowWorkMinute } from "../../game/core/jobs";
  import { CAREER_TIERS, careerExperienceOf, careerTierFor, careerTierOf, careerTrackName, careerTrackOf, nextCareerTier } from "../../game/core/career";
  import { getMiniGameConfigFor } from "../../game/core/minigame";
  import { showToast, presentJobResult } from "../../stores/uiStore.svelte";
  import { formatMoney } from "../../lib/format";
  import { SKILL_NAMES } from "../../lib/icons";
  const offers = $derived(getTodayOffers(gameState));
  const vehicle = $derived(resolveVehicle(gameState));

  const careerTrack = $derived(gameState.career.jobId ? careerTrackOf(getJobDef(gameState.career.jobId)) : "general");
  const careerExp = $derived(careerExperienceOf(gameState, careerTrack));
  const careerNext = $derived(nextCareerTier(gameState, careerTrack));

  function careerTag(def: (typeof JOB_DEFS)[number]): string {
    return `${careerTrackName(careerTrackOf(def))} · ${CAREER_TIERS.find((t) => t.id === careerTierOf(def))?.name ?? "入门岗"}`;
  }

  function endTime(job: (typeof offers)[number]["def"]): string {
    const end = nowWorkMinute(gameState) + Math.round(job.duration * 60);
    const days = Math.floor(end / 1440) - Math.floor(nowWorkMinute(gameState) / 1440);
    const hour = String(Math.floor(end % 1440 / 60)).padStart(2, "0");
    const minute = String(end % 60).padStart(2, "0");
    return `${days > 0 ? `次日` : "今天"} ${hour}:${minute}`;
  }

  function doJob(uid: string): void {
    const r = takeJobOffer(gameState, uid);
    if (r.ok && r.result) {
      const jid = r.result.actionId;
      const cfg = jid ? getMiniGameConfigFor(gameState, jid) : undefined;
      const job = jid ? getJobDef(jid) : undefined;
      presentJobResult(r.result, cfg, job ? { id: job.id, name: job.name, icon: job.icon } : { id: jid ?? "", name: "工作", icon: "💼" });
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

  <div class="board-hint">
    💡 日结工点击<b>开始工作</b>，完成小游戏后当班到账；正式工请打开手机 →「招聘」直接入职，前往单位上班，每七天发薪。
  </div>

  {#if gameState.career.jobId}
    {@const activeJob = getJobDef(gameState.career.jobId)}
    <div class="career-strip">
      <span>📈 {careerTrackName(careerTrack)} · {CAREER_TIERS.find((t) => t.id === careerTierFor(gameState, activeJob))?.name ?? "入门岗"}</span>
      <span class="dim">履历 {careerExp} 次</span>
      {#if careerNext}<span class="career-next">再完成 {careerNext.remaining} 次 → {careerNext.name}</span>{/if}
      <span class="career-score">💰 待发 {formatMoney(gameState.career.accruedWages ?? 0)} 元 · 每七天发薪</span>
    </div>
  {:else}
    <div class="career-strip dim">📈 每完成一次工作都会积累对应职业轨道履历，达到 3 / 10 / 24 次可晋升</div>
  {/if}

  {#if offers.length === 0}
    <div class="empty">
      <div class="empty-icon">🍵</div>
      <div>今天没什么活儿，明天再来吧</div>
    </div>
  {:else}
    <div class="grid">
      {#each offers as { offer, def }}
        {@const preview = previewWork(gameState, def)}
        <div class="job-card">
          <div class="job-head">
            <span class="gi-emoji" style="font-size:30px;line-height:1">{def.icon}</span>
            <div class="job-info">
              <div class="job-name">{def.name}</div>
              <div class="job-desc">{def.desc}</div>
            </div>
            <div class="job-right">
              <span class="job-hours">🕐 {def.duration}h</span>
              <div class="job-price">约 +{formatMoney(preview.wage)}</div>
            </div>
          </div>
          <div class="job-tags">
            <span class="tag career">📈 {careerTag(def)}</span>
            <span class="tag info">🕐 预计 {endTime(def)} 下班</span>
            <span class="tag cost">⚡ {preview.stamina}</span>
            {#if preview.stress > 0}
              <span class="tag cost">🔥 +{preview.stress}</span>
            {/if}
            {#if def.effects.skills}
              {#each Object.entries(def.effects.skills) as [k, v]}
                {#if v && v > 0}
                  <span class="tag info">+{v} {SKILL_NAMES[k as keyof typeof SKILL_NAMES] ?? k}</span>
                {/if}
              {/each}
            {/if}
          </div>
          <div class="job-foot">
            <span class="quota">还剩 {offer.quota} 个名额</span>
            <button class="btn btn-primary small" onclick={() => doJob(offer.uid)} disabled={offer.quota <= 0 || !!gameState.work?.active}>
              开始工作
            </button>
          </div>
          {#if def.incomeTiers}<div class="tier-line">🚲 自有车辆可增加收入；基本工具由雇主提供。当前交通方式：{vehicle === "none" ? "步行" : vehicle === "bicycle" ? "自行车" : vehicle === "e_bike" ? "电动车" : vehicle === "car" ? "汽车" : "三轮车"}</div>{/if}
          {#if preview.warning}<div class="job-lock">⚠️ {preview.warning}</div>{/if}
        </div>
      {/each}
    </div>
  {/if}

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
  /* v1.463：劳务市场加正式工指引（此前玩家只逛劳务市场，找不到正式工） */
  .board-hint {
    font-size: 12px;
    line-height: 1.55;
    padding: 8px 10px;
    margin-bottom: 12px;
    border-radius: 8px;
    background: rgba(120, 200, 255, 0.1);
    border: 1px solid rgba(120, 200, 255, 0.18);
  }
  .board-hint b {
    color: var(--accent-2, #6cc6ff);
    font-weight: 700;
  }
  .career-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    font-size: 11px;
  }
  .career-next { color: var(--ok); }
  .career-score { color: var(--accent-2); }
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
  .job-head {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .tag.career { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
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
</style>
