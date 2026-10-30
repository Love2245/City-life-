<script lang="ts">
  import {fishImage} from "../lib/fishVisuals";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast, closeModal, pushModal, openNpcTaskPanel } from "../stores/uiStore.svelte";
  import { npcTaskImage } from '../lib/npcTaskVisuals';
  import { fade } from "svelte/transition";
  import {
    inventoryGroupOf,
    INVENTORY_GROUP_LABELS,
    useItem,
    getItem,
    type InventoryGroup,
  } from "../game/core/items";
  import { membershipDaysLeft } from "../game/core/membership";
  import { JOB_DEFS } from "../game/core/jobs";
  import { clothingOccasionTags } from "../game/core/playerOutfitResolver";
  import type { ItemDef } from "../game/types";
  import { getReadableDocument } from "../game/data/readableDocuments";
  import {
    equipItem,
    unequipItem,
    isEquipped,
    equippedSummary,
    SLOT_NAMES,
    SLOT_ICONS,
    isAutoHomeSlot,
  } from "../game/core/equipment";
  import { playSound,playInteractionSound } from "../lib/audio";
  import {itemUseSound} from '../lib/interactionSoundRouting';
  import { storedItems } from "../game/core/storage";
  import { isResidenceLocation } from "../game/core/residence";
  let { storage = false, underlay = false }: { storage?: boolean; underlay?: boolean } = $props();
  // 自动家居同步属于存档管线职责（migrate.ts 归一化 + 装备/获取/购房各变更点均已覆盖），
  // 不在 UI 挂载时触发数据迁移。
  const atHome = $derived(isResidenceLocation(gameState));
  // underlayer 只服务于主角透明立绘的兼容叠层，服装操作统一从衣柜进入。
  const list = $derived(storedItems(gameState, storage && atHome ? "home" : "backpack"));
  const credentials = $derived(storedItems(gameState, "credentials"));
  const slots = $derived(equippedSummary(gameState));

  const INVENTORY_FILTERS = $derived((storage ? [
    { id: "all", label: "全部" },
    { id: "equipment", label: "工具与家居" },
    { id: "ingredients", label: INVENTORY_GROUP_LABELS.ingredients },
    { id: "collectibles", label: INVENTORY_GROUP_LABELS.collectibles },
    { id: "other", label: "收藏与其他" },
  ] : [
    { id: "all", label: "全部" },
    { id: "consumables", label: INVENTORY_GROUP_LABELS.consumables },
    { id: "documents", label: INVENTORY_GROUP_LABELS.documents },
    { id: "collectibles", label: INVENTORY_GROUP_LABELS.collectibles },
    { id: "quest_items", label: INVENTORY_GROUP_LABELS.quest_items },
  ]) as { id: InventoryFilter; label: string }[]);
  type InventoryFilter = "all" | InventoryGroup;
  let activeFilter = $state<InventoryFilter>("all");

  const filteredList = $derived(
    activeFilter === "all" ? list : list.filter((entry) => inventoryGroupOf(entry.item) === activeFilter),
  );

  /** 加成字段中文名 */
  const BONUS_LABEL: Record<string, string> = {
    charm: "魅力",
    mood: "心情",
    health: "健康",
    hygiene: "干净度",
    fame: "影响力",
    fitness: "体质",
    intelligence: "智力",
  };

  const CERTIFICATE_FLAGS: Record<string, string> = {
    driving_license: "item_driving_license",
    certificate: "item_certificate",
  };

  function filterCount(filter: InventoryFilter): number {
    return filter === "all"
      ? list.length
      : list.filter((entry) => inventoryGroupOf(entry.item) === filter).length;
  }

  function usageNotes(item: ItemDef): string[] {
    if(item.id.startsWith("fish_specimen_")){const fish=gameState.fishing?.specimens[item.id.slice(14)];return fish?[`垂钓标本 · ${(fish.grams/1000).toFixed(3)} 千克`]:[];}
    if (item.id === "gym_card") {
      const days = membershipDaysLeft(gameState, "gym");
      return [days > 0 ? `会籍有效期剩余 ${days} 天` : "剩余 0 天（会籍已失效或旧存档没有有效期记录）"];
    }

    const requiredFlag = CERTIFICATE_FLAGS[item.id];
    if (requiredFlag) {
      if (item.id === "driving_license") {
        return ["用途：持证后可租用或买断汽车、使用网约车接单；驾校助教等驾驶岗位也会提高报酬。"];
      }
      const jobs = JOB_DEFS.filter((job) => job.requirements?.flag === requiredFlag).map((job) => job.name);
      if (jobs.length > 0) {
        const licenseName = item.id === "driving_license" ? "驾驶本" : "技能证书";
        return [`工作用途：${jobs.join("、")}无需${licenseName}也可入职；持有后每班基础报酬增加 10 元。`];
      }
    }

    if (item.luxury && !item.slot && item.occasion?.length) {
      const occasions = clothingOccasionTags(item.id).join("、");
      return [`随身持有生效：${occasions}场合适配 +1（对应场合加成 +2，受整体 +6 上限约束；影响场合评价与初次见面好感，不影响入职）。`];
    }
    return [];
  }

  function close(): void {
    closeModal();
  }
  function openDocument(id: string): void {
    uiState.readerId = id;
    pushModal("reader");
  }

  function use(itemId: string): void {
    const r = useItem(gameState, itemId);
    if (!r.ok) {
      showToast(r.reason ?? "无法使用");
      return;
    }
    playInteractionSound(itemUseSound(itemId));
  }

  function equip(itemId: string): void {
    if (!atHome) { showToast("请回到住处管理装备与家居"); return; }
    const r = equipItem(gameState, itemId);
    if (!r.ok) {
      showToast(r.reason ?? "无法装备");
      return;
    }
    playSound("success");
  }

  function unequip(slot: string): void {
    if (!atHome) { showToast("请回到住处管理装备与家居"); return; }
    const r = unequipItem(gameState, slot as Parameters<typeof unequipItem>[1]);
    if (!r.ok) {
      showToast(r.reason ?? "无法卸下");
      return;
    }
  }
