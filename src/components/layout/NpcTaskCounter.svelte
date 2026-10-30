<script lang="ts">
  import { untrack } from 'svelte';
  import { gameState } from '../../stores/gameStore.svelte';
  import { uiState, openNpcTaskPanel } from '../../stores/uiStore.svelte';
  import { getNpcTaskCounterTopics } from '../../game/core/npcTasks';

  const topics = $derived(getNpcTaskCounterTopics(gameState));
  let lastLocation = '';
  $effect(() => {
    const location = gameState.locationId;
    if (location === lastLocation) return;
    lastLocation = location;
    // 无驻店 NPC 的分店在入店时提示；关闭以后仍可从下方柜台入口办理。
    const purchase = location === 'boyue_fast_food' ? topics.find(topic => topic.taskId === 'zhao_toy') : undefined;
    if (purchase) untrack(() => {
      if (!uiState.modal && !uiState.npcTalk && !uiState.npcTaskPanel) openNpcTaskPanel({ kind: 'counter', topicId: purchase.id });
    });
  });
</script>

{#if topics.length}
  <section class="task-counter" aria-label="任务柜台">
    <div class="counter-heading">柜台办理 <small>与正在进行的委托有关</small></div>
    {#each topics as topic (topic.id)}
      <button onclick={() => openNpcTaskPanel({ kind: 'counter', topicId: topic.id })}><strong>{topic.title}</strong><span>{topic.description}</span><b aria-hidden="true">›</b></button>
    {/each}
  </section>
{/if}

<style>
  .task-counter { border: 1px solid #bda16a75; border-radius: 12px; margin: 10px 0; padding: 12px; background: var(--bg-card, #1d2438); color: var(--text, #eef1ff); }
  .counter-heading { font-weight: 750; font-size: 14px; margin-bottom: 8px; } .counter-heading small { color: var(--muted, #b4bfd3); font-weight: 400; font-size: 11px; margin-left: 10px; }
  button { position: relative; width: 100%; text-align: left; padding: 10px 32px 10px 12px; border: 1px solid #ffffff21; border-radius: 8px; background: #ffffff06; color: inherit; cursor: pointer; min-height: 48px; }
  button + button { margin-top: 7px; } strong, span { display: block; } strong { font-size: 13px; } span { font-size: 11px; color: var(--muted, #b4bfd3); margin-top: 3px; } b { position: absolute; right: 14px; top: 12px; font-size: 24px; }
</style>
