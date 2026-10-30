<script lang="ts">
  let { kind = "plush_bear", label = "玩偶" }: { kind?: string; label?: string } = $props();
  const color = $derived(kind === "plush_rabbit" ? "#f2cabd" : kind === "plush_cat" ? "#e9b261" : kind === "plush_panda" ? "#f5eee1" : kind === "plush_dinosaur" ? "#74bca5" : "#bb885f");
</script>

<svg viewBox="0 0 100 110" role="img" aria-label={label}>
  <ellipse cx="50" cy="101" rx="31" ry="5" fill="#172625" opacity=".2" />
  {#if kind === "plush_rabbit"}
    <ellipse cx="32" cy="24" rx="10" ry="23" fill={color} transform="rotate(-9 32 24)" /><ellipse cx="68" cy="24" rx="10" ry="23" fill={color} transform="rotate(9 68 24)" />
    <ellipse cx="32" cy="23" rx="4" ry="15" fill="#e894a1" /><ellipse cx="68" cy="23" rx="4" ry="15" fill="#e894a1" />
  {:else if kind === "plush_cat"}
    <path d="M19 42 20 15 41 30M59 30 81 15 80 43" fill={color} stroke="#9c653f" stroke-width="2" />
  {:else if kind === "plush_dinosaur"}
    <path d="m38 30 4-16 12 11 9-13 9 22 14 6-12 9" fill="#e6bc69" />
    <path d="M67 75q30 15 29-8-14 12-24-7" fill={color} />
  {:else}
    <circle cx="23" cy="32" r="14" fill={kind === "plush_panda" ? "#35454b" : color} /><circle cx="77" cy="32" r="14" fill={kind === "plush_panda" ? "#35454b" : color} />
    {#if kind !== "plush_panda"}<circle cx="23" cy="32" r="7" fill="#e3b89a" /><circle cx="77" cy="32" r="7" fill="#e3b89a" />{/if}
  {/if}
  <ellipse cx="50" cy="78" rx="27" ry="28" fill={color} /><ellipse cx="24" cy="79" rx="10" ry="18" fill={kind === "plush_panda" ? "#35454b" : color} transform="rotate(22 24 79)" /><ellipse cx="76" cy="79" rx="10" ry="18" fill={kind === "plush_panda" ? "#35454b" : color} transform="rotate(-22 76 79)" />
  <ellipse cx="34" cy="99" rx="15" ry="9" fill={kind === "plush_panda" ? "#35454b" : color} /><ellipse cx="66" cy="99" rx="15" ry="9" fill={kind === "plush_panda" ? "#35454b" : color} />
  <ellipse cx="50" cy="47" rx="34" ry="29" fill={color} />
  {#if kind === "plush_panda"}<ellipse cx="36" cy="46" rx="10" ry="13" fill="#35454b" transform="rotate(18 36 46)" /><ellipse cx="64" cy="46" rx="10" ry="13" fill="#35454b" transform="rotate(-18 64 46)" />{/if}
  <circle cx="36" cy="46" r="3.4" fill="#273633" /><circle cx="64" cy="46" r="3.4" fill="#273633" /><circle cx="35" cy="45" r="1" fill="white" /><circle cx="63" cy="45" r="1" fill="white" />
  <ellipse cx="50" cy="58" rx="15" ry="10" fill="#f8e4ca" /><path d="m45 55 5 4 5-4" fill="#39453f" /><path d="M50 59v4m-7-1q7 7 14 0" fill="none" stroke="#39453f" stroke-width="1.7" stroke-linecap="round" />
  {#if kind === "plush_cat"}<path d="M25 57 10 54m16 8-16 1m64-6 16-3m-17 8 17 1" stroke="#6d503b" stroke-width="1.4" />{/if}
  <path d="m37 72 13 5 13-5-1 13-12-4-12 4Z" fill="#c35362" /><circle cx="50" cy="78" r="4" fill="#f0c776" />
</svg>

<style>svg{width:100%;height:auto;display:block}</style>
