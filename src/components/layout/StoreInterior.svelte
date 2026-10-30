<script lang="ts">
  import {qualityForDevice} from '../../lib/sceneMode';
  import {playInteractionSound} from '../../lib/audio';
  import CharacterAbilities from "../CharacterAbilities.svelte";
  import {beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {sceneLoadingTarget} from '../../lib/sceneLoadingTarget';
  import {onMount,untrack} from 'svelte';
  import type {ActionDef} from '../../game/types';
  import {facilityPurchaseCheck,purchasePriceOf,performShoppingCart,DINE_IN_EXTRA_HOURS} from '../../game/core/actions';
  import {getItem,itemCount} from '../../game/core/items';
  import {productRepeatable,shoppingDuration,type ShoppingLine} from '../../game/core/facilityShopping';
  import {formatDuration} from '../../game/core/quests';
  import type {StoreRoomView} from '../../lib/convenienceStore3D';
  import type {QualityMode} from '../../lib/scenePipeline';
  import {STORE_FACILITIES,isStoreFacilityInteractive,storeProductFacility,type StoreFacilityId,type StoreFacilitySelection} from '../../lib/convenienceStore/facilities';
  import type {CafeWorkOption,CafePersonOption} from '../../lib/cafeRoom/facilities';
  import {gameState} from '../../stores/gameStore.svelte';
  import {uiState,setSceneMode,showToast,presentJobResult} from '../../stores/uiStore.svelte';
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
  let {night,products=[],onExit,exitLabel='出门，回到街道',workOptions=[],onWork=()=>{},waitOptions=[],onWait=()=>{},people=[],onTalk=()=>{},introduction,onIntroduction,blindBox,onBlindBox}:
    {night:boolean;products?:ActionDef[];onExit:()=>void;exitLabel?:string;workOptions?:CafeWorkOption[];onWork?:(id:string)=>void;waitOptions?:{hours:number;label:string;smart?:boolean}[];onWait?:(hours:number)=>void;people?:CafePersonOption[];onTalk?:(id:string)=>void;introduction?:{title:string;description:string};onIntroduction?:()=>void;blindBox?:{title:string;detail:string;disabled:boolean;reason?:string};onBlindBox?:()=>void}=$props();
  let host:HTMLDivElement;
  let view=$state.raw<Pick<StoreRoomView,'ready'|'update'|'selectFacility'|'rotate'|'toggleDoor'|'setQuality'|'setResolution'|'dispose'>>();
  let loading=$state(true),failed=$state(false);
  let selected=$state<StoreFacilitySelection|null>(null),personalOpen=$state(false),statusOpen=$state(uiState.gameMode==='pc');
  let quality=$state<QualityMode>('auto');
  let destroyed=false,generation=0;
  let loadTask:LoadingHandle|undefined;
  let labels=$state<SceneNameLabel[]>([]);
  const location=untrack(()=>gameState.locationId);
  let cart=$state<ShoppingLine[]>([]),dine=$state<'pack'|'eat'>('pack'),busy=$state(false),cartExpanded=$state(false);
  const displayProducts=$derived(selected?products.filter(action=>storeProductFacility(action)===selected?.id):[]);
  const lines=$derived(cart.map(line=>({...line,action:products.find(action=>action.id===line.actionId)})).filter(line=>!!line.action));
  const units=$derived(lines.reduce((sum,line)=>sum+line.quantity,0));
  const total=$derived(lines.reduce((sum,line)=>sum+purchasePriceOf(gameState,line.action!)*line.quantity,0));
  const hasReadyFood=$derived(lines.some(line=>['buy_food','buy_fresh'].includes(line.action!.handler??'')));
  const duration=$derived(shoppingDuration(lines.map(line=>line.action!),units)+(hasReadyFood&&dine==='eat'?DINE_IN_EXTRA_HOURS:0));
  const canCheckout=$derived(units>0&&units<=99&&total<=gameState.player.money&&lines.every(line=>facilityPurchaseCheck(gameState,line.action!).ok));
  const quantityOf=(id:string)=>cart.find(line=>line.actionId===id)?.quantity??0;
  function setQuantity(id:string,quantity:number){const action=products.find(action=>action.id===id);if(!action||busy)return;const count=Math.max(0,Math.min(productRepeatable(action)?99:1,quantity));cart=cart.filter(line=>line.actionId!==id);if(count)cart=[...cart,{actionId:id,quantity:count}];}
  function checkout(){if(busy||gameState.locationId!==location||!canCheckout)return;busy=true;const result=performShoppingCart(gameState,cart,{dine:hasReadyFood?dine:'pack'});if(!result.ok){busy=false;showToast(result.reason??'本次采购未完成');return;}cart=[];cartExpanded=false;clearOverlays();busy=false;if(result.result)presentJobResult(result.result,undefined,{id:result.result.actionId,name:result.result.name,icon:result.result.icon});}

  const weather=$derived(currentWeather(gameState));
  const time=$derived(formatTime(gameState.time.hour,gameState.time.minute));
  const bodyStats=$derived([
    {label:'体力',value:gameState.player.attrs.stamina,max:getMaxStamina(gameState),tone:'#8db7a5'},
    {label:'健康',value:gameState.player.attrs.health,max:100,tone:'#9ab37b'},
    {label:'干净',value:gameState.player.attrs.hygiene,max:100,tone:'#8ebbbd'},
    {label:'心情',value:gameState.player.attrs.mood,max:100,tone:'#b9a4bd'},
    {label:'饱腹',value:gameState.player.attrs.satiety,max:100,tone:'#c6ad77'},
  ]);
  const title=$derived(selected?.title??'');
  const popupLeft=$derived(`clamp(14px, calc(${selected?.x??50}% + 20px), calc(100% - var(--store-menu-width) - 28px))`);
  const popupHeight=$derived(Math.min(600,Math.max(350,146+displayProducts.length*64+170)+84));
  const popupTop=$derived(`clamp(86px, calc(${selected?.y??40}% - 24px), calc(100% - ${popupHeight}px))`);
  function onSelect(selection:StoreFacilitySelection|null){const previous=selected?.id;selected=selection&&isStoreFacilityInteractive(selection.id)?selection:null;if(selected&&selected.id!==previous)playInteractionSound(selected.id==='fresh'||selected.id==='drinks'?'fridge_open':'mouse');if(selection){personalOpen=false;if(selection.id==='checkout'&&units>0)cartExpanded=true;}}
  async function start(restart=false){
    const task=beginSceneLoading({...sceneLoadingTarget(gameState,uiState.sceneMode),retry:()=>{void start(true);},fallback:uiState.sceneMode==='3d'?()=>{loadTask?.cancel();setSceneMode('2d');}:undefined},restart);loadTask=task;
    const run=++generation;loading=true;failed=false;view?.dispose();view=undefined;selected=null;labels=[];
    try{if(!await task.covered||destroyed||run!==generation||!task.active())return;const createStoreRoom=uiState.sceneMode==='3d'?(await import('../../lib/convenienceStore3D')).createStoreRoom:(await import('../../lib/venueStill')).createStoreStill;if(destroyed||run!==generation||!task.active())return;
      host.dataset.sceneLoadingOwner=String(task.id);
      const room=createStoreRoom(host,{night,weather,quality:qualityForDevice(quality,uiState.gameMode),renderScale:uiState.renderScale,resolution:uiState.renderResolution,onSelect:selection=>{if(!destroyed&&run===generation)onSelect(selection);},onProject:selection=>{if(!destroyed&&run===generation)selected=selection;},onLabels:next=>{if(!destroyed&&run===generation)labels=next;}});
      view=room;await room.ready;if(destroyed||run!==generation||!task.active()){room.dispose();return;}loading=false;task.ready();
    }catch(error){if(!destroyed&&run===generation){view?.dispose();view=undefined;failed=true;loading=false;task.fail(uiState.sceneMode==='3d'?'暂时无法准备3D店内场景，请重试或切换2D场景。':'暂时无法准备2D店内场景，请重新载入。');console.error('Store scene unavailable',error);}}
  }
  onMount(()=>{void start();return()=>{destroyed=true;generation++;loadTask?.cancel();view?.dispose();};});
  $effect(()=>view?.setResolution?.(uiState.renderScale,uiState.renderResolution));
  $effect(()=>view?.setQuality(qualityForDevice(quality,uiState.gameMode)));
  $effect(()=>{view?.update({night,weather});});
  $effect(()=>{if(uiState.modal||uiState.npcTalk||uiState.npcTaskPanel)clearOverlays();});
  function clearSelection(){selected=null;view?.selectFacility(null);}
  function clearOverlays(){clearSelection();personalOpen=false;}
  function choose(id:StoreFacilityId){if(!isStoreFacilityInteractive(id))return;clearOverlays();if(view&&!failed)view.selectFacility(id);else selected={id,...STORE_FACILITIES[id],x:52,y:42,visible:true};}
  function run(action?:()=>void){if(!action)return;clearOverlays();action();}
  function phone(app:'home'|'todo'|'jobs'='home'){clearOverlays();uiState.phoneStartApp=app;uiState.modal='phone';}
  function personal(){const next=!personalOpen;clearOverlays();personalOpen=next;}
  function keydown(e:KeyboardEvent){if(e.key==='Escape'&&!uiState.modal&&!uiState.npcTalk)clearOverlays();}
</script>
<svelte:window onkeydown={keydown}/>
{#snippet workButtons()}{#each workOptions as job}<button class="option" data-store-job={job.id} disabled={job.disabled} title={job.reason||undefined} onclick={()=>job.requiresHiring?phone('jobs'):run(()=>onWork(job.id))}><strong>{job.requiresHiring?'查看招聘':'上班'} · {job.title}</strong><small>{job.detail}</small>{#if job.reason}<small>{job.reason}</small>{/if}</button>{/each}{/snippet}
{#snippet waitButtons()}{#if waitOptions.length}<div class="option-group-label">坐着等一会儿</div><div class="wait-options">{#each waitOptions as wait}<button data-store-wait={wait.hours} onclick={()=>run(()=>onWait(wait.hours))}>{wait.label}</button>{/each}</div>{/if}{/snippet}
{#snippet peopleButtons()}
  {#if introduction&&onIntroduction}<button class="option" onclick={()=>run(onIntroduction)}><strong>{introduction.title}</strong><small>{introduction.description}</small></button>{/if}
  {#each people as person}<button class="option" onclick={()=>run(()=>onTalk(person.id))}>{person.known?`和${person.displayName}交谈`:'向店里的客人搭话'}</button>{/each}
{/snippet}

{#snippet cartControls()}
  {#if units>0}<div class="inline-cart" data-store-cart>
    <div class="cart-heading"><button class="cart-toggle" aria-expanded={cartExpanded} onclick={()=>cartExpanded=!cartExpanded}>采购清单 · {units} 件 <span>{cartExpanded?'收起':'查看'}</span></button><button class="cart-clear" onclick={()=>cart=[]}>清空</button></div>
    {#if cartExpanded}<div class="cart-lines">{#each lines as line (line.actionId)}<div data-store-cart-line={line.actionId}><span>{getItem(line.action!.itemId!)?.name} × {line.quantity}</span><small>¥ {formatMoney(purchasePriceOf(gameState,line.action!)*line.quantity)}</small><button aria-label={`移除${getItem(line.action!.itemId!)?.name}`} onclick={()=>setQuantity(line.actionId,0)}>×</button></div>{/each}</div>{/if}
    {#if hasReadyFood}<div class="dine-options" role="group" aria-label="采购取用方式"><button aria-pressed={dine==='pack'} onclick={()=>dine='pack'}>打包带走</button><button aria-pressed={dine==='eat'} onclick={()=>dine='eat'}>店内用餐</button></div>{/if}
    <p class="cart-time">{duration>0?`合并耗时 ${formatDuration(duration)}`:'打包不消耗时间'}</p>
    <button class="option primary checkout" data-store-checkout disabled={!canCheckout||busy} onclick={checkout}><strong>{units>99?'最多选择99份':total>gameState.player.money?'余额不足':busy?'正在结算':`结算 · ¥ ${formatMoney(total)}`}</strong></button>
  </div>{/if}
{/snippet}

<section class="store-interior" class:night data-store-interior data-store-fullscreen="true"  aria-label="朝夕便利店内">
  <div class="store-world" bind:this={host} aria-label="便利店场景"></div>
  {#if !loading&&!failed}<SceneFacilityLabels labels={labels} venue="store" selected={selected?.id} onChoose={(id)=>choose(id as StoreFacilityId)}/>{/if}
  {#if failed}<div class="scene-status failure" role="status"><strong>暂时无法显示店内场景</strong>{#if uiState.sceneMode==='3d'}<span>可以切换到2D场景继续游玩。</span><button onclick={()=>setSceneMode('2d')}>使用2D场景</button>{:else}<span>请重新载入当前2D场景。</span>{/if}<button onclick={()=>void start()}>重新载入场景</button></div>{/if}
  <header class="store-snapshot" aria-label="便利店与时间"><div class="address"><span class="address-dot"></span><h2>朝夕便利</h2><SaveStatusIndicator compact/></div><div class="snapshot-line"><button class="clock" aria-label="打开菜单与存档" title="菜单与存档" onclick={()=>run(()=>uiState.modal='settings')}>{time}</button><span>{gameState.time.month}月{gameState.time.day}日 · {weekdayLabel(gameState.time)}<small>24 小时营业</small></span><b><small>可用资金</small>¥ {formatMoney(gameState.player.money)}</b></div></header>
  <div class="store-personal-tools"><button aria-label="便利店随身面板" aria-expanded={personalOpen} onclick={personal}>◌ 随身</button><button data-store-exit title={exitLabel} onclick={()=>run(onExit)}>出门 ↗</button>
    {#if personalOpen}<div class="personal-fold" role="group" aria-label="随身工具"><button onclick={()=>phone()}>手机</button><button onclick={()=>run(()=>uiState.modal='inventory')}>背包</button><button onclick={()=>run(()=>uiState.modal='log')}>行动日志</button><button onclick={()=>run(()=>uiState.modal='settings')}>菜单与存档</button></div>{/if}
  </div>
  <div class="store-left-stack"><aside class="store-status" aria-label="身体状态"><button class="sheet-heading" aria-expanded={statusOpen} onclick={()=>statusOpen=!statusOpen}><strong>身体状态</strong><span>{statusOpen?'收起':'展开'}</span></button>{#if statusOpen}{#each bodyStats as stat}<div class="body-stat" style:--stat-tone={stat.tone}><div>{stat.label}<span>{Math.round(stat.value)} / {stat.max}</span></div><i><b style:width={`${Math.max(0,Math.min(100,stat.value/stat.max*100))}%`}></b></i></div>{/each}{/if}<CharacterAbilities compact /></aside><HomeTodoPanel onOpen={()=>phone('todo')}/></div>
  <HomePhonePocket {time} date={`${gameState.time.month}月${gameState.time.day}日`} balance={gameState.player.money} skin={gameState.phoneSkin} unread={unreadSmsCount(gameState)} expanded={uiState.modal==='phone'} onOpen={()=>phone()}/>

  {#if selected}<aside class="store-interaction" class:has-cart={units>0} data-store-selected={selected.id} role="group" aria-label={`${title}操作`} style:left={popupLeft} style:top={popupTop} style:max-height={`calc(100% - ${popupTop} - 84px)`}>
    <header><div><span class="eyebrow">已选中设施</span><h3>{title}</h3></div><button class="close" aria-label="收起设施操作" onclick={clearSelection}>×</button></header>
    <p>{STORE_FACILITIES[selected.id].description}</p><div class="facility-options">
      {#if displayProducts.length}
        <div class="display-products" aria-label={`${title}商品`}>
          {#each displayProducts as action (action.id)}
            {@const item=getItem(action.itemId!)!}{@const check=facilityPurchaseCheck(gameState,action)}{@const quantity=quantityOf(action.id)}
            <article class="display-product" class:chosen={quantity>0} data-store-product={action.id}>
              <div class="product-copy"><strong>{item.name}</strong><small>¥ {formatMoney(purchasePriceOf(gameState,action))}<span>已持有 {itemCount(gameState,item.id)}</span></small></div>
              <div class="product-quantity" role="group" aria-label={`${item.name}数量`}><button aria-label={`减少${item.name}`} disabled={!quantity||busy} onclick={()=>setQuantity(action.id,quantity-1)}>−</button><output aria-label={`${item.name}已选数量`}>{quantity}</output><button aria-label={`添加${item.name}`} disabled={!check.ok||busy||quantity>=(productRepeatable(action)?99:1)} title={check.reason||item.desc||action.desc} onclick={()=>setQuantity(action.id,quantity+1)}>＋</button></div>
              {#if !check.ok}<small class="product-reason">{check.reason}</small>{/if}
            </article>
          {/each}
        </div>
        <p class="catalog-note">食品默认打包，结算时可改为店内用餐。</p>
      {/if}
      {#if selected.id==='checkout'}<div class="catalog-jumps" aria-label="选购分区">{#each ['fresh','drinks','noodles','seasoning'] as id}<button onclick={()=>choose(id as StoreFacilityId)}>{STORE_FACILITIES[id as StoreFacilityId].title}</button>{/each}</div>{/if}
      {#if selected.id==='checkout'}{@render workButtons()}<NpcTaskCounter/>{@render peopleButtons()}{/if}
      {#if selected.id==='blindbox'}{#if blindBox&&onBlindBox}<button class="option primary" data-store-blindbox disabled={blindBox.disabled} title={blindBox.reason||undefined} onclick={()=>run(onBlindBox)}><strong>{blindBox.title}</strong><small>{blindBox.detail}</small>{#if blindBox.reason}<small>{blindBox.reason}</small>{/if}</button>{/if}{/if}
      {#if selected.id==='seating'}<button class="option" onclick={()=>run(()=>uiState.modal='inventory')}>打开背包，取用食品</button>{@render waitButtons()}{/if}
      {#if selected.id==='door'}<button class="option primary" data-store-leave onclick={()=>run(onExit)}>{exitLabel}</button><button class="option" data-store-door onclick={()=>view?.toggleDoor()}>打开 / 合上玻璃门</button>{/if}
    </div>
    {@render cartControls()}
  </aside>{/if}
  {#if !selected&&units>0}<aside class="store-cart-pocket" aria-label="随身采购清单">{@render cartControls()}</aside>{/if}
  <div class="store-view-tools"><SceneViewControls label="便利店视角控制" leftLabel="便利店向左旋转" rightLabel="便利店向右旋转" disabled={loading||!view} onRotate={(angle)=>{clearOverlays();view?.rotate(angle);}} onZoom={uiState.sceneMode==='2d'?factor=>{if(view&&'zoom'in view)(view.zoom as(factor:number)=>void)(factor);}:undefined} onReset={uiState.sceneMode==='2d'?()=>{if(view&&'resetView'in view)(view.resetView as()=>void)();}:undefined}/></div>
  <div class="store-find"><SceneDisplaySettings {quality} qualityLabel="便利店画质" onQuality={(mode)=>{quality=mode;view?.setQuality(qualityForDevice(mode,uiState.gameMode));}}/></div>
  {#if !selected&&!loading&&!failed}<p class="interaction-hint">点击设施，选择操作</p>{/if}
</section>

<style>
.store-interior{--store-menu-width:320px;--store-panel:rgba(24,52,73,.94);--store-border:#a3c2d666;--store-ink:#edf4f8;--store-muted:#b9d0df;position:relative;width:100%;height:100%;min-height:0;overflow:hidden;color:var(--store-ink);background:#e6edf1;text-shadow:none;}.store-world{position:absolute;inset:0;touch-action:none;}.store-world :global(canvas){display:block;width:100%;height:100%;outline:none;cursor:grab;}button{font:inherit;font-size:12px;border:1px solid var(--store-border);border-radius:9px;background:var(--store-panel);color:var(--store-ink);min-height:40px;padding:8px 12px;cursor:pointer;box-sizing:border-box;backdrop-filter:blur(15px);}button:hover:not(:disabled),button[aria-pressed="true"]{background:#346a90;border-color:#c6b47d;}button:disabled{opacity:.5;cursor:default;}button:focus-visible{outline:2px solid #e6d7ad;outline-offset:3px;}.store-snapshot{position:absolute;z-index:4;left:22px;top:22px;width:292px;box-sizing:border-box;padding:15px 17px;background:var(--store-panel);border:1px solid var(--store-border);border-radius:15px;box-shadow:0 8px 25px #192a2215;backdrop-filter:blur(15px);}.address{display:flex;gap:8px;align-items:center;}.address-dot{width:7px;height:7px;border-radius:50%;background:#d6bf89;}h2{font-size:17px;font-weight:600;letter-spacing:.12em;margin:0;}.address :global(.save-indicator){margin-left:auto;}.snapshot-line{display:flex;align-items:center;gap:13px;margin-top:13px;}.clock{font-size:26px;font-weight:500;letter-spacing:.025em;}.snapshot-line>span{font-size:10px;line-height:1.7;color:var(--store-muted);}.snapshot-line small{display:block;font-size:9px;line-height:1.6;color:var(--store-muted);}.snapshot-line>b{font-size:14px;font-weight:500;margin-left:auto;white-space:nowrap;}.store-personal-tools{position:absolute;z-index:9;right:22px;top:22px;display:flex;gap:7px;}.personal-fold{position:absolute;top:48px;right:0;width:218px;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;background:var(--store-panel);border:1px solid var(--store-border);border-radius:12px;}.store-left-stack{position:absolute;z-index:4;left:22px;top:150px;bottom:90px;width:200px;display:flex;flex-direction:column;gap:10px;overflow:auto;scrollbar-width:thin;pointer-events:none;}.store-left-stack>*{pointer-events:auto;}.store-status{padding:10px 14px;background:var(--store-panel);border:1px solid var(--store-border);border-radius:13px;backdrop-filter:blur(15px);flex-shrink:0;}.sheet-heading{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:28px;padding:0;border:0;background:none;}.sheet-heading strong{font-size:12px;font-weight:500;}.sheet-heading span{font-size:10px;color:var(--store-muted);}.body-stat{margin-top:10px;font-size:11px;}.body-stat>div{display:flex;justify-content:space-between;}.body-stat span{font-size:10px;color:var(--store-muted);}.body-stat>i{display:block;height:3px;border-radius:3px;background:#ffffff1a;margin-top:5px;overflow:hidden;}.body-stat b{display:block;height:100%;background:var(--stat-tone);border-radius:3px;}.interaction-hint{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);margin:0;font-size:11px;color:#eff0e3;text-shadow:0 1px 5px #20362d,0 1px 9px #20362d;pointer-events:none;}.store-interaction{position:absolute;z-index:8;width:var(--store-menu-width);max-width:calc(100% - 28px);box-sizing:border-box;overflow:auto;scrollbar-width:thin;padding:15px;background:var(--store-panel);border:1px solid var(--store-border);border-radius:14px;backdrop-filter:blur(17px);box-shadow:0 10px 35px #15221925;}.store-interaction>header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;}.eyebrow{font-size:9px;letter-spacing:.12em;color:#97c8eb;}h3{font-size:16px;line-height:1.45;font-weight:500;margin:5px 0 0;}.store-interaction .close{border:0;padding:0;min-width:26px;min-height:26px;font-size:20px;background:none;}.store-interaction>p{font-size:11px;line-height:1.75;color:var(--store-muted);margin:11px 0 14px;}.facility-options{display:grid;gap:7px;}.option{width:100%;text-align:left;min-height:44px;}.option strong,.option small{display:block;}.option strong{font-size:12px;font-weight:500;}.option small{font-size:10px;line-height:1.6;color:var(--store-muted);margin-top:5px;}.primary{border-color:#d3be83;background:#167ac2;color:#fff6de;}.primary small{color:#f3ead3;}.option-group-label{font-size:10px;color:var(--store-muted);padding:5px 0;}.wait-options{display:grid;grid-template-columns:1fr 1fr;gap:5px;}.scene-status{position:absolute;z-index:3;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#e6edf1;color:#31543d;font-size:13px;text-align:center;padding:20px;}.scene-status strong{font-size:19px;font-weight:500;}.scene-status.failure{inset:35% 28%;border-radius:14px;padding:18px;background:#f0ebdfdd;}
  @media(max-height:520px) and (min-width:650px){.store-snapshot{top:12px;left:14px;width:284px;padding:10px 13px;}.snapshot-line{margin-top:7px;}.clock{font-size:22px;}.store-personal-tools{top:12px;right:14px;}.store-left-stack{top:106px;left:14px;bottom:67px;width:185px;}.store-interaction{top:76px!important;max-height:calc(100% - 142px)!important;width:270px;}.interaction-hint{bottom:60px;}}
  @media(max-width:700px){.store-snapshot{left:12px;top:12px;width:268px;padding:11px 13px;}.store-personal-tools{right:12px;top:124px;}.store-left-stack{left:12px;top:142px;width:174px;bottom:125px;}.interaction-hint{bottom:115px;}.store-interaction{left:12px!important;top:190px!important;max-height:calc(100% - 310px)!important;}}.display-products{display:grid;gap:6px}.display-product{display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:10px 9px;border:1px solid var(--store-border);border-radius:9px;background:#ffffff05}.display-product.chosen{border-color:#b4dbef;background:#4e9ac818}.product-copy{flex:1;min-width:0}.product-copy strong{display:block;font-size:12px;font-weight:500}.product-copy small{display:block;font-size:11px;color:#b9ddf4;margin-top:5px}.product-copy small span{font-size:9px;color:var(--store-muted);margin-left:9px}.product-quantity{display:flex;align-items:center;gap:3px}.product-quantity button{width:31px;min-height:32px;padding:3px;font-size:17px;border-radius:6px}.product-quantity output{font-size:12px;min-width:18px;text-align:center}.product-reason{width:100%;font-size:10px;color:#edcb93}.catalog-note,.cart-time{font-size:10px;line-height:1.6;color:var(--store-muted);margin:1px 0 5px}.catalog-jumps{display:grid;grid-template-columns:1fr 1fr;gap:5px}.catalog-jumps button{font-size:11px;padding:6px;min-height:35px}.inline-cart{border-top:1px solid var(--store-border);padding-top:10px;margin-top:10px}.cart-heading{display:flex;gap:7px;align-items:center;margin-bottom:7px}.cart-heading button{background:none;border:0;min-height:28px;font-size:11px;padding:2px 0}.cart-toggle{flex:1;text-align:left}.cart-toggle span{font-size:9px;color:var(--store-muted);margin-left:7px}.cart-clear{color:var(--store-muted)}.cart-lines{max-height:135px;overflow:auto;scrollbar-width:thin}.cart-lines>div{display:flex;gap:7px;align-items:center;font-size:11px;margin:5px 0}.cart-lines small{font-size:10px;color:var(--store-muted);margin-left:auto}.cart-lines button{padding:0;min-height:25px;min-width:25px;font-size:16px;background:none;border:0}.dine-options{display:flex;gap:5px;margin:8px 0}.dine-options button{flex:1;min-height:31px;font-size:10px;padding:5px}.checkout{min-height:38px}.store-cart-pocket{position:absolute;right:22px;bottom:78px;width:270px;max-height:calc(100% - 170px);overflow:auto;padding:12px 14px;background:var(--store-panel);border:1px solid var(--store-border);border-radius:13px;backdrop-filter:blur(15px);z-index:7}.store-cart-pocket .inline-cart{border:0;padding:0;margin:0}
  @media(max-height:520px) and (min-width:650px){.store-cart-pocket{right:14px;bottom:66px;width:250px;max-height:calc(100% - 140px)}.display-product{padding:7px}.product-quantity button{min-height:34px}.store-interaction{width:310px}}.store-interaction{display:flex;flex-direction:column;overflow:hidden}.store-interaction>header,.store-interaction>p,.store-interaction>.inline-cart{flex:none}.store-interaction>.facility-options{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#93b5ca88 transparent;padding-right:3px}.store-interaction .cart-lines{max-height:110px;scrollbar-color:#93b5ca88 transparent}
  @media(max-height:520px) and (min-width:650px){.store-interaction{padding:10px 12px}.store-interaction>p{display:none}.store-interaction .inline-cart{padding-top:6px;margin-top:6px}.store-interaction .cart-heading{margin-bottom:2px}.store-interaction .cart-lines{max-height:65px}.store-interaction .cart-time{display:inline-block;margin:3px 0}.store-interaction .dine-options{margin:4px 0}.store-interaction h3{font-size:14px}.product-quantity button{width:36px;min-height:38px}}:global(:root[data-game-mode="mobile"]) .store-interior{--store-menu-width:calc(310px / var(--eff-zoom));}:global(:root[data-game-mode="mobile"]) .store-personal-tools button,:global(:root[data-game-mode="mobile"]) .store-interaction button{font-size:var(--m-fs-md);min-height:var(--m-tap);}:global(:root[data-game-mode="mobile"]) .store-interaction{width:var(--store-menu-width);}:global(:root[data-game-mode="mobile"]) .store-interaction h3{font-size:var(--m-fs-lg);}:global(:root[data-game-mode="mobile"]) .store-interaction>p,:global(:root[data-game-mode="mobile"]) .option small,:global(:root[data-game-mode="mobile"]) .option-group-label{font-size:var(--m-fs-xs);}:global(:root[data-game-mode="mobile"]) .option strong{font-size:var(--m-fs-md);}:global(:root[data-game-mode="mobile"]) .store-interaction .close{min-width:var(--m-tap);}:global(:root[data-game-mode="mobile"]) .personal-fold{top:calc(var(--m-tap) + 8px);width:calc(290px / var(--eff-zoom));}:global(:root[data-game-mode="mobile"]) .product-copy strong,:global(:root[data-game-mode="mobile"]) .product-quantity output{font-size:var(--m-fs-md);}:global(:root[data-game-mode="mobile"]) .product-copy small,:global(:root[data-game-mode="mobile"]) .product-copy small span,:global(:root[data-game-mode="mobile"]) .cart-time,:global(:root[data-game-mode="mobile"]) .cart-toggle span,:global(:root[data-game-mode="mobile"]) .catalog-note,:global(:root[data-game-mode="mobile"]) .cart-lines>div,:global(:root[data-game-mode="mobile"]) .cart-lines small{font-size:var(--m-fs-xs);}:global(:root[data-game-mode="mobile"]) .product-quantity button{min-width:var(--m-tap);}:global(:root[data-game-mode="mobile"]) .store-cart-pocket{width:calc(270px / var(--eff-zoom));bottom:calc(var(--m-tap) + 24px);}

.store-view-tools,.store-find{position:absolute;z-index:8;bottom:max(16px,var(--sai-bottom,0px));display:flex;align-items:center;gap:6px;}
.store-view-tools{left:max(18px,var(--sai-left,0px));}.store-find{right:max(18px,var(--sai-right,0px));}
.interaction-hint{bottom:max(70px,calc(var(--sai-bottom,0px) + 56px));}
@media(max-width:700px),(max-height:520px){.store-view-tools,.store-find{bottom:max(12px,var(--sai-bottom,0px));}.store-view-tools{left:max(12px,var(--sai-left,0px));}.store-find{right:max(12px,var(--sai-right,0px));}}
</style>
