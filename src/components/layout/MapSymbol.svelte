<script lang="ts">
  import { mapSymbol } from "../../lib/mapAtlas";
  let { id }: { id: string } = $props();
  const symbol = $derived(mapSymbol(id));
</script>

<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if symbol === "home"}
    <path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7" />
  {:else if symbol === "shop"}
    <path d="M4 9h16l-2-6H6l-2 6ZM5 12v9h14v-9M9 21v-6h6v6M4 9v1a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0V9" />
  {:else if symbol === "hotel"}
    <path d="M3 20V6m0 10h18v4M3 12h18v4M6 12V9h5a3 3 0 0 1 3 3m0 0V8h4a3 3 0 0 1 3 3v1" />
  {:else if symbol === "factory"}
    <path d="M3 21V10l6 3V8l7 4V3h4l1 18H3ZM6 17h1m4 0h1m4 0h1" />
  {:else if symbol === "station"}
    <rect x="5" y="3" width="14" height="15" rx="3" />
    <path d="M5 11h14M12 3v8M8 15h1m6 0h1M8 18l-3 3m11-3 3 3" />
  {:else if symbol === "leaf"}
    <path d="M20 3C9 2 3 7 5 14c2 7 16 5 15-11ZM3 21l13-13M8 16v-5m0 5h5" />
  {:else if symbol === "university"}
    <path d="m2 8 10-5 10 5-10 5-10-5ZM6 10v7c4 3 8 3 12 0v-7M22 8v8" />
  {:else if symbol === "sport"}
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M6 5c8 3 8 11 0 14M18 5c-8 3-8 11 0 14" />
  {:else if symbol === "night"}
    <path d="M16 3a8 8 0 1 0 5 13A8 8 0 0 1 16 3ZM5 4v4M3 6h4M20 4v4M18 6h4" />
  {:else if symbol === "airport"}
    <path d="m22 3-7 7-1 10-3 2-1-9-7-1-1-3 10 1 7-7 3 0Z" />
  {:else}
    <path d="M3 21V9h6v12M9 21V3h8v18M17 12h4v9H3M12 7h2m-2 4h2m-2 4h2M5 13h1m-1 4h1" />
  {/if}
</svg>
