import {describe,expect,it} from 'vitest';
import {deriveVersionMetadata,deriveTapVersionMetadata} from '../scripts/version-metadata.js';
describe('Android 历史和未来 versionCode 分配',()=>{
  it('手机性能修订可覆盖同渠道旧包，且不占用下一渠道/版本号段',()=>{
    expect(deriveVersionMetadata('1.49.8',1).versionCode).toBe(1498001);
    expect(deriveTapVersionMetadata('1.49.8',1).versionCode).toBe(1498011);
    expect(deriveVersionMetadata('1.49.8',9).versionCode).toBeLessThan(deriveTapVersionMetadata('1.49.8').versionCode);
    expect(deriveTapVersionMetadata('1.49.9',9).versionCode).toBeLessThan(deriveVersionMetadata('1.49.10').versionCode);
    expect(()=>deriveVersionMetadata('1.49.8',10)).toThrow();
  });
  it.each([
    ['1.475',1475000,1475000],['1.48',1480000,1480000],['1.48.1',1480001,1480001],['1.48.2',1480002,1480002],
    ['1.49.0',1490000,1490000],['1.49.1',1490001,1490001],['1.49.2',1492000,1492010],['1.49.3',1490003,1490003],['1.49.4',1490004,1490004],['1.49.5',1495000,1495010],['1.49.6',1490006,1490006],['1.49.7',1497000,1497010],['1.49.8',1498000,1498010],
  ])('%s 保留脚本原有历史分配',(version,normal,tap)=>{
    expect(deriveVersionMetadata(version).versionCode).toBe(normal);expect(deriveTapVersionMetadata(version).versionCode).toBe(tap);
  });
  it('1.49.9 和后续版本两渠道递增并留出 1.50.0 的空间',()=>{
    const versions=['1.49.8','1.49.9','1.49.10','1.49.11','1.49.58','1.50.0'];
    const normal=versions.map(v=>deriveVersionMetadata(v).versionCode),tap=versions.map(v=>deriveTapVersionMetadata(v).versionCode);
    expect(normal).toEqual([1498000,1499000,1499020,1499040,1499980,1500000]);
    expect(tap).toEqual([1498010,1499010,1499030,1499050,1499990,1500000]);
    for(let i=1;i<versions.length;i++){expect(normal[i]).toBeGreaterThan(tap[i-1]);expect(tap[i]).toBeGreaterThan(tap[i-1]);}
    for(let patch=9;patch<58;patch++){
      const next=deriveVersionMetadata(`1.49.${patch+1}`).versionCode;
      expect(deriveTapVersionMetadata(`1.49.${patch}`).versionCode).toBeLessThan(next);
    }
  });
  it('1.49 号段耗尽时拒绝生成碰撞的版本号',()=>{
    expect(()=>deriveVersionMetadata('1.49.59')).toThrow('号段已用尽');
    expect(()=>deriveTapVersionMetadata('1.49.59')).toThrow('号段已用尽');
  });
});
