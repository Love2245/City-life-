<script lang="ts">
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {COMPANY_SCALES,COMPANY_TOPICS} from '../../game/core/companyConfig';
  import {companyProjectQuote,companyProjectTerms,companyProjectRoyaltyAddition,companyNextMilestone} from '../../game/core/companyProjects';
  import {forecastCompanyCash} from '../../game/core/companyForecast';
  import {fromLinearDay,START_EPOCH} from '../../game/core/calendar';
  import {companyOverview} from '../../game/core/companyOverview';
  import {forecastCompanyToday} from '../../game/core/companyToday';
  import {changeCompanyProject,startCompanyProject,setCompanyNextProject,type CompanyResult} from '../../game/core/company';
  import type {CompanyLane,CompanyScale,CompanyProjectMode,CompanyProject} from '../../game/companyTypes';
  let {onWork,onTeam}:{onWork:(role:CompanyLane|'maintenance')=>void;onTeam:()=>void}=$props();
  const c=$derived(gameState.company!),o=$derived(companyOverview(gameState)!);
  const forecast=$derived(forecastCompanyCash(gameState));
  const today=$derived(forecastCompanyToday(gameState));
  const pendingRoyalty=$derived(c.programming?companyProjectRoyaltyAddition(c.royaltyCents,c.stage,c.programming):0);
  const maintenanceLoss=$derived(c.royaltyCents-o.nextRoyaltyCents);
  let mode=$state<CompanyProjectMode>('product');
  let form=$state<CompanyLane|null>(null),topic=$state('工具软件'),scale=$state<CompanyScale>('small'),repeat=$state(false),cancelId=$state('');
  const number=(v:number)=>v.toLocaleString('zh-CN',{maximumFractionDigits:2});
  const money=(cents:number)=>number(cents/100);
  function run(action:()=>CompanyResult,text:string){const r=action();if(r.ok){markSessionDirty();if(text)showToast(text);}else showToast(r.reason??'暂时不能办理');return r.ok;}
  function date(minute:number|null|undefined){if(minute==null)return '需安排员工或亲自参与';const d=fromLinearDay(START_EPOCH+Math.floor(minute/1440));return `${d.month}月${d.day}日 ${Math.floor(minute%1440/60)}:${String(minute%60).padStart(2,'0')}`;}
  function open(lane:CompanyLane){form=lane;topic=COMPANY_TOPICS[lane][0]!;scale='small';repeat=false;mode=lane==='design'?'contract':'product';}
  function start(lane:CompanyLane){if(run(()=>startCompanyProject(gameState,lane,topic,scale,repeat,mode),''))form=null;}
  function changeNext(lane:CompanyLane,p:CompanyProject,key:'scale'|'mode',value:string){
    const plan={topic:COMPANY_TOPICS[lane].includes(p.next?.topic??p.topic)?p.next?.topic??p.topic:COMPANY_TOPICS[lane][0]!,scale:p.next?.scale??p.scale,mode:p.next?.mode??p.mode??(lane==='design'?'contract':'product')};
    if(key==='scale')plan.scale=value as CompanyScale;else plan.mode=value as CompanyProjectMode;
    if(plan.mode==='product'&&plan.scale==='short')plan.scale='small';
    run(()=>setCompanyNextProject(gameState,lane,plan),'下一项目已安排，当前进度保留');
  }
  function switchProject(lane:CompanyLane){if(run(()=>changeCompanyProject(gameState,lane,'pause'),'当前进度已保留'))open(lane);}
