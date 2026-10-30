<script lang="ts">
  import {onMount} from 'svelte';
  import {uiState,setSceneMode} from '../../stores/uiStore.svelte';
  import {beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {loadingConditions} from '../../lib/sceneLoadingTarget';
  import {COMPANY_OFFICES,type OfficeSeat} from '../../game/core/companyOffice';
  import {companyStage} from '../../game/core/companyConfig';
  import {topRegionOf} from '../../game/core/regions';
  import SceneViewControls from './SceneViewControls.svelte';
  import type {createCompanyOffice,OfficeLabel} from '../../lib/companyOffice3D';
  import type {createCompanyStill} from '../../lib/companyStillView';
  import type {WeatherId} from '../../game/types';
  import type {QualityMode} from '../../lib/scenePipeline';
  let {stage,hour,weather,quality,sceneMode}:{stage:number;hour:number;weather:WeatherId;quality:QualityMode;sceneMode:'2d'|'3d'}=$props();
  type View=ReturnType<typeof createCompanyOffice>|ReturnType<typeof createCompanyStill>;
  let host:HTMLDivElement,view=$state.raw<View>(),ready=$state(false),labels=$state<OfficeLabel[]>([]),selected=$state<number|null>(null);
  const seats=$derived(COMPANY_OFFICES[stage-1]!.desks.map((_,index):OfficeSeat=>({index,personId:index===0?'founder':'',name:'办公桌 '+(index+1),tier:'mid',status:'参观',present:false,stars:0})));
  let destroyed=false,generation=0,loadTask:LoadingHandle|undefined;
  async function start(restart=false){
    const run=++generation,office=companyStage(stage),task=beginSceneLoading({sceneKey:'tour:'+sceneMode+':office:'+stage,kind:'3d',regionId:topRegionOf(office.region)??'downtown',label:office.name,...loadingConditions({time:{hour},weather:{id:weather}}),retry:()=>{void start(true);},fallback:sceneMode==='3d'?()=>setSceneMode('2d'):undefined},restart);loadTask=task;
    view?.dispose();view=undefined;ready=false;labels=[];
    try{
      if(!await task.covered||destroyed||run!==generation||!task.active())return;host.dataset.sceneLoadingOwner=String(task.id);
      const update=(value:OfficeLabel[])=>{if(!destroyed&&run===generation)labels=value;};
      if(sceneMode==='2d'){const factory=await import('../../lib/companyStillView');if(destroyed||run!==generation)return;view=factory.createCompanyStill(host,stage,update,index=>selected=index,quality,uiState.renderScale);}
      else{const factory=await import('../../lib/companyOffice3D');if(destroyed||run!==generation)return;view=factory.createCompanyOffice(host,stage,update,index=>selected=index,quality,uiState.renderScale);}
      view.update(seats,hour,weather,9);view.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight);const created=view;await created.ready;
      if(destroyed||run!==generation){created.dispose();return;}ready=true;task.ready();
    }catch{if(!destroyed&&run===generation){view?.dispose();view=undefined;task.fail('暂时无法准备办公室参观，请重试或切换场景模式。');}}
  }
  onMount(()=>{void start();return()=>{destroyed=true;generation++;loadTask?.cancel();view?.dispose();};});
  $effect(()=>view?.update(seats,hour,weather,9));$effect(()=>view?.setQuality(quality));$effect(()=>view?.setResolution(uiState.renderScale));$effect(()=>view?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight));
</script>
<div class="stage" data-office-tour-stage={stage}><div class="world" bind:this={host}>{#if !ready}<div role="status">正在准备办公室参观…</div>{/if}</div>
  <div class="labels">{#each labels.filter(l=>l.visible) as label (label.index)}<button style:left={label.x+'%'} style:top={label.y+'%'} onclick={()=>selected=label.index}>{label.index<0?stage===4?'电梯入口':'走廊入口':'办公桌 '+(label.index+1)}</button>{/each}</div>
  <div class="camera"><SceneViewControls onRotate={angle=>view?.rotate(angle)} onReset={sceneMode==='2d'?()=>view?.reset():undefined} onZoom={sceneMode==='2d'?factor=>{if(view&&'zoom'in view)view.zoom(factor);}:undefined}/>{#if sceneMode==='3d'}<button aria-label="复位视角" onclick={()=>view?.reset()}>复位视角</button>{/if}</div>
  {#if selected!==null}<button class="note" onclick={()=>selected=null}>{selected<0?'参观模式：仅查看入口，不进行出行。':'参观模式：仅查看工位，不进行经营。'} ×</button>{/if}
</div>
<style>
  .stage,.world,.labels{position:absolute;inset:0}.world{touch-action:none;background:#c6ceca}.world :global(canvas){display:block;width:100%;height:100%}.world>div{height:100%;display:grid;place-items:center}.labels{pointer-events:none}.labels button{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;font:inherit;font-size:11px;padding:6px 9px;min-height:32px;background:var(--hud-surface-solid,#20283a);color:var(--hud-text,#f4f7ff);border:1px solid var(--hud-border,#667788);border-radius:8px}.camera{display:flex;align-items:center;gap:6px;position:absolute;left:12px;bottom:12px;z-index:4}.note{position:absolute;left:50%;bottom:65px;transform:translateX(-50%);padding:10px 14px;border:1px solid #667788;border-radius:9px;background:#20283a;color:#f4f7ff;font:inherit;font-size:12px;cursor:pointer;max-width:85%}
.camera>button{font:inherit;font-size:12px;min-height:38px;border:1px solid var(--hud-border,#667788);border-radius:8px;padding:8px 11px;background:var(--hud-surface-solid,#20283a);color:inherit;cursor:pointer}
</style>
