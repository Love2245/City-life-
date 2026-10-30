<script lang="ts">
  type IconKind =
    | "coffee" | "meal" | "scooter" | "car" | "register" | "factory"
    | "parcel" | "dispatch" | "clipboard" | "tiles" | "chess" | "rhythm"
    | "bowling" | "dart" | "ring" | "cat" | "numbers" | "mine"
    | "snake" | "crate" | "fitness" | "produce" | "controller";

  let {
    gameKey,
    gameType,
    title = "",
    compact = false,
  }: { gameKey: string; gameType: string; title?: string; compact?: boolean } = $props();

  const tones: Record<string, string> = {
    restaurant: "#e6b873", delivery: "#7bc2d2", checkout: "#e5a286",
    factory: "#92b89d", dispatch: "#e0bd74", sequence: "#a8addd",
    memory: "#a8addd", whack: "#e29b8c", quiz: "#a8addd", sort: "#8bbbc0",
    chess: "#ccb681", rhythm: "#c39add", bowling: "#78bfd0", darts: "#de9b88",
    ringtoss: "#e1bd75", phone: "#81c0d0", cat: "#df9eaf",
  };

  function iconFor(key: string, type: string, label: string): IconKind {
    const id = key.toLowerCase();
    const text = `${key} ${label}`;
    if (type === "cat" || id.includes("cat-battle") || text.includes("喵喵")) return "cat";
    if (id.includes("2048")) return "numbers";
    if (id.includes("minesweeper")) return "mine";
    if (id.includes("snake")) return "snake";
    if (id.includes("sokoban") || text.includes("推箱子")) return "crate";
    if (id.includes("bowling") || type === "bowling") return "bowling";
    if (id.includes("dart") || type === "darts") return "dart";
    if (id.includes("ringtoss") || type === "ringtoss") return "ring";
    if (type === "rhythm") return "rhythm";
    if (type === "chess") return "chess";
    if (/健身|锻炼|训练|exercise|training/i.test(text)) return "fitness";
    if (/果园|农场|牧场|挤奶|采摘|farm|orchard|pasture/i.test(text)) return "produce";
    if (type === "restaurant") return /咖啡|奶茶|茶饮|饮品|饮料|barista/i.test(text) ? "coffee" : "meal";
    if (type === "delivery") return /出租|网约车|驾校|驾驶|taxi|ride.hailing|driving/i.test(text) ? "car" : "scooter";
    if (type === "checkout") return /分拣|仓储|快递|物流|parcel|warehouse/i.test(text) ? "parcel" : "register";
    if (type === "factory") return /分拣|仓储|快递|物流|loading|sorting|warehouse/i.test(text) ? "parcel" : "factory";
    if (type === "dispatch") return "dispatch";
    if (["sequence", "memory", "whack"].includes(type)) return "tiles";
    if (["quiz", "sort"].includes(type)) return "clipboard";
    if (id === "restaurant" || id === "meal") return "meal";
    if (id === "delivery" || id === "scooter") return "scooter";
    if (id === "factory") return "factory";
    if (id === "checkout" || id === "register") return "register";
    if (id === "dispatch") return "dispatch";
    if (id === "reflex" || id === "brain") return "tiles";
    if (id === "amusement") return "bowling";
    return "controller";
  }

  let variant = $derived(iconFor(gameKey, gameType, title));
  let tone = $derived(tones[gameType] ?? "#d8bc7e");
</script>

