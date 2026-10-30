<script lang="ts">
  import { spriteUrl } from "../../lib/minigameSprites";

  let {
    game,
    item,
    fallback = "",
    label,
    class: className = "",
  }: {
    game: string;
    item: string;
    fallback?: string;
    label?: string;
    class?: string;
  } = $props();

  const url = $derived(spriteUrl(game, item));
</script>

{#if url}
  <img class={className} src={url} alt={label ?? fallback} aria-label={label} draggable="false" />
{:else}
  <span class={className} aria-label={label}>{fallback}</span>
{/if}

<style>
  :global(.sprite-icon) { display: inline-flex; align-items: center; justify-content: center; }
  img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
