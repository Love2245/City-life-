<script lang="ts">
  import {uiState,setSceneMode} from '../../stores/uiStore.svelte';
  import {HOME_TOUR_RESIDENCES,HOME_FIXED_IDS,homePlanFor,homeAreaSquareMetres,type HomeObjectKind} from '../../game/core/homeInterior';
  import {HOME_FURNITURE,type HomeFurnitureKind} from '../../game/core/homeFurniture';
  import {HOME_ALIASES} from '../../game/core/homeAliases';
  import {homePreviewRoom} from '../../lib/homeRoomState';
  import {homeLightScheme,type HomeLightMode} from '../../game/core/homeLighting';
  import type {WeatherId} from '../../game/types';
  import HomeTourStage from './HomeTourStage.svelte';
  import SceneDisplaySettings from './SceneDisplaySettings.svelte';
  import type {QualityMode} from '../../lib/scenePipeline';
  let quality=$state<QualityMode>('auto');
  let {homeId,onExit}:{homeId:string;onExit:()=>void;preview3d?:boolean}=$props();
  const tourMode=$derived(uiState.sceneMode);
  let selectedHome=$state<string|undefined>(),hour=$state(12),mode=$state<HomeLightMode>('auto'),weather=$state<WeatherId>('sunny');
  let object=$state<HomeObjectKind|null>(null);
  const residence=$derived(HOME_TOUR_RESIDENCES.find(h=>h.id===(selectedHome??homeId))??HOME_TOUR_RESIDENCES[0]);
  const tourOptions=$derived.by(()=>{
    const byName=new Map<string,(typeof HOME_TOUR_RESIDENCES)[number]>();
    for(const home of HOME_TOUR_RESIDENCES)if(!byName.has(home.name)||!HOME_ALIASES[home.id])byName.set(home.name,home);
    byName.set(residence.name,residence);
    return [...byName.values()];
  });
  const plan=$derived(homePlanFor(residence.id));
  const snapshot=$derived(homePreviewRoom(plan,false,hour,mode,weather));
  const lighting=$derived(homeLightScheme(hour,9,weather,mode));
  const objectName=$derived(object?HOME_FURNITURE[object as HomeFurnitureKind]?.name??({door:'玄关',wardrobe:'衣柜',bookshelf:'书柜',storage:'收纳',trash:'垃圾桶'} as Record<string,string>)[object]:'');
</script>
<section class="home-tour" data-home-tour={residence.id} data-tour-mode={tourMode} aria-label="房屋参观">
  {#key residence.id+':'+tourMode}<HomeTourStage {plan} {snapshot} {quality} sceneMode={tourMode} onFallback={()=>setSceneMode('2d')} onChoose={(k)=>object=k}/>{/key}
  <div class="tour-address"><strong>{residence.name}</strong><span>约 {homeAreaSquareMetres(plan)}㎡ · {plan.title}</span></div>
  <div class="tour-exit"><button onclick={onExit}>返回房屋列表</button></div>
  <div class="tour-controls">
    <select aria-label="选择参观住宅" value={residence.id} onchange={(e)=>{selectedHome=e.currentTarget.value;object=null;}}>{#each tourOptions as h}<option value={h.id}>{h.name}</option>{/each}</select>
    <div class="tour-hours" aria-label="参观时段">{#each [{hour:7,name:'清晨'},{hour:12,name:'白天'},{hour:18,name:'傍晚'},{hour:23,name:'深夜'}] as time}<button class:current={hour===time.hour} aria-pressed={hour===time.hour} onclick={()=>hour=time.hour}>{time.name}</button>{/each}</div>
    <button onclick={()=>mode=mode==='auto'?'on':mode==='on'?'off':'auto'}>照明：{mode==='auto'?'自动':mode==='on'?'开灯':'关灯'}</button>
    <select aria-label="参观天气" bind:value={weather}><option value="sunny">晴天</option><option value="cloudy">多云</option><option value="rain">雨天</option><option value="snow">雪天</option></select>
  </div>
  <div class="tour-furnishing"><SceneDisplaySettings home {quality} qualityLabel="住宅画质" onQuality={(mode)=>quality=mode}/></div>
  <div class="tour-note">{lighting.phase} · {lighting.lamps?'室内灯光':'窗边自然光'} · 自由参观</div>
  {#if object}<div class="tour-object-info"><button aria-label="收起物件说明" onclick={()=>object=null}>×</button><strong>{objectName}</strong><span>{HOME_FIXED_IDS.has(residence.id)?'房源固定配套，入住后可使用，陈设由房主提供。':`可在生活中的住处使用${HOME_FURNITURE[object as HomeFurnitureKind]?'、添置与升级':''}。`}</span></div>{/if}
</section>
<style>
  .home-tour{height:100%;width:100%;position:relative;overflow:hidden;color:#f4eddd;font-family:inherit}.tour-address{position:absolute;left:12px;top:12px;display:flex;flex-direction:column;gap:5px;background:#292d2cde;padding:10px 14px;border:1px solid #e6d8b55c;border-radius:8px}.tour-address strong{font-size:17px}.tour-address span{font-size:12px;color:#d2cab6}.tour-exit{position:absolute;right:12px;top:12px}.tour-controls{position:absolute;left:12px;top:88px;display:flex;align-items:center;gap:5px;max-width:calc(100% - 24px);overflow:auto;scrollbar-width:none}.tour-controls>*{flex:none}.home-tour button,.home-tour select{font:inherit;font-size:12px;min-height:38px;padding:9px 11px;border:1px solid #e6d8b55c;border-radius:7px;background:#292d2cde;color:#f3ecd9;cursor:pointer}.tour-hours{display:flex;gap:3px}.home-tour .current{background:#6b6548}.tour-furnishing{position:absolute;right:12px;bottom:12px;display:flex;gap:5px}.tour-note{position:absolute;left:12px;bottom:64px;font-size:11px;color:#fff1d2;text-shadow:0 1px 5px #111}.tour-object-info{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);max-width:300px;background:#fbf2e0f5;color:#3c3428;padding:20px;border-radius:10px;display:flex;flex-direction:column;gap:10px}.tour-object-info span{font-size:12px}.tour-object-info button{position:absolute;right:2px;top:2px;background:none;border:0;color:#66553d;padding:4px;font-size:20px;min-height:24px}
  :global(:root[data-game-mode="mobile"]) .home-tour button,:global(:root[data-game-mode="mobile"]) .home-tour select{font-size:var(--m-fs-md);min-height:var(--m-tap)}:global(:root[data-game-mode="mobile"]) .tour-address strong{font-size:var(--m-fs-lg)}:global(:root[data-game-mode="mobile"]) .tour-address span,:global(:root[data-game-mode="mobile"]) .tour-note{font-size:var(--m-fs-xs)}
  @media(max-width:650px) and (orientation:portrait){.tour-controls{top:100px;flex-wrap:wrap;max-height:135px}.tour-furnishing{bottom:65px}.tour-note{bottom:110px}.tour-address strong{font-size:15px}}
</style>
