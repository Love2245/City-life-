<script lang="ts">
  import { onMount } from "svelte";
  import { backFromPage, navigation, goto, gameState } from "../stores/gameStore.svelte";
  import { saveGame, listSaves, deleteSave, loadGameIntoState, exportSavePayload, importSavePayload, isImportableSavePayload, hasBackupSave, restoreLatestBackup, type SaveMeta } from "../lib/save";
  import { downloadTapCloudSave, hasTapTapCloudBridge, listTapCloudArchives, uploadTapCloudSave, type TapCloudArchive } from "../lib/taptap-cloud";
  // v1.43.1：Tauri/WebView2 下 window.confirm 静默返回 false，破坏性操作改用应用内确认弹层
  import { uiConfirm, showToast } from "../stores/uiStore.svelte";
  import { getJobDef } from "../game/core/jobs";
  import { formatDate, formatMoney } from "../lib/format";

  const SLOTS = ["slot_1", "slot_2", "slot_3", "auto"];
  const SLOT_LABEL: Record<string, string> = {
    slot_1: "存档位 1",
    slot_2: "存档位 2",
    slot_3: "存档位 3",
    auto: "自动存档",
  };

  let saves = $state<SaveMeta[]>([]);
  let error = $state<string | null>(null);
  let transferNotice = $state('');
  function exportFile(slot: string): void {
    const payload = exportSavePayload(slot);
    if (!payload) { error = '此存档暂无可导出的内容'; return; }
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `都市生活_${SLOT_LABEL[slot]}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    transferNotice = '存档已导出';
  }
  async function importFile(slot: string, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    try {
      const payload = await file.text();
      if (!isImportableSavePayload(payload)) throw new Error('文件不是有效存档，或来自较新的游戏版本');
      if (metaOf(slot) && !(await uiConfirm(`导入后将替换${SLOT_LABEL[slot]}，原存档会保留为备份。`, { confirmLabel: '导入存档' }))) return;
      if (!importSavePayload(slot, payload)) throw new Error('导入失败，原存档未被替换');
      await refresh(); transferNotice = `已导入${SLOT_LABEL[slot]}，点击读档即可继续`;
    } catch (cause) { error = cause instanceof Error ? cause.message : '存档文件读取失败'; }
  }
  let cloudArchives = $state<TapCloudArchive[]>([]);
  let cloudError = $state<string | null>(null);
  let cloudBusy = $state(false);
  let cloudController: AbortController | undefined;
  const cloudEnabled = hasTapTapCloudBridge();

  const refresh = async (): Promise<void> => {
    try {
      saves = await listSaves();
      error = null;
    } catch {
      error = "存档列表读取失败，请检查存储权限后重试";
    }
  };

  onMount(() => {
    void refresh();
    if (cloudEnabled) void refreshCloud();
    // 导航离开后中止残留的云请求，避免完成后写卸载组件状态。
    return () => cloudController?.abort();
  });

  async function refreshCloud(): Promise<void> {
    const controller = new AbortController();
    cloudController = controller;
    cloudBusy = true;
    try {
      cloudArchives = await listTapCloudArchives(controller.signal);
      cloudError = null;
    } catch (cause) {
      cloudError = cause instanceof Error ? cause.message : "云存档读取失败";
    } finally {
      if (cloudController === controller) cloudController = undefined;
      cloudBusy = false;
    }
  }

  async function uploadAutoSave(): Promise<void> {
    const payload = exportSavePayload("auto");
    if (!payload) {
      cloudError = "当前没有自动存档可上传。先进入游戏并保存进度。";
      return;
    }
    const controller = new AbortController();
    cloudController = controller;
    cloudBusy = true;
    try {
      await uploadTapCloudSave(payload, controller.signal);
      cloudError = "云存档已更新。";
      await refreshCloud();
    } catch (cause) {
      cloudError = cause instanceof Error ? cause.message : "云存档上传失败";
    } finally {
      if (cloudController === controller) cloudController = undefined;
      cloudBusy = false;
    }
  }

  async function restoreCloudArchive(archive: TapCloudArchive): Promise<void> {
    if (!(await uiConfirm("用这份 TapTap 云存档覆盖本机自动存档并进入游戏？", { confirmLabel: "恢复云存档" }))) return;
    const controller = new AbortController();
    cloudController = controller;
    cloudBusy = true;
    try {
      const result = await downloadTapCloudSave(archive.uuid, archive.fileId, controller.signal);
      if (!importSavePayload("auto", result.saveJson)) {
        throw new Error("云存档结构无效或版本不受支持，本地进度未被覆盖。 ");
      }
      await refresh();
      if (await loadGameIntoState("auto")) {
        cloudError = null;
        goto("game");
      } else {
        throw new Error("云存档已下载，但未能载入。请在存档列表检查自动存档。");
      }
    } catch (cause) {
      cloudError = cause instanceof Error ? cause.message : "云存档恢复失败";
    } finally {
      if (cloudController === controller) cloudController = undefined;
      cloudBusy = false;
    }
  }

  function cancelCloudWait(): void {
    cloudController?.abort();
  }

  const metaOf = (slot: string): SaveMeta | undefined => saves.find((s) => s.slot === slot);
  const canWriteManual = $derived(navigation.returnView === "game");
  /** 存档位展示中文岗位名，避免把 job_delivery 这类原始键名暴露给玩家 */
  const jobLabel = (jobId: string | null | undefined): string => (jobId ? getJobDef(jobId)?.name ?? "待业" : "待业");

  async function doSave(slot: string): Promise<void> {
    if (!canWriteManual || slot === "auto") return;
    if (metaOf(slot) && !(await uiConfirm(`确定覆盖${SLOT_LABEL[slot]}？`, { confirmLabel: "覆盖保存" }))) return;
    try {
      const snapshot = {
        ...gameState,
        flags: { ...gameState.flags, manual_saved_once: true },
      };
      await saveGame(slot, snapshot);
      gameState.flags["saved_once"] = true;
      gameState.flags["manual_saved_once"] = true; // 仅手动存档成功后才完成引导
      await refresh();
      showToast(`已保存到${SLOT_LABEL[slot]}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "本地存储不可用，未覆盖原有存档";
      error = message.startsWith("存档写入失败") ? message.replace("存档写入失败", "保存失败") : message;
    }
  }

  async function doLoad(slot: string): Promise<void> {
    try {
      if (await loadGameIntoState(slot)) {
        error = null;
        goto("game");
        return;
      }
      error = "该存档不存在或已损坏";
    } catch {
      error = "读档失败，该存档可能已损坏";
    }
  }

  async function doDelete(slot: string): Promise<void> {
    if (!metaOf(slot) || !(await uiConfirm(`确定删除${SLOT_LABEL[slot]}？此操作不可恢复。`, { confirmLabel: "删除", danger: true }))) return;
    try {
      await deleteSave(slot);
      await refresh();
      showToast(`已删除${SLOT_LABEL[slot]}`);
    } catch {
      error = "删除失败，请重试";
    }
  }

  async function doRecover(slot: string): Promise<void> {
    if (!hasBackupSave(slot)) return;
    if (!(await uiConfirm(`将用${SLOT_LABEL[slot]}最近一份有效备份替换当前损坏存档？`, { confirmLabel: "恢复备份" }))) return;
    if (!restoreLatestBackup(slot)) {
      error = "备份已不可用，当前存档未更改";
      return;
    }
    error = null;
    await refresh();
  }
