<script lang="ts">
  import { newGame, goto } from "../stores/gameStore.svelte";
  import { FAMILIES, validateNewGameSetup } from "../game/core/families";
  import { ITEMS, START_ITEMS, startCostOf, ITEM_POINT_COST } from "../game/core/items";
  import { createInitialState } from "../game/core/state";
  import { applyFamily, applyAllocation } from "../game/core/families";
  import { applyItem } from "../game/core/items";
  import { getMaxStamina } from "../game/core/stats";
  import type { Allocation, FamilyConfig } from "../game/types";
  import { formatMoney } from "../lib/format";

  let step = $state(1); // 1=选家庭，2=属性分配，3=确认
  let familyId = $state("ordinary");
  let alloc = $state<Allocation>({ money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 });
  let ownedItems = $state<string[]>([]);

  const family = $derived(FAMILIES.find((f) => f.id === familyId)!);

  /** 剩余点数 */
  const remaining = $derived(
    family.pointQuota - (alloc.money + alloc.charm + alloc.stamina + alloc.intelligence + alloc.items),
  );

  /** 分配预览（临时副本计算初始状态，不提交） */
  function preview(): { money: number; maxStamina: number; charm: number; intelligence: number; flags: string[] } {
    const s = createInitialState();
    applyFamily(s, familyId);
    applyAllocation(s, alloc);
    for (const id of ownedItems) applyItem(s, id);
    return {
      money: s.player.money,
      maxStamina: getMaxStamina(s),
      charm: s.player.stats.charm,
      intelligence: s.player.stats.intelligence,
      flags: Object.keys(s.flags).filter((k) => k.startsWith("item_")),
    };
  }

  const previewState = $derived(preview());

  /** 校验结果 */
  const valid = $derived(validateNewGameSetup(familyId, alloc, ownedItems));

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
  function pickFamily(id: string): void {
    familyId = id;
    // 换家庭后重置分配（配额可能变化）
    alloc = { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 };
    ownedItems = [];
  }
  function start(): void {
    if (!valid.ok) return;
    newGame({ familyId, allocation: alloc, ownedItems });
  }

  function familyTags(f: FamilyConfig): string[] {
    return f.tags ?? [];
  }
</script>

<div class="page">
  <div class="head">
    <button class="btn" onclick={() => goto("menu")}>← 返回</button>
    <div class="title">📜 开局设定</div>
    <span class="step-indicator">第 {step} / 3 步</span>
  </div>

  <div class="content">
    {#if step === 1}
      <!-- 步骤 1：选家庭 -->
      <p class="hint">你的出身决定了起点。家庭条件也是这场游戏的难度</p>
      <div class="family-grid">
        {#each FAMILIES as f}
          <button
            class="family-card"
            class:selected={familyId === f.id}
            onclick={() => pickFamily(f.id)}
          >
            <div class="f-head">
              <span class="f-icon">{f.icon}</span>
              <span class="f-name">{f.name}</span>
            </div>
            <div class="f-desc">{f.desc}</div>
            <div class="f-tags">
              {#each familyTags(f) as t}
                <span class="tag {t.includes("-") || t.includes("寄") ? "cost" : "info"}">{t}</span>
              {/each}
            </div>
          </button>
        {/each}
      </div>
      <div class="footer">
        <button class="btn btn-primary" onclick={() => (step = 2)}>下一步：分配属性 →</button>
      </div>

    {:else if step === 2}
      <!-- 步骤 2：属性分配 -->
      <p class="hint">
        {family.icon} {family.name}家庭 · 共 {family.pointQuota} 点自由分配 · 剩余
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
        <button class="btn" onclick={() => (step = 1)}>← 上一步</button>
        <button
          class="btn btn-primary"
          onclick={() => (step = 3)}
          disabled={!valid.ok}
        >下一步：确认 →</button>
      </div>

    {:else}
      <!-- 步骤 3：确认 -->
      <p class="hint">确认你的开局设定</p>
      <div class="confirm-card">
        <div class="c-row">
          <span class="dim">家庭</span>
          <span>{family.icon} {family.name}家庭 · {family.pointQuota} 点</span>
        </div>
        <div class="c-row">
          <span class="dim">初始资金</span>
          <span>💰 {formatMoney(previewState.money)}</span>
        </div>
        <div class="c-row">
          <span class="dim">月供</span>
          <span>{family.monthlyPayment > 0 ? `每月收 +${family.monthlyPayment} 元` : family.monthlyPayment < 0 ? `每月寄 ${-family.monthlyPayment} 元` : "无"}</span>
        </div>
        <div class="c-row">
          <span class="dim">住房</span>
          <span>{family.freeHousingNights > 0 ? `政府免费住宿 ${family.freeHousingNights} 晚` : "无免费住宿，第一天就要找地方住"}</span>
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
        <button class="btn" onclick={() => (step = 2)}>← 上一步</button>
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
  .family-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }
  .family-card {
    text-align: left;
    padding: 16px;
    border-radius: 14px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.15s ease;
  }
  .family-card:hover {
    border-color: var(--accent-2);
    transform: translateY(-2px);
  }
  .family-card.selected {
    border-color: var(--accent);
    background: rgba(255, 209, 102, 0.08);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .f-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .f-icon {
    font-size: 24px;
  }
  .f-name {
    font-size: 16px;
    font-weight: 700;
  }
  .f-desc {
    font-size: 12.5px;
    color: var(--text-dim);
    line-height: 1.6;
  }
  .f-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: auto;
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
    font-variant-numeric: tabular-nums;
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
    transition: all 0.15s ease;
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
</style>