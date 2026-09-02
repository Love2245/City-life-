<script lang="ts">
  // 都市生活 v0.991 — 命运：永久加成兑换（多周目核心）
  import { profile, persistProfile, goto } from "../stores/gameStore.svelte";
  import { BOOST_DEFS, buyBoost } from "../game/core/profile";
  import { showToast } from "../stores/uiStore.svelte";

  function onBuy(id: string): void {
    const r = buyBoost(profile, id);
    if (r.ok) {
      void persistProfile();
      showToast("✅ 已兑换永久加成");
    } else {
      showToast(r.reason ?? "兑换失败");
    }
  }
</script>

<div class="fate-root">
  <div class="fate-panel">
    <div class="fate-head">
      <button class="btn" onclick={() => goto("menu")}>← 返回</button>
      <h2 class="fate-title">🔮 命运</h2>
      <div class="fate-points">✦ {profile.fatePoints} 命运点</div>
    </div>
    <p class="fate-hint dim">每达成一次结局，按表现结算命运点；兑换的加成对之后所有存档永久生效。</p>

    <div class="boost-list">
      {#each BOOST_DEFS as b}
        {@const cur = profile.boosts[b.id] ?? 0}
        {@const maxed = b.stackable ? cur >= 3 : cur >= 1}
        {@const price = b.cost * (b.stackable ? cur + 1 : 1)}
        <div class="boost-card">
          <div class="b-icon">{b.icon}</div>
          <div class="b-main">
            <div class="b-name">{b.name}{cur > 0 ? ` · 已购 ×${cur}` : ""}</div>
            <div class="b-desc dim">{b.desc}</div>
          </div>
          <button
            class="btn {maxed ? "" : "btn-primary"}"
            disabled={maxed || profile.fatePoints < price}
            onclick={() => onBuy(b.id)}
          >
            {maxed ? "已满档" : `✦ ${price}`}
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .fate-root {
    height: 100%;
    display: flex;
    justify-content: center;
    padding: 32px 16px;
    background: var(--bg, #11151c);
    overflow: auto;
  }
  .fate-panel {
    width: 520px;
    max-width: 100%;
  }
  .fate-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }
  .fate-title {
    flex: 1;
    font-size: 22px;
    margin: 0;
  }
  .fate-points {
    font-size: 18px;
    color: var(--accent, #5b8cff);
    font-weight: 700;
  }
  .fate-hint {
    font-size: 13px;
    margin-bottom: 16px;
  }
  .boost-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .boost-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--panel, #1e2636);
    border: 1px solid var(--line, #2c3650);
    border-radius: 12px;
    padding: 12px;
  }
  .b-icon {
    font-size: 26px;
  }
  .b-main {
    flex: 1;
  }
  .b-name {
    font-size: 14px;
    font-weight: 600;
  }
  .b-desc {
    font-size: 12px;
  }
</style>
