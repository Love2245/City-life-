import { describe, expect, it } from 'vitest';
import { homePixelRatio, homeSceneQuality } from '../src/lib/homeQuality';
import { createHomeReferenceVisuals } from '../src/lib/homeReferenceVisuals';
import { homePlanFor } from '../src/game/core/homeInterior';
import { homePreviewRoom } from '../src/lib/homeRoom3D';

describe('housing PE rendering profile', () => {
  it('uses the explicit game mode for automatic quality and still allows manual overrides', () => {
    expect(homeSceneQuality('auto','mobile',3).id).toBe('light'); expect(homeSceneQuality('auto','pc',1).id).toBe('fine');
    expect(homeSceneQuality('fine','mobile',1).id).toBe('fine'); expect(homeSceneQuality('light','pc',2).id).toBe('light');
  });
  it('reduces PE render pixels, shadow maps, texture filtering and contact passes', () => {
    const pc=homeSceneQuality('fine','pc',2), pe=homeSceneQuality('light','pc',2);
    for(const [width,height] of [[1392,896],[3840,2160],[390,844]]){
      const fine=homePixelRatio(pc,width,height)**2*width*height, light=homePixelRatio(pe,width,height)**2*width*height;
      expect(light).toBeLessThan(fine);expect(light).toBeLessThanOrEqual(1_000_001);expect(fine).toBeLessThanOrEqual(3_000_001);
    }
    // 3D 卡顿优化把 fine 档 windowShadowSize 从 2048 降到 1024，面积比相应从 /16 调整为 /4；
    // light 档服务低端设备，维持 512 不再下调。
    expect(pe.windowShadowSize**2).toBeLessThanOrEqual(pc.windowShadowSize**2/4);
    expect(pe.anisotropy).toBeLessThan(pc.anisotropy);expect(pe.contactShadows).toBe(false);expect(pe.samples).toBe(0);
  });
  it('omits optional dressing in PE while keeping the cooking and bathroom facilities and anchors', () => {
    const plan=homePlanFor('own_apartment'), snapshot=homePreviewRoom(plan,true,12), before=JSON.stringify(snapshot), visuals=createHomeReferenceVisuals(plan);
    const additions=visuals.additions!;expect(typeof additions).toBe('function');if(typeof additions!=='function')return;
    const fine=additions(snapshot.objects,'fine'),light=additions(snapshot.objects,'light');
    expect(light.length).toBeLessThan(fine.length);
    expect(light.map(extra=>extra.model.id)).toEqual(expect.arrayContaining(['toilet','washing-machine','upper-cabinet','microwave']));
    expect(light.some(extra=>extra.model.id==='indoor-plant')).toBe(false);expect(JSON.stringify(snapshot)).toBe(before);
    visuals.environment!.dispose();
  });
});
