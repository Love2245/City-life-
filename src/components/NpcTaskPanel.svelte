<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { gameState, replaceState, currentView } from '../stores/gameStore.svelte';
  import { uiState, closeNpcTaskPanel } from '../stores/uiStore.svelte';
  import { executeNpcTaskAction, getNpcTaskCounterTopics, getNpcTaskDocument, getNpcTaskQuest, npcTaskSummary } from '../game/core/npcTasks';
  import { getItem, itemCount } from '../game/core/items';
  import { NPC_TASK_DEFINITIONS } from '../game/data/npcTaskData';
  import { NPC_TASK_ART_LABELS, npcTaskImage } from '../lib/npcTaskVisuals';
  import { formatDuration } from '../game/core/quests';
  import type { NpcTaskChoice, NpcTaskActionResult } from '../game/npcTaskTypes';
  import NpcTaskDocumentArt from './NpcTaskDocumentArt.svelte';

  const panel = $derived(uiState.npcTaskPanel);
  const quest = $derived(panel?.kind === 'quest' ? getNpcTaskQuest(gameState, panel.taskId) : undefined);
  const detail = $derived(quest ? npcTaskSummary(gameState, quest) : undefined);
  const counter = $derived(panel?.kind === 'counter' ? getNpcTaskCounterTopics(gameState).find(topic => topic.id === panel.topicId) : undefined);
  let documentId = $state<string | null>(null);
  let focusedArt = $state<string | null>(null);
  let enlarged = $state(false);
  let errorText = $state('');
  let busy = $state(false);
  let result = $state<Pick<NpcTaskActionResult, 'text' | 'timeCost' | 'artId' | 'taskId'> | null>(null);
  let dialog = $state<HTMLDivElement>();
  let activeKey = '';
  const itemId = $derived(documentId ?? (panel?.kind === 'item' ? panel.itemId : null));
  const item = $derived(itemId ? getItem(itemId) : undefined);
  const documentReference = $derived(itemId ?? focusedArt ?? (panel?.kind === 'art' ? panel.artId : null));
  const document = $derived(documentReference ? getNpcTaskDocument(gameState, documentReference) : undefined);
  const artId = $derived(focusedArt ?? document?.artId ?? item?.artId ?? (panel?.kind === 'art' ? panel.artId : result?.artId ?? counter?.artId));
  const title = $derived(document?.title ?? item?.name ?? (focusedArt ? NPC_TASK_ART_LABELS[focusedArt] : undefined)
    ?? detail?.title ?? counter?.title ?? (result ? NPC_TASK_DEFINITIONS[result.taskId].title : undefined)
    ?? (panel?.kind === 'art' ? panel.title ?? NPC_TASK_ART_LABELS[panel.artId] : '委托信息'));
  const childOpen = $derived(!!documentId || !!focusedArt);

  $effect(() => {
    const nextKey = JSON.stringify(panel);
    if (nextKey === activeKey) return;
    activeKey = nextKey;
    documentId = null; focusedArt = null; enlarged = false; errorText = ''; result = null;
    if (panel) void tick().then(() => untrack(() => dialog?.focus({ preventScroll: true })));
  });
  $effect(() => { if (currentView.name !== 'game' && panel) closeNpcTaskPanel(); });
  $effect(() => {
    if (!panel) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); back(); }
      if (event.key === 'Tab' && dialog) {
        const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (window.document.activeElement === first || window.document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  });
  function back(): void {
    if (enlarged) { enlarged = false; return; }
    if (childOpen) { documentId = null; focusedArt = null; return; }
    closeNpcTaskPanel();
  }
  function attachment(id: string): void {
    enlarged = false;
    if (getItem(id)) documentId = id;
    else focusedArt = id;
  }
  function submit(choice: NpcTaskChoice): void {
    if (busy || choice.disabledReason) return;
    busy = true; errorText = '';
    try {
      const operation = executeNpcTaskAction(gameState, null, choice.action);
      if (!operation.ok || !operation.state) { errorText = operation.reason ?? '本次办理没有完成'; return; }
      replaceState(operation.state, { sameSession: true });
      result = { text: operation.text, timeCost: operation.timeCost, artId: operation.artId, taskId: operation.taskId };
    } finally { busy = false; }
  }
