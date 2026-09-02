<script lang="ts">
  /**
   * v0.92 生存告警横幅。
   * 把饱腹/体力/健康/心情/干净度的负面状态从「侧边栏小数字」提升为
   * 屏幕顶部的分级醒目提示，避免玩家在不知情的情况下被扣血、晕倒或猝死。
   */
  import { fly } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import {
    survivalWarnings,
    isDepressed,
    DEPRESSION_DAYS,
    DEAD_HEALTH_GRACE_DAYS,
  } from "../../game/core/survival";

  const warnings = $derived(survivalWarnings(gameState, 3));

  /** 抑郁与猝死倒计时属于「剧情级」告警，单独置顶 */
  const criticalNotices = $derived.by(() => {
    const list: Array<{ icon: string; text: string }> = [];
    if (isDepressed(gameState)) {
      list.push({ icon: "🫥", text: "你被诊断为抑郁状态，无法上班——去医院心理门诊做治疗" });
    }
    const cd = gameState.player.criticalHealthStreak ?? 0;
    if (cd > 0) {
      const left = Math.max(0, DEAD_HEALTH_GRACE_DAYS - cd + 1);
      list.push({
        icon: "💀",
        text: `健康已归零第 ${cd} 天，剩 ${left} 天抢救时间，再不就医就会猝死`,
      });
    }
    const streak = gameState.player.depressionStreak ?? 0;
    if (!isDepressed(gameState) && streak >= 4) {
      list.push({
        icon: "⚠️",
        text: `心情已连续低迷 ${streak} 天，满 ${DEPRESSION_DAYS} 天将陷入抑郁`,
      });
    }
    return list;
  });

  const visible = $derived(warnings.length > 0 || criticalNotices.length > 0);
</script>

{#if visible}
  <div class="survival-banner hud-scope" transition:fly={{ y: -12, duration: 200 }}>
    {#each criticalNotices as n (n.text)}
      <div class="warn-chip critical">
        <span class="w-icon">{n.icon}</span>
        <span class="w-text">{n.text}</span>
      </div>
    {/each}

    {#each warnings as w (w.key)}
      <div class="warn-chip {w.severity}">
        <span class="w-icon">{w.icon}</span>
        <span class="w-label">{w.label}</span>
        <span class="w-text">{w.text}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .survival-banner {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 55;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    pointer-events: none;
    width: min(720px, 92vw);
  }
  .warn-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.4;
    backdrop-filter: blur(8px);
    border: 1px solid transparent;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    max-width: 100%;
  }
  .w-icon {
    font-size: 15px;
    flex-shrink: 0;
  }
  .w-label {
    flex-shrink: 0;
    opacity: 0.8;
  }
  .w-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 分级配色：均为深底 + 亮字，任何主题下都可读 */
  .warn-chip.warn {
    background: rgba(120, 78, 12, 0.88);
    border-color: rgba(255, 196, 84, 0.55);
    color: #ffe6ae;
    animation: warn-blink 2.6s ease-in-out infinite;
  }
  .warn-chip.danger {
    background: rgba(124, 32, 32, 0.9);
    border-color: rgba(255, 120, 120, 0.6);
    color: #ffd9d9;
    animation: danger-pulse 1.8s ease-out infinite;
  }
  .warn-chip.critical {
    background: rgba(150, 12, 12, 0.94);
    border-color: rgba(255, 90, 90, 0.85);
    color: #fff2f2;
    font-weight: 800;
    animation:
      danger-pulse 1.1s ease-out infinite,
      shake-x 3.2s ease-in-out infinite;
  }
</style>
