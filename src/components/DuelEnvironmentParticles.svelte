<script lang="ts">
  import {onMount} from 'svelte';
  import type {BattleBgKey} from '../lib/battleBg';
  import {ambientDuelParticles} from '../lib/duelParticles';
  let {scene,hour,mobile=false,reducedMotion=false,suspended=false}:{scene:BattleBgKey;hour:number;mobile?:boolean;reducedMotion?:boolean;suspended?:boolean}=$props();
  let hidden=$state(false);
  const particles=$derived(ambientDuelParticles(scene,hour,{mobile,reducedMotion}));
  onMount(()=>{const update=()=>hidden=document.hidden;update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);});
</script>
<div class="duel-environment" class:suspended={suspended||hidden} aria-hidden="true" data-scene={scene}>
  {#each particles as p(p.id)}
    <i class:leaf={p.leaf} style={`left:${p.x}%;top:${p.y}%;width:${p.size}px;height:${p.size}px;--dx:${p.dx}px;--dy:${p.dy}px;--duration:${p.duration}s;--delay:${p.delay}s;--opacity:${p.opacity};--color:${p.color}`}></i>
  {/each}
</div>
<style>
  .duel-environment{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;contain:strict;mask-image:linear-gradient(transparent 12%,#000 27%,#000 56%,transparent 72%)}
  i{position:absolute;display:block;border-radius:50%;background:var(--color);opacity:var(--opacity);pointer-events:none;animation:ambient-drift var(--duration) linear var(--delay) infinite both}
  .leaf{border-radius:70% 10%;height:3px!important}
  .suspended i{animation-play-state:paused}
  @keyframes ambient-drift{0%{opacity:0;transform:translate(0,10px) rotate(0)}20%{opacity:var(--opacity)}80%{opacity:var(--opacity)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(65deg)}}
  @media(prefers-reduced-motion:reduce){.duel-environment{display:none}i{animation:none}}
</style>