</script>

{#if panel}
  <div class="task-overlay">
    <div class="task-reader" class:wide={enlarged} role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={dialog}>
      <header>
        <div><small>{panel.kind === 'counter' && !childOpen ? '柜台办理' : '任务附件与记录'}</small><h2>{title}</h2></div>
        <button class="close" onclick={back} aria-label={enlarged || childOpen ? '返回委托详情' : '关闭任务信息'}>{enlarged || childOpen ? '返回' : '关闭'} ×</button>
      </header>
      <div class="task-body" class:picture-only={enlarged}>
        {#if artId && npcTaskImage(artId)}
          <div class="art-sheet" class:paper={!!document}>
            {#if document}
              <NpcTaskDocumentArt {document} expanded={enlarged} onZoom={() => enlarged = !enlarged} />
            {:else}
              <button class="art-button" onclick={() => enlarged = !enlarged} aria-label={enlarged ? '缩小附件图片' : '放大附件图片'}>
                <img src={npcTaskImage(artId)} alt={NPC_TASK_ART_LABELS[artId] ?? title} />
              </button>
            {/if}
            {#if !enlarged}<span class="image-hint">点击图片放大 · 查看不耗时</span>{/if}
          </div>
        {/if}
        {#if !enlarged}
          {#if item || document}
            {#if item}<p class="item-desc">{item.desc}</p>
            <div class="held">随身持有 <strong>{itemCount(gameState, item.id)}</strong> 件</div>{/if}
            {#if document}
              <dl class="document-fields">{#each document.fields as field (`${field.label}:${field.value}`)}<div><dt>{field.label}</dt><dd>{field.value}</dd></div>{/each}</dl>
              {#if document.text}<p class="body-text">{document.text}</p>{/if}
            {/if}
          {:else if childOpen || panel.kind === 'art'}
            <p class="image-hint">{NPC_TASK_ART_LABELS[artId ?? ''] ?? '事件图卡'} · 查看不耗时</p>
          {:else if detail && quest}
            <div class="status-line" class:failed={quest.status === 'failed'}><strong>{detail.stageLabel}</strong><span>{detail.deadlineText}</span></div>
            <p class="goal">{detail.detail}</p>
            <ul class="progress-lines">{#each detail.lines as line (line)}<li>{line}</li>{/each}</ul>
            {#if detail.outcome}<p class="outcome">{detail.outcome}</p>{/if}
            {#if detail.attachments.length}
              <h3>已获得的附件</h3>
              <div class="attachment-grid">{#each detail.attachments as id (id)}
                {@const attachmentItem = getItem(id)}
                {@const imageId = attachmentItem?.artId ?? id}
                <button onclick={() => attachment(id)}>
                  {#if npcTaskImage(imageId)}<img src={npcTaskImage(imageId)} alt="" loading="lazy" />{/if}
                  <span>{attachmentItem?.name ?? NPC_TASK_ART_LABELS[id] ?? id}</span>
                </button>
              {/each}</div>
            {/if}
          {:else if result}
            <p class="body-text result" role="status">{result.text}</p>
            <p class="image-hint">{result.timeCost ? `本次办理消耗 ${formatDuration(result.timeCost)}` : '没有消耗时间'}</p>
            <button class="primary" onclick={closeNpcTaskPanel}>收好，继续</button>
          {:else if counter}
            <p class="body-text">{counter.text}</p>
            {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
            <div class="counter-choices">{#each counter.choices as choice (choice.id)}
              <button class="primary" disabled={busy || !!choice.disabledReason} onclick={() => submit(choice)}>
                <span>{choice.label}</span>{#if choice.disabledReason}<small>{choice.disabledReason}</small>{/if}
              </button>
            {/each}</div>
            <p class="image-hint">确认前可关闭；确认后按本次约定交接。</p>
          {:else}
            <p class="body-text">这件事的进展已经改变，请关闭后重新查看。</p>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .task-overlay { position: fixed; inset: 0; z-index: 1600; background: #050a16d9; backdrop-filter: blur(8px); display: grid; place-items: center; padding: 18px; color: var(--text, #eef1ff); }
  .task-reader { width: min(860px, 96vw); max-height: 94dvh; display: flex; flex-direction: column; background: var(--bg-card, #182033); border: 1px solid var(--stroke, #46536a); border-radius: 18px; box-shadow: 0 24px 90px #0009; overflow: hidden; outline: none; }
  .task-reader.wide { width: min(1500px, 97vw); }
  header { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 15px 22px; border-bottom: 1px solid var(--stroke, #46536a); flex-shrink: 0; }
  header small { color: var(--muted, #adb8cf); font-size: 11px; letter-spacing: .12em; }
  h2 { font-size: clamp(17px, 2.3vw, 24px); margin: 5px 0 0; line-height: 1.4; }
  .close { flex-shrink: 0; min-height: 42px; background: transparent; color: inherit; border: 1px solid var(--stroke, #52617b); border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  .task-body { overflow: auto; padding: 20px 24px 25px; line-height: 1.75; overscroll-behavior: contain; }
  .art-sheet { text-align: center; margin-bottom: 16px; background: #ffffff08; border: 1px solid #ffffff14; border-radius: 12px; padding: 10px; }
  .art-button { display: block; background: transparent; border: 0; padding: 0; width: 100%; cursor: zoom-in; }
  .art-button img { display: block; width: 100%; max-height: 48dvh; object-fit: contain; }
  .picture-only .art-button { cursor: zoom-out; }
  .picture-only .art-button img { max-height: none; width: 100%; }
  .image-hint { display: block; color: var(--muted, #bac5d9); font-size: 12px; margin: 8px 0; }
  .body-text { white-space: pre-line; margin: 0 0 18px; font-size: 15px; }
  .item-desc { margin: 10px 0; }
  .held { display: inline-flex; gap: 8px; padding: 4px 12px; background: #64bdd518; border-radius: 6px; }
  .document-fields { margin: 16px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .document-fields div { padding: 9px 12px; background: #ffffff08; border-left: 2px solid #bca275; }
  dt { color: var(--muted, #bac5d9); font-size: 12px; } dd { margin: 2px 0 0; font-weight: 650; overflow-wrap: anywhere; }
  .status-line { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; color: #9bd6ba; } .status-line.failed { color: #ffada5; }
  .status-line span { font-size: 13px; } .goal { font-weight: 650; font-size: 16px; }
  .progress-lines { padding-left: 22px; color: var(--muted, #c6cfdf); } .progress-lines li { margin: 7px 0; }
  .outcome { background: #e8ca8d13; border-left: 3px solid #c8b181; padding: 12px 16px; white-space: pre-line; }
  h3 { font-size: 14px; margin: 22px 0 12px; }
  .attachment-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .attachment-grid button { display: flex; flex-direction: column; justify-content: space-between; gap: 8px; border: 1px solid var(--stroke, #46536a); border-radius: 9px; padding: 10px; background: #ffffff08; color: inherit; cursor: pointer; }
  .attachment-grid img { width: 100%; height: 90px; object-fit: contain; } .attachment-grid span { font-size: 12px; }
  .counter-choices { display: grid; gap: 10px; }
  .primary { color: inherit; background: #6b87a52b; border: 1px solid #809fb880; border-radius: 9px; padding: 12px 16px; cursor: pointer; min-height: 44px; text-align: left; }
  .primary small { display: block; font-size: 11px; margin-top: 4px; } .primary:disabled { opacity: .5; cursor: default; }
  .error { color: #ffb7a9; padding: 10px; background: #a64c3022; border-radius: 8px; }
  @media (max-width: 600px) { .task-overlay { padding: 8px; } header { padding: 11px 14px; } .task-body { padding: 14px; } .document-fields { grid-template-columns: 1fr; } .attachment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .task-reader { max-height: 96dvh; } }
  @media (max-height: 500px) and (orientation: landscape) { .task-overlay { padding: 6px; } .task-reader { max-height: 96dvh; } header { padding: 6px 14px; } header small { display: none; } h2 { font-size: 16px; margin: 0; } .task-body { padding: 12px 18px; } .art-button img { max-height: 52dvh; } }
</style>
