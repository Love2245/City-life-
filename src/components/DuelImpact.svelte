<script lang="ts">
  import type {DuelMotionBeat} from '../lib/catDuelMotion';
  import {impactDuelParticles} from '../lib/duelParticles';
  let {beat,side,reducedMotion=false}:{beat:DuelMotionBeat|null;side:'player'|'opponent';reducedMotion?:boolean}=$props();
  const visible=$derived(beat?.side===side&&['hurt','heal','block','status','mechanic'].includes(beat.kind));
  const particles=$derived(impactDuelParticles(beat,reducedMotion));
</script>
{#if visible&&beat}{#key beat.id}
  <div class="duel-impact {beat.kind}" class:blocked={(beat.blocked??0)>0} aria-hidden="true">
    <div class="impact-particles">{#each particles as p(p.id)}<i class:soft-dot={p.round} style={`--dx:${p.dx}px;--dy:${p.dy}px;--size:${p.size}px;--rotate:${p.rotate}deg;--color:${p.color};--duration:${p.duration}ms`}></i>{/each}</div>
    <svg viewBox="0 0 200 180" preserveAspectRatio="xMidYMid meet">
      {#if beat.kind==='hurt'&&(beat.blocked??0)>0}<path class="shield" d="M61 32L100 15 139 32 134 90 100 126 66 90Z"/>
      {:else if beat.kind==='hurt'&&beat.attack}<path class="slash" d="M35 140L129 30 72 129ZM86 153L167 67 126 143Z"/>
      {:else if beat.kind==='heal'}<circle class="ring" cx="100" cy="90" r="48"/><path class="heal-cross" d="M100 59V121M70 90H130"/>
      {:else if beat.kind==='block'}<path class="shield" d="M51 34L100 13 149 34 141 106 100 145 59 106Z"/>
      {:else}<circle class="ring" cx="100" cy="90" r="52"/><path class="rays" d="M100 18V33M100 148V162M28 90H43M157 90H172M49 39L59 49M141 131L151 141M49 141L59 131M141 49L151 39"/>{/if}
    </svg>
    {#if beat.kind==='hurt'}<span class="amount">{(beat.blocked??0)>0&&!(beat.amount??0)?`格挡 ${beat.blocked}`:(beat.amount??0)>0?`−${beat.amount}`:'抵消'}{#if (beat.hits??1)>1}<small>{beat.hitIndex} / {beat.hits}</small>{/if}</span>
    {:else if beat.kind==='heal'}<span class="amount">＋{beat.amount??0}</span>
    {:else if beat.kind==='block'}<span class="amount">格挡＋{beat.amount??0}</span>{/if}
  </div>
{/key}{/if}
<style>
.impact-particles{position:absolute;inset:0;pointer-events:none}.impact-particles i{position:absolute;left:50%;top:52%;width:var(--size);height:calc(var(--size)*.55);background:var(--color);pointer-events:none;animation:impact-scatter var(--duration) ease-out both}.impact-particles .soft-dot{border-radius:50%;height:var(--size)}@keyframes impact-scatter{from{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(0)}20%{opacity:.85}to{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.3) rotate(var(--rotate))}}@media(prefers-reduced-motion:reduce){.impact-particles{display:none}.impact-particles i{animation:none}}
.duel-impact{position:absolute;inset:0;pointer-events:none;z-index:12;color:#ffe0ae}.duel-impact svg{width:100%;height:100%;overflow:visible;animation:impact-open .2s ease-out both}.slash{fill:#ffdfad;fill-opacity:.75;stroke:#fff5da;stroke-width:1}.shield{fill:#b5e2df;fill-opacity:.18;stroke:#d2efdb;stroke-width:3}.ring{fill:none;stroke:currentColor;stroke-width:2;stroke-opacity:.7}.heal-cross,.rays{fill:none;stroke:currentColor;stroke-width:4;stroke-linecap:round}.heal{color:#c8e7ae}.block,.blocked{color:#c3e4e2}.amount{position:absolute;left:50%;top:22%;width:max-content;max-width:100%;text-align:center;font:800 27px Georgia,serif;text-shadow:0 2px 5px #071420;animation:amount-rise .22s ease-out both}.amount small{display:block;font:11px system-ui,sans-serif;color:#e1dfcf;margin-top:4px}@keyframes impact-open{from{opacity:0;transform:scale(.7) rotate(-6deg)}40%{opacity:1}to{opacity:.4;transform:scale(1.08)}}@keyframes amount-rise{from{opacity:0;transform:translate(-50%,12px)}35%{opacity:1}to{opacity:1;transform:translate(-50%,-9px)}}@media(prefers-reduced-motion:reduce){.duel-impact svg,.amount{animation:none}.amount{transform:translateX(-50%)}}
</style>
