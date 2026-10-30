import { gameState } from './gameStore.svelte';
import { uiState } from './uiStore.svelte';
import { sceneLoadingTarget } from '../lib/sceneLoadingTarget';
import { beginSceneLoading } from './sceneLoading.svelte';

/** Call once after a successful travel; only the destination renderer ends it. */
export function beginTravelLoading() {
  if (gameState.endingId) return;
  return beginSceneLoading(sceneLoadingTarget(gameState, uiState.sceneMode));
}
