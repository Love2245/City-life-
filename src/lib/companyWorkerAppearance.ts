/** Stable appearance metadata is independent of Three.js and safe for mobile still scenes. */
export const OFFICE_HEADGEAR = ['paper-bag', 'cat', 'fox', 'bear', 'drink-can', 'parcel-bag', 'grocery-bag', 'lightbulb', 'rabbit', 'panda', 'apple', 'orange', 'planet'] as const;
export type OfficeHeadgear = typeof OFFICE_HEADGEAR[number];

export function officeWorkerAppearance(index: number, identity?: string): { look: number; headgear: OfficeHeadgear } {
  let seed = Math.abs(Math.trunc(index));
  if (identity) {
    seed = 2166136261;
    for (const character of identity) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return { look: seed % 6, headgear: OFFICE_HEADGEAR[seed % OFFICE_HEADGEAR.length]! };
}
