<script lang="ts">
  import {overlayPortal} from '../../lib/overlayPortal';
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {getAction,canPerform,type ActionDef} from '../../game/core/actions';
  import {HOUSING_OFFERS} from '../../game/data/housingOffers';
  import {HOUSING,getLeaseTier,getBuyTier} from '../../game/core/housing';
  import {VEHICLE_NAMES,VEHICLE_BUY,VEHICLE_DEPOSIT} from '../../game/core/vehicle';
  import {JOB_DEFS,checkJobRequirements,applyForJob} from '../../game/core/jobs';
  import {scaleCost} from '../../game/core/difficulty';
  import {formatMoney} from '../../lib/format';
  import HomeTour from './HomeTour.svelte';
  import CompanyServices from './CompanyServices.svelte';
  let {onAction}:{onAction:(a:ActionDef)=>void}=$props();
  let selected=$state(''),window=$state(''),preview=$state(''),replaceJob=$state('');
  const venue=$derived(gameState.locationId);
  const offer=$derived(HOUSING_OFFERS.find(o=>o.lease===selected));
  const eligible=$derived(JOB_DEFS.filter(j=>j.kind==='formal'&&checkJobRequirements(gameState,j).ok));
  $effect(()=>{venue;selected='';window='';preview='';replaceJob='';});
  const portal=overlayPortal;
  function run(id:string){const a=getAction(id);if(!a)return;const check=canPerform(gameState,a);if(!check.ok){showToast(check.reason??'暂时不可办理');return;}selected='';onAction(a);}
  function hire(id:string,replace=false){const job=JOB_DEFS.find(j=>j.id===id);if(!job)return;if(gameState.career.jobId&&gameState.career.jobId!==id&&!replace){replaceJob=id;return;}const result=applyForJob(gameState,job,replace);if(result.ok){markSessionDirty();showToast('已入职'+job.name);replaceJob='';}else showToast(result.reason??'暂时无法入职');}
  function vehicleAction(type:string,kind:'rent'|'buy'|'return'){
    if(kind==='rent')return type==='car'?'rent_car_shop':'rent_'+type+'_shop';
    if(kind==='return')return 'return_'+type+'_shop';
    return type==='bicycle'?'buy_bicycle_shop':'buy_'+type;
  }
