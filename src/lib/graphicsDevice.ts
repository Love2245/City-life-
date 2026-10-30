/** Graphics limits follow the physical device, independently of the chosen UI layout. */
export function isMobileGraphics():boolean {
  if(typeof navigator==='undefined')return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')
    || /Mac/i.test(navigator.platform||'')&&navigator.maxTouchPoints>1;
}

/** Bound all offscreen buffers, including explicit native/HD resolution choices. */
export const MOBILE_NATIVE_PIXEL_BUDGET=1_500_000;
