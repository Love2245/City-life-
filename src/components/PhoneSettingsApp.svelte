<script lang="ts">
  import { GAME_NAME, VERSION, REVISION, CHANGELOG } from "../version";
  import type { DifficultyTier } from "../game/core/minigame";
  import SceneDisplayControls from './SceneDisplayControls.svelte';
  import MobileDisplayControls from './MobileDisplayControls.svelte';
  import {isMobileLayout} from '../stores/uiStore.svelte';

  let showAllChangelog = $state(false);

  let {
    zoom = 1,
    muted = false,
    phoneSfxVol = 100,
    phoneBgmVol = 100,
    difficulty = "normal",
    resetting = false,
    onBack = () => {},
    onMute = () => {},
    onPhoneSfxVol = () => {},
    onPhoneBgmVol = () => {},
    onDifficulty = () => {},
    onZoom = () => {},
    onReset = async () => {},
  }: {
    zoom?: number;
    muted?: boolean;
    phoneSfxVol?: number;
    phoneBgmVol?: number;
    difficulty?: DifficultyTier;
    resetting?: boolean;
    onBack?: () => void;
    onMute?: () => void;
    onPhoneSfxVol?: (value: number) => void;
    onPhoneBgmVol?: (value: number) => void;
    onDifficulty?: (value: DifficultyTier) => void;
    onZoom?: (value: number) => void;
    onReset?: () => void | Promise<void>;
  } = $props();
</script>

