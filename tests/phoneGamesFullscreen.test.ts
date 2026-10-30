// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync,tick} from 'svelte';
import PhoneGameApp from '../src/components/PhoneGameApp.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/audio',()=>({beginMinigameMusic:()=>()=>{}}));
let component:ReturnType<typeof mount>|undefined,target:HTMLElement;
const games=[{id:'snake',name:'贪吃蛇',icon:'🐍',desc:'吃到20个食物'},{id:'2048',name:'2048',icon:'🎯',desc:'合成2048'}];
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);uiState.modal='phone';uiState.confirmRequest=null;target=document.createElement('div');document.body.append(target);component=mount(PhoneGameApp,{target,props:{installedGames:games}});flushSync();vi.advanceTimersByTime(1);flushSync();});
afterEach(async()=>{if(component)await unmount(component);target.remove();uiState.modal=null;vi.useRealTimers();vi.restoreAllMocks();});
function click(selector:string){document.querySelector<HTMLButtonElement>(selector)!.click();flushSync();}
describe('手机游戏全屏宿主的状态与清理',()=>{
 it('打开的游戏挂到页面全屏层，按Esc回到游戏列表且清理游戏计时器',async()=>{
  click('.job-item');expect(document.body.querySelector(':scope > .phone-game-full')?.getAttribute('aria-label')).toBe('手机游戏 · 贪吃蛇');expect(target.querySelector('.phone-game-full')).toBeNull();
  click('.sn-btn');vi.advanceTimersByTime(140);flushSync();expect(vi.getTimerCount()).toBe(1);
  const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});window.dispatchEvent(event);flushSync();await tick();vi.advanceTimersByTime(1);
  expect(document.querySelector('.phone-game-full')).toBeNull();expect(vi.getTimerCount()).toBe(0);expect(uiState.modal).toBe('phone');expect(target.textContent).toContain('已安装游戏');
 });
 it('暂停保留棋盘并停止时钟，继续后恢复同一局；返回列表不留下遮罩',async()=>{
  click('.job-item');click('.sn-btn');vi.advanceTimersByTime(140);flushSync();
  const before=document.querySelector('.sn-board')?.innerHTML;click('button[aria-label="暂停手机游戏"]');expect(vi.getTimerCount()).toBe(0);vi.advanceTimersByTime(2000);flushSync();expect(document.querySelector('.sn-board')?.innerHTML).toBe(before);
  click('button[aria-label="继续手机游戏"]');expect(vi.getTimerCount()).toBe(1);expect(document.querySelector('.sn-board')?.innerHTML).toBe(before);
  click('button[aria-label="返回手机游戏列表"]');await tick();expect(vi.getTimerCount()).toBe(0);expect(document.querySelector('.pg-paused')).toBeNull();
 });
 it('外层手机卸载时删除全屏节点与按键监听',async()=>{
  click('.job-item');click('.sn-btn');await unmount(component!);component=undefined;vi.advanceTimersByTime(1);
  expect(document.querySelector('.phone-game-full')).toBeNull();expect(vi.getTimerCount()).toBe(0);
  const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
 });
});
