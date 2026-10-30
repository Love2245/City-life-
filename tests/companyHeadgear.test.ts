import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOfficeFurniture, OFFICE_HEADGEAR, officeWorkerAppearance } from '../src/lib/companyOfficeFurniture';

function signature(group: THREE.Group) {
  return group.children.map(item => {
    const mesh = item as THREE.Mesh;
    return { shape: mesh.geometry.uuid, material: (mesh.material as THREE.Material).uuid };
  });
}

describe('公司员工可替换头套', () => {
  it('完整头套保留坐姿身体，不创建人脸、头发、真人耳鼻或脖子', () => {
    const factory = createOfficeFurniture();
    try {
      OFFICE_HEADGEAR.forEach((headgear, index) => {
        const worker = factory.worker(index, 1);
        expect(worker.userData.headgear).toBe(headgear);
        const parts = worker.userData.parts as string[];
        expect(parts).toContain('employee-shirt-torso');
        expect(parts).toContain('employee-hand');
        expect(parts.some(part => /^headgear-/.test(part))).toBe(true);
        expect(parts.filter(part => /^employee-(head|neck|hair|eye|ear|nose|spectacle)/.test(part))).toEqual([]);
        const bounds = new THREE.Box3().setFromObject(worker, true);
        expect(bounds.min.y).toBeGreaterThanOrEqual(0);
        expect(bounds.max.y).toBeGreaterThan(1.54);
        expect(bounds.max.y).toBeLessThan(1.75);
        worker.traverse(item => {
          if (!(item instanceof THREE.Mesh) || Array.isArray(item.material)) return;
          const color = (item.material as THREE.MeshStandardMaterial).color.getHexString();
          // Only exposed hands/forearms can use skin, all below the collar.
          if (['cfa98a', 'c3a184', 'd8b799'].includes(color)) {
            expect(new THREE.Box3().setFromObject(item, true).max.y).toBeLessThan(1.1);
          }
        });
      });
    } finally { factory.dispose(); }
  });

  it('员工 ID 决定外观，工位变动、升星、离职后数组换位均不改变外观或重复分配资源', () => {
    const factory = createOfficeFurniture();
    try {
      const first = factory.worker(1, 1, 'company-employee-persistent-008');
      const moved = factory.worker(12, 5, 'company-employee-persistent-008');
      expect(officeWorkerAppearance(1, 'company-employee-persistent-008'))
        .toEqual(officeWorkerAppearance(12, 'company-employee-persistent-008'));
      expect(moved.userData).toEqual(first.userData);
      expect(signature(moved)).toEqual(signature(first));
      expect(moved.uuid).not.toBe(first.uuid);
      expect(new Set(Array.from({ length: 300 }, (_, i) => officeWorkerAppearance(i, `employee-${i}`).headgear)))
        .toEqual(new Set(OFFICE_HEADGEAR));
    } finally { factory.dispose(); }
  });

  it('纸袋具有眼孔与折边，动物头套具有耳部与封闭壳体，罐头具有卷边和拉环', () => {
    const factory = createOfficeFurniture();
    try {
      const parts = OFFICE_HEADGEAR.map((_, i) => factory.worker(i, 3).userData.parts as string[]);
      expect(parts[0]).toEqual(expect.arrayContaining(['headgear-paper-front-cutouts', 'headgear-paper-gusset', 'headgear-paper-top-fold', 'headgear-paper-rolled-edge']));
      ['cat', 'fox', 'bear'].forEach((type, i) => {
        expect(parts[i + 1]).toEqual(expect.arrayContaining([`headgear-${type}-shell`, `headgear-${type}-neck-cover`]));
        expect(parts[i + 1]!.some(part => /ear/.test(part))).toBe(true);
      });
      expect(parts[4]).toEqual(expect.arrayContaining(['headgear-can-shell', 'headgear-can-top', 'headgear-can-pull-tab', 'headgear-can-rolled-rim', 'headgear-can-label']));
      const bag = factory.worker(0, 3);bag.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(.066, 1.378, -1), new THREE.Vector3(0, 0, 1));
      const throughHole = ray.intersectObject(bag, true)[0]!;
      expect(throughHole).toBeDefined();
      // The first surface through an eye cut-out is recessed dark lining.
      expect(throughHole.point.z).toBeCloseTo(-.176, 3);
      expect(((throughHole.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('364b46');
    } finally { factory.dispose(); }
  });

  it('人物均按材质合并、共享缓存，无贴图和外部资源，幂等释放所有可见几何与材质', () => {
    const factory = createOfficeFurniture(), resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const counts = new Map<THREE.BufferGeometry | THREE.Material, number>();
    const workers = OFFICE_HEADGEAR.map((_, i) => factory.worker(i, 3));
    for (const worker of workers) {
      expect(worker.children.length).toBeLessThanOrEqual(11);
      let triangles = 0;
      worker.traverse(item => {
        if (!(item instanceof THREE.Mesh)) return;
        triangles += (item.geometry.index?.count ?? item.geometry.getAttribute('position').count) / 3;
        resources.add(item.geometry);
        for (const mat of Array.isArray(item.material) ? item.material : [item.material]) {
          resources.add(mat); expect(Object.values(mat).some(value => value instanceof THREE.Texture)).toBe(false);
        }
      });
      expect(triangles).toBeLessThan(20000);
    }
    for (const resource of resources) {
      counts.set(resource, 0);
      resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
    }
    factory.dispose(); factory.dispose();
    for (const count of counts.values()) expect(count).toBe(1);
    expect(() => factory.worker(0, 1)).toThrow(/disposed/);
  });
});
