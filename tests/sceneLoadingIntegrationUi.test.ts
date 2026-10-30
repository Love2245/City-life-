// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StoreInterior from '../src/components/layout/StoreInterior.svelte';
import CafeInterior from '../src/components/layout/CafeInterior.svelte';
import ScenePanel from '../src/components/layout/ScenePanel.svelte';
import { createInitialState } from '../src/game/core/state';
import { signLease } from '../src/game/core/housing';
import { moveTo } from '../src/game/core/actions';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState, setSceneMode } from '../src/stores/uiStore.svelte';
import { sceneLoading, markLoadingCovered, cancelSceneLoading } from '../src/stores/sceneLoading.svelte';

const fake = vi.hoisted(() => ({ store: vi.fn(), cafe: vi.fn(), home: vi.fn(), still: vi.fn(),
  dispose: vi.fn(), update: vi.fn(), resolve: () => {}, reject: (_: Error) => {} }));
vi.mock('../src/lib/convenienceStore3D', () => ({ createStoreRoom: (...args: unknown[]) => {
  fake.store(...args);
  return { ready: new Promise<void>((resolve, reject) => { fake.resolve = resolve; fake.reject = reject; }),
    dispose: fake.dispose, update: fake.update, selectFacility() {} };
} }));
vi.mock('../src/lib/cafeRoom3D', () => ({ createCafeRoom: (...args: unknown[]) => {
  fake.cafe(...args);
  return { ready: Promise.resolve(), dispose: fake.dispose, update: fake.update };
} }));
// This suite owns loading/renderer lifetimes; geometry and GLB parsing have separate tests.
// Importing the original heavy renderer here can exhaust the test's 5s budget during cold parallel transforms.
vi.mock('../src/lib/homeRoom3D', () => ({
  createHomeRoom: (...args: unknown[]) => {
    fake.home(...args);
    return { ready: Promise.resolve(), dispose: fake.dispose, update: fake.update,
      setWalls() {}, setQuality() {}, setResolution() {}, select() {}, hover() {} };
  } }));

vi.mock('../src/lib/venueStill',()=>({createStoreStill:(...args:unknown[])=>{fake.still(...args);return{ready:Promise.resolve(),update(){},selectFacility(){},setResolution(){},dispose(){}};}}));

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeAll(() => {
  Element.prototype.animate = (() => {
    const animation={finished:Promise.resolve(),onfinish:null as null|(()=>void),cancel(){},play(){},pause(){}};
    queueMicrotask(()=>animation.onfinish?.());return animation;
  }) as any;
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} } as any;
  globalThis.requestAnimationFrame ??= callback => setTimeout(() => callback(performance.now()), 1) as any;
  globalThis.cancelAnimationFrame ??= id => clearTimeout(id);
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
});
beforeEach(() => {
  cancelSceneLoading(); vi.clearAllMocks();
  uiState.modal = null; uiState.npcTalk = null; uiState.npcTaskPanel = null; setSceneMode('3d');
  const state = createInitialState(20261021); state.time.hour = 12; state.locationId = 'convenience_store';
  replaceState(state);
  target = document.createElement('div'); document.body.append(target);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; cancelSceneLoading(); target.remove();
});

