import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';
import {buildOfficeSurroundings} from '../src/lib/companyOfficeSurroundings';
import {COMPANY_OFFICES,OFFICE_ADDRESSES} from '../src/game/core/companyOffice';

describe('办公室与实际楼层、门外空间的关系',()=>{
  it('L形单间凹角由相邻房间补齐，顶盖接到同一邻室，办公室工位不变',()=>{
    const model=buildCompanyOffice(COMPANY_OFFICES[1]!);
    try{
      model.root.updateMatrixWorld(true);const infill=model.root.getObjectByName('neighbour-corner-infill-0')!,roof=model.root.getObjectByName('neighbour-corner-ceiling-0')!;
      expect(infill).toBeDefined();expect(roof.parent).toBe(infill.parent);expect(infill.parent?.name).toBe('east-enclosed-suite');
      const bounds=new THREE.Box3().setFromObject(infill);expect(bounds.min.x).toBeCloseTo(8);expect(bounds.max.x).toBeCloseTo(10);expect(bounds.min.z).toBeCloseTo(5.7);expect(bounds.max.z).toBeCloseTo(8);expect(model.workstations).toHaveLength(6);
    }finally{model.dispose();}
  });
  it.each([1,2,3,4])('阶段%i关闭或切换后完整释放共享几何、材质与离线纹理，重复释放不重做',stage=>{
    const context=buildOfficeSurroundings(COMPANY_OFFICES[stage-1]!),resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
    context.root.traverse(object=>{if(object instanceof THREE.Mesh){resources.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){resources.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)resources.add(value);}}});
    expect(resources.size).toBeGreaterThan(20);expect([...resources].some(resource=>resource instanceof THREE.DataTexture)).toBe(true);
    const disposals=new Map<object,number>();for(const resource of resources)resource.addEventListener('dispose',()=>{disposals.set(resource,(disposals.get(resource)??0)+1);});
    context.dispose();context.dispose();expect(context.root.children).toHaveLength(0);for(const resource of resources)expect(disposals.get(resource)).toBe(1);
  });
  it.each([1,2])('阶段%i是共享楼层房间，门外走廊连通且有其他公司入口',stage=>{
    const plan=COMPANY_OFFICES[stage-1]!,model=buildCompanyOffice(plan);
    try{
      model.root.updateMatrixWorld(true);const corridor=model.root.getObjectByName('shared-office-corridor')!;
      expect(corridor).toBeDefined();expect(corridor.children.filter(o=>o.name.startsWith('neighbour-company-'))).toHaveLength(3);
      const floor=new THREE.Box3().setFromObject(corridor.getObjectByName('corridor-floor')!);
      expect(floor.min.z).toBeLessThanOrEqual(plan.entry[1]+.1);expect(floor.max.z).toBeGreaterThan(plan.entry[1]+2);
      expect(model.root.getObjectByName('highrise-city-view')).toBeUndefined();expect(model.root.getObjectByName('private-floor-elevator-cabin')).toBeUndefined();
      expect(model.address).toEqual(OFFICE_ADDRESSES[stage-1]);
    }finally{model.dispose();}
  });
  it('大办公室为高层套间，窗框通透，城市背景不改变工位或相机取景尺度',()=>{
    const plan=COMPANY_OFFICES[2]!,model=buildCompanyOffice(plan);
    try{
      expect(model.address.floor).toBeGreaterThan(10);expect(model.root.getObjectByName('highrise-arrival-lobby')).toBeDefined();
      expect(model.root.getObjectByName('office-district-background')).toBeDefined();expect(model.root.getObjectByName('panoramic-window')).toBeUndefined();expect(model.root.getObjectByName('window-mullion')).toBeDefined();
      expect(model.framingBounds.getSize(new THREE.Vector3()).x).toBeLessThan(plan.size[0]+2);expect(model.workstations).toHaveLength(10);
    }finally{model.dispose();}
  });
  it('整层只连接本层电梯，不生成邻公司走廊，城市在本层下方；电梯保持出口交互归属',async()=>{
    const model=buildCompanyOffice(COMPANY_OFFICES[3]!);
    try{
      expect(model.root.getObjectByName('private-floor-elevator-cabin')).toBeDefined();expect(model.root.getObjectByName('shared-office-corridor')).toBeUndefined();expect(model.root.getObjectByName('highrise-city-view')).toBeUndefined();
      expect(model.entry.userData).toMatchObject({seat:-1,officeExit:true,elevator:true});await model.prepare(async()=>{});expect(model.entry.userData.elevator).toBe(true);
    }finally{model.dispose();}
  });
});
