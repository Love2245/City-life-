<script lang="ts">
  import { gameState, markSessionDirty } from '../../stores/gameStore.svelte';
  import { showToast } from '../../stores/uiStore.svelte';
  import { registerCompany, expandCompany, companyExpansionQuote, buyCompanyComputers, companyRegistrationGate, type CompanyResult, type CompanyStartingStage } from '../../game/core/company';
  import { companyStage, COMPANY_COMPUTERS, COMPANY_STAGES, COMPANY_RULES } from '../../game/core/companyConfig';
  import { scaleCost } from '../../game/core/difficulty';
  import { moveTo } from '../../game/core/actions';
  import type { CompanyComputerTier } from '../../game/companyTypes';
  import { companyDownsizeQuote, downsizeCompany, reopenCompany } from '../../game/core/companyLifecycle';
  import { forecastCompanyCash } from '../../game/core/companyForecast';
  import { gameDay, START_EPOCH, fromLinearDay } from '../../game/core/calendar';
  import CompanyFinance from './CompanyFinance.svelte';
  let { municipal = false }: { municipal?: boolean } = $props();
  let name = $state(''), tier = $state<CompanyComputerTier>('mid'), quantity = $state(1), confirmed = $state(false);
  let startingStage = $state<CompanyStartingStage>(1);
  let downsizeStage = $state(1), confirmDownsize = $state(false);
  const c = $derived(gameState.company), quote = $derived(companyExpansionQuote(gameState));
  const registrationGate = $derived(companyRegistrationGate(gameState));
  const startingOffice = $derived(companyStage(startingStage));
  const downsize = $derived(companyDownsizeQuote(gameState, downsizeStage));
  const expansionForecast = $derived(quote ? forecastCompanyCash(gameState, {cashAdjustmentCents:-quote.netCents,monthlyRentOverrideCents:quote.next.rent*100,nextRentDayOverride:gameDay(gameState.time)+30}) : null);
  const date=(minute:number)=>{const d=fromLinearDay(START_EPOCH+Math.floor(minute/1440));return `${d.month}月${d.day}日`;};
  function run(action: () => CompanyResult, message: string) { const result = action(); markSessionDirty(); showToast(result.ok ? message : result.reason ?? '暂时无法办理'); confirmed = false; }
  function goOffice() { if (!c) return; const result = moveTo(gameState, companyStage(c.stage).location); markSessionDirty(); if (!result.ok) showToast(result.reason ?? '暂时无法前往'); }
