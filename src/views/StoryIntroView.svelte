<script lang="ts">
  // v1.395：剧情入口暂时关闭，保留页面文件供后续版本恢复。
  import { goto } from "../stores/gameStore.svelte";
</script>

<div class="intro-root hud-scope">
  <div class="intro-panel">
    <div class="head">
      <span class="badge">🎬 剧情模式暂未开放</span>
      <button class="btn" onclick={() => goto("menu")}>← 主菜单</button>
    </div>
    <div class="card">
      <p>剧情内容将在核心生活循环稳定后重新开放，当前版本请先体验普通模式和永恒模式。</p>
    </div>
  </div>
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
