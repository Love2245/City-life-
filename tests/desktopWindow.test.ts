// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  fullscreen: false,
  closeHandler: undefined as undefined | ((event: { preventDefault: () => void }) => Promise<void>),
  setFullscreen: vi.fn(async (_value: boolean) => {}),
  close: vi.fn(async () => {}), destroy: vi.fn(async () => {}),
  unlisten: vi.fn(), setFocus: vi.fn(async () => {}), unminimize: vi.fn(async () => {}),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => 'windows') }));
vi.mock('@tauri-apps/api/window', () => ({
  LogicalSize: class { constructor(public width: number, public height: number) {} },
  currentMonitor: vi.fn(async () => null),
  getCurrentWindow: () => ({
    setFullscreen: fake.setFullscreen, isFullscreen: async () => fake.fullscreen,
    close: fake.close, destroy: fake.destroy,
    setFocus: fake.setFocus, unminimize: fake.unminimize,
    onCloseRequested: async (handler: typeof fake.closeHandler) => { fake.closeHandler = handler; return fake.unlisten; },
  }),
}));
import { connectDesktopLauncher, desktopWindowState, initializeDesktopWindow, setDesktopWindowMode } from '../src/lib/desktopWindow.svelte';
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); fake.fullscreen = false;
  fake.setFullscreen.mockImplementation(async value => { fake.fullscreen = value; });
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
});
afterEach(() => { stop?.(); stop = undefined; delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Windows desktop controls', () => {
  it('is unavailable in an ordinary browser', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    stop = await initializeDesktopWindow({ saveBeforeClose: vi.fn(), onError: vi.fn() });
    expect(desktopWindowState.available).toBe(false);
    expect(fake.setFullscreen).not.toHaveBeenCalled();
  });
  it('defaults to windowed, persists display changes, and ignores repeated shortcut keys', async () => {
    stop = await initializeDesktopWindow({ saveBeforeClose: vi.fn(), onError: vi.fn() });
    expect(desktopWindowState.mode).toBe('windowed');
    await setDesktopWindowMode('borderless');
    expect(localStorage.getItem('urban-life-desktop-window-mode')).toBe('borderless');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', repeat: true }));
    expect(desktopWindowState.mode).toBe('borderless');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }));
    await vi.waitFor(() => expect(desktopWindowState.mode).toBe('windowed'));
  });
  it('restores the saved display mode and removes listeners at teardown', async () => {
    localStorage.setItem('urban-life-desktop-window-mode', 'borderless');
    stop = await initializeDesktopWindow({ saveBeforeClose: vi.fn(), onError: vi.fn() });
    expect(desktopWindowState.mode).toBe('borderless');
    stop(); stop = undefined;
    expect(fake.unlisten).toHaveBeenCalledOnce();
    expect(desktopWindowState.available).toBe(false);
    const calls = fake.setFullscreen.mock.calls.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
    expect(fake.setFullscreen.mock.calls).toHaveLength(calls);
  });
  it('holds close until saving finishes, then closes once', async () => {
    let settle: (() => void) | undefined;
    const save = vi.fn(() => new Promise<void>(resolve => { settle = resolve; }));
    stop = await initializeDesktopWindow({ saveBeforeClose: save, onError: vi.fn() });
    const event = { preventDefault: vi.fn() };
    const closing = fake.closeHandler!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(fake.close).not.toHaveBeenCalled();
    settle!(); await closing;
    expect(fake.close).toHaveBeenCalledOnce();
  });
  it('on the first save failure keeps the window open and explains the retry behavior', async () => {
    const error = vi.fn();
    stop = await initializeDesktopWindow({ saveBeforeClose: vi.fn(async () => { throw new Error('配额已满'); }), onError: error });
    await fake.closeHandler!({ preventDefault: vi.fn() });
    expect(fake.close).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('配额已满'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('再次关闭'));
  });
  it('restores a built-preview window on a launcher focus request and stops polling after disposal', async () => {
    vi.useFakeTimers();
    let focusRequest = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ projectId: 'isolated-check', focusRequest }) })));
    stop = connectDesktopLauncher({ pollFocus: true, onFocus: async () => { await fake.unminimize(); await fake.setFocus(); }, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    focusRequest = 1;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.unminimize).toHaveBeenCalledOnce(); expect(fake.setFocus).toHaveBeenCalledOnce();
    stop(); stop = undefined;
    focusRequest = 2;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.setFocus).toHaveBeenCalledOnce();
  });
});
