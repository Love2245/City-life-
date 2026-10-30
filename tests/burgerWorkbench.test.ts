// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RestaurantGame from '../src/components/layout/minigames/RestaurantGame.svelte';
import { getMiniGameConfig, type RestaurantCfg } from '../src/game/core/minigame';
import { setGameMode } from '../src/stores/uiStore.svelte';

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;
function start() {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(.1);
  setGameMode('pc');
  const original = getMiniGameConfig('job_waiter_fast') as RestaurantCfg;
  const cfg: RestaurantCfg = { ...original, recipes:[original.recipes[0]], spawnMs:1000, customerTypes:[{name:'样板顾客',emoji:'',patience:500,tip:1}] };
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(RestaurantGame,{target,props:{cfg,workSession:true,onFinish:vi.fn()}});
  flushSync();
  return cfg;
}
function click(selector: string) { target.querySelector<HTMLButtonElement>(selector)!.click(); flushSync(); }
function category(index: number) { target.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index].click(); flushSync(); }
function item(id: string) { click(`[data-item-id="${id}"]`); }
function layers() { return [...target.querySelectorAll<HTMLElement>('.rg-assembly [data-layer-id]')].map(x => x.dataset.layerId); }
afterEach(async () => { if(component) await unmount(component); target?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); setGameMode('pc'); });

describe('汉堡订单板与成品台',() => {
  it('完整显示三种需求，主料按序堆叠，撤回与配齐后能够实际出餐',() => {
    const cfg = start();
    expect(target.querySelector('.burger-layout')).not.toBeNull();
    expect(target.querySelectorAll('.rg-cust.active .rg-order-product')).toHaveLength(3);
    expect(target.querySelectorAll('.rg-ing-list [data-item-id]')).toHaveLength(cfg.ingredients.length);
    item('bun_top'); // 错误的第一层不能破坏制作进度。
    expect(layers()).toEqual([]);
    for(const id of cfg.recipes[0].recipe) item(id);
    expect(layers()).toEqual(cfg.recipes[0].recipe);
    click('.rg-undo');
    expect(layers()).toEqual(cfg.recipes[0].recipe.slice(0,-1));
    item('bun_top');
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('请配齐');
    category(1); item(cfg.sides![1].id); // 错误小吃不能出餐。
    category(2); item(cfg.drinks![0].id);
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('请配齐');
    category(1); item(cfg.sides![0].id);
    expect(target.querySelector('.rg-current-order')?.textContent).toContain('可以出餐');
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(2);
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
    expect(target.querySelector('.rg-top')?.textContent).toContain('1/4');
    expect(target.querySelector('.rg-cust[data-order-id="1"]')).toBeNull();
  });

  it('切换客人保留各自的汉堡、小吃和饮料，清空只影响当前订单',() => {
    const cfg = start();
    item('bun_bottom'); item('patty');
    category(1); item(cfg.sides![0].id);
    category(2); item(cfg.drinks![0].id);
    vi.advanceTimersByTime(1100); flushSync();
    click('.rg-cust[data-order-id="2"]');
    expect(layers()).toEqual([]);
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(0);
    category(0); item('bun_bottom');
    click('.rg-cust[data-order-id="1"]');
    expect(layers()).toEqual(['bun_bottom','patty']);
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(2);
    click('.rg-ing-controls .trash');
    expect(layers()).toEqual([]);
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(0);
    click('.rg-cust[data-order-id="2"]');
    expect(layers()).toEqual(['bun_bottom']);
  });
});
