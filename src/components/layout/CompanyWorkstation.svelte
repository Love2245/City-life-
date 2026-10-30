<script lang="ts">
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {officeSeats} from '../../game/core/companyOffice';
  import {companyEmployeeAtSeat} from '../../game/core/companyWorkstations';
  import {companyOverview,accruedSalaryCents} from '../../game/core/companyOverview';
  import {COMPANY_COMPUTERS,COMPANY_RULES,companyDailyWork} from '../../game/core/companyConfig';
  import {companyEmployeeRequests,companyFairSalary} from '../../game/core/companyPersonnel';
  import type {CompanyComputerTier,CompanyRole} from '../../game/companyTypes';
  import {gameDay,fromLinearDay,START_EPOCH} from '../../game/core/calendar';
  import {scaleCost} from '../../game/core/difficulty';
  import {assignCompanyWorkstationComputer,assignCompanyComputer,buyCompanyComputers,hireCompanyEmployee,interviewCompany,assignCompanyEmployee,respondCompanyRequest,raiseCompanySalary,dismissCompanyEmployee,type CompanyResult} from '../../game/core/company';
  import CompanyShiftControls from './CompanyShiftControls.svelte';
  let {index,onProjects=()=>{},workRole}:{index:number;onProjects?:()=>void;workRole?:'programming'|'design'|'maintenance'}=$props();
  const c=$derived(gameState.company!),o=$derived(companyOverview(gameState)!),seat=$derived(officeSeats(gameState)[index]);
  const employee=$derived(companyEmployeeAtSeat(c,index));
  const requests=$derived(employee?companyEmployeeRequests(employee):[]);
  const pc=$derived(c.computers.find(p=>p.assignee===(index===0?'founder':employee?.id))??c.computers.find(p=>!p.assignee&&p.seatIndex===index));
  const inventory=$derived(c.computers.filter(p=>!p.assignee&&p.seatIndex!==index));
  const today=$derived(gameDay(gameState.time));
  let dismiss=$state(false),offer=$state(0);
  $effect(()=>{offer=employee?Math.ceil(employee.salaryCents/100*1.1):0;dismiss=false;});
  const money=(cents:number)=>(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
  const points=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:2});
  const date=(day:number)=>{const d=fromLinearDay(START_EPOCH+day);return `${d.month}月${d.day}日`;};
  const roles: {id:CompanyRole;label:string}[]=[{id:'programming',label:'编程开发'},{id:'design',label:'设计订单'},{id:'maintenance',label:'作品维护'},{id:'idle',label:'待分配'}];
  function equipmentWork(tier:CompanyComputerTier){const lane=employee?.role==='design'||index===0&&workRole==='design'?'design':'programming';const skill=employee?employee[lane]:index===0?gameState.player.skills[lane]:1;const output=companyDailyWork(skill,tier),difference=pc?output-companyDailyWork(skill,pc.tier):0;return `同技能标准日 ${points(output)}点${pc?`（较当前${difference>=0?'＋':'−'}${points(Math.abs(difference))}点）`:''}`;}
  function run(action:()=>CompanyResult,text='操作完成'){const r=action();markSessionDirty();showToast(r.ok?text:r.reason??'暂时不能办理');}
