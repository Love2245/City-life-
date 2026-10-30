import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {HOME_FLOOR_PLANS} from '../src/game/core/homeFloorPlans';
import {HOME_LOW_WALL_HEIGHT,homeExteriorWallHeight,homeWallHeight} from '../src/lib/homeWallView';
import {homeLightScheme,homeShadowSource,homeCeilingAreas} from '../src/game/core/homeLighting';
import {configureHomeWindowShadow,positionHomeWindowLight} from '../src/lib/homeRoom3D';

describe('只降低挡住视线的前墙',()=>{
  it('前墙降低，左右侧墙和后墙完整；转90度后只切换到新的前墙',()=>{
    const walls={front:[0,6,8,6],back:[0,0,8,0],left:[0,0,0,6],right:[8,0,8,6]},target:[number,number]=[4,3];
    for(const [side,wall]of Object.entries(walls))expect(homeExteriorWallHeight(wall,target,[4,9],'cutaway'),side).toBe(side==='front'?HOME_LOW_WALL_HEIGHT:2.65);
    for(const [side,wall]of Object.entries(walls))expect(homeExteriorWallHeight(wall,target,[12,3],'cutaway'),side).toBe(side==='right'?HOME_LOW_WALL_HEIGHT:2.65);
    expect(homeExteriorWallHeight(walls.left,target,[-4,3],'cutaway')).toBe(HOME_LOW_WALL_HEIGHT);
  });
  it('室内隔墙只在挡住查看位置时降低，斜着看也不会同时切掉两侧墙',()=>{
    const p=HOME_FLOOR_PLANS.apartment;
    expect(homeWallHeight(p,[4.5,0,4.5,4],[2,2],[6,2],'cutaway')).toBe(HOME_LOW_WALL_HEIGHT);
    expect(homeWallHeight(p,[0,4,4,4],[2,2],[6,2],'cutaway')).toBe(2.65);
    const target:[number,number]=[4,3],eye:[number,number]=[7,9];
    expect(homeExteriorWallHeight([0,6,8,6],target,eye,'cutaway')).toBe(HOME_LOW_WALL_HEIGHT);
    expect(homeExteriorWallHeight([8,0,8,6],target,eye,'cutaway')).toBe(2.65);
  });
});
describe('单主光柔和阴影',()=>{
  it('各户型日间仅选一个窗光投影、夜间仅选一个顶灯，白天强制开灯也不叠加投影',()=>{
    for(const p of Object.values(HOME_FLOOR_PLANS)){
      for(const mode of ['auto','on','off'] as const){
        const day=homeShadowSource(p,homeLightScheme(12,8,'sunny',mode));expect(day.kind).toBe('window');expect(p.windows[day.index]).toBeDefined();
        const night=homeShadowSource(p,homeLightScheme(23,8,'sunny',mode));expect(night.kind).toBe(mode==='off'?'none':'ceiling');if(night.kind==='ceiling')expect(homeCeilingAreas(p)[night.index]).toBeDefined();
      }
      expect(homeShadowSource(p,homeLightScheme(12,8,'sunny'))).toEqual(homeShadowSource(p,homeLightScheme(12,8,'rain')));
    }
  });
  it('柔光降低投影浓度和灯光反差，仍保留日夜、天气与手动开关差别',()=>{
    const day=homeLightScheme(12,8,'sunny'),rain=homeLightScheme(12,8,'rain'),night=homeLightScheme(23,8,'sunny'),off=homeLightScheme(23,8,'sunny','off');
    expect(day.shadowIntensity).toBeLessThanOrEqual(.32);expect(rain.shadowIntensity).toBeLessThan(day.shadowIntensity);expect(night.shadowIntensity).toBe(.2);
    expect(day.bounce).toBeGreaterThan(1);expect(day.keyIntensity).toBeLessThan(.45);expect(night.ceilingIntensity).toBeLessThan(12);expect(night.lampIntensity).toBeLessThan(5);
    expect(off.ceilingIntensity).toBe(0);expect(off.lampIntensity).toBe(0);expect(off.bounce).toBeLessThan(night.bounce);
  });
  it('日光阴影视锥覆盖各户型的地面且更新真实投影矩阵，避免沿旧视锥边缘硬切',()=>{
    for(const p of Object.values(HOME_FLOOR_PLANS)){
      const light=new THREE.DirectionalLight(),old=light.shadow.camera.projectionMatrix.clone();configureHomeWindowShadow(light,p);
      expect(light.shadow.camera.projectionMatrix.equals(old)).toBe(false);expect(light.shadow.radius).toBeGreaterThan(1);expect(light.shadow.intensity).toBeLessThan(.4);
      const index=homeShadowSource(p,homeLightScheme(12,8,'sunny')).index;
      positionHomeWindowLight(light,p,index,12);light.updateMatrixWorld();light.target.updateMatrixWorld();light.shadow.updateMatrices(light);
      for(const [x,z]of p.outline){const point=new THREE.Vector3(x,0,z).project(light.shadow.camera);expect(Math.abs(point.x),p.id+' x').toBeLessThan(1);expect(Math.abs(point.y),p.id+' y').toBeLessThan(1);expect(Math.abs(point.z),p.id+' depth').toBeLessThan(1);}
    }
  });
});