</script>
<section class="projects" aria-label="公司项目" id="company-projects">
  <h3>正在做的项目</h3>
  <p class="today-summary" data-company-today-total={today.total}>{today.total>0?'员工今日还可推进 '+number(today.total)+' 点':!today.workingDay?'今天是休息日':gameState.time.hour>=17?'员工今日已收工':'今日暂无员工推进'}<small>按当前排班预计至17:00，不含主角工作。</small></p>
  {#each ['programming','design'] as const as lane}
    {@const p=c[lane]}
    <article class="project" aria-label={lane==='programming'?'编程项目':'设计项目'}>
      <div class="line"><span class="kind">{lane==='programming'?'编程 · 接单或自研':'设计 · 委托订单'}</span>{#if p}<span class="badge">{COMPANY_SCALES[p.scale].name} · {companyProjectTerms(p).priceCents?'委托':'自研'}</span>{/if}</div>
      {#if p}
        {@const terms=companyProjectTerms(p)}{@const next=companyNextMilestone(p)}{@const estimate=forecast.projectEstimates[lane]}
        <div class="line title"><h4>{p.topic}</h4><b>{(p.progress/terms.work*100).toFixed(1)}%</b></div>
        <div class="progress-track" data-project-progress={lane} data-current-progress={p.progress} data-today-progress={today.progress[lane]}>
          <progress aria-label={lane==='programming'?'编程完成比例':'设计完成比例'} aria-describedby={lane+'-today-progress'} value={p.progress} max={terms.work}></progress>
          <span class="forecast-progress" style:left={p.progress/terms.work*100+'%'} style:width={Math.max(0,today.progress[lane]-p.progress)/terms.work*100+'%'} aria-hidden="true"></span>
        </div>
        <div class="progress-caption" id={lane+'-today-progress'}><small>当前 {number(p.progress)} / {number(terms.work)} 点</small><small class="forecast-legend">虚线 · 今日结束 {number(today.progress[lane])} 点</small></div>
        <p class="reward">{terms.priceCents?`合同总额 ¥${money(terms.priceCents)} · 已验收到账 ¥${money(p.paidCents??0)}`:companyProjectRoyaltyAddition(c.royaltyCents,c.stage,p)>0?`按当前版税池预计新增 ¥${money(companyProjectRoyaltyAddition(c.royaltyCents,c.stage,p))}/周`:'版税已封顶：本件仍计入已完成项目'}</p>
        {#if next}<p>下一笔 ¥{money(next.amountCents)}，在{number(next.progress/terms.work*100)}%验收<br><small>按现有排班预计：{date(estimate?.nextPaymentMinute)}</small></p>{/if}
        <small>预计完工：{date(estimate?.completionMinute)}。只按现有员工和已批准假期估计，主角工作可提前交付。</small>
        <div class="actions"><button onclick={()=>onWork(lane)}>我来{lane==='design'?'设计':'开发'}</button><span class="mode">{p.repeat?'↻ 完工后继续下一件':'完工后等待安排'}</span></div>
        <details><summary>下次开发与项目切换</summary>
          <label class="check"><input type="checkbox" checked={p.repeat} onchange={()=>run(()=>changeCompanyProject(gameState,lane,'repeat'),'连续开发设置已更新')}>完工后自动开始下一件</label>
          <div class="fields next-fields">
            <label>下一件规模<select aria-label={lane==='programming'?'编程下一项目规模':'设计下一项目规模'} value={p.next?.scale??p.scale} onchange={e=>changeNext(lane,p,'scale',e.currentTarget.value)}>{#each Object.entries(COMPANY_SCALES) as [key,def]}<option value={key} disabled={def.stage>c.stage||key==='short'&&(p.next?.mode??p.mode??'product')!=='contract'}>{def.name}{def.stage>c.stage?'（需扩张）':''}</option>{/each}</select></label>
            {#if lane==='programming'}<label>下一件类型<select aria-label="编程下一项目类型" value={p.next?.mode??p.mode??'product'} onchange={e=>changeNext(lane,p,'mode',e.currentTarget.value)}><option value="product">自研产品</option><option value="contract">委托开发</option></select></label>{/if}
          </div>
          <small>下次安排在当前项目完成后生效。</small>
          <div class="actions switch-actions"><button onclick={()=>switchProject(lane)}>保留当前，另开项目</button><button onclick={()=>run(()=>changeCompanyProject(gameState,lane,'pause'),'进度已保存，可稍后恢复')}>暂停并保留</button><button onclick={()=>cancelId=p.id}>放弃项目</button></div>
        </details>
        {#if cancelId===p.id}<div class="notice"><p>放弃将清除剩余进度，不增加已完成项目数；已验收款保留，未验收尾款不再发放。</p><button onclick={()=>{run(()=>changeCompanyProject(gameState,lane,'cancel'),'已放弃这件项目');cancelId='';}}>确认放弃进度</button><button onclick={()=>cancelId=''}>返回</button></div>{/if}
      {:else if form===lane}
        {#if lane==='programming'}<label class="check">经营方式<select aria-label="编程经营方式" bind:value={mode} onchange={()=>{if(mode==='product'&&scale==='short')scale='small';}}><option value="product">自研产品 · 持续版税</option><option value="contract">委托开发 · 现金回款</option></select></label>{/if}
        <div class="fields"><label>题材<select aria-label={lane==='design'?'设计题材':'编程题材'} bind:value={topic}>{#each COMPANY_TOPICS[lane] as name}<option>{name}</option>{/each}</select></label><label>规模<select aria-label={lane==='design'?'设计规模':'编程规模'} bind:value={scale}>{#each Object.entries(COMPANY_SCALES) as [key,def]}<option value={key} disabled={def.stage>c.stage}>{def.name} · {def.work}点{def.stage>c.stage?'（需扩张）':''}</option>{/each}</select></label></div>
        {@const quote=companyProjectQuote(lane,topic,scale,mode)}
        <p class="reward">{number(quote.work)}点 · {quote.priceCents?`合同 ¥${money(quote.priceCents)}`:`基础新增版税 ¥${money(quote.royaltyCents)}/周，接近上限时递减`}</p>
        {#if quote.priceCents}<small>{quote.milestones.map(m=>`${number(m.progress/quote.work*100)}%验收收¥${money(m.amountCents)}`).join('；')}</small>{:else}<small>工具软件按基础工作量开发；手机App多投入5%、版税高10%；游戏多投入20%、版税高25%。</small>{/if}
        <label class="check"><input type="checkbox" bind:checked={repeat}>完工后自动接续同类项目</label>
        <div class="actions"><button class="primary" disabled={o.stopped||mode==='product'&&scale==='short'} onclick={()=>start(lane)}>{lane==='design'?'立项设计订单':mode==='contract'?'立项编程委托':'立项编程作品'}</button><button onclick={()=>form=null}>收起</button></div>
      {:else}<p class="empty">{lane==='programming'?'接委托赚周转资金，或自研产品积累每周版税。':'短单回款快，中大型订单按验收阶段收款。'}</p><button disabled={o.stopped} onclick={()=>open(lane)}>{lane==='programming'?'新建编程项目':'新建设计订单'}</button>{/if}
    </article>
  {/each}
  {#if c.pending.length}<details class="pending"><summary>暂停的项目（{c.pending.length}）</summary>{#each c.pending as p}<div class="line pending-row"><span>{p.topic} · {(p.progress/companyProjectTerms(p).work*100).toFixed(1)}%</span><button disabled={!!c[p.lane]} onclick={()=>run(()=>changeCompanyProject(gameState,p.lane,'pause',p.id),'已恢复项目')}>恢复{p.lane==='design'?'设计':'编程'}</button></div>{/each}</details>{/if}
</section>
{#if c.royaltyCents>0}<section class="maintenance" aria-label="版税维护">
  <div class="line"><h3>版税维护</h3><b>{(o.coverage*100).toFixed(0)}%</b></div><progress aria-label="维护覆盖率" value={o.coverage} max="1"></progress>
  <p>本周 ¥{money(c.royaltyCents)} <span>→</span> 按当前维护预计下周 ¥{money(o.nextRoyaltyCents)}</p>
  <dl class="royalty-breakdown"><div><dt>现有作品本周收入</dt><dd>¥{money(c.royaltyCents)}</dd></div><div><dt>在研作品交付预计新增</dt><dd>+¥{money(pendingRoyalty)}/周</dd></div><div><dt>本周维护不足预计减少</dt><dd>−¥{money(maintenanceLoss)}/周</dd></div></dl>
  <small>在研新增额尚未计入下周预测，以实际交付时的版税池为准。</small>
  {#if c.royaltyCents>o.stage.cap*100}<p>已取得的旧作品版税继续保留并按原有权益结算；新作品按当前上限 ¥{o.stage.cap}/周判断是否增加版税。</p>{/if}
  {#if c.royaltyCents>0}<div class="actions"><button disabled={o.coverage>=1} onclick={()=>onWork('maintenance')}>我来维护</button><button onclick={onTeam}>安排员工维护</button></div>{/if}
  <details><summary>维护与结款规则</summary><p>本周已维护{number(c.maintenance)}点，需要{number(o.maintenanceNeed)}点。每周一先发当前版税，再按未覆盖比例衰减，完全未维护衰减10%。</p><p>新增版税以交付时的版税池为准，接近上限时逐档递减；当前上限¥{o.stage.cap}/周。员工产能按标准8小时显示，周末、休假、缺电脑及停工时以实际安排为准。</p></details>
</section>{/if}
<style>
.royalty-breakdown{display:grid;gap:7px;margin:12px 0;font-size:13px}.royalty-breakdown div{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.royalty-breakdown dt{color:var(--hud-text-dim,#aebcc5)}.royalty-breakdown dd{margin:0;font-variant-numeric:tabular-nums}
:global(:root[data-game-mode="mobile"]) .royalty-breakdown{font-size:var(--m-fs-xs,12px)}
h3{font-size:17px;margin:0 0 12px}h4{font-size:16px;margin:0}.line{display:flex;justify-content:space-between;align-items:center;gap:12px}.project,.maintenance,.pending{border:1px solid var(--hud-border,#ffffff22);border-radius:12px;padding:16px;background:color-mix(in srgb,var(--hud-text,#fff) 3%,var(--hud-surface-solid,#182634));margin:0 0 12px}.kind{font-size:12px;color:var(--hud-text-dim,#aebcc5)}.badge{font-size:11px;border:1px solid var(--hud-border,#ffffff22);border-radius:5px;padding:0 6px}.title{margin:10px 0}.title>b,.maintenance .line>b{color:var(--accent-2,#bdc99e)}progress{display:block;width:100%;height:7px;accent-color:var(--accent-2,#bdc99e);margin:8px 0}small,.mode{color:var(--hud-text-dim,#aebcc5);font-size:11px}p{margin:10px 0;font-size:13px}.reward{color:var(--accent-2,#bdc99e)}button,select{font:inherit;color:inherit;min-height:44px;padding:8px 12px;border:1px solid var(--hud-border,#ffffff22);border-radius:8px;background:var(--hud-surface-solid,#182634);max-width:100%}button,summary{cursor:pointer}button:disabled{opacity:.45;cursor:default}.primary{border-color:var(--accent-2,#bdc99e)}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.empty{color:var(--hud-text-dim,#aebcc5);margin:12px 0}summary{font-size:12px;color:var(--hud-text-dim,#aebcc5);min-height:30px;line-height:30px}details:not(.pending){margin-top:10px}.check{display:flex;align-items:center;gap:7px;font-size:12px;margin:10px 0}.check input{width:18px;height:18px;accent-color:var(--accent-2)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.fields label{display:flex;flex-direction:column;gap:5px;font-size:12px}.notice{padding:10px;background:#81543033;border-radius:8px;margin-top:10px}.notice button{margin-right:6px}.pending-row{padding:8px 0;font-size:13px}.maintenance{margin-top:16px}.maintenance h3{margin:0}.maintenance p span{color:var(--hud-text-dim)}@media(max-width:500px){.fields{grid-template-columns:1fr}.project,.maintenance,.pending{padding:12px}}

:global(:root[data-game-mode="mobile"]) .kind,:global(:root[data-game-mode="mobile"]) .badge,:global(:root[data-game-mode="mobile"]) .mode,:global(:root[data-game-mode="mobile"]) summary,:global(:root[data-game-mode="mobile"]) .check,:global(:root[data-game-mode="mobile"]) .fields label{font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) p{font-size:var(--m-fs-sm,14px)}.today-summary{margin:0 0 16px;font-size:13px}.today-summary small{display:block;margin-top:3px}.progress-track{position:relative;height:10px;margin:10px 0 7px;background:color-mix(in srgb,var(--hud-text) 10%,transparent);border-radius:6px;overflow:hidden}.progress-track progress{position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;background:none;appearance:none}.progress-track progress::-webkit-progress-bar{background:transparent}.progress-track progress::-webkit-progress-value{background:var(--accent-2,#bdc99e);border-radius:6px}.progress-track progress::-moz-progress-bar{background:var(--accent-2,#bdc99e);border-radius:6px}.forecast-progress{position:absolute;top:0;height:100%;border:1px dashed var(--accent-2,#bdc99e);border-left:0;box-sizing:border-box;border-radius:0 6px 6px 0;pointer-events:none}.progress-caption{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.forecast-legend{color:var(--accent-2,#bdc99e)}.switch-actions{margin-top:12px}.next-fields{margin-bottom:8px}
</style>
