<script lang="ts">
  import { showToast } from "../../stores/uiStore.svelte";
  import { getRegion } from "../../game/core/regions";
  import { travelLabel } from "../../game/core/actions";
  import { playSound } from "../../lib/audio";

  type MapItem = {
    id: string;
    name: string;
    icon: string;
    locked: boolean;
    closed: boolean;
    gradient: string;
    /** 预计通行时间（小时） */
    travelHours: number;
    travelText?: string;
    /** v0.935 还没开门（区别于已打烊） */
    notYetOpen?: boolean;
    /** v0.935 允许提前到达候场（开门前 2h 内） */
    early?: boolean;
    /** v0.935 打烊/未开门的说明文案 */
    closedText?: string;
  };

  let {
    regionId,
    items,
    onSelect,
  }: {
    regionId: string;
    items: MapItem[];
    onSelect: (id: string) => void;
  } = $props();

  const region = $derived(getRegion(regionId));

  function click(item: MapItem): void {
    if (item.locked) {
      showToast("暂未开放，下次更新推出");
      return;
    }
    // v0.935：开门前 2h 内允许提前过去候场，其余情况才拦
    if (item.closed && !item.early) {
      showToast(item.closedText ?? "已打烊");
      return;
    }
    playSound("walk");
    onSelect(item.id);
  }
</script>

<div class="region-view hud-scope" style:background={region?.gradient ?? "linear-gradient(135deg,#1a2440,#2b3a67)"}>
  <div class="head">
    <div class="title">{region?.icon ?? "🗺️"} {region?.name ?? "区域"}</div>
    <div class="hint dim">{region?.desc ?? ""}</div>
  </div>

  <div class="grid">
    {#each items as item (item.id)}
      <button
        class="card"
        class:locked={item.locked}
        class:closed={item.closed && !item.early}
        class:early={item.early}
        onclick={() => click(item)}
        disabled={item.locked || (item.closed && !item.early)}
        title={item.closedText ?? ""}
      >
        <span class="icon">{item.icon}</span>
        <span class="name">{item.name}</span>
        <span class="travel">{item.travelText ?? travelLabel(item.travelHours)}</span>
        {#if item.locked}<span class="badge lock">🔒 暂未开放</span>
        {:else if item.early}<span class="badge early">⏳ 可提前候场</span>
        {:else if item.notYetOpen}<span class="badge closed">🌙 未开门</span>
        {:else if item.closed}<span class="badge closed">🔒 打烊</span>
        {/if}
      </button>
    {/each}
    {#if items.length === 0}
      <div class="empty dim">该区域暂无地点</div>
    {/if}
  </div>

  <div class="legend">
    <span class="lg-item">🟡 营业中可前往</span>
    <span class="lg-item">⏳ 未开门但可提前到达等候</span>
    <span class="lg-item">🔒 锁定 / 打烊</span>
  </div>
</div>

<style>
  .region-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
    gap: 16px;
    overflow-y: auto;
    color: var(--text-main, #eef1ff);
    /* v0.91：地图文字统一加深色描边 */
    text-shadow: var(--text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .title {
    font-size: 22px;
    font-weight: 800;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
    letter-spacing: 1px;
  }
  .hint {
    font-size: 12.5px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  /* 每行最多 5 个：市中心设施多，单行排列太挤 */
  .grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }
  /* 场景区宽度随左右侧栏折叠而变，用容器查询逐级降档 */
  @container (max-width: 820px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @container (max-width: 660px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @container (max-width: 480px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(6px);
    transition: transform 0.15s ease, border-color 0.15s ease;
    text-align: center;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .card:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--accent, #ffd166);
    background: rgba(255, 209, 102, 0.12);
  }
  .card:disabled {
    cursor: not-allowed;
  }
  .card.locked,
  .card.closed {
    opacity: 0.5;
    background: rgba(255, 255, 255, 0.04);
  }
  .icon {
    font-size: 36px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
  }
  .name {
    font-size: 13.5px;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .travel {
    font-size: 10.5px;
    opacity: 0.72;
    letter-spacing: 0.2px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    margin-top: 2px;
  }
  .badge.lock {
    background: rgba(255, 107, 107, 0.2);
    color: #ff6b6b;
  }
  .badge.closed {
    background: rgba(108, 198, 255, 0.18);
    color: #6cc6ff;
  }
  /* v0.935 提前候场：可点，但视觉上弱于营业中 */
  .badge.early {
    background: rgba(255, 209, 102, 0.2);
    color: #ffd166;
  }
  .card.early {
    opacity: 0.82;
    border-style: dashed;
  }
  .empty {
    padding: 30px;
    text-align: center;
    font-size: 14px;
  }
  .legend {
    display: flex;
    gap: 16px;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.75);
    padding-top: 8px;
  }
  .dim {
    color: rgba(255, 255, 255, 0.65);
  }
</style>