<script lang="ts">
  import {untrack} from 'svelte';
  import {uiState} from '../../stores/uiStore.svelte';
  import {COMPANY_STAGES} from '../../game/core/companyConfig';
  import {OFFICE_ADDRESSES} from '../../game/core/companyOffice';
  import OfficeTourStage from './OfficeTourStage.svelte';
  import SceneDisplaySettings from './SceneDisplaySettings.svelte';
  import type {QualityMode} from '../../lib/scenePipeline';
  import type {WeatherId} from '../../game/types';
  let {stage:initialStage,onExit}:{stage:number;onExit:()=>void}=$props();
  let stage=$state(untrack(()=>initialStage)),hour=$state(12),weather=$state<WeatherId>('sunny'),quality=$state<QualityMode>('auto');
  const address=$derived(OFFICE_ADDRESSES[stage-1]!);
</script>
<section class="office-tour" aria-label="办公室参观" data-office-tour={stage}>
  {#key stage+':'+uiState.sceneMode}<OfficeTourStage {stage} {hour} {weather} {quality} sceneMode={uiState.sceneMode}/>{/key}
  <div class="address"><strong>{COMPANY_STAGES[stage-1]!.name}</strong><small>{address.building} · {address.floor}F · {address.arrival}</small></div>
  <button class="exit" onclick={onExit}>返回参观列表</button>
  <div class="controls"><select aria-label="选择参观办公室" bind:value={stage}>{#each COMPANY_STAGES as office}<option value={office.stage}>{office.name}</option>{/each}</select><button onclick={()=>hour=hour===12?23:12}>{hour===12?'切换夜景':'切换白天'}</button></div>
  <div class="settings"><SceneDisplaySettings {quality} qualityLabel="办公室画质" onQuality={value=>quality=value}/></div>
  <small class="pure">自由参观 · 不推进时间，不影响经营存档</small>
</section>
<style>
  .office-tour{height:100%;width:100%;position:relative;overflow:hidden;color:var(--hud-text,#f4f7ff)}.address{position:absolute;top:12px;left:12px;display:grid;gap:5px;padding:12px 16px;border:1px solid var(--hud-border,#667788);border-radius:10px;background:var(--hud-surface-solid,#20283a)}.address strong{font-size:17px}.address small{font-size:12px;color:var(--hud-text-dim,#b4c1c9)}button,select{font:inherit;min-height:42px;padding:8px 12px;border:1px solid var(--hud-border,#667788);border-radius:8px;background:var(--hud-surface-solid,#20283a);color:inherit;cursor:pointer}.exit{position:absolute;right:12px;top:12px}.controls{position:absolute;left:12px;top:95px;display:flex;gap:8px;max-width:calc(100% - 24px)}.controls select{max-width:60vw}.settings{position:absolute;right:12px;bottom:12px}.pure{position:absolute;left:12px;bottom:65px;color:var(--hud-text-dim,#b4c1c9);font-size:12px;background:var(--hud-surface-solid,#20283a);padding:5px 8px;border-radius:5px}
</style>
