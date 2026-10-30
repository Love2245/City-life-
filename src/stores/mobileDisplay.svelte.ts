/** Device display preferences stay outside character saves. Values are physical CSS pixels. */
const KEY = 'urban-life-mobile-insets-v1';
const DEFAULT_EDGE = 8;
const DEFAULT_BOTTOM = 8;
function bounded(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(80, Math.round(value))) : fallback;
}
export const mobileDisplay = $state({ edge: DEFAULT_EDGE, bottom: DEFAULT_BOTTOM, fullscreen: false, fullscreenSupported: false, nativeManaged: false });
let fullscreenAttempted = false;
let fullscreenPending = false;
const insetSides = ['top','right','bottom','left'] as const;

/** Native safe areas are viewport pixels, separate from the player's extra margin. */
function applyNativeInsets(value:unknown):void {
  if(!value||typeof value!=='object')return;
  const insets=value as Record<string,unknown>;
  if(!insetSides.every(side=>typeof insets[side]==='number'&&Number.isFinite(insets[side])&&Number(insets[side])>=0&&Number(insets[side])<=200))return;
  for(const side of insetSides)document.documentElement.style.setProperty('--native-safe-'+side,insets[side]+'px');
}

function applyInsets(persist = true): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--mobile-edge-padding', `${mobileDisplay.edge}px`);
  document.documentElement.style.setProperty('--mobile-bottom-padding', `${mobileDisplay.bottom}px`);
  if (persist) try { localStorage.setItem(KEY, JSON.stringify({ edge: mobileDisplay.edge, bottom: mobileDisplay.bottom })); } catch { /* Keep the session preference. */ }
}
export function setMobileEdge(value: number): void { mobileDisplay.edge = bounded(value, DEFAULT_EDGE); applyInsets(); }
export function setMobileBottom(value: number): void { mobileDisplay.bottom = bounded(value, DEFAULT_BOTTOM); applyInsets(); }
export function resetMobileInsets(): void { mobileDisplay.edge = DEFAULT_EDGE; mobileDisplay.bottom = DEFAULT_BOTTOM; applyInsets(); }

type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
function fullscreenDocument(): FullscreenDocument { return document as FullscreenDocument; }
function updateFullscreen(): void {
  mobileDisplay.fullscreen = !!(document.fullscreenElement || fullscreenDocument().webkitFullscreenElement);
}
export function initializeMobileDisplay(options: { shouldEnterFullscreen?: () => boolean } = {}): () => void {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    mobileDisplay.edge = bounded(saved?.edge, DEFAULT_EDGE);
    mobileDisplay.bottom = bounded(saved?.bottom, DEFAULT_BOTTOM);
  } catch { mobileDisplay.edge = DEFAULT_EDGE; mobileDisplay.bottom = DEFAULT_BOTTOM; }
  applyInsets(false);
  // Older Android WebViews don't forward cutouts through CSS env(). The native
  // surface still fills the screen; the bridge reports margins for web controls.
  const displayBridge=(window as Window & {UrbanLifeDisplay?:{getInsets:()=>string}}).UrbanLifeDisplay;
  try{if(displayBridge)applyNativeInsets(JSON.parse(displayBridge.getInsets()));}catch{/* Browser env() remains the fallback. */}
  const onNativeInsets=(event:Event)=>applyNativeInsets((event as CustomEvent).detail);
  window.addEventListener('urban-life-display-insets',onNativeInsets);
  const root = document.documentElement as FullscreenRoot;
  mobileDisplay.fullscreenSupported = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
  // Android's activity owns immersive system bars; do not layer WebView fullscreen on it.
  mobileDisplay.nativeManaged = '__TAURI_INTERNALS__' in window && /Android/i.test(navigator.userAgent);
  updateFullscreen();
  fullscreenAttempted = mobileDisplay.fullscreen;
  const onPlayGesture = (event: Event): void => {
    if (!event.isTrusted || fullscreenAttempted || mobileDisplay.nativeManaged || !mobileDisplay.fullscreenSupported || !options.shouldEnterFullscreen?.()) return;
    if (event instanceof KeyboardEvent && (event.repeat || !['Enter', ' '].includes(event.key))) return;
    // Request synchronously within user activation, once per visit. A manual exit stays exited.
    void enterMobileFullscreen();
  };
  document.addEventListener('fullscreenchange', updateFullscreen);
  document.addEventListener('webkitfullscreenchange', updateFullscreen);
  window.addEventListener('click', onPlayGesture);
  window.addEventListener('keydown', onPlayGesture);
  return () => {
    window.removeEventListener('urban-life-display-insets',onNativeInsets);
    for(const side of insetSides)document.documentElement.style.removeProperty('--native-safe-'+side);
    document.removeEventListener('fullscreenchange', updateFullscreen);
    document.removeEventListener('webkitfullscreenchange', updateFullscreen);
    window.removeEventListener('click', onPlayGesture);
    window.removeEventListener('keydown', onPlayGesture);
  };
}

/** Called during a trusted play gesture or the player's fullscreen button. */
export async function enterMobileFullscreen(): Promise<boolean> {
  fullscreenAttempted = true;
  updateFullscreen();
  if (mobileDisplay.fullscreen) return true;
  if (fullscreenPending || mobileDisplay.nativeManaged) return false;
  const root = document.documentElement as FullscreenRoot;
  fullscreenPending = true;
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    else return false;
    updateFullscreen();
    if (mobileDisplay.fullscreen) {
      // 'landscape' permits both directions; never lock to landscape-primary.
      const orientation = typeof screen === 'undefined' ? undefined : screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
      try { await orientation?.lock?.('landscape'); } catch { /* Rotation remains controlled by the host. */ }
    }
    return mobileDisplay.fullscreen;
  } catch { return false; }
  finally { fullscreenPending = false; updateFullscreen(); }
}

export async function toggleMobileFullscreen(): Promise<boolean> {
  fullscreenAttempted = true;
  if (fullscreenPending) return false;
  updateFullscreen();
  if (!mobileDisplay.fullscreen) return enterMobileFullscreen();
  const doc = fullscreenDocument();
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    updateFullscreen();
    return !mobileDisplay.fullscreen;
  } catch { return false; }
}