</script>
{#if venue==='housing_agency'}
 <section class="service-catalog" aria-label="房屋租赁所房源"><h3>房源</h3><div class="catalog">{#each HOUSING_OFFERS as o}<button onclick={()=>selected=o.lease}>{o.name}</button>{/each}</div></section>
{:else if venue==='car_rental'}
 <section class="service-catalog" aria-label="载具租赁窗口"><h3>选择载具</h3><div class="catalog">{#each Object.entries(VEHICLE_NAMES) as [id,name]}<button onclick={()=>selected=id}>{name}</button>{/each}</div></section>
{:else if venue==='municipal_hall'}
 <section class="service-catalog" aria-label="市政服务窗口"><h3>市政服务大厅</h3><div class="catalog"><button onclick={()=>window='passes'}>通行证窗口</button><button onclick={()=>window='jobs'}>求职窗口</button><button onclick={()=>window='company'}>企业窗口</button></div></section>
{:else if ['hotel','hotel_mooncourt'].includes(venue)}
 <section class="service-catalog" aria-label="酒店前台"><h3>酒店前台</h3><p>入住预付一晚房费，住客堂食已包含。</p><div class="catalog">{#each HOUSING.nightly.filter(h=>h.locationId===venue) as room}<button onclick={()=>run(room.id==='hotel'?'stay_hotel':'stay_'+room.id)}>{room.name}<small>{formatMoney(room.price)} 元／晚</small></button>{/each}</div></section>
{/if}
<CompanyServices/>
{#if selected||window||preview}
 <div class="service-overlay hud-scope" use:portal>
 {#if preview}
  <div class="preview" role="dialog" aria-modal="true" aria-label="房屋预览"><HomeTour homeId={preview} preview3d onExit={()=>preview=''}/></div>
 {:else}
  <div class="service-dialog" role="dialog" aria-modal="true" aria-label={offer?.name??VEHICLE_NAMES[selected]??(window==='jobs'?'求职窗口':window==='company'?'企业窗口':'通行证窗口')} tabindex="-1">
   <button class="close" aria-label="关闭服务窗口" onclick={()=>{selected='';window='';replaceJob='';}}>×</button>
   {#if venue==='housing_agency'&&offer}
    {@const lease=getLeaseTier(offer.lease)!}{@const buy=getBuyTier(offer.buy)}
    <h3>{offer.name}</h3><p>{lease.desc}</p><p>月租 {formatMoney(lease.price)} 元{#if buy} · 买断 {formatMoney(scaleCost(gameState,buy.buyPrice!))} 元{/if}</p>
    {#if !offer.buy}<p>校园住房仅供租赁，签约时发放学生通行证。</p>{/if}
    <div class="choices"><button onclick={()=>run(offer.sign)}>签约</button><button disabled={!buy} onclick={()=>run(offer.purchase)}>买断{!buy?' · 不开放':''}</button><button onclick={()=>preview=offer.buy||offer.lease}>预览</button></div>
   {:else if venue==='car_rental'}
    <h3>{VEHICLE_NAMES[selected]}</h3><p>租用押金 {formatMoney(scaleCost(gameState,VEHICLE_DEPOSIT[selected]))} 元 · 买断 {formatMoney(scaleCost(gameState,VEHICLE_BUY[selected]))} 元</p><p>退租返还押金；买断时已交押金抵扣车款。</p>
    <div class="choices"><button onclick={()=>run(vehicleAction(selected,'rent'))}>租用</button><button onclick={()=>run(vehicleAction(selected,'buy'))}>买断</button>{#if gameState.vehicles[selected]&&!gameState.vehicles[selected].owned}<button onclick={()=>run(vehicleAction(selected,'return'))}>退租</button>{/if}</div>
   {:else if window==='company'}
    <CompanyServices municipal/>
   {:else if window==='passes'}
    <h3>通行证窗口</h3>{#each ['municipal_apply_student_pass','municipal_apply_industry_pass'] as id}{@const a=getAction(id)!}{@const c=canPerform(gameState,a)}<button class="wide" disabled={!c.ok} onclick={()=>run(id)}>{a.name}<small>{c.ok?a.desc:c.reason}</small></button>{/each}
   {:else if window==='jobs'}
    <h3>求职窗口</h3><p>以下岗位已满足当前应聘条件。入职后前往单位上班。</p>
    {#if replaceJob}<div class="replace"><p>确认结清原岗位并更换工作？</p><button onclick={()=>hire(replaceJob,true)}>确认换岗</button><button onclick={()=>replaceJob=''}>取消</button></div>{/if}
    {#each eligible as job}<button class="wide" disabled={gameState.career.jobId===job.id||!!gameState.work?.active} onclick={()=>hire(job.id)}>{job.name}<small>{gameState.career.jobId===job.id?'当前在职':job.desc}</small></button>{/each}
    {#if !eligible.length}<p>目前还没有符合条件的岗位。</p>{/if}
   {/if}
  </div>
 {/if}
 </div>
{/if}
<style>
.service-catalog{padding:16px;border:1px solid var(--hud-border,var(--border));border-radius:10px;background:var(--hud-surface-solid,var(--bg-card));color:var(--hud-text,var(--text-main))}.service-catalog h3{margin:0 0 12px;font-size:15px}.service-catalog p{font-size:12px;color:var(--hud-text-dim,var(--text-dim))}.catalog{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.service-catalog button,.service-dialog button{font:inherit;font-size:13px;min-height:46px;border:1px solid var(--hud-border,var(--border));border-radius:8px;background:var(--bg-card);color:inherit;padding:12px;cursor:pointer;text-align:left}.service-catalog button:hover:not(:disabled),.service-dialog button:hover:not(:disabled){background:var(--bg-card-hover);border-color:var(--accent)}.service-catalog button:disabled,.service-dialog button:disabled{opacity:.45;cursor:default}.service-overlay{position:fixed;inset:0;z-index:1600;background:#080c19b8;display:grid;place-items:center;padding:16px;box-sizing:border-box}.service-dialog{position:relative;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;width:min(580px,100%);background:var(--hud-surface-solid,var(--bg-soft));color:var(--hud-text,var(--text-main));border:1px solid var(--hud-border,var(--border));border-radius:12px;padding:22px}.service-dialog h3{margin:0 35px 18px 0;color:var(--accent);font-size:17px}.service-dialog p{font-size:13px;line-height:1.8}.service-dialog .close{position:absolute;right:10px;top:10px;min-height:32px;padding:4px 12px;font-size:20px}.choices{display:flex;gap:8px;margin-top:20px}.choices>*{flex:1;text-align:center!important}.wide{display:block;width:100%;text-align:left;margin:9px 0}small{display:block;font-size:11px;line-height:1.6;margin-top:5px;color:var(--hud-text-dim,var(--text-dim))}.preview{position:fixed;inset:0;z-index:1;background:var(--bg-deep)}.replace{padding:12px;background:var(--bg-card);border-radius:8px}.replace button{margin-right:8px}
@media(max-height:480px){.service-dialog{padding:16px}.catalog{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))}.service-catalog{padding:12px}}
</style>