</script>
<section class="workstation" aria-label={`工位${index+1}管理`} data-workstation-panel={index}>
  <header><div><small>{index===0?'负责人工作区':`员工工位 ${index+1}`}</small><h3>{index===0?'我的办公桌':employee?.name??'空工位'}</h3></div><span>{seat?.status}</span></header>
  <details open={!pc} class="equipment"><summary>{pc?`${COMPANY_COMPUTERS[pc.tier].name} · 更换电脑`:'第一步：为工位配电脑'}</summary>
    {#if pc}<p>当前效率 ×{COMPANY_COMPUTERS[pc.tier].efficiency}。更换后原电脑会回到库存。</p><button onclick={()=>run(()=>assignCompanyComputer(gameState,pc.id,null),'电脑已移回库存')}>移回设备库存</button>{/if}
    {#if inventory.length}<div class="inventory"><b>使用库存电脑</b>{#each inventory as item}<button onclick={()=>run(()=>assignCompanyWorkstationComputer(gameState,index,item.id),'电脑已放到这个工位')}>{item.seatIndex===undefined?'分配':'从工位'+(item.seatIndex+1)+'调入'}{COMPANY_COMPUTERS[item.tier].name}</button>{/each}</div>{/if}
    <p>从电子城订购并送到这个工位，价格相同，配送办理耗时1小时（10—22点）。</p>
    <p class="muted">办公电脑是稳定经营的参考配置，老旧电脑适合起步或临时过渡。升级会提高产能，先留足工资与租金，再支付购机款。</p>
    <div class="choices">{#each Object.entries(COMPANY_COMPUTERS) as [tier,def]}<button data-computer-offer={tier} disabled={o.stopped||gameState.time.hour<10||gameState.time.hour>=22} onclick={()=>run(()=>buyCompanyComputers(gameState,tier as keyof typeof COMPANY_COMPUTERS,1,index),'电脑已送达并放到工位')}><b>{def.name}</b><span>¥{scaleCost(gameState,def.price)} · 效率 ×{def.efficiency}</span><span>{equipmentWork(tier as CompanyComputerTier)}</span></button>{/each}</div>
    <small>{index===0?'按主角当前工作技能':employee?'按员工当前优先工作的技能':'空工位先按技能1级'}比较8小时产能；实际还取决于任务、出勤和电脑是否分配。</small>
  </details>
  {#if index===0}<CompanyShiftControls {onProjects} initialRole={workRole}/>
  {:else if employee}
    <article><h3>安排{employee.name}的工作 <span>{'★'.repeat(employee.stars)}</span></h3><p>月薪 ¥{money(employee.salaryCents)}{pc&&employee.role!=='idle'?' · 标准日 '+companyDailyWork(employee.role==='design'?employee.design:employee.programming,pc.tier).toFixed(2)+' 点':''}</p>
      <div class="choices">{#each roles as role}<button aria-pressed={employee.role===role.id} onclick={()=>run(()=>assignCompanyEmployee(gameState,employee.id,role.id,employee.secondaryRole===role.id?'idle':employee.secondaryRole??'idle'),'工作安排已更新')}>{role.label}</button>{/each}</div>
      <label class="secondary">主任务完成后<select aria-label="员工次要任务" value={employee.secondaryRole??'idle'} onchange={event=>run(()=>assignCompanyEmployee(gameState,employee.id,employee.role,event.currentTarget.value as CompanyRole),'备用工作已更新')}><option value="idle">等待新安排</option>{#each roles.filter(role=>role.id!=='idle'&&role.id!==employee.role) as role}<option value={role.id}>{role.label}</option>{/each}</select></label>
      <p class="muted">主任务维护已足额，或当前项目已完成时，自动转做次要任务；无需反复切换。</p>
      {#if (employee.role==='programming'||employee.role==='design')&&!c[employee.role]}<p>已经安排方向，还需要开启对应项目。</p><button onclick={onProjects}>去安排项目</button>{/if}
      <small>工作日9—17点自动工作。休息、带薪假和待分配期间照常计薪。</small>
    </article>
    {#if requests.length||employee.resignationDay!==undefined}<article class="notice"><h3>需要处理</h3>{#if employee.resignationDay!==undefined}<p class="resignation">有离职意向，请在{date(employee.resignationDay)}00:00前改善待遇。</p>{/if}{#each requests as request (request.kind)}<div class="request" data-request-kind={request.kind}><b>{request.kind==='raise'?'涨薪申请':'带薪休假申请'}</b><p>{request.kind==='raise'?`申请月薪调整为 ¥${money(request.salaryCents!)}`:`申请带薪假：${request.leaveDays!.map(date).join('、')}`}</p><p class="deadline">{date(request.deadlineDay)}00:00前处理 · {request.deadlineDay>today?`剩余${request.deadlineDay-today}天`:'已到期'}<br>逾期自动按拒绝处理，满意度降低{request.kind==='raise'?COMPANY_RULES.rejectRaise:COMPANY_RULES.rejectLeave}点。</p><div class="choices"><button onclick={()=>run(()=>respondCompanyRequest(gameState,employee.id,true,request.kind),'申请已批准')}>批准{request.kind==='raise'?'涨薪':'休假'}</button><button onclick={()=>run(()=>respondCompanyRequest(gameState,employee.id,false,request.kind),'申请已拒绝')}>拒绝{request.kind==='raise'?'涨薪':'休假'}</button></div></div>{/each}</article>{/if}
    <details><summary>能力、薪资与离职</summary><p>编程 {employee.programming}级 · 设计 {employee.design}级 · 满意度 {employee.satisfaction.toFixed(0)}</p><p>当前能力的个人合理月薪 ¥{money(companyFairSalary(employee))} · 已计提工资 ¥{money(accruedSalaryCents(employee))}</p>{#if employee.leaveDays.length}<p>带薪假：{employee.leaveDays.map(date).join('、')}</p>{/if}<label>调整月薪（元）<input aria-label="调整员工月薪" type="number" min={employee.salaryCents/100+1} bind:value={offer}></label><button onclick={()=>run(()=>raiseCompanySalary(gameState,employee.id,offer),'月薪已调整')}>提高月薪</button><button onclick={()=>dismiss=true}>办理解雇</button>
      {#if dismiss}<div class="notice"><p>结清已计提工资 ¥{money(accruedSalaryCents(employee))} 及7日补偿 ¥{money(Math.round(employee.salaryCents*7/30))}；其他工资和欠款继续预留。</p><button onclick={()=>run(()=>dismissCompanyEmployee(gameState,employee.id),'工资及补偿已结清')}>确认结清并解雇</button><button onclick={()=>dismiss=false}>返回</button></div>{/if}
    </details>
  {:else if pc}
    <article><h3>面试并录用员工</h3>
      <p>员工岗位 {c.employees.length} / {o.unlocked} · 已完成 {o.completedProjects} 个项目</p>
      <small>每完成{COMPANY_RULES.deliveriesPerEmployee}个项目解锁1个岗位。{o.nextEmployeeProjects>0?'再完成'+o.nextEmployeeProjects+'个项目解锁下一岗。':'已解锁全部岗位。'}</small>
      <button disabled={!o.unlocked||c.interviewDay===today} onclick={()=>run(()=>interviewCompany(gameState),'今日三位候选人已到场')}>{c.interviewDay===today?'今日面试名单已保留':'开始今日面试'}</button>
      {#if c.employees.length>=o.unlocked}<p>当前岗位已满，可以先准备电脑。</p>{/if}
      {#if c.interviewDay===today}<div class="candidates">{#each c.candidates as candidate}<article data-company-candidate={candidate.id}>
        <div class="candidate-heading"><b>{candidate.name}</b><span aria-label={candidate.stars+'星'}>{'★'.repeat(candidate.stars)}</span></div>
        <p>编程 {candidate.programming}级 · 设计 {candidate.design}级</p>
        <p class="expected-salary">预期月薪 <b>¥{money(candidate.salaryCents)}</b></p>
        <button disabled={candidate.hired||c.employees.length>=o.unlocked} onclick={()=>run(()=>hireCompanyEmployee(gameState,candidate.id,index),candidate.name+'已在此工位入职')}>{candidate.hired?'已录用':'录用到此工位'}</button>
      </article>{/each}</div>{/if}
    </article>
  {:else}<p>电脑到位后，就能在这里面试并录用员工。</p>{/if}
</section>
<style>
.workstation{line-height:1.7}header{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:14px}h3{font-size:16px;margin:4px 0 10px}small,.muted{color:var(--hud-text-dim)}header span{font-size:12px;text-align:right}article,details{border:1px solid var(--hud-border);border-radius:11px;padding:14px;margin:12px 0;background:color-mix(in srgb,var(--hud-text) 3%,var(--hud-surface-solid))}summary{cursor:pointer;font-weight:600;min-height:28px}button,input,select{font:inherit;color:inherit;border:1px solid var(--hud-border);border-radius:8px;background:var(--hud-surface-solid);min-height:44px;padding:10px 12px;max-width:100%}button{cursor:pointer;margin:3px}button:disabled{opacity:.45;cursor:default}button[aria-pressed=true]{border-color:var(--accent);background:#87653d33}.choices,.candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:8px}.choices button{margin:0;text-align:left}.choices button span{display:block;font-size:12px;color:var(--hud-text-dim)}.candidates article{margin:8px 0}.notice{background:#87653d22;border:1px solid #bb9a6855;padding:12px;border-radius:9px;margin:12px 0}label{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.inventory{margin:12px 0}.inventory b{display:block}.secondary{margin-top:12px}.secondary select{flex:1}.request{padding:12px 0}.request+.request{border-top:1px solid var(--hud-border)}.request p{margin:6px 0}.deadline{font-size:13px;color:var(--hud-text-dim)}.resignation{font-weight:600}

:global(:root[data-game-mode="mobile"]) .workstation{font-size:var(--m-fs-sm,14px)}
:global(:root[data-game-mode="mobile"]) header span,:global(:root[data-game-mode="mobile"]) .choices button span{font-size:var(--m-fs-xs,12px)}.candidate-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.candidate-heading span{color:var(--accent-2);font-size:12px}.candidates article p{margin:12px 0}.expected-salary{color:var(--hud-text-dim)}.expected-salary b{color:var(--hud-text);font-size:18px;font-variant-numeric:tabular-nums}.candidates article>button{display:block;width:100%;margin:16px 0 0}
</style>
