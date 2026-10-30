import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { COMPANY_STAGES } from '../src/game/core/companyConfig';
import { COMPANY_OFFICES, type OfficePlan, type OfficeSeat } from '../src/game/core/companyOffice';
import { buildCompanyOffice } from '../src/lib/companyOffice3D';

type OfficeModel = ReturnType<typeof buildCompanyOffice>;

function occupied(plan: OfficePlan): OfficeSeat[] {
  return plan.desks.map((_, index) => ({
    index, personId: index ? `employee-${index}` : 'founder',
    name: index ? `员工${String.fromCharCode(64 + index)}` : '主角',
    tier: (['low', 'mid', 'high'] as const)[index % 3],
    status: index ? '编程中' : '主角工位', present: true, stars: index % 5 + 1,
  }));
}

function contents(model: OfficeModel) {
  return model.workstations.map((desk, index) => ({
    desk: desk.uuid,
    equipment: desk.getObjectByName(`equipment-${index}`)!.children.map(child => child.uuid),
    people: desk.getObjectByName(`person-${index}`)!.children.map(child => child.uuid),
  }));
}

function meshCount(object: THREE.Object3D): number {
  let count = 0;
  object.traverse(item => { if (item instanceof THREE.Mesh) count++; });
  return count;
}

function triangles(object: THREE.Object3D): number {
  let count = 0;
  object.traverse(item => {
    if (item instanceof THREE.Mesh) count += (item.geometry.index?.count ?? item.geometry.getAttribute('position').count) / 3;
  });
  return count;
}

function seatAncestor(object: THREE.Object3D): number | undefined {
  let target: THREE.Object3D | null = object;
  while (target && target.userData.seat === undefined) target = target.parent;
  return target?.userData.seat;
}

