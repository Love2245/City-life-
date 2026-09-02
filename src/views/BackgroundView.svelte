<script lang="ts">
  import { newGame, goto, pendingState, profile } from "../stores/gameStore.svelte";
  import { validateNewGameSetup } from "../game/core/families";
  import { ITEMS, START_ITEMS, startCostOf, ITEM_POINT_COST } from "../game/core/items";
  import { createInitialState } from "../game/core/state";
  import { applyFamily, applyAllocation } from "../game/core/families";
  import { applyItem } from "../game/core/items";
  import { getMaxStamina } from "../game/core/stats";
  import type { Allocation, GameMode } from "../game/types";
  import { formatMoney } from "../lib/format";

  // v1.0：删除开局家庭选择，普通/永恒模式固定普通家庭；剧情模式走故事设定。
  const FAMILY_ID = "ordinary";

  let step = $state(1); // 1=属性分配，2=确认
  let alloc = $state<Allocation>({ money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 });
  let ownedItems = $state<string[]>([]);
  /** v0.991 模式：普通 / 永恒；剧情模式独立入口（主菜单） */
  let mode = $state<GameMode>(pendingState.mode === "story" ? "normal" : pendingState.mode);

  /** 剩余点数（普通家庭配额 10） */
  const remaining = $derived(10 - (alloc.money + alloc.charm + alloc.stamina + alloc.intelligence + alloc.items));

  /** 分配预览（临时副本计算初始状态，不提交） */
  function preview(): { money: number; maxStamina: number; charm: number; intelligence: number } {
    const s = createInitialState();
    applyFamily(s, FAMILY_ID);
    applyAllocation(s, alloc);
    for (const id of ownedItems) applyItem(s, id);
    return {
      money: s.player.money,
      maxStamina: getMaxStamina(s),
      charm: s.player.stats.charm,
      intelligence: s.player.stats.intelligence,
    };
  }

  const previewState = $derived(preview());

  /** 校验结果 */
  const valid = $derived(validateNewGameSetup(FAMILY_ID, alloc, ownedItems));

  function add(k: keyof Allocation): void {
    if (remaining <= 0) return;
    if (k === "items" && remaining < ITEM_POINT_COST) return;
    alloc = { ...alloc, [k]: alloc[k] + 1 };
  }
  function sub(k: keyof Allocation): void {
    if (alloc[k] <= 0) return;
    alloc = { ...alloc, [k]: alloc[k] - 1 };
  }
  function toggleItem(id: string): void {
    const item = ITEMS.find((x) => x.id === id);
    const cost = startCostOf(item);
    if (ownedItems.includes(id)) {
      ownedItems = ownedItems.filter((x) => x !== id);
      alloc = { ...alloc, items: alloc.items - cost };
    } else if (remaining >= cost) {
      ownedItems = [...ownedItems, id];
      alloc = { ...alloc, items: alloc.items + cost };
    }
  }
  function start(): void {
    if (!valid.ok) return;
    newGame({ familyId: FAMILY_ID, allocation: alloc, ownedItems, mode });
  }

  /** 模式选择项（永恒解锁后可选；剧情模式由主菜单独立入口进入） */
  const modeOptions = $derived([
    { id: "normal" as GameMode, label: "普通模式", desc: "标准都市生活", locked: false },
    { id: "eternal" as GameMode, label: "永恒模式", desc: "达成结局后解锁 · 物价更高 / 救济减半", locked: !profile.unlocked.eternal },
  ]);
</script>

