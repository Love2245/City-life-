// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { completeWork } from '../src/game/core/jobs';
import { createInitialState } from '../src/game/core/state';
import { getAction, performAction, visibleActionsAtLocation } from '../src/game/core/actions';
import { configuredMiniGameKeys, getMiniGameConfig, getMiniGameConfigFor, mainSkillOfMiniGame } from '../src/game/core/minigame';
import { hasWorkerDormStay } from '../src/game/core/residence';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { presentJobResult, uiState } from '../src/stores/uiStore.svelte';
import MiniGameModal from '../src/components/layout/MiniGameModal.svelte';
import ArcadeView from '../src/views/ArcadeView.svelte';

const cases = [
  ['steel_shift', 'steel_factory', 'steel', 180, 10],
  ['aluminum_recycle_shift', 'aluminum_factory', 'aluminum', 175, 10],
  ['glass_quality_shift', 'glass_factory', 'glass', 150, 10],
] as const;
const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any;
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  globalThis.requestAnimationFrame ??= (callback => window.setTimeout(() => callback(performance.now()), 16));
  globalThis.cancelAnimationFrame ??= (id => window.clearTimeout(id));
});

afterEach(() => {
  for (const item of mounted.splice(0)) { unmount(item.component); item.target.remove(); }
  uiState.modal = null;
  uiState.minigamePayload = null;
  uiState.resultPayload = null;
  uiState.pendingEvent = null;
  replaceState(createInitialState(1));
  vi.restoreAllMocks();
});

function render(component: typeof MiniGameModal | typeof ArcadeView) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push({ component: mount(component, { target }), target });
  flushSync();
  return target;
}

function prepare(location: string) {
  const state = createInitialState(1475);
  state.locationId = location;
  state.region = 'heavy_industry';
  state.flags.route_heavy_industry = true;
  state.time.hour = 8;
  state.player.attrs.health = 100;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  state.player.attrs.hygiene = 100;
  state.player.stats.intelligence = 100;
  state.player.skills.operation = 2;
  state.weather = { id: 'sunny', lastRollDay: 0 };
  replaceState(state);
}

describe('重工业三厂使用真实行动入口接入工厂小游戏', () => {
  it.each(cases)('%s 配置与岗位同名，使用 operation 技能缩放且保留厂类型', (id, location, workshop) => {
    prepare(location);
    const action = getAction(id)!;
    const cfg = getMiniGameConfig(id);
    expect(cfg).toMatchObject({ type: 'factory', workshop, title: action.name, timeLimit: 30, productsToWin: 5, perfectBonusRate: .05 });
    expect(cfg?.type === 'factory' && cfg.parts.length).toBeGreaterThanOrEqual(2);
    expect(cfg?.type === 'factory' && cfg.parts.length).toBeLessThanOrEqual(3);
    expect(visibleActionsAtLocation(gameState, location).map(a => a.id)).toContain(id);
    expect(mainSkillOfMiniGame(id)).toBe('operation');
    gameState.player.skills.operation = 7;
    expect(getMiniGameConfigFor(gameState, id)).toMatchObject({ type: 'factory', workshop, timeLimit: 15, productsToWin: 3 });
    expect(getMiniGameConfig(id)).toMatchObject({ timeLimit: 30, productsToWin: 5 });
  });

  it.each(cases)('%s 完成真实班次后才发工资、记录和工人宿舍资格', (id, location, _workshop, _basePay, hours) => {
    prepare(location);gameState.economy.priceIndex=1.1;gameState.flags.skill_certificate_level=1;
    const money=gameState.player.money;const result=performAction(gameState,id);
    expect(result.ok,result.reason).toBe(true);expect(gameState.player.money).toBe(money);expect(gameState.time.hour).toBe(8);
    const session=gameState.work!.active!;expect(session.jobId).toBe(id);expect(hasWorkerDormStay(gameState)).toBe(false);
    presentJobResult(result.result,getMiniGameConfigFor(gameState,id),getAction(id));
    expect(uiState.minigamePayload?.sessionId).toBe(session.id);
    expect(completeWork(gameState,session.id,1).ok).toBe(true);expect(gameState.time.hour).toBe(8+hours);
    expect(gameState.player.money).toBeGreaterThan(money);expect(gameState.weekly.jobsDone).toBe(1);expect(gameState.career.experience?.operation).toBe(1);expect(hasWorkerDormStay(gameState)).toBe(true);
    const paid=gameState.player.money;expect(completeWork(gameState,session.id,1).ok).toBe(false);expect(gameState.player.money).toBe(paid);expect(performAction(gameState,id).ok).toBe(false);
  });
  it.each(cases)('%s 暂停之后明确放弃班次，零分无工资和宿舍奖励', (id,location) => {
    prepare(location);const started=performAction(gameState,id);presentJobResult(started.result,getMiniGameConfigFor(gameState,id),getAction(id));
    const cash=gameState.player.money;const target=render(MiniGameModal);
    target.querySelector<HTMLButtonElement>('.mg-close')!.click();flushSync();
    const end=[...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('提前结束'))!;
    expect(end).toBeTruthy();end.click();flushSync();expect(gameState.player.money).toBe(cash);
    expect(gameState.time.hour).toBe(18);expect(gameState.weekly.jobsDone).toBe(0);expect(hasWorkerDormStay(gameState)).toBe(false);expect(uiState.modal).toBe('result');
  });

  it('独立小游戏按 factory 类型自动包含三厂，打开列表不改存档', () => {
    prepare('steel_factory');
    const stateBefore = JSON.stringify(gameState);
    const target = render(ArcadeView);
    const group = Array.from(target.querySelectorAll('.arcade-group'))
      .find(section => section.querySelector('.arcade-group-head')?.textContent?.includes('工厂分拣'))!;
    expect(group).toBeDefined();
    for (const [id] of cases) {
      expect(configuredMiniGameKeys()).toContain(id);
      expect(group.textContent).toContain(getAction(id)!.name);
    }
    expect(JSON.stringify(gameState)).toBe(stateBefore);
  });
});
