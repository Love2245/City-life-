<script lang="ts">
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {playInteractionSound} from '../../lib/audio';
  import type {InteractionSoundId} from '../../lib/interactionSoundRouting';
  import {companyOverview} from '../../game/core/companyOverview';
  import {repayCompanyDebts,transferCompanyMoney,type CompanyResult} from '../../game/core/company';
  import {companyAccountingOverview,companyFundingPolicy,setCompanyFundingPolicy} from '../../game/core/companyAccounting';
  import {companyPayoutQuote} from '../../game/core/companyTax';
  import {forecastCompanyCash} from '../../game/core/companyForecast';
  import {companyClosureQuote,closeCompany,sellCompanyComputer} from '../../game/core/companyLifecycle';
  import {COMPANY_COMPUTERS} from '../../game/core/companyConfig';
  import {START_EPOCH,fromLinearDay} from '../../game/core/calendar';
  const c=$derived(gameState.company!),o=$derived(companyOverview(gameState)!),report=$derived(companyAccountingOverview(c));
  const forecast=$derived(forecastCompanyCash(gameState,{includeRepeat:true})),policy=$derived(companyFundingPolicy(gameState));
  const closure=$derived(companyClosureQuote(gameState));
  let amount=$state(1000),direction=$state<'deposit'|'withdraw'>('deposit'),allLedger=$state(false),confirmClose=$state(false);
  let reserve=$state((gameState.company?.fundingPolicy?.reserveCents??300000)/100),limit=$state((gameState.company?.fundingPolicy?.monthlyLimitCents??500000)/100);
  let autoCover=$state(gameState.company?.fundingPolicy?.enabled??true),unlimited=$state(gameState.company?.fundingPolicy?.monthlyLimitCents===null);
  const money=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
  const date=(day:number)=>{const d=fromLinearDay(START_EPOCH+day);return d.month+'月'+d.day+'日';};
  const minuteDate=(minute:number)=>date(Math.floor(minute/1440));
  const projectedIncome=$derived(Math.max(0,forecast.events.filter(e=>e.kind==='project'||e.kind==='royalty').reduce((n,e)=>n+e.amountCents,0)));
  const projectedExpenses=$derived(o.monthlyFixedCents);
  const payout=$derived(companyPayoutQuote(Number.isFinite(amount)&&amount>0?Math.round(amount*100):0));
  function run(action:()=>CompanyResult,text:string,cue:InteractionSoundId='coins'){const r=action();if(r.ok){markSessionDirty();playInteractionSound(cue);}showToast(r.ok?text:r.reason??'暂时不能办理');}
  function savePolicy(){run(()=>setCompanyFundingPolicy(gameState,{reserveCents:Math.round(reserve*100),monthlyLimitCents:unlimited?null:Math.round(limit*100),enabled:autoCover}),'个人垫付安排已保存','mouse');}
