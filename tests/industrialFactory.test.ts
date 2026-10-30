import { describe, expect, it } from 'vitest';
import configs from '../src/game/data/minigames.json';
import type { FactoryCfg } from '../src/game/core/minigame';
import { FactoryShift, factoryBoardGeometry, factoryPoints, factoryTheme } from '../src/components/layout/minigames/factoryShift';

const jobs = [
  ['steel_shift', 'steel', 1.05, .45],
  ['aluminum_recycle_shift', 'aluminum', .9, .45],
  ['glass_quality_shift', 'glass', .75, .5],
] as const;
describe('三厂工序和半成品边界', () => {
  it.each(jobs)('%s 工序按各厂时长完成，四点不可跳过，出货动画完成后才计件', (key, theme, dockTime, processTime) => {
    const cfg = configs.games[key] as FactoryCfg;
    expect(factoryTheme(key, cfg.workshop)).toBe(theme);
    const game = new FactoryShift({ ...cfg, productsToWin: 1 }, 123);
    expect(game.ship()).toBe(false);
    game.dock(); game.tick(dockTime - .01);
    expect(game.snapshot().stage).toBe('docking');
    // Steel's docking snapshot can exceed the legacy .6 second duration.
    const resumed = new FactoryShift({ ...cfg, productsToWin: 1 }, 999, JSON.parse(JSON.stringify(game.progress())));
    expect(resumed.progress()).toEqual(game.progress());
    resumed.tick(.01); expect(resumed.snapshot().stage).toBe('solder');
    for (let i=0; i<4; i++) {
      expect(resumed.solder((i+1)%4)).toBe(false);
      expect(resumed.solder(i)).toBe(true);
      resumed.tick(processTime-.01); expect(resumed.snapshot().welded[i]).toBe(false);
      resumed.tick(.01); expect(resumed.snapshot().welded[i]).toBe(true);
    }
    expect(resumed.snapshot().completed).toBe(0);
    resumed.ship(); resumed.tick(.49); expect(resumed.snapshot().completed).toBe(0);
    resumed.tick(.01); expect(resumed.snapshot().completed).toBe(1);
    expect(resumed.snapshot().finished).toBe(true); expect(resumed.snapshot().ratio).toBe(1);
  });
  it.each(jobs)('%s 到时保留已完成件数，尚未完成出货的半件不计数', (key, _theme, dockTime, processTime) => {
    const game = new FactoryShift({ ...configs.games[key] as FactoryCfg, timeLimit: dockTime+4*processTime+.2 }, 42);
    game.dock(); game.tick(dockTime);
    for(let i=0;i<4;i++){game.solder(i);game.tick(processTime);}
    game.ship();game.tick(.5);
    expect(game.snapshot().finished).toBe(true);expect(game.snapshot().completed).toBe(0);
  });
  it('不同工业工位不能混用快照，旧装配快照仍兼容', () => {
    const cfg = configs.games.steel_shift as FactoryCfg;
    const steel = new FactoryShift(cfg, 42);steel.dock();steel.tick(.8);
    const aluminum = new FactoryShift(configs.games.aluminum_recycle_shift as FactoryCfg, 42, steel.progress());
    expect(aluminum.snapshot().stage).toBe('ready');expect(aluminum.snapshot().elapsed).toBe(0);
    const legacyCfg = configs.games.job_factory_line as FactoryCfg;
    const legacy = new FactoryShift(legacyCfg, 42);legacy.dock();legacy.tick(.3);
    const saved = JSON.parse(JSON.stringify(legacy.progress()));expect(saved.workshop).toBeUndefined();
    expect(new FactoryShift(legacyCfg, 999, saved).progress()).toEqual(legacy.progress());
  });
  it.each(jobs)('%s 的工件及完整点击区域适配真实短横屏与手机竖屏', (_key, theme) => {
    for(const [w,h] of [[736,299],[656,263],[620,180],[320,340],[320,140]]) {
      const b=factoryBoardGeometry(w,h,theme);
      expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(w);
      expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.h).toBeLessThanOrEqual(h);
      for(const point of factoryPoints(theme)) {
        const x=b.x+point.x*b.scale,y=b.y+point.y*b.scale;
        expect(x-24).toBeGreaterThanOrEqual(0);expect(x+24).toBeLessThanOrEqual(w);
        expect(y-24).toBeGreaterThanOrEqual(0);expect(y+24).toBeLessThanOrEqual(h);
      }
    }
  });
});
