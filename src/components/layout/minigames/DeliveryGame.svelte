<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { DeliveryCfg, DeliveryPoint } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /**
   * 配送模板（E · v1.3 beta2）：网格路网 + Dijkstra 自动寻路 + 订单状态机。
   * 纯鼠标/触控操作 —— 点击地图上的取货点/送达点即自动导航过去。
   * 三种 mode 共用同一套地图几何，仅替换取送点池、文案与主题色：
   * food（外卖）/ parcel（快递）/ rideshare（网约车·出租车）。
   */
  let { cfg, onFinish }: { cfg: DeliveryCfg; onFinish: (ratio: number) => void } = $props();

  // ---- 地图几何（逻辑坐标固定，CSS 负责缩放） ----
  const W = 1050;
  const H = 620;
  const xs = [135, 440, 750, 970];
  const ys = [125, 315, 505];

  // ---- 三种 mode 的默认文案与配色 ----
  const MODE_DEF = {
    food: { rider: "🛵", pickup: "取餐", dropoff: "送餐", prep: "制作中", order: "订单", accent: "#f47749" },
    parcel: { rider: "🚚", pickup: "取件", dropoff: "派送", prep: "分拣中", order: "运单", accent: "#4a7fd0" },
    rideshare: { rider: "🚗", pickup: "接客", dropoff: "送达", prep: "呼叫中", order: "行程", accent: "#2fa189" },
  } as const;
  const M = MODE_DEF[cfg.mode] ?? MODE_DEF.food;
  const L = {
    pickup: cfg.labels?.pickup ?? M.pickup,
    dropoff: cfg.labels?.dropoff ?? M.dropoff,
    order: cfg.labels?.order ?? M.order,
    cooking: cfg.labels?.cooking ?? M.prep,
  };
  const ACCENT = cfg.theme?.accent ?? M.accent;
  const ROAD = cfg.theme?.road ?? "#526976";
  const DROP_COLOR = "#0f8f7e";

  // ---- 局内参数 ----
  const timeLimit = cfg.timeLimit ?? 30;
  const targetOrders = Math.max(1, cfg.targetOrders ?? 5);
  const payPerOrder = cfg.payPerOrder ?? 22;
  const maxActive = Math.max(1, cfg.maxActive ?? 3);
  /** 备货倒计时（秒） */
  const PREP_SEC = 2;
  /** 单个订单超时（秒） */
  const EXPIRE_SEC = 22;
  /** 骑手速度（逻辑像素 / 16ms） */
  const SPEED = 5.2;

  const pickups = cfg.pickups ?? [];
  const drops = cfg.drops ?? [];

  interface Order {
    id: number;
    pickup: DeliveryPoint;
    drop: DeliveryPoint;
    stage: "cooking" | "pickup" | "delivery";
    cd: number;
    left: number;
  }

  let orders = $state<Order[]>([]);
  let money = $state(0);
  let done = $state(0);
  let failed = $state(0);
  let timeLeft = $state(timeLimit);
  let finished = $state(false);
  let hint = $state("");
  let boxW = $state(720);

  const compact = $derived(boxW < 430);

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let seq = 1;
  let rafId = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTs = 0;
  const rider = { x: xs[0], y: ys[0] };
  let route: { x: number; y: number }[] = [];

  const cars = [
    { x: 25, y: 104, dir: "h", v: 1.15, c: "#f2ad45" },
    { x: 500, y: 145, dir: "h", v: 1.3, c: "#e76f51" },
    { x: 680, y: 294, dir: "h", v: 1, c: "#5e9bd7" },
    { x: 870, y: 525, dir: "h", v: 1.2, c: "#855eae" },
    { x: 114, y: 430, dir: "v", v: 1.05, c: "#e98d51" },
    { x: 771, y: 50, dir: "v", v: 1.15, c: "#4a9b8c" },
  ];

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function addOrder(): void {
    if (orders.length >= maxActive || !pickups.length || !drops.length) return;
    orders = [...orders, { id: seq++, pickup: pick(pickups), drop: pick(drops), stage: "cooking", cd: PREP_SEC, left: EXPIRE_SEC }];
  }

  function flash(msg: string): void {
    hint = msg;
    setTimeout(() => {
      if (hint === msg) hint = "";
    }, 1400);
  }

  // ---- 寻路（Dijkstra on 网格路口 + 当前有效门口） ----
  function graphNodes(): { x: number; y: number }[] {
    const n: { x: number; y: number }[] = [];
    for (const x of xs) for (const y of ys) n.push({ x, y });
    for (const o of orders) {
      if (o.stage === "pickup") n.push(o.pickup.door);
      if (o.stage === "delivery") n.push(o.drop.door);
    }
    n.push({ x: rider.x, y: rider.y });
    return n;
  }

  /** 同一条路（共线）即可直达 */
  function linked(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return Math.abs(a.y - b.y) < 1 || Math.abs(a.x - b.x) < 1;
  }

  function nav(goal: { x: number; y: number }): void {
    const n = graphNodes();
    n.push(goal);
    const start = n.length - 2;
    const finish = n.length - 1;
    const dist = n.map(() => Infinity);
    const prev = n.map(() => -1);
    const used = n.map(() => false);
    dist[start] = 0;
    for (let z = 0; z < n.length; z++) {
      let u = -1;
      for (let i = 0; i < n.length; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === finish) break;
      used[u] = true;
      for (let v = 0; v < n.length; v++) {
        if (used[v] || !linked(n[u], n[v])) continue;
        const d = Math.hypot(n[u].x - n[v].x, n[u].y - n[v].y);
        if (dist[u] + d < dist[v]) {
          dist[v] = dist[u] + d;
          prev[v] = u;
        }
      }
    }
    if (prev[finish] < 0) return;
    const p: { x: number; y: number }[] = [];
    for (let k = finish; k !== start; k = prev[k]) p.unshift({ x: n[k].x, y: n[k].y });
    route = p;
  }

  interface Target {
    order: Order;
    type: "pickup" | "delivery";
    p: { x: number; y: number };
  }

  function targets(): Target[] {
    const a: Target[] = [];
    for (const o of orders) {
      if (o.stage === "pickup") a.push({ order: o, type: "pickup", p: o.pickup.door });
      if (o.stage === "delivery") a.push({ order: o, type: "delivery", p: o.drop.door });
    }
    return a;
  }

  /** 画布点击：命中取送点则导航过去，否则走到最近路口 */
  function onCanvasClick(e: MouseEvent): void {
    if (finished || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    const hit = targets().find((t) => Math.hypot(p.x - t.p.x, p.y - t.p.y) < 36);
    if (hit) {
      nav(hit.p);
      playSound("game");
      return;
    }
    const nearest = {
      x: xs.reduce((a, x) => (Math.abs(x - p.x) < Math.abs(a - p.x) ? x : a), xs[0]),
      y: ys.reduce((a, y) => (Math.abs(y - p.y) < Math.abs(a - p.y) ? y : a), ys[0]),
    };
    nav(nearest);
  }

  /** 订单卡片点击：直接导航到该单当前目标（窄屏友好） */
  function goOrder(o: Order): void {
    if (finished) return;
    if (o.stage === "pickup") nav(o.pickup.door);
    else if (o.stage === "delivery") nav(o.drop.door);
    else flash(`${L.order} #${o.id} ${L.cooking}…`);
  }

  function arrive(): void {
    const t = targets().find((q) => Math.hypot(rider.x - q.p.x, rider.y - q.p.y) < 14);
    if (!t) return;
    if (t.type === "pickup") {
      orders = orders.map((o) => (o.id === t.order.id ? { ...o, stage: "delivery" as const } : o));
      playSound("game");
      flash(`✅ ${L.pickup}成功 · ${L.order} #${t.order.id}`);
    } else {
      money += payPerOrder;
      done++;
      orders = orders.filter((o) => o.id !== t.order.id);
      playSound("cashier");
      flash(`🎉 ${L.dropoff}完成 +¥${payPerOrder}`);
      addOrder();
      if (done >= targetOrders) return end();
    }
  }

  function end(): void {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    if (rafId) cancelAnimationFrame(rafId);
    onFinish(Math.min(1, done / targetOrders));
  }

  function tick(): void {
    if (finished) return;
    timeLeft--;
    let lost = 0;
    orders = orders
      .map((o) => {
        let { stage, cd, left } = o;
        if (stage === "cooking") {
          cd--;
          if (cd <= 0) stage = "pickup";
        }
        if (stage === "delivery") left--;
        return { ...o, stage, cd, left };
      })
      .filter((o) => {
        if (o.stage === "delivery" && o.left <= 0) {
          lost++;
          return false;
        }
        return true;
      });
    if (lost) {
      failed += lost;
      playSound("error");
      flash("⌛ 有订单超时了");
    }
    while (orders.length < maxActive) {
      const before = orders.length;
      addOrder();
      if (orders.length === before) break;
    }
    if (timeLeft <= 0) end();
  }

  // ---- 绘制 ----
  function road(x: number, y: number, w: number, h: number): void {
    if (!ctx) return;
    ctx.fillStyle = "#e6ddcc";
    ctx.fillRect(x - 9, y - 9, w + 18, h + 18);
    ctx.fillStyle = ROAD;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#f3d679";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 15]);
    ctx.beginPath();
    if (w > h) {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
    } else {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function building(b: DeliveryPoint, isShop: boolean): void {
    if (!ctx) return;
    const col = b.color ?? (isShop ? ACCENT : "#588cc9");
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = "#365d66";
    ctx.globalAlpha = 0.15;
    ctx.fillRect(-53, -26, 106, 67);
    ctx.globalAlpha = 1;
    ctx.fillStyle = isShop ? "#fff1db" : "#f6f6f0";
    ctx.fillRect(-50, -35, 100, 60);
    ctx.fillStyle = col;
    ctx.fillRect(-55, -43, 110, 16);
    ctx.fillStyle = isShop ? "#334e58" : "#ffffff";
    for (let i = -35; i <= 23; i += 28) ctx.fillRect(i, -17, 15, 16);
    ctx.fillStyle = isShop ? "#fff7e7" : "#d8aa79";
    ctx.fillRect(-8, 7, 16, 18);
    ctx.fillStyle = "#27474d";
    ctx.font = "bold 12px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.name, 0, 42);
    if (b.icon) {
      ctx.font = "23px sans-serif";
      ctx.fillText(b.icon, 0, -47);
    } else if (!isShop) {
      ctx.fillStyle = "#77b886";
      ctx.beginPath();
      ctx.arc(-58, 12, 13, 0, 7);
      ctx.arc(58, 12, 13, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  function pin(p: { x: number; y: number }, type: "pickup" | "delivery", label: string): void {
    if (!ctx) return;
    const col = type === "pickup" ? ACCENT : DROP_COLOR;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = col + "33";
    ctx.beginPath();
    ctx.arc(0, 0, 20 + Math.sin(Date.now() / 180) * 2, 0, 7);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(type === "pickup" ? "取" : "送", 0, 5);
    ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
    const w = ctx.measureText(label).width + 18;
    ctx.fillStyle = "#ffffffee";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(-w / 2, -50, w, 20, 7);
    else ctx.rect(-w / 2, -50, w, 20);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(label, 0, -36);
    ctx.restore();
  }

  function draw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#b9ddb4";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff16";
    for (let x = 25; x < W; x += 55)
      for (let y = 25; y < H; y += 55) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 7);
        ctx.fill();
      }
    for (const y of ys) road(0, y - 37, W, 74);
    for (const x of xs) road(x - 37, 0, 74, H);
    for (const b of pickups) building(b, true);
    for (const b of drops) building(b, false);
    for (const t of targets()) pin(t.p, t.type, `${t.type === "pickup" ? L.pickup : L.dropoff} · #${t.order.id}`);
    for (const c of cars) {
      ctx.fillStyle = c.c;
      ctx.fillRect(c.x - 13, c.y - 8, 26, 16);
      ctx.fillStyle = "#d8f0f1";
      ctx.fillRect(c.x - 5, c.y - 6, 10, 5);
      ctx.fillStyle = "#253943";
      ctx.fillRect(c.x - 9, c.y + 7, 6, 4);
      ctx.fillRect(c.x + 4, c.y + 7, 6, 4);
    }
    if (route.length) {
      ctx.strokeStyle = "#ffbd59";
      ctx.lineWidth = 4;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(rider.x, rider.y);
      for (const p of route) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = "31px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(M.rider, rider.x, rider.y + 8);
    ctx.textAlign = "left";
  }

  function move(dt: number): void {
    if (!route.length) return;
    const q = route[0];
    const dx = q.x - rider.x;
    const dy = q.y - rider.y;
    const d = Math.hypot(dx, dy);
    const s = SPEED * dt;
    if (d <= s) {
      rider.x = q.x;
      rider.y = q.y;
      route.shift();
      if (!route.length) arrive();
    } else {
      rider.x += (dx / d) * s;
      rider.y += (dy / d) * s;
    }
  }

  function traffic(dt: number): void {
    for (const c of cars) {
      if (c.dir === "h") {
        c.x += c.v * dt;
        if (c.x > W + 30) c.x = -35;
      } else {
        c.y += c.v * dt;
        if (c.y > H + 30) c.y = -35;
      }
    }
  }

  function loop(t: number): void {
    if (finished) return;
    const dt = Math.min((t - lastTs) / 16, 2);
    lastTs = t;
    move(dt);
    traffic(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function resize(): void {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  onMount(() => {
    resize();
    addOrder();
    addOrder();
    timer = setInterval(tick, 1000);
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
  });
</script>

<div class="dg" bind:clientWidth={boxW} style="--dg-accent:{ACCENT};--dg-drop:{DROP_COLOR}">
  <div class="mg-hud">
    <div class="mg-hud-item"><b>¥{money}</b><span>收入</span></div>
    <div class="mg-hud-item"><b>{done}/{targetOrders}</b><span>已完成</span></div>
    <div class="mg-hud-item"><b>{orders.length}/{maxActive}</b><span>在手</span></div>
    <div class="mg-hud-item" class:urgent={timeLeft <= 8}><b>{Math.max(0, timeLeft)}</b><span>剩余秒</span></div>
  </div>

  <div class="dg-map">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas bind:this={canvas} onclick={onCanvasClick} aria-label="配送地图"></canvas>
    {#if hint}
      <div class="dg-flash">{hint}</div>
    {/if}
  </div>

  <div class="dg-orders" class:compact>
    {#each orders as o (o.id)}
      <button
        class="dg-card"
        class:ready={o.stage === "pickup"}
        class:onway={o.stage === "delivery"}
        onclick={() => goOrder(o)}
      >
        <strong>{L.order} #{o.id}</strong>
        <span class="dg-route">{o.pickup.name} → {o.drop.name}</span>
        <span class="dg-state">
          {#if o.stage === "cooking"}{L.cooking} {o.cd}s
          {:else if o.stage === "pickup"}去{L.pickup}
          {:else}{L.dropoff}中 · {o.left}s{/if}
        </span>
      </button>
    {/each}
    {#if orders.length === 0}
      <div class="dg-card empty">暂无{L.order} · 稍等派单</div>
    {/if}
  </div>

  <p class="dg-tip">点地图上的圆点自动前往；未{L.pickup}的{L.order}不显示{L.dropoff}点。{#if failed}<span class="dg-bad"> 超时 {failed} 单</span>{/if}</p>
</div>

<style>
  .dg {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mg-hud {
    display: flex;
    gap: 8px;
  }
  .mg-hud-item {
    flex: 1;
    padding: 6px 4px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border, #2a3050);
    text-align: center;
    line-height: 1.25;
  }
  .mg-hud-item b {
    display: block;
    font-size: 16px;
    color: var(--dg-accent);
  }
  .mg-hud-item span {
    font-size: 10px;
    color: var(--text-dim, #9aa3c7);
  }
  .mg-hud-item.urgent b {
    color: #ff8a7a;
    animation: dgpulse 0.7s ease-in-out infinite;
  }
  @keyframes dgpulse {
    50% { opacity: 0.45; }
  }
  .dg-map {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    border: 2px solid var(--border, #2a3050);
    background: #b9ddb4;
  }
  .dg-map canvas {
    display: block;
    width: 100%;
    height: auto;
    cursor: pointer;
  }
  .dg-flash {
    position: absolute;
    left: 50%;
    bottom: 8px;
    transform: translateX(-50%);
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(12, 16, 28, 0.82);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    animation: dgin 0.18s ease;
  }
  @keyframes dgin {
    from { opacity: 0; transform: translate(-50%, 6px); }
  }
  .dg-orders {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    min-height: 56px;
  }
  .dg-orders.compact {
    flex-direction: column;
    overflow-x: visible;
  }
  .dg-card {
    flex: 1 0 150px;
    min-width: 150px;
    text-align: left;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border, #2a3050);
    border-left: 4px solid var(--text-dim, #9aa3c7);
    color: var(--text, #e8ebff);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: transform 0.12s ease, background 0.12s ease;
  }
  .dg-orders.compact .dg-card {
    flex: none;
    min-width: 0;
    width: 100%;
  }
  .dg-card:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }
  .dg-card.ready {
    border-left-color: var(--dg-accent);
  }
  .dg-card.onway {
    border-left-color: var(--dg-drop);
  }
  .dg-card.empty {
    cursor: default;
    color: var(--text-dim, #9aa3c7);
    justify-content: center;
  }
  .dg-card strong {
    font-size: 12px;
  }
  .dg-route {
    font-size: 11px;
    color: var(--text-dim, #9aa3c7);
  }
  .dg-state {
    font-size: 11px;
    font-weight: 700;
    color: var(--dg-accent);
  }
  .dg-card.onway .dg-state {
    color: var(--dg-drop);
  }
  .dg-tip {
    margin: 0;
    font-size: 11px;
    color: var(--text-dim, #9aa3c7);
    line-height: 1.6;
  }
  .dg-bad {
    color: #ff8a7a;
    font-weight: 700;
  }
</style>
