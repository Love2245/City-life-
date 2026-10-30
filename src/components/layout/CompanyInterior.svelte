<script lang="ts">
  import {qualityForDevice} from '../../lib/sceneMode';
  import { onMount } from 'svelte';
  import { gameState } from '../../stores/gameStore.svelte';
  import { uiState, setSceneMode } from '../../stores/uiStore.svelte';
  import { officeSeats, OFFICE_ADDRESSES } from '../../game/core/companyOffice';
  import { companyOverview } from '../../game/core/companyOverview';
  import { weekdayLabel } from '../../game/core/calendar';
  import { formatTime } from '../../game/core/time';
  import { beginSceneLoading, type LoadingHandle } from '../../stores/sceneLoading.svelte';
  import {beginTravelLoading} from '../../stores/sceneLoadingRoute.svelte';
  import {returnHomeFromCompany} from '../../game/core/companyReturnHome';
  import {showToast} from '../../stores/uiStore.svelte';
  import {playSound,playInteractionSound} from '../../lib/audio';
  import { sceneLoadingTarget } from '../../lib/sceneLoadingTarget';
  import { overlayPortal } from '../../lib/overlayPortal';
  import type { OfficeLabel, createCompanyOffice } from '../../lib/companyOffice3D';
  import type {createCompanyStill} from '../../lib/companyStillView';
  import type { QualityMode } from '../../lib/scenePipeline';
  import CompanyPanel from './CompanyPanel.svelte';
  import SceneDisplaySettings from './SceneDisplaySettings.svelte';
  import SceneViewControls from './SceneViewControls.svelte';
  import SaveStatusIndicator from './SaveStatusIndicator.svelte';
  import HomeTodoPanel from './HomeTodoPanel.svelte';
  import HomePhonePocket from './HomePhonePocket.svelte';
  import CharacterAbilities from '../CharacterAbilities.svelte';
  import CompanyDepartureMenu from './CompanyDepartureMenu.svelte';
  import { formatMoney } from '../../lib/format';
  import { currentWeather, WEATHER_LABEL } from '../../game/core/weather';
  import { unreadSmsCount } from '../../game/core/phone';
  import { getMaxStamina } from '../../game/core/stats';
  let { onExit,waitOptions=[],onWait }: { onExit: () => void;waitOptions?:{hours:number;label:string;smart?:boolean}[];onWait?:(hours:number)=>void } = $props();
  const c = $derived(gameState.company!), o = $derived(companyOverview(gameState)!);
  const seats = $derived(officeSeats(gameState));
  const address=$derived(OFFICE_ADDRESSES[c.stage-1]!);
  let host: HTMLDivElement, view = $state.raw<ReturnType<typeof createCompanyOffice>|ReturnType<typeof createCompanyStill>>();
  let labels = $state<OfficeLabel[]>([]), ready = $state(false), panel = $state(false), selectedEmployee = $state('');
  let quality = $state<QualityMode>('auto');
  let personalOpen=$state(false),statusOpen=$state(false),showSeats=$state(true),departureOpen=$state(false),waitingOpen=$state(false);
  let snapshotHeight=$state(94);
  function measureSnapshot(node:HTMLElement){if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(()=>snapshotHeight=node.offsetHeight);observer.observe(node);return{destroy:()=>observer.disconnect()};}
  const time=$derived(formatTime(gameState.time.hour,gameState.time.minute));
  const bodyStats=$derived([{label:'体力',value:gameState.player.attrs.stamina,max:getMaxStamina(gameState)},{label:'健康',value:gameState.player.attrs.health,max:100},{label:'干净',value:gameState.player.attrs.hygiene,max:100},{label:'心情',value:gameState.player.attrs.mood,max:100},{label:'饱腹',value:gameState.player.attrs.satiety,max:100}]);
  function phone(start:'home'|'todo'='home'){personalOpen=false;waitingOpen=false;playInteractionSound('mouse');uiState.phoneStartApp=start;uiState.modal='phone';}
  let destroyed = false, generation = 0, task: LoadingHandle | undefined;
  function departure(){personalOpen=false;waitingOpen=false;departureOpen=!departureOpen;}
  function waitHere(hours:number){waitingOpen=false;onWait?.(hours);}
  function goHome(){const result=returnHomeFromCompany(gameState);if(!result.ok){showToast(result.reason??'暂时无法回家');return;}departureOpen=false;beginTravelLoading();playSound('walk');}
  let selectedSeat=$state<number|undefined>(undefined);
  function choose(index: number) {selectedSeat=index>=0?index:undefined; if(index<0){departure();return;}playInteractionSound('mouse');departureOpen=false;selectedEmployee = index ? seats[index]?.personId ?? '' : ''; panel = true; }
  async function start(restart = false) {
    const run = ++generation;
    view?.dispose(); view = undefined; ready = false; labels = [];
    const loading = beginSceneLoading({ ...sceneLoadingTarget(gameState, uiState.sceneMode), retry: () => { void start(true); }, fallback:uiState.sceneMode==='3d'?() => { task?.cancel(); setSceneMode('2d'); }:undefined }, restart); task = loading;
    try {
      if (!await loading.covered || destroyed || run !== generation || !loading.active()) return;
      host.dataset.sceneLoadingOwner = String(loading.id);
      const still=uiState.sceneMode==='2d';
      const factory=still?await import('../../lib/companyStillView'):await import('../../lib/companyOffice3D');
      if (destroyed || run !== generation || !loading.active()) return;
      const create= 'createCompanyStill' in factory ? factory.createCompanyStill : factory.createCompanyOffice;
      const office = create(host, c.stage, values => { if (!destroyed && run === generation) labels = values; }, choose, qualityForDevice(quality,uiState.gameMode), uiState.renderScale,uiState.renderResolution);
      view = office; office.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight); office.update(seats, gameState.time.hour+gameState.time.minute/60,currentWeather(gameState),gameState.time.month); await office.ready;
      if (destroyed || run !== generation || !loading.active()) { office.dispose(); return; }
      ready = true; loading.ready();
    } catch { if (!destroyed && run === generation) { view?.dispose(); view = undefined; loading.fail('办公室场景暂时无法载入，请重新载入。'); } }
  }
  onMount(() => { void start(); return () => { destroyed = true; generation++; task?.cancel(); view?.dispose(); }; });
  $effect(() => { view?.update(seats, gameState.time.hour+gameState.time.minute/60,currentWeather(gameState),gameState.time.month); });
  $effect(() => { view?.setResolution(uiState.renderScale,uiState.renderResolution); });
  $effect(() => { view?.setWalls(uiState.homeWallMode,uiState.homeLowWallHeight); });
  $effect(() => { if(panel||uiState.modal)waitingOpen=false;if(uiState.modal){personalOpen=false;panel=false;departureOpen=false;} });
  function updateQuality(mode: QualityMode) { if(quality===mode)return;quality = mode;if(uiState.sceneMode==='3d')void start(true);else view?.setQuality(mode); }
