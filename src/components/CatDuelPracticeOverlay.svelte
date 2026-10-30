<script lang="ts">
  import { duelPractice } from '../stores/catDuelStore.svelte';
  import CatDuelHub from './CatDuelHub.svelte';
  import BattleView from './BattleView.svelte';
  import type {GameState} from '../game/types';
  let phase=$state<'hub'|'battle'>('hub');
  let previous:GameState|null=null;
  $effect(()=>{if(previous!==duelPractice.game){previous=duelPractice.game;phase='hub';}});
</script>
{#if duelPractice.game}
  {#if phase==='battle'}
    <BattleView session={duelPractice.game} practice onExit={()=>phase='hub'}/>
  {:else}
    <CatDuelHub session={duelPractice.game} practice onStart={()=>phase='battle'} onClose={()=>duelPractice.game=null}/>
  {/if}
{/if}
