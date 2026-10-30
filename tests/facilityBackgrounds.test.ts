import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState } from '../src/game/core/state';
import { currentSceneBackgroundUrl } from '../src/lib/housingVisuals';
import { sceneBackgroundUrl, sceneHasNativeLighting } from '../src/lib/sceneVisuals';
import { INDOOR_FACILITY_SCENES, OUTDOOR_FACILITY_SCENES } from '../src/lib/facilityVisuals';
import { atlasVisualFor } from '../src/lib/mapVisuals';
import { signLease } from '../src/game/core/housing';
import { performAction } from '../src/game/core/actions';

describe('独立设施背景与住宅/地图边界', () => {
  it('十五处设施在实际场景解析中各有背景，校园设施不再被总览覆盖', () => {
    const state = createInitialState(149566), urls = new Set<string>();
    for (const id of [...INDOOR_FACILITY_SCENES, ...OUTDOOR_FACILITY_SCENES]) {
      state.locationId = id; state.time.hour = 12;
      state.region = id.includes('engineering') ? 'campus_engineering' : id.includes('teacher') || id === 'dev_university' ? 'campus_teacher' : 'downtown_commercial';
      const url = currentSceneBackgroundUrl(state, 'day'); expect(url, id).toContain('/v1.495/facilities/'); expect(url).not.toBe(atlasVisualFor(state.region, 'sunny', 12).url); urls.add(url!);
    }
    expect(urls.size).toBe(15);
  });
  it('室外日落/夜间按实际时钟切图，室内保留室内照明，不受传入旧主题误导', () => {
    for (const id of OUTDOOR_FACILITY_SCENES) {
      const day = sceneBackgroundUrl(id, 'night', 12), dusk = sceneBackgroundUrl(id, 'day', 18), night = sceneBackgroundUrl(id, 'day', 22);
      expect(day).toContain('-day.webp'); expect(dusk).toContain('-dusk.webp'); expect(night).toContain('-night.webp'); expect(new Set([day, dusk, night]).size).toBe(3); expect(sceneHasNativeLighting(id, 22)).toBe(true);
    }
    for (const id of INDOOR_FACILITY_SCENES) { expect(sceneBackgroundUrl(id, 'day', 12)).toBe(sceneBackgroundUrl(id, 'night', 22)); expect(sceneHasNativeLighting(id, 22)).toBe(true); }
  });
  it('酒店前台显示大堂，入住后回到原有房间；校园住房保留自己的内景', () => {
    const state = createInitialState(); state.locationId = 'hotel_mooncourt'; state.region = 'downtown_commercial'; state.time.hour = 12;
    state.player.money = 10000;
    expect(currentSceneBackgroundUrl(state, 'day')).toContain('/facilities/hotel_mooncourt.webp');
    expect(performAction(state, 'stay_hotel_mooncourt').ok).toBe(true); expect(currentSceneBackgroundUrl(state, 'day')).toContain('/housing/'); expect(currentSceneBackgroundUrl(state, 'day')).not.toContain('/facilities/');
    signLease(state, 'boyue_talent_apartment'); state.locationId = 'boyue_talent_apartment'; state.region = 'campus_engineering';
    expect(currentSceneBackgroundUrl(state, 'day')).toContain('/v1.48/housing/boyue_talent_apartment/day.webp');
    state.locationId = 'map'; expect(currentSceneBackgroundUrl(state, 'day')).toBe(atlasVisualFor('campus_engineering', 'sunny', 12).url);
  });
  it('运行图符合WebP格式，生成记录完整，且每张素材均明确要求无人物', () => {
    const records = JSON.parse(readFileSync(resolve('docs/status-facilities-20261023/art/assets.json'), 'utf8')) as Array<{target: string; people: string; width: number; height: number; sha256: string}>;
    expect(records).toHaveLength(21);
    for (const record of records) {
      expect(record.people).toBe('none'); expect(record.width / record.height).toBeCloseTo(16 / 9, 2); expect(record.sha256).toMatch(/^[0-9A-F]{64}$/);
      const file = resolve(record.target); expect(existsSync(file)).toBe(true); const bytes = readFileSync(file); expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    }
  });
});
