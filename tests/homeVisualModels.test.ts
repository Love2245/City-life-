import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { homeVisualLightScheme, prepareHomeVisualModel, type HomeVisualModel } from '../src/lib/homeVisualModels';
import { homeLightScheme } from '../src/game/core/homeLighting';

describe('optional home visual models', () => {
  const spec: HomeVisualModel = { id: 'study-model', url: '/study/model.glb', size: [1, 1.2, .8], offset: [.3, .025, -.2] };
  it('keeps an offset imported model on the floor, within its footprint, without changing the template', () => {
    const geometry = new THREE.BoxGeometry(4, 2, 1).translate(3, 7, -2);
    const template = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const original = new THREE.Box3().setFromObject(template);
    const prepared = prepareHomeVisualModel(template, spec, 'kitchen')!;
    const bounds = new THREE.Box3().setFromObject(prepared.model), size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(.025);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(.3);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(-.2);
    size.toArray().forEach((value, axis) => expect(value).toBeLessThanOrEqual(spec.size[axis] + 1e-8));
    expect(new THREE.Box3().setFromObject(template).equals(original)).toBe(true);
    expect(template.userData.homeSharedModel).toBeUndefined();
    expect(prepared.model.userData.homeVisualModel).toBe('study-model');
  });
  it('fits a rotated curtain to its requested width and height without stretching the wrong axis', () => {
    const template = new THREE.Mesh(new THREE.BoxGeometry(.2, 2, 4), new THREE.MeshStandardMaterial());
    const prepared = prepareHomeVisualModel(template, { ...spec, size: [2.6, 2.12, .16], rotation: Math.PI / 2, stretch: true })!;
    const bounds = new THREE.Box3().setFromObject(prepared.model), size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2.6);
    expect(size.y).toBeCloseTo(2.12);
    expect(size.z).toBeCloseTo(.16);
    expect(bounds.min.y).toBeCloseTo(.025);
  });
  it('mirrors an asymmetric kitchen along its run while keeping the front and the cached template intact', () => {
    const template = new THREE.Group();
    const stove = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .3));
    stove.name = 'stove';stove.position.set(-.7, .2, .15);template.add(stove);
    const sink = stove.clone();sink.name='sink';sink.position.x=.7;template.add(sink);
    const normal = prepareHomeVisualModel(template, { ...spec, size:[2,1,1] })!;
    const mirrored = prepareHomeVisualModel(template, { ...spec, size:[2,1,1], mirrorX:true })!;
    const position = (model:THREE.Object3D, name:string) => model.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
    expect(position(normal.model,'stove').x).toBeLessThan(position(normal.model,'sink').x);
    expect(position(mirrored.model,'stove').x).toBeGreaterThan(position(mirrored.model,'sink').x);
    expect(position(mirrored.model,'stove').z).toBeCloseTo(position(normal.model,'stove').z);
    expect(stove.position.x).toBe(-.7);expect(template.scale.x).toBe(1);
  });
  it('gives each window its own clipping materials while preserving shared source textures and geometry', () => {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const template = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    const firstPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.65), secondPlane = firstPlane.clone();
    const first = prepareHomeVisualModel(template, spec, undefined, [firstPlane])!;
    const second = prepareHomeVisualModel(template, spec, undefined, [secondPlane])!;
    const firstMaterial = first.ownedMaterials[0] as THREE.MeshStandardMaterial;
    const secondMaterial = second.ownedMaterials[0] as THREE.MeshStandardMaterial;
    firstPlane.constant = .18;
    expect(firstMaterial.clippingPlanes![0].constant).toBe(.18);
    expect(secondMaterial.clippingPlanes![0].constant).toBe(2.65);
    expect(material.clippingPlanes).toBeNull();
    expect(firstMaterial.map).toBe(material.map);
    expect(firstMaterial).not.toBe(secondMaterial);
  });
  it('rejects empty geometry and invalid footprints so the existing room can retain its fallback', () => {
    expect(prepareHomeVisualModel(new THREE.Group(), spec)).toBeUndefined();
    const template = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    expect(prepareHomeVisualModel(template, { ...spec, size: [0, 1, 1] })).toBeUndefined();
  });
});

