import { getContext, setContext } from "svelte";
import { createRng, nextRandom } from "../game/rng";

const MINI_GAME_RANDOM = Symbol("mini-game-random");
type RandomFactory = () => () => number;

/** Each engine mount starts its own stream. Never touch the global RNG or save RNG. */
export function seededMiniGameRandom(seed: number): () => number {
  const rng = createRng(seed);
  return () => nextRandom(rng);
}

/** Called by the host; the getter keeps a reused arcade host's current seed correct. */
export function provideMiniGameRandom(seed: () => number | undefined): void {
  setContext<RandomFactory>(MINI_GAME_RANDOM, () => {
    const value = seed();
    return value === undefined ? Math.random : seededMiniGameRandom(value);
  });
}

/** Called once during engine initialization, also supports standalone non-work games. */
export function miniGameRandom(): () => number {
  return getContext<RandomFactory | undefined>(MINI_GAME_RANDOM)?.() ?? Math.random;
}
