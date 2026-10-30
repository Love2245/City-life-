// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { emptyProfile } from '../src/game/core/profile';
import { alarmCappedHours } from '../src/game/core/time';
import { adoptCat, gainCatExp } from '../src/game/core/cat';
import { signupTournament, signupCheck } from '../src/game/core/tournament';
import {
  currentView, gameState, profile, replaceState, newGame, checkpointAutoSave,
  autoSaveStatus, isSessionDirty, markSessionDirty, markSessionClean,
  shouldCheckpointGameSession, goto,
} from '../src/stores/gameStore.svelte';
import { saveGame, loadGameIntoState, deleteSave } from '../src/lib/save';

const fsState = vi.hoisted(() => ({
  writes: [] as Array<{ payload: string; path: string; finish: () => void }>,
  files: new Map<string, string>(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  mkdir: vi.fn(async () => {}),
  remove: vi.fn(async (path: string) => { fsState.files.delete(path); }),
  writeTextFile: vi.fn((path: string, payload: string) => new Promise<void>((resolve) => {
    fsState.writes.push({ path, payload, finish: () => { fsState.files.set(path, payload); resolve(); } });
  })),
}));

beforeEach(() => {
  localStorage.clear();
  Object.assign(profile, emptyProfile());
  delete gameState.catBattle;
  delete gameState.catTournament;
  delete gameState.activePet;
  replaceState(createInitialState(61003));
  currentView.name = 'menu';
  markSessionClean();
  fsState.writes.length = 0;
  fsState.files.clear();
});

afterEach(async () => {
  for (const write of fsState.writes) write.finish();
  await Promise.resolve();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('save/lifecycle regressions', () => {
  it('S01: loading an ordinary save removes omitted alarm and phone skin', async () => {
    const cleanSlot = createInitialState(61004);
    await saveGame('slot_1', cleanSlot);
    expect(JSON.parse(localStorage.getItem('urban_life_save_slot_1')!).alarmHour).toBeUndefined();

    const previousSlot = createInitialState(61005);
    previousSlot.alarmHour = 8;
    previousSlot.phoneSkin = 'flower';
    replaceState(previousSlot);
    expect(await loadGameIntoState('slot_1')).toBe(true);
    expect(gameState.alarmHour).toBeUndefined();
    expect(gameState.phoneSkin).toBeUndefined();
    expect(alarmCappedHours(gameState, 8)).toBe(8);
  });

  it('S02: a new game clears the old tournament and allows signup with a new cat', () => {
    const cat = adoptCat(gameState, 'orange');
    expect(cat).not.toBeNull();
    gainCatExp(cat!, 100); // Reach level 3 through the production progression function.
    expect(signupTournament(gameState, 'tournament_primary').ok).toBe(true);
    newGame({ familyId: 'ordinary', allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 }, ownedItems: [] }, 61006);
    expect(gameState.catTournament).toBeUndefined();
    expect(gameState.pets).toHaveLength(0);
    expect(gameState.inventory.cat_ticket_primary).toBeUndefined();
    expect(signupCheck(gameState, 'tournament_primary').reason).toContain('先领养');
    const nextCat = adoptCat(gameState, 'orange')!;
    gainCatExp(nextCat, 100);
    expect(signupTournament(gameState, 'tournament_primary').ok).toBe(true);
  });

  it('S03: a slow older mirror write retains the queue until it actually finishes', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const older = createInitialState(61007);
    older.player.money = 111;
    const newer = createInitialState(61008);
    newer.player.money = 222;
    await saveGame('auto', older);
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(1));
    await saveGame('auto', newer);
    await new Promise(resolve => setTimeout(resolve, 3050));
    expect(fsState.writes).toHaveLength(1);
    fsState.writes[0].finish();
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(2));
    fsState.writes[1].finish();
    await Promise.resolve();
    expect(JSON.parse(fsState.files.get('saves/auto/save.json')!).player.money).toBe(222);
    expect(JSON.parse(localStorage.getItem('urban_life_save_auto')!).player.money).toBe(222);
  });

  it('S04: deletion stays queued after a slow in-flight write and removes its eventual file', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    await saveGame('auto', createInitialState(61009));
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(1));
    const deleting = deleteSave('auto');
    await deleting;
    expect(fsState.files.has('saves/auto/save.json')).toBe(false);
    fsState.writes[0].finish();
    await Promise.resolve();
    await vi.waitFor(() => expect(fsState.files.has('saves/auto/save.json')).toBe(false));
    expect(localStorage.getItem('urban_life_save_auto')).toBeNull();
  });

  it('S05: failed permanent archive is reported and its next checkpoint retries', async () => {
    currentView.name = 'game';
    gameState.unlockedEndings = ['ending_rich'];
    markSessionDirty();
    const original = Storage.prototype.setItem;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === 'urban_life_profile') throw new Error('quota');
      return original.call(this, key, value);
    });
    await checkpointAutoSave();
    expect(autoSaveStatus.status).toBe('failed');
    expect(autoSaveStatus.error).toContain('游戏进度已保存');
    expect(isSessionDirty()).toBe(false);
    expect(profile.unlockedEndings).toEqual([]);
    expect(localStorage.getItem('urban_life_profile')).toBeNull();
    expect(JSON.parse(localStorage.getItem('urban_life_save_auto')!).unlockedEndings).toEqual(['ending_rich']);
    storageSpy.mockRestore();
    await checkpointAutoSave();
    expect(profile.unlockedEndings).toEqual(['ending_rich']);
    expect(JSON.parse(localStorage.getItem('urban_life_profile')!).unlockedEndings).toEqual(['ending_rich']);
    expect(autoSaveStatus.status).toBe('saved');
    expect(isSessionDirty()).toBe(false);
  });

  it('S06: starting a new life preserves unarchived milestones in the next auto slot', async () => {
    currentView.name = 'game';
    gameState.unlockedEndings = ['ending_rich'];
    const original = Storage.prototype.setItem;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === 'urban_life_profile') throw new Error('quota');
      return original.call(this, key, value);
    });
    await checkpointAutoSave();
    newGame({ familyId: 'ordinary', allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 }, ownedItems: [] }, 61010);
    await checkpointAutoSave();
    expect(profile.unlockedEndings).toEqual([]);
    expect(gameState.unlockedEndings).toEqual(['ending_rich']);
    expect(JSON.parse(localStorage.getItem('urban_life_save_auto')!).unlockedEndings).toEqual(['ending_rich']);
    expect(autoSaveStatus.status).toBe('failed');
  });

  it.each(['weeklyReport', 'ending', 'settings'] as const)('existing fix: %s keeps game-session checkpoint eligibility', (view) => {
    currentView.name = 'game';
    goto(view);
    expect(shouldCheckpointGameSession()).toBe(true);
  });
});
