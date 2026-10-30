<script lang="ts">
  import type { NpcTaskDocument } from '../game/npcTaskTypes';
  import { npcTaskImage } from '../lib/npcTaskVisuals';
  let { document, onZoom, expanded = false }: { document: NpcTaskDocument; onZoom: () => void; expanded?: boolean } = $props();
  const ticket = $derived(document.artId === 'zhao-toy-ticket');
  const poster = $derived(document.artId === 'zhao-toy-poster');
  const form = $derived(['xiaoyu-print-receipt', 'farmer-appointment', 'farmer-receipt'].includes(document.artId));
  const aspect = $derived(ticket ? 1672 / 941 : poster || form ? 2 / 3 : document.artId.startsWith('xiaoyu-') ? 1491 / 1055 : 1);
</script>

<div class="document-art" class:ticket class:poster class:form class:expanded style:--document-aspect={aspect}>
  <button class="paper-image" onclick={onZoom} aria-label={`放大查看${document.title}`}><img src={npcTaskImage(document.artId)} alt={document.title} /></button>
  {#if ticket || poster || form}
    <div class="printed-fields" aria-label="票据上的实际信息">
      <strong class="paper-title">{poster ? '快餐联名 · 给孩子留一份' : document.title}</strong>
      <dl>{#each document.fields as field (field.label)}<div><dt>{field.label}</dt><dd>{field.value}</dd></div>{/each}</dl>
      {#if form && document.text}<p>{document.text}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .document-art { position: relative; width: min(100%, 700px, calc(52dvh * var(--document-aspect))); margin: auto; container-type: inline-size; }
  .document-art.expanded { width: min(100%, 1100px); }
  .paper-image { display: block; border: 0; background: transparent; padding: 0; width: 100%; cursor: zoom-in; }
  img { display: block; width: 100%; height: auto; }
  .printed-fields { position: absolute; inset: 15% 15% 14%; display: flex; flex-direction: column; color: #493a29; text-align: left; pointer-events: none; overflow: hidden; }
  .paper-title { display: block; text-align: center; font-size: 4.3cqw; margin-bottom: 4cqw; line-height: 1.5; }
  dl { display: grid; gap: 3.5cqw; margin: 0; }
  dl > div { padding: 1.3cqw 1.8cqw; background: #fff9e9df; border-bottom: .15cqw solid #8f896681; }
  dt { color: #6d6657; font-size: 2.5cqw; } dd { margin: .6cqw 0 0; font-size: 3.0cqw; font-weight: 650; line-height: 1.7; }
  p { font-size: 2.7cqw; background: #fff9e9df; padding: 1.5cqw; margin-top: auto; line-height: 1.8; }
  .ticket .printed-fields { inset: 27% 25% 28% 31%; }
  .ticket .paper-title { font-size: 3cqw; margin: 0 0 3cqw; }
  .ticket dl { gap: .3cqw; } .ticket dl > div { display: flex; align-items: baseline; gap: 1cqw; padding: 0; background: none; border: 0; }
  .ticket dt { font-size: 1.5cqw; flex-shrink: 0; } .ticket dd { font-size: 1.8cqw; margin: 0; line-height: 1.5; }
  .ticket dl > div:last-child { display: none; }
  .poster .printed-fields { inset: 4.5% 12% auto; }
  .poster .paper-title { font-size: 4.9cqw; margin: 0; }
  .poster dl { display: none; }
  .form .printed-fields { background: #fffdf2e8; border-radius: 5px; padding: 2cqw; }
</style>