<div class="page">
  <div class="head">
    <button class="btn" onclick={() => goto("menu")}>← 返回</button>
    <div class="title">📜 开局设定</div>
    <span class="step-indicator">第 {step} / 2 步</span>
  </div>

  <!-- v0.991 模式选择：普通默认；永恒解锁后可选 -->
  <div class="mode-bar">
    {#each modeOptions as o}
      <button
        class="mode-chip {mode === o.id ? "on" : ""}"
        disabled={o.locked}
        onclick={() => (mode = o.id)}
        title={o.locked ? "先达成一次结局解锁" : o.desc}
      >
        {o.locked ? "🔒" : o.id === "normal" ? "🌱" : "♾️"}
        {o.label}
      </button>
    {/each}
  </div>

  <div class="content">
    {#if step === 1}
      <!-- 步骤 1：属性分配（普通家庭，10 点） -->
      <p class="hint">
        普通家庭出身 · 共 10 点自由分配 · 剩余
        <b class="remain">{remaining}</b> 点
      </p>

      <div class="alloc-box">
        <div class="alloc-row">
          <div class="a-info">
            <span class="a-icon">💰</span>
            <div>
              <div class="a-name">金钱</div>
              <div class="a-desc dim">每点 +100 元初始资金</div>
            </div>
          </div>
          <div class="ctrl">
            <button class="btn small" onclick={() => sub("money")} disabled={alloc.money <= 0}>−</button>
            <span class="count">{alloc.money}</span>
            <button class="btn small" onclick={() => add("money")} disabled={remaining <= 0}>+</button>
          </div>
        </div>

        <div class="alloc-row">
          <div class="a-info">
            <span class="a-icon">💄</span>
            <div>
              <div class="a-name">魅力</div>
              <div class="a-desc dim">人际关系 / 工作寻求优惠（每点 +3）</div>
            </div>
          </div>
          <div class="ctrl">
            <button class="btn small" onclick={() => sub("charm")} disabled={alloc.charm <= 0}>−</button>
            <span class="count">{alloc.charm}</span>
            <button class="btn small" onclick={() => add("charm")} disabled={remaining <= 0}>+</button>
          </div>
        </div>

        <div class="alloc-row">
          <div class="a-info">
            <span class="a-icon">⚡</span>
            <div>
              <div class="a-name">体力</div>
              <div class="a-desc dim">每点 +5 体力上限（可超 100）</div>
            </div>
          </div>
          <div class="ctrl">
            <button class="btn small" onclick={() => sub("stamina")} disabled={alloc.stamina <= 0}>−</button>
            <span class="count">{alloc.stamina}</span>
            <button class="btn small" onclick={() => add("stamina")} disabled={remaining <= 0}>+</button>
          </div>
        </div>

        <div class="alloc-row">
          <div class="a-info">
            <span class="a-icon">🧠</span>
            <div>
              <div class="a-name">智力</div>
              <div class="a-desc dim">更快学习 / 解锁高级学习（每点 +3）</div>
            </div>
          </div>
          <div class="ctrl">
            <button class="btn small" onclick={() => sub("intelligence")} disabled={alloc.intelligence <= 0}>−</button>
            <span class="count">{alloc.intelligence}</span>
            <button class="btn small" onclick={() => add("intelligence")} disabled={remaining <= 0}>+</button>
          </div>
        </div>
      </div>

      <!-- 物品兑换（起步装备） -->
      <div class="items-box">
        <div class="items-head">
          <span>🎁 起步装备（不同物资点数不同）</span>
          <span class="dim">已投入 {alloc.items} 点</span>
        </div>
        <div class="items-grid">
          {#each START_ITEMS as item}
            {@const cost = startCostOf(item)}
            <button
              class="item-card"
              class:selected={ownedItems.includes(item.id)}
              onclick={() => toggleItem(item.id)}
              disabled={!ownedItems.includes(item.id) && remaining < cost}
            >
              <span class="i-icon">{item.icon}</span>
              <div class="i-info">
                <div class="i-name">{item.name}</div>
                <div class="i-desc dim">{item.desc}</div>
              </div>
              <span class="i-cost">{cost}点</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- 实时预览 -->
      <div class="preview">
        <div class="p-title">📊 开局预览</div>
        <div class="p-grid">
          <span>💰 {formatMoney(previewState.money)}</span>
          <span>⚡ 体力上限 {previewState.maxStamina}</span>
          <span>💄 魅力 {previewState.charm}</span>
          <span>🧠 智力 {previewState.intelligence}</span>
          <span>🎁 物品 {ownedItems.length ? ownedItems.map((i) => ITEMS.find((x) => x.id === i)?.icon ?? "").join(" ") : "无"}</span>
        </div>
      </div>

      <div class="footer">
        <button
          class="btn btn-primary"
          onclick={() => (step = 2)}
          disabled={!valid.ok}
        >下一步：确认 →</button>
      </div>

    {:else}
      <!-- 步骤 2：确认 -->
      <p class="hint">确认你的开局设定</p>
      <div class="confirm-card">
        <div class="c-row">
          <span class="dim">家庭</span>
          <span>🏠 普通家庭</span>
        </div>
        <div class="c-row">
          <span class="dim">初始资金</span>
          <span>💰 {formatMoney(previewState.money)}</span>
        </div>
        <div class="c-row">
          <span class="dim">住房</span>
          <span>政府免费住宿 7 晚</span>
        </div>
        <div class="c-row">
          <span class="dim">属性分配</span>
          <span>💰{alloc.money} 💄{alloc.charm} ⚡{alloc.stamina} 🧠{alloc.intelligence} 🎁{alloc.items}</span>
        </div>
        <div class="c-row">
          <span class="dim">物品</span>
          <span>{ownedItems.length ? ownedItems.map((i) => ITEMS.find((x) => x.id === i)?.name).join("、") : "无"}</span>
        </div>
        <div class="c-row">
          <span class="dim">最终属性</span>
          <span>体力上限 {previewState.maxStamina} · 魅力 {previewState.charm} · 智力 {previewState.intelligence}</span>
        </div>
      </div>

      {#if !valid.ok}
        <div class="warn-box">⚠️ {valid.reason}</div>
      {/if}

      <div class="footer">
        <button class="btn" onclick={() => (step = 1)}>← 上一步</button>
        <button class="btn btn-primary big" onclick={() => start()} disabled={!valid.ok}>
          🌆 开始生活
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .page {
    height: 100%;
    overflow-y: auto;
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-size: 22px;
    font-weight: 700;
  }
  .step-indicator {
    font-size: 13px;
    color: var(--accent);
    font-weight: 700;
  }
  .mode-bar {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin: 14px 0 4px;
    flex-wrap: wrap;
  }
  .mode-chip {
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 20px;
  }
  .mode-chip.on {
    background: var(--accent, #5b8cff);
    border-color: var(--accent, #5b8cff);
    color: #fff;
  }
  .content {
    max-width: 920px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .hint {
    font-size: 13.5px;
    color: var(--text-dim);
    letter-spacing: 1px;
  }
  .remain {
    color: var(--accent);
    font-size: 15px;
  }
  .alloc-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .alloc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 16px;
  }
  .a-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .a-icon {
    font-size: 20px;
  }
  .a-name {
    font-size: 14px;
    font-weight: 700;
  }
  .a-desc {
    font-size: 11.5px;
  }
  .ctrl {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .count {
    font-size: 18px;
    font-weight: 800;
    min-width: 28px;
    text-align: center;
    color: var(--accent);
  }
  .small {
    width: 30px;
    height: 30px;
    padding: 0;
    font-size: 16px;
  }
  .items-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .items-head {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .items-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .item-card {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 10px;
    border-radius: 10px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
  }
  .item-card:hover:not(:disabled) {
    border-color: var(--accent-2);
  }
  .item-card.selected {
    border-color: var(--accent);
    background: rgba(255, 209, 102, 0.08);
  }
  .item-card:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .i-icon {
    font-size: 20px;
  }
  .i-info {
    flex: 1;
    min-width: 0;
  }
  .i-name {
    font-size: 13px;
    font-weight: 700;
  }
  .i-desc {
    font-size: 11px;
  }
  .i-cost {
    font-size: 11px;
    color: var(--accent);
    font-weight: 700;
    white-space: nowrap;
  }
  .preview {
    background: rgba(255, 209, 102, 0.06);
    border: 1px dashed rgba(255, 209, 102, 0.4);
    border-radius: 12px;
    padding: 12px 16px;
  }
  .p-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .p-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 13px;
  }
  .footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 10px 0;
  }
  .big {
    padding: 14px 28px;
    font-size: 16px;
  }
  .confirm-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
  }
  .c-row {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
  }
  .warn-box {
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.4);
    color: var(--danger);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
  }
  .dim {
    opacity: 0.7;
  }
</style>
