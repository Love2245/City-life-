<script lang="ts">
  import { miniGameRandom } from "../../../lib/minigameRandom";
  const randomSource = miniGameRandom();
  let randomDraws = 0;
  const random = () => { randomDraws++; return randomSource(); };
  import FoodArt from "./RestaurantIngredient.svelte";
  import FoodWorkbench from "./FoodWorkbench.svelte";
  import PreparedFood from "./PreparedFood.svelte";
  import CulinaryStation from "./CulinaryStation.svelte";
  import CulinaryProduct from "./CulinaryProduct.svelte";
  import { createCraftState, craftKind, primaryCraft, flipCraft, advanceCraft, placeCraft, craftHint, type CraftState } from "../../../lib/restaurantCraft";
  import { restaurantPresentation } from "../../../lib/restaurantPresentation";
  import { onMount, onDestroy, untrack } from "svelte";
  import type { RestaurantCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";
  import { isMobileLayout } from "../../../stores/uiStore.svelte";

  /** 餐饮组装模板（A）：顾客队列 + 按配方顺序组装主品 + 配菜/饮料 + 出餐比对 + 小费连击 + 生命值。
   *  适用于汉堡、杯饮、西餐与夜市：汉堡按层序制作，其余按原料清单制作。
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
    stallStartMinute,
    workSession = false,
    paused = false,
    initialProgress,
    onProgress,
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
    stallStartMinute?: number;
    /** Wage for persisted work sessions is locked before this challenge starts. */
    workSession?: boolean;
    paused?: boolean;
    initialProgress?: unknown;
    onProgress?: (snapshot: unknown) => void;
  } = $props();

  const workMode = $derived(cfg.mode === "cup" ? "cup" : cfg.mode === "burger" ? "burger" : cfg.ingredients.some(i => i.id === "skewer") ? "grill" : "plate");
  const ingredientNames = $derived(Object.fromEntries([...cfg.ingredients, ...(cfg.sides ?? []), ...(cfg.drinks ?? [])].map(i=>[i.id,i.name])));
  const productionKind = $derived(craftKind(cfg));
  type IngredientCategory = "main" | "sides" | "drinks";
  const presentation = $derived(restaurantPresentation(cfg));
  let ingredientCategory = $state<IngredientCategory>("main");
  const ingredientOptions = $derived(
    ingredientCategory === "main" ? cfg.ingredients : ingredientCategory === "sides" ? (cfg.sides ?? []) : (cfg.drinks ?? []),
  );
  const visibleIngredientOptions = $derived(ingredientOptions);
  let notice = $state("");
  const lives0 = $derived(cfg.lives ?? 3);
  const spawnMs = $derived(cfg.spawnMs ?? 4500);
  const maxWaiting = $derived(cfg.maxWaiting ?? 3);
  /** 摆摊模式标记 */
  const stallMode = $derived(cfg.stall === true);
  /** 摆摊：每客收入 / 体力消耗 / 耗时（小时） */
  const stallPay = $derived(cfg.stallPerCustomerPay ?? 0);
  const stallCost = $derived(cfg.stallStaminaCost ?? 1);
  const stallHours = $derived(cfg.stallHourPerCustomer ?? 0.25);
  /** v1.3b3 顾客数上限：达到即「食材用完了」强制收摊（0 = 无上限） */
  const stallCap = $derived(cfg.stallCustomerCap ?? 0);
  const stallClosingMinute = $derived(cfg.stallCloseMinute);
  /** v1.3b2：不再全局计时，本局实际顾客数开局随机（普通 4-6 / 加班 8-10）；摆摊无上限 */
  let totalCustomers = $state(0);
  let overtime = $state(false);
  /** 摆摊：本局累计服务人数 / 累计收入（多劳多得） */
  let stallServed = $state(0);
  let stallIncome = $state(0);
  /** 摆摊：剩余体力预算（开局 = 传入体力，每次服务扣 stallCost） */
  let stallStaminaLeft = $state(0);
  /** 摆摊：当前模拟时刻（开始小时 + 已服务 × 每客耗时） */
  let stallClock = $state(0);
  const stallClockLabel = $derived(`${String(Math.floor(((stallClock % 1440) + 1440) % 1440 / 60)).padStart(2,'0')}:${String(Math.round(stallClock % 60)).padStart(2,'0')}`);
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
    heat: number;
    craft: CraftState;
  }

  let customers = $state<Customer[]>([]);
  let activeId = $state<number | null>(null);
  let custSeq = 0;
  let spawned = $state(0);
  let served = $state(0);
  let lives = $state(0);
  let combo = $state(0);
  let maxCombo = $state(0);
  let score = $state(0);
  let finished = $state(false);
  let shake = $state(false);
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;
  let spawnElapsed = 0;
  let publishElapsed = 0;
  let mounted = $state(false);
  let servedVisual = $state<{ids:string[];title:string;expires:number}|null>(null);
  const configuration = untrack(() => JSON.stringify(cfg));

  function progressSnapshot() {
    return JSON.parse(JSON.stringify({schema:'urban-life-restaurant',version:1,configuration,
      customers,activeId,custSeq,spawned,served,lives,combo,maxCombo,score,totalCustomers,overtime,
      stallServed,stallIncome,stallStaminaLeft,stallClock,stallAsking,stallForcedReason,stallBatchEnd,
      ingredientCategory,notice,spawnElapsed,randomDraws}));
  }
  export async function flushProgress():Promise<void> { if(mounted&&!finished)onProgress?.(progressSnapshot()); }
  function restoreProgress(value:unknown):boolean {
    if(!value||typeof value!=='object')return false;
    const p=value as ReturnType<typeof progressSnapshot>;
    if(p.schema!=='urban-life-restaurant'||p.version!==1||p.configuration!==configuration||!Array.isArray(p.customers)||p.customers.length>500)return false;
    const fields=['custSeq','spawned','served','lives','combo','maxCombo','score','totalCustomers','stallServed','stallIncome','stallStaminaLeft','stallClock','stallBatchEnd','spawnElapsed','randomDraws'];
    if(fields.some(key=>typeof p[key]!=='number'||!Number.isFinite(p[key]))||p.randomDraws<0||p.randomDraws>100000)return false;
    if(p.customers.some((c:Customer)=>!cfg.recipes.some(r=>r.id===c.recipeId)||!Array.isArray(c.assembly)||!c.craft||!Array.isArray(c.craft.placed)||!c.type||!Number.isFinite(c.patience)||!!(c.side&&!cfg.sides?.some(s=>s.id===c.side))||!!(c.drink&&!cfg.drinks?.some(d=>d.id===c.drink))))return false;
    customers=JSON.parse(JSON.stringify(p.customers));activeId=p.activeId;custSeq=p.custSeq;spawned=p.spawned;served=p.served;lives=p.lives;
    combo=p.combo;maxCombo=p.maxCombo;score=p.score;totalCustomers=p.totalCustomers;overtime=!!p.overtime;
    stallServed=p.stallServed;stallIncome=p.stallIncome;stallStaminaLeft=p.stallStaminaLeft;stallClock=p.stallClock;
    stallAsking=!!p.stallAsking;stallForcedReason=p.stallForcedReason??'';stallBatchEnd=p.stallBatchEnd;
    ingredientCategory=['main','sides','drinks'].includes(p.ingredientCategory)?p.ingredientCategory:'main';notice=p.notice??'';spawnElapsed=p.spawnElapsed;
    for(let i=0;i<p.randomDraws;i++)randomSource();randomDraws=p.randomDraws;
    onOvertime?.(overtime);onStallResult?.(stallServed);
    return true;
  }
  /** v1.3b2 出餐打包动画：残影层（成功出餐时把当前叠好的主品「飞」出去） */

  /** v1.3b2：开局决定本局顾客数 —— 普通日 4-6 人；20% 概率加班日 8-10 人（结算时 +50% 工资）。
   *  摆摊模式无上限（按批刷新，服务完询问继续/收摊）。 */
  function rollCustomerCount(): void {
    if (stallMode) return;
    const r = random();
    if (!workSession && r < 0.2) {
      overtime = true;
      totalCustomers = 8 + Math.floor(random() * 3); // 8 / 9 / 10
      onOvertime?.(true);
    } else {
      totalCustomers = 4 + Math.floor(random() * 3); // 4 / 5 / 6
    }
  }

  function getActive(): Customer | undefined {
    return customers.find((c) => c.id === activeId);
  }

  function chooseIngredientCategory(category: IngredientCategory): void {
    if (category === "sides" && !(cfg.sides?.length)) return;
    if (category === "drinks" && !(cfg.drinks?.length)) return;
    ingredientCategory = category;
  }

  function ingredientSelectionCount(id: string): number {
    const customer = getActive();
    if (!customer) return 0;
    if (ingredientCategory === "main") return customer.assembly.filter((item) => item === id).length;
    if (ingredientCategory === "sides") return customer.assemblySide === id ? 1 : 0;
    return customer.assemblyDrink === id ? 1 : 0;
  }

  function selectVisibleIngredient(id: string): void {
    if(paused||finished)return;
    if (ingredientCategory === "main") addIngredient(id);
    else if (ingredientCategory === "sides") toggleSide(id);
    else toggleDrink(id);
  }

  function recipeOf(id: string) {
    return cfg.recipes.find((r) => r.id === id)!;
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
    const type = cfg.customerTypes[Math.floor(random() * cfg.customerTypes.length)];
    const recipe = cfg.recipes[Math.floor(random() * cfg.recipes.length)];
    let side: string | null = null;
    let drink: string | null = null;
    if (cfg.sides && random() < 0.5) side = cfg.sides[Math.floor(random() * cfg.sides.length)].id;
    if (cfg.drinks && random() < 0.4) drink = cfg.drinks[Math.floor(random() * cfg.drinks.length)].id;
    const patience = workMode === "burger" ? type.patience : type.patience * 2.2;
    const c: Customer = {
      id: ++custSeq,
      type,
      recipeId: recipe.id,
      side,
      drink,
      patience,
      maxPatience: patience,
      state: "waiting",
      assembly: [],
      heat: 0,
      craft: createCraftState(),
      assemblySide: null,
      assemblyDrink: null,
      num: String(spawned + 1).padStart(3, "0"),
    };
    customers = [...customers, c];
    spawned++;
    if (activeId == null) activeId = c.id;
  }

  function selectCustomer(id: number): void {
    if(paused||finished)return;
    const c = customers.find((x) => x.id === id);
    if (!c || c.state !== "waiting") return;
    activeId = id;
    playSound("game");
  }

  function addIngredient(id: string): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    if (c.assembly.length >= 10) { notice = "操作台已满，请先清空多余原料"; return; }
    const recipe = recipeOf(c.recipeId).recipe;
    const expected = recipe[c.assembly.length];
    /** 汉堡按由下到上装配：错误层不再进入工作台，避免重复下层面包造成“无限叠层”。 */
    if (workMode === "burger" && !expected) {
      notice = "汉堡主品已装配完，请核对配菜后出餐";
      playSound("error");
      return;
    }
    if (workMode === "burger" && expected && id !== expected) {
      notice = `请先放「${ingredientNames[expected] ?? expected}」`;
      playSound("error");
      return;
    }
    const allowed = recipe.filter((item) => item === id).length;
    const used = c.assembly.filter((item) => item === id).length;
    if (allowed > 0 && used >= allowed) {
      notice = `「${ingredientNames[id] ?? id}」已经放够了`;
      playSound("error");
      return;
    }
    notice = "";
    customers = customers.map((x) => (x.id === c.id ? { ...x, assembly: [...x.assembly, id], heat: 0, craft: {...createCraftState(), sequence:x.craft.sequence+1} } : x));
    playSound("game");
  }

  function toggleSide(id: string): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assemblySide: x.assemblySide === id ? null : id } : x));
    playSound("game");
  }

  function toggleDrink(id: string): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assemblyDrink: x.assemblyDrink === id ? null : id } : x));
    playSound("game");
  }

  function clearAssembly(): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c) return;
    customers = customers.map((x) => (x.id === c.id ? { ...x, assembly: [], assemblySide: null, assemblyDrink: null, heat: 0, craft: {...createCraftState(), sequence:x.craft.sequence+1} } : x));
    playSound("game");
  }

  function mainReady(c: Customer): boolean {
    const wanted = recipeOf(c.recipeId).recipe;
    return JSON.stringify(workMode === "burger" ? c.assembly : [...c.assembly].sort()) === JSON.stringify(workMode === "burger" ? wanted : [...wanted].sort());
  }

  function orderReady(c: Customer): boolean {
    return mainReady(c) && (workMode === "burger" || c.craft.phase === "done") && (workMode !== "grill" || c.heat >= 65 && c.heat <= 90) && sameGroup(c.side,c.assemblySide,cfg.sides) && sameGroup(c.drink,c.assemblyDrink,cfg.drinks);
  }

  function ingredientNeeded(id: string): boolean {
    const c = getActive();
    if (!c) return false;
    const wanted = recipeOf(c.recipeId).recipe;
    return workMode === "burger" ? wanted[c.assembly.length] === id : c.assembly.filter(x=>x===id).length < wanted.filter(x=>x===id).length;
  }

  function undoIngredient(): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    if(c.craft.motionLeft>0)return;
    if (workMode === "plate" && c.craft.placed.length && !c.craft.motionLeft) { c.craft.placed.pop(); c.craft.phase="finish"; notice="已撤回上一道摆盘"; return; }
    customers = customers.map(x => x.id === c.id ? { ...x, assembly: x.assembly.slice(0, -1), heat: 0, craft: {...createCraftState(),sequence:x.craft.sequence+1} } : x);
    notice = workMode === "burger" ? "已撤回上一层" : "已撤回上一项";
  }

  function performCraft(): void {
    const c=getActive(); if(!c||paused||finished||c.state!=="waiting")return;
    if(!mainReady(c)){notice="请先按清单备齐正确原料";return;}
    if(productionKind==="western"&&c.craft.phase==="finish"){placeCraft(c.craft,recipeOf(c.recipeId).recipe);playSound("game");return;}
    notice=primaryCraft(c.craft,productionKind,recipeOf(c.recipeId).recipe,c.heat);playSound(notice?"error":"game");
  }
  function performFlip(): void {
    const c=getActive();if(!c||paused||finished||!mainReady(c))return;
    notice=flipCraft(c.craft,productionKind==="grill"?c.heat:c.craft.progress);playSound(notice?"error":"game");
  }
  function placeFood(x?:number,y?:number): void {const c=getActive();if(!c||paused||finished)return;placeCraft(c.craft,recipeOf(c.recipeId).recipe,x,y);playSound("game");}
  function productStatus(c:Customer):string {
    if(!mainReady(c))return c.assembly.length+" / "+recipeOf(c.recipeId).recipe.length+" 项";
    if(workMode==="burger")return "✓ 已完成";
    if(c.craft.phase==="done")return "✓ 已完成";
    if(workMode==="grill"&&c.heat>90)return "已烤焦";
    return c.craft.phase==="prep"?"原料齐 · 待制作":c.craft.phase==="finish"?"待收尾":c.craft.flipped?"已翻面 · 制作中":"制作中";
  }

  function serveOrder(): void {
    if(paused||finished)return;
    const c = getActive();
    if (!c || c.state !== "waiting") return;
    const recipe = recipeOf(c.recipeId);
    const ordered = workMode === "burger";
    const burgerOk = JSON.stringify(ordered ? c.assembly : [...c.assembly].sort()) === JSON.stringify(ordered ? recipe.recipe : [...recipe.recipe].sort());
    if (workMode === "grill" && burgerOk && c.heat < 65) { notice = "食材还没熟：请等待自动烤制进入金色区域"; return; }
    if (workMode === "grill" && burgerOk && c.heat > 90) { notice = "烤焦了，请清空后重新制作"; return; }
    const sideOk = sameGroup(c.side, c.assemblySide, cfg.sides);
    const drinkOk = sameGroup(c.drink, c.assemblyDrink, cfg.drinks);
    if (!burgerOk || !sideOk || !drinkOk) {
      notice = !burgerOk ? "原料不符，请核对配方；杯饮、摆盘与串料不限加入顺序" : "请配齐订单的小食和饮料";
      combo = 0;
      playSound("error");
      shake = true;
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => (shake = false), 400);
      return;
    }
    if (workMode !== "burger" && c.craft.phase !== "done") {notice="主品工序还未完成："+craftHint(productionKind,c.craft,recipe.recipe,c.heat);playSound("error");return;}
    const base =
      recipe.price +
      (c.side ? cfg.sides?.find((s) => s.id === c.side)?.price ?? 0 : 0) +
      (c.drink ? cfg.drinks?.find((d) => d.id === c.drink)?.price ?? 0 : 0);
    const patiencePct = c.patience / c.maxPatience;
    const tip = Math.round(base * 0.3 * patiencePct * c.type.tip * c.craft.quality);
    // v1.3b2：先抓一份叠好的层做打包飞出动画（顾客切换后原栈会立即清空）
    const comboMult = 1 + combo * 0.2;
    const earned = Math.round((base + tip) * comboMult);
    notice = `出餐成功 +¥${earned}`;
    servedVisual = {ids:[...c.assembly],title:recipe.name,expires:performance.now()+900};
    score += earned;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    served++;
    // v1.3b2 摆摊：每服务一人按份计钱（多劳多得）+ 扣体力 + 经过时间
    if (stallMode) {
      stallServed++;
      onStallResult?.(stallServed);
      stallIncome += stallPay;
      stallStaminaLeft = Math.max(0, stallStaminaLeft - stallCost);
      stallClock += Math.round(stallHours * 60);
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
    c.state = "left";
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
      if (stallClosingMinute !== undefined && stallClock >= stallClosingMinute) {
        stallForcedReason = "场馆已打烊";
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
    if (paused || finished) return;
    if (stallStaminaLeft <= 0) {
      stallForcedReason = "体力不支";
      finishGame();
      return;
    }
    if (stallClosingMinute !== undefined && stallClock >= stallClosingMinute) {
      stallForcedReason = "场馆已打烊";
      finishGame();
      return;
    }
    stallAsking = false;
    stallBatchEnd += STALL_BATCH;
  }

  /** v1.3b2 摆摊：收摊结束 */
  function stallPackUp(): void {
    if (paused || finished) return;
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
     * 评分覆盖整班目标，提前结束时尚未服务的顾客也计入分母。
     */
    const denom = Math.max(1, totalCustomers);
    onFinish(Math.min(1, served / denom));
  }

  onMount(() => {
    if(!restoreProgress(initialProgress)) {
      stallStaminaLeft = stallStamina ?? (stallMode ? 100 : 0);
      stallClock = stallStartMinute ?? (stallHour ?? (stallMode ? 12 : 18)) * 60;
      lives = lives0;
      rollCustomerCount();
      if(stallMode&&stallClosingMinute!==undefined&&stallClock>=stallClosingMinute){stallForcedReason='场馆已打烊';finishGame();}
      else spawnCustomer();
    }
    mounted=true;
    void flushProgress();
    return () => { void flushProgress(); mounted=false; };
  });
  // 抖动计时器补句柄：卸载后回调不再执行（Svelte 5 下虽不抛错，但属悬挂计时器）。
  onDestroy(() => clearTimeout(shakeTimer));
  $effect(() => {
    if(!mounted)return;
    if(paused||finished){if(paused)untrack(()=>{void flushProgress();});return;}
    // 摆摊与移动端一样以 5 Hz 更新顾客耐心。过去桌面摆摊每秒写入
    // 响应式顾客状态 10 次，连带反复刷新整组订单/工作台表达式，低性能
    // WebView 会出现画面闪烁；按实际间隔同比例推进，游戏速度保持不变。
    const updateIntervalMs = stallMode || isMobileLayout() ? 200 : 100;
    const tickScale = updateIntervalMs / 100;
    const timer = setInterval(() => {
      if (paused) return;
      if(servedVisual&&performance.now()>=servedVisual.expires)servedVisual=null;
      if (finished) return;
      // 原料齐全后各单独立烤制；玩家翻面与离火后，火候冻结到打包交付。
      if (workMode === "grill" && !stallAsking) {
        for (const customer of customers) {
          if (customer.state === "waiting" && mainReady(customer) && customer.craft.phase!=="finish" && customer.craft.phase!=="done") {
            customer.craft.phase="cook"; customer.heat = Math.min(100, customer.heat + .9 * tickScale);
          }
        }
      }
      if(workMode!=="burger"&&!stallAsking)for(const customer of customers)if(customer.state==="waiting"&&mainReady(customer))advanceCraft(customer.craft,productionKind,tickScale);
      spawnElapsed += updateIntervalMs;
      const spawnCap = stallMode ? (stallCap > 0 ? Math.min(stallBatchEnd, stallCap) : stallBatchEnd) : totalCustomers;
      if (spawnElapsed > spawnMs && spawned < spawnCap && !stallAsking) {
        const waiting = customers.filter((c) => c.state === "waiting").length;
        if (waiting < maxWaiting) {
          spawnCustomer();
          spawnElapsed = 0;
        }
      }
      const newlyLeft: Customer[] = [];
      // Customer rows and the active workbench are keyed by customer/ingredient identity.
      // Mutating only the changing fields lets Svelte patch the patience bar (and grill
      // heat) without replacing the full customer list and re-evaluating every food SVG.
      for (const customer of customers) {
        if (customer.state !== "waiting") continue;
        customer.patience = Math.max(0, customer.patience - 0.1 * tickScale);
        if (customer.patience === 0) newlyLeft.push(customer);
      }
      newlyLeft.forEach((c) => customerLeaves(c));
      publishElapsed += updateIntervalMs;
      if(publishElapsed>=1000){publishElapsed=0;void flushProgress();}
    }, updateIntervalMs);
    return () => clearInterval(timer);
  });
</script>

<div class="rg restaurant-layout" class:burger-layout={workMode === "burger"} class:grill-layout={workMode === "grill"} class:shake={shake} data-scene={presentation.id} style={`background-image:linear-gradient(#4c260f28,#4c260f38),url('${presentation.background}');--shop-accent:${presentation.accent};--shop-border:${presentation.border};--shop-paper:${presentation.paper};--shop-ink:${presentation.ink};--shop-soft:${presentation.soft};--ingredient-count:${Math.max(4,cfg.ingredients.length)}`}>
  <div class="rg-shop-heading"><span>{presentation.brand}</span><b>{presentation.title}</b><small>{presentation.cue}</small></div>
  <div class="rg-top">
    {#if stallMode}
      <span class="rg-stat rg-stall-inc">💰 今日 {stallIncome}</span>
      <span class="rg-stat">🍢 {stallServed}{#if stallCap > 0}/{stallCap}{/if} 客</span>
      <span class="rg-stat">🔋 {stallStaminaLeft}</span>
      <span class="rg-stat" class:urgent={stallClosingMinute!==undefined&&stallClock >= stallClosingMinute-60}>🕐 {stallClockLabel}</span>
    {:else}
      {#if overtime}
        <span class="rg-stat rg-ot">🚨 加班日</span>
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
        {:else if stallClosingMinute!==undefined&&stallClock >= stallClosingMinute-120}
          ⚠️ 时间不早了
        {:else}
          再撑一批，还能多赚点
        {/if}
      </div>
      <div class="rg-stall-ask-btns">
        <button type="button" class="rg-ing-btn action" onclick={stallContinue}>🔥 继续摆摊</button>
        <button type="button" class="rg-ing-btn trash" onclick={stallPackUp}>🧺 收摊回家</button>
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
      <div class="rg-queue-heading"><b>顾客订单</b><span>点击切换 · 每单单独制作</span></div>
      {#each customers.filter((c) => c.state !== "served") as c (c.id)}
          <button
          type="button"
          class="rg-cust"
          class:active={c.id === activeId}
          class:left={c.state === "left"}
          disabled={c.state !== "waiting" || finished}
          aria-pressed={c.id === activeId}
          data-order-id={c.id}
          onclick={() => selectCustomer(c.id)}
        >
          <div class="rg-cust-top">
            <span class="rg-cust-kind" aria-hidden="true"></span>
            <span class="rg-cust-name">{c.type.name}<small>#{c.num}</small></span>
          </div>
            <div class="rg-order-summary">
              <div class="rg-order-product" class:complete={mainReady(c) && (workMode === 'burger' || c.craft.phase === 'done')}>
                <span class="rg-order-burger">{#if productionKind==='cocktail'}<CulinaryProduct mode="cocktail" ids={recipeOf(c.recipeId).recipe} title={recipeOf(c.recipeId).name} thumbnail/>{:else}<PreparedFood mode={workMode} ids={recipeOf(c.recipeId).recipe} names={ingredientNames} title={recipeOf(c.recipeId).name}/>{/if}</span>
                <b>{recipeOf(c.recipeId).name}</b><small>{productStatus(c)}</small>
              </div>
              <div class="rg-order-product" class:complete={sameGroup(c.side, c.assemblySide, cfg.sides)}>
                <span class="rg-order-icon">{#if c.side}<FoodArt cocktail={productionKind==="cocktail"} legacy={workMode==="burger"} id={c.side} label={ingredientNames[c.side]}/>{:else}<span class="rg-not-ordered">—</span>{/if}</span>
                <b>{c.side ? ingredientNames[c.side] : '无需小吃'}</b><small>{c.side ? sameGroup(c.side, c.assemblySide, cfg.sides) ? '✓ 已配齐' : '待配齐' : '未点单'}</small>
              </div>
              <div class="rg-order-product" class:complete={sameGroup(c.drink, c.assemblyDrink, cfg.drinks)}>
                <span class="rg-order-icon">{#if c.drink}<FoodArt cocktail={productionKind==="cocktail"} legacy={workMode==="burger"} id={c.drink} label={ingredientNames[c.drink]}/>{:else}<span class="rg-not-ordered">—</span>{/if}</span>
                <b>{c.drink ? ingredientNames[c.drink] : '无需饮料'}</b><small>{c.drink ? sameGroup(c.drink, c.assemblyDrink, cfg.drinks) ? '✓ 已配齐' : '待配齐' : '未点单'}</small>
              </div>
            </div>
          <div class="rg-patience">
            <div
              class="rg-patience-fill"
              style="width:{Math.max(0, (c.patience / c.maxPatience) * 100)}%;background:{c.patience / c.maxPatience > 0.5 ? 'var(--ok,#7bd88f)' : c.patience / c.maxPatience > 0.25 ? 'var(--accent,#ffd166)' : '#ff8a7a'}"
            ></div>
          </div>
        </button>
      {/each}
        {#each Array(Math.max(0, maxWaiting - customers.filter(c => c.state !== 'served').length)) as _}
          <div class="rg-order-empty"><span>下一位客人</span><small>{finished ? '本班次已结束' : '等待新的订单'}</small></div>
        {/each}
      {#if customers.filter((c) => c.state === "waiting").length === 0 && spawned < totalCustomers}
        <div class="rg-waiting dim">等待顾客上门…</div>
      {/if}
    </div>

    <!-- 操作台 -->
    <div class="rg-assembly" class:crafted-assembly={workMode!=="burger"}>
      <div class="rg-assembly-label">{productionKind==='cocktail'?'调酒吧台':workMode === "cup" ? "饮品吧台" : workMode === "grill" ? "炭火烤台" : workMode === "plate" ? "摆盘台" : "汉堡备餐台"}</div>
      {#if getActive()}
        {@const c = getActive()!}
        <div class="rg-current-order"><span>正在制作 #{c.num}</span><b>{recipeOf(c.recipeId).name}</b><small>{orderReady(c) ? '已配齐，可以出餐' : workMode === 'burger' ? '按配方逐层放入食材' : workMode === 'grill' ? '放齐原料自动烤制，金色区间出餐' : '完成制作工位，配齐小吃与饮料'}</small></div>
        {#if workMode === "burger"}<FoodWorkbench mode={workMode} ids={c.assembly} names={ingredientNames} title={recipeOf(c.recipeId).name} heat={c.heat}/>
        {:else}<CulinaryStation scene={presentation.id} kind={productionKind} craftState={c.craft} ids={c.assembly} recipe={recipeOf(c.recipeId).recipe} names={ingredientNames} title={recipeOf(c.recipeId).name} heat={c.heat} correct={mainReady(c)} onAction={performCraft} onFlip={performFlip} onPlace={placeFood}/>{/if}
        <div class="rg-slots">
          <div class="rg-slot" class:filled={!!c.assemblySide}>
            {#if c.assemblySide}<FoodArt cocktail={productionKind==="cocktail"} legacy={workMode==="burger"} id={c.assemblySide} label={ingredientNames[c.assemblySide]}/>{:else}<span>＋</span>{/if}
            <span class="rg-slot-label">{c.assemblySide ? ingredientNames[c.assemblySide] : c.side ? `待配 ${ingredientNames[c.side]}` : '无需小吃'}</span>
          </div>
          <div class="rg-slot" class:filled={!!c.assemblyDrink}>
            {#if c.assemblyDrink}<FoodArt cocktail={productionKind==="cocktail"} legacy={workMode==="burger"} id={c.assemblyDrink} label={ingredientNames[c.assemblyDrink]}/>{:else}<span>＋</span>{/if}
            <span class="rg-slot-label">{c.assemblyDrink ? ingredientNames[c.assemblyDrink] : c.drink ? `待配 ${ingredientNames[c.drink]}` : '无需饮料'}</span>
          </div>
        </div>
          <div class="rg-build-recipe" aria-label="当前订单配方">
            <b>{workMode === "burger" ? "从下到上" : "原料清单"}</b>
            {#each recipeOf(c.recipeId).recipe as id, i (id + ':' + i)}
              {@const done = workMode === "burger" ? i < c.assembly.length : c.assembly.filter(x=>x===id).length >= recipeOf(c.recipeId).recipe.slice(0,i+1).filter(x=>x===id).length}
              <span class:done class:next={!done && ingredientNeeded(id)}>{done ? '✓' : i + 1} {ingredientNames[id]}</span>
            {/each}
          </div>
          <button type="button" class="rg-undo" disabled={!c.assembly.length} onclick={undoIngredient}>{workMode === "burger" ? "撤回上一层" : "撤回上一项"}</button>
      {:else}
        <div class="rg-empty dim">👆 点击左侧顾客接单</div>
      {/if}
    </div>


  </div>

  <p class="work-notice" role="status">{notice || (workMode === "burger" ? "选择顾客 → 按顺序组装汉堡 → 配齐小吃与饮料 → 出餐" : workMode === "grill" ? "备齐原料 → 翻面烤制 → 离火刷酱 → 配餐出餐" : "备齐原料，完成制作工位，再配餐出餐")}</p>
  {#if servedVisual&&workMode!=="burger"}<div class="served-flight" aria-hidden="true"><CulinaryProduct mode={productionKind==="cocktail"?"cocktail":workMode} ids={servedVisual.ids} title={servedVisual.title}/><b>✓ 出餐成功</b></div>{/if}
  <!-- 食材栏 -->
  <div class="rg-ing">
    <div class="rg-ing-tabs" role="tablist" aria-label="材料分类">
      <button type="button" role="tab" class="rg-ing-tab" class:active={ingredientCategory === "main"} aria-selected={ingredientCategory === "main"} onclick={() => chooseIngredientCategory("main")}>
        主品原料 <span>{cfg.ingredients.length}</span>
      </button>
      <button type="button" role="tab" class="rg-ing-tab" class:active={ingredientCategory === "sides"} aria-selected={ingredientCategory === "sides"} disabled={!(cfg.sides?.length)} onclick={() => chooseIngredientCategory("sides")}>
        配菜 <span>{cfg.sides?.length ?? 0}</span>
      </button>
      <button type="button" role="tab" class="rg-ing-tab" class:active={ingredientCategory === "drinks"} aria-selected={ingredientCategory === "drinks"} disabled={!(cfg.drinks?.length)} onclick={() => chooseIngredientCategory("drinks")}>
        饮料 <span>{cfg.drinks?.length ?? 0}</span>
      </button>
    </div>
    <div class="rg-ing-list" role="tabpanel" aria-label={ingredientCategory === "main" ? "主品原料" : ingredientCategory === "sides" ? "配菜" : "饮料"}>
      {#each visibleIngredientOptions as item (item.id)}
        {@const selectedCount = ingredientSelectionCount(item.id)}
        <button
          type="button"
          class="rg-ing-btn"
          class:picked={selectedCount > 0}
          class:need={ingredientCategory === "sides" && getActive()?.side === item.id && getActive()?.assemblySide !== item.id || ingredientCategory === "drinks" && getActive()?.drink === item.id && getActive()?.assemblyDrink !== item.id || ingredientCategory === "main" && !!getActive() && ingredientNeeded(item.id)}
          aria-pressed={selectedCount > 0}
          disabled={!getActive() || finished}
          data-item-id={item.id}
          onclick={() => selectVisibleIngredient(item.id)}
        >
          <span class="rg-ing-icon"><FoodArt cocktail={productionKind==="cocktail"} legacy={workMode==="burger"} id={item.id} label={item.name}/></span>
          <span class="rg-ing-name">{item.name}</span>
          {#if selectedCount > 0}<span class="rg-ing-selected">✓{selectedCount > 1 ? ` ${selectedCount}` : ""}</span>{/if}
        </button>
      {/each}
      {#if visibleIngredientOptions.length === 0}<div class="rg-ing-empty">此分类暂无材料</div>{/if}
    </div>
    <div class="rg-ing-controls">
      <button type="button" class="rg-ing-btn trash" disabled={!getActive() || finished} onclick={clearAssembly}>
        <span class="rg-ing-icon"><span class="tool-icon clear-icon"></span></span>
        <span class="rg-ing-name">清空</span>
      </button>
      <button type="button" class="rg-ing-btn action" disabled={!getActive() || finished} onclick={serveOrder}>
        <span class="rg-ing-icon"><span class="tool-icon serve-icon"></span></span>
        <span class="rg-ing-name">出餐</span>
      </button>
    </div>
  </div>
</div>

<style>
  .work-notice{margin:4px 0;color:#ffe5ac;font-size:13px;min-height:20px}
  .rg-slot :global(svg), .rg-slot :global(.food-art){width:38px;height:38px;max-width:100%;max-height:100%;object-fit:contain}
  .rg-ing-icon :global(svg), .rg-ing-icon :global(.food-art){width:36px;height:36px;max-width:100%;max-height:100%;object-fit:contain}

  .rg {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-width: 0;
    contain: layout paint;
  }
  .rg.shake .rg-assembly {
    animation: rgshake 0.24s ease;
    will-change: transform;
  }
  @keyframes rgshake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    50% { transform: translateX(3px); }
    75% { transform: translateX(-2px); }
  }
  /* Avoid translating a large food/ingredient layer on mobile GPU drivers.
     Keep the invalid-order feedback visible without shaking the whole workbench. */
  :global([data-game-mode="mobile"]) .rg.shake .rg-assembly {
    animation: none;
    will-change: auto;
    border-color: #ff8a7a;
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
  /* v1.3b2 加班日徽标：红色脉冲提示额外 +50% 工资 */
  .rg-ot {
    color: #fff;
    background: linear-gradient(135deg, #ef5350, #d32f2f);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 12px;
    box-shadow: 0 0 0 2px rgba(239, 83, 80, 0.18) inset;
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
    box-shadow: 0 0 0 2px rgba(239, 83, 80, 0.16) inset;
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
    grid-template-columns: 120px minmax(0,1fr) 200px;
    gap: 8px;
    /* 保持排队、制作、订单三栏同高；出餐后订单内容会变短，不能因此压缩整个游戏舞台。 */
    min-height: 320px;
    grid-template-rows: minmax(320px, auto);
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
    gap: 6px;
    margin-bottom: 4px;
  }
  /* 顾客卡不再放通用人物立绘：它只会遮挡编号和耐心条，状态点已足够表达队列项。 */
  .rg-cust-kind {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--accent, #ffd166);
    box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.12), 0 0 10px rgba(255, 209, 102, 0.35);
  }
  .rg-cust-name {
    min-width: 0;
    font-size: 0.76rem;
    color: var(--text-main, #eef1ff);
    font-weight: 700;
    white-space: nowrap;
  }
  .rg-cust-name small {
    margin-left: 4px;
    color: var(--text-dim, #9aa3c7);
    font-size: 0.62rem;
    font-variant-numeric: tabular-nums;
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
    background:
      linear-gradient(165deg, rgba(255, 255, 255, 0.09), transparent 38%),
      linear-gradient(145deg, #2b3547 0%, #1e2637 58%, #18202f 100%);
    border: 1px solid rgba(255, 214, 138, 0.22);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Keep the build area anchored while ingredient layers are added/removed. */
    justify-content: flex-start;
    padding: 8px;
    position: relative;
    min-height: 0;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -18px 28px rgba(0, 0, 0, 0.2), 0 8px 20px rgba(0,0,0,.18);
  }
  .rg-assembly::before {
    content: "";
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: 10px;
    height: 38%;
    border: 1px solid rgba(255, 214, 138, 0.13);
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(255, 214, 138, 0.1), rgba(95, 55, 30, 0.18));
    box-shadow: inset 0 8px 16px rgba(0, 0, 0, 0.16);
    pointer-events: none;
  }
  .rg-assembly::after { display:none;
    content: "出杯工作台";
    position: absolute;
    right: 10px;
    bottom: 6px;
    color: rgba(255, 231, 187, 0.44);
    font-size: 0.52rem;
    letter-spacing: 0.12em;
    pointer-events: none;
  }
  .rg-assembly-label {
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 0.6rem;
    color: var(--text-dim, #9aa3c7);
    text-transform: uppercase;
    letter-spacing: 1px;
    z-index: 2;
  }
  .rg-slots {
    position: relative;
    z-index: 1;
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
    display: grid;
    gap: 7px;
    min-width: 0;
  }
  .rg-ing-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .rg-ing-tab {
    min-width: 0;
    min-height: 34px;
    padding: 5px 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 7px;
    background: rgba(27,36,51,.84);
    color: var(--text-dim, #aab4ce);
    font-size: .68rem;
    font-weight: 700;
    cursor: pointer;
  }
  .rg-ing-tab span {
    color: inherit;
    opacity: .72;
    font-size: .58rem;
  }
  .rg-ing-tab.active {
    border-color: var(--accent, #ffd166);
    background: rgba(255,209,102,.14);
    color: var(--text-main, #f5ead1);
  }
  .rg-ing-tab:disabled {
    opacity: .42;
    cursor: default;
  }
  .rg-ing-list {
    display: grid;
    /* Four ingredients fit on one row on desktop, so category/page changes
       never add or remove rows and push the serve controls off-screen. */
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-content: start;
    gap: 5px;
    min-width: 0;
  }
  .rg-ing-btn {
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    width: 100%;
    min-width: 0;
    min-height: 46px;
    padding: 4px 9px;
    color: var(--text-main);
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 700;
    text-align: left;
    contain: layout paint;
  }
  /* 所有分类都保留已选反馈；翻页或切换分类不会丢失本单制作状态。 */
  .rg-ing-btn.picked {
    border-color: var(--ok, #7bd88f);
    background: rgba(123, 216, 143, 0.22);
    box-shadow: 0 0 0 2px rgba(123, 216, 143, 0.35) inset;
  }
  /* 当前订单需要的原料、配菜或饮料沿用金色提示。 */
  .rg-ing-btn.need {
    border-color: var(--accent, #ffd166);
    background: rgba(255, 209, 102, 0.18);
    box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.42) inset;
  }
  .rg-ing-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .rg-ing-btn.action {
    background: linear-gradient(135deg, var(--accent, #ffd166), #e07020);
    border-color: transparent;
    color: #1a120a;
    justify-content: center;
  }
  .rg-ing-btn.trash {
    background: rgba(255, 138, 122, 0.15);
    justify-content: center;
  }
  .rg-ing-icon {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .rg-ing-name {
    display: block;
    width: auto;
    flex: 1;
    min-width: 0;
    max-width: 100%;
    color: var(--text-dim, #9aa3c7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.1;
  }
  .rg-ing-selected {
    color: var(--ok, #7bd88f);
    font-size: .65rem;
    font-weight: 800;
  }
  .rg-ing-empty {
    min-height: 46px;
    display: grid;
    place-items: center;
    border: 1px dashed rgba(255,255,255,.14);
    border-radius: 8px;
    color: var(--text-dim, #9aa3c7);
    font-size: .68rem;
  }
  /* CSS food kit：用几何形状表达食材，避免 emoji 字体差异和“表情堆叠”。 */
  .tool-icon { width: 21px; height: 21px; display: block; position: relative; }
  .clear-icon::before { content: ""; position: absolute; inset: 4px 5px 2px; border: 2px solid #ff9b91; border-top: 0; transform: skew(-5deg); }
  .clear-icon::after { content: ""; position: absolute; left: 3px; right: 3px; top: 3px; height: 2px; background: #ff9b91; box-shadow: 5px -3px 0 -0.5px #ff9b91; }
  .serve-icon::before { content: ""; position: absolute; width: 9px; height: 5px; left: 5px; top: 8px; border-left: 3px solid #102319; border-bottom: 3px solid #102319; transform: rotate(-45deg); }
  .rg-ing-btn.action .rg-ing-name {
    color: #1a120a;
    flex: 0 1 auto;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
  /* 移动端：单列堆叠 */
  @media (max-width: 480px) {
    .rg-main {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
      min-height: 220px;
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
  }
.rg-assembly::before {display:none;} .rg-assembly :global(.workbench){flex-shrink:0;width:100%;} .rg-cust-name {white-space:normal;} .rg-slots {margin-top:10px;}
  /* 汉堡样板：订单板与成品台并排，分类材料常驻底部。 */
  .restaurant-layout {
    --text-main:var(--shop-ink); --text-dim:#866344; --accent:var(--shop-accent); --ok:#54833f;
    box-sizing:border-box; padding:24px; gap:10px; color:var(--text-main);
    /* Inline data URLs can exceed CSS custom-property value limits. The image is
       assigned directly to background-image for portable builds. */
    background-color:var(--shop-border);background-position:center;background-size:cover;
    border:7px solid var(--shop-border); border-radius:16px;
    box-shadow:inset 0 0 0 2px #e3ae65,0 12px 28px #24130840;
    font-family:inherit;
  }
  .rg-shop-heading { display:flex; align-items:center; gap:12px; color:#fff1cf; text-shadow:0 2px 3px #60351d; }
  .rg-shop-heading > span { font-size:11px; letter-spacing:2px; }
  .rg-shop-heading b { font-size:24px; letter-spacing:4px; }
  .rg-shop-heading small { margin-left:auto; font-size:11px; }
  .restaurant-layout .rg-top { padding:8px 12px; border-radius:8px; background:#fff1d8f0; border:1px solid #c09561; font-size:12px; gap:18px; }
  .restaurant-layout .rg-main { grid-template-columns:minmax(0,1fr) minmax(0,1.12fr); grid-template-rows:minmax(360px,1fr); gap:16px; min-height:360px; flex:1; }
  .restaurant-layout .rg-queue { max-height:none; min-height:0; padding:10px; gap:8px; background:#fff3d9f5; border:2px solid #bb8c53; border-radius:10px; box-shadow:inset 0 0 0 3px #f5deb4; }
  .rg-queue-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 4px 8px; border-bottom:1px dashed #c8a774; }
  .rg-queue-heading b { font-size:16px; }
  .rg-queue-heading span { font-size:10px; color:#94724e; }
  .restaurant-layout .rg-cust { padding:8px 10px; border:1px solid #d2ad76; border-radius:7px; background:linear-gradient(110deg,#f0dbb4,#fcf0d6); color:#674326; box-shadow:0 2px 0 #b2834930; flex-shrink:0; }
  .restaurant-layout .rg-cust.active { border:2px solid #ac6031; padding:7px 9px; background:linear-gradient(110deg,#ffe4a6,#fff1cf); box-shadow:inset 4px 0 #ac6031,0 0 0 2px #dcaa6250; }
  .restaurant-layout .rg-cust-top { margin:0 0 3px; }
  .restaurant-layout .rg-cust-kind { background:#ab6238; box-shadow:none; }
  .restaurant-layout .rg-cust-name { font-size:12px; }
  .restaurant-layout .rg-cust-name small { color:#a27d55; font-size:10px; }
  .restaurant-layout .rg-patience { margin-top:7px; height:4px; background:#d8bd90; }
  .rg-order-summary { display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:5px; align-items:end; }
  .rg-order-product { display:flex; flex-direction:column; align-items:center; min-width:0; gap:2px; }
  .rg-order-product b { font-size:11px; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
  .rg-order-product small { font-size:9px; color:#98764e; }
  .rg-order-product.complete small { color:#578340; }
  .rg-order-burger { display:flex; justify-content:center; align-items:flex-end; height:55px; width:100%; }
  .rg-order-icon { display:grid; place-items:center; height:55px; width:100%; }
  .rg-order-icon :global(.food-art) { height:48px; width:48px; }
  .rg-not-ordered { color:#c4a476; font-size:24px; }
  .rg-order-empty { min-height:64px; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; border:1px dashed #d5b88a; border-radius:6px; color:#ac8c62; font-size:12px; background:#edddba55; }
  .rg-order-empty small { font-size:10px; }
  .restaurant-layout .rg-waiting { display:none; }
  .restaurant-layout .rg-assembly { padding:12px; background:#fff3dff5; border:2px solid #b98a51; box-shadow:inset 0 0 0 3px #f8e3bf; gap:8px; overflow:hidden; }
  .restaurant-layout .rg-assembly-label { position:static; align-self:flex-start; font-size:10px; color:#9c794e; }
  .rg-current-order { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:4px 10px; width:100%; }
  .rg-current-order span { color:#986941; font-size:10px; }
  .rg-current-order b { font-size:18px; }
  .rg-current-order small { flex-basis:100%; font-size:11px; color:#947148; text-align:center; }
  .restaurant-layout .rg-assembly :global(.workbench) { flex:1 1 200px; min-height:180px; width:100%; max-height:none; }
  .restaurant-layout .rg-slots { position:absolute; right:20px; top:114px; flex-direction:column; gap:10px; margin:0; }
  .restaurant-layout .rg-slot { width:66px; height:68px; background:#fff6dfb8; border-color:#c7a575; border-radius:9px; color:#be965f; }
  .restaurant-layout .rg-slot.filled { border-color:#729956; background:#fff8e8; }
  .restaurant-layout .rg-slot :global(.food-art) { width:46px; height:46px; }
  .restaurant-layout .rg-slot-label { font-size:9px; color:#8c6941; }
  .rg-build-recipe { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:4px; width:100%; font-size:10px; }
  .rg-build-recipe b { color:#967347; font-size:10px; }
  .rg-build-recipe span { border:1px solid #d8bd96; background:#f7e7c8; padding:3px 5px; border-radius:4px; }
  .rg-build-recipe span.done { color:#4c763a; border-color:#a2b180; background:#e9efd5; }
  .rg-build-recipe span.next { color:#a45b2b; border-color:#cb8d49; background:#ffdfa4; }
  .rg-undo { padding:3px 12px; min-height:26px; border:1px solid #caa775; border-radius:5px; background:#f5e3c3; color:#8a633b; font-size:10px; cursor:pointer; }
  .rg-undo:disabled { opacity:.45; cursor:default; }
  .restaurant-layout .work-notice { background:#70441dec; color:#ffefcb; padding:5px 10px; margin:0; border-radius:5px; font-size:11px; min-height:24px; box-sizing:border-box; }
  .restaurant-layout .rg-ing { grid-template-columns:minmax(0,1fr) 150px; grid-template-rows:34px 74px; padding:10px; background:#f8ebd1fa; border:2px solid #b88a50; border-radius:10px; gap:8px 12px; }
  .restaurant-layout .rg-ing-tabs { grid-column:1; }
  .restaurant-layout .rg-ing-tab { background:#e5cc9f; border:1px solid #c3a16d; color:#86603a; font-size:12px; }
  .restaurant-layout .rg-ing-tab.active { background:#a76037; color:#fff3d7; border-color:#8d4e2c; }
  .restaurant-layout .rg-ing-list { grid-column:1; grid-template-columns:repeat(var(--ingredient-count),minmax(0,1fr)); gap:6px; }
  .restaurant-layout .rg-ing-list .rg-ing-btn { flex-direction:column; padding:5px 3px; gap:3px; height:74px; min-height:74px; position:relative; background:linear-gradient(#fff5df,#eed9b1); border-color:#c8a170; overflow:hidden; }
  .restaurant-layout .rg-ing-icon { width:42px; height:42px; flex:0 0 42px; }
  .restaurant-layout .rg-ing-icon :global(.food-art) { width:42px; height:42px; }
  .restaurant-layout .rg-ing-name { flex:initial; color:#7b542e; font-size:10px; text-align:center; }
  .restaurant-layout .rg-ing-btn.need { border-color:#c07635; background:#ffe3a8; box-shadow:inset 0 0 0 2px #cf944e; }
  .restaurant-layout .rg-ing-btn.picked { border-color:#8d9f64; background:#e7e8c7; box-shadow:inset 0 0 0 1px #93a66a; }
  .restaurant-layout .rg-ing-selected { position:absolute; top:3px; right:4px; font-size:9px; color:#597c3f; }
  .restaurant-layout .rg-ing-controls { grid-column:2; grid-row:1 / 3; grid-template-columns:1fr; grid-template-rows:1fr 1.2fr; }
  .restaurant-layout .rg-ing-controls .rg-ing-btn { justify-content:center; min-height:44px; }
  .restaurant-layout .rg-ing-btn.action { background:linear-gradient(#bd753f,#99502d); border-color:#804322; color:#fff0ce; box-shadow:0 3px 0 #764322; }
  .restaurant-layout .rg-ing-btn.action .rg-ing-name { color:#fff0ce; font-size:16px; font-weight:800; }
  .restaurant-layout .rg-ing-btn.trash { background:#ecd8b3; border-color:#c7a675; }
  .restaurant-layout button:focus-visible { outline:3px solid #4e7344; outline-offset:2px; }
  .restaurant-layout .rg-ing-btn:disabled { opacity:.5; cursor:default; }
  @media (max-height:800px) and (min-width:541px) {
    .restaurant-layout { padding:14px; gap:8px; }
    .restaurant-layout .rg-main { min-height:320px; grid-template-rows:minmax(320px,1fr); }
    .restaurant-layout .rg-assembly-label, .rg-current-order small { display:none; }
    .rg-current-order b { font-size:16px; }
    .restaurant-layout .rg-assembly :global(.workbench.burger) { min-height:170px; }
    .restaurant-layout .rg-assembly :global(.burger-stack) { --burger-size:132px; }
    .restaurant-layout .rg-slots { top:74px; }
  }
  @media (max-width:850px) {
    .restaurant-layout { padding:12px; border-width:4px; }
    .restaurant-layout .rg-main { gap:8px; }
    .restaurant-layout .rg-ing { grid-template-columns:minmax(0,1fr) 110px; }
    .restaurant-layout .rg-ing-list { display:flex; overflow-x:auto; }
    .restaurant-layout .rg-ing-list .rg-ing-btn { flex:0 0 72px; }
    .rg-shop-heading b { font-size:20px; }
    .rg-shop-heading > span { display:none; }
  }
  @media (max-width:540px) {
    .restaurant-layout .rg-main { grid-template-columns:1fr; grid-template-rows:180px minmax(330px,1fr); min-height:520px; }
    .restaurant-layout .rg-queue { flex-direction:row; flex-wrap:nowrap; overflow-x:auto; max-height:none; }
    .rg-queue-heading { display:none; }
    .restaurant-layout .rg-cust { min-width:215px; flex:0 0 215px; }
    .rg-order-empty { min-width:120px; }
    .restaurant-layout .rg-ing { grid-template-columns:minmax(0,1fr); grid-template-rows:34px 74px 44px; }
    .restaurant-layout .rg-ing-controls { grid-column:1; grid-row:3; grid-template-columns:1fr 1fr; grid-template-rows:1fr; }
    .restaurant-layout .rg-top { gap:8px; font-size:11px; }
  }
  /* 场景配色同时进入订单纸、材料托盘和成品台。 */
  .restaurant-layout .rg-top, .restaurant-layout .rg-queue, .restaurant-layout .rg-assembly, .restaurant-layout .rg-ing { background:color-mix(in srgb,var(--shop-paper) 96%,transparent); border-color:var(--shop-border); box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--shop-soft) 60%,transparent); }
  .restaurant-layout .rg-cust { color:var(--shop-ink); background:linear-gradient(110deg,var(--shop-soft),var(--shop-paper)); border-color:color-mix(in srgb,var(--shop-border) 50%,var(--shop-paper)); }
  .restaurant-layout .rg-cust.active { border-color:var(--shop-accent); background:linear-gradient(110deg,var(--shop-soft),#fffbe9); box-shadow:inset 4px 0 var(--shop-accent),0 0 0 2px color-mix(in srgb,var(--shop-accent) 25%,transparent); }
  .restaurant-layout .rg-cust-kind { background:var(--shop-accent); }
  .restaurant-layout .rg-ing-tab { color:var(--shop-ink); background:var(--shop-soft); }
  .restaurant-layout .rg-ing-tab.active, .restaurant-layout .rg-ing-btn.action { background:var(--shop-accent); border-color:var(--shop-border); }
  .restaurant-layout .rg-ing-list .rg-ing-btn, .restaurant-layout .rg-ing-btn.trash { background:linear-gradient(var(--shop-paper),var(--shop-soft)); border-color:color-mix(in srgb,var(--shop-border) 55%,var(--shop-paper)); }
  .restaurant-layout .rg-ing-list .rg-ing-btn.need { border-color:var(--shop-accent); background:color-mix(in srgb,var(--shop-soft) 60%,#fff5c4); box-shadow:inset 0 0 0 2px var(--shop-accent); }
  .restaurant-layout .rg-ing-list .rg-ing-btn.picked { border-color:#829862; background:#e7edcf; box-shadow:inset 0 0 0 1px #93a66a; }
  .restaurant-layout .rg-ing-name, .restaurant-layout .rg-current-order span, .restaurant-layout .rg-slot-label { color:var(--shop-ink); }
  .restaurant-layout .rg-ing-btn.action .rg-ing-name { color:#fff7e9; }
  .restaurant-layout .work-notice { background:var(--shop-border); }
  .restaurant-layout .rg-stall-ask { border:1px solid var(--shop-border); background:var(--shop-paper); color:var(--shop-ink); }
  .restaurant-layout .rg-stall-ask .dim { color:var(--shop-ink); }
  .restaurant-layout .rg-stall-ask-btns .rg-ing-btn { width:auto; padding:8px 20px; }
  .restaurant-layout .rg-assembly :global(.workbench:not(.burger)) { min-height:155px; flex:1 1 180px; }
  .restaurant-layout .rg-cust.left { opacity:.5; }
  .grill-layout .rg-slots { top:85px; gap:8px; }
  .grill-layout .rg-slot { width:60px; height:54px; }
  .grill-layout .rg-slot :global(.food-art) { width:35px; height:35px; }
  .restaurant-layout { position:relative; overflow:auto; }
  .restaurant-layout:has(.crafted-assembly) .rg-main { min-height:380px; grid-template-rows:minmax(380px,1fr); }
  .restaurant-layout .crafted-assembly { gap:5px; padding:10px; }
  .crafted-assembly .rg-assembly-label { display:none; }
  .crafted-assembly .rg-current-order small { display:none; }
  .crafted-assembly .rg-slots { position:static;flex-direction:row;gap:7px;width:100%; }
  .crafted-assembly .rg-slot { flex:1;width:auto;height:30px;display:flex;flex-direction:row;justify-content:center;gap:5px;background:#ffffffba; }
  .crafted-assembly .rg-slot :global(.food-art) { width:30px;height:28px; }
  .crafted-assembly .rg-build-recipe { padding-right:80px; box-sizing:border-box; min-height:22px; font-size:9px; }
  .crafted-assembly .rg-build-recipe span { padding:2px 4px; }
  .crafted-assembly .rg-undo { position:absolute; bottom:10px;right:10px;padding:2px 6px;font-size:9px;min-height:23px; }
  .served-flight { position:absolute; left:55%; top:28%; width:240px;height:200px;pointer-events:none;z-index:5;filter:drop-shadow(0 15px 12px #0005);animation:serve-to-customer .9s ease-in forwards; }
  .served-flight b { position:absolute;bottom:0;left:30%;background:#517d3e;color:#fff;padding:5px 15px;border-radius:20px;font-size:12px;white-space:nowrap; }
  @keyframes serve-to-customer { 0%{opacity:1;scale:1;translate:0 0;}50%{opacity:1;scale:.8;translate:-130px -35px;}100%{opacity:0;scale:.5;translate:-500px -100px;} }
  @media(max-height:560px) and (orientation:landscape){.restaurant-layout:has(.crafted-assembly) .rg-main{min-height:265px;grid-template-rows:minmax(265px,1fr);}.crafted-assembly .rg-slots{top:60px;right:12px;}.crafted-assembly .rg-slot{width:42px;height:40px;}.crafted-assembly .rg-slot :global(.food-art){width:25px;height:25px;}.crafted-assembly .rg-undo{bottom:4px;}.crafted-assembly .rg-build-recipe{font-size:8px;}}
  @media (max-height:560px) and (orientation:landscape) { .restaurant-layout .rg-assembly :global(.workbench:not(.burger)) { min-height:90px; flex-basis:100px; } }
</style>

