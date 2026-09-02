import { it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import { signupTournament, startTournament, currentOpponentId } from "../src/game/core/tournament";
import { getTournamentDef, startBattle, settleBattle } from "../src/game/core/catBattle";

it("debug tournament flow", () => {
  const s = createInitialState(3);
  const pet = adoptCat(s, "orange");
  setActivePet(s, s.pets[0].uid);
  s.pets[0].level = 20;
  s.time = { day: 2, month: 8, year: 2026, hour: 15, minute: 0, stayedUp: false };
  const t = getTournamentDef("tournament_primary")!;
  const r = signupTournament(s, t.id);
  console.log("signup", r);
  const entry = s.catTournament!.entry!;
  console.log("queue", entry.queue);
  const st = startTournament(s);
  console.log("startTournament", st, "started?", entry.started, "settled?", entry.settled);
  for (const oppId of [...entry.queue]) {
    const rb = startBattle(s, oppId, t.id);
    console.log("startBattle", oppId, rb);
    if (!s.catBattle) continue;
    const b = s.catBattle!;
    b.opponent.hp = 0;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    const rew = settleBattle(s);
    console.log("after battle", oppId, "roundIndex", entry.roundIndex, "beaten", entry.beaten, "rank", entry.rank, "settled", entry.settled, "reward", rew?.money);
  }
  console.log("final rank", entry.rank, "prize", entry.prizeMoney, "settled", entry.settled);
});
