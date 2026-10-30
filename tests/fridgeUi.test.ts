// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CookingWorkbench from '../src/components/layout/CookingWorkbench.svelte';
import FridgePanel from '../src/components/layout/FridgePanel.svelte';
import HomeInterior from '../src/components/layout/HomeInterior.svelte';
import { createInitialState } from '../src/game/core/state';
import { signLease } from '../src/game/core/housing';
import { moveTo, visibleActionsAtLocation } from '../src/game/core/actions';
import { installFridge } from '../src/game/core/fridge';
import { cookFreeform, storeCookedMeal } from '../src/game/core/cooking';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState } from '../src/stores/uiStore.svelte';

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
beforeAll(() => { Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {} })) as any; });
afterEach(() => {
  if (component) { unmount(component); component = undefined; }
  target?.remove(); uiState.modal = null; replaceState(createInitialState()); vi.unstubAllGlobals();
});
function kitchen() {
  const s = createInitialState(1492); s.player.money = 10000;
  signLease(s, 'old_apartment'); moveTo(s, 'old_apartment');
  installFridge(s, 'small'); s.flags.cook_utensil = true;
  s.player.skills.cooking = 6; s.inventory.milk = 1; s.inventory.egg = 1;
  replaceState(s); return s;
}
function render(view: any, props = {}) {
  target = document.createElement('div'); document.body.appendChild(target);
  component = mount(view, { target, props }); flushSync(); return target;
}
function click(text: string) {
  const button = [...target.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text));
  expect(button, text).toBeTruthy(); expect(button!.disabled, text).toBe(false);
  button!.click(); flushSync();
}
function dispose() { unmount(component!); component = undefined; target.remove(); }

