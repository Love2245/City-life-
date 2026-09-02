<script lang="ts">
  /**
   * v0.99 人际关系 App（手机第 11 个应用，图标 💞）。
   * 列出所有已结识 NPC 的关系等级 / 好感 / 当前特权，并提供社交互动入口：
   * 打电话 / 送礼 / 约 TA / 借钱 / 表白 / 蹭住。
   * 互动逻辑全部来自 core/romance.ts（纯函数），本组件只负责 UI 与调用 run()。
   */
  import { gameState } from "../stores/gameStore.svelte";
  import type { PhoneResult, SoundId } from "../game/types";
  import {
    dateNpc,
    giftNpc,
    confessNpc,
    crashAtNpc,
    borrowFrom,
    repayLoan,
    callNpc,
    DATE_TIERS,
    socialActionsAvailable,
  } from "../game/core/romance";
  import {
    getNpcDef,
    relationLevel,
    STATE_LABEL,
    relationshipPerk,
    canBorrow,
  } from "../game/core/relationships";
  import { getItem } from "../game/core/items";

  let { run, onBack }: { run: (fn: () => PhoneResult, sound?: SoundId) => void; onBack: () => void } =
    $props();

  let selected = $state<string | null>(null);
  let sub = $state<null | "date" | "gift" | "borrow">(null);
  let borrowAmt = $state(0);

  /** 关系特权键 → 中文标签 */
  const PERK_LABEL: Record<string, string> = {
    borrow: "可借钱周转",
    free_meal: "偶尔蹭顿饭",
    referral_job_construction: "能内推建筑工",
    referral_job_cook_helper: "能内推帮厨",
  };

  /** 关系列表（按好感降序），关联 NPC 定义 */
  const list = $derived(
    gameState.relationships
      .map((r) => {
        const def = getNpcDef(r.npcId);
        return {
          npcId: r.npcId,
          rel: r,
          name: def?.name ?? r.npcId,
          avatar: def?.avatar ?? "🙂",
        };
      })
      .sort((a, b) => b.rel.affinity - a.rel.affinity),
  );

  function open(id: string): void {
    selected = id;
    sub = null;
  }
  function backToList(): void {
    selected = null;
    sub = null;
  }
  function perkText(id: string): string {
    const p = relationshipPerk(id, relationLevel(gameState, id));
    return p ? PERK_LABEL[p] ?? p : "";
  }
  function loanName(): string {
    return (gameState.romance.loanNpc && getNpcDef(gameState.romance.loanNpc)?.name) || "某人";
  }
</script>