</script>
<svelte:window onkeydown={e=>{if(e.key==='Escape'){panel=false;personalOpen=false;statusOpen=false;departureOpen=false;waitingOpen=false;}}}/>
<section class="office" style:--snapshot-height={`${snapshotHeight}px`} data-company-office={c.stage} aria-label={`${o.stage.name}办公场景`}>
  <div class="world" bind:this={host}>
    {#if !ready}<div class="scene-placeholder" role="status">正在准备办公室画面…</div>{/if}
  </div>
  {#if ready}<div class="labels" class:quiet={!showSeats}>{#each labels.filter(l => l.visible) as label (label.index)}{#if label.index<0}<button class="office-door-target" aria-label={c.stage===4?'办公室电梯 · 离开楼层':'办公室门 · 出门'} style:left={`${label.x}%`} style:top={`${label.y}%`} data-office-door aria-expanded={departureOpen} onclick={departure}>{c.stage===4?'乘电梯 ↗':'出门 ↗'}</button>{:else}{@const seat = seats[label.index]!}<button class="seat-label" class:vacant={!seat.personId} aria-label={`${seat.name} · ${seat.status}`} title={seat.status} style:left={`${label.x}%`} style:top={`${label.y}%`} data-office-seat={seat.index} onclick={() => choose(seat.index)}><span>{seat.index===0?'⌘':seat.personId?'●':'+'}</span><b>{seat.index===0?'我的办公桌':seat.name}</b></button>{/if}{/each}</div>{/if}
  <header class="office-snapshot" use:measureSnapshot aria-label="公司与时间"><div class="address"><i></i><h2 title={o.stage.name}>{c.name}</h2><SaveStatusIndicator compact/></div><div class="building-address">{address.building} · {address.floor}F <span>{c.stage===4?'独立整层':address.room+'室'}</span></div><div class="snapshot-line"><button class="clock" aria-label="打开菜单与存档" onclick={()=>uiState.modal='settings'}>{time}</button><span>{gameState.time.month}月{gameState.time.day}日 · {weekdayLabel(gameState.time)}<small>{WEATHER_LABEL[currentWeather(gameState)]}</small></span><b class="wallet"><small>可用资金</small>¥ {formatMoney(gameState.player.money)}</b></div></header>
  <div class="office-tools"><button aria-expanded={personalOpen} onclick={()=>{waitingOpen=false;personalOpen=!personalOpen;}}>◌ 随身</button>{#if onWait&&waitOptions.length}<button class="wait-toggle" aria-label="办公室等待" aria-expanded={waitingOpen} onclick={()=>{personalOpen=false;departureOpen=false;waitingOpen=!waitingOpen;}}>等待</button>{/if}<button aria-expanded={departureOpen} onclick={departure}>出门 ↗</button>{#if personalOpen}<div class="personal-fold"><button onclick={()=>phone()}>▣ 手机</button><button onclick={()=>{personalOpen=false;uiState.modal='inventory';}}>背包</button><button onclick={()=>{personalOpen=false;uiState.modal='log';}}>行动日志</button><button onclick={()=>statusOpen=!statusOpen}>身体状态</button><button onclick={()=>{personalOpen=false;uiState.modal='settings';}}>菜单与存档</button></div>{/if}</div>
  {#if waitingOpen}<div class="company-wait" aria-label="办公室等待时长"><strong>在公司等一会</strong><p>等待期间员工仍按排班工作，工资租金正常计算。</p>{#each waitOptions as option}<button onclick={()=>waitHere(option.hours)}>{option.label}</button>{/each}</div>{/if}
  {#if departureOpen}<div class="company-departure"><CompanyDepartureMenu onHome={goHome} {onExit} onClose={()=>departureOpen=false}/></div>{/if}
  <div class="office-left-stack"><aside class="office-status"><div class="sheet-heading"><strong>{o.stopped?'欠款停工':'公司经营'}</strong><span>{o.people} / {o.stage.capacity} 人</span></div><p>公司账户 <b>¥ {formatMoney(c.balanceCents/100)}</b></p><p>累计交付 <b>{gameState.developmentHistory?.total??0} 件</b></p><button class="manage" onclick={()=>{selectedSeat=undefined;selectedEmployee='';panel=true;}}>公司经营 <span>↗</span></button>{#if o.requests.length}<button class="requests" onclick={()=>{selectedEmployee=o.requests[0]?.id??'';panel=true;}}>{o.requests.length} 项员工请求待处理</button>{/if}</aside><HomeTodoPanel onOpen={()=>phone('todo')}/>{#if statusOpen}<aside class="body-sheet"><strong>身体状态</strong>{#each bodyStats as stat}<div class="body-stat">{stat.label}<span>{Math.round(stat.value)} / {stat.max}</span><progress max={stat.max} value={stat.value}></progress></div>{/each}<CharacterAbilities compact/></aside>{/if}</div>
  <HomePhonePocket {time} date={`${gameState.time.month}月${gameState.time.day}日`} balance={gameState.player.money} skin={gameState.phoneSkin} unread={unreadSmsCount(gameState)} expanded={uiState.modal==='phone'} onOpen={()=>phone()}/>
  <div class="office-view-tools">{#if ready}<SceneViewControls onRotate={angle=>view?.rotate(angle)} onZoom={uiState.sceneMode==='2d'?factor=>{if(view&&'zoom'in view)(view.zoom as(factor:number)=>void)(factor);}:undefined} onReset={uiState.sceneMode==='2d'?()=>{if(view&&'resetView'in view)(view.resetView as()=>void)();}:undefined}/><button onclick={()=>view?.reset()}>复位视角</button><button aria-pressed={showSeats} onclick={()=>showSeats=!showSeats}>工位标记</button>{/if}</div>
  <div class="office-find"><SceneDisplaySettings home {quality} qualityLabel="办公室画质" onQuality={updateQuality}/></div>
</section>
{#if panel}<div class="company-overlay hud-scope" use:overlayPortal><CompanyPanel employeeId={selectedEmployee} seatIndex={selectedSeat} onClose={() => panel = false}/></div>{/if}
<style>
.building-address{display:flex;justify-content:space-between;gap:12px;margin-top:7px;font-size:11px;line-height:1.6;color:var(--hud-text-dim)}.building-address span{white-space:nowrap}.office-snapshot{border-top:3px solid var(--accent-2)}.office-status .sheet-heading strong{font-weight:600;letter-spacing:.04em}.office-status .manage{border-radius:7px}.seat-label{box-shadow:0 3px 12px #182c3324}.office-door-target{border-left-width:3px}
:global(:root[data-game-mode="mobile"]) .building-address{font-size:var(--m-fs-xs,12px)}
.scene-placeholder{color:var(--hud-text-dim);font-size:13px}
.company-wait{position:absolute;z-index:40;right:max(18px,var(--sai-right,0px));top:70px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(320px,calc(100% - 36px));padding:14px;box-sizing:border-box;background:var(--hud-surface-solid);border:1px solid var(--hud-border);border-radius:12px;max-height:calc(100% - 136px);overflow:auto}.company-wait strong,.company-wait p{grid-column:1/-1}.company-wait strong{font-size:14px}.company-wait p{margin:0 0 4px;font-size:12px;line-height:1.6;color:var(--hud-text-dim)}.company-wait button{min-height:44px;border:1px solid var(--hud-border);border-radius:8px;padding:8px;background:color-mix(in srgb,var(--hud-text) 5%,transparent)}.office-tools>.wait-toggle{min-height:44px}
:global(:root[data-game-mode="mobile"]) .office-tools>button{min-height:var(--m-tap,44px)}
:global(:root[data-game-mode="mobile"]) .company-wait button{min-height:var(--m-tap,44px);font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) .company-wait strong{font-size:var(--m-fs-sm,14px)}
:global(:root[data-game-mode="mobile"]) .company-wait p{font-size:var(--m-fs-xs,12px)}
@media(max-width:640px) and (orientation:portrait){.company-wait{top:168px}}
.company-departure{position:absolute;z-index:40;right:max(18px,var(--sai-right,0px));top:66px;max-height:calc(100% - 136px);overflow:auto;border-radius:12px}
.office-door-target{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border:1px solid var(--accent-2);border-radius:9px;min-height:38px;padding:8px 13px;background:var(--hud-surface-solid);color:var(--hud-text);box-shadow:0 4px 14px #0004;white-space:nowrap;font-size:12px;z-index:3}.office-door-target:hover{background:color-mix(in srgb,var(--accent-2) 20%,var(--hud-surface-solid))}
.office{--panel:var(--hud-surface);--border:var(--hud-border);position:relative;min-height:440px;width:100%;height:100%;overflow:hidden;background:#c6ceca;color:var(--hud-text)}.world,.labels{position:absolute;inset:0}.world{display:grid;place-items:center;touch-action:none}.world :global(canvas){display:block;width:100%;height:100%}button{font:inherit;cursor:pointer;color:inherit}button:focus-visible{outline:2px solid var(--accent-2);outline-offset:3px}.office-snapshot{position:absolute;z-index:8;left:max(18px,var(--sai-left,0px));top:max(18px,var(--sai-top,0px));width:330px;max-width:calc(100% - 230px);padding:12px 16px;border:1px solid var(--border);border-radius:13px;background:var(--panel);box-shadow:0 6px 24px #0003;backdrop-filter:blur(14px)}.address{display:flex;gap:7px;align-items:center;min-width:0}.address i{width:5px;height:5px;border-radius:50%;background:var(--accent-2);flex:none}.address h2{font-size:12px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.snapshot-line{display:flex;gap:12px;align-items:center;margin-top:10px}.clock{font-size:26px;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums;background:none;border:0;padding:0;color:var(--hud-text)}.snapshot-line>span{font-size:10px;line-height:1.5;color:var(--hud-text-dim);white-space:nowrap}.snapshot-line small{display:block;color:var(--hud-text-dim);font-size:9px}.wallet{margin-left:auto;padding-left:12px;border-left:1px solid var(--border);font-size:13px;white-space:nowrap;color:var(--accent)}.wallet small{margin-bottom:3px;font-weight:400}.office-tools{position:absolute;right:max(18px,var(--sai-right,0px));top:max(18px,var(--sai-top,0px));z-index:8;display:flex;gap:7px}.office-tools>button,.office-view-tools>button{border:1px solid var(--border);border-radius:9px;padding:9px 12px;font-size:12px;min-height:38px;background:var(--panel);color:var(--hud-text);backdrop-filter:blur(12px);white-space:nowrap}.personal-fold{position:absolute;right:0;top:48px;display:grid;grid-template-columns:1fr 1fr;gap:6px;width:290px;padding:10px;max-height:calc(100vh - 140px);overflow:auto;border:1px solid var(--border);border-radius:13px;background:var(--hud-surface-solid);box-shadow:0 12px 30px #0004}.personal-fold button{border:1px solid var(--border);background:color-mix(in srgb,var(--hud-text) 5%,transparent);border-radius:8px;padding:10px;min-height:40px;text-align:left;font-size:12px}.office-left-stack{position:absolute;z-index:4;left:max(18px,var(--sai-left,0px));top:calc(max(18px,var(--sai-top,0px)) + var(--snapshot-height,94px) + 10px);bottom:78px;display:flex;flex-direction:column;align-items:flex-start;gap:12px;max-width:228px;pointer-events:none}.office-status,.body-sheet{box-sizing:border-box;width:228px;border:1px solid var(--border);border-radius:13px;background:var(--panel);padding:13px 16px;box-shadow:0 6px 24px #0003;backdrop-filter:blur(14px);pointer-events:auto;flex:none}.sheet-heading{display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:9px;font-size:12px}.sheet-heading span{font-size:10px;color:var(--hud-text-dim)}.office-status p{display:flex;justify-content:space-between;font-size:11px;color:var(--hud-text-dim);margin:12px 0}.office-status b{font-weight:500;color:var(--hud-text)}.manage{width:100%;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,var(--accent-2) 10%,transparent);padding:10px 12px;min-height:40px;font-size:12px}.manage span{color:var(--accent-2)}.requests{padding:8px 0 0;font-size:10px;background:none;border:0;color:var(--warn)}.body-sheet{position:absolute;left:244px;top:0}.body-sheet>strong{font-size:12px}.body-stat{font-size:11px;margin-top:10px}.body-stat span{float:right;color:var(--hud-text-dim)}progress{display:block;width:100%;height:4px;margin-top:5px;accent-color:var(--accent-2)}.labels{pointer-events:none}.seat-label{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;background:var(--hud-surface);color:var(--hud-text);border:1px solid var(--border);border-radius:8px;box-shadow:0 3px 10px #0002;padding:6px 9px;min-height:30px;font-size:11px;white-space:nowrap;backdrop-filter:blur(10px)}.seat-label b{font-weight:500}.seat-label>span{color:var(--accent-2);font-size:9px;margin-right:5px}.seat-label.vacant{opacity:.6}.seat-label:hover,.seat-label:focus-visible{opacity:1;border-color:var(--accent-2)}.labels.quiet .seat-label{opacity:0}.labels.quiet .seat-label:hover,.labels.quiet .seat-label:focus-visible{opacity:1}.office-view-tools,.office-find{position:absolute;z-index:8;bottom:max(16px,var(--sai-bottom,0px));display:flex;gap:6px;align-items:center}.office-view-tools{left:max(18px,var(--sai-left,0px))}.office-find{right:max(18px,var(--sai-right,0px))}.company-overlay{position:fixed;inset:0;z-index:1650;display:flex;align-items:center;justify-content:center;padding:max(12px,var(--sai-top,0px)) max(12px,var(--sai-right,0px)) max(12px,var(--sai-bottom,0px)) max(12px,var(--sai-left,0px));background:#08151faa;backdrop-filter:blur(5px);box-sizing:border-box}
@media(max-width:760px){.office-snapshot{width:290px;padding:10px 12px}.office-left-stack{max-width:200px}.office-status{width:200px}.office-tools{gap:5px}.seat-label{font-size:10px;padding:5px 7px}.office-view-tools>button{font-size:11px;padding:7px}.body-sheet{left:0;top:180px}}
@media(max-height:520px){.office{min-height:280px}.office-snapshot{top:12px;left:14px;padding:9px 12px;width:300px}.snapshot-line{margin-top:6px}.office-left-stack{top:calc(12px + var(--snapshot-height,94px) + 10px);left:14px;bottom:64px;gap:8px;max-width:215px}.office-status{width:215px;padding:10px 12px}.office-status p{margin:8px 0}.office-tools{top:12px;right:14px}.office-view-tools,.office-find{bottom:max(12px,var(--sai-bottom,0px))}.office-view-tools{left:max(12px,var(--sai-left,0px))}.office-find{right:max(12px,var(--sai-right,0px))}.company-overlay{padding:8px}.body-sheet{left:230px;top:0;max-height:calc(100vh - 176px);overflow:auto}}
@media(max-width:640px) and (orientation:portrait){.office-snapshot{right:18px;top:15px;width:auto;max-width:none}.office-tools{top:113px}.office-left-stack{top:168px}.office-view-tools>button{display:none}}
</style>
