<script lang="ts">
  let { id, compact = false }: { id: string; compact?: boolean } = $props();
  const icons: Record<string, { colors: [string, string]; path: string }> = {
    home: { colors: ["#68adff", "#3b68de"], path: "M5 12 12 5l7 7M7 11v8h10v-8M10 19v-5h4v5" },
    call: { colors: ["#56d79b", "#149c68"], path: "M6 6h12v9H12l-4 3v-3H6zM9 10h6M9 12h4" },
    moments: { colors: ["#77b7ff", "#5867dd"], path: "M5 5h14v14H5zM7 16l4-4 3 3 2-2 2 3M8 8h2" },
    todo: { colors: ["#ffe193", "#e8ad3d"], path: "M8 5h8v3H8zM7 6H5v14h14V6h-2M8 12l1 1 2-2M13 12h3M8 16l1 1 2-2M13 16h3" },
    calendar: { colors: ["#f89b95", "#cc526b"], path: "M5 6h14v14H5zM8 4v4M16 4v4M5 10h14M8 13h2M14 13h2M8 16h2M14 16h2" },
    assets: { colors: ["#4fd8d0", "#179cbe"], path: "M5 19h14M7 15v-4M12 15V8M17 15V5" },
    relation: { colors: ["#ff9cad", "#e95c83"], path: "M12 19 5 12C1 7 8 3 12 8c4-5 11-1 7 4z" },
    goals: { colors: ["#e4a8fa", "#a366d5"], path: "M17 8a7 7 0 1 0 2 5M14 10a3 3 0 1 0 1 3M12 12l7-7M16 5h3v3" },
    settings: { colors: ["#bbc7dc", "#73849d"], path: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 4v2M12 18v2M4 12h2M18 12h2M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" },
    market: { colors: ["#7bb9ff", "#4967e6"], path: "M6 8h12l1 12H5zM9 9V6a3 3 0 0 1 6 0v3" },
    jobs: { colors: ["#cda47d", "#886848"], path: "M9 7V4h6v3M4 8h16v11H4zM4 12h16M10 11h4v3h-4z" },
    study: { colors: ["#8ad4ff", "#449fd4"], path: "M12 7c-3-2-6-2-8-1v12c2-1 5-1 8 1 3-2 6-2 8-1V6c-2-1-5-1-8 1zM12 7v12" },
    game: { colors: ["#b798ff", "#8059d7"], path: "M8 8h8c3 0 5 9 2 10l-4-3h-4l-4 3C3 17 5 8 8 8zM7 11v4M5 13h4M16 12h.1M18 14h.1" },
    tarot: { colors: ["#ddb8ff", "#9458c0"], path: "M6 4h12v16H6zM12 7l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" },
    delivery: { colors: ["#ffbf79", "#e88b35"], path: "M5 16a2 2 0 1 0 0 .1M18 16a2 2 0 1 0 0 .1M7 16h7l3-8h-4M5 10h5l4 6M17 5h3" },
    ride_hailing: { colors: ["#b8d690", "#73a550"], path: "M5 11l2-5h10l2 5M4 11h16v7H4zM7 18v2M17 18v2M7 14h1M16 14h1" },
    takeout: { colors: ["#ffcf7e", "#e78b45"], path: "M6 7h12l-1 13H7zM9 8V5a3 3 0 0 1 6 0v3M10 12h4" },
    shop: { colors: ["#ffada4", "#e76f78"], path: "M3 5h3l2 11h10l3-8H7M10 20h.1M17 20h.1" },
    live: { colors: ["#77d8cc", "#259ea0"], path: "M4 7h12v12H4zM16 11l5-3v10l-5-3M8 4h5" },
  };
  const icon = $derived(icons[id] ?? icons.home);
</script>

<span class="phone-app-icon" class:compact style={`--icon-top:${icon.colors[0]};--icon-bottom:${icon.colors[1]}`} aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icon.path} /></svg>
</span>

<style>
  .phone-app-icon { display:grid;place-items:center;width:54px;height:54px;flex:0 0 auto;border-radius:15px;color:#fff;background:linear-gradient(155deg,var(--icon-top),var(--icon-bottom));box-shadow:inset 0 1px 1px #ffffff70,0 5px 10px #030b1833; }
  svg { width:30px;height:30px;filter:drop-shadow(0 1px 1px #0002); }
  .compact { width:32px;height:32px;border-radius:10px; }
  .compact svg { width:21px;height:21px; }
  :global(.phone-home.panel) .phone-app-icon { width:43px;height:43px;border-radius:13px; }
  :global(.phone-home.panel) svg { width:26px;height:26px; }
</style>
