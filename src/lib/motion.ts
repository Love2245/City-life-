export type MotionToken = "--dur-fast" | "--dur-base" | "--dur-scene";
export type MotionEasingToken = "--ease-out" | "--ease-in-out";

const FALLBACK_MS: Record<MotionToken, number> = {
  "--dur-fast": 140,
  "--dur-base": 240,
  "--dur-scene": 320,
};

const FALLBACK_EASING: Record<MotionEasingToken, [number, number, number, number]> = {
  "--ease-out": [0.22, 1, 0.36, 1],
  "--ease-in-out": [0.4, 0, 0.2, 1],
};

function bezierComponent(t: number, p1: number, p2: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
}

/** Resolve a CSS motion token for Svelte transitions, while honoring reduced motion. */
export function motionDurationMs(token: MotionToken): number {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return 0.01;
  }
  if (typeof document === "undefined") return FALLBACK_MS[token];

  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration)) return FALLBACK_MS[token];
  return value.endsWith("s") && !value.endsWith("ms") ? duration * 1000 : duration;
}

/** Convert a CSS cubic-bezier token into the easing function expected by Svelte transitions. */
export function motionEasing(token: MotionEasingToken): (progress: number) => number {
  let points = FALLBACK_EASING[token];
  if (typeof document !== "undefined") {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const coordinates = value.match(/cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i);
    if (coordinates) {
      const parsed = coordinates.slice(1).map(Number);
      if (parsed.every(Number.isFinite)) points = parsed as [number, number, number, number];
    }
  }

  const [x1, y1, x2, y2] = points;
  return (progress) => {
    const x = Math.min(1, Math.max(0, progress));
    if (x === 0 || x === 1) return x;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 14; step += 1) {
      const middle = (low + high) / 2;
      if (bezierComponent(middle, x1, x2) < x) low = middle;
      else high = middle;
    }
    return bezierComponent((low + high) / 2, y1, y2);
  };
}