describe('公司办公室布局与可见家具边界', () => {
  it('高级办公室有可进入的独立负责人办公室，团队工位成组并保留原工位编号', () => {
    for(const [stage,wall,doorStart,doorEnd] of [[3,4.8,2.8,4],[4,5.7,3.7,5]] as const){
      const plan=COMPANY_OFFICES[stage-1]!,model=buildCompanyOffice(plan);
      try{
        expect(plan.zones.some(zone=>zone.name==='负责人办公室')).toBe(true);
        expect(plan.partitions).toContainEqual([0,wall,doorStart,wall]);
        expect(plan.partitions.some(([x1,z1,x2,z2])=>x1===doorEnd&&z1===wall&&z2===wall&&x2>doorEnd)).toBe(true);
        expect(plan.desks[0]![0]).toBeLessThan(doorEnd+1.3);expect(plan.desks[0]![1]).toBeLessThan(wall);
        expect(model.workstations.map(desk=>desk.userData.seat)).toEqual(plan.desks.map((_,i)=>i));
        expect(new Set(plan.deskRotations)).toEqual(new Set([0,Math.PI,-Math.PI/2,Math.PI/2]));
        const team=plan.desks.slice(1);
        for(const [i,seat] of team.entries())expect(Math.min(...team.filter((_,j)=>j!==i).map(other=>Math.hypot(seat[0]-other[0],seat[1]-other[1])))).toBeLessThan(2.2);
        expect(model.root.getObjectByName('founder-office-door-lintel')).toBeDefined();
      }finally{model.dispose();}
    }
    const [large,floor]=COMPANY_OFFICES.slice(2).map(p=>p.zones.find(z=>z.name==='负责人办公室')!.rect);
    expect(floor![2]*floor![3]).toBeGreaterThan(large![2]*large![3]);
  });

  it('桌沿与木质桌面顶部不共面，移动视角不会因两层重叠而闪烁', () => {
    const model=buildCompanyOffice(COMPANY_OFFICES[2]!);
    try{
      model.root.updateMatrixWorld(true);
      const desk=model.workstations[1]!,[x,z]=COMPANY_OFFICES[2]!.desks[1]!;
      const hits=new THREE.Raycaster(new THREE.Vector3(x+.1,2,z+.1),new THREE.Vector3(0,-1,0)).intersectObject(desk,true);
      const top=(hex:string)=>hits.find(hit=>hit.object instanceof THREE.Mesh&&!Array.isArray(hit.object.material)&&(hit.object.material as THREE.MeshStandardMaterial).color.getHexString()===hex)?.point.y;
      expect(top('c8b99b')).toBeCloseTo(.805,3);expect(top('958369')).toBeCloseTo(.797,3);
      expect(top('c8b99b')!).toBeGreaterThan(top('958369')!);
    }finally{model.dispose();}
  });

  it.each(COMPANY_STAGES)('阶段 $stage 的实际工位数和主要家具均符合地板空间', stage => {
    const plan = COMPANY_OFFICES[stage.stage - 1]!, model = buildCompanyOffice(plan);
    try {
      expect(model.workstations).toHaveLength(stage.capacity);
      expect(new Set(model.workstations.map(desk => desk.userData.seat)).size).toBe(stage.capacity);
      expect(model.root.children.filter(item => item.name.startsWith('workstation-'))).toHaveLength(stage.capacity);
      model.root.updateMatrixWorld(true);
      const floor = model.root.getObjectByName('office-floor')!;
      expect(floor).toBeInstanceOf(THREE.Mesh);
      const ray = new THREE.Raycaster();
      const majorFurniture: THREE.Object3D[] = [];
      model.root.traverse(item => {
        if (/^office-(founder-desk|executive-desk|desk|ergonomic-chair|meeting-table|coffee-table|reference-shelf|indoor-plant|visitors-sofa)$/.test(item.name)
          || item.name === 'collaboration-table' || item.name.startsWith('shared-print-storage-')
          || item.name.startsWith('team-acoustic-screen-')) majorFurniture.push(item);
      });
      expect(majorFurniture.length).toBeGreaterThan(stage.capacity * 2);
      for (const item of majorFurniture) {
        const bounds = new THREE.Box3().setFromObject(item, true);
        expect(bounds.isEmpty(), `${item.name} should contain visible geometry`).toBe(false);
        // Test the rendered floor itself, including the notches in stages 2/4.
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
          ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
          expect(ray.intersectObject(floor, false).length,
            `stage ${stage.stage} ${item.name} extends beyond floor at ${x.toFixed(3)},${z.toFixed(3)}`).toBeGreaterThan(0);
        }
      }
    } finally { model.dispose(); }
  });

  it.each([3,4])('阶段 %i 满员时桌椅互不相交，工位利用纵深并给主通道留出净空', stage => {
    const plan=COMPANY_OFFICES[stage-1]!,model=buildCompanyOffice(plan);
    try{
      model.update(occupied(plan));model.root.updateMatrixWorld(true);
      const bounds=model.workstations.map(desk=>new THREE.Box3().setFromObject(desk,true));
      for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
        expect(bounds[i]!.intersectsBox(bounds[j]!),`workstations ${i} and ${j} overlap`).toBe(false);
      }
      const depths=plan.desks.slice(1).map(p=>p[1]);
      expect(Math.max(...depths)-Math.min(...depths)).toBeGreaterThan(plan.size[1]*.35);
      // These corridors connect the entrance apron to the window/collaboration area.
      const lane=stage===3?new THREE.Box3(new THREE.Vector3(10,0,4.8),new THREE.Vector3(11.2,2,11))
        :new THREE.Box3(new THREE.Vector3(10.3,0,5.8),new THREE.Vector3(11.7,2,15.1));
      for(const [i,box]of bounds.entries())expect(box.intersectsBox(lane),`workstation ${i} blocks main aisle`).toBe(false);
      const shared=model.root.getObjectByName('shared-print-storage-0');expect(shared).toBeDefined();
      expect(new THREE.Box3().setFromObject(shared!,true).intersectsBox(lane)).toBe(false);
    }finally{model.dispose();}
  });

  it.each([3,4])('阶段 %i 的负责人拥有独立办公与会客家具，靠墙家具和访客座位互不相交', stage => {
    const plan=COMPANY_OFFICES[stage-1]!,model=buildCompanyOffice(plan);
    try{
      const desk=model.workstations[0]!.getObjectByName('office-executive-desk')!;expect(desk).toBeDefined();
      expect(desk.userData.parts).toEqual(expect.arrayContaining(['executive-side-storage','executive-leather-desk-pad','executive-task-lamp-shade','executive-file-drawer']));
      expect(plan.deskRotations?.[0]).toBe(Math.PI);
      const suite=model.root.getObjectByName('founder-office-suite')!;expect(suite).toBeDefined();
      expect(suite.children.filter(o=>o.name==='office-ergonomic-chair')).toHaveLength(stage===4?2:1);
      expect(suite.getObjectByName('office-coffee-table')).toBeDefined();
      const sofa=suite.getObjectByName('office-visitors-sofa')!;
      model.root.updateMatrixWorld(true);
      const sofaBounds=new THREE.Box3().setFromObject(sofa,true);expect(sofaBounds.min.x).toBeGreaterThan(.1);expect(sofaBounds.min.x).toBeLessThan(.25);
      const items=[model.workstations[0]!,...suite.children.filter(o=>o.name!=='founder-meeting-rug')];
      const bounds=items.map(o=>new THREE.Box3().setFromObject(o,true));
      for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++)expect(bounds[i]!.intersectsBox(bounds[j]!),`${items[i]!.name} intersects ${items[j]!.name}`).toBe(false);
    }finally{model.dispose();}
  });

  it('四种办公室的接待沙发靠墙，临窗员工桌保留窗台余量与椅后空间',()=>{
    for(const plan of COMPANY_OFFICES){
      const model=buildCompanyOffice(plan);
      try{
        model.root.updateMatrixWorld(true);
        const sofa=model.root.getObjectByName('office-visitors-sofa')!,bounds=new THREE.Box3().setFromObject(sofa,true);
        expect(bounds.min.x).toBeGreaterThan(.1);expect(bounds.min.x).toBeLessThan(.25);
        const windowSeats=plan.desks.map((p,i)=>({p,i})).filter(({p,i})=>p[1]<1&&i>0);
        if(plan.stage!==4)expect(windowSeats.length).toBeGreaterThan(0);
        for(const {i}of windowSeats){const box=new THREE.Box3().setFromObject(model.workstations[i]!,true);expect(box.min.z).toBeGreaterThan(.3);expect(box.min.z).toBeLessThan(.45);expect(box.max.z).toBeLessThan(2);}
      }finally{model.dispose();}
    }
  });
});