</script>

<div class="overlay hud-scope" class:underlay role="presentation" onclick={close} onkeydown={(e) => e.stopPropagation()} transition:fade={{ duration: 150 }}>
  <div class="bag" role="dialog" aria-modal="true" aria-label={storage ? "家中收纳" : "背包"} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="bag-head">
      <div class="bag-title">{storage ? "🗄️ 家中收纳" : "🎒 随身背包"}</div>
      <div class="bag-head-actions">
        {#if atHome}
          <button class="wardrobe-link" onclick={() => (uiState.modal = storage ? "inventory" : "home_storage")}>{storage ? "背包" : "收纳"}</button>
          <button class="wardrobe-link" onclick={() => pushModal("wardrobe")}>👔 衣柜</button>
        {/if}
        <button class="bag-close" onclick={close} aria-label="关闭物品页面">✕</button>
      </div>
    </div>

    <p class="storage-hint dim">{storage ? "工具、家居、食材与收藏在这里管理。穿搭请打开衣柜。" : "携带消耗品、阅读资料和任务物品。服装在住处衣柜，工具与家居在家中收纳。"}</p>
    <details class="equipment-overview">
      <summary>当前穿搭 <span class="dim">展开查看</span></summary>
    <div class="slot-row">
      {#each slots as s}
        <div class="slot" class:filled={!!s.itemId}>
          <span class="slot-icon">{SLOT_ICONS[s.slot]}</span>
          <div class="slot-info">
            <div class="slot-name">{SLOT_NAMES[s.slot]}</div>
            {#if s.itemId}
              <div class="slot-item">{getItem(s.itemId)?.name}</div>
              {#if Object.keys(s.bonus).length > 0}
                <div class="slot-bonus dim">
                  {Object.entries(s.bonus)
                    .map(([k, v]) => `${BONUS_LABEL[k] ?? k} +${v}`)
                    .join(" ")}
                </div>
              {/if}
              {#if atHome}<button class="slot-unequip" onclick={() => unequip(s.slot)}>卸下</button>{/if}
            {:else}
              <div class="dim slot-empty">未装备</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    </details>
    {#if credentials.length > 0}
      <details class="credential-pocket">
        <summary>🪪 证照夹 <span class="dim">{credentials.length} 件</span></summary>
        <div class="credential-list">
          {#each credentials as entry (entry.item.id)}
            <div><strong>{entry.item.icon} {entry.item.name}</strong><p class="dim">{entry.item.desc}</p>
              {#each usageNotes(entry.item) as note}<p class="dim">{note}</p>{/each}
            </div>
          {/each}
        </div>
      </details>
    {/if}

    <div class="filter-row" role="group" aria-label={storage ? "家中物品分类" : "背包物品分类"}>
      {#each INVENTORY_FILTERS as filter (filter.id)}
        <button
          class="filter-button"
          class:active={activeFilter === filter.id}
          aria-pressed={activeFilter === filter.id}
          onclick={() => (activeFilter = filter.id)}
        >
          {filter.label}<span class="filter-count">{filterCount(filter.id)}</span>
        </button>
      {/each}
    </div>

    <div class="bag-grid">
      {#each filteredList as entry (entry.item.id)}
        <div class="bag-item" class:usable={entry.item.consumable} class:equipped={isEquipped(gameState, entry.item.id)}>
          {#if entry.item.artId && npcTaskImage(entry.item.artId)}
            <button class="task-item-image" aria-label={`查看${entry.item.name}`} onclick={() => openNpcTaskPanel({ kind: 'item', itemId: entry.item.id })}><img src={npcTaskImage(entry.item.artId)} alt={entry.item.name} loading="lazy" /></button>
          {:else if entry.item.id.startsWith("fish_specimen_")}<div class="specimen-frame"><img src={fishImage(entry.item.id.slice(14))} alt=""/></div>{:else}<span class="gi-emoji" aria-hidden="true">{entry.item.icon}</span>{/if}
          <span class="b-name">{entry.displayName}</span>
          <span class="b-meta">
            <span class="b-category">{INVENTORY_GROUP_LABELS[inventoryGroupOf(entry.item)]}</span>
            <span class="b-qty">×{entry.qty}</span>
          </span>
          <p class="b-desc">{entry.item.desc}</p>
          {#each usageNotes(entry.item) as note (note)}
            <p class="b-effect">{note}</p>
          {/each}
          <div class="b-actions">
            {#if inventoryGroupOf(entry.item) === 'quest_items'}
              <button class="b-use" onclick={() => openNpcTaskPanel({ kind: 'item', itemId: entry.item.id })}>查看实物与信息</button>
            {:else if getReadableDocument(entry.item.id)}
              <button class="b-use" onclick={() => openDocument(entry.item.id)}>打开阅读</button>
            {:else if entry.item.consumable}
              <button class="b-use" onclick={() => use(entry.item.id)}>使用</button>
            {:else if isAutoHomeSlot(entry.item.slot)}
              <span class="b-tag" class:tag-ok={isEquipped(gameState, entry.item.id)}>{isEquipped(gameState, entry.item.id) ? "✓ 自动使用" : "已收纳 · 自动选用最佳档位"}</span>
            {:else if entry.item.slot}
              {#if isEquipped(gameState, entry.item.id)}
                <span class="b-tag tag-ok">✅ 已装备</span>
              {:else if entry.item.slot === "underlayer"}
                <button class="b-use b-equip" onclick={() => pushModal("wardrobe")}>衣柜管理</button>
              {:else}
                <button class="b-use b-equip" onclick={() => equip(entry.item.id)}>装备</button>
              {/if}
            {:else}
              <span class="b-tag dim">持有</span>
            {/if}
          </div>
        </div>
      {/each}
      {#if filteredList.length === 0}
        {#if list.length === 0}
          <div class="empty dim">{storage ? "暂时没有收纳物品" : "暂时没有随身物品"}</div>
        {:else}
          <div class="empty dim">这个分类暂时没有物品</div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .task-item-image { width: 100%; height: 105px; border: 0; border-radius: 8px; background: #ffffff0a; cursor: zoom-in; padding: 4px; }
  .task-item-image img { width: 100%; height: 100%; object-fit: contain; }
  .specimen-frame{width:100%;height:75px;display:grid;place-items:center;background:#273b3a;border:3px solid #98764f;border-radius:6px;box-shadow:inset 0 0 12px #0005}.specimen-frame img{width:100%;height:65px;object-fit:contain;image-rendering:pixelated}

  .storage-hint { margin: 0; font-size: 11px; line-height: 1.6; }
  .equipment-overview, .credential-pocket { flex: 0 0 auto; border: 1px solid var(--stroke, #343d59); border-radius: 12px; padding: 10px; font-size: 12px; }
  summary { cursor: pointer; font-weight: 650; }
  summary span { float: right; font-size: 10px; font-weight: 400; }
  .equipment-overview[open], .credential-pocket[open] { max-height: 32vh; overflow: auto; }
  .equipment-overview .slot-row { margin-top: 10px; }
  .credential-list { display: grid; gap: 8px; margin-top: 10px; }
  .credential-list > div { border-top: 1px solid var(--stroke, #343d59); padding-top: 8px; }
  .credential-list p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.7);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    animation: fadeIn 0.2s ease;
  }
  .overlay.underlay { visibility: hidden; pointer-events: none; }
  .bag {
    width: min(92vw, 560px);
    max-height: 88dvh;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 18px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .bag-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .bag-head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bag-title {
    font-size: 18px;
    font-weight: 800;
  }
  .bag-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 13px;
    color: var(--text-dim, #9aa3c7);
  }
  .wardrobe-link {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(108, 198, 255, 0.4);
    background: rgba(108, 198, 255, 0.12);
    color: #cfeaff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .slot-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    flex: 0 0 auto;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed rgba(255, 255, 255, 0.15);
  }
  .slot.filled {
    border-style: solid;
    border-color: rgba(255, 209, 102, 0.5);
    background: rgba(255, 209, 102, 0.08);
  }
  .slot-icon {
    font-size: 22px;
    flex-shrink: 0;
  }
  .slot-info {
    min-width: 0;
    flex: 1;
  }
  .slot-name {
    font-size: 10.5px;
    color: var(--text-dim, #9aa3c7);
  }
  .slot-item {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slot-bonus {
    font-size: 10px;
  }
  .slot-unequip {
    margin-top: 2px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 122, 122, 0.15);
    color: #ff8a8a;
    border: 1px solid rgba(255, 122, 122, 0.35);
    font-size: 10.5px;
    cursor: pointer;
  }
  .slot-empty {
    font-size: 11px;
  }
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 0 0 auto;
  }
  .filter-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim, #9aa3c7);
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .filter-button:hover,
  .filter-button.active {
    border-color: rgba(255, 209, 102, 0.55);
    background: rgba(255, 209, 102, 0.14);
    color: #ffe3a0;
  }
  .filter-count {
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.2);
    font-size: 9px;
    line-height: 15px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .bag-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(138px, 1fr));
    grid-auto-rows: max-content;
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }
  .bag-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 12px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: center;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .bag-item:hover {
    transform: translateY(-2px);
    border-color: var(--accent, #ffd166);
  }
  .bag-item.equipped {
    border-color: rgba(123, 216, 143, 0.5);
  }
  .gi-emoji {
    font-size: 32px;
    line-height: 1;
  }
  .b-name {
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.3;
  }
  .b-meta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .b-category {
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(138, 180, 255, 0.12);
    color: #bcd4ff;
    font-size: 9px;
    line-height: 1.3;
  }
  .b-qty {
    font-size: 11px;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .b-desc,
  .b-effect {
    width: 100%;
    margin: 0;
    font-size: 10.5px;
    line-height: 1.5;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .b-desc {
    color: var(--text-dim, #9aa3c7);
  }
  .b-effect {
    color: #ffe3a0;
  }
  .b-actions {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: auto;
  }
  .b-use {
    margin-top: 4px;
    padding: 4px 14px;
    border-radius: 999px;
    background: rgba(123, 216, 143, 0.15);
    color: var(--ok, #7bd88f);
    border: 1px solid rgba(123, 216, 143, 0.35);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .b-use:hover {
    background: rgba(123, 216, 143, 0.3);
  }
  .b-equip {
    background: rgba(255, 209, 102, 0.15);
    color: #ffd166;
    border-color: rgba(255, 209, 102, 0.35);
  }
  .b-equip:hover {
    background: rgba(255, 209, 102, 0.3);
  }
  .b-tag {
    font-size: 10.5px;
    margin-top: 4px;
  }
  .tag-ok {
    color: var(--ok, #7bd88f);
    font-weight: 700;
  }
  .empty {
    padding: 40px;
    text-align: center;
    grid-column: 1 / -1;
    font-size: 14px;
  }
  @media (max-width: 380px) {
    .bag {
      width: 96vw;
      padding: 14px;
      gap: 10px;
    }
    .bag-grid {
      grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
      gap: 7px;
    }
    .filter-button {
      padding: 5px 7px;
      font-size: 10px;
    }
    .slot {
      padding: 7px 6px;
    }
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
  @media (max-height: 560px) {
    .bag { max-height: 94dvh; padding: 12px; gap: 8px; }
    .storage-hint { font-size: 10px; }
    .equipment-overview, .credential-pocket { padding: 7px 9px; }
    .empty { padding: 14px; }
  }
</style>
