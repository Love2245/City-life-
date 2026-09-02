<script lang="ts">
  // v1.0 剧情模式开场：来城之因 → 目标 → 五阶段
  import { gameState, confirmStoryStart, goto } from "../stores/gameStore.svelte";
  import { storyArcDef } from "../stores/gameStore.svelte";

  const arc = $derived(storyArcDef(gameState.story.arc ?? ""));
</script>

<div class="intro-root hud-scope">
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
        <div class="card-title">📜 游戏规则</div>
        <ul>
          <li>你出身赤贫，是家里唯一的劳动力，家里还有爱赌的家人——每周都有寄钱、躲债、意外。</li>
          <li>意外事项限期处理：屈服 / 砸钱 / 视而不见 / 特殊解法（靠人脉与物品）。</li>
          <li>逾期未决会记失约，失约 3 次或期限到仍未完成目标 → 打道回府。</li>
          <li>做违背良心的事会降低「良心」，影响终局评级与结局。</li>
          <li>完成任务后按目标达成、良心、关系、健康评定结局，可自由选择继续或重开。</li>
        </ul>
      </div>

      <div class="card flow">
        <div class="card-title">🔄 游戏流程（怎么玩）</div>
        <ol class="flow-list">
          <li><b>每 5~9 天</b>会来一张「人情债」（意外事项）：限期几天内处理，打开手机【人情债】查看详情。</li>
          <li>每个事项有 2~4 种解法：<span class="k-yield">屈从</span> / <span class="k-money">砸钱</span> / <span class="k-ignore">视而不见</span> / <span class="k-special">特殊解法</span>（靠好感、物品、技能）。</li>
          <li>主线目标分阶段推进：手机任务栏会显示<b>当前阶段、目标进度、下次来事的倒计时</b>，跟着指引走即可。</li>
          <li>需要<span class="hl">寄钱回家</span>的目标，赚到钱后在手机任务栏点「寄钱回家」即可推进。</li>
          <li>平时照常打工赚钱、学技能、交朋友——认识的朋友越多，特殊解法的路越宽。</li>
          <li><b>失约 3 次</b>或<b>一年期限到</b>仍未达成目标 → 进入终局判定。</li>
        </ol>
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
  /* v1.01 对比度修复：本页固定「深底浅字」，不随昼夜主题翻转，
     正文显式浅色 + 文字阴影，杜绝白天主题下文字与底纹同色不可读。 */
  .intro-root {
    height: 100%;
    display: flex;
    justify-content: center;
    padding: 28px 16px;
    background: linear-gradient(160deg, #10141d, #1a2030);
    overflow: auto;
    color: #f4f7ff;
    --text-main: #f4f7ff;
    --text-dim: rgba(226, 233, 250, 0.78);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
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
    color: var(--accent, #ffd166);
  }
  .card {
    /* v1.01：显式深色卡片底，不再依赖未定义的 --panel 变量 */
    background: rgba(22, 27, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    margin-bottom: 6px;
  }
  .why p,
  .goal p {
    font-size: 14px;
    line-height: 1.85;
    margin: 0;
    color: #f4f7ff;
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
    color: #f4f7ff;
  }
  .stage-no {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 209, 102, 0.18);
    color: #ffd166;
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
    color: #f4f7ff;
  }
  /* v1.01：游戏流程指引卡 */
  .flow-list {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 12.8px;
    line-height: 1.65;
    color: #f4f7ff;
  }
  .flow-list b {
    color: #ffe08a;
  }
  .hl {
    color: #ffd166;
    font-weight: 700;
  }
  .k-yield { color: #ff8a7a; }
  .k-money { color: #ffc46a; }
  .k-ignore { color: #a8b2d6; }
  .k-special { color: #7ee0a0; }
  .big {
    padding: 14px;
    font-size: 16px;
  }
  .dim { opacity: 0.7; }
</style>
