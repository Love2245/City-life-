<script lang="ts">
  import {untrack} from 'svelte';
  import {gameState,markSessionDirty} from '../../stores/gameStore.svelte';
  import {showToast} from '../../stores/uiStore.svelte';
  import {COMPANY_WORK_SHIFTS,COMPANY_RULES,COMPANY_COMPUTERS,companyDailyWork,companySkillMultiplier} from '../../game/core/companyConfig';
  import {companyProjectTerms} from '../../game/core/companyProjects';
  import {developmentWorkBudget,previewDevelopmentWork} from '../../game/core/developmentWork';
  import {founderCompanyWork} from '../../game/core/company';
  import {playInteractionSound} from '../../lib/audio';
  import type {CompanyRole} from '../../game/companyTypes';
  let {onProjects=()=>{},onEquipment,initialRole,onRoleChange=()=>{}}:{onProjects?:()=>void;onEquipment?:()=>void;initialRole?:Exclude<CompanyRole,'idle'>;onRoleChange?:(role:Exclude<CompanyRole,'idle'>)=>void}=$props();
  let role=$state<Exclude<CompanyRole,'idle'>>('programming'),hours=$state(8);
  const c=$derived(gameState.company!),pc=$derived(c.computers.find(p=>p.assignee==='founder'));
  $effect(()=>{const requested=initialRole;role=requested??untrack(()=>c.programming?'programming':c.design?'design':c.royaltyCents>0?'maintenance':'programming');});
  const budget=$derived(developmentWorkBudget(gameState));
  const missing=$derived(role==='maintenance'?c.royaltyCents<=0:!c[role]);
  const skill=$derived(role==='design'?gameState.player.skills.design:gameState.player.skills.programming);
  const daily=$derived(pc?companyDailyWork(skill,pc.tier):0);
  const remaining=$derived(role==='maintenance'?Math.max(0,c.royaltyCents/100/COMPANY_RULES.maintenanceDivisor-c.maintenance):c[role]&&!c[role]!.repeat?Math.max(0,companyProjectTerms(c[role]!).work-c[role]!.progress):Infinity);
  const preview=$derived(previewDevelopmentWork(gameState,{hours,pointsPerHour:daily/8,remainingPoints:remaining}));
  const ready=$derived(!missing&&!!pc&&!c.liabilities.length&&preview.ok);
  const number=(v:number)=>v.toLocaleString('zh-CN',{maximumFractionDigits:2});
  const duration=(minutes:number)=>minutes>=60?number(minutes/60)+'小时':minutes+'分钟';
  function work(){const r=founderCompanyWork(gameState,role,hours);if(r.ok){markSessionDirty();playInteractionSound(role==='design'?'mouse':'keyboard');}showToast(r.ok?'本次公司工作已完成，可以继续安排剩余工时':r.reason??'暂时不能工作');}
