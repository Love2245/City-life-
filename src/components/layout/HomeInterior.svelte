<script lang="ts">
  import CharacterAbilities from "../CharacterAbilities.svelte";
  import {beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {sceneLoadingTarget} from '../../lib/sceneLoadingTarget';
  import {onMount} from 'svelte';
  import type {ActionDef} from '../../game/types';
  import {showCityTip} from '../../lib/cityTips';
  import {gameState} from '../../stores/gameStore.svelte';
  import {uiState,setSceneMode,showToast,showResult} from '../../stores/uiStore.svelte';
  import {currentHomeSceneId,canCustomizeCurrentHome,homePlanFor,rearrangeHomeObject,type HomeObjectKind} from '../../game/core/homeInterior';
  import {HOME_FURNITURE,HOME_KINDS,homeFurnitureKind,homeItemName,bestHomeItem,type HomeFurnitureKind} from '../../game/core/homeFurniture';
  import {homeObjects} from '../../lib/homeScene';
  import {homeRoomState,type HomeRoomView,type HomeRoomLabel} from '../../lib/homeRoomState';
  import {homeReferencePlan,homeReferenceState} from '../../lib/homeReferencePlan';
  import type {QualityMode} from '../../lib/scenePipeline';
  import SceneDisplaySettings from './SceneDisplaySettings.svelte';
  import SceneViewControls from './SceneViewControls.svelte';
  import {homeResidenceName,canSleepHere} from '../../game/core/housing';
  import {canPerform,napWindowOpen} from '../../game/core/actions';
  import {homeOffers,homePurchaseQuote,purchaseHomeFurniture} from '../../game/core/homePurchase';
  import {syncAutoHomeEquipment} from '../../game/core/equipment';
  import {availableCatsOf} from '../../game/core/catCare';
  import {formatMoney} from '../../lib/format';
  import {currentWeather,WEATHER_LABEL} from '../../game/core/weather';
  import {hasLaptop} from '../../game/core/projects';
  import {formatTime,sleep,nap,naturalWakeHours,alarmCappedHours} from '../../game/core/time';
  import {residenceSleepHours} from '../../game/core/residence';
  import {getMaxStamina} from '../../game/core/stats';
  import {canUseCookingWorkbench} from '../../game/core/cooking';
  import {homeLightMode,homeLightScheme,setHomeLightMode} from '../../game/core/homeLighting';
  import {playSound,playInteractionSound} from '../../lib/audio';
  import {homeObjectSound} from '../../lib/interactionSoundRouting';
  import {toastNewNotices} from '../../lib/notices';
  import SleepModal from './SleepModal.svelte';
  import HomeTodoPanel from './HomeTodoPanel.svelte';
  import HomePhonePocket from './HomePhonePocket.svelte';
  import HomeDecorPanel from './HomeDecorPanel.svelte';
  import {unreadSmsCount} from '../../game/core/phone';
  import {weekdayLabel} from '../../game/core/calendar';
  import SaveStatusIndicator from './SaveStatusIndicator.svelte';
  import {cityHotelGuest} from '../../game/core/cityHotels';
  import HomeDepartureMenu from './HomeDepartureMenu.svelte';
  let {actions,onAction,onCooking,onExit,onCompany=()=>{}}:{actions:ActionDef[];onAction:(a:ActionDef)=>void;onCooking:()=>void;onExit:()=>void;onCompany?:()=>void}=$props();
  const residenceId=$derived(currentHomeSceneId(gameState)??'old_apartment');
  const customizable=$derived(canCustomizeCurrentHome(gameState));
  const plan=$derived(homeReferencePlan(homePlanFor(residenceId))),objects=$derived(homeObjects(gameState,plan)),roomState=$derived(homeReferenceState(homeRoomState(gameState,plan),plan));
  const lightMode=$derived(homeLightMode(gameState)),lighting=$derived(homeLightScheme(roomState.hour,roomState.month,roomState.weather,lightMode));
  const name=$derived(homeResidenceName(gameState)),time=$derived(formatTime(gameState.time.hour,gameState.time.minute));
  let selected=$state<HomeObjectKind|null>(null),branch=$state<'sleep'|'cook'|'use'|'furnish'|null>(null),timedOpen=$state(false);
  let personalOpen=$state(false),catalogOpen=$state(false),decorOpen=$state(false);
  let exitOpen=$state(false);
  let catalogKind=$state<HomeFurnitureKind>('bed');
  const catalogOffers=$derived(homeOffers(catalogKind));
  let host:HTMLDivElement,roomView=$state.raw<HomeRoomView>();
  let webgl=$state(false),labels=$state<HomeRoomLabel[]>([]),outside=$state(false);
  let quality=$state<QualityMode>('auto');
  const kind=$derived(selected??'bed'),title=$derived(objectName(kind)),activeObject=$derived(objects.find(o=>o.kind===kind));
  const ownedItem=$derived(customizable&&HOME_KINDS.includes(kind as HomeFurnitureKind)?bestHomeItem(gameState,kind as HomeFurnitureKind):undefined);
  const offers=$derived(customizable&&HOME_KINDS.includes(kind as HomeFurnitureKind)?homeOffers(kind as HomeFurnitureKind):[]);
  const visibleLabels=$derived(webgl?labels.filter(l=>l.visible):objects.map(o=>({kind:o.kind,x:o.x/10,y:(o.y-o.height*.3)/6.3,visible:true})));
  const selectedLabel=$derived(visibleLabels.find(l=>l.kind===selected));
  const menuWidth=$derived(branch?480:192),menuHeight=$derived(timedOpen?540:branch==='furnish'?450:branch?400:180);
  const popupLeft=$derived(`clamp(12px, calc(${selectedLabel?.x??50}% + 16px), calc(100% - ${menuWidth+12}px))`);
  const popupTop=$derived(`clamp(86px, calc(${selectedLabel?.y??50}% - 48px), calc(100% - ${menuHeight+72}px))`);
  const sleepAction=$derived(actions.find(a=>a.id==='sleep_home'));
  const sleepCheck=$derived(sleepAction?canPerform(gameState,sleepAction):{ok:false,reason:'当前无法休息'});
  const canNap=$derived(napWindowOpen(gameState.time.hour)),naturalHours=$derived(naturalWakeHours(gameState));
  const kitchenCheck=$derived(canUseCookingWorkbench(gameState));
  const simpleMeal=$derived(actions.find(a=>a.id==='eat_simple_meal_home'));
  const relevantActions=$derived(actions.filter(a=>{
    if(kind==='sofa')return a.id==='home_sofa_relax'||a.id==='home_sofa_nap';
    if(kind==='shower')return ['shower_home','wash_basic'].includes(a.id);
    if(kind==='computer')return a.handler==='use_laptop';
    if(kind==='wardrobe')return a.handler==='open_wardrobe';
    if(kind==='storage')return a.handler==='open_home_storage';
    if(kind==='kitchen')return false;
    if(kind==='gym')return a.id==='exercise_home_equip';return false;
  }));
  const bodyStats=$derived([
    {label:'体力',value:gameState.player.attrs.stamina,max:getMaxStamina(gameState),tone:'var(--accent-2)'},
    {label:'健康',value:gameState.player.attrs.health,max:100,tone:'var(--ok)'},{label:'干净',value:gameState.player.attrs.hygiene,max:100,tone:'#7cd5da'},
    {label:'心情',value:gameState.player.attrs.mood,max:100,tone:'#b8a2ee'},{label:'饱腹',value:gameState.player.attrs.satiety,max:100,tone:'var(--accent)'},
  ]);
  const bodyLow=$derived(bodyStats.some(s=>s.value/s.max<.25));
  function objectName(k:HomeObjectKind){if(k==='computer'&&(!customizable||!hasLaptop(gameState)))return '书桌';return HOME_FURNITURE[k as HomeFurnitureKind]?.name??({wardrobe:'衣柜',bookshelf:'书柜',door:'出门',storage:customizable?'收纳':'行李位',trash:'垃圾桶'} as Record<string,string>)[k];}
  function clearSelection(){roomView?.select(null);selected=null;branch=null;timedOpen=false;}
  function clearOverlays(){clearSelection();personalOpen=false;catalogOpen=false;decorOpen=false;}
  let destroyed=false,generation=0,loadTask:LoadingHandle|undefined;
  async function start(restart=false){
    const run=++generation;
    const task=beginSceneLoading({...sceneLoadingTarget(gameState,uiState.sceneMode),retry:()=>{void start(true);},fallback:uiState.sceneMode==='3d'?()=>{loadTask?.cancel();setSceneMode('2d');}:undefined},restart);loadTask=task;
    roomView?.dispose();roomView=undefined;webgl=false;labels=[];
    try{
      if(!await task.covered||destroyed||run!==generation||!task.active())return;
      const stillScene=uiState.sceneMode==='2d';
      const [factory,visualModule]=stillScene?[await import('../../lib/homeStillView'),undefined]:await Promise.all([import('../../lib/homeRoom3D'),import('../../lib/homeReferenceVisuals')]);
      if(destroyed||run!==generation||!task.active())return;
      host.dataset.sceneLoadingOwner=String(task.id);
      const labelUpdate=(v:HomeRoomLabel[])=>{if(!destroyed&&run===generation)labels=v;};
      const petPick=(uid?:string)=>{clearOverlays();uiState.catPanelPetUid=uid??null;uiState.catPanelTab='care';uiState.modal='cat';};
      const room=stillScene?('createHomeStillView'in factory?factory.createHomeStillView(host,plan,labelUpdate,choose,petPick):undefined):('createHomeRoom'in factory?factory.createHomeRoom(host,plan,labelUpdate,choose,petPick,visualModule!.createHomeReferenceVisuals(plan,uiState.gameMode==='pc'?'pc':'mobile',uiState.renderScale,uiState.renderResolution)):undefined);
      roomView=room;webgl=!!room;
      room?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight);room?.setQuality?.(quality,uiState.gameMode==='pc'?'pc':'mobile');room?.update(roomState);
      if(room)await room.ready;
      if(destroyed||run!==generation||!task.active()){room?.dispose();return;}
      task.ready();
    }catch(error){if(!destroyed&&run===generation){roomView?.dispose();roomView=undefined;webgl=false;task.fail(uiState.sceneMode==='3d'?'暂时无法准备3D住宅，请重试或切换2D场景。':'暂时无法准备2D住宅，请重新载入。');console.error('Home scene unavailable',error);}}
  }
  onMount(()=>{syncAutoHomeEquipment(gameState);void start();return()=>{destroyed=true;generation++;loadTask?.cancel();roomView?.dispose();};});
  $effect(()=>roomView?.update(roomState));
  $effect(()=>roomView?.setQuality?.(quality,uiState.gameMode==='pc'?'pc':'mobile'));
  $effect(()=>roomView?.setResolution?.(uiState.renderScale,uiState.renderResolution));
  $effect(()=>roomView?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight));
  $effect(()=>{if(!currentHomeSceneId(gameState))clearOverlays();});
  $effect(()=>{if(uiState.modal)clearOverlays();});
  function choose(k:HomeObjectKind){if(k==='trash'){clearOverlays();playInteractionSound('drawer');showCityTip();return;}if(k==='door'){leaveRoom();return;}if(selected!==k)playInteractionSound(homeObjectSound(k));clearOverlays();selected=k;roomView?.select(k);}
  function leaveRoom(){if(cityHotelGuest(gameState)||gameState.company){clearOverlays();exitOpen=!exitOpen;}else onExit();}
  function dineDownstairs(){const meal=actions.find(a=>['mooncourt_dining','hotel_resident_dining'].includes(a.id));if(meal){exitOpen=false;onAction(meal);}}
  function focusPosition(k:HomeObjectKind){return roomState.objects.find(object=>object.kind===k)?.position;}
  function toggleExterior(){clearOverlays();outside=!outside;if(outside)roomView?.exterior?.();else roomView?.focus(plan.size[0]/2,plan.size[1]/2);}
  function toggleBranch(b:typeof branch){branch=branch===b?null:b;timedOpen=false;}
  function relocate(){const r=rearrangeHomeObject(gameState,kind);showToast(r.ok?`${title}已放到另一处预留位置`:r.reason??'无法调整位置');if(r.ok){const p=focusPosition(kind);if(p)roomView?.focus(...p);}}
  function buy(itemId:string){const r=purchaseHomeFurniture(gameState,itemId);if(r.ok&&r.result){const k=homeFurnitureKind(itemId);if(k){choose(k);roomView?.update(roomState);const p=focusPosition(k);if(p)roomView?.focus(...p);}showResult(r.result);}else showToast(r.reason??'购买失败');}
  function actionCheck(a:ActionDef){return a.handler==='use_laptop'&&!hasLaptop(gameState)?{ok:false,reason:'先添置一台电脑'}:canPerform(gameState,a);}
  function perform(a:ActionDef){const c=actionCheck(a);if(!c.ok){showToast(c.reason??'暂时无法使用');return;}clearSelection();onAction(a);}
  function rest(short:boolean){
    if(!sleepCheck.ok||!canSleepHere(gameState)){showToast(sleepCheck.reason??'请先回到住处');return;}
    if(short&&!canNap){showToast('短暂休息在07—22点可用');return;}
    const before=Number(gameState.flags.log_sequence)||0;playSound(short?'nap':'sleep');
    if(short)nap(gameState,2);else sleep(gameState,residenceSleepHours(gameState,alarmCappedHours(gameState,naturalHours)));
    clearSelection();toastNewNotices(gameState.log.filter(e=>(e.sequence??0)>before));
  }
  function keydown(e:KeyboardEvent){if(e.key==='Escape'&&!uiState.modal)clearOverlays();}
  function changeLight(mode:'auto'|'on'|'off'){if(mode===lightMode)return;setHomeLightMode(gameState,mode);playInteractionSound('switch');}
  function cycleLight(){changeLight(lightMode==='auto'?'on':lightMode==='on'?'off':'auto');}
  function phone(start:'home'|'todo'='home'){clearOverlays();playInteractionSound('mouse');uiState.phoneStartApp=start;uiState.modal='phone';}
