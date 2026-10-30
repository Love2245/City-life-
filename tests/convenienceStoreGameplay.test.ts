import { describe, expect, it } from 'vitest';
import actionsData from '../src/game/data/actions.json';
import jobsData from '../src/game/data/jobs.json';
import { GAMEPLAY_STOPS } from '../previews/convenience-store/gameplay';
import { ZONES } from '../previews/convenience-store/layout';
import type { ActionDef, JobDef } from '../src/game/types';

type GuideStop = { id: string; zone: string; copy: string; tag: string; actionIds: readonly string[]; jobId?: string };
const stops: readonly GuideStop[] = GAMEPLAY_STOPS;
const actions = actionsData as unknown as ActionDef[], jobs = jobsData as unknown as JobDef[];
const actionById = new Map(actions.map(action => [action.id, action]));
const productHandlers = new Set(['buy_item', 'buy_food', 'buy_fresh', 'buy_ingredient']);
const storeProducts = actions.filter(action => action.locationId === 'convenience_store' && productHandlers.has(action.handler ?? '') && action.itemId);
const actionIds = stops.flatMap(stop => [...stop.actionIds]);

describe('convenience store preview gameplay contracts', () => {
  it('resolves every guided action and facility in the real main-city store without inventing transactional actions', () => {
    expect(new Set(actionIds).size, 'one explanation per referenced action').toBe(actionIds.length);
    for (const stop of stops) {
      expect(stop.zone in ZONES, `${stop.id} focuses a real facility`).toBe(true);
      for (const id of stop.actionIds) {
        const action = actionById.get(id);
        expect(action, `${id} exists in the game`).toBeDefined();
        expect(action?.locationId, `${id} belongs to this store`).toBe('convenience_store');
        expect(productHandlers.has(action?.handler ?? '') || action?.handler === 'blind_box', `${id} is an existing purchase or blind-box action`).toBe(true);
      }
    }
    expect(actionIds.some(id => /coffee|atm|check.?in|sign.?in/i.test(id))).toBe(false);
  });

  it('covers exactly the eleven actual items and keeps coffee, daily goods and minigame stock out of the player catalog', () => {
    const guidedProducts = actionIds.map(id => actionById.get(id)!).filter(action => productHandlers.has(action.handler ?? ''));
    expect(guidedProducts.map(action => action.id).sort()).toEqual(storeProducts.map(action => action.id).sort());
    const expectedItems = ['bento', 'drink', 'sandwich', 'salad', 'noodles', 'energy_drink', 'salt', 'sugar', 'soy_sauce', 'chili_powder', 'salad_dressing'];
    expect([...new Set(guidedProducts.map(action => action.itemId))].sort()).toEqual(expectedItems.sort());
    expect(guidedProducts).toHaveLength(11);
  });

  it('describes the real paid blind-box hours, base price and elapsed time rather than a new daily gift', () => {
    const stop = stops.find(stop => stop.id === 'blindbox')!;
    expect(stop.actionIds).toHaveLength(1);
    const action = actionById.get(stop.actionIds[0])!;
    expect(action.handler).toBe('blind_box');
    const hours = [...stop.tag.matchAll(/(\d{1,2}):00/g)].map(match => Number(match[1]));
    expect(hours).toEqual([action.requirements?.hourRange?.start, action.requirements?.hourRange?.end]);
    const price = Number(stop.copy.match(/基础价\s*([\d.]+)\s*元/)?.[1]);
    const duration = Number(stop.copy.match(/耗时\s*([\d.]+)\s*小时/)?.[1]);
    expect(price).toBe(Math.abs(action.effects.money ?? 0));
    expect(duration).toBe(action.duration);
    expect(action.requirements?.oncePerDay, 'the paid box has no per-day claim cap').toBeUndefined();
  });

  it('points to the existing formal store job while environment services remain non-transactional', () => {
    const work = stops.find(stop => stop.id === 'work')!;
    const job = jobs.find(job => job.id === work.jobId);
    expect(job).toBeDefined();expect(job?.locationId).toBe('convenience_store');expect(job?.kind).toBe('formal');
    const hours = [...work.copy.matchAll(/(\d{1,2}):00/g)].map(match => Number(match[1]));
    expect(hours, 'the shift description follows the actual job schedule').toEqual([job?.startHour, job?.endHour]);
    expect(work.actionIds, 'work is explained, not dispatched as a made-up action').toEqual([]);
    const services = stops.filter(stop => stop.zone === 'services');
    expect(services.length).toBeGreaterThan(0);
    expect(services.every(stop => !stop.actionIds.length && !stop.jobId), 'coffee and heating props do not introduce a purchase or job').toBe(true);
    for (const stop of stops.filter(stop => stop.jobId)) expect(jobs.some(job => job.id === stop.jobId)).toBe(true);
  });
});
