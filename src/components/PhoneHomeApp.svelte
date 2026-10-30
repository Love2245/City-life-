<script lang="ts">
  import { onMount } from "svelte";
  import PhoneAppIcon from "./PhoneAppIcon.svelte";
  import { formatMoney } from "../lib/format";
  import { LIVE_FEATURE_ENABLED } from "../game/core/apps";

  type HomeAppId =
    | "todo"
    | "calendar"
    | "call"
    | "game"
    | "study"
    | "jobs"
    | "settings"
    | "assets"
    | "goals"
    | "relation"
    | "market"
    | "delivery"
    | "ride_hailing"
    | "moments"
    | "live"
    | "tarot";

  let {
    onOpen = () => {},
    variant = "full",
    phoneSkin = "default",
    familyName = "",
    balance = 0,
    timeLabel = "",
    dayLabel = "",
    unreadSms = 0,
    hasTodo = false,
    hasDelivery = false,
    hasRideHailing = false,
    hasLive = false,
  }: {
    onOpen?: (app: HomeAppId) => void;
    variant?: "full" | "panel";
    phoneSkin?: string;
    familyName?: string;
    balance?: number;
    timeLabel?: string;
    dayLabel?: string;
    unreadSms?: number;
    hasTodo?: boolean;
    hasDelivery?: boolean;
    hasRideHailing?: boolean;
    hasLive?: boolean;
  } = $props();

  type AppEntry = { id: HomeAppId; icon: string; label: string; badge?: number | string; visible?: boolean };
  const appGroups = $derived.by(() => {
    const groups: Array<{ id: string; title: string; apps: AppEntry[] }> = [
      {
        id: "communication",
        title: "通信",
        apps: [
          { id: "call", icon: "📱", label: "消息与通话", badge: unreadSms || undefined },
          { id: "jobs", icon: "💼", label: "招聘" },
        ],
      },
      {
        id: "life",
        title: "生活",
        apps: [
          { id: "todo", icon: "📋", label: "待办", badge: hasTodo ? "!" : undefined },
          { id: "calendar", icon: "📅", label: "日历" },
          { id: "assets", icon: "📊", label: "资产" },
          { id: "relation", icon: "💞", label: "关系" },
          { id: "goals", icon: "🎯", label: "目标" },
          { id: "settings", icon: "⚙️", label: "设置" },
          { id: "market", icon: "🛍️", label: "应用市场" },
        ],
      },
      {
        id: "work",
        title: "工作与学习",
        apps: [

          { id: "study", icon: "📖", label: "学习" },
          { id: "delivery", icon: "🛵", label: "外卖接单", visible: hasDelivery },
          { id: "ride_hailing", icon: "🚖", label: "网约车接单", visible: hasRideHailing },
        ],
      },
      {
        id: "entertainment",
        title: "娱乐",
        apps: [
          { id: "game", icon: "🎮", label: "手机游戏" },
          { id: "tarot", icon: "🔮", label: "塔罗" },
          { id: "live", icon: "📡", label: "直播", visible: LIVE_FEATURE_ENABLED && hasLive },
        ],
      },
    ];
    return groups.map((group) => ({ ...group, apps: group.apps.filter((entry) => entry.visible !== false) }));
  });
  const desktopApps = $derived(appGroups.flatMap(group => group.apps));
  let desktop: HTMLDivElement;
  let page = $state(0);
  let narrow = $state(false);
  let compact = $state(false);
  let desktopHeight = $state(600);
  let pointerStart: { x: number; y: number } | null = null;
  let suppressClickUntil = 0;
  let lastWheelAt = 0;
  const columns = $derived(narrow ? 2 : variant === "panel" ? 3 : 4);
  const availableRows = $derived(Math.max(1, Math.min(3, Math.floor((desktopHeight - 120) / 74))));
  const firstCapacity = $derived(columns * (compact ? Math.min(2, availableRows) : 2));
  const otherCapacity = $derived(columns * (compact ? availableRows : 3));
  const pages = $derived.by(() => {
    const result = [desktopApps.slice(0, firstCapacity)];
    const remaining = desktopApps.length - firstCapacity;
    if (remaining <= 0) return result;
    const pageCount = Math.ceil(remaining / otherCapacity);
    const balancedCapacity = Math.ceil(remaining / pageCount);
    for (let start = firstCapacity; start < desktopApps.length; start += balancedCapacity) {
      result.push(desktopApps.slice(start, start + balancedCapacity));
    }
    return result;
  });
  const activePage = $derived(Math.min(page, pages.length - 1));
  function turnPage(delta: number): void { page = Math.max(0, Math.min(pages.length - 1, activePage + delta)); }
  function wheelPage(event: WheelEvent): void {
    event.preventDefault(); event.stopPropagation();
    if (Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 8) return;
    const now = performance.now();
    if (now - lastWheelAt < 350) return;
    lastWheelAt = now;
    turnPage((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) > 0 ? 1 : -1);
  }
  function startSwipe(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    if (event.pointerType !== "mouse") {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      const captureTarget = button instanceof HTMLElement ? button : event.currentTarget;
      if (captureTarget instanceof HTMLElement) {
        try { captureTarget.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is unavailable in some embedded browsers. */ }
      }
    }
  }
  function endSwipe(event: PointerEvent): void {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClickUntil = performance.now() + 350;
      turnPage(dx < 0 ? 1 : -1);
    }
  }
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      narrow = desktop.clientWidth < 230;
      desktopHeight = desktop.clientHeight;
      compact = desktopHeight < (variant === "panel" ? 390 : 480);
    });
    observer.observe(desktop);
    return () => observer.disconnect();
  });