describe('冰箱入口与成品属性', () => {
  it('从 3D 房间点击冰箱打开库存弹窗，不再展开做饭行动', () => {
    kitchen(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    render(HomeInterior, { actions: visibleActionsAtLocation(gameState, gameState.locationId), onAction: vi.fn(), onCooking: vi.fn(), onExit: vi.fn() });
    const fridge = target.querySelector<HTMLButtonElement>('[data-home-object="fridge"]');
    expect(fridge).toBeTruthy(); fridge!.click(); flushSync();
    click('看看冰箱'); expect(uiState.modal).toBe('fridge');
    expect(target.querySelector('[data-home-branch="cook"]')).toBeNull();
  });

  it('从选料、开火、入库到冰箱查看及食用，属性随品质展示、库存实时更新且厨艺不重复增加', () => {
    kitchen(); uiState.modal = 'cooking'; render(CookingWorkbench);
    click('牛奶'); click('鸡蛋');
    expect([...target.querySelectorAll('.chip')].map(b => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('牛奶 ×1'), expect.stringContaining('鸡蛋 ×1')]));
    click('开火');
    expect(target.querySelector('.result-effects')?.textContent).toContain('饱腹 +49 · 健康 +4 · 心情 +10');
    click('放入冰箱');
    expect(gameState.fridge.items['cooked:pudding']).toBe(1);
    const skill = gameState.player.skills.cooking;
    dispose(); uiState.modal = 'fridge'; render(FridgePanel);
    const card = target.querySelector('[data-meal-id="cooked:pudding"]');
    expect(card?.textContent).toContain('完美品质 · 1 份');
    expect(card?.querySelector('.meal-effects')?.textContent).toBe('饱腹 +49 · 健康 +4 · 心情 +10');
    const satiety = gameState.player.attrs.satiety;
    click('食用一份');
    expect(gameState.player.attrs.satiety).toBe(Math.min(100, satiety + 49));
    expect(gameState.player.skills.cooking).toBe(skill);
    expect(gameState.fridge.items['cooked:pudding']).toBeUndefined();
    expect(target.textContent).toContain('冰箱里还没有做好的菜');
  });

  it('查看冰箱不要求厨具，三种品质分别展示份数和效果并可选定食用', () => {
    kitchen(); gameState.flags.cook_utensil = false;
    expect(storeCookedMeal(gameState, 'pudding', '普通')).toBe(true);
    expect(storeCookedMeal(gameState, 'pudding', '美味')).toBe(true);
    expect(storeCookedMeal(gameState, 'pudding', '完美')).toBe(true);
    expect(gameState.cooking.mealQualityBatches?.['cooked:pudding']).toEqual([
      { quality: '普通', quantity: 1 }, { quality: '美味', quantity: 1 }, { quality: '完美', quantity: 1 },
    ]);
    uiState.modal = 'fridge'; render(FridgePanel);
    expect(target.querySelectorAll('.meal-card')).toHaveLength(3);
    expect(target.querySelector('[data-quality="普通"] .meal-effects')?.textContent).toContain('饱腹 +38');
    expect(target.querySelector('[data-quality="美味"] .meal-effects')?.textContent).toContain('饱腹 +44');
    target.querySelector<HTMLButtonElement>('[data-quality="美味"] button')!.click(); flushSync();
    expect(target.querySelector('[data-quality="美味"]')).toBeNull();
    expect(target.querySelectorAll('.meal-card')).toHaveLength(2);
    const cookButton = [...target.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('去厨房'));
    expect(cookButton?.disabled).toBe(true);
  });

  it('不可重复选择超过库存的材料，移除后恢复可选', () => {
    kitchen(); uiState.modal = 'cooking'; render(CookingWorkbench);
    click('牛奶');
    const milk = [...target.querySelectorAll<HTMLButtonElement>('.item-grid button')].find(b => b.textContent?.includes('牛奶'))!;
    expect(milk.disabled).toBe(true);
    target.querySelector<HTMLButtonElement>('.chip')!.click(); flushSync();
    expect(milk.disabled).toBe(false);
  });

  it('读档后厨具条件改变仍可处理已完成的菜', () => {
    kitchen(); cookFreeform(gameState, ['milk', 'egg'], []); gameState.flags.cook_utensil = false;
    uiState.modal = 'cooking'; render(CookingWorkbench);
    expect(target.querySelector('.result-card')?.textContent).toContain('布丁');
    click('放入冰箱'); expect(gameState.cooking.pendingCook).toBeUndefined();
    expect(target.querySelector('.blocked')?.textContent).toContain('没有烹饪器具');
  });

  it('已知菜谱在右侧显示缺料并可一键选料，选料时不扣除材料', () => {
    kitchen();
    gameState.inventory.tomato = 1; gameState.fridge.items.salt = 1;
    gameState.cooking.unlockedRecipeIds = ['tomato_egg', 'egg_tart'];
    uiState.modal = 'cooking'; render(CookingWorkbench);
    const known = target.querySelector('[aria-label="已知菜谱"]')!;
    const unavailable = known.querySelector<HTMLButtonElement>('[data-recipe-id="egg_tart"]')!;
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.textContent).toContain('鸡蛋 ×1');
    expect(unavailable.textContent).toContain('糖 ×1');
    const before = JSON.stringify({ inventory: gameState.inventory, fridge: gameState.fridge });
    const tomatoEgg = known.querySelector<HTMLButtonElement>('[data-recipe-id="tomato_egg"]')!;
    expect(tomatoEgg.disabled).toBe(false); tomatoEgg.click(); flushSync();
    expect(JSON.stringify({ inventory: gameState.inventory, fridge: gameState.fridge })).toBe(before);
    expect([...target.querySelectorAll('.chip')].map((node) => node.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('番茄'), expect.stringContaining('鸡蛋')]));
    expect(target.querySelector('.seasoning-grid .selected')?.textContent).toContain('盐');
    expect(target.querySelector('.preview')?.textContent).toContain('番茄炒蛋');
    click('开火');
    expect(gameState.cooking.pendingCook?.recipeId).toBe('tomato_egg');
    expect(gameState.inventory.tomato).toBeUndefined();
    expect(gameState.inventory.egg).toBeUndefined();
    expect(gameState.fridge.items.salt).toBeUndefined();
  });

  it('工作台和冰箱把农场、旧市场与具体卷心菜合并展示，按原始来源扣料', () => {
    kitchen();
    gameState.inventory.vegetable = 1;
    gameState.fridge.items.farm_vegetable = 1;
    gameState.fridge.items.cabbage = 1;
    gameState.cooking.unlockedRecipeIds = ['dish_veg'];
    uiState.modal = 'cooking'; render(CookingWorkbench);
    const ingredientButtons = [...target.querySelectorAll<HTMLButtonElement>('.ingredients .item-grid button')];
    const cabbage = ingredientButtons.filter((button) => button.textContent?.includes('卷心菜'));
    expect(cabbage).toHaveLength(1);
    expect(cabbage[0].textContent).toContain('×3');
    expect(target.textContent).toContain('旧蔬菜库存按卷心菜');
    const coldCabbage = [...target.querySelectorAll('.ingredient-list .ingredient')].filter((node) => node.textContent?.includes('卷心菜'));
    expect(coldCabbage).toHaveLength(1);
    expect(coldCabbage[0].textContent).toContain('×2');
    target.querySelector<HTMLButtonElement>('[data-recipe-id="dish_veg"]')!.click(); flushSync();
    expect(target.querySelector('.chip')?.textContent).toContain('卷心菜');
    click('开火');
    expect(gameState.cooking.pendingCook?.recipeId).toBe('dish_veg');
    expect(gameState.fridge.items.cabbage).toBeUndefined();
    expect(gameState.inventory.vegetable).toBe(1);
    expect(gameState.fridge.items.farm_vegetable).toBe(1);
  });
});
