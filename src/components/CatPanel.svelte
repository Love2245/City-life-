<script lang="ts">
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { performAction } from "../game/core/actions";
  import { activePetOf, setActivePet, catInventoryList, catCurHp, catMaxHp, catDowned, useCatItem } from "../game/core/catCare";
  import { allCatDefs, getCatDef, hasCat } from "../game/core/cat";
  import { getCardDef } from "../game/core/catBattle";
  import { ensureCardPack, QUALITY_LABEL, type CardQuality } from "../game/core/cardPack";
  import {
    getAccessoryDef,
    ACC_QUALITY_LABEL,
    equipAccessory,
    unequipAccessory,
  } from "../game/core/catAccessory";
  import { playSound } from "../lib/audio";
  import type { CatCardDef, CatAccessoryEffect, PetState } from "../game/types";

  /** v1.38：照顾 / 卡包 / 饰品 / 图鉴 */
  type Tab = "care" | "cards" | "accessory" | "dex";
  let tab = $state<Tab>("care");

  const pets = $derived(gameState.pets);
  const active = $derived(activePetOf(gameState));
  /** v1.39：照顾目标猫——优先携带猫；未携带且在家时可选家里任意一只 */
  let selectedPetUid = $state<string | null>(null);
  const carePet = $derived(active ?? (selectedPetUid ? gameState.pets.find((p) => p.uid === selectedPetUid) : undefined));
  const catDefs = $derived(allCatDefs());
  /** v1.38 P2：携带/送回猫咪仅限在家（home）操作 */
  const atHome = $derived(gameState.locationId === "home");

  const RARITY_LABEL: Record<string, string> = {
    common: "普通",
    rare: "稀有",
    super: "超稀有",
    legend: "传说",
    boss: "Boss",
  };
  const RARITY_CLS: Record<string, string> = {
    common: "r-common",
    rare: "r-rare",
    super: "r-super",
    legend: "r-legend",
    boss: "r-boss",
  };
  const CARE_LABEL: Array<{ key: "satiety" | "mood" | "hygiene"; name: string; icon: string }> = [
    { key: "satiety", name: "饱食", icon: "🍖" },
    { key: "mood", name: "心情", icon: "😊" },
    { key: "hygiene", name: "干净", icon: "🧼" },
  ];

  function close(): void {
    uiState.modal = null;
  }

  function care(actionId: string): void {
    if (!carePet) return;
    const r = performAction(gameState, actionId, { catUid: carePet.uid });
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在做不了这件事"}`);
      return;
    }
    playSound("success");
    showToast(r.result?.verdict ?? "猫咪照顾好了");
  }

  /** v1.39：未携带时选择家里某只猫来照顾（仅在家） */
  function selectCare(uid: string): void {
    selectedPetUid = uid;
    playSound("game");
  }

  /** v1.39：使用特殊用品（生命药剂 / 猫用药水 / 净化剂）作用于当前照顾的猫咪 */
  function useSpecial(itemId: string): void {
    if (!carePet) return;
    const r = useCatItem(gameState, carePet, itemId);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在用不了"}`);
      return;
    }
    playSound("success");
    showToast(r.verdict ?? "使用成功");
  }

  function switchCat(uid: string): void {
    if (!atHome) {
      showToast("🚫 要先回家才能带猫咪出来 / 切换携带");
      return;
    }
    if (setActivePet(gameState, uid)) {
      playSound("success");
    }
  }

  function careBarCls(v: number): string {
    if (v < 30) return "bar-low";
    if (v < 60) return "bar-mid";
    return "bar-ok";
  }

  /** v1.39 卡包：逐张展示（含重复卡），数量与显示完全一致 */
  function packEntries(pet: PetState): Array<{ def: CatCardDef; uid: string }> {
    const out: Array<{ def: CatCardDef; uid: string }> = [];
    for (const e of ensureCardPack(pet)) {
      const def = getCardDef(e.defId);
      if (def) out.push({ def, uid: e.uid });
    }
    return out;
  }

  /** v1.38 拥有的饰品清单（id → 数量），用于「饰品」页 */
  const ownedList = $derived(
    Object.entries(gameState.ownedAccessories)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([id, n]) => ({ def: getAccessoryDef(id), count: n ?? 0 }))
      .filter((x) => x.def),
  );
  const ownedCount = $derived(ownedList.reduce((s, a) => s + a.count, 0));

  /** v1.38 饰品效果文本 */
  function formatEffect(eff: CatAccessoryEffect): string {
    const parts: string[] = [];
    if (eff.startStrength) parts.push(`开局力量 +${eff.startStrength}`);
    if (eff.startBlock) parts.push(`开局格挡 +${eff.startBlock}`);
    if (eff.maxHpPct) parts.push(`生命上限 +${Math.round(eff.maxHpPct * 100)}%`);
    if (eff.drawBonus) parts.push(`开局多抽 ${eff.drawBonus} 张`);
    return parts.length ? parts.join("、") : "无额外效果";
  }

  /** v1.38 佩戴 / 卸下饰品（作用于携带中猫咪） */
  function equip(id: string): void {
    if (!active) return;
    const r = equipAccessory(gameState, active.uid, id);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "无法佩戴"}`);
      return;
    }
    playSound("success");
    showToast(`💍 已佩戴 ${getAccessoryDef(id)?.name ?? ""}`);
  }
  function unequip(): void {
    if (!active) return;
    unequipAccessory(gameState, active.uid);
    playSound("success");
    showToast("已卸下饰品");
  }

  /** v1.38 把携带中的猫咪送回家（外出办事更方便，也避免饿着） */
  function sendHome(): void {
    if (!active) return;
    if (!atHome) {
      showToast("🚫 要先回家才能把猫咪送回去");
      return;
    }
    const name = active.name;
    setActivePet(gameState, undefined);
    playSound("success");
    showToast(`🏠 把「${name}」留在了家里`);
  }
</script>

<div class="overlay hud-scope" onclick={close} transition:fade={{ duration: 150 }}>
  <div class="panel" onclick={(e) => e.stopPropagation()}>
    <div class="panel-head">
      <div class="panel-title">🐱 猫咪</div>
      <button class="panel-close" onclick={close}>✕</button>
    </div>

    <!-- 标签页 -->
    <div class="tabs">
      <button class="tab" class:on={tab === "care"} onclick={() => (tab = "care")}>照顾</button>
      <button class="tab" class:on={tab === "cards"} onclick={() => (tab = "cards")}>卡包</button>
      <button class="tab" class:on={tab === "accessory"} onclick={() => (tab = "accessory")}>饰品</button>
      <button class="tab" class:on={tab === "dex"} onclick={() => (tab = "dex")}>图鉴</button>
    </div>

    {#key tab}
      <div class="tab-body">
      {#if pets.length === 0}
        <div class="empty">
          <div class="empty-icon">🐾</div>
          <div class="empty-text">还没有猫咪</div>
          <div class="empty-sub dim">去商场「宠物用品店」领养一只，或在街头、公园碰碰运气——说不定能遇到一只愿意跟你回家的小猫。</div>
        </div>
      {:else if tab === "care"}
      <!-- v1.39 照顾目标：携带猫优先；未携带且在家时可照顾家里任意一只 -->
      {#if carePet}
        {@const def = getCatDef(carePet.catId)}
        <div class="cat-card">
          <div class="cat-top">
            <span class="cat-icon">{carePet.icon}</span>
            <div class="cat-info">
              <div class="cat-name">
                {carePet.name}
                <span class="rarity {RARITY_CLS[def?.rarity ?? ""]}">{RARITY_LABEL[def?.rarity ?? ""]}</span>
                {#if carePet.uid !== active?.uid}<span class="pet-tag">未携带</span>{/if}
              </div>
              <div class="cat-meta dim">Lv.{carePet.level} · {carePet.personality}</div>
              <div class="exp-row">
                <div class="exp-bar"><div class="exp-fill" style="width:{Math.min(100, carePet.exp)}%"></div></div>
                <span class="exp-text dim">{carePet.exp} EXP</span>
              </div>
            </div>
          </div>

          <div class="care-bars">
            {#each CARE_LABEL as c}
              <div class="care-row">
                <span class="care-icon">{c.icon}</span>
                <span class="care-name">{c.name}</span>
                <div class="care-track">
                  <div class="care-fill {careBarCls(carePet.care[c.key])}" style="width:{carePet.care[c.key]}%"></div>
                </div>
                <span class="care-val">{carePet.care[c.key]}</span>
              </div>
            {/each}
          </div>

          <div class="attrs-row">
            <span class="attr-chip" class:chip-low={catCurHp(carePet) <= 0} class:chip-warn={catCurHp(carePet) > 0 && catCurHp(carePet) < catMaxHp(carePet) * 0.3}>
              ❤️ {catCurHp(carePet)}/{catMaxHp(carePet)}
            </span>
            <span class="attr-chip">⚔️ {carePet.attrs.atk}</span>
            <span class="attr-chip">🛡️ {carePet.attrs.def}</span>
            <span class="attr-chip">💨 {carePet.attrs.spd}</span>
          </div>
          {#if catDowned(carePet)}
            <div class="downed-banner">💀 生命值归零倒下了！去宠物医院「恢复猫咪生命」治疗，或喂生命药剂。</div>
          {:else if catCurHp(carePet) < catMaxHp(carePet) * 0.3}
            <div class="downed-banner warn">⚠️ 生命值很低，注意别让它倒下（每日自动恢复 20%，也可喂猫粮/生命药剂）。</div>
          {/if}
        </div>

        <!-- 日常照顾 -->
        <div class="section-title">日常照顾</div>
        <div class="care-btns">
          <button class="care-btn" onclick={() => care("cat_feed")}>🥫 喂食</button>
          <button class="care-btn" onclick={() => care("cat_clean")}>🛁 洗澡</button>
          <button class="care-btn" onclick={() => care("cat_play")}>🧶 玩耍</button>
          <button class="care-btn home-btn" disabled={!atHome} onclick={sendHome}>🏠 送回家</button>
        </div>

        <!-- v1.38 背包里的猫咪用品（喂食/洗澡/玩耍会自动消耗对应道具） -->
        <div class="section-title">背包里的猫咪用品</div>
        <div class="item-mini-list">
          {#each catInventoryList(gameState) as it}
            <span class="item-chip">
              {it.item.icon} {it.item.name} ×{it.qty}
              {#if it.item.cat === "special"}
                <button class="item-use" onclick={() => useSpecial(it.item.id)}>使用</button>
              {/if}
            </span>
          {:else}
            <span class="dim">暂无，去宠物用品店买点猫粮/玩具吧</span>
          {/each}
        </div>
        <div class="train-tip dim">🍖 点「喂食/洗澡/玩耍」会自动消耗背包里的猫粮 / 玩具 / 清洁用品；生命药剂等特殊用品点「使用」直接生效；长期低数值猫咪会生病。</div>
      {:else if atHome && pets.length > 0}
        <div class="empty">
          <div class="empty-text">当前没有携带猫咪</div>
          <div class="empty-sub dim">选一只家里的猫咪直接照顾（不用先携带），或点下方列表切换携带。</div>
        </div>
        <div class="section-title">选择要照顾的猫咪</div>
        <div class="pet-list">
          {#each pets as p (p.uid)}
            <button class="pet-row" class:active-pet={selectedPetUid === p.uid} onclick={() => selectCare(p.uid)}>
              <span class="pet-icon">{p.icon}</span>
              <span class="pet-name">{p.name}</span>
              <span class="pet-lv dim">Lv.{p.level}</span>
              <span class="pet-tag">照顾</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="empty">
          <div class="empty-text">当前没有携带猫咪</div>
          <div class="empty-sub dim">在下方选择一只猫咪携带外出，才能触发外出事件。</div>
        </div>
      {/if}

      <!-- 猫咪列表 / 切换携带（v1.38 P2：仅在家可切换携带） -->
      {#if atHome}
        <div class="section-title">我的猫咪（点击切换携带）</div>
        <div class="pet-list">
          {#each pets as p (p.uid)}
            <button class="pet-row" class:active-pet={p.uid === active?.uid} onclick={() => switchCat(p.uid)}>
              <span class="pet-icon">{p.icon}</span>
              <span class="pet-name">{p.name}</span>
              <span class="pet-lv dim">Lv.{p.level}</span>
              {#if p.uid === active?.uid}
                <span class="pet-tag">携带中</span>
              {:else}
                <span class="pet-tag dim">点击携带</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="empty">
          <div class="empty-text">携带 / 送回猫咪需先回家</div>
          <div class="empty-sub dim">出门在外不能切换携带的猫咪，回「家」后即可在「我的猫咪」里带它出来或送它回去。</div>
        </div>
      {/if}
    {:else if tab === "cards"}
      {#if !active}
        <div class="empty">
          <div class="empty-text">先携带一只猫咪</div>
          <div class="empty-sub dim">卡包属于当前携带中的猫咪，下方选一只携带即可查看。</div>
        </div>
      {:else}
        {@const pack = packEntries(active)}
        <div class="section-title">🃏 {active.name} 的卡包（共 {pack.length} 张）</div>
        <!-- v1.39 牌组统计：攻击/防御/技能数量一目了然 -->
        <div class="pack-stats">
          <span class="pack-stat atk">⚔️ 攻击 {pack.filter(c => c.def.type === 'attack').length}</span>
          <span class="pack-stat def">🛡️ 防御 {pack.filter(c => c.def.type === 'defend').length}</span>
          <span class="pack-stat skill">✨ 技能 {pack.filter(c => c.def.type === 'skill').length}</span>
        </div>
        <div class="pack-scroll">
          <div class="card-grid">
            {#each pack as c (c.uid)}
              <div class="pack-card q{c.def.quality ?? 0}">
                <div class="pc-head">
                  <span class="pc-icon">{c.def.icon}</span>
                  <span class="pc-name">{c.def.name}</span>
                  <span class="pc-quality">{QUALITY_LABEL[(c.def.quality ?? 0) as CardQuality]}</span>
                </div>
                <div class="pc-cost">💧 {c.def.cost}</div>
                <div class="pc-desc">{c.def.desc}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else if tab === "accessory"}
      {#if !active}
        <div class="empty">
          <div class="empty-text">先携带一只猫咪</div>
          <div class="empty-sub dim">饰品需佩戴在携带中的猫咪身上，先选一只携带。</div>
        </div>
      {:else}
        <div class="section-title">💍 我的饰品（共 {ownedCount} 件）</div>
        {#if ownedList.length === 0}
          <div class="empty-sub dim">还没有饰品。可在宠物用品店购买，或在猫咪争霸赛夺冠时随机获得（档位越高品质越好）。</div>
        {:else}
          <div class="acc-grid">
            {#each ownedList as a (a.def.id)}
              <div class="acc-card q{a.def.quality}" class:equipped={active.accessory === a.def.id}>
                <div class="acc-head">
                  <span class="acc-icon">{a.def.icon}</span>
                  <span class="acc-name">{a.def.name}</span>
                  <span class="acc-q q{a.def.quality}">{ACC_QUALITY_LABEL[a.def.quality]}</span>
                </div>
                <div class="acc-desc">{a.def.desc}</div>
                <div class="acc-eff">✨ {formatEffect(a.def.effect)}</div>
                <div class="acc-foot">
                  <span class="acc-have">持有 ×{a.count}</span>
                  {#if active.accessory === a.def.id}
                    <button class="acc-btn off" onclick={unequip}>卸下</button>
                  {:else}
                    <button class="acc-btn" onclick={() => equip(a.def.id)}>佩戴</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if active.accessory}
          {@const eq = getAccessoryDef(active.accessory)}
          <div class="equipped-note">当前佩戴：{eq?.icon} {eq?.name}（{ACC_QUALITY_LABEL[eq?.quality ?? 0]}）· {formatEffect(eq?.effect ?? {})}</div>
        {/if}
      {/if}
    {:else}
      <!-- 图鉴 -->
      <div class="dex-grid">
        {#each catDefs as def (def.id)}
          {@const owned = hasCat(gameState, def.id)}
          <div class="dex-item" class:locked={!owned}>
            <span class="dex-icon">{owned ? def.icon : "❓"}</span>
            <div class="dex-name">
              {owned ? def.name : "？？？"}
              <span class="rarity {RARITY_CLS[def.rarity]}">{RARITY_LABEL[def.rarity]}</span>
            </div>
            {#if owned}
              <div class="dex-desc dim">{def.desc}</div>
            {:else}
              <div class="dex-desc dim">{def.acquireNote ?? "尚未发现"}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
      </div>
    {/key}
  </div>
</div>

<style>
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
  .panel {
    width: min(92vw, 480px);
    max-height: 82vh;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 18px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    overflow-y: auto;
    /* v1.32 面板入场：淡入 + 轻微上浮缩放 */
    animation: catPanelIn 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes catPanelIn {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  /* v1.32 页签内容切换：淡入上浮 */
  .tab-body {
    animation: catTabIn 0.22s ease;
  }
  @keyframes catTabIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel-title {
    font-size: 18px;
    font-weight: 800;
  }
  .panel-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 13px;
    color: var(--text-dim, #9aa3c7);
    border: 1px solid rgba(255, 255, 255, 0.16);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .panel-close:hover { background: rgba(255, 90, 90, 0.28); color: #ffb0b0; }
  .panel-close:active { transform: scale(0.9); }
  .tabs {
    display: flex;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 4px;
  }
  .tab {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-dim, #9aa3c7);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tab:hover:not(.on) { color: #e0ddf0; background: rgba(255, 255, 255, 0.08); }
  .tab.on {
    background: var(--accent, #ffd166);
    color: #1a1a2e;
  }
  .empty {
    text-align: center;
    padding: 40px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .empty-icon {
    font-size: 46px;
  }
  .empty-text {
    font-size: 16px;
    font-weight: 800;
  }
  .empty-sub {
    font-size: 12.5px;
    line-height: 1.6;
    max-width: 320px;
  }
  .cat-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 14px;
    background: rgba(255, 209, 102, 0.06);
    border: 1px solid rgba(255, 209, 102, 0.25);
  }
  .cat-top {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .cat-icon {
    font-size: 44px;
    line-height: 1;
  }
  .cat-info {
    flex: 1;
    min-width: 0;
  }
  .cat-name {
    font-size: 16px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cat-meta {
    font-size: 12px;
    margin-top: 2px;
  }
  .exp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  .exp-bar {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .exp-fill {
    height: 100%;
    background: var(--accent, #ffd166);
    border-radius: 999px;
  }
  .exp-text {
    font-size: 10.5px;
  }
  .rarity {
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 999px;
  }
  .r-common { background: rgba(160, 170, 200, 0.2); color: #aab3d6; }
  .r-rare { background: rgba(108, 198, 255, 0.2); color: #6cc6ff; }
  .r-super { background: rgba(216, 132, 255, 0.2); color: #d9b3ff; }
  .r-legend { background: rgba(255, 209, 102, 0.22); color: #ffd166; }
  .r-boss { background: rgba(255, 107, 107, 0.22); color: #ff8a7a; }
  .care-bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .care-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .care-icon { font-size: 14px; }
  .care-name { width: 34px; }
  .care-track {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .care-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .bar-ok { background: #7bd88f; }
  .bar-mid { background: #ffd166; }
  .bar-low { background: #ff6b6b; }
  .care-val {
    width: 26px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .attrs-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .attr-chip {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 12px;
    font-weight: 700;
  }
  .attr-chip.chip-warn {
    background: rgba(255, 176, 32, 0.18);
    color: #ffb020;
  }
  .attr-chip.chip-low {
    background: rgba(255, 77, 79, 0.22);
    color: #ff6b6b;
  }
  .downed-banner {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 77, 79, 0.16);
    border: 1px solid rgba(255, 77, 79, 0.4);
    color: #ff8f8f;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.5;
  }
  .downed-banner.warn {
    background: rgba(255, 176, 32, 0.12);
    border-color: rgba(255, 176, 32, 0.35);
    color: #ffc46b;
  }
  .section-title {
    font-size: 13px;
    font-weight: 800;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .train-limit {
    font-size: 11px;
    font-weight: 600;
  }
  .care-btns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .care-btn {
    padding: 10px 0;
    border-radius: 12px;
    background: rgba(123, 216, 143, 0.12);
    border: 1px solid rgba(123, 216, 143, 0.3);
    color: var(--ok, #7bd88f);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .care-btn:hover { background: rgba(123, 216, 143, 0.25); }
  .care-btn:active { transform: scale(0.96); }
  .train-btns {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .train-btn {
    padding: 9px 0;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.3);
    color: var(--accent, #ffd166);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .train-btn:hover { background: rgba(255, 209, 102, 0.22); }
  .pet-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pet-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .pet-row:hover { background: rgba(255, 255, 255, 0.08); }
  .pet-row:active { transform: scale(0.98); }
  .pet-row.active-pet { border-color: rgba(255, 209, 102, 0.5); }
  .pet-icon { font-size: 24px; }
  .pet-name { font-size: 13px; font-weight: 700; flex: 1; text-align: left; }
  .pet-lv { font-size: 12px; }
  .pet-tag {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.2);
    color: var(--accent, #ffd166);
  }
  .pet-tag.dim {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-dim, #9aa3c7);
  }
  .shop-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .shop-group-title {
    font-size: 12.5px;
    font-weight: 800;
    color: var(--text-dim, #9aa3c7);
    margin-top: 4px;
  }
  .shop-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .shop-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .shop-icon { font-size: 28px; flex-shrink: 0; }
  .shop-info { flex: 1; min-width: 0; }
  .shop-name {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tier { font-size: 10.5px; font-weight: 600; }
  .shop-desc {
    font-size: 11px;
    line-height: 1.4;
    margin-top: 2px;
  }
  .shop-foot {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 4px;
  }
  .shop-price { font-size: 12px; font-weight: 700; color: var(--accent, #ffd166); }
  .shop-owned { font-size: 11px; }
  .shop-buy {
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.15);
    color: var(--accent, #ffd166);
    border: 1px solid rgba(255, 209, 102, 0.35);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .shop-buy:hover { background: rgba(255, 209, 102, 0.3); }
  .shop-buy:active { transform: scale(0.95); }
  .dex-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }
  .dex-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: center;
  }
  .dex-item.locked { opacity: 0.75; }
  .dex-icon { font-size: 34px; line-height: 1; }
  .dex-name {
    font-size: 12.5px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dex-desc {
    font-size: 10.5px;
    line-height: 1.5;
  }
  .opp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .opp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  .opp-row:hover { background: rgba(255, 255, 255, 0.08); }
  .opp-row.cleared { opacity: 0.6; }
  .opp-row.boss {
    background: rgba(255, 107, 107, 0.08);
    border-color: rgba(255, 107, 107, 0.3);
  }
  .opp-icon { font-size: 26px; flex-shrink: 0; }
  .opp-info { flex: 1; min-width: 0; }
  .opp-name {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .opp-desc {
    font-size: 10.5px;
    line-height: 1.4;
    margin-top: 2px;
  }
  .elm {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.18);
    color: var(--accent, #ffd166);
  }
  .tag-done {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(123, 216, 143, 0.2);
    color: var(--ok, #7bd88f);
  }
  .opp-reward {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    font-weight: 700;
    text-align: right;
    flex-shrink: 0;
  }
  .dim { color: var(--text-dim, #9aa3c7); }

  /* v1.38 照顾页：送回家 + 背包用品 */
  .home-btn { background: rgba(120, 200, 255, 0.16); color: #bfe6ff; }
  .item-mini-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .item-chip {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid var(--border, #2a3050);
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .item-use {
    border: none;
    border-radius: 999px;
    padding: 2px 8px;
    background: rgba(123, 216, 143, 0.18);
    color: var(--ok, #7bd88f);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .item-use:hover {
    background: rgba(123, 216, 143, 0.32);
  }
  .item-use:active { transform: scale(0.93); }

  /* v1.37 卡包页 */
  .pack-scroll {
    max-height: 44vh;
    overflow-y: auto;
    padding-right: 4px;
  }
  /* v1.39 牌组统计：攻击/防御/技能数量一目了然 */
  .pack-stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pack-stat {
    flex: 1;
    min-width: 80px;
    text-align: center;
    padding: 5px 8px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .pack-stat.atk { color: #ff8a8a; }
  .pack-stat.def { color: #8abfff; }
  .pack-stat.skill { color: #c8a8ff; }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .pack-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border, #2a3050);
    border-left-width: 4px;
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pack-card.q0 { border-left-color: #8a93b8; }
  .pack-card.q1 { border-left-color: #4fd1c5; }
  .pack-card.q2 { border-left-color: #b794f4; }
  .pack-card.q3 { border-left-color: #ffd166; }
  .pc-head { display: flex; align-items: center; gap: 6px; }
  .pc-icon { font-size: 18px; }
  .pc-name { font-weight: 800; font-size: 13px; }
  .pc-quality { margin-left: auto; font-size: 10px; color: var(--text-dim, #9aa3c7); }
  .pc-cost { font-size: 11px; color: #7fd0ff; }
  .pc-desc { font-size: 11px; color: var(--text-dim, #9aa3c7); line-height: 1.35; }

  /* v1.38 饰品页 */
  .acc-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .acc-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border, #2a3050);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .acc-card.q0 { border-top: 3px solid #8a93b8; }
  .acc-card.q1 { border-top: 3px solid #4fd1c5; }
  .acc-card.q2 { border-top: 3px solid #b794f4; }
  .acc-card.q3 { border-top: 3px solid #ffd166; }
  .acc-card.equipped { box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.5); }
  .acc-head { display: flex; align-items: center; gap: 5px; }
  .acc-icon { font-size: 18px; }
  .acc-name { font-weight: 800; font-size: 13px; }
  .acc-q { margin-left: auto; font-size: 10px; padding: 1px 6px; border-radius: 999px; }
  .acc-q.q0 { background: #8a93b8; color: #161a2e; }
  .acc-q.q1 { background: #4fd1c5; color: #161a2e; }
  .acc-q.q2 { background: #b794f4; color: #161a2e; }
  .acc-q.q3 { background: #ffd166; color: #161a2e; }
  .acc-desc { font-size: 11px; color: var(--text-dim, #9aa3c7); }
  .acc-eff { font-size: 11px; color: #ffe3a3; }
  .acc-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
  .acc-have { font-size: 11px; color: var(--text-dim, #9aa3c7); }
  .acc-btn {
    background: var(--accent, #ffd166);
    color: #1a1a2e;
    font-weight: 800;
    font-size: 12px;
    border-radius: 8px;
    padding: 4px 12px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .acc-btn:hover { box-shadow: 0 2px 10px rgba(255, 209, 102, 0.35); transform: translateY(-1px); }
  .acc-btn:active { transform: translateY(0) scale(0.95); }
  .acc-btn.off { background: rgba(255, 255, 255, 0.12); color: var(--text-dim, #9aa3c7); }
  .acc-btn.off:hover { background: rgba(255, 90, 90, 0.25); color: #ffb0b0; }
  .acc-btn.off:active { transform: scale(0.95); }
  .equipped-note {
    margin-top: 8px;
    background: rgba(255, 209, 102, 0.12);
    border: 1px solid rgba(255, 209, 102, 0.4);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
  }
</style>