</script>
<svelte:window onkeydown={keydown}/>
<section class="home-interior" data-home-id={residenceId} data-home-editable={customizable} data-home-mode={webgl?uiState.sceneMode:'loading'} aria-label={customizable?'我的家':'当前客房'}>
  <div class="home-world" bind:this={host} data-home-drag="pan" role="presentation" onpointerdown={(e)=>{if(e.target instanceof HTMLCanvasElement)clearOverlays();}}>
    {#if !webgl}<div class="scene-placeholder" role="status">正在准备房间…</div>{/if}
  </div>
  <div class="home-hotspots">{#each visibleLabels as l (l.kind)}<button class="furniture-target" class:selected={selected===l.kind} style:left={`${l.x}%`} style:top={`${l.y}%`} data-home-object={l.kind} aria-label={objectName(l.kind)} aria-pressed={selected===l.kind} onpointerenter={()=>roomView?.hover(l.kind)} onpointerleave={()=>roomView?.hover(null)} onfocus={()=>roomView?.hover(l.kind)} onblur={()=>roomView?.hover(null)} onclick={()=>choose(l.kind)}><span>{objectName(l.kind)}</span></button>{/each}</div>
  <header class="home-snapshot" aria-label="住处与时间">
    <div class="home-address"><span class="address-dot"></span><h2>{name}</h2><SaveStatusIndicator compact/></div>
    <div class="snapshot-line"><button class="home-clock" aria-label="打开菜单与存档" title="菜单与存档" onclick={()=>{clearOverlays();uiState.modal='settings';}}>{time}</button><span>{gameState.time.month}月{gameState.time.day}日 · {weekdayLabel(gameState.time)}<small>{WEATHER_LABEL[currentWeather(gameState)]}</small></span><b class="home-wallet"><small>可用资金</small>¥ {formatMoney(gameState.player.money)}</b></div>
  </header>
  <div class="home-tools">
    <button class="personal-toggle" class:low={bodyLow} aria-expanded={personalOpen} aria-label="随身面板" onclick={()=>{const next=!personalOpen;clearOverlays();personalOpen=next;}}><span aria-hidden="true">◌</span> 随身{#if bodyLow}<i aria-label="身体需要照顾"></i>{/if}</button>
    <button data-home-departure onclick={leaveRoom} aria-expanded={exitOpen}>出门 ↗</button>
    {#if exitOpen}<HomeDepartureMenu onDining={dineDownstairs} onExit={()=>{exitOpen=false;onExit();}} onCompany={()=>{exitOpen=false;onCompany();}} onClose={()=>exitOpen=false}/>{/if}
    {#if personalOpen}<div class="personal-fold" role="group" aria-label="随身工具">
      <button onclick={()=>phone()}><span>▣</span>手机</button>
      <button onclick={()=>{clearOverlays();uiState.modal='inventory';}}><span>🎒</span>背包</button>
      <button onclick={()=>{clearOverlays();uiState.modal='log';}}><span>📜</span>行动日志</button>
      <button data-home-light-switch onclick={cycleLight} title={lighting.phase}><span>☼</span>照明：{lightMode==='auto'?'自动':lightMode==='on'?'开灯':'关灯'}</button>
      {#if customizable}<button onclick={()=>{clearOverlays();catalogOpen=true;}}><span>⌂</span>添置家具</button>
      <button onclick={()=>{clearOverlays();decorOpen=true;}}><span>▧</span>墙面与地面</button>
      {#if availableCatsOf(gameState).length}<button onclick={()=>{clearOverlays();uiState.modal='cat';}}><span>♧</span>猫咪</button>{/if}{/if}
      <button onclick={()=>{clearOverlays();uiState.modal='settings';}}><span>☷</span>菜单</button>
    </div>{/if}
  </div>
  <div class="home-left-stack"><aside class="home-status" aria-label="身体状态"><div class="sheet-heading"><strong>身体状态</strong><span>此刻的自己</span></div>{#each bodyStats as s}<div class="body-stat" class:low={s.value/s.max<.25} style:--stat-color={s.tone}><div class="stat-caption">{s.label}<span>{Math.round(s.value)} / {s.max}</span></div><div class="stat-track"><i style:width={`${Math.max(0,Math.min(100,s.value/s.max*100))}%`}></i></div></div>{/each}<CharacterAbilities compact /></aside><HomeTodoPanel onOpen={()=>phone('todo')}/></div>
  <HomePhonePocket {time} date={`${gameState.time.month}月${gameState.time.day}日`} balance={gameState.player.money} skin={gameState.phoneSkin} unread={unreadSmsCount(gameState)} expanded={uiState.modal==='phone'} onOpen={()=>phone()}/>
  {#if customizable&&decorOpen}<HomeDecorPanel onClose={()=>decorOpen=false}/>{/if}
  <div class="home-view-tools">{#if webgl}<SceneViewControls onRotate={(angle)=>{clearOverlays();roomView?.rotate(angle);}} onZoom={uiState.sceneMode==='2d'?factor=>roomView?.zoom(factor):undefined} onReset={uiState.sceneMode==='2d'?()=>roomView?.resetView?.():undefined}/>{#if uiState.sceneMode==='3d'&&uiState.gameMode==='pc'}<button class="exterior-toggle" data-home-exterior aria-pressed={outside} onclick={toggleExterior}>{outside?'回到房间':'看看屋外'}</button>{/if}{/if}</div>
  <div class="home-find"><SceneDisplaySettings home {quality} qualityLabel="住宅画质" onQuality={(mode)=>quality=mode}/></div>
  {#if customizable&&catalogOpen}<div class="home-catalog" role="dialog" aria-label="家居目录"><button class="close" aria-label="收起家居目录" onclick={()=>catalogOpen=false}>×</button><h3>给家添点东西</h3><p>购置后送到家中，现有家具可以升级。</p><div class="catalog-kinds">{#each HOME_KINDS as k}<button class:current={catalogKind===k} onclick={()=>catalogKind=k}>{HOME_FURNITURE[k].name}</button>{/each}</div><div class="home-offers">{#each catalogOffers as a (a.id)}{@const q=homePurchaseQuote(gameState,a.itemId!)}<button disabled={!q.ok} onclick={()=>buy(a.itemId!)} data-home-buy={a.itemId}><span>{a.name}</span><strong>{q.price>0?`${formatMoney(q.price)} 元`:q.ok?'免费':''}</strong><small>{q.ok?`送货与安置 ${q.duration} 小时`:q.reason}</small></button>{/each}</div></div>{/if}
  {#if selected}<div class="home-detail" class:expanded={!!branch} role="dialog" aria-label={`${title}的操作`} style:left={popupLeft} style:top={popupTop} style:--menu-y={popupTop}>
    <div class="object-heading"><div><strong>{title}</strong><small>{ownedItem?homeItemName(gameState,kind as HomeFurnitureKind):'房源配套'}</small></div><button class="close" aria-label="收起家具操作" onclick={clearSelection}>×</button></div>
    <div class="action-columns"><div class="action-roots">
      {#if kind==='bed'}<button class:active={branch==='sleep'} disabled={!sleepCheck.ok} aria-expanded={branch==='sleep'} onclick={()=>toggleBranch('sleep')}>睡觉 <span>›</span></button>
      {:else if kind==='fridge'}<button onclick={()=>{clearSelection();uiState.modal='fridge';}}>看看冰箱 <span>›</span></button>
      {:else if kind==='kitchen'}<button class:active={branch==='cook'} aria-expanded={branch==='cook'} onclick={()=>toggleBranch('cook')}>做饭 <span>›</span></button>
      {:else if kind!=='plant'}<button class:active={branch==='use'} aria-expanded={branch==='use'} onclick={()=>toggleBranch('use')}>{({bookshelf:'阅读',sofa:'休息放松',shower:'洗漱',computer:'使用电脑',wardrobe:'换身衣服',storage:'整理收纳',gym:'锻炼',lamp:'调整照明'} as Record<string,string>)[kind]??'使用'} <span>›</span></button>{/if}
      {#if kind==='kitchen'&&simpleMeal}{@const check=actionCheck(simpleMeal)}<button data-home-simple-meal disabled={!check.ok} onclick={()=>perform(simpleMeal!)}>简餐<small>{check.ok?'5元 · 饱食度 +30 · 无需餐具':check.reason}</small></button>{/if}
      {#if customizable&&(offers.length||activeObject?.adjustable)}<button class:active={branch==='furnish'} aria-expanded={branch==='furnish'} onclick={()=>toggleBranch('furnish')}>布置与升级 <span>›</span></button>{/if}
    </div>
    {#if branch}<div class="action-branch" data-home-branch={branch}>
      {#if branch==='sleep'}
        {#if !timedOpen}<button data-home-sleep="timed" onclick={()=>timedOpen=!timedOpen}>定时睡眠<small>选好时长与闹钟</small></button>
        <button data-home-sleep="nap" disabled={!canNap||!sleepCheck.ok} onclick={()=>rest(true)}>短暂休息<small>{canNap?'小睡2小时，恢复体力':'07—22点可用'}</small></button>
        <button data-home-sleep="natural" disabled={!sleepCheck.ok||naturalHours<=0} onclick={()=>rest(false)}>睡到自然醒<small>{naturalHours<=0?'已到次日自然醒时间，无需再睡':`约 ${naturalHours.toFixed(1)} 小时${gameState.alarmHour!==undefined?' · 已设闹钟会提前叫醒':''}`}</small></button>
        {:else}<button onclick={()=>timedOpen=false}>‹ 返回睡眠选项</button><div class="timed-editor"><SleepModal embedded timedOnly onClose={clearSelection}/></div>{/if}
      {:else if branch==='cook'}
        <button disabled={!kitchenCheck.ok} onclick={()=>{clearSelection();onCooking();}}>正式烹饪<small>{kitchenCheck.ok?'搭配食材，做一份饭菜':kitchenCheck.reason}</small></button>
      {:else if branch==='use'}
        {#if kind==='lamp'}{#each [{mode:'auto',name:'跟随时间',hint:'入夜开灯，白天使用窗光'},{mode:'on',name:'打开灯光',hint:'保持室内灯光开启'},{mode:'off',name:'关掉灯光',hint:'使用窗外的自然光'}] as choice}<button class:active={lightMode===choice.mode} onclick={()=>changeLight(choice.mode as 'auto'|'on'|'off')}>{choice.name}<small>{choice.hint}</small></button>{/each}{/if}
        {#if kind==='bookshelf'}<button onclick={()=>{clearSelection();uiState.modal='bookshelf';}}>选一本书<small>慢慢读一会儿</small></button>{/if}
        {#each relevantActions as a (a.id)}{@const c=actionCheck(a)}<button disabled={!c.ok} onclick={()=>perform(a)}><span>{a.name}</span><small>{c.ok?`${a.duration??0} 小时${kind==='sofa'?` · 体力 +${a.effects.stamina}`:''}`:c.reason}</small></button>{/each}
        {#if kind==='computer'&&!hasLaptop(gameState)}<p>{customizable?'这是一张书桌，添置电脑后可以使用。':'房内配有书桌，可在这里使用自带的笔记本电脑。'}</p>{/if}
      {:else if branch==='furnish'}
        {#if activeObject?.adjustable&&activeObject.owned}<button onclick={relocate} data-home-relocate={kind}>换一个位置<small>在户型预留位置之间调整</small></button>{/if}
        {#each offers as a (a.id)}{@const q=homePurchaseQuote(gameState,a.itemId!)}<button disabled={!q.ok} onclick={()=>buy(a.itemId!)} data-home-buy={a.itemId}><span>{a.name}</span><small>{q.ok?`${formatMoney(q.price)}元 · 安置${q.duration}小时`:q.reason}</small></button>{/each}
      {/if}
    </div>{/if}</div>
  </div>{/if}
</section>
<style>
  .home-view-tools{display:flex;align-items:center;gap:6px}:global(:root[data-game-mode="mobile"]) .exterior-toggle{min-height:var(--m-tap,44px)}.exterior-toggle{font:inherit;font-size:12px;padding:8px 11px;min-height:38px;white-space:nowrap;border:1px solid var(--home-border);border-radius:9px;color:var(--hud-text);background:var(--home-solid)}
.home-interior{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;color:var(--hud-text);background:#c7b394;font-family:inherit;isolation:isolate;text-shadow:none;--home-panel:var(--hud-surface);--home-solid:var(--hud-surface-solid);--home-border:var(--hud-border);--home-muted:var(--hud-text-dim)}button{font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible{outline:2px solid var(--accent-2);outline-offset:3px}.home-world,.home-hotspots{position:absolute;inset:0}.home-world{touch-action:none;cursor:grab}.home-world:active{cursor:grabbing}.home-world :global(canvas){display:block;width:100%;height:100%;touch-action:none}.scene-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:var(--hud-text-dim)}.home-hotspots{pointer-events:none;z-index:2}.furniture-target{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border:1px solid var(--home-border);border-radius:8px;background:var(--home-solid);color:var(--hud-text);padding:5px 10px;font-size:11px;min-height:30px;backdrop-filter:blur(8px);box-shadow:0 3px 12px #0002;transition:background .15s,border-color .15s}.furniture-target:hover,.furniture-target.selected{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--home-solid) 88%,var(--accent))}.home-snapshot{position:absolute;left:max(18px,var(--sai-left,0px));top:max(18px,var(--sai-top,0px));padding:12px 16px;width:310px;max-width:calc(100% - 220px);border:1px solid var(--home-border);border-radius:13px;background:var(--home-panel);box-shadow:0 6px 24px #0003;backdrop-filter:blur(14px);z-index:8}.home-address{display:flex;align-items:center;gap:7px;min-width:0}.home-address h2{font-size:12px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:205px}.address-dot{width:5px;height:5px;flex:none;border-radius:50%;background:var(--accent-2)}.snapshot-line{display:flex;align-items:center;gap:12px;margin-top:10px}.home-clock{font-size:26px;font-weight:600;line-height:1.2;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--hud-text)}.snapshot-line>span{font-size:10px;line-height:1.5;color:var(--home-muted);white-space:nowrap}.snapshot-line small{display:block;color:var(--home-muted);font-size:9px}.home-wallet{margin-left:auto;padding-left:12px;border-left:1px solid var(--home-border);font-size:13px;font-weight:600;white-space:nowrap;color:var(--accent);font-variant-numeric:tabular-nums}.home-wallet small{margin-bottom:3px;font-weight:400}.home-tools{position:absolute;top:max(18px,var(--sai-top,0px));right:max(18px,var(--sai-right,0px));display:flex;gap:7px;z-index:8}.home-tools>button{border:1px solid var(--home-border);border-radius:9px;background:var(--home-panel);color:var(--hud-text);padding:9px 12px;font-size:12px;min-height:38px;white-space:nowrap;backdrop-filter:blur(12px);box-shadow:0 3px 12px #0002}.home-tools>button:hover{border-color:var(--accent-2);color:var(--accent-2)}.personal-toggle{position:relative}.personal-toggle>span{font-size:18px;color:var(--accent-2)}.personal-toggle i{position:absolute;top:7px;left:8px;width:5px;height:5px;border-radius:50%;background:var(--warn)}.personal-fold{position:absolute;right:0;top:48px;display:grid;grid-template-columns:1fr 1fr;gap:6px;width:300px;padding:10px;border:1px solid var(--home-border);border-radius:13px;background:var(--home-solid);box-shadow:0 12px 30px #0004;max-height:calc(100vh - 140px);overflow:auto;scrollbar-width:thin}.personal-fold button{display:flex;gap:8px;align-items:center;border:1px solid var(--home-border);border-radius:8px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);color:var(--hud-text);text-align:left;padding:10px;font-size:12px;min-height:40px}.personal-fold button>span{color:var(--accent-2);font-size:16px;width:18px;flex:none}.personal-fold button:hover{border-color:var(--accent-2)}.home-left-stack{position:absolute;left:max(18px,var(--sai-left,0px));top:120px;bottom:78px;z-index:4;display:flex;flex-direction:column;gap:12px;align-items:flex-start;pointer-events:none;width:228px;max-width:calc(100% - 36px)}.home-status{position:relative;flex:none;box-sizing:border-box;width:228px;max-width:100%;padding:13px 16px;pointer-events:none;border:1px solid var(--home-border);border-radius:13px;background:var(--home-panel);color:var(--hud-text);box-shadow:0 6px 24px #0003;backdrop-filter:blur(14px)}.sheet-heading{display:flex;justify-content:space-between;align-items:center;padding-bottom:9px;margin-bottom:8px;border-bottom:1px solid var(--home-border)}.sheet-heading strong{font-size:12px;font-weight:600}.sheet-heading>span{font-size:9px;color:var(--home-muted)}.close{border:1px solid var(--home-border);border-radius:7px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);color:var(--home-muted);font-size:20px;min-width:30px;min-height:30px;padding:0 5px}.body-stat{margin:9px 0}.body-stat .stat-caption{display:flex;justify-content:space-between;font-size:11px}.body-stat .stat-caption>span{font-size:10px;color:var(--home-muted);font-variant-numeric:tabular-nums}.stat-track{margin-top:5px;border-radius:4px;height:4px;background:color-mix(in srgb,var(--hud-text) 12%,transparent);overflow:hidden}.stat-track i{display:block;height:100%;border-radius:4px;background:var(--stat-color,var(--accent-2))}.body-stat.low .stat-track i{background:var(--danger)}.body-stat.low .stat-caption{color:var(--warn)}.home-detail{position:absolute;z-index:7;width:192px;max-width:calc(100% - 24px);max-height:calc(100% - var(--menu-y) - 72px);overflow:auto;scrollbar-width:thin;color:var(--hud-text);filter:drop-shadow(0 8px 18px #0004)}.home-detail.expanded{width:480px}.object-heading{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--home-solid);border:1px solid var(--home-border);border-left:3px solid var(--accent-2);border-radius:10px;margin-bottom:7px;width:192px;box-sizing:border-box}.object-heading strong{font-size:14px;font-weight:600}.object-heading small{display:block;font-size:10px;color:var(--home-muted);margin-top:4px}.action-columns{display:flex;align-items:flex-start;gap:9px}.action-roots{display:grid;gap:6px;flex:0 0 192px}.action-branch{display:grid;gap:6px;flex:1;min-width:0}.home-detail .action-columns button{border:1px solid var(--home-border);border-radius:10px;text-align:left;background:var(--home-solid);color:var(--hud-text);padding:12px 14px;min-height:44px;font-size:13px;transition:background .12s,border-color .12s}.action-roots>button{display:flex;justify-content:space-between}.home-detail .action-columns button:hover:not(:disabled){border-color:var(--accent-2)}.home-detail .action-columns button.active{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}.action-branch button small{display:block;font-size:10px;color:var(--home-muted);line-height:1.5;margin-top:4px}.action-branch button.active small{color:var(--accent-ink)}.action-branch p{font-size:11px;line-height:1.6;margin:0;padding:11px 14px;border:1px solid var(--home-border);border-radius:10px;background:var(--home-solid);color:var(--home-muted)}.timed-editor{padding:15px;border:1px solid var(--home-border);border-radius:12px;background:var(--home-solid)}.home-catalog{position:absolute;z-index:9;left:50%;top:50%;transform:translate(-50%,-50%);width:min(660px,calc(100% - 24px));max-height:calc(100% - 80px);overflow:auto;padding:24px;background:var(--home-panel);border:1px solid var(--home-border);border-radius:16px;color:var(--hud-text);box-shadow:0 18px 50px #0005;backdrop-filter:blur(16px)}.home-catalog>.close{position:absolute;right:14px;top:14px}.home-catalog h3{font-size:21px;font-weight:600;margin:0 30px 10px 0}.home-catalog>p{font-size:12px;color:var(--home-muted);line-height:1.6}.catalog-kinds{display:flex;gap:5px;flex-wrap:wrap;margin:17px 0;padding-bottom:14px;border-bottom:1px solid var(--home-border)}.home-catalog button:not(.close){border:1px solid var(--home-border);border-radius:9px;padding:10px 12px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);color:var(--hud-text);font-size:12px;min-height:40px}.catalog-kinds .current{border-color:var(--accent)!important;color:var(--accent)!important;background:color-mix(in srgb,var(--accent) 12%,transparent)!important}.home-offers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.home-offers button{display:grid;gap:9px;text-align:left}.home-offers button:hover:not(:disabled){border-color:var(--accent-2)}.home-offers strong{font-weight:600;font-size:14px;color:var(--accent)}.home-offers small{font-size:10px;color:var(--home-muted);line-height:1.6}:global(:root[data-game-mode="mobile"]) .home-tools button,:global(:root[data-game-mode="mobile"]) .home-detail .action-columns button,:global(:root[data-game-mode="mobile"]) .home-catalog button{font-size:var(--m-fs-md);min-height:var(--m-tap)}:global(:root[data-game-mode="mobile"]) .home-detail .action-columns small,:global(:root[data-game-mode="mobile"]) .object-heading small,:global(:root[data-game-mode="mobile"]) .home-offers small{font-size:var(--m-fs-xs)}:global(:root[data-game-mode="mobile"]) .object-heading strong,:global(:root[data-game-mode="mobile"]) .body-stat .stat-caption{font-size:var(--m-fs-md)}:global(:root[data-game-mode="mobile"]) .home-status{width:225px;max-width:100%}:global(:root[data-game-mode="mobile"]) .home-status .stat-caption>span{font-size:var(--m-fs-xs)}:global(:root[data-game-mode="mobile"]) .home-snapshot{padding:10px 14px}:global(:root[data-game-mode="mobile"]) .home-clock{font-size:var(--m-fs-lg)}:global(:root[data-game-mode="mobile"]) .home-snapshot span,:global(:root[data-game-mode="mobile"]) .home-wallet,:global(:root[data-game-mode="mobile"]) .home-address h2{font-size:var(--m-fs-xs)}:global(:root[data-game-mode="mobile"]) .personal-fold{width:370px}
  @media(max-height:520px) and (min-width:650px){.home-snapshot{top:12px;left:14px;padding:9px 12px;width:300px}.snapshot-line{margin-top:6px}.home-left-stack{top:96px;left:14px;bottom:63px;gap:8px;width:215px}.home-status{padding:9px 12px;width:215px}.sheet-heading{padding-bottom:6px;margin-bottom:5px}.body-stat{margin:6px 0}.home-tools{top:12px;right:14px}.personal-fold{max-height:calc(100vh - 110px)}.home-catalog{max-height:calc(100% - 32px);padding:18px}}
  @media(max-width:640px) and (orientation:portrait){.home-snapshot{right:18px;top:15px;width:auto;max-width:none}.home-tools{top:113px}.home-left-stack{top:168px;bottom:126px}.snapshot-line{gap:9px}.home-clock{font-size:20px}.home-wallet{padding-left:9px}.home-detail.expanded{width:calc(100% - 24px)}.action-columns{flex-wrap:wrap}.action-roots{flex-basis:100%;grid-template-columns:1fr 1fr}.action-branch{flex-basis:100%;grid-template-columns:1fr}.object-heading{width:100%}.home-offers{grid-template-columns:1fr}.home-catalog{max-height:calc(100% - 40px)}}

.home-view-tools,.home-find{position:absolute;z-index:8;bottom:max(16px,var(--sai-bottom,0px));display:flex;align-items:center;gap:6px;}
.home-view-tools{left:max(18px,var(--sai-left,0px));}.home-find{right:max(18px,var(--sai-right,0px));}
@media(max-width:700px),(max-height:520px){.home-view-tools,.home-find{bottom:max(12px,var(--sai-bottom,0px));}.home-view-tools{left:max(12px,var(--sai-left,0px));}.home-find{right:max(12px,var(--sai-right,0px));}}
</style>