</script>

<div class="page saves-page">
  <div class="page-head">
    <button class="btn" onclick={() => backFromPage()}>← 返回</button>
    <span class="h1">存档 / 读档</span>
    <span></span>
  </div>

  <div class="page-intro"><span class="page-eyebrow">留住城市里的每一天</span><p>继续熟悉的生活，或为重要的时刻留一份存档。</p></div>

  {#if error}<div class="save-error" role="alert">⚠️ {error}</div>{/if}
  {#if transferNotice}<div class="transfer-notice" role="status">{transferNotice}</div>{/if}

  {#if cloudEnabled}
    <section class="cloud-card card" aria-label="TapTap 云存档">
      <div class="cloud-heading">
        <div>
          <strong>☁️ TapTap 云存档</strong>
          <p class="dim">仅在你点击时同步；恢复前会验证存档结构并征求确认。</p>
        </div>
        <div class="cloud-actions">
          <button class="btn small" disabled={cloudBusy} onclick={() => void refreshCloud()}>刷新</button>
          {#if cloudBusy}
            <button class="btn small" onclick={cancelCloudWait}>停止等待</button>
          {:else}
            <button class="btn btn-primary small" onclick={() => void uploadAutoSave()}>上传自动存档</button>
          {/if}
        </div>
      </div>
      {#if cloudError}<div class="cloud-status" role="status">{cloudError}</div>{/if}
      {#if cloudArchives.length > 0}
        <div class="cloud-list">
          {#each cloudArchives as archive (archive.uuid)}
            <div class="cloud-row">
              <div><strong>{archive.name}</strong><div class="dim">{archive.summary || "城市生活进度备份"}</div></div>
              <button class="btn small" disabled={cloudBusy || !archive.fileId} onclick={() => void restoreCloudArchive(archive)}>恢复</button>
            </div>
          {/each}
        </div>
      {:else if !cloudBusy && !cloudError}
        <div class="cloud-empty dim">还没有云端存档。上传后会在 TapTap 账号下保留一份自动存档。</div>
      {/if}
    </section>
  {/if}

  <div class="slot-grid">
    {#each SLOTS as slot (slot)}
      {@const meta = metaOf(slot)}
      <div class="slot-card card">
        <div class="slot-name">
          {SLOT_LABEL[slot]}
          {#if slot === "auto"}<span class="tag info">自动</span>{/if}
        </div>

        {#if meta && (meta.status === undefined || meta.status === "valid")}
          <div class="slot-info">
            <div>📅 {formatDate(meta.year, meta.month, meta.day)}</div>
            <div>💰 {formatMoney(meta.money)}</div>
            <div class="dim">💼 {jobLabel(meta.jobId)}</div>
          </div>
        {:else if meta}
          <div class="slot-info" role="alert">
            <strong class="save-problem">⚠️ {meta.status === "future" ? "较新版本存档" : "存档损坏"}</strong>
            <div class="dim">{meta.problem ?? "无法读取此存档"}</div>
            {#if hasBackupSave(slot)}
              <button class="btn small" onclick={() => void doRecover(slot)}>恢复最近备份</button>
            {/if}
          </div>
        {:else}
          <div class="slot-empty dim"><span class="empty-mark" aria-hidden="true">＋</span><span>尚未记录生活</span><small>{slot === "auto" ? "开始游玩后会自动保存" : "进入游戏后可保存到此处"}</small></div>
        {/if}

        <div class="slot-actions">
          {#if canWriteManual && slot !== "auto"}
            <button class="btn btn-primary small" onclick={() => doSave(slot)}>保存</button>
          {:else if slot === "auto"}
            <span class="dim small">由系统自动写入</span>
          {/if}
          <button class="btn small" disabled={!meta || (meta.status !== undefined && meta.status !== "valid")} onclick={() => doLoad(slot)}>读档</button>
          <button class="btn small" disabled={!meta} onclick={() => exportFile(slot)}>导出 JSON</button>
          {#if slot !== 'auto'}<label class="btn small import-button">导入 JSON<input type="file" accept=".json,application/json" aria-label={`${SLOT_LABEL[slot]}导入 JSON`} onchange={e => void importFile(slot, e.currentTarget)} /></label>{/if}
          <button class="btn btn-danger small" disabled={!meta} onclick={() => doDelete(slot)}>删除</button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .import-button{position:relative;overflow:hidden;cursor:pointer}.import-button input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}.import-button:focus-within{outline:2px solid var(--accent)}
  .transfer-notice{font-size:13px;color:var(--ok);padding:8px 0}
  .page {
    height: 100%;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .slot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  .save-error {
    padding: 10px 12px;
    border: 1px solid rgba(255, 100, 100, 0.45);
    border-radius: 10px;
    background: rgba(255, 80, 80, 0.12);
    color: #ffb0b0;
    font-size: 13px;
  }
  .slot-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .slot-name {
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slot-info {
    font-size: 12.5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .slot-empty {
    font-size: 13px;
    padding: 16px 0;
    text-align: center;
  }
  .slot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: auto;
  }
  .small {
    padding: 5px 10px;
    font-size: 12px;
  }
  .cloud-card { display: flex; flex-direction: column; gap: 10px; }
  .cloud-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .cloud-heading p { margin: 5px 0 0; font-size: 12px; }
  .cloud-actions { display: flex; gap: 7px; flex-wrap: wrap; }
  .cloud-status { color: #ffd27a; font-size: 12px; }
  .cloud-list { display: grid; gap: 8px; }
  .cloud-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; }
  .cloud-row .dim, .cloud-empty { font-size: 12px; }
  @media (max-width: 600px) {
    .cloud-heading { align-items: flex-start; flex-direction: column; }
  }
</style>