<span class="arcade-game-icon" class:compact data-variant={variant} style={`--icon-accent:${tone}`} aria-hidden="true">
  <span class="icon-orbit"></span>
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    {#if variant === "coffee"}
      <path class="icon-fill" d="M17 24h27l-2.6 23H19.6L17 24Z" />
      <path d="M44 28h3a6 6 0 0 1 0 12h-4M14 51h35M23 18c-3-3 3-4 0-8m10 8c-3-3 3-4 0-8" />
    {:else if variant === "meal"}
      <path class="icon-fill" d="M12 34h40a20 20 0 0 1-40 0Z" />
      <path d="M12 34h40M17 28a15 15 0 0 1 30 0M21 48h22M8 21v10m-3-10v6m6-6v6m45-6v27m-4-27c-4 4-4 9 0 12" />
    {:else if variant === "scooter"}
      <circle cx="17" cy="45" r="6" /><circle cx="48" cy="45" r="6" />
      <path class="icon-fill" d="M22 43h12l-4-13h9l6 9H34l-5-8-6 1 3 7h-4l-4-12h8" />
      <path d="M39 25h7l4 5m-22 14 6-1m11-1 3 3" />
    {:else if variant === "car"}
      <path class="icon-fill" d="m12 39 4-13a5 5 0 0 1 5-4h22a5 5 0 0 1 5 4l4 13v9H12v-9Z" />
      <path d="m18 34 3-8h22l3 8M13 38h38M21 48v4m22-4v4" /><circle cx="21" cy="43" r="2" /><circle cx="43" cy="43" r="2" />
    {:else if variant === "register"}
      <path class="icon-fill" d="M13 25h38v25H13z" />
      <path d="M20 25v-8h24v8M18 32h10v7H18zm17 0h8m-8 6h8M21 44h22M17 50v4m30-4v4" />
    {:else if variant === "factory"}
      <path class="icon-fill" d="M11 50V30l13 8V27l13 8V20h16v30H11Z" />
      <path d="M18 44h4m5 0h4m5 0h4m5-18h4m-4 8h4M19 15v8m8-8v8" />
    {:else if variant === "parcel"}
      <path class="icon-fill" d="m12 23 20-10 20 10v26L32 59 12 49V23Z" />
      <path d="m12 23 20 11 20-11M32 34v25m-10-31 20-11M22 38h6m-6 6h6" />
    {:else if variant === "dispatch"}
      <rect class="icon-fill" x="15" y="14" width="34" height="39" rx="5" />
      <path d="M23 10v9m18-9v9M15 25h34M23 34h6m7 0h6m-19 8 4 4 9-9" />
    {:else if variant === "clipboard"}
      <path class="icon-fill" d="M19 15h26a4 4 0 0 1 4 4v34H15V19a4 4 0 0 1 4-4Z" />
      <path d="M25 13h14v7H25zM22 30h20m-20 8h20m-20 8h12" />
    {:else if variant === "tiles"}
      <rect class="icon-fill" x="13" y="13" width="17" height="17" rx="4" />
      <rect x="34" y="13" width="17" height="17" rx="4" />
      <rect x="13" y="34" width="17" height="17" rx="4" />
      <rect class="icon-fill" x="34" y="34" width="17" height="17" rx="4" />
      <path d="M21 21h1m20 20h1" />
    {:else if variant === "chess"}
      <path class="icon-fill" d="M24 49h22l-3-8-7-5 6-8-3-8-7-8-6 8 3 8-8 7 6 6-3 8Z" />
      <path d="M20 53h30M30 29l9-2m-6 10 8-1" />
    {:else if variant === "rhythm"}
      <path class="icon-fill" d="M37 12v31a8 8 0 1 1-5-7V20l19-5v27a8 8 0 1 1-5-7V12h-9Z" />
      <path d="M12 24v16m-5-12v8m-3-5h3m39-16h5" />
    {:else if variant === "bowling"}
      <circle class="icon-fill" cx="20" cy="46" r="8" />
      <path d="M18 44h.1m5 3h.1m-6 4h.1M39 13c-4 7-4 13-2 20h12c2-7 2-13-2-20h-8Zm-1 9h10m-9 7h8M42 12v6m6-6v6" />
    {:else if variant === "dart"}
      <circle class="icon-fill" cx="31" cy="34" r="19" />
      <circle cx="31" cy="34" r="12" /><circle cx="31" cy="34" r="5" />
      <path d="m31 34 16-18m-3 1 5-3-1 6m-23 28h12" />
    {:else if variant === "ring"}
      <path class="icon-fill" d="M31 20h4l4 29H25l4-29h2Z" />
      <path d="M16 43a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm14 0a9 9 0 1 0 18 0 9 9 0 0 0-18 0ZM27 53h14" />
    {:else if variant === "cat"}
      <path class="icon-fill" d="m15 27-2-14 13 8h12l13-8-2 14a19 19 0 1 1-34 0Z" />
      <path d="M23 33h.1m18 0h.1m-13 8 4 2 4-2M8 40l13 2m22 0 13-2" />
    {:else if variant === "numbers"}
      <rect class="icon-fill" x="11" y="11" width="18" height="18" rx="4" />
      <rect x="35" y="11" width="18" height="18" rx="4" />
      <rect x="11" y="35" width="18" height="18" rx="4" />
      <rect class="icon-fill" x="35" y="35" width="18" height="18" rx="4" />
      <path d="M17 22h5m19-5h6m-6 6h6m-24 18h6m-6 6h6m18-2 2-5 2 5m-4-2h4" />
    {:else if variant === "mine"}
      <circle class="icon-fill" cx="32" cy="35" r="16" />
      <path d="M32 11v7m15 1-5 5m11 11h-7m-29-17 5 5M17 39h-6m17 11-3 6m17-6 3 6M25 34h.1m14 0h.1m-11 8 4 2 4-2" />
    {:else if variant === "snake"}
      <path class="icon-fill" d="M12 20h17a8 8 0 0 1 0 16H20a8 8 0 0 0 0 16h19a8 8 0 0 0 0-16" />
      <circle cx="28" cy="28" r="1.2" /><path d="M49 46h4m-22-4h.1m-6 0h.1m8-12h.1" />
    {:else if variant === "crate"}
      <path class="icon-fill" d="m12 22 20-10 20 10v27L32 59 12 49V22Z" />
      <path d="m12 22 20 11 20-11M32 33v26M25 19l20 10m-25 1 10 5m0 12 8-8m-8 8 8 8" />
    {:else if variant === "fitness"}
      <path class="icon-fill" d="M23 26h18l4 22H19l4-22Z" />
      <path d="M26 26v-6a6 6 0 0 1 12 0v6m-16 7h22M13 34v9m-4-7v5m-3-3h3m42-4v9m4-7v5m3-3h-3" />
    {:else if variant === "produce"}
      <path class="icon-fill" d="M15 40a17 17 0 1 0 34 0c0-6-4-12-10-15H25c-6 3-10 9-10 15Z" />
      <path d="M32 25c-1-8 4-12 12-12-1 8-5 12-12 12Zm0 2v20m-9-10 9 9 9-9" />
    {:else}
      <path class="icon-fill" d="M21 20h22a13 13 0 0 1 13 13l2 13a4 4 0 0 1-7 3l-8-8H21l-8 8a4 4 0 0 1-7-3l2-13a13 13 0 0 1 13-13Z" />
      <path d="M20 28v12m-6-6h12m18-4h.1m6 8h.1" />
    {/if}
  </svg>
</span>

<style>
  .arcade-game-icon {
    width: 88px;
    height: 70px;
    flex: 0 0 auto;
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--icon-accent) 34%, #ffffff12);
    border-radius: 14px;
    color: color-mix(in srgb, var(--icon-accent) 75%, #fff6dc);
    background:
      radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--icon-accent) 22%, transparent), transparent 62%),
      linear-gradient(145deg, #203849, #152736 72%);
    box-shadow: inset 0 1px 0 #ffffff12;
  }
  .arcade-game-icon::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(160deg, #ffffff0b, transparent 45%);
  }
  .icon-orbit {
    position: absolute;
    width: 48px;
    height: 48px;
    border: 1px solid color-mix(in srgb, var(--icon-accent) 16%, transparent);
    border-radius: 50%;
  }
  svg { position: relative; z-index: 1; width: 50px; height: 50px; }
  .icon-fill { fill: color-mix(in srgb, var(--icon-accent) 28%, #172937); }
  .arcade-game-icon.compact {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    box-shadow: none;
  }
  .compact .icon-orbit { width: 15px; height: 15px; }
  .compact svg { width: 18px; height: 18px; stroke-width: 3; }
</style>
