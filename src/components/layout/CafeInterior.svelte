<script lang="ts">
  import {qualityForDevice} from '../../lib/sceneMode';
  import {playInteractionSound} from '../../lib/audio';
  import CharacterAbilities from "../CharacterAbilities.svelte";
  import {beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {sceneLoadingTarget} from '../../lib/sceneLoadingTarget';
  import {canPerform,purchasePriceOf} from '../../game/core/actions';
  import type {ActionDef} from '../../game/types';
  import {formatDuration} from '../../game/core/quests';
  import {isSofaAction} from '../../game/data/interiorActivities';
  import {isCafeFacilityInteractive} from '../../lib/cafeRoom/facilities';
  import {onMount} from 'svelte';
  import type {CafeRoomView} from '../../lib/cafeRoom3D';
  import type {QualityMode} from '../../lib/scenePipeline';
  import {CAFE_FACILITIES,type CafeFacilityId,type CafeFacilitySelection,type CafeWorkOption,type CafePersonOption} from '../../lib/cafeRoom/facilities';
  import {gameState} from '../../stores/gameStore.svelte';
  import {uiState,setSceneMode} from '../../stores/uiStore.svelte';
  import {formatMoney} from '../../lib/format';
  import {formatTime} from '../../game/core/time';
  import {weekdayLabel} from '../../game/core/calendar';
  import {currentWeather} from '../../game/core/weather';
  import {getMaxStamina} from '../../game/core/stats';
  import {unreadSmsCount} from '../../game/core/phone';
  import HomePhonePocket from './HomePhonePocket.svelte';
  import HomeTodoPanel from './HomeTodoPanel.svelte';
  import SaveStatusIndicator from './SaveStatusIndicator.svelte';
  import SceneDisplaySettings from './SceneDisplaySettings.svelte';
  import SceneViewControls from './SceneViewControls.svelte';
  import SceneFacilityLabels from './SceneFacilityLabels.svelte';
  import type {SceneNameLabel} from '../../lib/sceneLabels';
  import NpcTaskCounter from './NpcTaskCounter.svelte';

  let {night,linPresent,linName='窗边的客人',linKnown=false,onNpc,onOrder,orderLabel='点一杯咖啡',orderDisabled=false,orderReason='',onExit=()=>{},exitLabel='出门，回到街道',workOptions=[],onWork=()=>{},activities=[],onActivity=()=>{},people=[],onTalk=()=>{},introduction,onIntroduction}:
    {night:boolean;linPresent:boolean;linName?:string;linKnown?:boolean;onNpc:()=>void;onOrder?:()=>void;orderLabel?:string;orderDisabled?:boolean;orderReason?:string;onExit?:()=>void;exitLabel?:string;workOptions?:CafeWorkOption[];onWork?:(id:string)=>void;activities?:ActionDef[];onActivity?:(action:ActionDef)=>void;people?:CafePersonOption[];onTalk?:(id:string)=>void;introduction?:{title:string;description:string};onIntroduction?:()=>void}=$props();
  let host:HTMLDivElement;
  let view=$state.raw<Pick<CafeRoomView,'ready'|'update'|'selectFacility'|'rotate'|'toggleDoor'|'setQuality'|'setResolution'|'dispose'>>();
  let loading=$state(true),failed=$state(false);
  let selected=$state<CafeFacilitySelection|null>(null),personalOpen=$state(false),statusOpen=$state(uiState.gameMode==='pc');
  let quality=$state<QualityMode>('auto');
  let destroyed=false,generation=0;
  let loadTask:LoadingHandle|undefined;
  let labels=$state<SceneNameLabel[]>([]);
  const weather=$derived(currentWeather(gameState));
  const time=$derived(formatTime(gameState.time.hour,gameState.time.minute));
  const bodyStats=$derived([
    {label:'体力',value:gameState.player.attrs.stamina,max:getMaxStamina(gameState),tone:'#8db7a5'},
    {label:'健康',value:gameState.player.attrs.health,max:100,tone:'#9ab37b'},
    {label:'干净',value:gameState.player.attrs.hygiene,max:100,tone:'#8ebbbd'},
    {label:'心情',value:gameState.player.attrs.mood,max:100,tone:'#b9a4bd'},
    {label:'饱腹',value:gameState.player.attrs.satiety,max:100,tone:'#c6ad77'},
  ]);
  const title=$derived(selected?.id==='lin'?(linKnown?linName:'窗边的客人'):selected?.title??'');
  const popupLeft=$derived(`clamp(14px, calc(${selected?.x??50}% + 20px), calc(100% - var(--cafe-menu-width) - 28px))`);
  const popupTop=$derived(`clamp(86px, calc(${selected?.y??40}% - 24px), calc(100% - 350px))`);

  let doorFeedbackOpen=false;
  function toggleDoor(){if(!view)return;view.toggleDoor();doorFeedbackOpen=!doorFeedbackOpen;playInteractionSound(doorFeedbackOpen?'door_open':'door_close');}
  function onSelect(selection:CafeFacilitySelection|null){const previous=selected?.id;selected=selection&&isCafeFacilityInteractive(selection.id)?selection:null;if(selected&&selected.id!==previous)playInteractionSound(selected.id==='books'?'page':selected.id==='lounge'?'cloth':'mouse');if(selection){personalOpen=false;}}
  async function start(restart=false){
    const task=beginSceneLoading({...sceneLoadingTarget(gameState,uiState.sceneMode),retry:()=>{void start(true);},fallback:uiState.sceneMode==='3d'?()=>{loadTask?.cancel();setSceneMode('2d');}:undefined},restart);loadTask=task;
    const run=++generation;loading=true;failed=false;view?.dispose();view=undefined;selected=null;labels=[];doorFeedbackOpen=false;
    try{
      if(!await task.covered||destroyed||run!==generation||!task.active())return;
      const createCafeRoom=uiState.sceneMode==='3d'?(await import('../../lib/cafeRoom3D')).createCafeRoom:(await import('../../lib/venueStill')).createCafeStill;
      if(destroyed||run!==generation||!task.active())return;
      host.dataset.sceneLoadingOwner=String(task.id);
      const room=createCafeRoom(host,{night,linPresent,weather,quality:qualityForDevice(quality,uiState.gameMode),renderScale:uiState.renderScale,resolution:uiState.renderResolution,onSelect:selection=>{if(!destroyed&&run===generation)onSelect(selection);},onProject:selection=>{if(!destroyed&&run===generation)selected=selection;},onLabels:next=>{if(!destroyed&&run===generation)labels=next;}});
      view=room;await room.ready;
      if(destroyed||run!==generation||!task.active()){room.dispose();return;}
      loading=false;task.ready();
    }catch(error){if(!destroyed&&run===generation){view?.dispose();view=undefined;failed=true;loading=false;task.fail(uiState.sceneMode==='3d'?'暂时无法准备3D店内场景，请重试或切换2D场景。':'暂时无法准备2D店内场景，请重新载入。');console.error('Cafe scene unavailable',error);}}
  }
  onMount(()=>{void start();return()=>{destroyed=true;generation++;loadTask?.cancel();view?.dispose();};});
  $effect(()=>view?.setResolution?.(uiState.renderScale,uiState.renderResolution));
  $effect(()=>view?.setQuality(qualityForDevice(quality,uiState.gameMode)));
  $effect(()=>{view?.update({night,linPresent,weather});});
  $effect(()=>{if(uiState.modal||uiState.npcTalk||uiState.npcTaskPanel)clearOverlays();});
  function clearSelection(){selected=null;view?.selectFacility(null);}
  function clearOverlays(){clearSelection();personalOpen=false;}
  function choose(id:CafeFacilityId){
    if(!isCafeFacilityInteractive(id))return;
    clearOverlays();
    if(view&&!failed)view.selectFacility(id);
    else selected={id,...CAFE_FACILITIES[id],x:52,y:42,visible:true};
  }
  function run(action?:()=>void){if(!action)return;clearOverlays();action();}
  function phone(app:'home'|'todo'|'jobs'='home'){clearOverlays();uiState.phoneStartApp=app;uiState.modal='phone';}
  function personal(){const next=!personalOpen;clearOverlays();personalOpen=next;}
  function keydown(e:KeyboardEvent){if(e.key==='Escape'&&!uiState.modal&&!uiState.npcTalk)clearOverlays();}
</script>

<svelte:window onkeydown={keydown}/>
{#snippet orderOption()}{#if onOrder}<button class="option primary" data-cafe-order disabled={orderDisabled} title={orderReason||undefined} onclick={()=>run(onOrder)}><strong>喝一杯拿铁</strong><small>{orderLabel}</small>{#if orderDisabled&&orderReason}<small>{orderReason}</small>{/if}</button>{/if}{/snippet}
{#snippet workButtons()}
  {#each workOptions as job}<button class="option" data-cafe-job={job.id} disabled={job.disabled} title={job.reason||undefined} onclick={()=>job.requiresHiring?phone('jobs'):run(()=>onWork(job.id))}><strong>{job.requiresHiring?'查看招聘':'上班'} · {job.title}</strong><small>{job.detail}</small>{#if job.reason}<small>{job.reason}</small>{/if}</button>{/each}
{/snippet}
{#snippet activityOption(action:ActionDef)}
  {@const check=canPerform(gameState,action)}
  <button class="option" data-cafe-activity={action.id} disabled={!check.ok} title={check.reason||undefined} onclick={()=>run(()=>onActivity(action))}>
    <strong>{action.name}</strong><small>{action.handler==='buy_food'?('¥ '+formatMoney(purchasePriceOf(gameState,action))+' · 可打包 / 店内用餐'):formatDuration(action.duration)}{#if isSofaAction(action.id)} · 体力 +{action.effects.stamina}{/if}</small>
    <small>{check.ok?action.desc:check.reason}</small>
  </button>
{/snippet}

<section class="cafe-interior" class:night data-cafe-interior data-cafe-fullscreen="true" data-cafe-present={String(linPresent)} aria-label="一隅咖啡店内">
  <div class="cafe-world" bind:this={host} aria-label="咖啡厅场景"></div>
  {#if !loading&&!failed}<SceneFacilityLabels labels={labels.filter(label=>label.id!=='lin'||linPresent).map(label=>label.id==='lin'?{...label,title:linKnown?linName:'窗边的客人'}:label)} venue="cafe" selected={selected?.id} onChoose={(id)=>choose(id as CafeFacilityId)}/>{/if}
  {#if failed}<div class="scene-status failure" role="status"><strong>暂时无法显示店内场景</strong>{#if uiState.sceneMode==='3d'}<span>可以切换到2D场景继续游玩。</span><button onclick={()=>setSceneMode('2d')}>使用2D场景</button>{:else}<span>请重新载入当前2D场景。</span>{/if}<button onclick={()=>void start()}>重新载入场景</button></div>{/if}
  <header class="cafe-snapshot" aria-label="咖啡厅与时间"><div class="address"><span class="address-dot"></span><h2>一隅咖啡</h2><SaveStatusIndicator compact/></div><div class="snapshot-line"><button class="clock" aria-label="打开菜单与存档" title="菜单与存档" onclick={()=>run(()=>uiState.modal='settings')}>{time}</button><span>{gameState.time.month}月{gameState.time.day}日 · {weekdayLabel(gameState.time)}<small>08:00 — 22:00</small></span><b><small>可用资金</small>¥ {formatMoney(gameState.player.money)}</b></div></header>
  <div class="cafe-personal-tools"><button aria-label="咖啡厅随身面板" aria-expanded={personalOpen} onclick={personal}>◌ 随身</button><button data-cafe-exit title={exitLabel} onclick={()=>run(onExit)}>出门 ↗</button>
    {#if personalOpen}<div class="personal-fold" role="group" aria-label="随身工具"><button onclick={()=>phone()}>手机</button><button onclick={()=>run(()=>uiState.modal='inventory')}>背包</button><button onclick={()=>run(()=>uiState.modal='log')}>行动日志</button><button onclick={()=>run(()=>uiState.modal='settings')}>菜单与存档</button></div>{/if}
  </div>
  <div class="cafe-left-stack"><aside class="cafe-status" aria-label="身体状态"><button class="sheet-heading" aria-expanded={statusOpen} onclick={()=>statusOpen=!statusOpen}><strong>身体状态</strong><span>{statusOpen?'收起':'展开'}</span></button>{#if statusOpen}{#each bodyStats as stat}<div class="body-stat" style:--stat-tone={stat.tone}><div>{stat.label}<span>{Math.round(stat.value)} / {stat.max}</span></div><i><b style:width={`${Math.max(0,Math.min(100,stat.value/stat.max*100))}%`}></b></i></div>{/each}{/if}<CharacterAbilities compact /></aside><HomeTodoPanel onOpen={()=>phone('todo')}/></div>
  <HomePhonePocket {time} date={`${gameState.time.month}月${gameState.time.day}日`} balance={gameState.player.money} skin={gameState.phoneSkin} unread={unreadSmsCount(gameState)} expanded={uiState.modal==='phone'} onOpen={()=>phone()}/>

  {#if selected}<aside class="cafe-interaction" data-cafe-selected={selected.id} role="group" aria-label={`${title}操作`} style:left={popupLeft} style:top={popupTop} style:max-height={`calc(100% - ${popupTop} - 84px)`}>
    <header><div><span class="eyebrow">{selected.id==='lin'?'窗边的人':'已选中设施'}</span><h3>{title}</h3></div><button class="close" aria-label="收起设施操作" onclick={clearSelection}>×</button></header>
    <p>{CAFE_FACILITIES[selected.id].description}</p>
    <div class="facility-options">
      {#if selected.id==='counter'}{@render orderOption()}{#each activities.filter(a=>a.handler==='buy_food') as action}{@render activityOption(action)}{/each}<NpcTaskCounter/>
      {:else if selected.id==='coffee'}{@render workButtons()}
        {#if introduction&&onIntroduction}<button class="option" onclick={()=>run(onIntroduction)}><strong>{introduction.title}</strong><small>{introduction.description}</small></button>{/if}
        {#each people.filter(person=>person.id!=='npc_lin_xiaoyu') as person}<button class="option" onclick={()=>run(()=>onTalk(person.id))}>{person.known?`和${person.displayName}交谈`:'向店里的客人搭话'}</button>{/each}
      {:else if selected.id==='lin'}{#if linPresent}<button class="option primary" data-cafe-talk onclick={()=>run(onNpc)}>{linKnown?`和${linName}交谈`:'向窗边的客人搭话'}</button>{/if}
        {#if introduction&&onIntroduction}<button class="option" onclick={()=>run(onIntroduction)}>{introduction.title}</button>{/if}
      {:else if selected.id==='door'}<button class="option primary" data-cafe-leave onclick={()=>run(onExit)}>{exitLabel}</button><button class="option" data-cafe-door onclick={toggleDoor}>推开 / 合上玻璃门</button>
      {:else if selected.id==='books'}{#each activities.filter(a=>a.id.endsWith('_read_magazine')) as action}{@render activityOption(action)}{/each}
      {:else if selected.id==='lounge'}{#each activities.filter(a=>isSofaAction(a.id)) as action}{@render activityOption(action)}{/each}{/if}
    </div>
  </aside>{/if}

  <div class="cafe-view-tools"><SceneViewControls label="咖啡厅视角控制" leftLabel="咖啡厅向左旋转" rightLabel="咖啡厅向右旋转" disabled={loading||!view} onRotate={(angle)=>{clearOverlays();view?.rotate(angle);}} onZoom={uiState.sceneMode==='2d'?factor=>{if(view&&'zoom'in view)(view.zoom as(factor:number)=>void)(factor);}:undefined} onReset={uiState.sceneMode==='2d'?()=>{if(view&&'resetView'in view)(view.resetView as()=>void)();}:undefined}/></div>
  <div class="cafe-find"><SceneDisplaySettings {quality} qualityLabel="咖啡厅画质" onQuality={(mode)=>{quality=mode;view?.setQuality(qualityForDevice(mode,uiState.gameMode));}}/></div>
  {#if !selected&&!loading&&!failed}<p class="interaction-hint">点击设施，选择操作</p>{/if}
</section>

<style>
.cafe-interior{--cafe-menu-width:284px;--cafe-panel:rgba(27,47,39,.93);--cafe-border:#a4ac8a66;--cafe-ink:#f2e9d6;--cafe-muted:#c1c9b9;position:relative;width:100%;height:100%;min-height:0;overflow:hidden;color:var(--cafe-ink);background:#e4e1d6;text-shadow:none;}.cafe-world{position:absolute;inset:0;touch-action:none;}.cafe-world :global(canvas){display:block;width:100%;height:100%;outline:none;cursor:grab;}button{font:inherit;font-size:12px;border:1px solid var(--cafe-border);border-radius:9px;background:var(--cafe-panel);color:var(--cafe-ink);min-height:40px;padding:8px 12px;cursor:pointer;box-sizing:border-box;backdrop-filter:blur(15px);}button:hover:not(:disabled){background:#526746;border-color:#c6b47d;}button:disabled{opacity:.5;cursor:default;}button:focus-visible{outline:2px solid #e6d7ad;outline-offset:3px;}.cafe-snapshot{position:absolute;z-index:4;left:22px;top:22px;width:292px;box-sizing:border-box;padding:15px 17px;background:var(--cafe-panel);border:1px solid var(--cafe-border);border-radius:15px;box-shadow:0 8px 25px #192a2215;backdrop-filter:blur(15px);}.address{display:flex;gap:8px;align-items:center;}.address-dot{width:7px;height:7px;border-radius:50%;background:#d6bf89;}h2{font-size:17px;font-weight:600;letter-spacing:.12em;margin:0;}.address :global(.save-indicator){margin-left:auto;}.snapshot-line{display:flex;align-items:center;gap:13px;margin-top:13px;}.clock{font-size:26px;font-weight:500;letter-spacing:.025em;}.snapshot-line>span{font-size:10px;line-height:1.7;color:var(--cafe-muted);}.snapshot-line small{display:block;font-size:9px;line-height:1.6;color:var(--cafe-muted);}.snapshot-line>b{font-size:14px;font-weight:500;margin-left:auto;white-space:nowrap;}.cafe-personal-tools{position:absolute;z-index:9;right:22px;top:22px;display:flex;gap:7px;}.personal-fold{position:absolute;top:48px;right:0;width:218px;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;background:var(--cafe-panel);border:1px solid var(--cafe-border);border-radius:12px;}.cafe-left-stack{position:absolute;z-index:4;left:22px;top:150px;bottom:90px;width:200px;display:flex;flex-direction:column;gap:10px;overflow:auto;scrollbar-width:thin;pointer-events:none;}.cafe-left-stack>*{pointer-events:auto;}.cafe-status{padding:10px 14px;background:var(--cafe-panel);border:1px solid var(--cafe-border);border-radius:13px;backdrop-filter:blur(15px);flex-shrink:0;}.sheet-heading{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:28px;padding:0;border:0;background:none;}.sheet-heading strong{font-size:12px;font-weight:500;}.sheet-heading span{font-size:10px;color:var(--cafe-muted);}.body-stat{margin-top:10px;font-size:11px;}.body-stat>div{display:flex;justify-content:space-between;}.body-stat span{font-size:10px;color:var(--cafe-muted);}.body-stat>i{display:block;height:3px;border-radius:3px;background:#ffffff1a;margin-top:5px;overflow:hidden;}.body-stat b{display:block;height:100%;background:var(--stat-tone);border-radius:3px;}.interaction-hint{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);margin:0;font-size:11px;color:#eff0e3;text-shadow:0 1px 5px #20362d,0 1px 9px #20362d;pointer-events:none;}.cafe-interaction{position:absolute;z-index:8;width:var(--cafe-menu-width);max-width:calc(100% - 28px);box-sizing:border-box;overflow:auto;scrollbar-width:thin;padding:15px;background:var(--cafe-panel);border:1px solid var(--cafe-border);border-radius:14px;backdrop-filter:blur(17px);box-shadow:0 10px 35px #15221925;}.cafe-interaction>header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;}.eyebrow{font-size:9px;letter-spacing:.12em;color:#d6bd87;}h3{font-size:16px;line-height:1.45;font-weight:500;margin:5px 0 0;}.cafe-interaction .close{border:0;padding:0;min-width:26px;min-height:26px;font-size:20px;background:none;}.cafe-interaction>p{font-size:11px;line-height:1.75;color:var(--cafe-muted);margin:11px 0 14px;}.facility-options{display:grid;gap:7px;}.option{width:100%;text-align:left;min-height:44px;}.option strong,.option small{display:block;}.option strong{font-size:12px;font-weight:500;}.option small{font-size:10px;line-height:1.6;color:var(--cafe-muted);margin-top:5px;}.primary{border-color:#d3be83;background:#9e8b56;color:#fff6de;}.primary small{color:#f3ead3;}.scene-status{position:absolute;z-index:3;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#e4e1d6;color:#31543d;font-size:13px;text-align:center;padding:20px;}.scene-status strong{font-size:19px;font-weight:500;}.scene-status.failure{inset:35% 28%;border-radius:14px;padding:18px;background:#f0ebdfdd;}
  @media(max-height:520px) and (min-width:650px){.cafe-snapshot{top:12px;left:14px;width:284px;padding:10px 13px;}.snapshot-line{margin-top:7px;}.clock{font-size:22px;}.cafe-personal-tools{top:12px;right:14px;}.cafe-left-stack{top:106px;left:14px;bottom:67px;width:185px;}.cafe-interaction{top:76px!important;max-height:calc(100% - 142px)!important;width:270px;}.interaction-hint{bottom:60px;}}
  @media(max-width:700px){.cafe-snapshot{left:12px;top:12px;width:268px;padding:11px 13px;}.cafe-personal-tools{right:12px;top:124px;}.cafe-left-stack{left:12px;top:142px;width:174px;bottom:125px;}.interaction-hint{bottom:115px;}.cafe-interaction{left:12px!important;top:190px!important;max-height:calc(100% - 310px)!important;}}:global(:root[data-game-mode="mobile"]) .cafe-interior{--cafe-menu-width:calc(300px / var(--eff-zoom));}:global(:root[data-game-mode="mobile"]) .cafe-personal-tools button,:global(:root[data-game-mode="mobile"]) .cafe-interaction button{font-size:var(--m-fs-md);min-height:var(--m-tap);}:global(:root[data-game-mode="mobile"]) .cafe-interaction{width:var(--cafe-menu-width);}:global(:root[data-game-mode="mobile"]) .cafe-interaction h3{font-size:var(--m-fs-lg);}:global(:root[data-game-mode="mobile"]) .cafe-interaction>p,:global(:root[data-game-mode="mobile"]) .option small{font-size:var(--m-fs-xs);}:global(:root[data-game-mode="mobile"]) .option strong{font-size:var(--m-fs-md);}:global(:root[data-game-mode="mobile"]) .cafe-interaction .close{min-width:var(--m-tap);}:global(:root[data-game-mode="mobile"]) .personal-fold{top:calc(var(--m-tap) + 8px);width:calc(290px / var(--eff-zoom));}

.cafe-view-tools,.cafe-find{position:absolute;z-index:8;bottom:max(16px,var(--sai-bottom,0px));display:flex;align-items:center;gap:6px;}
.cafe-view-tools{left:max(18px,var(--sai-left,0px));}.cafe-find{right:max(18px,var(--sai-right,0px));}
.interaction-hint{bottom:max(70px,calc(var(--sai-bottom,0px) + 56px));}
@media(max-width:700px),(max-height:520px){.cafe-view-tools,.cafe-find{bottom:max(12px,var(--sai-bottom,0px));}.cafe-view-tools{left:max(12px,var(--sai-left,0px));}.cafe-find{right:max(12px,var(--sai-right,0px));}}
</style>
