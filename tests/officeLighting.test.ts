import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {officeLightScheme,officeLightingMetadata} from '../src/lib/officeLighting';
import {homeLightScheme} from '../src/game/core/homeLighting';
import {COMPANY_OFFICES} from '../src/game/core/companyOffice';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';

describe('办公室照明来自游戏时钟与季节',()=>{
  it('0点、6点和日落前后使用真实月份边界，分钟会改变亮度和太阳位置',()=>{
    const midnight=officeLightScheme(0,9),before=officeLightScheme(5+59/60,9),after=officeLightScheme(6+1/60,9);
    expect(midnight).toMatchObject({frame:'night',lamps:true,daylight:0});
    expect(before.frame).toBe('night');expect(after.frame).toBe('day');expect(after.daylight).toBeGreaterThan(before.daylight);
    expect(after.sunOffset).not.toEqual(before.sunOffset);
    expect(officeLightScheme(18-1/60,9).frame).toBe('day');expect(officeLightScheme(18,9).frame).toBe('night');
    expect(officeLightScheme(18,7).frame).toBe('day');expect(officeLightScheme(18,12).frame).toBe('night');
    expect(officeLightScheme(6,7).frame).toBe('day');expect(officeLightScheme(6,12).frame).toBe('night');
    expect(officeLightScheme(24,9)).toEqual(midnight);
  });
  it('晴雨雪沿用住宅自然光，晨昏较暖、夜间开灯并显著降低室外与太阳亮度',()=>{
    const day=officeLightScheme(12,9),rain=officeLightScheme(12,9,'rain'),snow=officeLightScheme(12,12,'snow'),dawn=officeLightScheme(6.5,9),dusk=officeLightScheme(17.5,9),night=officeLightScheme(23,9);
    expect(day.daylight).toBe(homeLightScheme(12,9,'sunny').daylight);
    expect(rain.daylight).toBe(homeLightScheme(12,9,'rain').daylight);
    expect(rain.daylight).toBeLessThan(day.daylight);expect(rain.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(rain.filter).not.toBe(day.filter);expect(snow.filter).not.toBe(rain.filter);
    expect(dawn.sunColor).not.toBe(day.sunColor);expect(dusk.sunColor).not.toBe(day.sunColor);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity/10);expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity/2);
    expect(night.lampEmission).toBeGreaterThan(day.lampEmission);expect(night.fillIntensity).toBeGreaterThan(day.fillIntensity);
    expect(night.background).not.toBe(day.background);expect(night.windowColor).not.toBe(day.windowColor);
    expect(JSON.parse(officeLightingMetadata(rain))).toMatchObject({hour:12,month:9,weather:'rain',lamps:false,frame:'day'});
  });
  it.each(COMPANY_OFFICES)('阶段$stage照明只改已有窗和灯的材质，不重建建筑、电脑或人物',async plan=>{
    const model=buildCompanyOffice(plan);
    try{
      model.update(plan.desks.map((_,index)=>({index,personId:index?'employee-'+index:'founder',name:'工位',tier:'mid',status:'编程中',present:index>0,stars:3})));
      const windows=model.root.getObjectByName('panoramic-window') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|undefined;
      const windowFrame=model.root.getObjectByName('window-mullion') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
      const lamp=model.root.getObjectByName('light-diffuser') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
      if(plan.stage>=3)expect(windows).toBeUndefined();else expect(windows).toBeDefined();
      const windowMaterial=windows?.material,frameMaterial=windowFrame.material,lampMaterial=lamp.material;
      const identities=()=>model.workstations.map(desk=>[desk.uuid,...desk.children.map(child=>child.uuid),...desk.children.flatMap(child=>child.children.map(item=>item.uuid))]);
      const day=officeLightScheme(12,9),night=officeLightScheme(23,9);
      model.setLighting(day);const daytime=lampMaterial.emissiveIntensity;
      await model.prepare(async()=>{});const objects=identities(),count=model.root.children.length;model.setLighting(night);
      expect(identities()).toEqual(objects);expect(model.root.children.length).toBe(count);
      expect(windows?.material).toBe(windowMaterial);expect(windowFrame.material).toBe(frameMaterial);expect(lamp.material).toBe(lampMaterial);
      expect(lampMaterial.emissiveIntensity).toBeGreaterThan(daytime);
      if(windowMaterial)expect(windowMaterial.color.getHexString()).toBe(new THREE.Color(night.windowColor).getHexString());
      model.setLighting(day);expect(lampMaterial.emissiveIntensity).toBe(daytime);
    }finally{model.dispose();}
  });
});
