<script lang="ts">
  // v1.0 剧情模式开场：来城之因 → 目标 → 五阶段
  import { gameState, confirmStoryStart, goto } from "../stores/gameStore.svelte";
  import { storyArcDef } from "../stores/gameStore.svelte";

  const arc = $derived(storyArcDef(gameState.story.arc ?? ""));
</script>

<div class="intro-root">
  {#if arc}
    <div class="intro-panel">
      <div class="head">
        <span class="badge">🎬 剧情模式 · {arc.title}</span>
        <button class="btn" onclick={() => goto("menu")}>← 主菜单</button>
      </div>

      <div class="card why">
        <div class="card-title">🌾 来城之因</div>
        <p>{arc.why}</p>
      </div>

      <div class="card goal">
        <div class="card-title">🎯 你的目标</div>
        <p>{arc.goal}</p>
      </div>

      <div class="card stages">
        <div class="card-title">🛤️ 五个阶段</div>
        <ol>
          {#each arc.stages as s, i}
            <li>
              <span class="stage-no">{i + 1}</span>
              {s}
            </li>
          {/each}
        </ol>
      </div>

      <div class="card rules">
        <div class="card-title">📜 规则</div>
        <ul>
          <li>你出身赤贫，是家里唯一的劳动力，家里还有爱赌的家人——每周都有寄钱、躲债、意外。</li>
          <li>意外事项限期处理：屈服 / 砸钱 / 视而不见 / 特殊解法（靠人脉与物品）。</li>
          <li>逾期未决会记失约，失约 3 次或期限到仍未完成目标 → 打道回府。</li>
          <li>做违背良心的事会降低「良心」，影响终局评级与结局。</li>
          <li>完成任务后按目标达成、良心、关系、健康评定结局，可自由选择继续或重开。</li>
        </ul>
      </div>

      <button class="btn btn-primary big" onclick={confirmStoryStart}>🌆 开始这段人生</button>
    </div>
  {:else}
    <div class="intro-panel">
      <p class="dim">故事加载失败，请返回主菜单重试。</p>
      <button class="btn" onclick={() => goto("menu")}>返回</button>
    </div>
  {/if}
</div>

<style>
  .intro-root {
    height: 100%;
    display: flex;
    justify-content: center;
    padding: 28px 16px;
    background: linear-gradient(160deg, #10141d, #1a2030);
    overflow: auto;
  }
  .intro-panel {
    width: 600px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    font-size: 20px;
    font-weight: 800;
    color: var(--accent, #5b8cff);
  }
  .card {
    background: var(--panel, #1e2636);
    border: 1px solid var(--line, #2c3650);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #5b8cff);
    margin-bottom: 6px;
  }
  .why p,
  .goal p {
    font-size: 14px;
    line-height: 1.85;
    margin: 0;
  }
  .stages ol {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stages li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
  }
  .stage-no {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(91, 140, 255, 0.15);
    color: var(--accent, #5b8cff);
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .rules ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
    line-height: 1.6;
  }
  .big {
    padding: 14px;
    font-size: 16px;
  }
  .dim { opacity: 0.7; }
</style>
