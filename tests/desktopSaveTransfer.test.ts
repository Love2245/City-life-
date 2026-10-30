// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { deliveryParttime, pauseWork } from '../src/game/core/jobs';
import { exportSavePayload, importSavePayload, isImportableSavePayload, loadGame, saveGameImmediately } from '../src/lib/save';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('desktop JSON progress transfer', () => {
  it('moves a save between storage contexts with time, money, location, and active activity intact', async () => {
    const source = createInitialState(745);
    source.player.money = 1234.56; source.time.hour = 8; source.time.minute = 48;
    source.locationId = 'old_apartment';
    source.flags.app_delivery = true; source.flags.item_bicycle = true;
    Object.assign(source.player.attrs, { health: 100, stamina: 100, satiety: 100, hygiene: 100 });
    expect(deliveryParttime(source).ok).toBe(true); pauseWork(source);
    expect(source.work?.active).toBeDefined();
    saveGameImmediately('auto', source);
    const payload = exportSavePayload('auto')!;
    localStorage.clear();
    expect(isImportableSavePayload(payload)).toBe(true);
    expect(importSavePayload('slot_1', payload)).toBe(true);
    const restored = await loadGame('slot_1');
    expect(restored?.player.money).toBe(source.player.money);
    expect(restored?.time).toEqual(source.time);
    expect(restored?.locationId).toBe(source.locationId);
    expect(restored?.work).toEqual(source.work);
    expect(restored?.rng).toEqual(source.rng);
  });
  it('backs up an existing slot and rejects broken or newer saves without replacing it', () => {
    const old = createInitialState(746); old.player.money = 222;
    saveGameImmediately('slot_1', old);
    const current = exportSavePayload('slot_1')!;
    expect(importSavePayload('slot_1', '{broken')).toBe(false);
    expect(importSavePayload('slot_1', JSON.stringify({ ...old, version: 999999 }))).toBe(false);
    expect(exportSavePayload('slot_1')).toBe(current);
    const next = createInitialState(747); next.player.money = 333;
    expect(importSavePayload('slot_1', JSON.stringify(next))).toBe(true);
    expect(JSON.parse(localStorage.getItem('urban_life_save_slot_1_backup_1')!).player.money).toBe(222);
    expect(JSON.parse(exportSavePayload('slot_1')!).player.money).toBe(333);
  });
});
