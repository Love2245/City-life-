<script lang="ts">
  import { gameState } from "../stores/gameStore.svelte";
  import { showToast, presentJobResult, uiConfirm } from "../stores/uiStore.svelte";
  import { getWorkShift, resignJob, resignationSalaryPreview } from "../game/core/career";
  import { completedWorkShifts, MASTERY_FULL_SHIFTS, getJobDef, performJob, previewWork, workStatusReason } from "../game/core/jobs";
  import { getMiniGameConfigFor } from "../game/core/minigame";
  import { moveTo } from "../game/core/actions";
  import { START_EPOCH, fromLinearDay } from "../game/core/calendar";
  import { locationName, formatDuration } from "../game/core/quests";
  import { formatMoney } from "../lib/format";

  let { compact = false }: { compact?: boolean } = $props();

  const employedJob = $derived(gameState.career.jobId ? getJobDef(gameState.career.jobId) : undefined);
  const activeJob = $derived(gameState.work?.active ? getJobDef(gameState.work.active.jobId) : undefined);
  const shift = $derived(employedJob ? getWorkShift(gameState, employedJob) : undefined);
  const preview = $derived(employedJob ? previewWork(gameState, employedJob) : undefined);
  const records = $derived((gameState.work?.wageRecords ?? []).slice(-8).reverse());
  const mastery = $derived(employedJob ? completedWorkShifts(gameState,employedJob.id) : 0);
  const masteryTarget = $derived(employedJob ? MASTERY_FULL_SHIFTS : 1);
  const warning = $derived(workStatusReason(gameState));

  function dateOf(day: number | undefined): string {
    if (day == null || !Number.isFinite(day)) return "待安排";
    const d = fromLinearDay(START_EPOCH + day);
    return `${d.year}年${d.month}月${d.day}日`;
  }

  function shiftTime(): string {
    if (!shift || shift.phase === "none") return "待安排";
    const hour = Math.floor(((shift.startMinute % 1440) + 1440) % 1440 / 60);
    const minute = ((shift.startMinute % 60) + 60) % 60;
    return `${dateOf(shift.day)} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function shiftAction(): string {
    if (gameState.work?.active) return "▶ 继续当前工作";
    if (!employedJob || !shift) return "查看招聘";
    if (shift.phase === "next" || shift.phase === "rest" || shift.phase === "none") return shift.label;
    if (gameState.locationId !== employedJob.locationId) return `📍 前往${locationName(employedJob.locationId)}`;
    if (shift.phase === "early" || shift.phase === "working") return shift.label;
    return shift.label || "查看下一班";
  }

  function startShift(): void {
    const job = activeJob ?? employedJob;
    if (!job) return;
    if (gameState.work?.active) {
      presentJobResult({ actionId: job.id, deltas: [] }, getMiniGameConfigFor(gameState, job.id), { id: job.id, name: job.name, icon: job.icon });
      return;
    }
    if (shift && ["next", "rest", "none"].includes(shift.phase)) {
      showToast(shift.label || "当前没有待上班次");
      return;
    }
    if (gameState.locationId !== job.locationId) {
      const moved = moveTo(gameState, job.locationId ?? "");
      showToast(moved.ok ? `已到${locationName(job.locationId)}，请点击上班` : moved.reason ?? "暂时无法前往单位");
      return;
    }
    if (shift && !["early", "working"].includes(shift.phase)) {
      showToast(shift.label || "当前没有待上班次");
      return;
    }
    if (warning) {
      showToast(warning);
      return;
    }
    const result = performJob(gameState, job.id);
    if (result.ok && result.result) {
      presentJobResult(result.result, getMiniGameConfigFor(gameState, job.id), { id: job.id, name: job.name, icon: job.icon });
    } else if (result.reason) showToast(result.reason);
  }

  async function leaveJob(): Promise<void> {
    if (!employedJob) return;
    const pending = resignationSalaryPreview(gameState);
    if (!(await uiConfirm(`确定离开「${employedJob.name}」？待发工资 ${formatMoney(pending)} 元将立即结清。`, { confirmLabel: "结清并离职" }))) return;
    const result = resignJob(gameState);
    showToast(result.text);
  }
</script>

<section class="work-panel" class:compact>
  <div class="panel-title">💼 我的工作</div>
  {#if activeJob}
    <div class="active-note">⏸ {activeJob.name}正在进行；继续同一班后才会结算。</div>
  {/if}
  {#if employedJob}
    <div class="work-title">{employedJob.icon} {employedJob.name} <span>正式工 · 周结</span></div>
    <div class="work-metrics">
      <div><small>下一班</small><strong>{shiftTime()}</strong></div>
      <div><small>待发工资</small><strong>{formatMoney(gameState.career.accruedWages ?? 0)} 元</strong></div>
      <div><small>下次发薪</small><strong>{dateOf(gameState.career.nextPayDay)}</strong></div>
      <div><small>连续缺勤</small><strong>{gameState.career.consecutiveAbsences ?? 0}/3 班</strong></div>
    </div>
    <div class="work-detail">📍 {locationName(employedJob.locationId)} · {shift?.label ?? "待排班"}</div>
    {#if preview && ["early", "working"].includes(shift?.phase ?? "")}
      <div class="work-detail">本班约 {formatDuration(preview.duration)} · {employedJob.id === 'job_delivery_fulltime' ? `底薪＋订单提成，普通班参考收入约 ${formatMoney(preview.wage)} 元` : `基础工资约 ${formatMoney(preview.wage)} 元`}；迟到按实际工时计薪</div>
    {/if}
    <div class="work-detail">完班记录 {mastery}/{masteryTarget} 次{mastery >= masteryTarget ? " · 可选跳过领取 80% 工资，照常挑战可领完整工资" : " · 累计完成 10 次可选择跳过"}</div>
    <div class="mastery-track"><span style={`width:${Math.min(100, mastery / masteryTarget * 100)}%`}></span></div>
    {#if warning}<div class="work-warning">⚠️ {warning}</div>{/if}
    <div class="work-actions">
      <button class="work-start" onclick={startShift} disabled={!activeJob && !["travel", "early", "working"].includes(shift?.phase ?? "")}>{shiftAction()}</button>
      {#if !compact}<button class="work-leave" onclick={leaveJob}>离职 · 结清 {formatMoney(resignationSalaryPreview(gameState))} 元</button>{/if}
    </div>
  {:else if activeJob}
    <button class="work-start" onclick={startShift}>▶ 继续{activeJob.name}</button>
  {:else}
    <p class="work-empty">尚未入职。正式工可在招聘页直接录用，日结工去劳务市场立即开工。</p>
  {/if}
  {#if !compact}
    <div class="record-title">最近工资记录</div>
    {#each records as record (record.id)}
      <div class="record-row">
        <span>{dateOf(record.day)} · {getJobDef(record.jobId)?.name ?? record.jobId}<small>{record.note}</small></span>
        <strong>+{formatMoney(record.total)} 元</strong>
      </div>
      {#if record.gameBonus || record.attendanceBonus}<div class="record-detail">基础 {formatMoney(record.base)} · 表现 +{formatMoney(record.gameBonus)} · 满勤 +{formatMoney(record.attendanceBonus)}</div>{/if}
    {:else}
      <p class="work-empty">暂无工资记录，完成工作或发薪后会显示在这里。</p>
    {/each}
  {/if}
</section>

<style>
  .work-panel { padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-soft); margin: 8px 0 14px; color: var(--text-main, #eef1ff); }
  .panel-title, .record-title { font-weight: 700; font-size: 14px; margin-bottom: 9px; }
  .work-title { font-weight: 700; margin-bottom: 8px; }
  .work-title span { font-size: 11px; font-weight: 500; color: var(--accent-2); }
  .work-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .work-metrics > div { border: 1px solid var(--border); border-radius: 8px; padding: 7px; display: flex; flex-direction: column; min-width: 0; }
  .work-metrics small, .record-row small { color: var(--text-dim); font-size: 11px; }
  .work-metrics strong { font-size: 12px; overflow-wrap: anywhere; }
  .work-detail, .work-empty, .active-note, .work-warning { font-size: 12px; line-height: 1.5; margin: 8px 0; }
  .active-note { color: var(--accent-2); }
  .work-warning { color: var(--warn); }
  .mastery-track { height: 6px; background: rgba(255,255,255,.12); border-radius: 99px; overflow: hidden; }
  .mastery-track span { display: block; height: 100%; background: var(--accent); }
  .work-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
  .work-actions button, .work-panel > button { border-radius: 8px; border: 1px solid var(--border); padding: 8px 11px; cursor: pointer; }
  .work-start { background: var(--accent); color: #111a28; font-weight: 700; }
  .work-start:disabled { opacity: .5; cursor: default; }
  .work-leave { background: transparent; color: var(--text-dim); }
  .record-title { margin-top: 14px; }
  .record-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; border-top: 1px solid var(--border); padding: 7px 0; }
  .record-row span { display: flex; flex-direction: column; }
  .record-row strong { color: var(--ok); white-space: nowrap; }
  .record-detail { font-size: 10px; color: var(--text-dim); margin-top: -5px; }
  .compact .work-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
</style>
