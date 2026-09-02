<script lang="ts">
  /**
   * v1.21-beta UI 皮肤选择器（设置页 / 手机设置 App 共用）
   * 每张卡用皮肤自身色值现绘一个迷你界面缩略图，所见即所得。
   */
  import { uiState, setSkin, SKINS, type SkinId } from "../stores/uiStore.svelte";

  interface Props {
    /** compact：手机设置 App 内的紧凑排布（单列、字号更小） */
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  function pick(id: SkinId): void {
    setSkin(id);
  }
</script>

<div class="skin-grid" class:compact>
  {#each SKINS as s (s.id)}
    {@const on = uiState.skin === s.id}
    <button
      class="skin-card"
      class:on
      onclick={() => pick(s.id)}
      aria-pressed={on}
      title={s.desc}
    >
      <!-- 迷你界面预览：用该皮肤的真实色值现绘 -->
      <div class="preview" style="background:{s.swatch.bg};">
        <div class="pv-bar" style="background:{s.swatch.card};">
          <span class="pv-dot" style="background:{s.swatch.accent};"></span>
          <span class="pv-line" style="background:{s.swatch.text}; opacity:.55;"></span>
        </div>
        <div class="pv-body">
          <div class="pv-card" style="background:{s.swatch.card};">
            <span class="pv-line short" style="background:{s.swatch.text}; opacity:.75;"></span>
            <span class="pv-line" style="background:{s.swatch.text}; opacity:.35;"></span>
          </div>
          <div class="pv-side">
            <span class="pv-chip" style="background:{s.swatch.accent};"></span>
            <span class="pv-chip" style="background:{s.swatch.accent2};"></span>
          </div>
        </div>
      </div>

      <div class="meta">
        <span class="name">
          {s.name}
          {#if on}<span class="check">✓</span>{/if}
        </span>
        <span class="desc">{s.desc}</span>
      </div>
    </button>
  {/each}
</div>

<style>
  .skin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .skin-grid.compact {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .skin-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-main);
    cursor: pointer;
    text-align: left;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .skin-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
    box-shadow: var(--shadow-card);
  }
  .skin-card:focus-visible {
    outline: 2px solid var(--accent-2);
    outline-offset: 2px;
  }
  .skin-card.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent) inset;
  }

  /* ---- 迷你界面缩略图 ---- */
  .preview {
    border-radius: var(--radius-sm);
    overflow: hidden;
    aspect-ratio: 16 / 9;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
  }
  .pv-bar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .pv-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pv-body {
    display: flex;
    gap: 3px;
    flex: 1;
    min-height: 0;
  }
  .pv-card {
    flex: 1;
    border-radius: 3px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    justify-content: center;
  }
  .pv-side {
    width: 22%;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pv-chip {
    flex: 1;
    border-radius: 3px;
  }
  .pv-line {
    height: 3px;
    border-radius: 2px;
    display: block;
    width: 100%;
  }
  .pv-line.short {
    width: 60%;
  }

  /* ---- 文案 ---- */
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .check {
    color: var(--accent);
  }
  .desc {
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-dim);
  }
  .skin-grid.compact .name {
    font-size: 12px;
  }
  .skin-grid.compact .desc {
    display: none;
  }
</style>
