import { describe, expect, it } from 'vitest';
import { playerPortraitForReply } from '../src/game/core/npcPortraits';
describe('corrected workwear', () => {
  for (const clothes of ['factory_uniform', 'farm_workwear', 'service_apron', 'delivery_vest']) {
    it(`${clothes} uses a coherent full pose and an aligned cutout mask`, () => {
      const portrait = playerPortraitForReply('（抱臂）', {clothes, pants:'black_pants', underlayer:'underlayer_white', hat:'baseball_cap'});
      expect(portrait.variant).toBe('default');
      expect(portrait.layers).toHaveLength(5);
      expect(portrait.layerMasks?.[3]).toBeTruthy();
      expect(portrait.layers?.every(layer => layer.includes('default'))).toBe(true);
    });
  }
});