</script>
<section aria-label="公司资金" class="finance">
  <article class="account" data-company-balance={c.balanceCents} data-company-reserved={o.reservedCents} data-company-withdrawable={o.withdrawableCents}>
    <div><small>公司现金{c.status==='closed'?' · 已停业':''}</small><strong>¥{money(c.balanceCents)}</strong></div>
    <div><small>建议可提取</small><b>¥{money(forecast.suggestedWithdrawalCents)}</b><small>已留工资与租金周转款</small></div>
  </article>
  <article class="performance"><h3>本期经营</h3><small>{minuteDate(report.periodStartMinute)}起 · 每30天结一期</small><div class="metrics"><div><small>收入</small><b>¥{money(report.incomeCents)}</b></div><div><small>成本</small><b>¥{money(report.expenseCents)}</b></div><div><small>结余</small><b class:negative={report.profitCents<0}>{report.profitCents<0?'−':''}¥{money(Math.abs(report.profitCents))}</b></div></div><small>成本包括已发生的工资、租期和提现税；注资、净提款、电脑及押金另记。升级前历史不补造。</small></article>
  {#if c.liabilities.length}<article class="notice"><h3>{c.status==='closed'?'停业后待偿':'欠款停工'} · ¥{money(o.debtCents)}</h3><p>{c.status==='closed'?'公司已停止新增工资和租金。可恢复个人接单，将收入主动转入公司偿债；重新营业前需结清欠款。':'已有版税继续到账。补齐欠款后恢复工作，也可到市政办理停业清算，用押金和未用租金先抵扣欠款。'}自动垫付仍按你的设置执行。</p><button onclick={()=>run(()=>repayCompanyDebts(gameState),'欠款已清偿')}>用现有资金偿付</button><details><summary>欠款明细</summary>{#each c.liabilities as d}<p>{d.employeeName??'办公室'} · {d.kind==='rent'?'租金':d.kind==='severance'?'补偿':'工资'} · ¥{money(d.amountCents)}</p>{/each}</details></article>{/if}
  <article aria-label="预期收支"><h3>预期收支</h3>
    <div class="metrics projected"><div><small>本月预计收入</small><b data-monthly-income={projectedIncome}>¥{money(projectedIncome)}</b></div><div><small>本月预计支出</small><b data-monthly-expenses={projectedExpenses}>¥{money(projectedExpenses)}</b></div></div>
    <p>工资 ¥{money(o.monthlyPayrollCents)} · 租金 ¥{c.status==='closed'?'0':money(o.stage.rent*100)} / 月</p>
    <small>按当前在研项目、连续开发、排班和已有版税估算30天。主角后续手动工作与未安排的新项目未计入；采购、已有欠款和提现税按实际发生另记。</small>
  </article>
  <article><h3>个人与公司转账</h3><div class="transfer-tabs"><button aria-pressed={direction==='deposit'} onclick={()=>direction='deposit'}>转入公司</button><button aria-pressed={direction==='withdraw'} onclick={()=>direction='withdraw'}>提到个人</button></div>
    {#if direction==='withdraw'}<p class="tax-quote" data-withdrawal-tax={payout.taxCents}>转出 ¥{money(payout.grossCents)} − 20%税款 ¥{money(payout.taxCents)} = 实际到账 <b>¥{money(payout.netCents)}</b></p>{/if}
    <div class="transfer"><label>金额（元）<input aria-label="公司转账金额" type="number" min="0.01" step="0.01" bind:value={amount}></label><button class="primary" disabled={!Number.isFinite(amount)||amount<=0} onclick={()=>run(()=>transferCompanyMoney(gameState,amount,direction),direction==='deposit'?'注资完成':'税款 ¥'+money(payout.taxCents)+'，个人到账 ¥'+money(payout.netCents))}>{direction==='deposit'?'确认注资':'确认提现'}</button>{#if direction==='withdraw'}<button disabled={forecast.suggestedWithdrawalCents<=0} onclick={()=>run(()=>transferCompanyMoney(gameState,forecast.suggestedWithdrawalCents/100,'withdraw'),'建议金额已提取')}>提取建议金额</button>{/if}</div>
    <small>个人现金 ¥{gameState.player.money.toLocaleString('zh-CN',{maximumFractionDigits:2})}。强制保留工资与欠款 ¥{money(o.reservedCents)}，当前税前最多可提 ¥{money(o.withdrawableCents)}；建议金额另留未来周转款，已计提工资只预留一次。</small>
  </article>
  <details class="card"><summary>个人自动垫付 · {policy.enabled?'已开启':'已关闭'}</summary><p>工资、租金等到期账单不足时才自动补足。主动注资、确认采购和搬迁由你决定付款。</p><div class="policy"><label class="check"><input type="checkbox" bind:checked={autoCover}>允许自动垫付</label><label>个人至少保留（元）<input type="number" min="0" step="100" bind:value={reserve}></label><label>本月最多垫付（元）<input type="number" min="0" step="100" disabled={unlimited} bind:value={limit}></label><label class="check"><input type="checkbox" bind:checked={unlimited}>不设月度上限</label><button onclick={savePolicy}>保存安排</button></div><small>本月已自动垫付 ¥{money(policy.usedCents)}，下个月重新计算；主动注资不占额度。</small></details>
  <details class="card"><summary>经营退路与闲置设备</summary><p>缩小办公室或停业请到市政企业窗口办理。停业时将结算员工工资和7日补偿，用公司余额、押金与未用租金抵扣；不足部分保留待偿。已付阶段款和版税权益会保留。</p>{#each c.computers.filter(pc=>pc.assignee===null) as pc}<div class="equipment"><span>{COMPANY_COMPUTERS[pc.tier].name}<small>{pc.seatIndex!==undefined?'空置工位 '+pc.seatIndex:'设备库'} · 原购入 ¥{money(pc.costCents)}</small></span><button onclick={()=>run(()=>sellCompanyComputer(gameState,pc.id),'设备已出售，款项进入公司')}>出售 · 回收 ¥{money(Math.floor(pc.costCents*.5))}</button></div>{:else}<small>没有可出售的闲置电脑。停业会把全部电脑归还库存，也可先在工位移回设备。</small>{/each}
    {#if c.status!=='closed'&&gameState.locationId==='municipal_hall'}<p>可用于清算的公司余额、保证金及未用租金共 ¥{money(closure?.availableCents??0)}；应付工资与欠款 ¥{money(closure?.unpaidCents??0)}，员工补偿 ¥{money(closure?.severanceCents??0)}。<br>剩余转出 ¥{money(closure?.grossReturnCents??0)}，先扣20%税款 ¥{money(closure?.taxCents??0)}，预计税后退回个人 ¥{money(closure?.returnCents??0)}{#if closure?.remainingDebtCents}，停业后仍待偿 ¥{money(closure.remainingDebtCents)}{/if}。</p><button onclick={()=>confirmClose=true}>办理公司停业</button>{#if confirmClose}<div class="notice"><p>确认停业并终止 {closure?.activeProjects??0} 个未完工项目？{closure?.employees??0}名员工办理离职，工资与补偿完整保留。电脑和版权保留，停业后不再新增房租与工资；剩余欠款可通过个人接单、注资偿还。</p><button onclick={()=>{run(()=>closeCompany(gameState),'停业清算完成，剩余欠款与版权保留');confirmClose=false;}}>确认停业并清算</button><button onclick={()=>confirmClose=false}>继续经营</button></div>{/if}{/if}
  </details>
  <details class="card ledger"><summary>收支与资产明细</summary><p>本期工资 ¥{money(report.wageCents)} · 租期成本 ¥{money(report.rentCents)} · 其他成本 ¥{money(report.otherCostCents)}<br>资产及预付资金投入 ¥{money(report.assetInCents)} · 回收 ¥{money(report.assetOutCents)}<br>个人投入 ¥{money(report.ownerInCents)} · 提取 ¥{money(report.ownerOutCents)}<br>公司净资产 ¥{money(o.netAssetsCents)}</p>{#each [...c.ledger].reverse().slice(0,allLedger?200:8) as entry}<div class="entry"><span>{date(Math.floor(entry.minute/1440))} · {entry.text}</span><b>{entry.amountCents>0?'+':''}{money(entry.amountCents)}</b></div>{/each}{#if c.ledger.length>8}<button onclick={()=>allLedger=!allLedger}>{allLedger?'收起历史账目':'展开全部账目'}</button>{/if}</details>
</section>
<style>
.finance{line-height:1.65}article,.card{border:1px solid var(--hud-border,#ffffff22);border-radius:12px;padding:16px;margin-bottom:12px;background:color-mix(in srgb,var(--hud-text,#fff) 3%,var(--hud-surface-solid,#182634))}h3{font-size:17px;margin:0 0 8px}small{display:block;color:var(--hud-text-dim,#b2c0c8);font-size:12px}p{font-size:13px;margin:10px 0}.account{display:flex;justify-content:space-between;align-items:center;gap:16px}.account strong{display:block;font-size:29px;line-height:1.5}.account>div:last-child{text-align:right}.account b{font-size:21px;color:var(--accent-2,#bdc99e)}button,input{font:inherit;color:inherit;border:1px solid var(--hud-border,#ffffff22);border-radius:8px;background:var(--hud-surface-solid,#182634);min-height:44px;padding:8px 12px;max-width:100%;box-sizing:border-box}button,summary{cursor:pointer}button:disabled{opacity:.4;cursor:default}button[aria-pressed=true],.primary{border-color:var(--accent-2,#bdc99e);background:color-mix(in srgb,var(--accent-2,#bdc99e) 15%,var(--hud-surface-solid,#182634))}.transfer-tabs{display:flex;gap:8px;margin:0 0 12px}.transfer,.policy{display:flex;align-items:end;flex-wrap:wrap;gap:9px;margin-bottom:12px}label{display:flex;flex-direction:column;gap:5px;font-size:12px}input{width:180px}.check{flex-direction:row;align-items:center;min-height:44px}.check input{width:18px;min-height:18px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.metrics b{font-size:18px}.negative{color:#e3b58d}.notice{background:#81543033;padding:12px;border-radius:10px}.entry,.equipment{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--hud-border,#ffffff22);font-size:12px}.entry b{white-space:nowrap}summary{font-size:13px;min-height:30px}.equipment button{font-size:12px}@media(max-width:500px){article,.card{padding:12px}.account{flex-wrap:wrap;gap:10px}.account>div:last-child{text-align:left}.account strong{font-size:25px}.metrics b{font-size:15px}.equipment{flex-wrap:wrap}}
:global(:root[data-game-mode="mobile"]) p,:global(:root[data-game-mode="mobile"]) summary{font-size:var(--m-fs-sm,14px)}
:global(:root[data-game-mode="mobile"]) label,:global(:root[data-game-mode="mobile"]) .entry{font-size:var(--m-fs-xs,12px)}
.projected{grid-template-columns:repeat(2,minmax(0,1fr))}.tax-quote{padding:10px 12px;border-radius:8px;background:color-mix(in srgb,var(--accent-2) 10%,transparent)}.tax-quote b{color:var(--accent-2);font-variant-numeric:tabular-nums}
</style>

