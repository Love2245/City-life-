import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { MAP_ANCHORS, mapAnchor, mapSymbol } from '../src/lib/mapAtlas';
import { createInitialState } from '../src/game/core/state';
import { currentRegion } from '../src/game/core/housing';
import regions from '../src/game/data/regions.json';
import locations from '../src/game/data/locations.json';

describe('v1.42 aerial atlas calibration', () => {
  const districts = regions.filter(r => r.parent === 'downtown' || r.parent === 'suburb').map(r => r.id);
  it('ships an independent WebP aerial map for every district', () => {
    expect(districts).toHaveLength(8);
    for (const id of districts) {
      const file = new URL(`../src/assets/bg/v1.42/atlas/${id}.webp`, import.meta.url);
      expect(existsSync(file), id).toBe(true);
      expect(readFileSync(file).subarray(8,12).toString()).toBe('WEBP');
      expect(statSync(file).size).toBeLessThan(750_000);
    }
  });
  it('keeps calibrated coordinates stable when entries are filtered', () => {
    for (const [map, anchors] of Object.entries(MAP_ANCHORS)) {
      for (const [id, anchor] of Object.entries(anchors)) {
        expect(mapAnchor(map, id, 0)).toEqual(mapAnchor(map, id, 99));
        expect(anchor.x).toBeGreaterThan(0);
        expect(anchor.x).toBeLessThan(100);
        expect(anchor.y).toBeGreaterThan(0);
        expect(anchor.y).toBeLessThan(100);
      }
    }
    expect(mapAnchor('downtown_residential', 'not_a_building')).toBeUndefined();
  });
  it('keeps Boyue market pins on the sphere plaza and independent food-street entrances', () => {
    expect(mapAnchor('boyue', 'boyue_night_market')).toEqual({ x: 32, y: 56 });
    expect(mapAnchor('boyue_night_market', 'boyue_snack_street')).toEqual({ x: 24, y: 56 });
    expect(mapAnchor('boyue_university', 'boyue_food_street')).toEqual({ x: 42, y: 87 });
  });
  it('assigns all configured district destinations an inspected anchor', () => {
    for (const location of locations) {
      for (const district of location.regions ?? []) {
        if(districts.includes(district) && location.id !== 'map')
          expect(mapAnchor(district, location.id), `${district}/${location.id}`).toBeDefined();
      }
    }
  });
  it('keeps the dynamic home entrance visible when the player lives at the youth hostel', () => {
    const state = createInitialState();
    state.living.mode = 'nightly';
    state.living.nightly = { lodgingId: 'hostel' };
    const homeRegion = currentRegion(state);
    expect(homeRegion).toBe('downtown_station');
    expect(mapAnchor(homeRegion, 'home')).toBeDefined();
  });
  it('uses the home symbol for the industrial worker dormitory', () => {
    expect(mapSymbol('worker_dormitory')).toBe('home');
  });
  it('separates the right-road city entrance from the transport district', () => {
    const city = mapAnchor('suburb','downtown')!;
    const edge = mapAnchor('suburb','suburban_edge')!;
    expect(city.x).toBeGreaterThan(85);
    expect(city.x - edge.x).toBeGreaterThan(25);
    expect(mapAnchor('downtown','suburb')).toBeDefined();
  });
});
