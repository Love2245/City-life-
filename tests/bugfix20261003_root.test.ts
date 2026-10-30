import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { adoptCat } from '../src/game/core/cat';
import { fosterCat, reclaimCat, setActivePet } from '../src/game/core/catCare';
import { allOpponents, getTournamentDef } from '../src/game/core/catBattle';
import { signupTournament, enterTournamentArena, expireTicketIfMissed } from '../src/game/core/tournament';
import { advanceHours } from '../src/game/core/time';

describe('2026-10-03 tournament regressions', () => {
  it('signup respects the configured count for each opponent tier', () => {
    const tierById = new Map(allOpponents().map(o => [o.id, o.tier]));
    const observed: Record<string, Record<string, number>> = {};
    for (const tierId of ['tournament_primary', 'tournament_mid', 'tournament_advanced']) {
      const state = createInitialState(7);
      state.player.money = 10000;
      const pet = adoptCat(state, 'orange')!;
      pet.level = 20;
      expect(signupTournament(state, tierId).ok).toBe(true);
      const counts: Record<string, number> = {};
      for (const id of state.catTournament!.entry!.queue) {
        const tier = tierById.get(id)!;
        counts[tier] = (counts[tier] ?? 0) + 1;
      }
      observed[tierId] = counts;
      expect(counts).toEqual(getTournamentDef(tierId)!.pools);
    }
    expect(observed.tournament_primary).toEqual(getTournamentDef('tournament_primary')!.pools);
    expect(observed.tournament_mid).toEqual(getTournamentDef('tournament_mid')!.pools);
    expect(observed.tournament_advanced).toEqual(getTournamentDef('tournament_advanced')!.pools);
  });

  it('an expired signup is rejected on the next Sunday by both arena and forum', () => {
    const state = createInitialState(7);
    state.player.money = 10000;
    const pet = adoptCat(state, 'orange')!;
    pet.level = 20;
    state.time = { ...state.time, year: 2026, month: 8, day: 1, hour: 9, minute: 0 };
    expect(signupTournament(state, 'tournament_primary').ok).toBe(true);
    state.locationId = 'flower_market';
    expect(fosterCat(state, pet.uid).ok).toBe(true);
    // Ordinary game time advances past the promised Sunday, without opening laptop forum.
    advanceHours(state, 8 * 24 + 6);
    expect(state.time.day).toBe(9);
    expect(state.catTournament!.entry!.settled).toBe(true);
    expect(reclaimCat(state, pet.uid).ok).toBe(true);
    expect(setActivePet(state, pet.uid)).toBe(true);
    const beforeArena = JSON.parse(JSON.stringify(state));
    state.locationId = 'amusement_park';
    const entered = enterTournamentArena(state);
    expect(entered.ok).toBe(false);
    expect(state.catTournament!.entry!.started).toBe(false);
    // The forum route rejects the same expired signup.
    expireTicketIfMissed(beforeArena);
    expect(beforeArena.catTournament!.entry!.settled).toBe(true);
  });

  it.each([14, 16, 23])('Sunday %s:00 forum and arena both accept the scheduled ticket', (hour) => {
    const state = createInitialState(6100313);
    state.player.money = 10000;
    const pet = adoptCat(state, 'orange')!;
    pet.level = 20;
    expect(signupTournament(state, 'tournament_primary').ok).toBe(true);
    advanceHours(state, 24 - state.time.hour + hour);
    expect(state.time.day).toBe(2);
    expireTicketIfMissed(state);
    expect(state.catTournament!.entry!.settled).toBe(false);
    state.locationId = 'amusement_park';
    expect(enterTournamentArena(state).ok).toBe(true);
  });
});
