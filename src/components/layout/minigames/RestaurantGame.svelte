<script lang="ts">
  import { onMount } from "svelte";
  import type { RestaurantCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 餐饮组装模板（A）：顾客队列 + 按配方顺序组装主品 + 配菜/饮料 + 出餐比对 + 小费连击 + 生命值。
   *  适用于快餐(汉堡)/咖啡(杯装)/西餐(上菜)/网管(饮品小吃) —— 均为主品配方顺序组装，仅视觉形态不同。
   *  v1.3b2：服务完所有顾客即下班（无全局计时）；顾客数随机 4-6 人，
   *  小概率（20%）刷新 8-10 人 = 加班日（额外 +50% 工资，由结算层通过 onOvertime 接收）。
   *  v1.3b2 摆摊模式（cfg.stall）：无顾客总数、不计时，顾客按批刷新，服务完一批询问「继续 / 收摊」；
   *  每服务一人按份计钱（多劳多得）、扣体力、经过时间；体力不支或太晚强制收摊。 */
  let {
    cfg,
    onFinish,
    onOvertime,
    onStallResult,
    stallStamina,
    stallHour,
  }: {
    cfg: RestaurantCfg;
    onFinish: (ratio: number) => void;
    onOvertime?: (overtime: boolean) => void;
    /** v1.3b2 摆摊：结束时上报实际服务人数（供结算层多劳多得） */
    onStallResult?: (served: number) => void;
    /** v1.3b2 摆摊：本次摆摊可用体力（体力不支强制收摊） */
    stallStamina?: number;
    /** v1.3b2 摆摊：本次摆摊开始的小时（太晚强制收摊） */
    stallHour?: number;
  } = $props();

  const lives0 = cfg.lives ?? 3;
  const spawnMs = cfg.spawnMs ?? 4500;
  const maxWaiting = cfg.maxWaiting ?? 3;
  /** 摆摊模式标记 */
  const stallMode = cfg.stall === true;
  /** 摆摊：每客收入 / 体力消耗 / 耗时（小时） */
  const stallPay = cfg.stallPerCustomerPay ?? 0;
  const stallCost = cfg.stallStaminaCost ?? 1;
  const stallHours = cfg.stallHourPerCustomer ?? 0.25;
  /** v1.3b3 顾客数上限：达到即「食材用完了」强制收摊（0 = 无上限） */
  const stallCap = cfg.stallCustomerCap ?? 0;
  /** 摆摊：每晚最晚收摊时刻（超过则强制收摊） */
  const STALL_LATEST_HOUR = 23;
  /** v1.3b2：不再全局计时，本局实际顾客数开局随机（普通 4-6 / 加班 8-10）；摆摊无上限 */
  let totalCustomers = $state(0);
  let overtime = $state(false);
  /** 摆摊：本局累计服务人数 / 累计收入（多劳多得） */
  let stallServed = $state(0);
  let stallIncome = $state(0);
  /** 摆摊：剩余体力预算（开局 = 传入体力，每次服务扣 stallCost） */
  let stallStaminaLeft = $state(stallStamina ?? 0);
  /** 摆摊：当前模拟时刻（开始小时 + 已服务 × 每客耗时） */
  let stallClock = $state(stallHour ?? 18);
  /** 摆摊：一批服务完后的「继续 / 收摊」询问状态 */
  let stallAsking = $state(false);
  /** 摆摊：强制收摊原因（体力不支 / 时间太晚） */
  let stallForcedReason = $state("");
  /** 摆摊：每批顾客数（服务完一批询问继续/收摊） */
  const STALL_BATCH = 3;
  /** 摆摊：本批累计刷新上限 */
  let stallBatchEnd = $state(STALL_BATCH);

  interface Customer {
    id: number;
    type: { name: string; emoji: string; patience: number; tip: number };
    recipeId: string;
    side: string | null;
    drink: string | null;
    patience: number;
    maxPatience: number;
    state: "waiting" | "served" | "left";
    assembly: string[];
    assemblySide: string | null;
    assemblyDrink: string | null;
    num: string;
  }

  let customers = $state<Customer[]>([]);
  let activeId = $state<number | null>(null);
  let custSeq = 0;
  let spawned = $state(0);
  let served = $state(0);
  let lives = $state(lives0);
  let combo = $state(0);
  let maxCombo = $state(0);
  let score = $state(0);
  let finished = $state(false);
  let shake = $state(false);
  let lastSpawn = 0;
  /** v1.3b2 出餐打包动画：残影层（成功出餐时把当前叠好的主品「飞」出去） */
  let packFly = $state<string[]>([]);

  /** v1.3b2：开局决定本局顾客数 —— 普通日 4-6 人；20% 概率加班日 8-10 人（结算时 +50% 工资）。
   *  摆摊模式无上限（按批刷新，服务完询问继续/收摊）。 */
  function rollCustomerCount(): void {
    if (stallMode) return;
    const r = Math.random();
    if (r < 0.2) {
      overtime = true;
      totalCustomers = 8 + Math.floor(Math.random() * 3); // 8 / 9 / 10
      onOvertime?.(true);
    } else {
      totalCustomers = 4 + Math.floor(Math.random() * 3); // 4 / 5 / 6
    }
  }

  function getActive(): Customer | undefined {
    return customers.find((c) => c.id === activeId);
  }

  function recipeOf(id: string) {
    return cfg.recipes.find((r) => r.id === id)!;
  }
  /** 用稳定的 CSS 食物组件替代系统 emoji，避免不同平台字体导致画面失真。 */
  function ingredientVisual(id: string): string {
    if (id.includes("bun")) return id.includes("bottom") ? "food-bun bottom" : "food-bun top";
    if (id.includes("patty") || id.includes("meat")) return "food-patty";
    if (id.includes("cheese")) return "food-cheese";
    if (id.includes("lettuce") || id.includes("cabbage")) return "food-leaf";
    if (id.includes("tomato")) return "food-tomato";
    if (id.includes("espresso") || id.includes("coffee")) return "food-coffee";
    if (id.includes("milk") || id.includes("cream")) return "food-milk";
    if (id.includes("ice")) return "food-ice";
    if (id.includes("hot_water") || id.includes("water")) return "food-water";
    if (id.includes("foam")) return "food-foam";
    if (id.includes("caramel") || id.includes("honey")) return "food-caramel";
    if (id.includes("choco")) return "food-choco";
    if (id.includes("tea")) return "food-tea";
    if (id.includes("fries") || id.includes("chips")) return "food-fries";
    if (id.includes("juice") || id.includes("orange")) return "food-juice";
    if (id.includes("soda") || id.includes("cola") || id.includes("sprite") || id.includes("carbonated") || id.includes("soft_drink") || id.includes("sparkling") || id.includes("fizzy")) return "food-soda";
    if (id.includes("wine")) return "food-wine";
    if (id.includes("cup")) return "food-cup";
    if (id.includes("plate")) return "food-plate";
    if (id.includes("skewer")) return "food-skewer";
    if (id.includes("corn")) return "food-corn";
    if (id.includes("bread") || id.includes("toast")) return "food-toast";
    if (id.includes("bacon")) return "food-bacon";
    if (id.includes("egg")) return "food-egg";
    if (id.includes("nugget")) return "food-nugget";
    if (id.includes("ring")) return "food-rings";
    if (id.includes("croissant")) return "food-croissant";
    if (id.includes("cake")) return "food-cake";
    if (id.includes("cookie")) return "food-cookie";
    if (id.includes("sausage")) return "food-sausage";
    return "food-generic";
  }

  function mainVisual(): string {
    if (cfg.mode === "burger") return "food-burger";
    if (cfg.mode === "cup") return "food-cup";
    return "food-plate";
  }

  function customerInitial(name: string): string {
    return name.slice(0, 1);
  }

  /**
   * v1.3b2 修复：同 group 的配菜/饮料互相满足。
   * 原实现是 id 精确比对，顾客点 cola 而柜台只有 sprite 时永远无法满足；
   * 数据层已把同类碳酸合并并标注 group，这里做双保险。
   */
  function sameGroup(want: string | null, got: string | null, pool?: { id: string; group?: string }[]): boolean {
    if (want === got) return true;
    if (!want || !got || !pool) return false;
    const a = pool.find((x) => x.id === want);
    const b = pool.find((x) => x.id === got);
    return !!(a?.group && b?.group && a.group === b.group);
  }

  function spawnCustomer(): void {
    // 摆摊：受顾客数上限约束；非摆摊：受本局顾客总数约束
    if (stallMode) {
      if (stallCap > 0 && spawned >= stallCap) return;
    } else if (spawned >= totalCustomers) return;
    const waiting = customers.filter((c) => c.state === "waiting").length;
    if (waiting >= maxWaiting) return;
    const type = cfg.customerTypes[Math.floor(Math.random() * cfg.customerTypes.length)];
    const recipe = cfg.recipes[Math.floor(Math.random() * cfg.recipes.length)];
    let side: string | null = null;
    let drink: string | null = null;
    if (cfg.sides && Math.random() < 0.5) side = cfg.sides[Math.floor(Math.random() * cfg.sides.length)].id;
    if (cfg.drinks && Math.random() < 0.4) drink = cfg.drinks[Math.floor(Math.random() * cfg.drinks.length)].id;
    const c: Customer = {
      id: ++custSeq,
      type,
      recipeId: recipe.id,
      side,
      drink,
      patience: type.patience,
      maxPatience: type.patience,
      state: "waiting",
      assembly: [],
      assemblySide: null,
      assemblyDrink: null,
      num: String(spawned + 1).padStart(3, "0"),
    };
    customers = [...customers, c];
    spawned++;
    if (activeId == null) activeId = c.id;
  }

  function selectCustomer(id: number): void {
    const c = customers.find((x) => x.id === id);
    if (!c || c.state !== "waiting") return;
    activeId = id;
    playSound("game");
  }

  function addIngredient(id: string): void {
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assembly: [...x.assembly, id] } : x));
    playSound("game");
  }

  function toggleSide(id: string): void {
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assemblySide: x.assemblySide === id ? null : id } : x));
    playSound("game");
  }

  function toggleDrink(id: string): void {
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assemblyDrink: x.assemblyDrink === id ? null : id } : x));
    playSound("game");
  }

  function clearAssembly(): void {
    const c = getActive();
    if (!c) return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assembly: [], assemblySide: null, assemblyDrink: null } : x));
    playSound("game");
  }

  function serveOrder(): void {
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    const recipe = recipeOf(c.recipeId);
    const burgerOk = JSON.stringify(c.assembly) === JSON.stringify(recipe.recipe);
    const sideOk = sameGroup(c.side, c.assemblySide, cfg.sides);
    const drinkOk = sameGroup(c.drink, c.assemblyDrink, cfg.drinks);
    if (!burgerOk || !sideOk || !drinkOk) {
      combo = 0;
      playSound("error");
      shake = true;
      setTimeout(() => (shake = false), 400);
      return;
    }
    const base =
      recipe.price +
      (c.side && cfg.sides ? cfg.sides.find((s) => s.id === c.side)!.price : 0) +
      (c.drink && cfg.drinks ? cfg.drinks.find((d) => d.id === c.drink)!.price : 0);
    const patiencePct = c.patience / c.maxPatience;
    const tip = Math.round(base * 0.3 * patiencePct * c.type.tip);
    // v1.3b2：先抓一份叠好的层做打包飞出动画（顾客切换后原栈会立即清空）
    packFly = [...c.assembly];
    setTimeout(() => (packFly = []), 400);
    const comboMult = 1 + combo * 0.2;
    const earned = Math.round((base + tip) * comboMult);
    score += earned;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    served++;
    // v1.3b2 摆摊：每服务一人按份计钱（多劳多得）+ 扣体力 + 经过时间
    if (stallMode) {
      stallServed++;
      stallIncome += stallPay;
      stallStaminaLeft = Math.max(0, stallStaminaLeft - stallCost);
      stallClock += stallHours;
      // v1.3b3 达顾客数上限 → 食材用完了，强制收摊
      if (stallCap > 0 && stallServed >= stallCap) {
        stallForcedReason = "食材用完了";
        finishGame();
        return;
      }
    }
    customers = customers.map((x) => (x.id === c.id ? { ...x, state: "served" } : x));
    playSound("success");
    activeId = null;
    const next = customers.find((x) => x.state === "waiting");
    if (next) activeId = next.id;
    checkEnd();
  }

  function customerLeaves(c: Customer): void {
    customers = customers.map((x) => (x.id === c.id ? { ...x, state: "left" } : x));
    lives--;
    combo = 0;
    if (activeId === c.id) {
      activeId = null;
      const next = customers.find((x) => x.state === "waiting");
      if (next) activeId = next.id;
    }
    checkEnd();
  }

  function checkEnd(): void {
    if (finished) return;
    if (lives <= 0) return finishGame();
    // v1.3b2 摆摊：服务完一批 → 询问继续/收摊；体力不支或太晚强制收摊
    if (stallMode) {
      if (stallStaminaLeft <= 0) {
        stallForcedReason = "体力不支";
        return finishGame();
      }
      if (stallClock >= STALL_LATEST_HOUR) {
        stallForcedReason = "时间太晚";
        return finishGame();
      }
      const waiting = customers.filter((c) => c.state === "waiting").length;
      if (spawned >= stallBatchEnd && waiting === 0) {
        stallAsking = true;
      }
      return;
    }
    if (spawned >= totalCustomers && customers.filter((c) => c.state === "waiting").length === 0) {
      finishGame();
    }
  }

  /** v1.3b2 摆摊：继续下一批（再次校验体力/时间，不足则直接收摊） */
  function stallContinue(): void {
    if (finished) return;
    if (stallStaminaLeft <= 0) {
      stallForcedReason = "体力不支";
      finishGame();
      return;
    }
    if (stallClock >= STALL_LATEST_HOUR) {
      stallForcedReason = "时间太晚";
      finishGame();
      return;
    }
    stallAsking = false;
    stallBatchEnd += STALL_BATCH;
  }

  /** v1.3b2 摆摊：收摊结束 */
  function stallPackUp(): void {
    if (finished) return;
    finishGame();
  }

  function finishGame(): void {
    if (finished) return;
    finished = true;
    if (stallMode) {
      // 摆摊：上报实际服务人数（结算层按人头给钱）；比例按 8 人基准折算评级
      onStallResult?.(stallServed);
      onFinish(Math.min(1, stallServed / 8));
      return;
    }
    /**
     * v1.3b2 评分口径：分母取「本局实际上门顾客数」（普通 4-6 / 加班 8-10）。
     * 服务完所有顾客即下班，无全局计时。
     */
    const denom = Math.max(1, Math.min(totalCustomers, spawned));
    onFinish(Math.min(1, served / denom));
  }

  onMount(() => {
    rollCustomerCount();
    lastSpawn = performance.now() - spawnMs + 1200;
    const timer = setInterval(() => {
      if (finished) return;
      const now = performance.now();
      const spawnCap = stallMode ? (stallCap > 0 ? Math.min(stallBatchEnd, stallCap) : stallBatchEnd) : totalCustomers;
      if (now - lastSpawn > spawnMs && spawned < spawnCap && !stallAsking) {
        const waiting = customers.filter((c) => c.state === "waiting").length;
        if (waiting < maxWaiting) {
          spawnCustomer();
          lastSpawn = now;
        }
      }
      let leftAny = false;
      customers = customers.map((c) => {
        if (c.state === "waiting") {
          const p = c.patience - 0.1;
          if (p <= 0) {
            leftAny = true;
            return { ...c, patience: 0, state: "left" as const };
          }
          return { ...c, patience: p };
        }
        return c;
      });
      if (leftAny) {
        const left = customers.filter((c) => c.state === "left" && c.patience <= 0);
        left.forEach((c) => customerLeaves(c));
      }
    }, 100);
    return () => clearInterval(timer);
  });