describe('furniture tier materials', () => {
  it('recolors fabric through an instance material while preserving the source atlas, pillow and cached shader', () => {
    const source = new THREE.MeshStandardMaterial({map:new THREE.Texture()});source.name='chair01_4';
    const originalShader=source.onBeforeCompile,template=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),source);
    const spec:HomeVisualModel={id:'sofa',url:'sofa.glb',size:[1,1,1],upholsteryColors:{chair01_4:'#c8bea5'}};
    const prepared=prepareHomeVisualModel(template,spec)!,material=prepared.ownedMaterials[0] as THREE.MeshStandardMaterial;
    expect(material.map).toBe(source.map);expect(source.onBeforeCompile).toBe(originalShader);expect(source.color.getHexString()).toBe('ffffff');
    const shader={fragmentShader:'#include <map_fragment>'} as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('texture2D');expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(material.customProgramCacheKey()).not.toBe(source.customProgramCacheKey());
    template.geometry.dispose();source.map!.dispose();source.dispose();prepared.ownedMaterials.forEach(material=>material.dispose());
  });
  it('changes the selected bedding color without recoloring the cached model, other tiers or its textures', () => {
    const spec: HomeVisualModel = { id: 'bed', url: 'bed.glb', size: [1, 1, 1] };
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: new THREE.Texture() });
    material.name = 'blanket01_3';
    const template = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    const first = prepareHomeVisualModel(template, { ...spec, materialColors: { blanket01_3: '#9daebb' } })!;
    const second = prepareHomeVisualModel(template, { ...spec, materialColors: { blanket01_3: '#c4bca7' } })!;
    const firstMaterial = first.ownedMaterials[0] as THREE.MeshStandardMaterial, secondMaterial = second.ownedMaterials[0] as THREE.MeshStandardMaterial;
    expect(firstMaterial.color.getHexString()).toBe('9daebb'); expect(secondMaterial.color.getHexString()).toBe('c4bca7');
    expect(material.color.getHexString()).toBe('ffffff'); expect(firstMaterial.map).toBe(material.map);
    first.ownedMaterials.forEach(material => material.dispose()); second.ownedMaterials.forEach(material => material.dispose());
    template.geometry.dispose(); material.map!.dispose(); material.dispose();
  });
});

describe('optional reference daylight', () => {
  const profile={bounceScale:.60,windowScale:.70,keyScale:3.4,shadowScale:2.1,environmentIntensity:.16};
  it('keeps normal residences and night lighting unchanged', () => {
    const day=homeLightScheme(12,9,'sunny'),night=homeLightScheme(23,9,'sunny');
    expect(homeVisualLightScheme(day)).toBe(day);
    expect(homeVisualLightScheme(night,profile)).toBe(night);
  });
  it('reduces all-around fill, strengthens directional shadows and preserves weather differences', () => {
    const original=homeLightScheme(12,9,'sunny'),day=homeVisualLightScheme(original,profile);
    const rainy=homeVisualLightScheme(homeLightScheme(12,9,'rain'),profile);
    expect(day.bounce).toBeLessThan(original.bounce);
    expect(day.windowIntensity).toBeLessThan(original.windowIntensity);
    expect(day.keyIntensity).toBeGreaterThan(original.keyIntensity);
    expect(day.shadowIntensity).toBeGreaterThan(original.shadowIntensity);
    expect(day.shadowIntensity).toBeLessThanOrEqual(.8);
    expect(rainy.keyIntensity).toBeLessThan(day.keyIntensity);
    expect(original.bounce).toBeCloseTo(1.12);
  });
});