</script>
<section class="shift-control" aria-label="主角工作安排" id="company-founder-work">
  <div class="title"><h3>我来做什么</h3><small>今日已工作{number(budget.usedMinutes/60)} / 12小时</small></div>
  {#if !budget.remainingMinutes}<div class="finished"><b>✓ 今天已累计工作12小时</b><span>员工按排班继续工作，请休息后明天再来。</span></div>
  {:else if !pc}<p>先给我的办公桌配一台电脑，就能开始工作。</p>{#if onEquipment}<button class="primary" onclick={onEquipment}>给我的工位配电脑</button>{/if}
  {:else}
    <div class="segments roles" aria-label="我的工作内容">{#each [{id:'programming',name:'编程'},{id:'design',name:'设计'},{id:'maintenance',name:'维护'}] as item}<button aria-label={'我的工作：'+item.name} aria-pressed={role===item.id} onclick={()=>{role=item.id as typeof role;onRoleChange(role);}}>{item.name}</button>{/each}</div>
    {#if missing}<p>{role==='maintenance'?'还没有产生版税的作品。':'先开一个'+(role==='design'?'设计':'编程')+'项目。'}</p><button onclick={onProjects}>去安排项目</button>
    {:else if remaining<=0}<p>✓ 本周维护已完成，可以改做编程或设计。</p>
    {:else}
      <div class="segments durations" aria-label="计划最多工作多久">{#each COMPANY_WORK_SHIFTS as item}<button aria-label={'公司最多工作'+item.hours+'小时'} aria-pressed={hours===item.hours} onclick={()=>hours=item.hours}>最多{item.hours}小时<span>{item.hours===4?'短段安排':item.hours===8?'正常一天':'含加班'}</span></button>{/each}</div>
      <div class="forecast"><span>预计用时 <b>{duration(preview.minutes)}</b> · {role==='maintenance'?'维护':'推进'}{number(preview.points)}点</span><small>体力−{number(preview.costs.stamina)} · 健康−{number(preview.costs.health)} · 心情−{number(preview.costs.mood)} · 压力+{number(preview.costs.stress)}</small></div>
      <button class="primary start" disabled={!ready} onclick={work}>开始工作 · 最多{hours}小时</button>
      {#if c.liabilities.length}<small class="hint">公司欠款停工，请到资金页清偿。</small>{:else if !preview.ok}<small class="hint">{preview.reason}</small>{/if}
      <details><summary>工时与效率</summary><p>每天前8小时正常消耗，之后最多4小时算加班；可以分段工作、切换任务，与个人开发共用当天12小时。</p><p>正常8小时产量：5点基础 × 技能{number(companySkillMultiplier(skill))}倍 × 电脑{COMPANY_COMPUTERS[pc.tier].efficiency}倍。收尾和维护按实际有效分钟消耗时间；连续项目会接着做下一件。</p></details>
    {/if}
  {/if}
</section>
<style>
.shift-control{line-height:1.6}.title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}h3{font-size:17px;margin:0}p{margin:12px 0}small,summary{color:var(--hud-text-dim,#b4c1c9);font-size:12px}.segments{display:grid;gap:4px;background:#0002;border:1px solid var(--hud-border,#ffffff22);padding:4px;border-radius:10px;grid-template-columns:repeat(3,minmax(0,1fr));margin:10px 0}button{font:inherit;color:inherit;border:1px solid transparent;border-radius:7px;min-height:44px;padding:8px 12px;background:transparent;cursor:pointer}button:disabled{opacity:.45;cursor:default}button[aria-pressed=true]{background:var(--hud-surface-solid,#243847);border-color:var(--accent-2,#9ba88e);box-shadow:0 2px 8px #0002}button span{display:block;font-size:11px;color:var(--hud-text-dim,#b4c1c9)}.forecast{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:16px 0 12px}.forecast b{color:var(--accent-2,#c9d2a7);font-size:20px}.primary{background:var(--accent-2,#bdc99e);color:var(--hud-surface-solid,#192b35);font-weight:700;border-color:var(--accent-2,#bdc99e)}.start{width:100%;font-size:16px;min-height:48px}.finished{padding:18px 0}.finished b,.finished span{display:block}.finished span{margin-top:6px;color:var(--hud-text-dim,#b4c1c9);font-size:12px}.hint{display:block;margin-top:8px}details{margin-top:14px;font-size:12px}summary{cursor:pointer;min-height:28px}details p{margin:6px 0}.durations button{padding:5px 8px}@media(max-height:500px){.title{margin-bottom:8px}.segments{margin:6px 0}.forecast{margin:8px 0}.start{min-height:44px}}

:global(:root[data-game-mode="mobile"]) .shift-control{font-size:var(--m-fs-sm,14px)}
:global(:root[data-game-mode="mobile"]) button span,:global(:root[data-game-mode="mobile"]) summary,:global(:root[data-game-mode="mobile"]) details{font-size:var(--m-fs-xs,12px)}
:global(:root[data-game-mode="mobile"]) .forecast b{font-size:var(--m-fs-lg,20px)}
:global(:root[data-game-mode="mobile"]) .forecast{align-items:start}
:global(:root[data-game-mode="mobile"]) .start{font-size:var(--m-fs-md,16px)}</style>
