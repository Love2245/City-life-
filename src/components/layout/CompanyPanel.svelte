<script lang="ts">
  import {untrack,tick} from 'svelte';
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {companyOverview} from '../../game/core/companyOverview';
  import {companyEmployeeRequests} from '../../game/core/companyPersonnel';
  import {officeSeats} from '../../game/core/companyOffice';
  import {COMPANY_COMPUTERS,COMPANY_RULES,companyDailyWork,companyStage} from '../../game/core/companyConfig';
  import {assignCompanyEmployee} from '../../game/core/company';
  import type {CompanyEmployee,CompanyRole} from '../../game/companyTypes';
  import CompanyWorkstation from './CompanyWorkstation.svelte';
  import CompanyShiftControls from './CompanyShiftControls.svelte';
  import CompanyProjects from './CompanyProjects.svelte';
  import CompanyFinance from './CompanyFinance.svelte';
  let {onClose=()=>{},employeeId='',seatIndex}:{onClose?:()=>void;employeeId?:string;seatIndex?:number}=$props();
  let tab=$state('work'),workIndex=$state(0),workRole=$state<'programming'|'design'|'maintenance'|undefined>(undefined);
  let content:HTMLDivElement;
  const c=$derived(gameState.company!),o=$derived(companyOverview(gameState)!),seats=$derived(officeSeats(gameState));
  const founderPc=$derived(c.computers.find(p=>p.assignee==='founder')),nextSeat=$derived(seats.find(s=>s.index>0&&!s.personId));
  $effect(()=>{if(seatIndex!==undefined){workIndex=seatIndex;tab='workstation';}});
  $effect(()=>{const id=employeeId;if(id)untrack(()=>{const match=officeSeats(gameState).find(s=>s.personId===id);if(match){workIndex=match.index;tab='workstation';}});});
  $effect(()=>{if(c.status==='closed')tab='finance';});
  const tabs=[{id:'work',text:'工作台'},{id:'team',text:'团队'},{id:'finance',text:'资金'}];
  const money=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
  const points=(v:number)=>v.toLocaleString('zh-CN',{maximumFractionDigits:2});
  function requestText(employee:CompanyEmployee){return employee.resignationDay!==undefined?'离职意向':companyEmployeeRequests(employee).map(r=>r.kind==='raise'?'涨薪':'休假').join('、')+'待处理';}
  function navigate(page:string){tab=page;content?.scrollTo?.({top:0});}
  function choose(index:number){workIndex=index;workRole=undefined;navigate('workstation');}
  function assign(id:string,role:CompanyRole,secondary?:CompanyRole){const r=assignCompanyEmployee(gameState,id,role,secondary);if(r.ok)markSessionDirty();else showToast(r.reason??'暂时不能调整');}
  async function projects(){navigate('work');await tick();document.getElementById('company-projects')?.scrollIntoView?.({block:'nearest'});}
  async function work(role:'programming'|'design'|'maintenance'){workRole=role;navigate('work');await tick();document.getElementById('company-founder-work')?.scrollIntoView?.({block:'nearest'});}
