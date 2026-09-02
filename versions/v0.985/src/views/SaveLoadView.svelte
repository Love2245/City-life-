<script lang="ts">
  import { onMount } from "svelte";
  import { goto, gameState } from "../stores/gameStore.svelte";
  import { saveGame, listSaves, deleteSave, loadGameIntoState, type SaveMeta } from "../lib/save";
  import { formatDate, formatMoney } from "../lib/format";

  const SLOTS = ["slot_1", "slot_2", "slot_3", "auto"];
  const SLOT_LABEL: Record<string, string> = {
    slot_1: "存档位 1",
    slot_2: "存档位 2",
    slot_3: "存档位 3",
    auto: "自动存档",
  };

  let saves = $state<SaveMeta[]>([]);

  const refresh = async (): Promise<void> => {
    saves = await listSaves();
  };

  onMount(() => {
    void refresh();
  });

  const metaOf = (slot: string): SaveMeta | undefined => saves.find((s) => s.slot === slot);

  async function doSave(slot: string): Promise<void> {
    await saveGame(slot, gameState);
    await refresh();
  }

  async function doLoad(slot: string): Promise<void> {
    if (await loadGameIntoState(slot)) goto("game");
  }

  async function doDelete(slot: string): Promise<void> {
    await deleteSave(slot);
    await refresh();
  }
</script>

<div class="page">
  <div class="page-head">
    <button class="btn" onclick={() => goto("game")}>← 返回</button>
    <span class="h1">📂 存档 / 读档</span>
    <span></span>
  </div>

  <div class="slot-grid">
    {#each SLOTS as slot (slot)}
      {@const meta = metaOf(slot)}
      <div class="slot-card card">
        <div class="slot-name">
          {SLOT_LABEL[slot]}
          {#if slot === "auto"}<span class="tag info">自动</span>{/if}
        </div>

        {#if meta}
          <div class="slot-info">
            <div>📅 {formatDate(meta.year, meta.month, meta.day)}</div>
            <div>💰 {formatMoney(meta.money)}</div>
            <div class="dim">💼 {meta.jobId ?? "待业"}</div>
          </div>
        {:else}
          <div class="slot-empty dim">— 空 —</div>
        {/if}

        <div class="slot-actions">
          <button class="btn btn-primary small" onclick={() => doSave(slot)}>保存</button>
          <button class="btn small" disabled={!meta} onclick={() => doLoad(slot)}>读档</button>
          <button class="btn btn-danger small" disabled={!meta} onclick={() => doDelete(slot)}>删除</button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
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
    gap: 6px;
    margin-top: auto;
  }
  .small {
    padding: 5px 10px;
    font-size: 12px;
  }
</style>
