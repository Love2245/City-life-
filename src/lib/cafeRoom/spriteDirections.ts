export const SPRITE_VIEWS = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'] as const;
// v2 follows the camera's orbit around a fixed +Z-facing person. Camera +90°
// is frame 2 (nose toward screen left); +270° is frame 6 (screen right).
export const ATLAS_FRAME_FOR_CAMERA_SECTOR = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const TURN = Math.PI * 2;
export const wrapAngle = (angle: number) => ((angle + Math.PI) % TURN + TURN) % TURN - Math.PI;

/** Camera azimuth relative to the character's +Z facing. A small deadband
 * prevents a stationary seated pose flickering between two painted views. */
export function spriteSector(angle: number, previous?: number, hysteresis = Math.PI / 36): number {
  const normalized = wrapAngle(angle);
  if (previous !== undefined && Math.abs(wrapAngle(normalized - previous * Math.PI / 4)) <= Math.PI / 8 + hysteresis) return previous;
  return (Math.round(normalized / (Math.PI / 4)) + 8) % 8;
}

export type FrameBounds = { x: number; y: number; width: number; height: number; anchorX: number; bottom: number };
/** Inspect alpha only; the generated PNG is never resampled or rewritten.
 * Runtime UV rectangles leave an extra pixel around the visible silhouette. */
export function atlasFrames(alpha: Uint8ClampedArray, width: number, height: number, cutoff = 40): FrameBounds[] {
  const frames: FrameBounds[] = [];
  for (let frame = 0; frame < 8; frame++) {
    const col = frame % 4, row = Math.floor(frame / 4);
    const left = Math.round(col * width / 4), right = Math.round((col + 1) * width / 4);
    const top = Math.round(row * height / 2), bottom = Math.round((row + 1) * height / 2);
    let minX = right, minY = bottom, maxX = left, maxY = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (alpha[(y * width + x) * 4 + 3] < cutoff) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (minX > maxX) throw Error(`Lin atlas frame ${frame} has no visible silhouette`);
    // The painted subject is not centered identically in all eight cells.
    // Ground the stool using the lower leg band, rather than its head/knees.
    let footLeft = right, footRight = left;
    // In the left painting, an extended shoe enters the 10% band. The lowest
    // 5% contains both stool feet (x=1022..1180 in v2), keeping its seat centered.
    const footBand = frame === 6 ? .05 : .10;
    for (let y = Math.max(top, maxY - Math.round((maxY - minY) * footBand)); y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (alpha[(y * width + x) * 4 + 3] < cutoff) continue;
      footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x);
    }
    const x = Math.max(left, minX - 1), y = Math.max(top, minY - 1);
    frames.push({ x, y, width: Math.min(right, maxX + 2) - x, height: Math.min(bottom, maxY + 2) - y, anchorX: (footLeft + footRight + 1) / 2, bottom: maxY + 1 });
  }
  return frames;
}