<div class="rel-wrap">
  <div class="rel-top">
    <button class="rel-back" onclick={onBack}>← 返回</button>
    <div class="rel-title">💞 人际关系</div>
  </div>

  {#if gameState.player.debt > 0}
    <div class="rel-loan">
      <span>欠款 {gameState.player.debt} 元（来自 {loanName()}）</span>
      <button class="rel-repay" onclick={() => run(() => repayLoan(gameState, gameState.player.debt))}>
        还清
      </button>
    </div>
  {/if}

  {#if selected === null}
    {#if list.length === 0}
      <div class="rel-empty">还没有认识的人。<br />去城里多走走，说不定就偶遇了。</div>
    {:else}
      <div class="rel-list">
        {#each list as r (r.npcId)}
          <button class="rel-row" onclick={() => open(r.npcId)}>
            <span class="rel-avatar">{r.avatar}</span>
            <div class="rel-info">
              <div class="rel-name">
                {r.name}
                <span class="rel-state">{STATE_LABEL[r.rel.state]}</span>
              </div>
              <div class="rel-bar"><span style="width:{Math.max(0, Math.min(100, r.rel.affinity))}%"></span></div>
              <div class="rel-sub">
                好感 {r.rel.affinity}{perkText(r.npcId) ? " · " + perkText(r.npcId) : ""}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    {@const def = getNpcDef(selected)}
    {@const rel = gameState.relationships.find((x) => x.npcId === selected)}
    {@const a = socialActionsAvailable(gameState, selected)}
    <button class="rel-back" onclick={backToList}>← 返回列表</button>
    <div class="rel-hero">
      <span class="rel-avatar big">{def?.avatar ?? "🙂"}</span>
      <div>
        <div class="rel-name big">{def?.name ?? selected}</div>
        <div class="rel-state">{rel ? STATE_LABEL[rel.state] : "点头之交"}</div>
        <div class="rel-sub">好感 {rel?.affinity ?? 0}{perkText(selected) ? " · " + perkText(selected) : ""}</div>
      </div>
    </div>

    {#if sub === null}
      <div class="rel-actions">
        <button onclick={() => run(() => callNpc(gameState, selected))}>📞 打电话</button>
        <button disabled={!a.canGift} onclick={() => { sub = "gift"; }}>🎁 送礼</button>
        <button disabled={!a.canDate} onclick={() => { sub = "date"; }}>🌹 约 TA</button>
        <button disabled={!a.canBorrow} onclick={() => { borrowAmt = canBorrow(gameState, selected).amount; sub = "borrow"; }}>💰 借钱</button>
        <button disabled={!a.canConfess} onclick={() => run(() => confessNpc(gameState, selected))}>💍 表白</button>
        <button disabled={!a.canCrash} onclick={() => run(() => crashAtNpc(gameState, selected))}>🛏️ 蹭住</button>
      </div>
    {:else if sub === "date"}
      <div class="rel-subtitle">选个去处</div>
      <div class="rel-subs">
        {#each DATE_TIERS as t}
          <button
            class="rel-tier"
            onclick={() => { run(() => dateNpc(gameState, selected, t.id)); sub = null; }}
          >
            <span>{t.icon} {t.name}</span>
            <span class="dim">{t.cost > 0 ? "-" + t.cost + "元" : "免费"} · {t.hours}h</span>
          </button>
        {/each}
        <button class="rel-cancel" onclick={() => (sub = null)}>取消</button>
      </div>
    {:else if sub === "gift"}
      <div class="rel-subtitle">选件礼物（来自背包）</div>
      <div class="rel-subs">
        {#if gameState.ownedItems.length === 0}
          <div class="dim">背包空空，先去便利店买点东西。</div>
        {/if}
        {#each gameState.ownedItems as it (it)}
          {@const g = getItem(it)}
          <button class="rel-tier" onclick={() => { run(() => giftNpc(gameState, selected, it)); sub = null; }}>
            <span>{g?.name ?? it}</span>
            <span class="dim">价值 {g?.cost ?? "?"}</span>
          </button>
        {/each}
        <button class="rel-cancel" onclick={() => (sub = null)}>取消</button>
      </div>
    {:else if sub === "borrow"}
      {@const can = canBorrow(gameState, selected)}
      <div class="rel-subtitle">借多少？（上限 {can.amount} 元）</div>
      <div class="rel-subs">
        <input class="rel-input" type="number" min="1" max={can.amount} bind:value={borrowAmt} />
        <button
          class="rel-tier"
          onclick={() => { run(() => borrowFrom(gameState, selected, borrowAmt)); sub = null; }}
        >
          确认借 {borrowAmt} 元
        </button>
        <button class="rel-cancel" onclick={() => (sub = null)}>取消</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .rel-wrap {
    padding: 8px 10px 14px;
    color: #e6e9f0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
  }
  .rel-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rel-title {
    font-weight: 700;
    font-size: 15px;
  }
  .rel-back {
    background: #232a3a;
    color: #cdd3e0;
    border: 1px solid #2f3850;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .rel-loan {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    background: #2a2030;
    border: 1px solid #4a3340;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
  }
  .rel-repay {
    background: #b9546b;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 12px;
  }
  .rel-empty {
    margin-top: 40px;
    text-align: center;
    color: #8b93a7;
    line-height: 1.8;
    font-size: 13px;
  }
  .rel-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rel-row {
    display: flex;
    gap: 10px;
    align-items: center;
    background: #1b2130;
    border: 1px solid #2a3040;
    border-radius: 10px;
    padding: 8px 10px;
    width: 100%;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .rel-row:hover {
    border-color: #3a4460;
    background: #20283a;
  }
  .rel-avatar {
    font-size: 26px;
    flex: 0 0 auto;
  }
  .rel-avatar.big {
    font-size: 40px;
  }
  .rel-info {
    flex: 1 1 auto;
    min-width: 0;
  }
  .rel-name {
    font-weight: 600;
    font-size: 14px;
  }
  .rel-name.big {
    font-size: 17px;
  }
  .rel-state {
    margin-left: 6px;
    font-size: 11px;
    color: #ff8fb0;
    background: #2c2030;
    border-radius: 6px;
    padding: 1px 6px;
  }
  .rel-bar {
    height: 6px;
    background: #2a3040;
    border-radius: 3px;
    overflow: hidden;
    margin: 5px 0 3px;
  }
  .rel-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #ff7eb3, #ff5e8a);
  }
  .rel-sub {
    font-size: 11px;
    color: #8b93a7;
  }
  .rel-hero {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 6px 2px 4px;
  }
  .rel-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 6px;
  }
  .rel-actions button {
    background: #232a3a;
    color: #e6e9f0;
    border: 1px solid #2f3850;
    border-radius: 9px;
    padding: 10px 6px;
    font-size: 13px;
    cursor: pointer;
  }
  .rel-actions button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rel-subtitle {
    font-size: 12px;
    color: #9aa3b8;
    margin: 4px 0 2px;
  }
  .rel-subs {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rel-tier {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #1b2130;
    border: 1px solid #2a3040;
    border-radius: 9px;
    padding: 9px 12px;
    color: #e6e9f0;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .rel-input {
    background: #11161f;
    border: 1px solid #2f3850;
    border-radius: 8px;
    color: #e6e9f0;
    padding: 8px 10px;
    font-size: 14px;
  }
  .rel-cancel {
    background: transparent;
    border: 1px solid #2f3850;
    color: #9aa3b8;
    border-radius: 8px;
    padding: 7px;
    cursor: pointer;
    font-size: 13px;
  }
  .dim {
    color: #76809a;
    font-size: 11px;
  }
</style>
