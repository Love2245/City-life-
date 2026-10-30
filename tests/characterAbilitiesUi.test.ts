// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AttributeSidebar from '../src/components/layout/AttributeSidebar.svelte';
import CharacterAbilities from '../src/components/CharacterAbilities.svelte';
import { createInitialState } from '../src/game/core/state';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState } from '../src/stores/uiStore.svelte';

const mounted: ReturnType<typeof mount>[] = [];
let host: HTMLElement;
function render(Component: any, props: any = {}) { const node = document.createElement('main'); host.append(node); mounted.push(mount(Component, {target: node, props})); flushSync(); return node; }
function open(node: HTMLElement) { const button = node.querySelector<HTMLButtonElement>('.ability-entry')!; button.click(); flushSync(); return button; }
beforeAll(() => { window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any; });
beforeEach(() => { replaceState(createInitialState(149565)); uiState.gameMode = 'pc'; host = document.createElement('div'); host.className = 'app-zoom'; document.body.append(host); });
afterEach(async () => { for (const component of mounted.splice(0)) await unmount(component); host.remove(); uiState.gameMode = 'pc'; });

describe('统一能力与技能入口', () => {
  it('侧栏仅保留一个入口，实际详情完整展示四项属性和八项技能', async () => {
    const root = render(AttributeSidebar); expect(root.querySelectorAll('.ability-entry')).toHaveLength(1); expect(root.querySelector('.skill-dots')).toBeNull();
    open(root); const dialog = host.querySelector('[role="dialog"]')!; expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelectorAll('[data-ability]')).toHaveLength(12); expect(dialog.querySelectorAll('[data-ability] .ability-meter[aria-valuemax="100"]')).toHaveLength(4); expect(dialog.querySelectorAll('[data-ability] .ability-meter[aria-valuemax="10"]')).toHaveLength(8);
    expect(root.contains(dialog)).toBe(false); expect(host.contains(dialog)).toBe(true);
    (dialog.querySelector('[aria-label="关闭能力与技能"]') as HTMLButtonElement).click(); flushSync(); expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('属性装备解释、技能零级与满级均正确显示，查看详情不改动存档或时间', () => {
    gameState.player.skills.programming = 10; gameState.player.skills.driving = 0; gameState.player.skills.cooking = 2.5;
    const before = JSON.stringify(gameState), root = render(CharacterAbilities); open(root);
    expect(host.querySelector('[data-ability="programming"]')?.textContent).toContain('Lv.10/10'); expect(host.querySelector('[data-ability="driving"]')?.textContent).toContain('Lv.0/10'); expect(host.querySelector('[data-ability="cooking"]')?.textContent).toContain('Lv.2.5/10');
    expect(host.querySelector('[data-ability="intelligence"]')?.textContent).toContain('基础'); expect(JSON.stringify(gameState)).toBe(before);
    gameState.player.skills.programming = 1.99; flushSync(); expect(host.querySelector('[data-ability="programming"]')?.textContent).toContain('Lv.1.99/10');
  });
  it('手游和3D紧凑入口使用同一详情，Escape关闭并恢复焦点，重开后读取最新技能', async () => {
    uiState.gameMode = 'pe'; const root = render(CharacterAbilities, {compact: true}); expect(root.querySelector('.ability-summary')).toBeNull();
    const button = open(root); await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭能力与技能');
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})); flushSync(); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button);
    gameState.player.skills.programming = 4; open(root); expect(host.querySelector('[data-ability="programming"]')?.textContent).toContain('Lv.4/10');
  });
  it('卸载时清理浮层和键盘拦截，不留下阻挡后续游戏的遮罩', async () => {
    const root = render(CharacterAbilities); open(root); expect(host.querySelector('.ability-overlay')).not.toBeNull(); await unmount(mounted.pop()!); expect(host.querySelector('.ability-overlay')).toBeNull();
    const event = new KeyboardEvent('keydown', {key: 'Tab', cancelable: true}); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  });
});
