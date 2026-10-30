<script lang="ts">
  import {onMount} from 'svelte';
  import {uiState} from '../../stores/uiStore.svelte';
  import {placeSceneLabels,type SceneNameLabel} from '../../lib/sceneLabels';
  let {labels,venue,selected=null,disabled=false,onChoose}:{labels:SceneNameLabel[];venue:'cafe'|'store';selected?:string|null;disabled?:boolean;onChoose:(id:string)=>void}=$props();
  let host:HTMLDivElement,width=$state(1280),height=$state(720),scale=$state(1);
  const placed=$derived(placeSceneLabels(labels,width*scale,height*scale,uiState.gameMode!=='pc'));
  onMount(()=>{const resize=()=>{width=host.clientWidth||1280;height=host.clientHeight||720;scale=uiState.gameMode==='pe'||uiState.gameMode==='mobile'?Number.parseFloat(getComputedStyle(host).getPropertyValue('--eff-zoom'))||1:1;};resize();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(resize);observer.observe(host);return()=>observer.disconnect();});
</script>
<div class="facility-labels" bind:this={host} aria-label="设施名称">
  {#each placed as label (label.id)}
    <button {disabled} class:chosen={selected===label.id} style:left={`${label.x}%`} style:top={`${label.y}%`}
      data-cafe-facility={venue==='cafe'?label.id:undefined} data-store-facility={venue==='store'?label.id:undefined}
      aria-label={label.title} aria-pressed={selected===label.id} onclick={()=>onChoose(label.id)}>{label.title}</button>
  {/each}
</div>
<style>
  .facility-labels{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden}
  button{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;max-width:150px;padding:4px 8px;min-height:27px;border:1px solid #b6a57dbb;border-radius:7px;color:#4c422e;background:#f6e8c6ed;box-shadow:0 1px 5px #171b1730;font:inherit;font-size:11px;line-height:1.4;white-space:nowrap;cursor:pointer}
  button.chosen,button:hover,button:focus-visible{background:#fff7df;border-color:#fff;outline:1px solid #fff;outline-offset:1px}button:disabled{pointer-events:none}
  :global(:root[data-game-mode="mobile"]) button{min-height:calc(34px / var(--eff-zoom,1));max-width:calc(150px / var(--eff-zoom,1));font-size:var(--m-fs-xs,12px);padding:calc(5px / var(--eff-zoom,1)) calc(8px / var(--eff-zoom,1))}
</style>
