<script lang="ts">
  import SceneDisplayControls from '../SceneDisplayControls.svelte';
  import type {QualityMode} from '../../lib/scenePipeline';
  let {home=false,align='end',quality,qualityLabel,onQuality}:{home?:boolean;align?:'start'|'end';quality?:QualityMode;qualityLabel?:string;onQuality?:(mode:QualityMode)=>void}=$props();
  let open=$state(false);
</script>

<svelte:window onkeydown={(e)=>{if(e.key==='Escape')open=false;}}/>
<div class="scene-display" class:align-start={align==='start'}>
  <button type="button" class="display-trigger" aria-expanded={open} onclick={()=>open=!open}>画面设置</button>
  {#if open}
    <div class="display-panel" role="dialog" aria-label="场景画面设置" tabindex="-1">
      <header><strong>画面设置</strong><button type="button" aria-label="关闭画面设置" onclick={()=>open=false}>×</button></header>
      <SceneDisplayControls {home} {quality} {qualityLabel} {onQuality}/>
    </div>
  {/if}
</div>

<style>
  .scene-display{position:relative;flex:none;display:flex;color:var(--hud-text,#f4f7ff)}
  .display-trigger{font:inherit;font-size:12px;color:inherit;background:var(--hud-surface-solid,#20283a);border:1px solid var(--hud-border,#6668);border-radius:8px;min-height:38px;padding:8px 12px;cursor:pointer;white-space:nowrap}
  .display-panel{position:absolute;bottom:calc(100% + 10px);right:0;box-sizing:border-box;width:min(340px,calc(100vw / var(--eff-zoom,1) - 32px));max-height:calc(100svh / var(--eff-zoom,1) - 110px);overflow:auto;padding:18px;border:1px solid var(--hud-border,#6668);border-radius:14px;background:var(--hud-surface-solid,#20283a);box-shadow:0 10px 40px #0005;z-index:15;font-size:13px;line-height:1.6;cursor:default;scrollbar-width:thin}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}header button{font-size:22px;line-height:1;color:inherit;background:none;border:none;width:32px;height:32px;cursor:pointer}
  .align-start .display-panel{right:auto;left:0}
  :global(:root[data-game-mode="mobile"]) .display-trigger{min-height:var(--m-tap);font-size:var(--m-fs-md)}
</style>
