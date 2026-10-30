/** Shared visual period for atlas and venue backgrounds. */
export type VisualTimeOfDay = "day" | "dusk" | "night";

/** Keep every visual surface on the same in-game clock boundaries. */
export function themeOfHour(hour: number): VisualTimeOfDay {
  if (hour >= 5 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}