describe('办公室增量状态更新', () => {
  it('重复快照、改名与文字状态变化不重新创建电脑和人物', () => {
    const plan = COMPANY_OFFICES[3]!, model = buildCompanyOffice(plan), seats = occupied(plan);
    try {
      expect(model.update(seats)).toBe(true);
      const before = contents(model);
      expect(model.update(seats)).toBe(false);
      expect(model.update(seats.map(seat => ({ ...seat })))).toBe(false);
      expect(model.update(seats.map(seat => ({ ...seat, name: `待定 ${seat.index}`, status: '维护中 · 办公电脑' })))).toBe(false);
      expect(contents(model)).toEqual(before);
    } finally { model.dispose(); }
  });

  it('只升级一个工位的电脑，其他设备和所有人物对象保持不变', () => {
    const plan = COMPANY_OFFICES[2]!, model = buildCompanyOffice(plan), seats = occupied(plan);
    try {
      model.update(seats);
      const before = contents(model), target = 3;
      expect(model.update(seats.map(seat => seat.index === target ? { ...seat, tier: 'high' } : seat))).toBe(true);
      const after = contents(model);
      after.forEach((seat, index) => {
        expect(seat.desk).toBe(before[index]!.desk);
        expect(seat.people).toEqual(before[index]!.people);
        if (index === target) expect(seat.equipment).not.toEqual(before[index]!.equipment);
        else expect(seat.equipment).toEqual(before[index]!.equipment);
      });
      expect(model.workstations[target]!.getObjectByName('computer-premium-procedural-fallback')).toBeDefined();
    } finally { model.dispose(); }
  });

  it('主角始终不显示人物，夜间只移除员工并保留电脑和工位；次日员工重新出现', () => {
    const plan = COMPANY_OFFICES[1]!, model = buildCompanyOffice(plan), seats = occupied(plan);
    try {
      model.update(seats);
      const before = contents(model);
      expect(before[0]!.people).toEqual([]);
      const night = seats.map(seat => ({ ...seat, present: seat.index === 0, status: '休息中' }));
      expect(model.update(night)).toBe(true);
      contents(model).forEach((seat, index) => {
        expect(seat.equipment).toEqual(before[index]!.equipment);
        expect(seat.desk).toBe(before[index]!.desk);
        expect(seat.people).toEqual(index === 0 ? before[index]!.people : []);
      });
      expect(model.update(night)).toBe(false);
      expect(model.update(seats)).toBe(true);
      expect(contents(model).every((seat,index) => seat.people.length === (index===0?0:1))).toBe(true);
      expect(contents(model).map(seat => seat.equipment)).toEqual(before.map(seat => seat.equipment));
    } finally { model.dispose(); }
  });
});

