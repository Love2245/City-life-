// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Overlay from '../src/components/layout/TransitionOverlay.svelte';
import { beginSceneLoading, cancelSceneLoading } from '../src/stores/sceneLoading.svelte';
import {LOADING_TIPS} from '../src/game/data/loadingTips';

let target: HTMLDivElement, component: ReturnType<typeof mount>;
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  target = document.createElement('div'); document.body.append(target);
  component = mount(Overlay, { target });
});
afterEach(async () => { await unmount(component); cancelSceneLoading(); target.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('rotates four editable tips from the painted cover, then keeps the group feedback visible across slow updates and resets on a new load', async () => {
  vi.useFakeTimers();
  const request={sceneKey:'tips:first',regionId:'downtown',label:'住宅',kind:'3d' as const,time:'day' as const,weather:'sunny' as const};
  const task=beginSceneLoading(request);flushSync();let covered=false;void task.covered.then(value=>covered=value);
  for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(50);flushSync();}
  const tip=()=>target.querySelector('[data-loading-tip]');
  expect(covered,'Cover should paint before the tip clock starts; timers='+vi.getTimerCount()).toBe(true);
  expect(tip()?.getAttribute('data-loading-tip')).toBe('0');
  const shown=[tip()?.querySelector('span:last-child')?.textContent];
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(tip()?.getAttribute('data-loading-tip')).toBe('1');
  shown.push(tip()?.querySelector('span:last-child')?.textContent);
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(tip()?.getAttribute('data-loading-tip')).toBe('2');
  shown.push(tip()?.querySelector('span:last-child')?.textContent);
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(tip()?.getAttribute('data-loading-tip')).toBe('3');
  shown.push(tip()?.querySelector('span:last-child')?.textContent);
  expect(new Set(shown).size).toBe(4);expect(shown.every(text=>(LOADING_TIPS as readonly string[]).includes(text!))).toBe(true);
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(tip()?.getAttribute('data-loading-tip')).toBe('long-wait');
  expect(target.textContent).toContain('预计加载时间可能较长');expect(tip()?.textContent).not.toContain('1125965732');
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(tip()?.textContent).toContain('1125965732');
  await vi.advanceTimersByTimeAsync(7000);flushSync();expect(tip()?.getAttribute('data-loading-tip')).toBe('feedback');
  expect(target.textContent).toContain('预计加载时间可能较长');
  expect(tip()?.getAttribute('data-loading-tip')).toBe('feedback');
  task.cancel();beginSceneLoading({...request,sceneKey:'tips:second',regionId:'boyue',weather:'rain'});flushSync();
  expect(tip()?.getAttribute('data-loading-tip')).toBe('0');
  for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(50);flushSync();}expect(tip()?.getAttribute('data-loading-tip')).toBe('0');
  vi.setSystemTime(Date.now()+15000);await vi.advanceTimersByTimeAsync(3000);flushSync();
  expect(tip()?.getAttribute('data-loading-tip')).toBe('feedback');
});

it('shows failure recovery immediately but waits until fifteen seconds for the group request',async()=>{
  vi.useFakeTimers();const retry=vi.fn();const task=beginSceneLoading({sceneKey:'tips:failure-clock',regionId:'downtown',label:'住宅',kind:'3d',time:'day',weather:'sunny',retry});flushSync();
  for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(50);flushSync();}
  await vi.advanceTimersByTimeAsync(1000);task.fail('资源无法载入');flushSync();
  expect(target.textContent).toContain('资源无法载入');expect(target.querySelector('.retry')).not.toBeNull();expect(target.textContent).not.toContain('1125965732');
  await vi.advanceTimersByTimeAsync(11000);flushSync();expect(target.querySelector('[data-loading-tip]')?.getAttribute('data-loading-tip')).toBe('long-wait');expect(target.textContent).not.toContain('1125965732');
  await vi.advanceTimersByTimeAsync(3000);flushSync();expect(target.textContent).toContain('1125965732');
});

it('keeps the chosen tip when the same loading task changes its recovery state',async()=>{
  vi.useFakeTimers();const task=beginSceneLoading({sceneKey:'tips:stable',regionId:'downtown',label:'住宅',kind:'3d',time:'day',weather:'sunny'});flushSync();
  for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(50);flushSync();}
  const first=target.querySelector('[data-loading-tip] span:last-child')?.textContent;
  await vi.advanceTimersByTimeAsync(1000);task.ready();flushSync();
  await vi.advanceTimersByTimeAsync(1400);flushSync();
  expect(target.querySelector('[data-loading-phase="leaving"]')).not.toBeNull();
  expect(target.querySelector('[data-loading-tip] span:last-child')?.textContent).toBe(first);
});

it('keeps overlay keyboard events away from the game window shortcuts and traps Tab without blocking recovery clicks', () => {
  const retry = vi.fn(), fallback = vi.fn(), shortcut = vi.fn();
  const task = beginSceneLoading({ sceneKey: '3d:test', regionId: 'boyue', label: '测试场景', kind: '3d',
    time: 'night', weather: 'rain', retry, fallback });
  task.fail('资源暂不可用'); flushSync();
  const panel = target.querySelector<HTMLElement>('[data-scene-loading-overlay]')!;
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button')];
  window.addEventListener('keydown', shortcut);
  try {
    panel.focus();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(shortcut).not.toHaveBeenCalled();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    panel.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true); expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus(); buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].click(); buttons[1].click();
    expect(retry).toHaveBeenCalledOnce(); expect(fallback).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('keydown', shortcut); }
});