describe('real loading controller and scene owners', () => {
  it('covers a 3D exit before disposing its renderer, then waits for the destination map without settling time or money', async()=>{
    component=mount(ScenePanel,{target});flushSync();
    await vi.waitFor(()=>expect(sceneLoading.current?.kind).toBe('3d'));
    markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(()=>expect(fake.store).toHaveBeenCalled());fake.resolve();
    await vi.waitFor(()=>expect(sceneLoading.current).toBeNull(),{timeout:4000});
    const before={money:gameState.player.money,time:JSON.stringify(gameState.time),location:gameState.locationId};
    vi.clearAllMocks();target.querySelector<HTMLButtonElement>('[data-store-exit]')!.click();flushSync();
    const exit=sceneLoading.current!;expect(exit).toMatchObject({kind:'map',minimumMs:500});
    expect(gameState.locationId).toBe(before.location);expect(fake.dispose).not.toHaveBeenCalled();
    markLoadingCovered(exit.id);await settle();
    expect(gameState.locationId).toBe('map');expect(fake.dispose).toHaveBeenCalled();
    expect(gameState.player.money).toBe(before.money);expect(JSON.stringify(gameState.time)).toBe(before.time);
    expect(sceneLoading.current?.id).toBe(exit.id);
  });

  it('paints the cover before constructing a store, then waits for renderer ready and the minimum duration', async () => {
    component = mount(StoreInterior, { target, props: { night: false, onExit() {} } }); flushSync();
    const id = sceneLoading.current!.id;
    await settle(); expect(fake.store).not.toHaveBeenCalled();
    markLoadingCovered(id);
    await vi.waitFor(() => expect(fake.store).toHaveBeenCalledTimes(1));
    await settle(); expect(sceneLoading.current?.phase).toBe('loading');
    fake.resolve(); await settle();
    expect(sceneLoading.current?.id).toBe(id);
    await vi.waitFor(() => expect(sceneLoading.current).toBeNull(), { timeout: 4000 });
  });
  it('also gates cafe construction on the cover and ignores a cancelled pending component', async () => {
    component = mount(CafeInterior, { target, props: { night: false, linPresent: false, onNpc() {} } }); flushSync();
    const id = sceneLoading.current!.id;
    await settle(); expect(fake.cafe).not.toHaveBeenCalled();
    await unmount(component); component = undefined;
    markLoadingCovered(id); await settle();
    expect(fake.cafe).not.toHaveBeenCalled(); expect(sceneLoading.current).toBeNull();
  });
  it('offers resource-only retry and photograph recovery without charging money or advancing time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const money = gameState.player.money, time = JSON.stringify(gameState.time);
    component = mount(ScenePanel, { target }); flushSync();
    markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(() => expect(fake.store).toHaveBeenCalledTimes(1));
    fake.reject(new Error('model fetch failed')); await settle();
    expect(sceneLoading.current?.phase).toBe('failed');
    const oldId = sceneLoading.current!.id;
    sceneLoading.current!.retry!(); flushSync();
    expect(sceneLoading.current?.id).not.toBe(oldId);
    markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(() => expect(fake.store).toHaveBeenCalledTimes(2));
    sceneLoading.current!.fallback!(); flushSync();
    expect(uiState.sceneMode).toBe('2d');
    await vi.waitFor(()=>expect(sceneLoading.current?.sceneKey).toBe('2d:convenience_store'));markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(()=>expect(fake.still).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(sceneLoading.current).toBeNull(),{timeout:4000});
    expect(gameState.player.money).toBe(money); expect(JSON.stringify(gameState.time)).toBe(time);
    vi.restoreAllMocks();
  });
  it('keeps the same home mounted as its clock and weather change, and remounts a replaced same-address save', async () => {
    const state = createInitialState(20261022); state.player.money = 10000;
    signLease(state, 'old_apartment'); moveTo(state, 'old_apartment'); replaceState(state);
    component = mount(ScenePanel, { target }); flushSync();
    await vi.waitFor(() => expect(sceneLoading.current).not.toBeNull());
    const id = sceneLoading.current!.id;
    markLoadingCovered(id);
    await vi.waitFor(() => expect(fake.home, JSON.stringify({loading:sceneLoading.current,html:target.innerHTML.slice(0,900)})).toHaveBeenCalledTimes(1),{timeout:5000});
    const home = target.querySelector('.home-interior');
    gameState.time.hour++; gameState.weather.id = 'rain'; flushSync(); await settle();
    expect(fake.home).toHaveBeenCalledTimes(1);
    expect(target.querySelector('.home-interior')).toBe(home);
    expect(sceneLoading.current?.id).toBe(id);
    const replacement = JSON.parse(JSON.stringify(gameState)); replaceState(replacement); flushSync();
    await vi.waitFor(() => expect(sceneLoading.current?.id).not.toBe(id));
    markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(() => expect(fake.home).toHaveBeenCalledTimes(2));
    await vi.waitFor(()=>expect(fake.dispose).toHaveBeenCalled());
  });
});
