// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushSync, mount, unmount } from "svelte";
import RestaurantGame from "../src/components/layout/minigames/RestaurantGame.svelte";
import FoodArt from "../src/components/layout/minigames/FoodArt.svelte";
import FoodWorkbench from "../src/components/layout/minigames/FoodWorkbench.svelte";
import { getMiniGameConfig, type RestaurantCfg } from "../src/game/core/minigame";
import { setGameMode } from "../src/stores/uiStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function trackMount(component: ReturnType<typeof mount>, target: HTMLElement): void {
  mounted.push({ component, target });
  flushSync();
}

function makeRestaurantConfig(): RestaurantCfg {
  return {
    type: "restaurant",
    title: "餐饮材料测试",
    icon: "☕",
    desc: "材料分页视觉回归",
    mode: "cup",
    spawnMs: 100_000,
    maxWaiting: 3,
    ingredients: Array.from({ length: 9 }, (_, i) => ({ id: `ingredient-${i + 1}`, name: `主料${i + 1}`, icon: "" })),
    sides: Array.from({ length: 5 }, (_, i) => ({ id: `side-${i + 1}`, name: `配菜${i + 1}`, icon: "", price: 1 })),
    drinks: Array.from({ length: 5 }, (_, i) => ({ id: `drink-${i + 1}`, name: `饮料${i + 1}`, icon: "", price: 1 })),
    recipes: [{ id: "test-drink", name: "测试饮品", price: 10, recipe: ["ingredient-1"] }],
    customerTypes: [{ name: "测试顾客", emoji: "🙂", patience: 500, tip: 0 }],
  };
}

function itemIds(target: HTMLElement): string[] {
  return Array.from(target.querySelectorAll<HTMLButtonElement>(".rg-ing-list [data-item-id]"), (button) => button.dataset.itemId ?? "");
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    unmount(entry.component);
    entry.target.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  setGameMode("pc");
});

