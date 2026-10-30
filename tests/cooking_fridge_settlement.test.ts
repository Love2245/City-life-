import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { cookFreeform, eatStoredMeal, settlePendingCook } from '../src/game/core/cooking';
import { installFridge } from '../src/game/core/fridge';
import { migrateSave } from '../src/game/core/migrate';

function kitchen() {
  const s = createInitialState(1492);
  s.living.mode = 'lease'; s.living.govDaysLeft = 0; s.living.nightly = null;
  s.living.lease = { housingId: 'old_apartment', rent: 100, rentGrowthCount: 0 };
  s.flags.cook_utensil = true; s.inventory.milk = 1; s.inventory.egg = 1;
  installFridge(s, 'small');
  s.player.attrs.satiety = 0; s.player.attrs.health = 20; s.player.attrs.mood = 20;
  return s;
}

describe('冷藏成品食用结算', () => {
  it.each([0, 3, 6])('厨艺 %s 级时，立即食用与冷藏后读档食用具有相同收益', skill => {
    const immediate = kitchen(), stored = kitchen();
    immediate.player.skills.cooking = stored.player.skills.cooking = skill;
    expect(cookFreeform(immediate, ['milk', 'egg'], []).ok).toBe(true);
    expect(cookFreeform(stored, ['milk', 'egg'], []).ok).toBe(true);
    expect(settlePendingCook(immediate, 'eat').ok).toBe(true);
    expect(settlePendingCook(stored, 'store').ok).toBe(true);
    expect(stored.player.attrs.satiety).toBe(0);
    const reloaded = migrateSave(JSON.parse(JSON.stringify(stored)));
    expect(eatStoredMeal(reloaded, 'cooked:pudding').ok).toBe(true);
    expect(reloaded.player.skills.cooking).toBe(immediate.player.skills.cooking);
    for (const stat of ['satiety', 'health', 'mood'] as const) {
      expect(reloaded.player.attrs[stat]).toBe(immediate.player.attrs[stat]);
    }
    const after = JSON.stringify(reloaded.player);
    expect(eatStoredMeal(reloaded, 'cooked:pudding').ok).toBe(false);
    expect(JSON.stringify(reloaded.player)).toBe(after);
  });
});