</script>
<section class="company-panel" aria-label="公司经营面板">
  <header><div><small>{o.closed?'已关停 · 版税与设备档案保留':`${o.stage.name} · ${o.people}/${o.stage.capacity}人`}</small><h2>{c.name}</h2></div><div class="header-right"><span>公司 ¥{money(c.balanceCents)}</span><button aria-label="关闭公司经营面板" onclick={onClose}>关闭 ×</button></div></header>
  <nav aria-label="公司经营分类">{#each tabs.filter(t=>!o.closed||t.id==='finance') as t}<button class:active={tab===t.id} aria-current={tab===t.id?'page':undefined} onclick={()=>navigate(t.id)}>{t.text}{#if t.id==='team'&&o.requests.length}<span class="count">{o.requests.length}</span>{/if}</button>{/each}</nav>
  <div class="content" data-company-page={tab} bind:this={content}>
    {#if o.stopped&&tab!=='finance'}<div class="notice"><span>欠款 ¥{money(o.debtCents)}，公司暂时停工。</span><button onclick={()=>navigate('finance')}>去清偿欠款</button></div>{/if}
    {#if tab==='workstation'}
      <button class="back" onclick={()=>navigate('team')}>← 返回团队</button><CompanyWorkstation index={workIndex} {workRole} onProjects={projects}/>
    {:else if tab==='work'}
      {#if o.requests.length}<div class="requests">{#each o.requests as e}<button onclick={()=>choose(seats.find(s=>s.personId===e.id)?.index??0)}>{e.name} · {requestText(e)} ↗</button>{/each}</div>{/if}
      <div class="work-grid"><div class="my-work card"><CompanyShiftControls initialRole={workRole} onRoleChange={role=>workRole=role} onProjects={projects} onEquipment={()=>choose(0)}/></div><div><CompanyProjects onWork={work} onTeam={()=>navigate('team')}/></div></div>
    {:else if tab==='team'}
      <div class="team-heading"><div><h3>办公桌与团队</h3><p>员工岗位 {c.employees.length}/{o.unlocked} · 已完成{o.completedProjects}个项目</p></div>{#if nextSeat}<button class="primary" onclick={()=>choose(nextSeat.index)}>{c.employees.length<o.unlocked?'添加员工':'准备新工位'}</button>{/if}</div>
      {#if o.nextEmployeeProjects>0}<p class="muted">每完成{COMPANY_RULES.deliveriesPerEmployee}个项目解锁1个岗位，再完成{o.nextEmployeeProjects}个项目开放下一岗。</p>{/if}
      <article class="founder card"><div><b>我的办公桌</b><small>{founderPc?COMPANY_COMPUTERS[founderPc.tier].name:'还没有电脑'}</small></div><button data-manage-seat="0" onclick={()=>choose(0)}>{founderPc?'安排工作 / 电脑':'配一台电脑'}</button></article>
      <div class="team-list">{#each c.employees as employee}
        {@const seat=seats.find(s=>s.personId===employee.id)!}
        {@const pc=c.computers.find(p=>p.assignee===employee.id)}
        <article class="employee card" data-team-employee={employee.id}>
          <div class="employee-heading"><div><b>{employee.name}</b><span class="stars">{'★'.repeat(employee.stars)}</span><small>月薪 ¥{money(employee.salaryCents)}{pc?' · '+COMPANY_COMPUTERS[pc.tier].name:' · 缺少电脑'}</small></div><button data-manage-seat={seat.index} aria-label={'管理'+employee.name} onclick={()=>choose(seat.index)}>{companyEmployeeRequests(employee).length||employee.resignationDay!==undefined?'处理请求':'管理'}</button></div>
          <div class="assignment"><label>优先工作<select aria-label={employee.name+'工作安排'} value={employee.role} onchange={e=>assign(employee.id,e.currentTarget.value as CompanyRole,employee.secondaryRole===e.currentTarget.value?'idle':employee.secondaryRole??'idle')}><option value="programming">编程开发</option><option value="design">设计订单</option><option value="maintenance">作品维护</option><option value="idle">待分配</option></select></label><span>{employee.role!=='idle'&&pc?'标准日 '+points(companyDailyWork(employee.role==='design'?employee.design:employee.programming,pc.tier))+' 点':'暂不推进'}</span></div>
          <div class="assignment"><label>完成后接着做<select aria-label={employee.name+'次要工作'} value={employee.secondaryRole??'idle'} onchange={e=>assign(employee.id,employee.role,e.currentTarget.value as CompanyRole)}><option value="idle">等待新安排</option>{#each [['programming','编程开发'],['design','设计订单'],['maintenance','作品维护']] as [key,text]}<option value={key} disabled={key===employee.role}>{text}</option>{/each}</select></label><small>共用同一份8小时，不重复计算产能。</small></div>
          {#if companyEmployeeRequests(employee).length||employee.resignationDay!==undefined}<button class="request-link" onclick={()=>choose(seat.index)}>{employee.resignationDay!==undefined?'有离职意向，请及时改善待遇':requestText(employee)} · 去处理 →</button>{:else if (employee.role==='programming'||employee.role==='design')&&!c[employee.role]}<button class="request-link" onclick={projects}>等待立项 · 去安排项目 →</button>{:else}<small class="status">{seat.status.split(' · ')[0]}</small>{/if}
        </article>
      {/each}</div>
      {#if !c.employees.length}<div class="empty card"><p>先为员工工位配电脑，再面试录用。</p><small>每天可面试3人，当天名单保留，可按名额录用多人。</small></div>{/if}
      <details class="card"><summary>空工位与扩张</summary><div class="vacant-grid">{#each seats.filter(s=>s.index>0&&!s.personId) as seat}<button data-manage-seat={seat.index} onclick={()=>choose(seat.index)}>工位{seat.index+1}<small>{seat.tier?COMPANY_COMPUTERS[seat.tier].name:'未配电脑'}</small></button>{/each}</div>{#if c.stage<4}<p>下一处：{companyStage(c.stage+1).name}，总人数需{companyStage(c.stage+1).requiredPeople}人。到市政大厅企业窗口申请扩张。</p>{:else}<p>已经入驻写字楼整层，最多15名员工。</p>{/if}</details>
      <small class="team-note">员工在工作日9—17点自动工作。正常8小时与同技能、同电脑的主角效率相同，周末和带薪假照常计薪。</small>
    {:else if tab==='finance'}<CompanyFinance/>{/if}
  </div>
</section>
<style>
.company-panel{display:flex;flex-direction:column;width:min(1040px,100%);height:min(850px,100%);background:var(--hud-surface-solid,#182634);color:var(--hud-text,#edf4f5);border:1px solid var(--hud-border,#ffffff22);border-radius:16px;overflow:hidden;box-shadow:0 20px 90px #0008;font-size:14px;line-height:1.6;box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;padding:16px 22px;gap:15px;flex-shrink:0}h2{font-size:22px;margin:0;overflow-wrap:anywhere}h3{font-size:17px;margin:0}small,.muted{display:block;color:var(--hud-text-dim,#b4c1c9);font-size:12px}.header-right{display:flex;gap:16px;align-items:center}.header-right>span{color:var(--hud-text-dim,#b4c1c9);font-size:12px;white-space:nowrap}nav{display:flex;gap:6px;padding:0 22px 10px;border-bottom:1px solid var(--hud-border,#ffffff22);flex-shrink:0}nav button{min-width:92px;background:transparent}button,select{font:inherit;color:inherit;background:color-mix(in srgb,var(--hud-text,#fff) 4%,var(--hud-surface-solid,#182634));border:1px solid var(--hud-border,#ffffff22);border-radius:8px;min-height:44px;padding:8px 13px;box-sizing:border-box;max-width:100%}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button.active,.primary{border-color:var(--accent-2,#bdc99e);background:color-mix(in srgb,var(--accent-2,#bdc99e) 15%,var(--hud-surface-solid,#182634))}.content{overflow:auto;min-height:0;padding:20px 22px;overscroll-behavior:contain;scrollbar-gutter:stable;scroll-behavior:smooth}.work-grid{display:grid;grid-template-columns:minmax(250px,.9fr) minmax(0,1.15fr);gap:20px;align-items:start}.card{padding:17px;border:1px solid var(--hud-border,#ffffff22);border-radius:12px;background:color-mix(in srgb,var(--hud-text,#fff) 3%,var(--hud-surface-solid,#182634));margin-bottom:14px}.my-work{position:sticky;top:0}p{margin:8px 0 14px}.count{font-size:11px;border-radius:10px;background:var(--accent-2,#bdc99e);color:var(--hud-surface-solid,#182634);padding:0 5px;margin-left:7px}.requests{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.requests button,.request-link{color:#e2c599}.notice{padding:12px;background:#81543044;border:1px solid #be926355;border-radius:10px;margin-bottom:14px;display:flex;justify-content:space-between;gap:12px;align-items:center}.back{margin-bottom:14px;border:0;background:transparent;padding-left:0}.team-heading,.founder,.employee-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.team-heading{margin-bottom:14px}.team-heading p{margin:5px 0;font-size:12px;color:var(--hud-text-dim,#b4c1c9)}.team-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}.stars{font-size:10px;color:var(--accent-2,#bdc99e);margin-left:9px}.assignment{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-top:12px}.assignment label{display:flex;flex-direction:column;gap:4px;font-size:12px}.assignment span{font-size:12px;white-space:nowrap;padding-bottom:10px;color:var(--accent-2,#bdc99e)}select{background:var(--hud-surface-solid,#182634);min-width:130px}.status{margin-top:10px}.request-link{border:0;background:transparent;padding:8px 0;text-align:left;font-size:12px}.vacant-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px}.vacant-grid button{text-align:left}summary{cursor:pointer;font-size:13px;min-height:28px}.team-note{margin:8px 0}.empty{padding:22px}
@media(max-width:680px){.work-grid,.team-list{grid-template-columns:1fr}.my-work{position:static}.header-right>span{display:none}header{padding:12px 14px}nav{padding:0 14px 8px}.content{padding:14px}.card{padding:14px}}
@media(max-height:500px){.company-panel{height:100%;border-radius:10px}header{padding:7px 15px}h2{font-size:18px}nav{padding:0 14px 5px}.content{padding:12px 14px}.work-grid{gap:14px}.card{padding:12px}}
:global(:root[data-game-mode="mobile"]) .company-panel{width:100%;font-size:var(--m-fs-sm,14px)}
:global(:root[data-game-mode="mobile"]) .company-panel :global(button),:global(:root[data-game-mode="mobile"]) .company-panel :global(select),:global(:root[data-game-mode="mobile"]) .company-panel :global(input:not([type=checkbox])){min-height:var(--m-tap,44px)}
:global(:root[data-game-mode="mobile"]) .company-panel :global(small){font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) .muted{font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) .company-panel :global(h3),:global(:root[data-game-mode="mobile"]) .company-panel :global(h4){font-size:var(--m-fs-md,16px)}
:global(:root[data-game-mode="mobile"]) h2{font-size:var(--m-fs-lg,20px)}
:global(:root[data-game-mode="mobile"]) nav button{font-size:var(--m-fs-sm,14px);min-width:110px}
:global(:root[data-game-mode="mobile"]) .assignment label,:global(:root[data-game-mode="mobile"]) .assignment span,:global(:root[data-game-mode="mobile"]) .team-heading p,:global(:root[data-game-mode="mobile"]) .request-link,:global(:root[data-game-mode="mobile"]) .header-right>span{font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) .content{scroll-padding-top:12px}
</style>
