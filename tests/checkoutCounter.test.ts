// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CheckoutGame from '../src/components/layout/minigames/CheckoutGame.svelte';
import type { CheckoutCfg } from '../src/game/core/minigame';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn()}));
let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
function start(overrides: Partial<CheckoutCfg>={},paused=false){
  vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.1);vi.spyOn(document,'hidden','get').mockReturnValue(false);
  target=document.createElement('div');document.body.appendChild(target);
  const cfg: CheckoutCfg={type:'checkout',title:'收银找零',icon:'',desc:'',lives:3,customers:2,minBasket:3,maxBasket:3,patienceMs:1,timeLimit:30,notes:[1,5,10,20,50,100],items:[{id:'cola',name:'可乐',icon:'',price:3.5}],...overrides};
  const finish=vi.fn();component=mount(CheckoutGame,{target,props:{cfg,paused,onFinish:finish}});flushSync();return finish;
}
function click(selector:string){target.querySelector<HTMLButtonElement>(selector)!.click();flushSync();}
function key(value:string){const button=[...target.querySelectorAll<HTMLButtonElement>('.register-key')].find(x=>x.textContent===value)!;button.click();flushSync();}
function scan(){for(const button of [...target.querySelectorAll<HTMLButtonElement>('.checkout-product:not(.scanned)')]){button.click();flushSync();}}
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();vi.restoreAllMocks();vi.useRealTimers();});
describe('收银台完整交互与动画并发',()=>{
  it('快速扫码只计价一次，动画尚未结束也能付款，正确找零后下一位能完整结账',()=>{
    const finish=start();const first=target.querySelector<HTMLButtonElement>('.checkout-product')!;first.click();flushSync();first.click();flushSync();scan();
    expect(target.querySelector('.receipt-total b')!.textContent).toBe('¥10.50');
    expect(target.querySelectorAll('.scan-flight')).toHaveLength(3);expect(target.querySelector('.checkout-shop')!.getAttribute('data-stage')).toBe('pay');
    key('9');key('.');key('5');key('0');click('.change-submit');
    expect(finish).not.toHaveBeenCalled();expect(target.querySelector('.printed-ticket')!.textContent).toContain('找零 ¥9.50');
    expect(target.querySelector('.guest-speech small')!.textContent).toBe('第 2 位顾客');
    scan();key('9');key('.');key('5');click('.change-submit');expect(finish).toHaveBeenCalledExactlyOnceWith(1);
    expect(target.querySelector('.receipt-heading span')!.textContent).toBe('NO. 002');
    vi.advanceTimersByTime(40000);flushSync();expect(finish).toHaveBeenCalledTimes(1);
  });
  it('找零有误仍扣一次机会并切换顾客；分数只包含实际接待的顾客',()=>{
    const finish=start();scan();key('1');click('.change-submit');expect(target.querySelectorAll('.service-hearts .lost')).toHaveLength(1);
    expect(target.querySelector('.checkout-feedback')!.textContent).toContain('找零有误');scan();key('9');key('.');key('5');click('.change-submit');expect(finish).toHaveBeenCalledExactlyOnceWith(.5);
  });
  it('清空、小数与删除键正常工作，小数保留两位',()=>{
    start();scan();key('9');key('.');key('5');key('0');key('1');expect(target.querySelector('output')!.textContent).toBe('9.50');key('⌫');expect(target.querySelector('output')!.textContent).toBe('9.5');click('.clear-key');expect(target.querySelector('output')!.textContent).toBe('0');expect(target.querySelector<HTMLButtonElement>('.change-submit')!.disabled).toBe(true);
  });
  it('时限仍按配置结束一次，未完成顾客不算成功',()=>{
    const finish=start({timeLimit:2});vi.advanceTimersByTime(2000);flushSync();expect(finish).toHaveBeenCalledExactlyOnceWith(0);expect(target.querySelector('.checkout-shop')!.getAttribute('data-stage')).toBe('done');vi.advanceTimersByTime(10000);expect(finish).toHaveBeenCalledTimes(1);
  });
  it('外部暂停和页面隐藏时不消耗耐心或计时',()=>{
    const finish=start({timeLimit:2},true);vi.advanceTimersByTime(8000);flushSync();expect(finish).not.toHaveBeenCalled();expect(target.querySelector('.customer-patience b')!.textContent).toBe('100%');expect(target.querySelector<HTMLButtonElement>('.checkout-product')!.disabled).toBe(true);
  });
  it('页面隐藏时保留当前操作，返回后继续计时',()=>{
    const finish=start({timeLimit:2});vi.spyOn(document,'hidden','get').mockReturnValue(true);vi.advanceTimersByTime(8000);flushSync();expect(finish).not.toHaveBeenCalled();vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.advanceTimersByTime(2000);flushSync();expect(finish).toHaveBeenCalledExactlyOnceWith(0);
  });
});
