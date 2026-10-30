// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MiniGameModal from '../src/components/layout/MiniGameModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { deliveryParttime } from '../src/game/core/jobs';
import { getMiniGameConfigFor } from '../src/game/core/minigame';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { closeModal, presentJobResult, uiState } from '../src/stores/uiStore.svelte';

let target: HTMLElement | undefined;
let component: ReturnType<typeof mount> | undefined;

beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
});

function startDelivery() {
  const state = createInitialState(1498);
  state.flags.app_delivery = true;
  state.flags.item_bicycle = true;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  replaceState(state);
  uiState.modal = null;
  uiState.modalStack = [];
  uiState.dismissedWorkSessionId = null;
  const started = deliveryParttime(gameState);
  expect(started.ok).toBe(true);
  presentJobResult(started.result, getMiniGameConfigFor(gameState, 'job_delivery'), { id: 'job_delivery', name: '外卖骑手', icon: '🛵' });
  expect(uiState.modal).toBe('minigame');
}

afterEach(() => {
  if (component) unmount(component);
  target?.remove();
  target = undefined;
  component = undefined;
  uiState.modal = null;
  uiState.modalStack = [];
  uiState.minigamePayload = null;
  uiState.dismissedWorkSessionId = null;
  replaceState(createInitialState(1));
});

describe('班次与小游戏载荷失配时的安全出口', () => {
  it('活动班次已消失时，右上角仍能关闭失效的小游戏', () => {
    startDelivery();
    gameState.work!.active = undefined;
    target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(MiniGameModal, { target });
    flushSync();
    const before = JSON.stringify({ player: gameState.player, time: gameState.time });
    target.querySelector<HTMLButtonElement>('.mg-close')!.click();
    flushSync();
    expect(uiState.modal).toBeNull();
    expect(uiState.minigamePayload).toBeNull();
    expect(JSON.stringify({ player: gameState.player, time: gameState.time })).toBe(before);
  });

  it('按 Esc 关闭旧小游戏时不暂停不同 ID 的新班次', () => {
    startDelivery();
    const active = gameState.work!.active!;
    active.id = 'another-work-session';
    expect(active.status).toBe('playing');
    target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(MiniGameModal, { target });
    flushSync();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(active.status).toBe('playing');
    expect(uiState.dismissedWorkSessionId).toBeNull();
    expect(uiState.modal).toBeNull();
    expect(uiState.minigamePayload).toBeNull();
  });

  it('通用关闭仍暂停与载荷相同的班次', () => {
    startDelivery();
    const active = gameState.work!.active!;
    closeModal();
    expect(active.status).toBe('paused');
    expect(uiState.dismissedWorkSessionId).toBe(active.id);
    expect(uiState.modal).toBeNull();
  });
});
