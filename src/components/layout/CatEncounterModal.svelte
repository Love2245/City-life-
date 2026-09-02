<script lang="ts">
  /**
   * v1.34 公园「猫咪自由锻炼」遭遇战抉择弹窗：
   * 自由锻炼有 50% 概率遭遇普通敌人，玩家可选择「决斗」或「逃跑」。
   * 决斗直接进入战斗界面（战斗状态已由 freeTrainCat → startBattle 建立，casual 模式）；
   * 逃跑调用 fleeCasualBattle 清空战斗状态，无任何损失。
   */
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { fade } from "svelte/transition";
  import { fleeCasualBattle } from "../../game/core/catBattle";
  import { playSound } from "../../lib/audio";

  const payload = $derived(uiState.encounterPayload);

  function close(): void {
    uiState.modal = null;
    uiState.encounterPayload = null;
  }

  /** 决斗：进入战斗界面（casual 战斗，失败无惩罚、胜利随机加属性） */
  function fight(): void {
    if (!payload) return close();
    playSound("battle_intent");
    uiState.encounterPayload = null;
    uiState.modal = "battle";
  }

  /** 逃跑：放弃遭遇，无任何损失 */
  function flee(): void {
    const r = fleeCasualBattle(gameState);
    if (!r.ok) showToast(`🚫 ${r.reason ?? "逃跑失败"}`);
    else showToast("🏃 猫咪撒腿就跑，溜之大吉");
    close();
  }
</script>

{#if payload}
  <div class="overlay hud-scope" onclick={flee} transition:fade={{ duration: 150 }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="m-head">
        <span class="gi-emoji" style="font-size:44px;line-height:1">🐾</span>
        <div>
          <div class="m-title">遭遇野生猫咪！</div>
          <div class="m-sub dim">公园自由锻炼途中，一只来者不善的猫拦住了去路</div>
        </div>
      </div>

      <div class="opp">
        <span class="gi-emoji" style="font-size:52px;line-height:1">{payload.opponentIcon}</span>
        <div class="opp-info">
          <div class="opp-name">{payload.opponentName}</div>
          <div class="opp-tags">
            <span class="tag">Lv.{payload.opponentLevel}</span>
            <span class="tag tier" class:mid={payload.tierLabel === "中级"}>{payload.tierLabel}对手</span>
          </div>
        </div>
      </div>

      <div class="m-hint dim">
        决斗：赢了随机提升一个猫咪属性，输了也不会有任何损失
        <br />
        逃跑：猫咪掉头就跑，相安无事
      </div>

      <div class="opts">
        <button class="opt primary" onclick={fight}>
          <span class="o-icon">⚔️</span>
          <div class="o-info">
            <div class="o-name">应战！</div>
            <div class="o-desc dim">进入对决，赢了属性 + 经验</div>
          </div>
        </button>
        <button class="opt" onclick={flee}>
          <span class="o-icon">🏃</span>
          <div class="o-info">
            <div class="o-name">撒腿就跑</div>
            <div class="o-desc dim">避开这场遭遇，不消耗任何东西</div>
          </div>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 400px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: popIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .m-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .m-title {
    font-size: 17px;
    font-weight: 800;
  }
  .m-sub {
    font-size: 12px;
    margin-top: 2px;
  }
  .opp {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 14px;
    background: linear-gradient(145deg, rgba(255, 209, 102, 0.12), rgba(255, 209, 102, 0.03));
    border: 1px solid rgba(255, 209, 102, 0.3);
    margin-bottom: 12px;
  }
  .opp-name {
    font-size: 16px;
    font-weight: 800;
  }
  .opp-tags {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .tag {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }
  .tag.tier {
    background: rgba(108, 198, 255, 0.15);
    color: #6cc6ff;
  }
  .tag.tier.mid {
    background: rgba(255, 209, 102, 0.18);
    color: #ffd166;
  }
  .m-hint {
    font-size: 12px;
    line-height: 1.7;
    margin-bottom: 14px;
    padding: 0 2px;
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    transition: all 0.15s ease;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .opt.primary {
    border-color: var(--accent);
  }
  .opt:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .opt:active { transform: translateY(0) scale(0.98); }
  .o-icon {
    font-size: 22px;
  }
  .o-name {
    font-size: 14px;
    font-weight: 700;
  }
  .o-desc {
    font-size: 11.5px;
    line-height: 1.5;
  }
  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