<div class="settings-page phone-settings-page">
  <button class="back" onclick={onBack}>← 返回</button>
  <div class="page-title">⚙️ 设置</div>

  <div class="set-card">
    <div class="set-row">
      <span class="set-label">🔊 音效</span>
      <button class="switch" class:on={!muted} onclick={onMute} aria-label="切换音效开关">
        <span class="switch-state">{muted ? "关" : "开"}</span>
        <span class="knob"></span>
      </button>
    </div>
    <div class="set-row">
      <span class="set-label">🔊 音效音量 {phoneSfxVol}%</span>
    </div>
    <input type="range" min="0" max="100" value={phoneSfxVol} oninput={(e) => onPhoneSfxVol(parseInt(e.currentTarget.value, 10))} class="zoom-slider" />
    <div class="set-row">
      <span class="set-label">🎵 音乐音量 {phoneBgmVol}%</span>
    </div>
    <input type="range" min="0" max="100" value={phoneBgmVol} oninput={(e) => onPhoneBgmVol(parseInt(e.currentTarget.value, 10))} class="zoom-slider" />
  </div>

  <div class="set-card">
    <label class="difficulty-row">
      <span class="set-label">🎮 小游戏难度</span>
      <select value={difficulty} onchange={(e) => onDifficulty(e.currentTarget.value as DifficultyTier)}>
        <option value="easy">宽松</option>
        <option value="normal">标准</option>
        <option value="hard">挑战</option>
      </select>
    </label>
    <p class="dim">宽松时限更长、容错更多；挑战时限更短、节奏判定更严格。</p>
  </div>

  <div class="set-card">
    <div class="set-row">
      <span class="set-label">🔍 UI 缩放</span>
      <span class="dim" style="font-size:11px;">{Math.round(zoom * 100)}%</span>
    </div>
    <input
      type="range"
      min="0.5" max="1.5" step="0.1"
      value={zoom}
      oninput={(e) => onZoom(parseFloat(e.currentTarget.value))}
      class="zoom-slider"
    />
    <div class="zoom-marks"><span>50%</span><span>100%</span><span>150%</span></div>
  </div>

  {#if isMobileLayout()}<div class="set-card"><MobileDisplayControls/></div>{/if}
  <div class="set-card">
    <div class="h2">场景与画面</div>
    <SceneDisplayControls home/>
  </div>

  <div class="set-card">
    <div class="h2">关于</div>
    <p class="dim">{GAME_NAME} v{VERSION}</p>
    <p class="dim">更新批次：{REVISION}</p>
  </div>

  <div class="set-card">
    <div class="h2">更新日志</div>
    <div class="changelog">
      {#each (showAllChangelog ? CHANGELOG : CHANGELOG.slice(0, 3)) as entry (entry.version)}
        <div class="cl-entry">
          <div class="cl-head">
            <span class="cl-ver">v{entry.version}</span>
            <span class="cl-date">{entry.date}</span>
            <span class="cl-title">{entry.title}</span>
          </div>
          <ul class="cl-notes">
            {#each entry.notes as note}<li>{note}</li>{/each}
          </ul>
        </div>
      {/each}
    </div>
    {#if CHANGELOG.length > 3}
      <button class="changelog-toggle" aria-expanded={showAllChangelog} onclick={() => (showAllChangelog = !showAllChangelog)}>
        {showAllChangelog ? "收起历史更新" : `展开历史更新（其余 ${CHANGELOG.length - 3} 条）`}
        <span aria-hidden="true">{showAllChangelog ? "⌃" : "⌄"}</span>
      </button>
    {/if}
  </div>

  <div class="set-card danger-zone">
    <div class="h2">危险操作</div>
    <p class="dim">删除全部存档（3 个手动槽 + 自动槽）</p>
    <button class="btn btn-danger" onclick={onReset} disabled={resetting}>
      {resetting ? "删除中…" : "🗑️ 重置所有存档"}
    </button>
  </div>
</div>

<style>
  .phone-settings-page {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--text-main);
  }
  .back {
    align-self: flex-start;
    font-size: 13px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
  }
  .back:active { transform: scale(0.95); }
  .page-title { font-size: 16px; font-weight: 700; color: var(--text-main); }
  .set-card {
    padding: 13px 14px;
    border-radius: 14px;
    background: var(--glass);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
  }
  .set-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .difficulty-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .difficulty-row select { min-height: 36px; max-width: 130px; padding: 5px 9px; border: 1px solid var(--stroke); border-radius: 9px; background: var(--tint); color: var(--text-main); font: inherit; font-size: 12px; }
  .set-label { font-size: 12px; font-weight: 600; }
  .switch {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 56px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-main) 14%, transparent);
    color: var(--text-dim);
    font-size: 10px;
    cursor: pointer;
  }
  .switch.on { background: color-mix(in srgb, var(--accent) 65%, transparent); color: #241b08; justify-content: flex-start; }
  .knob {
    position: absolute;
    left: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
    transition: transform 0.16s ease;
  }
  .switch.on .knob { transform: translateX(28px); }
  .switch-state { line-height: 1; }
  .zoom-slider {
    width: 100%;
    margin: 6px 0 4px;
    accent-color: var(--accent, #ffd166);
    height: 6px;
  }
  .zoom-marks { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); }
  .h2 { font-size: 13px; font-weight: 700; margin-bottom: 7px; }
  .set-card p { margin: 5px 0 0; font-size: 11px; line-height: 1.5; }
  .changelog { display: flex; flex-direction: column; gap: 10px; }
  .cl-entry { padding: 8px 0; border-top: 1px solid var(--stroke); }
  .cl-entry:first-child { border-top: 0; padding-top: 0; }
  .cl-head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
  .cl-ver { color: var(--accent); font-size: 12px; font-weight: 700; }
  .cl-date { color: var(--text-dim); font-size: 10px; }
  .cl-title { font-size: 11.5px; font-weight: 600; }
  .cl-notes { margin: 5px 0 0; padding-left: 17px; color: var(--text-dim); font-size: 10.5px; line-height: 1.55; }
  .changelog-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 7px;
    padding: 8px 10px;
    border: 1px solid var(--stroke);
    border-radius: 9px;
    background: var(--tint);
    color: var(--text-main);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .danger-zone { border-color: color-mix(in srgb, var(--danger, #ff6b6b) 35%, var(--stroke)); }
  .btn-danger {
    margin-top: 7px;
    padding: 9px 12px;
    border: 1px solid color-mix(in srgb, var(--danger, #ff6b6b) 45%, transparent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--danger, #ff6b6b) 12%, transparent);
    color: var(--danger, #ff8f8f);
    cursor: pointer;
  }
  .btn-danger:disabled { opacity: 0.55; cursor: wait; }
</style>
