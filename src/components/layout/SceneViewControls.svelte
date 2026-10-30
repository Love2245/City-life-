<script lang="ts">
  let {label='视角控制',leftLabel='向左旋转90度',rightLabel='向右旋转90度',disabled=false,onRotate,onZoom,onReset}:{label?:string;leftLabel?:string;rightLabel?:string;disabled?:boolean;onRotate:(radians:number)=>void;onZoom?:(factor:number)=>void;onReset?:()=>void}=$props();
</script>
<div class="view-controls" role="group" aria-label={label}>
  <button {disabled} aria-label={leftLabel} title="左转90°" onclick={()=>onRotate(-Math.PI/2)}>↶ 90°</button>
  <button {disabled} aria-label={rightLabel} title="右转90°" onclick={()=>onRotate(Math.PI/2)}>↷ 90°</button>
  {#if onZoom}<button {disabled} aria-label="放大2D画面" onclick={()=>onZoom?.(.8)}>＋</button><button {disabled} aria-label="缩小2D画面" onclick={()=>onZoom?.(1.25)}>－</button>{/if}
  {#if onReset}<button {disabled} aria-label="恢复2D默认视角" onclick={onReset}>复位</button>{/if}
</div>
<style>
  .view-controls{display:flex;gap:6px;align-items:center}
  button{font:inherit;font-size:12px;color:var(--hud-text,#f4f7ff);background:var(--hud-surface-solid,#20283a);border:1px solid var(--hud-border,#6668);border-radius:9px;min-height:38px;min-width:54px;padding:8px 11px;cursor:pointer;white-space:nowrap}
  button:focus-visible{outline:2px solid var(--accent-2,#a7d7f0);outline-offset:2px}button:disabled{opacity:.45;cursor:default}
  :global(:root[data-game-mode="mobile"]) button{min-height:var(--m-tap,44px);font-size:var(--m-fs-md,13px)}
</style>
