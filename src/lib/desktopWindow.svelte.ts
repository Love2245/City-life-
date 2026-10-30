import type { Window as TauriWindow } from '@tauri-apps/api/window';

export type DesktopWindowMode = 'windowed' | 'borderless';
const MODE_KEY = 'urban-life-desktop-window-mode';
export const desktopWindowState = $state({ available: false, mode: 'windowed' as DesktopWindowMode, busy: false });
let current: TauriWindow | undefined;
let switching: Promise<void> = Promise.resolve();

/** Both source and built windows report ready; built windows also receive focus without HMR. */
export function connectDesktopLauncher(options: { pollFocus: boolean; onFocus: () => Promise<void>; onError: (message: string) => void }): () => void {
  let focusTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  void fetch('/__urban_life_desktop').then(r => r.ok ? r.json() : null).then(data => {
    if (disposed || !data?.projectId) return;
    if (options.pollFocus) {
      let focusRequest = data.focusRequest ?? 0;
      focusTimer = setInterval(() => {
        void fetch('/__urban_life_desktop').then(r => r.ok ? r.json() : null).then(next => {
          if (disposed || next?.projectId !== data.projectId || next.focusRequest === focusRequest) return;
          focusRequest = next.focusRequest;
          void options.onFocus().catch(error => options.onError(String(error)));
        }).catch(() => {});
      }, 1000);
    }
    return fetch('/__urban_life_desktop/ready', { method: 'POST', headers: { 'x-urban-life-launcher': data.projectId } });
  }).catch(() => {});
  return () => { disposed = true; clearInterval(focusTimer); };
}

export async function setDesktopWindowMode(mode: DesktopWindowMode): Promise<void> {
  if (!current || !desktopWindowState.available) return;
  if (mode !== 'windowed' && mode !== 'borderless') throw new Error('无效的窗口模式');
  switching = switching.catch(() => {}).then(async () => {
    desktopWindowState.busy = true;
    try {
      await current!.setFullscreen(mode === 'borderless');
      desktopWindowState.mode = await current!.isFullscreen() ? 'borderless' : 'windowed';
      try { localStorage.setItem(MODE_KEY, desktopWindowState.mode); } catch { /* The live setting still works. */ }
    } finally { desktopWindowState.busy = false; }
  });
  return switching;
}

/**
 * Ask the native window to close. Tauri raises the same close-requested event as the
 * window's own X button, so the quit control reuses the existing save-before-close path.
 */
export async function requestWindowClose(): Promise<void> {
  if (!current) return;
  await current.close();
}

let quitInProgress = false;
let closeSettled = false;

/**
 * Quit from the in-game power button: the player already confirmed in-app, so a failing
 * autosave exits immediately instead of surfacing a retry prompt. If the close-requested
 * chain ever stalls, a bounded wait plus destroy() guarantees the window cannot trap the
 * player. The wait is long enough for a normal JSON autosave to finish first.
 */
export async function quitDesktopWindow(): Promise<void> {
  if (!current || quitInProgress) return;
  quitInProgress = true;
  closeSettled = false;
  try {
    try { await current.close(); } catch { /* the window may already be gone */ }
    const deadline = Date.now() + 8000;
    while (!closeSettled && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    try { await current!.destroy(); } catch { /* already closed */ }
  } finally {
    quitInProgress = false;
    closeSettled = false;
  }
}

/** Each App mount owns its listeners, including Vite HMR and native close events. */
export async function initializeDesktopWindow(options: { saveBeforeClose: () => Promise<void>; onError: (message: string) => void }): Promise<() => void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return () => {};
  const { invoke } = await import('@tauri-apps/api/core');
  if (await invoke<string>('desktop_platform') !== 'windows') return () => {};
  const { getCurrentWindow, currentMonitor, LogicalSize } = await import('@tauri-apps/api/window');
  current = getCurrentWindow();
  desktopWindowState.available = true;
  const monitor = await currentMonitor().catch(() => null);
  try {
    if (monitor) {
      const width = Math.max(320, Math.floor(monitor.workArea.size.width / monitor.scaleFactor) - 24);
      const height = Math.max(240, Math.floor(monitor.workArea.size.height / monitor.scaleFactor) - 48);
      await current.setMinSize(new LogicalSize(Math.min(960, width), Math.min(640, height)));
      const size = await current.innerSize();
      if (size.width / monitor.scaleFactor > width || size.height / monitor.scaleFactor > height) {
        await current.setSize(new LogicalSize(Math.min(1280, width), Math.min(800, height))); await current.center();
      }
    }
    const saved = (() => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } })();
    await setDesktopWindowMode(saved === 'borderless' ? 'borderless' : 'windowed');
  } catch (error) {
    // Geometry and display mode are cosmetic. A rejected window call must never stop
    // startup, block the ready report, or leave the launcher waiting forever.
    console.warn('[desktopWindow] 窗口显示设置失败', error);
  }
  const focus = async () => { await current?.unminimize(); await current?.setFocus(); };
  const keyboard = (event: KeyboardEvent) => {
    if (event.repeat || !(event.key === 'F11' || event.altKey && event.key === 'Enter')) return;
    event.preventDefault();
    void setDesktopWindowMode(desktopWindowState.mode === 'windowed' ? 'borderless' : 'windowed').catch(error => options.onError(String(error)));
  };
  window.addEventListener('keydown', keyboard);
  let closing = false, approved = false, declined = 0;
  const unlisten = await current.onCloseRequested(async event => {
    if (approved) return;
    event.preventDefault(); if (closing) return; closing = true;
    try { await options.saveBeforeClose(); approved = true; closeSettled = true; await current!.close(); }
    catch (error) {
      closing = false; declined += 1;
      const message = error instanceof Error ? error.message : String(error);
      // A failed autosave must never trap the player in an unclosable window.
      // The first failure reports it; the second attempt exits regardless.
      // A confirmed in-app quit already carries that consent, so it exits at once.
      if (quitInProgress || declined >= 2) { approved = true; closeSettled = true; await current!.close(); return; }
      options.onError(`${message}（再次关闭将直接退出，未保存的进度会丢失）`);
    }
  });
  const beforeReload = () => { void options.saveBeforeClose().catch(error => options.onError(String(error))); };
  if (import.meta.hot) {
    import.meta.hot.on('urban-life:focus', focus);
    import.meta.hot.on('vite:beforeFullReload', beforeReload);
  }
  // Outside the HMR guard on purpose: the desktop runner also serves the built bundle,
  // where import.meta.hot is false and the launcher would otherwise wait for a signal
  // that never comes. Ordinary runs simply fail the fetch and ignore it.
  const stopLauncher = connectDesktopLauncher({ pollFocus: !import.meta.hot, onFocus: focus, onError: options.onError });
  return () => {
    stopLauncher();
    window.removeEventListener('keydown', keyboard); unlisten();
    // Some runtimes inject a partial hot context (no `off`); chaining keeps teardown safe.
    import.meta.hot?.off?.('urban-life:focus', focus); import.meta.hot?.off?.('vite:beforeFullReload', beforeReload);
    desktopWindowState.available = false; current = undefined;
    // A quit whose polling loop never settled (e.g. torn down by HMR mid-wait) must
    // not leave the guard latched, or the next quit attempt would no-op.
    quitInProgress = false; closeSettled = false;
  };
}