</script>
{#if municipal}
  <section aria-label="企业登记窗口"><h3>企业窗口</h3>
    {#if !c}
      <p>先完成 {COMPANY_RULES.royaltyWorksRequired} 件设计或编程项目即可注册，两类可合计，现金委托也计入。当前已交付 {registrationGate.royaltyWorks ?? 0} 件。首次登记可直接选择以下任一场地，无需先凑齐扩张人数。</p>
      {#if !registrationGate.ok}<p class="risk">还不满足注册条件：{registrationGate.reason}。请在个人工作台完成设计、编程或现金委托。</p>{/if}
      <label>公司名称<input maxlength="20" placeholder="填写公司名称" bind:value={name}></label>
      <fieldset class="starting-offices"><legend>选择初始办公场地</legend>{#each COMPANY_STAGES.slice(0, 2) as office}<label class:selected={startingStage === office.stage}><span class="office-choice"><input type="radio" name="company-starting-office" value={office.stage} bind:group={startingStage} onchange={() => confirmed = false}><b>{office.name}</b></span><span>含主角共 {office.capacity} 人 · 编程周版税上限 {office.cap} 元</span><span>月租 {office.rent} 元 · 保证金 {office.rent} 元</span><span>{office.stage === 1 ? '小型项目 · 校内创业空间' : '小型与中型项目 · 市中心独立办公室'}</span></label>{/each}</fieldset>
      <p>原有作品进度和版税权益统一并入公司，电脑需要另行采购。注册需支付保证金与首月租金，并至少留出 {COMPANY_COMPUTERS.low.price} 元采购一台公司电脑。入驻{startingOffice.name}后，未来仍需满足下一阶段人数条件才能扩张。</p><p>保证金 {startingOffice.rent} 元 ＋ 首月租金 {startingOffice.rent} 元 ＝ <b>{startingOffice.rent * 2} 元</b></p><button disabled={!registrationGate.ok} onclick={() => confirmed = true}>准备注册公司</button>
      {#if confirmed}<div class="confirm"><p>确认以“{name.trim() || '未填写名称'}”登记，入驻{startingOffice.name}，支付 {startingOffice.rent * 2} 元并将个人开发权益转入公司？办公室需另行前往。</p><button onclick={() => run(() => registerCompany(gameState, name, startingStage), '公司已成立，办公室入口已开放')}>确认登记并付款</button><button onclick={() => confirmed = false}>返回</button></div>{/if}
    {:else if c.status === 'closed'}
      <p><b>{c.name}</b>已停业。已有版税进入原公司账户，不再支付房租；电脑和经营记录保留。</p><label>恢复营业的办公场地<select bind:value={startingStage}><option value={1}>大学创业孵化室 · 押金＋首月租金 1600 元</option><option value={2}>写字楼单间 · 押金＋首月租金 4000 元</option></select></label><button onclick={() => confirmed = true}>准备恢复营业</button>{#if confirmed}<div class="confirm"><p>确认支付 {startingOffice.rent*2} 元恢复原公司？现有公司可用资金优先，不足由本次确认使用个人现金；个人作品进度和版税一并转回。</p><button onclick={()=>run(()=>reopenCompany(gameState,startingStage),'原公司已恢复营业')}>确认付款并恢复营业</button><button onclick={()=>confirmed=false}>返回</button></div>{/if}<details class="management"><summary>公司资金、设备与版税</summary><CompanyFinance/></details>
    {:else}
      <p><b>{c.name}</b> · {companyStage(c.stage).name} · 当前 {c.employees.length + 1} 人</p>
      {#if quote}<p>下一阶段：{quote.next.name}，需要总人数达到 {quote.next.requiredPeople} 人。容量 {quote.next.capacity} 人，周版税上限 {quote.next.cap} 元。</p><p>新保证金 {quote.next.rent} 元 ＋ 首月租金 {quote.next.rent} 元<br>退回原保证金 {(c.depositCents / 100).toFixed(2)} 元 ＋ 未用租金 {(quote.refundRentCents / 100).toFixed(2)} 元<br><b>净支出 {(quote.netCents / 100).toFixed(2)} 元</b></p><p>电脑、人员、项目、维护量及发薪日全部保留，租金重新预付 30 天。此后每30天月租增加 {(quote.next.rent-companyStage(c.stage).rent).toLocaleString('zh-CN')} 元。</p>{#if expansionForecast}<p class="risk">本次净支出后，{expansionForecast.safeGapMinute!==null ? '保守预计 '+date(expansionForecast.safeGapMinute)+' 资金出现缺口' : '未来30天暂未发现资金缺口'}。只计现有作品版税和排定账单，扩容本身不会自动增加订单收入。</p>{/if}<button onclick={() => confirmed = true}>申请公司扩张</button>{#if confirmed}<div class="confirm"><p>确认按当前报价搬迁至{quote.next.name}？</p><button onclick={() => run(() => expandCompany(gameState), '公司扩张完成，请前往新办公室')}>确认搬迁并支付净额</button><button onclick={() => confirmed = false}>返回</button></div>{/if}
      {:else}<p>已入驻整层办公室，达到最终办公阶段。</p>{/if}
      <details class="management"><summary>缩小办公室</summary><p>缩小后保留全部员工、电脑、项目进度和版权。人数需符合新场地容量；多余空置工位电脑会回到库存，工资付款日保留。</p>{#if c.stage>1}<label>搬入场地<select bind:value={downsizeStage} onchange={()=>confirmDownsize=false}>{#each COMPANY_STAGES.filter(office=>office.stage<c.stage) as office}<option value={office.stage}>{office.name} · 共{office.capacity}人 · 月租{office.rent}元</option>{/each}</select></label>{#if downsize}<p>退旧押金与未用租金 {(downsize.refundCents/100).toFixed(2)} 元，新押金与首月租金 {(downsize.grossCents/100).toFixed(2)} 元；净{downsize.netCents>=0?'支出':'退回'} <b>{(Math.abs(downsize.netCents)/100).toFixed(2)} 元</b>。每30天租金减少 {(-downsize.monthlyDifferenceCents/100).toLocaleString('zh-CN')} 元。</p><button disabled={!downsize.fits} onclick={()=>confirmDownsize=true}>准备搬入{downsize.target.name}</button>{#if !downsize.fits}<p>当前人数超过新办公室容量，请先妥善安排员工。</p>{/if}{#if confirmDownsize}<div class="confirm"><p>确认按当前报价搬迁？本次付款优先使用公司可用余额，不足部分由个人现金补足。</p><button onclick={()=>{run(()=>downsizeCompany(gameState,downsizeStage),'公司已搬迁，原有资产与进度保留');confirmDownsize=false;}}>确认搬迁并结算</button><button onclick={()=>confirmDownsize=false}>返回</button></div>{/if}{/if}{:else}<p>当前已经是最小的创业办公场地。</p>{/if}</details><details class="management"><summary>公司资金、闲置设备与停业</summary><CompanyFinance/></details>
    {/if}
  </section>
{:else if gameState.locationId === 'electronics_store'}
  <section class="catalog" aria-label="公司电脑采购"><h3>公司设备采购</h3>{#if c}<p>公司电脑直接送入设备库，与个人电脑分开。采购先用公司可支配资金，本次确认后个人现金补齐差额，工资预留不动用；这笔主动采购不受自动垫付月限限制。办理耗时 1 小时。</p><div class="fields"><label>电脑档次<select bind:value={tier}>{#each Object.entries(COMPANY_COMPUTERS) as [key, pc]}<option value={key}>{pc.name} · {scaleCost(gameState, pc.price)} 元／台</option>{/each}</select></label><label>数量<input type="number" min="1" max="16" step="1" bind:value={quantity}></label><button onclick={() => confirmed = true}>查看采购单</button></div>{#if confirmed}<div class="confirm"><p>{COMPANY_COMPUTERS[tier].name} × {quantity} 台，合计 {scaleCost(gameState, COMPANY_COMPUTERS[tier].price) * quantity} 元。</p><button onclick={() => run(() => buyCompanyComputers(gameState, tier, quantity), '公司电脑已入库，请回公司分配')}>确认采购并付款</button><button onclick={() => confirmed = false}>返回</button></div>{/if}{:else}<p>成立公司后可在此按数量采购办公设备。个人电脑仍通过原有商品购买。</p>{/if}</section>
{:else if gameState.locationId === 'commercial_office' || gameState.locationId === 'dev_incubator'}
  <section class="catalog" aria-label="创业办公室入口"><h3>创业办公室</h3>{#if c&&c.status!=='closed'}<p>{c.name}位于{companyStage(c.stage).name}。</p><button onclick={goOffice}>前往公司办公室</button>{:else if c}<p>{c.name}已停业，可到市政企业窗口恢复营业。</p>{:else}<p>先交付 {COMPANY_RULES.royaltyWorksRequired} 件设计或编程项目（可合计），再到市政大厅企业窗口注册。孵化基地只提供办公服务。</p>{/if}</section>
{/if}
<style>
  section{font-size:13px;line-height:1.8;color:var(--hud-text,var(--text-main))}h3{margin:0 0 10px}.catalog{padding:16px;background:var(--hud-surface-solid,var(--bg-card));border:1px solid var(--hud-border,var(--border));border-radius:10px;margin-bottom:12px}label{display:flex;flex-direction:column;gap:6px;font-size:12px}.fields{display:flex;align-items:end;gap:10px;flex-wrap:wrap}button,input,select{font:inherit;color:inherit;background:var(--hud-surface-solid,var(--bg-card));border:1px solid var(--hud-border,var(--border));padding:10px 12px;border-radius:8px;min-height:44px;box-sizing:border-box;max-width:100%}input{width:min(260px,100%)}input[type=number]{width:100px}button{cursor:pointer}button:focus-visible{outline:2px solid var(--accent)}.confirm{border:1px solid #bda57a88;border-radius:10px;padding:12px;margin-top:14px;background:#87653d22}.confirm button{margin:4px}b{color:var(--accent,#d6bf90)}
  .management{margin-top:16px;border-top:1px solid var(--hud-border,var(--border));padding-top:12px}.management summary{cursor:pointer;min-height:44px;display:flex;align-items:center}.risk{color:#dec7a1}
  .starting-offices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px;padding:12px;border:1px solid var(--hud-border,var(--border));border-radius:10px;min-width:0}.starting-offices legend{padding:0 6px}.starting-offices label{padding:10px;border:1px solid var(--hud-border,var(--border));border-radius:8px;cursor:pointer}.starting-offices label.selected{border-color:var(--accent,#d6bf90);background:#87653d18}.office-choice{display:flex;align-items:center;gap:8px}.office-choice input{width:18px;min-height:18px;flex:0 0 18px;padding:0;accent-color:var(--accent,#d6bf90)}
</style>

