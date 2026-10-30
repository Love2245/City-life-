/** Reproduce the accepted always-continue poker baseline using the shipped shuffle/evaluator. */
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true } });
try {
  const { createInitialState } = await server.ssrLoadModule("/src/game/core/state.ts");
  const { shuffledLeisureDeck, evaluatePokerHand } = await server.ssrLoadModule("/src/game/core/districtLeisure.ts");
  const seed = 0x1482026, rounds = Number(process.env.SIM_ROUNDS || 500000), state = createInitialState(seed);
  let wins = 0, ties = 0, returnedUnits = 0;
  const winningCategories = Array(9).fill(0), started = performance.now();
  for (let i = 0; i < rounds; i++) {
    const d = shuffledLeisureDeck(state), board = d.slice(4, 9);
    const player = evaluatePokerHand([d[0], d[2], ...board]), dealer = evaluatePokerHand([d[1], d[3], ...board]);
    if (player.key === dealer.key) ties++;
    if (player.key > dealer.key) {
      wins++; winningCategories[player.category]++;
      returnedUnits += player.category === 8 ? 5 : player.category === 7 ? 3 : 2;
    }
  }
  const result = { seed, rounds, policy: "always_continue", deck: "52_without_replacement", ties: "house_wins", wins, equalHands: ties, winRate: wins / rounds, returnRate: returnedUnits / rounds, winningCategories, elapsedSeconds: (performance.now() - started) / 1000 };
  mkdirSync(resolve("artifacts/v1.48/district-services"), { recursive: true });
  writeFileSync(resolve("artifacts/v1.48/district-services/casino-simulation.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await server.close(); }
