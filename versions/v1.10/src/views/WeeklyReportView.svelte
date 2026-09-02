<script lang="ts">
  // v1.10 周记总结：每周日睡觉后展示本周人际关系/收支/工作/目标缺口
  import { gameState, goto } from "../stores/gameStore.svelte";
  import { formatMoney } from "../lib/format";
  import { npcNick } from "../game/core/npcs";

  const report = $derived(gameState.weekly.report);

  /** 关闭周记：清 pending 后返回游戏 */
  function close(): void {
    gameState.weekly.pending = false;
    gameState.weekly.report = null;
    goto("game");
  }

  const weekLabel = $derived.by(() => {
    const d = gameState.time.day;
    return `${gameState.time.year}年${gameState.time.month}月第${Math.ceil(d / 7)}周`;
  });
</script>

<div class="report-root hud-scope">
  {#if report}
    <div class="report-panel">
      <div class="head">
        <span class="badge">📓 周记 · {weekLabel}</span>
        <button class="btn" onclick={close}>返回游戏 →</button>
      </div>

      <div class="summary">
        <div class="s-card">
          <div class="s-label">💰 收入</div>
          <div class="s-val gain">+{formatMoney(report.earned)}</div>
        </div>
        <div class="s-card">
          <div class="s-label">💸 支出</div>
          <div class="s-val loss">-{formatMoney(report.spent)}</div>
        </div>
        <div class="s-card">
          <div class="s-label">🧾 结余</div>
          <div class="s-val">+{formatMoney(report.earned - report.spent)}</div>
        </div>
        <div class="s-card">
          <div class="s-label">🏢 工作</div>
          <div class="s-val">{report.jobsDone} 次</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">👥 本周人际</div>
        {#if report.interactions.length === 0}
          <p class="dim">这周没怎么跟人打交道……记得多出去走走。</p>
        {:else}
          <ul class="rel-list">
            {#each report.interactions as it}
              <li>
                <span class="rel-name">{npcNick(it.npcId)}</span>
                <span class="rel-bar"><i style="width:{Math.min(100, it.count * 18)}%"></i></span>
                <span class="rel-count">{it.count} 次</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if report.goalGap}
        <div class="card goal">
          <div class="card-title">🎯 目标进度</div>
          <p class="goal-gap">⚠️ {report.goalGap}</p>
        </div>
      {:else if gameState.mode === "story"}
        <div class="card goal">
          <div class="card-title">🎯 目标进度</div>
          <p class="goal-ok">✅ 主线目标已达成（或已寄够），继续保持！</p>
        </div>
      {/if}

      <div class="foot dim">新的一周开始了——下周再见。</div>
    </div>
  {/if}
</div>

<style>
  .report-root {
    position: fixed;
    inset: 0;
    background: linear-gradient(160deg, #101828 0%, #1b2a41 55%, #232f4b 100%);
    color: #e8ecf4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow: auto;
  }
  .report-panel {
    width: min(560px, 96vw);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }
  .badge {
    font-size: 15px;
    font-weight: 700;
    color: #ffd166;
  }
  .btn {
    background: #5b8cff;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover {
    background: #6f9bff;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .s-card {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    padding: 12px 8px;
    text-align: center;
  }
  .s-label {
    font-size: 11px;
    color: #aab6cc;
    margin-bottom: 4px;
  }
  .s-val {
    font-size: 15px;
    font-weight: 700;
  }
  .gain {
    color: #6fe3a0;
  }
  .loss {
    color: #ff8a8a;
  }
  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffe6a8;
    margin-bottom: 10px;
  }
  .dim {
    color: #8a94ab;
    font-size: 12px;
  }
  .rel-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rel-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  }
  .rel-list li:last-child {
    border-bottom: none;
  }
  .rel-name {
    width: 110px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rel-bar {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .rel-bar i {
    display: block;
    height: 100%;
    background: #5b8cff;
    border-radius: 999px;
  }
  .rel-count {
    font-size: 12px;
    color: #aab6cc;
    min-width: 44px;
    text-align: right;
  }
  .goal-gap {
    color: #ffb3b3;
    font-size: 13px;
    margin: 0;
  }
  .goal-ok {
    color: #8fe3b8;
    font-size: 13px;
    margin: 0;
  }
  .foot {
    text-align: center;
    margin-top: 4px;
  }
</style>