describe('办公室批处理、点击与释放', () => {
  it('分段批处理减少静态 mesh，保留每个工位的可见形状与点击归属', async () => {
    const plan = COMPANY_OFFICES[3]!, model = buildCompanyOffice(plan);
    try {
      model.update(occupied(plan));
      const owners = [...model.workstations];
      const before = owners.map(desk => new THREE.Box3().setFromObject(desk, true));
      const beforeMeshes = meshCount(model.root), beforeTriangles = triangles(model.root);
      const checkpoint = vi.fn(async () => {});
      await model.prepare(checkpoint);
      expect(checkpoint.mock.calls.length).toBeGreaterThan(100);
      expect(meshCount(model.root)).toBeLessThan(beforeMeshes * .7);
      expect(triangles(model.root)).toBe(beforeTriangles);
      expect(model.workstations).toEqual(owners);
      model.root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      model.workstations.forEach((desk, index) => {
        const after = new THREE.Box3().setFromObject(desk, true);
        expect(after.min.distanceTo(before[index]!.min)).toBeLessThan(1e-4);
        expect(after.max.distanceTo(before[index]!.max)).toBeLessThan(1e-4);
        expect(meshCount(desk)).toBeGreaterThan(0);
        const tabletopPoint=desk.localToWorld(new THREE.Vector3(.62,4,.29));
        ray.set(tabletopPoint, new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(model.workstations, true)[0];
        expect(hit, `workstation ${index} should remain pickable after merging`).toBeDefined();
        expect(seatAncestor(hit!.object)).toBe(index);
      });
      // Preparation must not turn a later clock/status update into a full rebuild.
      const stable = contents(model);
      expect(model.update(occupied(plan).map(seat => ({ ...seat, status: '等待立项' })))).toBe(false);
      expect(contents(model)).toEqual(stable);
    } finally { model.dispose(); }
  });

  it('初始和合并后的几何、材质、贴图都能释放，重复 dispose 不重复释放', async () => {
    const model = buildCompanyOffice(COMPANY_OFFICES[0]!);
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    const signals = new Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>();
    function track() {
      model.root.traverse(item => {
        if (!(item instanceof THREE.Mesh)) return;
        resources.add(item.geometry);
        for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
          resources.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
        }
      });
      for (const resource of resources) {
        if (signals.has(resource)) continue;
        signals.set(resource, 0);
        resource.addEventListener('dispose', () => signals.set(resource, signals.get(resource)! + 1));
      }
    }
    try {
      model.update(occupied(COMPANY_OFFICES[0]!)); track();
      await model.prepare(async () => {}); track();
      expect([...resources].some(value => value instanceof THREE.Texture)).toBe(true);
      expect(resources.size).toBeGreaterThan(50);
      model.dispose();
      expect(model.root.children).toHaveLength(0);
      for (const resource of resources) expect(signals.get(resource), `${resource.type} ${resource.uuid} should be released once`).toBe(1);
      model.dispose();
      for (const resource of resources) expect(signals.get(resource)).toBe(1);
    } finally { model.dispose(); }
  });
});