</script>
<div class="phone-home" class:panel={variant === "panel"} class:compact class:tiny={desktopHeight < 210} bind:this={desktop}
  data-phone-skin={phoneSkin} data-desktop-page={activePage + 1} role="region" aria-label="手机桌面"
  onwheel={wheelPage}
  onpointerdown={startSwipe}
  onpointerup={endSwipe} onpointercancel={() => { pointerStart = null; }}>
  {#if activePage === 0}
    <div class="home-clock"><span>{timeLabel}</span><small>{dayLabel || "今天也有新的可能"}</small></div>
    <section class="p-hero" aria-label="我的都市">
      <div class="wallet-heading"><span class="p-hero-label">我的都市 · 可用资金</span><span class="wallet-mark" aria-hidden="true">✦</span></div>
      <strong class="p-hero-balance">¥ {formatMoney(balance)}</strong>
      <div class="p-hero-sub">{familyName}家庭<span>生活，从这里出发</span></div>
    </section>
  {:else}
    <div class="page-heading"><span>应用</span><small>{dayLabel}</small></div>
  {/if}
  <div class="desktop-page" aria-label={`第 ${activePage + 1} 页应用`}>
    <div class="apps" aria-label="手机应用" style={`--desktop-columns:${columns}`}>
      {#each pages[activePage] as item (item.id)}
        <button class="app" onclick={() => { if (performance.now() >= suppressClickUntil) onOpen(item.id); }} aria-label={item.label}>
          <PhoneAppIcon id={item.id} />
          <span class="a-name">{item.label}</span>
          {#if item.badge}<span class="app-badge">{item.badge}</span>{/if}
        </button>
      {/each}
    </div>
  </div>
  <div class="home-pagination" aria-label="桌面翻页">
    <button class="page-arrow" aria-label="上一页应用" disabled={activePage === 0} onclick={() => turnPage(-1)}>‹</button>
    {#each pages as _, index}
      <button class="page-dot" class:current={activePage === index} aria-label={`转到第 ${index + 1} 页应用`} aria-current={activePage === index ? "page" : undefined} onclick={() => { page = index; }}><i></i></button>
    {/each}
    <button class="page-arrow" aria-label="下一页应用" disabled={activePage === pages.length - 1} onclick={() => turnPage(1)}>›</button>
  </div>
</div>
<style>
  .phone-home { height:100%;min-height:0;overflow:hidden;touch-action:none;padding:18px 18px 10px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px;color:#f4f7ff; }
  .home-clock { display:flex;flex-direction:column;gap:4px;text-align:center;text-shadow:0 2px 16px #09214344; }
  .home-clock > span { font:300 48px/1.08 system-ui,sans-serif;letter-spacing:-2px; }
  .home-clock small { color:#d3e0f5;font-size:12px;letter-spacing:.5px; }
  .p-hero { margin:0;padding:14px 16px 12px;display:flex;flex-direction:column;gap:6px;border:1px solid #ffffff28;border-radius:19px;background:linear-gradient(120deg,#ffffff20,#ffffff0b);box-shadow:inset 0 1px 0 #ffffff20,0 8px 25px #00000012;backdrop-filter:blur(18px); }
  .wallet-heading { display:flex;align-items:center;justify-content:space-between;gap:8px; }
  .p-hero-label { font-size:10px;color:#dbe8ff;letter-spacing:.7px; }
  .wallet-mark { color:#ffe5a2;font-size:18px; }
  .p-hero-balance { font-size:25px;line-height:1.2;letter-spacing:-.7px;font-weight:650;font-variant-numeric:tabular-nums;color:#fff; }
  .p-hero-sub { display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#c4d4ed; }
  .apps { display:grid;grid-template-columns:repeat(var(--desktop-columns,4),minmax(0,1fr));column-gap:9px;row-gap:17px;padding:0; }
  .app { position:relative;min-width:0;min-height:74px;padding:0;border:0;border-radius:14px;background:transparent;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;font:inherit;cursor:pointer; }
  .app:hover { transform:translateY(-2px); }.app:active{transform:scale(.94);}
  .a-name { display:block;max-width:100%;font-size:10px;line-height:1.25;text-align:center;text-shadow:0 1px 4px #0007;overflow-wrap:anywhere; }
  .app-badge { position:absolute;top:-4px;right:0;min-width:15px;height:17px;padding:0 4px;box-sizing:border-box;border:1.5px solid #27335a;border-radius:999px;display:grid;place-items:center;background:#ef636f;color:#fff;font-size:9px;font-weight:750; }
  .desktop-page { flex:1;min-height:0;overflow:hidden; }
  .page-heading { display:flex;align-items:center;justify-content:space-between;min-height:36px;font-size:19px;font-weight:650; }.page-heading small{font-size:10px;color:#c4d4ed;}
  .home-pagination { display:flex;align-items:center;justify-content:center;gap:2px;margin-top:auto;flex-shrink:0; }
  .page-dot,.page-arrow { display:grid;place-items:center;width:28px;height:27px;border:0;border-radius:12px;background:transparent;color:#e5edff;cursor:pointer; }
  .page-dot { flex:0 1 28px;min-width:10px; }.page-dot i { max-width:100%; }.page-arrow { flex-shrink:0; }
  .page-dot i { width:5px;height:5px;border-radius:50%;background:#ffffff50; }.page-dot.current i{background:#ffffffdf;width:14px;border-radius:4px;}
  .page-arrow{font-size:20px;}.page-arrow:disabled{opacity:.25;cursor:default;}.page-dot:hover,.page-arrow:not(:disabled):hover{background:#ffffff16;}
  .compact .home-clock > span{font-size:28px;}.compact .home-clock small{font-size:10px;}.compact .p-hero{display:none;}.compact.phone-home{gap:8px;padding:8px;}.compact .app{min-height:54px;}.compact .apps{row-gap:8px;}
  .tiny .home-clock,.tiny .page-heading{display:none;}
  .app:focus-visible { outline:2px solid #ffe39a;outline-offset:4px; }
  .panel { padding:10px 11px 7px;gap:12px; }
  .panel .home-clock > span { font-size:34px;letter-spacing:-1.3px; }.panel .home-clock small { font-size:10px; }
  .panel .p-hero { padding:10px 12px;border-radius:16px;gap:5px; }.panel .p-hero-balance {font-size:23px;}.panel .p-hero-sub {font-size:8px;}.panel .p-hero-sub span{display:none;}
  .panel .apps { grid-template-columns:repeat(var(--desktop-columns,3),minmax(0,1fr));row-gap:12px;column-gap:7px; }
  .panel .app { min-height:59px;gap:5px; }.panel .a-name {font-size:9px;line-height:1.15;}.panel .app-badge{right:5px;}
  @container handset (max-width:280px) {
    .phone-home { padding:10px 11px 7px;gap:12px; }.home-clock > span { font-size:34px; }.apps { grid-template-columns:repeat(var(--desktop-columns,3),minmax(0,1fr));gap:12px 7px; }.app { min-height:59px;gap:5px; }.p-hero { padding:10px 12px; }.p-hero-sub span { display:none; }
    :global(.phone-home .phone-app-icon) { width:43px;height:43px;border-radius:13px; }:global(.phone-home .phone-app-icon svg) { width:26px;height:26px; }
  }
  @container handset (max-width:220px) {
    .phone-home { padding:8px; }.apps { grid-template-columns:repeat(var(--desktop-columns,2),minmax(0,1fr)); }.home-clock > span { font-size:29px; }.p-hero { padding:8px; }.p-hero-label { font-size:8px; }.p-hero-balance { font-size:22px; }.wallet-mark { font-size:14px; }.a-name { font-size:9px; }
  }
</style>
