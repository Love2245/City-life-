<script lang="ts">
  export type MenuIconName = "resume" | "new" | "save" | "settings" | "cat" | "spark" | "book" | "ending" | "game" | "volume" | "mute" | "sliders" | "palette" | "announcement" | "close" | "power";
  let { name, size = 20 }: { name: MenuIconName; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === "resume"}
    <path d="m9 5 10 7-10 7V5Z" />
  {:else if name === "new"}
    <path d="M12 4v16M4 12h16" />
  {:else if name === "save"}
    <path d="M4 6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" />
  {:else if name === "settings"}
    <path d="m9 3-.7 2.7-2.5 1L3.5 8l1.3 2.4v3.2L3.5 16l2.3 1.3 2.5 1L9 21h6l.7-2.7 2.5-1 2.3-1.3-1.3-2.4v-3.2L20.5 8l-2.3-1.3-2.5-1L15 3H9Z" /><circle cx="12" cy="12" r="3" />
  {:else if name === "cat"}
    <path d="M5 10 4 3l6 4h4l6-4-1 7a7 7 0 0 1-7 11 7 7 0 0 1-7-11Z" /><path d="M8 13h.01M16 13h.01m-6 4 2 1 2-1M2 15l5 1m10 0 5-1" />
  {:else if name === "spark"}
    <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
  {:else if name === "book"}
    <path d="M12 6C8 3 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-5-2-9 1Zm0 0v14" />
  {:else if name === "ending"}
    <path d="M6 4h12v5a6 6 0 0 1-12 0V4Zm6 11v5m-4 0h8M6 6H3v3a4 4 0 0 0 4 4m11-7h3v3a4 4 0 0 1-4 4" />
  {:else if name === "game"}
    <path d="M8 7h8a5 5 0 0 1 5 4l1 7a2 2 0 0 1-3.5 1.5L15 16H9l-3.5 3.5A2 2 0 0 1 2 18l1-7a5 5 0 0 1 5-4Z" /><path d="M7 10v5m-2.5-2.5h5M16 11h.01M18 14h.01" />
  {:else if name === "volume" || name === "mute"}
    <path d="M11 4 6 8H3v8h3l5 4V4Z" />
    {#if name === "mute"}<path d="m16 9 6 6m0-6-6 6" />{:else}<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />{/if}
  {:else if name === "sliders"}
    <path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" />
  {:else if name === "palette"}
    <path d="M12 3a9 9 0 1 0 0 18h1.1a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H18a3 3 0 0 0 3-3c0-4.7-4-8.5-9-8.5Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" />
  {:else if name === "announcement"}
    <path d="M4 12v-2a2 2 0 0 1 2-2h4l7-4v16l-7-4H6a2 2 0 0 1-2-2v-2Z" /><path d="m10 16 1.4 4" /><path d="M20 9a4 4 0 0 1 0 6" />
  {:else if name === "close"}
    <path d="m6 6 12 12M18 6 6 18" />
  {:else if name === "power"}
    <path d="M12 3v9" /><path d="M7.2 7.2a7 7 0 1 0 9.6 0" />
  {/if}
</svg>
