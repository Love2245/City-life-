<script lang="ts">
  import DesktopWindowControls from './DesktopWindowControls.svelte';
  import {uiState,isMobileLayout,setRenderScale,setRenderResolution,setHomeWallMode,setHomeLowWallHeight,setSceneMode} from '../stores/uiStore.svelte';
  import {RENDER_RESOLUTIONS,type RenderResolution} from '../lib/renderResolution';
  import {HOME_WALL_OPTIONS,type HomeWallMode} from '../lib/homeWallView';
  import type {QualityMode} from '../lib/scenePipeline';
  import {isMobileGraphics} from '../lib/graphicsDevice';
  const mobileGraphics=isMobileGraphics();
  let {home=false,quality,qualityLabel='场景画质',onQuality}:{home?:boolean;quality?:QualityMode;qualityLabel?:string;onQuality?:(mode:QualityMode)=>void}=$props();
</script>

<div class="display-controls">
  <DesktopWindowControls/>
  <label class="setting-row"><span>场景显示</span><select aria-label="场景显示" value={uiState.sceneMode} onchange={(e)=>setSceneMode(e.currentTarget.value as '3d'|'2d')}><option value="3d">3D 场景</option><option value="2d">2D 场景</option></select></label>
  <p>直接点击设施本体即可互动。电脑左键拖动移动，右键拖动转向，滚轮缩放；2D右键切换固定方向。手机单指移动、双指缩放。2D保留当前家具、人员及雨雪地面。</p>
  {#if uiState.sceneMode==='3d'}
  {#if quality&&onQuality}<label class="setting-row"><span>画质</span><select aria-label={qualityLabel} value={mobileGraphics&&quality==='fine'?'light':quality} onchange={(e)=>onQuality?.(mobileGraphics&&e.currentTarget.value==='fine'?'light':e.currentTarget.value as QualityMode)}><option value="auto">自动画质</option><option value="fine" disabled={mobileGraphics}>PC 精细{mobileGraphics?'（电脑可用）':''}</option><option value="light">移动流畅</option></select></label>{/if}
  {#if mobileGraphics}<p>当前设备使用手机画质保护。切换界面布局不会启用 PC 精细；高清分辨率也会按手机可承受的范围调整。</p>{/if}
  <label class="setting-row"><span>3D 渲染分辨率</span><select aria-label="3D 渲染分辨率模式" value={uiState.renderResolution} onchange={e=>setRenderResolution(e.currentTarget.value as RenderResolution)}>{#each RENDER_RESOLUTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
  <p>只改变 3D 画面清晰度，UI 大小与布局保持不变。原生档跟随屏幕大小和系统像素密度；高清档更耗性能，超出显卡上限时自动限制。2D 照片保持原画质。</p>
  {#if uiState.renderResolution==='auto'}
  <label class="setting-row"><span>自动档分辨率比例 <b>{Math.round(uiState.renderScale*100)}%</b></span>
    <input aria-label="3D 渲染分辨率" type="range" min={isMobileLayout()?0.85:0.5} max="1" step="0.05" value={uiState.renderScale} oninput={(e)=>setRenderScale(Number(e.currentTarget.value))}/>
  </label>
  <div class="resolution-presets" role="group" aria-label="分辨率预设">{#each (isMobileLayout()?[0.85,0.9,1]:[0.5,0.7,0.85,1]) as scale}<button type="button" class:active={uiState.renderScale===scale} aria-pressed={uiState.renderScale===scale} onclick={()=>setRenderScale(scale)}>{Math.round(scale*100)}%</button>{/each}</div>
  <p>移动流畅档保留屏幕可读清晰度，旧的低比例设置也不会把画面压成半宽半高。更高清晰度可选择“屏幕原生 · 100%”。</p>
  {/if}
  {#if home}
    <label class="setting-row"><span>住宅墙体显示</span><select aria-label="住宅墙体显示" value={uiState.homeWallMode} onchange={(e)=>setHomeWallMode(e.currentTarget.value as HomeWallMode)}>{#each HOME_WALL_OPTIONS as wall}<option value={wall.value}>{wall.label}</option>{/each}</select></label>
    <label class="setting-row"><span>低墙保留高度 <b>{Math.round(uiState.homeLowWallHeight*100)} 厘米</b></span>
      <input aria-label="低墙保留高度" type="range" min="0.45" max="1.2" step="0.05" value={uiState.homeLowWallHeight} oninput={(e)=>setHomeLowWallHeight(Number(e.currentTarget.value))}/>
    </label>
    <p>自动降低遮挡视线的墙。</p>
  {/if}
  {/if}
</div>

<style>
  .display-controls{display:flex;flex-direction:column;gap:12px;color:inherit;font-size:13px;line-height:1.6}
  .setting-row{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
  .setting-row span{display:flex;justify-content:space-between;gap:12px;flex:1;white-space:nowrap}.setting-row b{font-variant-numeric:tabular-nums}
  input{width:100%;min-height:26px;accent-color:var(--accent-2,#73b7dc);cursor:pointer}
  select,button{font:inherit;color:inherit;border:1px solid var(--hud-border,#6668);background:var(--hud-surface-solid,#20283a);border-radius:8px;min-height:36px;padding:6px 12px;cursor:pointer}
  .resolution-presets{display:flex;gap:6px}.resolution-presets button{flex:1}.resolution-presets .active{background:var(--accent-2,#73b7dc);color:#122432;border-color:transparent;font-weight:700}
  p{font-size:12px;opacity:.74;margin:0}select{max-width:100%}
  :global(:root[data-game-mode="mobile"]) button,:global(:root[data-game-mode="mobile"]) select{min-height:var(--m-tap)}
  :global(:root[data-game-mode="mobile"]) .display-controls{font-size:var(--m-fs-sm)}
  :global(:root[data-game-mode="mobile"]) p{font-size:var(--m-fs-xs)}
</style>