</script>

<div class="rg" class:shake={shake}>
  <div class="rg-top">
    {#if stallMode}
      <span class="rg-stat rg-stall-inc">💰 今日 {stallIncome}</span>
      <span class="rg-stat">🍢 {stallServed}{#if stallCap > 0}/{stallCap}{/if} 客</span>
      <span class="rg-stat">🔋 {stallStaminaLeft}</span>
      <span class="rg-stat" class:urgent={stallClock >= STALL_LATEST_HOUR - 1}>🕐 {Math.floor(stallClock)}:{(stallClock % 1) * 60 < 10 ? "0" : ""}{Math.round((stallClock % 1) * 60)}</span>
    {:else}
      {#if overtime}
        <span class="rg-stat rg-ot">🚨 加班日 +50%</span>
      {/if}
      <span class="rg-stat">💰 {score}</span>
      <span class="rg-stat">🔥 x{combo > 0 ? (1 + combo * 0.2).toFixed(1) : 1}</span>
      <span class="rg-stat">🍽️ {served}/{totalCustomers}</span>
    {/if}
    <span class="rg-lives">
      {#each Array(lives0) as _, i}
        <span class:lost={i >= lives}>❤️</span>
      {/each}
    </span>
  </div>

  <!-- v1.3b2 摆摊：服务完一批 → 询问继续/收摊 -->
  {#if stallAsking}
    <div class="rg-stall-ask">
      <div class="rg-stall-ask-title">已服务 {stallServed} 位顾客，赚了 ¥{stallIncome}</div>
      <div class="rg-stall-ask-sub dim">
        {#if stallStaminaLeft <= stallCost * 2}
          ⚠️ 体力快撑不住了
        {:else if stallClock >= STALL_LATEST_HOUR - 2}
          ⚠️ 时间不早了
        {:else}
          再撑一批，还能多赚点
        {/if}
      </div>
      <div class="rg-stall-ask-btns">
        <button class="rg-ing-btn action" onclick={stallContinue}>🔥 继续摆摊</button>
        <button class="rg-ing-btn trash" onclick={stallPackUp}>🧺 收摊回家</button>
      </div>
    </div>
  {/if}

  {#if stallForcedReason}
    <div class="rg-stall-ask">
      <div class="rg-stall-ask-title">🥱 {stallForcedReason}，收摊了</div>
      <div class="rg-stall-ask-sub dim">共服务 {stallServed} 位顾客，赚了 ¥{stallIncome}</div>
    </div>
  {/if}

  <div class="rg-main">
    <!-- 顾客队列 -->
    <div class="rg-queue">
      {#each customers.filter((c) => c.state !== "served") as c (c.id)}
        <button
          class="rg-cust"
          class:active={c.id === activeId}
          class:left={c.state === "left"}
          disabled={c.state !== "waiting"}
          onclick={() => selectCustomer(c.id)}
        >
          <div class="rg-cust-top">
            <span class="rg-avatar">{customerInitial(c.type.name)}</span>
            <span class="rg-cust-name">{c.type.name}#{c.num}</span>
          </div>
          <div class="rg-patience">
            <div
              class="rg-patience-fill"
              style="width:{Math.max(0, (c.patience / c.maxPatience) * 100)}%;background:{c.patience / c.maxPatience > 0.5 ? 'var(--ok,#7bd88f)' : c.patience / c.maxPatience > 0.25 ? 'var(--accent,#ffd166)' : '#ff8a7a'}"
            ></div>
          </div>
        </button>
      {/each}
      {#if customers.filter((c) => c.state === "waiting").length === 0 && spawned < totalCustomers}
        <div class="rg-waiting dim">等待顾客上门…</div>
      {/if}
    </div>

    <!-- 操作台 -->
    <div class="rg-assembly">
      <div class="rg-assembly-label">操作台</div>
      {#if getActive()}
        {@const c = getActive()!}
        <div class="rg-stack" class:ready={c.assembly.length === recipeOf(c.recipeId).recipe.length}>
          {#each c.assembly as id, i (i)}
            <div class="rg-layer"><span class="rg-food {ingredientVisual(id)}"></span></div>
          {/each}
          {#if c.assembly.length === 0}
            <div class="rg-stack-hint dim">点击食材按顺序堆叠</div>
          {/if}
        </div>
        {#if packFly.length}
          <div class="rg-pack" aria-hidden="true">
            {#each packFly as id, i (i)}
              <div class="rg-layer"><span class="rg-food {ingredientVisual(id)}"></span></div>
            {/each}
          </div>
        {/if}
        <div class="rg-slots">
          <div class="rg-slot" class:filled={!!c.assemblySide}>
            <span class="rg-food {c.assemblySide ? ingredientVisual(c.assemblySide) : 'food-fries'}"></span>
            <span class="rg-slot-label">配菜</span>
          </div>
          <div class="rg-slot" class:filled={!!c.assemblyDrink}>
            <span class="rg-food {c.assemblyDrink ? ingredientVisual(c.assemblyDrink) : 'food-cup'}"></span>
            <span class="rg-slot-label">饮料</span>
          </div>
        </div>
      {:else}
        <div class="rg-empty dim">👆 点击左侧顾客接单</div>
      {/if}
    </div>

    <!-- 订单小票 -->
    <div class="rg-ticket">
      {#if getActive()}
        {@const c = getActive()!}
        {@const r = recipeOf(c.recipeId)}
        <div class="rg-ticket-title"><span class="ticket-stamp">ORDER</span> 订单 #{c.num}</div>
        <div class="rg-ticket-body">
          <div class="rg-ticket-item"><span class="rg-ti-ic"><span class="rg-food {mainVisual()}"></span></span><b>{r.name}</b> <span class="dim">¥{r.price}</span></div>
          {#if c.side && cfg.sides}
            {@const sx = cfg.sides.find((s) => s.id === c.side)}
            <div class="rg-ticket-item" class:ok={c.assemblySide === c.side}>
              <span class="rg-ti-ic"><span class="rg-food {ingredientVisual(sx?.id ?? '')}"></span></span>{sx?.name} <span class="dim">¥{sx?.price}</span>
              {#if c.assemblySide === c.side}<span class="rg-ti-chk">✓ 已配</span>{/if}
            </div>
          {/if}
          {#if c.drink && cfg.drinks}
            {@const dx = cfg.drinks.find((d) => d.id === c.drink)}
            <div class="rg-ticket-item" class:ok={c.assemblyDrink === c.drink}>
              <span class="rg-ti-ic"><span class="rg-food {ingredientVisual(dx?.id ?? '')}"></span></span>{dx?.name} <span class="dim">¥{dx?.price}</span>
              {#if c.assemblyDrink === c.drink}<span class="rg-ti-chk">✓ 已配</span>{/if}
            </div>
          {/if}
        </div>
        <div class="rg-recipe-title">配方顺序（按 1→{r.recipe.length} 依次点）</div>
        <div class="rg-recipe-list">
          {#each r.recipe as id, i}
            {@const done = i < c.assembly.length && c.assembly[i] === id}
            {@const wrong = i < c.assembly.length && c.assembly[i] !== id}
            {@const current = i === c.assembly.length}
            <div class="rg-recipe-row" class:done class:wrong class:current>
              <span class="rg-idx">{i + 1}</span>
              <span class="rg-recipe-mark"><span class="rg-food {ingredientVisual(id)}"></span></span>
              <span>{cfg.ingredients.find((x) => x.id === id)?.name}</span>
              {#if done}<span class="rg-chk">✓</span>{/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="rg-no-ticket dim">选择一位顾客<br />查看订单</div>
      {/if}
    </div>
  </div>

  <!-- 食材栏 -->
  <div class="rg-ing">
    <div class="rg-ing-cat">
      <div class="rg-ing-label">主品原料</div>
      <div class="rg-ing-row">
        {#each cfg.ingredients as ing}
          <button class="rg-ing-btn" onclick={() => addIngredient(ing.id)}>
            <span class="rg-ing-icon"><span class="rg-food {ingredientVisual(ing.id)}"></span></span>
            <span class="rg-ing-name">{ing.name}</span>
          </button>
        {/each}
      </div>
    </div>
    <div class="rg-ing-cat">
      <div class="rg-ing-label">配菜 & 饮料</div>
      <div class="rg-ing-row">
        <!-- v1.3b2 修复：加选中态高亮。原先无任何选中反馈，遇到同图标饮料（可乐/雪碧都是🥤）玩家
             完全分不清点中了哪一个，导致「怎么点都出餐失败」 -->
        {#each cfg.sides ?? [] as s}
          <button
            class="rg-ing-btn"
            class:picked={getActive()?.assemblySide === s.id}
            class:need={getActive()?.side === s.id && getActive()?.assemblySide !== s.id}
            onclick={() => toggleSide(s.id)}
          >
            <span class="rg-ing-icon"><span class="rg-food {ingredientVisual(s.id)}"></span></span>
            <span class="rg-ing-name">{s.name}</span>
          </button>
        {/each}
        {#each cfg.drinks ?? [] as d}
          <button
            class="rg-ing-btn"
            class:picked={getActive()?.assemblyDrink === d.id}
            class:need={getActive()?.drink === d.id && getActive()?.assemblyDrink !== d.id}
            onclick={() => toggleDrink(d.id)}
          >
            <span class="rg-ing-icon"><span class="rg-food {ingredientVisual(d.id)}"></span></span>
            <span class="rg-ing-name">{d.name}</span>
          </button>
        {/each}
        <button class="rg-ing-btn trash" onclick={clearAssembly}>
          <span class="rg-ing-icon"><span class="tool-icon clear-icon"></span></span>
          <span class="rg-ing-name">清空</span>
        </button>
        <button class="rg-ing-btn action" onclick={serveOrder}>
          <span class="rg-ing-icon"><span class="tool-icon serve-icon"></span></span>
          <span class="rg-ing-name">出餐</span>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .rg {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rg.shake {
    animation: rgshake 0.4s ease;
  }
  @keyframes rgshake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  .rg-top {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 800;
    flex-wrap: wrap;
  }
  .rg-stat {
    color: var(--text-main);
  }
  .rg-time {
    color: var(--accent, #ffd166);
  }
  .rg-time.urgent {
    color: #ef5350;
    animation: rgpulse 0.7s ease-in-out infinite;
  }
  /* v1.3b2 加班日徽标：红色脉冲提示额外 +50% 工资 */
  .rg-ot {
    color: #fff;
    background: linear-gradient(135deg, #ef5350, #d32f2f);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 12px;
    animation: rgpulse 1s ease-in-out infinite;
  }
  @keyframes rgpulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .rg-lives {
    margin-left: auto;
    letter-spacing: 1px;
  }
  .rg-lives .lost {
    opacity: 0.25;
  }
  /* v1.3b2 摆摊：收入 / 体力 / 时刻状态 */
  .rg-stall-inc {
    color: var(--ok, #7bd88f);
  }
  .rg-stat.urgent {
    color: #ef5350;
    animation: rgpulse 0.7s ease-in-out infinite;
  }
  /* v1.3b2 摆摊：批次结束询问层 */
  .rg-stall-ask {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 209, 102, 0.12), rgba(255, 122, 61, 0.08));
    border: 1px solid rgba(255, 209, 102, 0.35);
    animation: rgpulse-in 0.25s ease;
  }
  .rg-stall-ask-title {
    font-size: 15px;
    font-weight: 800;
  }
  .rg-stall-ask-sub {
    font-size: 12px;
  }
  .rg-stall-ask-btns {
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  @keyframes rgpulse-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: none; }
  }
  .rg-main {
    display: grid;
    grid-template-columns: 110px 1fr 160px;
    gap: 8px;
    min-height: 220px;
  }
  .rg-queue {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    max-height: 240px;
  }
  .rg-cust {
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 6px 8px;
    cursor: pointer;
    text-align: left;
    color: var(--text-main);
  }
  .rg-cust.active {
    border-color: var(--accent, #ffd166);
    box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.3);
  }
  .rg-cust.left {
    opacity: 0.35;
    pointer-events: none;
  }
  .rg-cust-top {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
  }
  .rg-avatar {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #f6f8ff;
    background: linear-gradient(145deg, #4c77aa, #283a61);
    border: 1px solid rgba(255, 255, 255, 0.22);
    font-size: 0.9rem;
    font-weight: 900;
    letter-spacing: 0;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.24);
  }
  .rg-cust-name {
    font-size: 0.65rem;
    color: var(--text-dim, #9aa3c7);
    font-weight: 700;
  }
  .rg-patience {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  .rg-patience-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.1s linear;
  }
  .rg-assembly {
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px;
    position: relative;
    min-height: 0;
  }
  .rg-assembly-label {
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 0.6rem;
    color: var(--text-dim, #9aa3c7);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .rg-stack {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 1px;
    min-height: 80px;
    justify-content: flex-start;
    transition: filter 0.2s ease;
  }
  /* v1.3b2：主品层数凑齐时整栈发光，提示可以出餐 */
  .rg-stack.ready {
    filter: drop-shadow(0 0 7px var(--accent, #ffd166));
  }
  .rg-layer {
    width: min(180px, 72%);
    height: 24px;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
    transform-origin: center bottom;
    animation: rgdrop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  /* 层间水平微错位，视觉上有「叠起来」的厚度 */
  .rg-stack .rg-layer:nth-child(3n + 1) {
    margin-left: -3px;
  }
  .rg-stack .rg-layer:nth-child(3n + 2) {
    margin-left: 3px;
  }
  /* v1.3b2 各层落下：从上方掉进来 → 压扁 → 回弹站稳 */
  @keyframes rgdrop {
    0% { transform: translateY(-42px) scaleY(0.55) scaleX(1.14); opacity: 0; }
    58% { transform: translateY(0) scaleY(0.8) scaleX(1.1); opacity: 1; }
    100% { transform: none; opacity: 1; }
  }
  /* v1.3b2 出餐打包：整栈飞向右上方（残影层，不阻塞下一位顾客） */
  .rg-pack {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    justify-content: center;
    gap: 1px;
    pointer-events: none;
    animation: rgpack 0.4s cubic-bezier(0.4, 0, 0.7, 1) forwards;
  }
  .rg-pack .rg-layer {
    animation: none;
    margin-left: 0;
  }
  @keyframes rgpack {
    0% { transform: none; opacity: 1; }
    100% { transform: translate(72px, -64px) scale(0.38) rotate(14deg); opacity: 0; }
  }
  .rg-stack-hint {
    font-size: 0.7rem;
  }
  .rg-slots {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }
  .rg-slot {
    width: 52px;
    height: 52px;
    border: 2px dashed rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    position: relative;
    background: rgba(0, 0, 0, 0.15);
  }
  .rg-slot.filled {
    border-style: solid;
    border-color: var(--ok, #7bd88f);
  }
  .rg-slot-label {
    font-size: 0.55rem;
    color: var(--text-dim, #9aa3c7);
  }
  .rg-empty {
    font-size: 0.9rem;
    text-align: center;
  }
  .rg-ticket {
    background: linear-gradient(180deg, #f5f0e0, #e8e0c8);
    color: #2a1c12;
    border-radius: 6px 6px 8px 8px;
    padding: 8px;
    font-size: 0.72rem;
    align-self: flex-start;
    max-height: 240px;
    overflow-y: auto;
    width: 100%;
  }
  .rg-ticket-title {
    text-align: center;
    font-weight: 800;
    margin-bottom: 4px;
  }
  .rg-ticket-body {
    border-bottom: 1px dashed #b8a888;
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .rg-ticket-item {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: space-between;
    padding: 2px 0;
  }
  /* v1.3b3 订单附属小吃/饮料带图标 + 已配勾选，清楚展示本单需求（T6） */
  .rg-ti-ic {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
  }
  .rg-ticket-item.ok {
    background: rgba(6, 214, 160, 0.16);
    border-radius: 4px;
    padding: 2px 4px;
    font-weight: 700;
  }
  .rg-ti-chk {
    margin-left: auto;
    color: var(--ok, #2a7a5c);
    font-weight: 800;
    font-size: 0.62rem;
  }
  .rg-recipe-title {
    font-size: 0.6rem;
    color: #6b5d4f;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .rg-recipe-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rg-recipe-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.7rem;
  }
  .rg-recipe-row.done {
    background: rgba(6, 214, 160, 0.18);
    color: #2a7a5c;
  }
  .rg-recipe-row.wrong {
    background: rgba(230, 57, 70, 0.18);
  }
  .rg-recipe-row.current {
    background: rgba(255, 140, 66, 0.2);
    font-weight: 800;
  }
  .rg-idx {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #d0c8a8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.55rem;
    font-weight: 800;
    color: #6b5d4f;
  }
  .rg-recipe-row.done .rg-idx {
    background: var(--ok, #7bd88f);
    color: #fff;
  }
  .rg-recipe-row.current .rg-idx {
    background: var(--accent, #ffd166);
    color: #fff;
  }
  .rg-no-ticket {
    text-align: center;
    padding: 30px 6px;
    color: #6b5d4f;
  }
  .rg-waiting {
    padding: 14px 6px;
    font-size: 0.7rem;
    text-align: center;
  }
  .rg-ing {
    background: rgba(0, 0, 0, 0.25);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding: 8px;
    border-radius: 0 0 10px 10px;
  }
  .rg-ing-cat {
    margin-bottom: 6px;
  }
  .rg-ing-label {
    font-size: 0.6rem;
    color: var(--text-dim, #9aa3c7);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .rg-ing-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .rg-ing-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 5px 8px;
    min-width: 48px;
    color: var(--text-main);
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 700;
  }
  /* v1.3b2：配菜/饮料已选中态 —— 明确告诉玩家「你点的是这一个」 */
  .rg-ing-btn.picked {
    border-color: var(--ok, #7bd88f);
    background: rgba(123, 216, 143, 0.22);
    box-shadow: 0 0 0 2px rgba(123, 216, 143, 0.35) inset;
  }
  /* v1.3b3：当前订单正需要的配菜/饮料 —— 脉冲高亮，避免玩家看不懂要点什么（T6） */
  .rg-ing-btn.need {
    border-color: var(--accent, #ffd166);
    background: rgba(255, 209, 102, 0.18);
    animation: rgneed 0.9s ease-in-out infinite;
  }
  @keyframes rgneed {
    0%, 100% { box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.25) inset; }
    50% { box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.6) inset; }
  }
  .rg-ing-btn.action {
    background: linear-gradient(135deg, var(--accent, #ffd166), #e07020);
    border-color: transparent;
    color: #1a120a;
  }
  .rg-ing-btn.trash {
    background: rgba(255, 138, 122, 0.15);
  }
  .rg-ing-icon {
    height: 30px;
    display: grid;
    place-items: center;
  }
  .rg-ing-name {
    color: var(--text-dim, #9aa3c7);
  }
  .rg-recipe-mark {
    width: 22px;
    height: 18px;
    display: grid;
    place-items: center;
  }
  .ticket-stamp {
    color: #b26e3d;
    font-size: 0.55rem;
    letter-spacing: 0.16em;
    border: 1px solid #bca98d;
    padding: 2px 4px;
    border-radius: 3px;
  }
  /* CSS food kit：用几何形状表达食材，避免 emoji 字体差异和“表情堆叠”。 */
  .rg-food {
    position: relative;
    display: block;
    width: 30px;
    height: 18px;
    border-radius: 5px;
    box-sizing: border-box;
  }
  .food-burger { width: 34px; height: 20px; border-radius: 50% 50% 5px 5px; background: linear-gradient(#e9a456 0 45%, #bb6c2f 46% 62%, #e9d28a 63% 78%, #5c9b55 79%); box-shadow: 0 3px 0 #7a421f; }
  .food-bun.top, .food-bun { background: linear-gradient(180deg, #f4c278, #b96a2e); border-radius: 14px 14px 4px 4px; box-shadow: inset 0 -3px rgba(111, 55, 25, 0.18); }
  .food-bun.bottom { border-radius: 4px 4px 10px 10px; height: 15px; }
  .food-patty { background: linear-gradient(180deg, #70432f, #3e241e); border-radius: 7px; height: 14px; box-shadow: inset 0 2px rgba(255,255,255,.08); }
  .food-cheese { height: 9px; background: #f3c84b; clip-path: polygon(0 0,100% 0,92% 100%,75% 55%,55% 100%,34% 55%,12% 100%); }
  .food-leaf { height: 8px; background: #5ea45b; border-radius: 60% 40% 55% 45%; }
  .food-tomato { height: 9px; background: #d96851; border-radius: 8px; }
  .food-fries { width: 22px; height: 22px; background: repeating-linear-gradient(90deg, #f2c14d 0 4px, #d88c31 4px 6px); clip-path: polygon(8% 0,92% 0,82% 100%,18% 100%); }
  .food-cup { width: 21px; height: 24px; background: linear-gradient(90deg, #f1f4fa 0 18%, #73a9cf 19% 82%, #f1f4fa 83%); clip-path: polygon(10% 0,90% 0,78% 100%,22% 100%); }
  .food-juice { width: 23px; height: 23px; background: linear-gradient(#f5a447 0 20%, #e6783d 21%); border-radius: 4px 4px 8px 8px; }
  .food-soda { width: 22px; height: 24px; background: linear-gradient(90deg, #d7e7ef 0 16%, #5b98c2 17% 84%, #d7e7ef 85%); border-radius: 3px 3px 7px 7px; box-shadow: inset 0 5px #d84d45, 0 -3px 0 -1px #e1edf3; }
  .food-wine { width: 15px; height: 23px; border: 3px solid #b45a70; border-top-width: 8px; border-radius: 3px 3px 8px 8px; }
  .food-coffee { width: 25px; height: 19px; background: #79533b; border: 4px solid #d7b38a; border-radius: 4px 4px 9px 9px; }
  .food-milk { height: 12px; background: #f1e3c5; border-radius: 50%; }
  .food-water { height: 10px; background: #7bc9df; border-radius: 50%; }
  .food-foam { height: 11px; background: radial-gradient(circle at 25% 60%, #fff 0 4px, transparent 5px), #eee5d2; border-radius: 50%; }
  .food-caramel { height: 8px; background: #bd762d; border-radius: 6px; }
  .food-choco { height: 10px; background: #5b3027; border-radius: 5px; }
  .food-tea { height: 13px; background: #aa7540; border: 3px solid #d9b38a; border-radius: 4px 4px 8px 8px; }
  .food-ice { width: 22px; height: 18px; background: linear-gradient(135deg, #b9e6f3, #70b7d0); transform: rotate(7deg); border-radius: 4px; }
  .food-plate { width: 30px; height: 10px; border: 3px solid #d9e0eb; border-radius: 50%; }
  .food-skewer { height: 7px; background: repeating-linear-gradient(90deg, #d27a45 0 7px, #f2be69 7px 12px); border-radius: 8px; }
  .food-corn { width: 22px; height: 18px; background: repeating-linear-gradient(90deg, #f5c24c 0 4px, #d99b2d 4px 6px); border-radius: 50%; }
  .food-toast { background: #d99658; border: 4px solid #f1c07b; border-radius: 7px; }
  .food-bacon { height: 9px; background: repeating-linear-gradient(90deg, #d26b54 0 6px, #f3b27e 6px 9px); border-radius: 5px; }
  .food-egg { height: 16px; background: #f6f0d4; border-radius: 50%; box-shadow: inset 0 -6px #e3ad38; }
  .food-nugget { width: 22px; height: 18px; background: #d79a50; border-radius: 45% 55% 50% 40%; }
  .food-rings { width: 24px; height: 16px; border: 4px dotted #dca85c; border-radius: 50%; }
  .food-croissant { width: 25px; height: 16px; background: repeating-linear-gradient(90deg, #d38a3e 0 5px, #f0bf68 5px 8px); border-radius: 50%; }
  .food-cake { width: 24px; height: 17px; background: linear-gradient(#f6d7d0 0 35%, #c98075 36% 70%, #f1b6ad 71%); border-radius: 3px; }
  .food-cookie { width: 18px; height: 18px; background: #bf7f49; border-radius: 50%; box-shadow: 5px 4px 0 -2px #6d452d, -3px -2px 0 -2px #6d452d; }
  .food-sausage { height: 10px; background: #b95c3f; border-radius: 10px; }
  .food-generic { background: linear-gradient(135deg, #c6a46d, #76533b); }
  .tool-icon { width: 21px; height: 21px; display: block; position: relative; }
  .clear-icon::before { content: ""; position: absolute; inset: 4px 5px 2px; border: 2px solid #ff9b91; border-top: 0; transform: skew(-5deg); }
  .clear-icon::after { content: ""; position: absolute; left: 3px; right: 3px; top: 3px; height: 2px; background: #ff9b91; box-shadow: 5px -3px 0 -0.5px #ff9b91; }
  .serve-icon::before { content: ""; position: absolute; width: 9px; height: 5px; left: 5px; top: 8px; border-left: 3px solid #102319; border-bottom: 3px solid #102319; transform: rotate(-45deg); }
  .rg-ing-btn.action .rg-ing-name {
    color: #1a120a;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
  /* 移动端：单列堆叠 */
  @media (max-width: 480px) {
    .rg-main {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
    }
    .rg-queue {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      max-height: 72px;
    }
    .rg-cust {
      min-width: 110px;
      flex-shrink: 0;
    }
    .rg-ticket {
      order: 3;
    }
  }
</style>
