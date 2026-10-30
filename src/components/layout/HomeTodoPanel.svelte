<script lang="ts">
  import { gameState } from '../../stores/gameStore.svelte';
  import { todoSummaryOf } from '../../game/core/todoSummary';
  let { onOpen }: { onOpen: () => void } = $props();
  const todo = $derived(todoSummaryOf(gameState));
  const count = $derived(todo.tasks.length + todo.commitments.length);
  const urgent = $derived(todo.tasks.find(t => t.urgent) ?? todo.commitments.find(t => t.tone === 'warn'));
</script>
{#if count > 0}
<aside class="home-todo" aria-label="今日待办" data-home-todo>
  <button class="todo-heading" onclick={onOpen} aria-label="打开手机待办"><strong>今日待办</strong><span>{count} <b>↗</b></span><small class="compact-hint">{urgent?.title ?? todo.tasks[0]?.title ?? todo.commitments[0]?.title}</small></button>
  <div class="todo-contents">
    {#if todo.tasks.length}<div class="todo-section">今天与接下来的安排</div>{#each todo.tasks.slice(0, 3) as task (task.id)}<button class="task" class:urgent={task.urgent} onclick={onOpen}><strong>{task.title}</strong><small>{task.detail}</small></button>{/each}{/if}
    {#if todo.commitments.length}<div class="todo-section">已接受事项</div>{#each todo.commitments as item}<button class="task" class:urgent={item.tone === 'warn'} onclick={onOpen}><strong>{item.icon} {item.title}</strong><small>{item.detail}</small></button>{/each}{/if}
  </div>
</aside>
{/if}
<style>
  .home-todo{width:228px;max-width:100%;flex:0 1 auto;min-height:42px;border:1px solid var(--hud-border);border-radius:13px;background:var(--hud-surface);color:var(--hud-text);box-shadow:0 6px 24px #0003;backdrop-filter:blur(14px);overflow:hidden;display:flex;flex-direction:column;pointer-events:auto}
  button{font:inherit;cursor:pointer;color:inherit}.todo-heading{display:flex;justify-content:space-between;align-items:center;flex:none;padding:12px 15px;background:transparent;border:0;font-size:12px;text-align:left}.todo-heading span{font-size:10px;color:var(--hud-text-dim)}.todo-heading b{color:var(--accent-2);margin-left:6px}.todo-contents{padding:0 15px 12px;overflow:auto;scrollbar-width:thin;min-height:0}.todo-section{font-size:10px;color:var(--accent-2);padding:8px 0;border-top:1px solid var(--hud-border);margin-top:4px}.task{display:block;text-align:left;border:0;background:transparent;width:100%;padding:7px 0;border-radius:5px}.task strong{display:block;font-size:11px;font-weight:500}.task small{display:block;font-size:10px;color:var(--hud-text-dim);line-height:1.5;margin-top:4px}.task.urgent strong{color:var(--warn)}button:hover{background:color-mix(in srgb,var(--accent-2) 9%,transparent)}button:focus-visible{outline:2px solid var(--accent-2);outline-offset:-3px}
  .compact-hint{display:none}
  @media(max-height:600px){.home-todo{flex:none;width:215px}.todo-heading{padding:8px 12px;display:grid;grid-template-columns:1fr auto;gap:5px}.todo-contents{display:none}.compact-hint{display:block;grid-column:1/-1;font-size:10px;line-height:1.4;color:var(--hud-text-dim)}}
</style>
