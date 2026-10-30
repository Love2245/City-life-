// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RestaurantGame from '../src/components/layout/minigames/RestaurantGame.svelte';
import { getMiniGameConfig, type RestaurantCfg } from '../src/game/core/minigame';
import { restaurantPresentation } from '../src/lib/restaurantPresentation';
import { craftKind, cookingMethod, plateIngredients } from '../src/lib/restaurantCraft';
import { setGameMode } from '../src/stores/uiStore.svelte';
let component:ReturnType<typeof mount>|undefined;
let target:HTMLDivElement;
function start(key:string, overrides:Partial<RestaurantCfg>={}, mode:'pc'|'pe'='pc') {
  vi.useFakeTimers(); vi.spyOn(Math,'random').mockReturnValue(.1); setGameMode(mode);
  const original=getMiniGameConfig(key) as RestaurantCfg;
  const cfg={...original,recipes:[original.recipes[0]],spawnMs:1000,customerTypes:[{name:'测试顾客',emoji:'',patience:500,tip:1}],...overrides};
  target=document.createElement('div');document.body.appendChild(target);
  const onFinish=vi.fn(),onStallResult=vi.fn();
  component=mount(RestaurantGame,{target,props:{cfg,workSession:true,stallStamina:100,stallHour:16,onFinish,onStallResult}}); flushSync();
  return {cfg,onFinish,onStallResult};
}
function click(selector:string) { target.querySelector<HTMLButtonElement>(selector)!.click(); flushSync(); }
function category(index:number) { target.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index].click();flushSync(); }
function item(id:string) { click(`[data-item-id="${id}"]`); }
function prepare(cfg:RestaurantCfg) {
  category(0); for(const id of [...cfg.recipes[0].recipe].reverse()) item(id);
  if(cfg.sides?.length) {category(1);item(cfg.sides[0].id);}
  if(cfg.drinks?.length) {category(2);item(cfg.drinks[0].id);}
}
function tick(ms:number) { vi.advanceTimersByTime(ms);flushSync(); }
function finishCraft(cfg:RestaurantCfg) {
  const kind=craftKind(cfg), recipe=cfg.recipes[0].recipe;
  if(kind==='grill') { tick(4200);click('.craft-flip');tick(3400);click('.craft-primary');tick(1000);click('.craft-primary');tick(2000); }
  else if(kind==='bar') {for(let i=0;i<3;i++){click('.craft-primary');tick(800);}click('.craft-primary');tick(3200);click('.craft-primary');tick(1000);}
  else if(kind==='coffee') {click('.craft-primary');tick(5400);click('.craft-primary');tick(1000);click('.craft-primary');tick(2000);}
  else {if(cookingMethod(recipe)==='toss'){for(let i=0;i<3;i++){click('.craft-primary');tick(800);}}else{click('.craft-primary');tick(4000);if(cookingMethod(recipe)==='sear')click('.craft-flip');tick(2600);click('.craft-primary');tick(1000);}for(const _ of plateIngredients(recipe)){click('.craft-primary');tick(800);}}
}
afterEach(async()=>{if(component) await unmount(component);component=undefined;target?.remove();vi.useRealTimers();vi.restoreAllMocks();setGameMode('pc');});
describe('六款餐饮制作体验',()=>{
  const menuCases=['job_cafe_staff','job_waiter_west','job_netbar_admin','stall_street_night'].flatMap(key=>(getMiniGameConfig(key) as RestaurantCfg).recipes.map(recipe=>({key,recipe})));
  it.each(menuCases)('$key / $recipe.name 的全部工序与成品交付',({key,recipe})=>{const {cfg}=start(key,{recipes:[recipe]});prepare(cfg);finishCraft(cfg);expect(target.querySelector('[data-production-phase="done"]')).not.toBeNull();click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');});
  it.each(['job_cafe_staff','job_waiter_west','job_netbar_admin','internet_night_job','stall_street_night','stall_market_fair'])('%s 显示完整需求并可实际配齐出餐', key=>{
    const {cfg}=start(key);
    expect(target.querySelectorAll('.rg-cust.active .rg-order-product')).toHaveLength(3);
    expect(target.querySelectorAll('.rg-ing-list [data-item-id]')).toHaveLength(cfg.ingredients.length);
    prepare(cfg);
    expect(target.querySelector('.rg-current-order')?.textContent).not.toContain('可以出餐');
    finishCraft(cfg);
    expect(target.querySelector('.rg-current-order')?.textContent).toContain('可以出餐');
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
    expect(target.querySelector('.rg-cust[data-order-id="1"]')).toBeNull();
  });
  it('各店铺拥有不同的背景和场景标识',()=>{
    const scenes=['job_waiter_fast','job_cafe_staff','job_waiter_west','job_netbar_admin','internet_night_job','stall_street_night','stall_market_fair'].map(key=>restaurantPresentation(getMiniGameConfig(key) as RestaurantCfg));
    expect(new Set(scenes.map(x=>x.background)).size).toBe(7);
    expect(new Set(scenes.map(x=>x.id)).size).toBe(7);
  });
  it.each(['job_cafe_staff','job_netbar_admin','stall_street_night'])('%s 在手机低频计时下也能完成相同工序',key=>{
    const {cfg}=start(key,{},'pe');prepare(cfg);finishCraft(cfg);
    expect(target.querySelector('[data-production-phase="done"]')).not.toBeNull();
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
  it('杯饮错误配方不能出餐，撤回后正确原料按任意顺序加入可完成',()=>{
    const {cfg}=start('job_cafe_staff');
    item('choco'); prepare(cfg);
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('原料不符');
    click('.rg-ing-controls .trash');prepare(cfg);
    finishCraft(cfg);
    expect(target.querySelector('.rg-cust.active .rg-order-product')?.classList.contains('complete')).toBe(true);
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
  it('切换顾客保留各自饮品与配餐，清空只清当前订单',()=>{
    const {cfg}=start('job_netbar_admin');prepare(cfg);finishCraft(cfg);
    vi.advanceTimersByTime(1100);flushSync();click('.rg-cust[data-order-id="2"]');
    expect(target.querySelector('.rg-assembly [data-art-part="ingredient-dishes"]')?.childElementCount).toBe(0);
    category(0);item('tea');
    click('.rg-cust[data-order-id="1"]');
    expect(target.querySelector('.rg-current-order')?.textContent).toContain('可以出餐');
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(2);
    click('.rg-ing-controls .trash');click('.rg-cust[data-order-id="2"]');
    expect(target.querySelector('.rg-assembly [data-art-part="ingredient-dishes"]')?.childElementCount).toBe(1);
    expect(target.querySelectorAll('.rg-slots .food-art')).toHaveLength(0);
  });
  it('错料不加热，切单后正确配方继续烤制，撤回后重新计火候',()=>{
    const {cfg}=start('stall_street_night');
    category(0);item('box');item('meat');item('sauce');vi.advanceTimersByTime(1200);flushSync();
    expect(target.querySelector('.craft-gauge b')?.textContent).toBe('0%');
    click('.rg-ing-controls .trash');prepare(cfg);vi.advanceTimersByTime(1200);flushSync();
    click('.rg-cust[data-order-id="2"]');vi.advanceTimersByTime(2600);flushSync();
    click('.rg-cust[data-order-id="1"]');
    expect(Number(target.querySelector('.craft-gauge b')?.textContent?.replace('%',''))).toBeGreaterThan(30);
    expect(target.querySelector('.rg-current-order')?.textContent).not.toContain('可以出餐');
    click('.rg-undo');
    expect(target.querySelector('.craft-gauge b')?.textContent).toBe('0%');
    expect(target.querySelector('.rg-current-order')?.textContent).not.toContain('可以出餐');
    category(0);item(cfg.recipes[0].recipe[0]);vi.advanceTimersByTime(10500);flushSync();
    click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('烤焦');
    expect(target.querySelector('.rg-cust[data-order-id="1"]')).not.toBeNull();
  });
  it('摆摊服务一批后可以继续或收摊，实际服务人数用于结算',()=>{
    const {cfg,onFinish,onStallResult}=start('stall_market_fair');
    for(let i=0;i<3;i++){prepare(cfg);finishCraft(cfg);click('.rg-ing-controls .action');}
    expect(target.querySelector('.rg-stall-ask')?.textContent).toContain('已服务 3 位顾客');
    click('.rg-stall-ask-btns .action');vi.advanceTimersByTime(1200);flushSync();
    expect(target.querySelector('.rg-stall-ask')).toBeNull();
    for(let i=0;i<3;i++){prepare(cfg);finishCraft(cfg);click('.rg-ing-controls .action');}
    click('.rg-stall-ask-btns .trash');
    expect(onStallResult).toHaveBeenCalledWith(6);expect(onFinish).toHaveBeenCalledWith(.75);
  });
  it('咖啡过早停止需要重做，未完成工序不能出餐',()=>{
    const {cfg}=start('job_cafe_staff');prepare(cfg);
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('工序还未完成');
    click('.craft-primary');tick(1000);click('.craft-primary');
    expect(target.querySelector('.work-notice')?.textContent).toContain('时间太短');
    expect(target.querySelector('[data-production-phase="done"]')).toBeNull();
    finishCraft(cfg);click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
  it('封杯过早需要重新启动机器，摇匀后不能直接交付',()=>{
    const {cfg}=start('job_netbar_admin');prepare(cfg);for(let i=0;i<3;i++){click('.craft-primary');tick(800);}
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('工序还未完成');
    click('.craft-primary');tick(500);click('.craft-primary');expect(target.querySelector('.work-notice')?.textContent).toContain('时间太短');
    click('.craft-primary');tick(3200);click('.craft-primary');tick(1000);click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
  it('西餐必须翻面再起锅，摆盘未齐不能交付',()=>{
    const original=getMiniGameConfig('job_waiter_west') as RestaurantCfg;
    const steak=original.recipes.find(r=>r.recipe.includes('steak'))!;
    const {cfg}=start('job_waiter_west',{recipes:[steak]});prepare(cfg);
    click('.craft-primary');tick(6500);click('.craft-primary');
    expect(target.querySelector('.work-notice')?.textContent).toContain('还没有翻面');
    click('.craft-flip');tick(800);click('.craft-primary');tick(1000);click('.craft-primary');tick(800);
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('工序还未完成');
    for(let i=1;i<plateIngredients(steak.recipe).length;i++){click('.craft-primary');tick(800);}
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
  it('烧烤离火后火候冻结，刷酱打包完成后才能交付',()=>{
    const {cfg}=start('stall_street_night');prepare(cfg);tick(4200);click('.craft-flip');tick(3400);click('.craft-primary');
    const heat=target.querySelector('.craft-gauge b')?.textContent;
    tick(10000);expect(target.querySelector('.craft-gauge b')?.textContent).toBe(heat);
    click('.rg-ing-controls .action');expect(target.querySelector('.work-notice')?.textContent).toContain('工序还未完成');
    click('.craft-primary');tick(2000);click('.rg-ing-controls .action');
    expect(target.querySelector('.work-notice')?.textContent).toContain('出餐成功');
  });
});