describe("餐饮小游戏视觉回归", () => {
  it("材料分类完整展示并保留选中状态", () => {
    const target = document.createElement("div"); document.body.appendChild(target);
    trackMount(mount(RestaurantGame, { target, props: { cfg: makeRestaurantConfig(), onFinish: vi.fn() } }), target);
    const tabs = target.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(itemIds(target)).toEqual(Array.from({length:9},(_,i)=>'ingredient-'+(i+1)));
    target.querySelector<HTMLButtonElement>('[data-item-id="ingredient-1"]')!.click(); flushSync();
    tabs[1].click(); flushSync();
    expect(itemIds(target)).toEqual(Array.from({length:5},(_,i)=>'side-'+(i+1)));
    target.querySelector<HTMLButtonElement>('[data-item-id="side-5"]')!.click(); flushSync();
    tabs[2].click(); flushSync();
    expect(itemIds(target)).toEqual(Array.from({length:5},(_,i)=>'drink-'+(i+1)));
    tabs[1].click(); flushSync();
    expect(target.querySelector('[data-item-id="side-5"]')?.getAttribute('aria-pressed')).toBe('true');
    tabs[0].click(); flushSync();
    expect(target.querySelector('[data-item-id="ingredient-1"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it("手游材料按单行横向浏览，横竖屏餐饮主区都可收缩", () => {
    const source = readFileSync(resolve("src/styles/mobile.css"), "utf8");
    expect(source).toMatch(/\.mg-stage\.fs \.rg \.rg-ing\s*\{\s*display:\s*grid;/);
    expect(source).toMatch(/\.mg-stage\.fs \.rg \.rg-main\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);/s);
    expect(source).toMatch(/\.mg-stage\.fs \.rg \.rg-ing-list\s*\{\s*display:\s*flex;\s*flex-flow:\s*row nowrap;[^}]*overflow-x:\s*auto;/s);
    expect(source).toMatch(/\.mg-stage\.fs \.rg \.rg-ing-btn\s*\{[^}]*min-height:\s*44px;/s);
    expect(source).toMatch(/@media\s*\(max-width:\s*680px\)\s*and\s*\(orientation:\s*portrait\)[^{]*\{[\s\S]*?\.rg-main\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(source).not.toContain(".rg-ing-cat");
    expect(source).not.toContain(".rg-ing-row");
  });

  it("手游关闭工作台装饰动画，并用较少刷新次数维持相同的顾客耐心速度", () => {
    const source = readFileSync(resolve("src/styles/mobile.css"), "utf8");
    expect(source).toMatch(/\.rg \.workbench,\s*:root\[data-game-mode="mobile"\] \.rg \.workbench \*/);
    expect(source).toMatch(/animation:\s*none !important;\s*transition:\s*none !important;/);

    vi.useFakeTimers();
    setGameMode("pe");
    const target = document.createElement("div");
    document.body.appendChild(target);
    trackMount(mount(RestaurantGame, { target, props: { cfg: makeRestaurantConfig(), onFinish: vi.fn() } }), target);

    vi.advanceTimersByTime(1000);
    flushSync();
    const remainingPatience = Number(target.querySelector<HTMLElement>(".rg-patience-fill")?.style.width.replace("%", ""));
    expect(remainingPatience).toBeCloseTo(100-100/1100, 8);
  });

  it("手游一次显示当前分类全部选项", () => {
    setGameMode("pe");
    const target = document.createElement("div");
    document.body.appendChild(target);
    trackMount(mount(RestaurantGame, { target, props: { cfg: makeRestaurantConfig(), onFinish: vi.fn() } }), target);
    expect(itemIds(target)).toEqual(Array.from({ length: 9 }, (_, i) => `ingredient-${i + 1}`));
  });

  it("焦糖使用清晰的方糖矢量图，不再显示旧焦糖酱位图", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    trackMount(mount(FoodArt, { target, props: { id: "caramel", label: "焦糖方糖" } }), target);

    expect(target.querySelector("img.food-art")).toBeNull();
    expect(target.querySelector('[data-art="caramel-cube"]')).not.toBeNull();
  });

  it("杯中多种原料汇成单一平滑液体，而不是分别堆叠色带", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    trackMount(mount(FoodWorkbench, {
      target,
      props: {
        mode: "cup",
        ids: ["espresso", "milk", "foam", "caramel"],
        names: { espresso: "浓缩", milk: "牛奶", foam: "奶泡", caramel: "焦糖" },
        title: "焦糖玛奇朵",
      },
    }), target);

    const fill = target.querySelector<HTMLElement>(".fill");
    expect(fill?.dataset.liquidColor).toBe("#c5a783");
    expect(target.querySelectorAll(".glass .liquid")).toHaveLength(1);
    expect(fill?.querySelectorAll(":scope > .liquid-gloss")).toHaveLength(1);
    expect(fill?.querySelectorAll(":scope > div")).toHaveLength(0);
    expect(target.querySelector<HTMLElement>(".glass")?.contains(fill ?? null)).toBe(true);
  });

  it("网吧网管桌面切分类与顾客计时后布局节点稳定，并能按小票实际出餐", () => {
    setGameMode("pc");
    vi.useFakeTimers();
    const cfg = getMiniGameConfig("job_netbar_admin") as RestaurantCfg;
    const target = document.createElement("div");
    document.body.appendChild(target);
    trackMount(mount(RestaurantGame, { target, props: { cfg, onFinish: vi.fn(), workSession: true } }), target);

    const root = target.querySelector<HTMLElement>(".rg")!;
    const main = target.querySelector<HTMLElement>(".rg-main")!;
    const assembly = target.querySelector<HTMLElement>(".rg-assembly")!;
    const ingredientList = target.querySelector<HTMLElement>(".rg-ing-list")!;
    const ingredientControls = target.querySelector<HTMLElement>(".rg-ing-controls")!;
    const serve = target.querySelector<HTMLButtonElement>(".rg-ing-controls .action")!;
    const patience = target.querySelector<HTMLElement>(".rg-patience-fill")!;
    const initialPatienceWidth = patience.style.width;
    const recipeName = target.querySelector(".rg-current-order b")?.textContent?.trim();
    const recipe = cfg.recipes.find((item) => item.name === recipeName);
    expect(recipe, "visible receipt recipe must map to its configured ingredients").toBeDefined();

    let category: "main" | "sides" | "drinks" = "main";
    function selectCategory(label: string): void {
      const tab = Array.from(target.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent?.includes(label));
      expect(tab, `missing ${label} ingredient category`).toBeDefined();
      tab!.click();
      flushSync();
      category = label === "主品原料" ? "main" : label === "配菜" ? "sides" : "drinks";
    }
    function selectItem(id: string): void {
      const pool = category === "main" ? cfg.ingredients : category === "sides" ? cfg.sides ?? [] : cfg.drinks ?? [];
      const index = pool.findIndex((item) => item.id === id);
      expect(index, `ingredient ${id} must belong to the selected category`).toBeGreaterThanOrEqual(0);
      const item = target.querySelector<HTMLButtonElement>(`.rg-ing-list [data-item-id="${id}"]`);
      expect(item, `ingredient ${id} should be present on selected category`).not.toBeNull();
      item!.click();
      flushSync();
      expect(target.querySelector(".rg-ing-list")).toBe(ingredientList);
      expect(target.querySelector(".rg-ing-controls")).toBe(ingredientControls);
    }

    selectCategory("主品原料");
    for (const id of recipe!.recipe) selectItem(id);
    const ticketRows = Array.from(target.querySelectorAll<HTMLElement>(".rg-cust.active .rg-order-product b"))
      .slice(1).map((row) => row.textContent ?? "");
    const orderedSide = cfg.sides?.find((item) => ticketRows.some((row) => row.includes(item.name)));
    const orderedDrink = cfg.drinks?.find((item) => ticketRows.some((row) => row.includes(item.name)));
    if (orderedSide) {
      selectCategory("配菜");
      selectItem(orderedSide.id);
    }
    if (orderedDrink) {
      selectCategory("饮料");
      selectItem(orderedDrink.id);
    }

    vi.advanceTimersByTime(1000);
    flushSync();
    expect(target.querySelector(".rg")).toBe(root);
    expect(target.querySelector(".rg-main")).toBe(main);
    expect(target.querySelector(".rg-assembly")).toBe(assembly);
    expect(target.querySelector(".rg-ing-list")).toBe(ingredientList);
    expect(target.querySelector(".rg-ing-controls")).toBe(ingredientControls);
    expect(target.querySelector(".rg-ing-controls .action")).toBe(serve);
    expect(target.querySelector(".rg-patience-fill")).toBe(patience);
    expect(patience.style.width).not.toBe(initialPatienceWidth);

    const mix=target.querySelector<HTMLButtonElement>('.craft-primary')!;
    for(let i=0;i<3;i++){mix.click();flushSync();vi.advanceTimersByTime(800);flushSync();}
    mix.click();flushSync();vi.advanceTimersByTime(3200);flushSync();mix.click();flushSync();vi.advanceTimersByTime(1000);flushSync();
    serve.click();
    flushSync();
    expect(target.querySelector(".work-notice")?.textContent).toContain("出餐成功");
    expect(target.querySelector(".rg-top")?.textContent).toMatch(/1\/[4-6]/);
    expect(target.querySelector(".rg")).toBe(root);
    expect(target.querySelector(".rg-main")).toBe(main);
    expect(target.querySelector(".rg-ing-controls .action")).toBe(serve);
  });
});
