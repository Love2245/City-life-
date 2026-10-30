import type { MiniGameConfig } from "../game/core/minigame";
import type { MinigameMusicMode } from "./audio";

/** Embedded delivery owns its soundtrack; venue activities keep their surroundings. */
export function minigameMusicMode(config: MiniGameConfig): MinigameMusicMode {
  if (config.type === "delivery") return "embedded";
  if (config.type === "rhythm" || config.type === "chess") return "scene";
  return "legacy";
}
