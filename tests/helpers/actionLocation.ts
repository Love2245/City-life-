import type { GameState } from "../../src/game/types";
import { getAction } from "../../src/game/core/actions";
import { residenceLocationId } from "../../src/game/core/residence";

/** Give direct action tests the same physical-location precondition as the UI flow. */
export function setActionLocation(state: GameState, actionId: string): void {
  const locationId = getAction(actionId)?.locationId;
  if (locationId === "home") state.locationId = residenceLocationId(state);
  else if (locationId) state.locationId = locationId;
}
