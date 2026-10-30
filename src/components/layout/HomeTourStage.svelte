<script lang="ts">
  import {beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {loadingConditions} from '../../lib/sceneLoadingTarget';
  import {topRegionOf} from '../../game/core/regions';
  import {HOME_TOUR_RESIDENCES} from '../../game/core/homeInterior';
  import {onMount} from 'svelte';
  import type {HomeObjectKind,HomePlan} from '../../game/core/homeInterior';
  import type {HomeRoomState,HomeRoomView,HomeRoomLabel} from '../../lib/homeRoomState';
  import {homeReferencePlan,homeReferenceState} from '../../lib/homeReferencePlan';
  import type {QualityMode} from '../../lib/scenePipeline';
  import {HOME_FURNITURE,type HomeFurnitureKind} from '../../game/core/homeFurniture';
  import {uiState,setSceneMode} from '../../stores/uiStore.svelte';
  import SceneViewControls from './SceneViewControls.svelte';
  let {plan,snapshot,onChoose,quality='auto',sceneMode=uiState.sceneMode,onFallback=()=>setSceneMode('2d')}:{plan:HomePlan;snapshot:HomeRoomState;onChoose:(kind:HomeObjectKind)=>void;quality?:QualityMode;sceneMode?:'2d'|'3d';onFallback?:()=>void}=$props();
  let host:HTMLDivElement,view=$state.raw<HomeRoomView>();
  let ready=$state(false),labels=$state<HomeRoomLabel[]>([]),outside=$state(false);
  function toggleExterior(){outside=!outside;if(outside)view?.exterior?.();else view?.focus(plan.size[0]/2,plan.size[1]/2);}
  function label(k:HomeObjectKind){if(k==='computer'&&!snapshot.objects.find(o=>o.kind===k)?.item)return '书桌';return HOME_FURNITURE[k as HomeFurnitureKind]?.name??({door:'玄关',wardrobe:'衣柜',bookshelf:'书柜',storage:'收纳',trash:'垃圾桶'} as Record<string,string>)[k];}
  let destroyed=false,generation=0,loadTask:LoadingHandle|undefined;
  async function start(restart=false){
    const run=++generation,residence=HOME_TOUR_RESIDENCES.find(home=>home.id===plan.residenceId);
    const task=beginSceneLoading({sceneKey:'tour:'+sceneMode+':home:'+(plan.residenceId??plan.id),kind:'3d',regionId:topRegionOf(residence?.region??'downtown')??'downtown',label:residence?.name??'房屋参观',...loadingConditions({time:{hour:snapshot.hour},weather:{id:snapshot.weather}}),retry:()=>{void start(true);},fallback:sceneMode==='3d'?()=>{loadTask?.cancel();onFallback();}:undefined},restart);loadTask=task;
    view?.dispose();view=undefined;ready=false;labels=[];
    try{
      if(!await task.covered||destroyed||run!==generation||!task.active())return;
      host.dataset.sceneLoadingOwner=String(task.id);
      const stillScene=sceneMode==='2d';
      const [factory,visualModule]=stillScene?[await import('../../lib/homeStillView'),undefined]:await Promise.all([import('../../lib/homeRoom3D'),import('../../lib/homeReferenceVisuals')]);
      if(destroyed||run!==generation||!task.active())return;
      const labelUpdate=(v:HomeRoomLabel[])=>{if(!destroyed&&run===generation)labels=v;};
      const room=stillScene?('createHomeStillView'in factory?factory.createHomeStillView(host,homeReferencePlan(plan),labelUpdate,onChoose):undefined):('createHomeRoom'in factory?factory.createHomeRoom(host,homeReferencePlan(plan),labelUpdate,onChoose,undefined,visualModule!.createHomeReferenceVisuals(plan,uiState.gameMode==='pc'?'pc':'mobile',uiState.renderScale)):undefined);
      view=room;ready=!!room;room?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight);room?.setQuality?.(quality,uiState.gameMode==='pc'?'pc':'mobile');room?.update(homeReferenceState(snapshot,plan));
      if(room)await room.ready;
      if(destroyed||run!==generation||!task.active()){room?.dispose();return;}
      task.ready();
    }catch(error){if(!destroyed&&run===generation){view?.dispose();view=undefined;ready=false;task.fail(sceneMode==='3d'?'暂时无法准备3D看房，请重试或切换2D场景。':'暂时无法准备2D看房，请重新载入。');}}
  }
  onMount(()=>{void start();return()=>{destroyed=true;generation++;loadTask?.cancel();view?.dispose();};});
  $effect(()=>view?.update(homeReferenceState(snapshot,plan)));
  $effect(()=>view?.setQuality?.(quality,uiState.gameMode==='pc'?'pc':'mobile'));
  $effect(()=>view?.setResolution?.(uiState.renderScale));
  $effect(()=>view?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight));
</script>
<div class="tour-stage">
  <div class="tour-world" bind:this={host} data-home-drag="pan">
    {#if !ready}<div class="scene-placeholder" role="status">正在准备房屋参观…</div>{/if}
  </div>
  <div class="tour-labels">{#each labels.filter(l=>l.visible) as l (l.kind)}<button style:left={`${l.x}%`} style:top={`${l.y}%`} onclick={()=>onChoose(l.kind)} data-tour-object={l.kind}>{label(l.kind)}</button>{/each}</div>
  <div class="tour-camera"><SceneViewControls onRotate={(angle)=>view?.rotate(angle)} onZoom={sceneMode==='2d'?factor=>view?.zoom(factor):undefined} onReset={sceneMode==='2d'?()=>view?.resetView?.():undefined}/>{#if ready&&sceneMode==='3d'&&uiState.gameMode==='pc'}<button class="exterior-toggle" data-home-exterior aria-pressed={outside} onclick={toggleExterior}>{outside?'回到房间':'看看屋外'}</button>{/if}</div>
</div>
<style>
  .tour-camera{display:flex;align-items:center;gap:6px}:global(:root[data-game-mode="mobile"]) .exterior-toggle{min-height:var(--m-tap,44px)}.exterior-toggle{font:inherit;font-size:12px;padding:8px 11px;min-height:38px;white-space:nowrap;border:1px solid #6668;border-radius:9px;color:#f4f7ff;background:#20283a}
  .tour-stage,.tour-world,.tour-labels{position:absolute;inset:0}.tour-world{touch-action:none;background:#c8b797;cursor:grab}.tour-world :global(canvas){width:100%;height:100%;display:block}.tour-world:active{cursor:grabbing}.tour-labels{pointer-events:none}.tour-labels button{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;background:#f6e5b9ed;border:1px solid #988258;border-radius:7px;color:#3c3325;padding:5px 9px;min-height:28px;cursor:pointer;font:inherit;font-size:11px}.tour-camera{position:absolute;bottom:max(12px,var(--sai-bottom,0px));left:max(12px,var(--sai-left,0px));z-index:4}.scene-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#4c4032}
  :global(:root[data-game-mode="mobile"]) .tour-labels button{min-height:calc(34px / var(--eff-zoom,1));font-size:var(--m-fs-xs,12px)}
</style>
