import * as THREE from 'three';
import type { HomeFixture, HomeObjectKind, HomePoint, HomeWindow } from '../game/core/homeInterior';
import type { HomeLightScheme } from '../game/core/homeLighting';
import type { HomeRoomObject } from './homeRoom3D';
import type { HomeQuality } from './homeQuality';

export interface HomeVisualModel {
  id: string;
  url: string;
  size: [number, number, number];
  offset?: [number, number, number];
  rotation?: number;
  stretch?: boolean;
  mirrorX?: boolean;
  materialColors?: Record<string, string>;
  upholsteryColors?: Record<string, string>;
  /** This cushion atlas has patterned fabric above, printed beige fabric below. */
  plainCushionMaterials?: string[];
}

export interface HomeVisualLighting {
  bounceScale: number;
  windowScale: number;
  keyScale: number;
  shadowScale: number;
  environmentIntensity: number;
  windowAim?: 'room';
}

export interface HomeVisualAddition {
  model: HomeVisualModel;
  position: HomePoint;
  rotation?: number;
  owner?: HomeObjectKind;
  /** Local additions follow the owner's saved position, rotation and scale. */
  attachToOwner?: boolean;
}

/** Shared visual inputs for game residences, home tours and comparison previews. */
export interface HomeRoomVisuals {
  environment?: THREE.Texture;
  daylight?: HomeVisualLighting;
  contactShadows?: boolean;
  pixelRatioCap?: number;
  renderScale?: number;
  resolution?:import('./renderResolution').RenderResolution;
  quality?: HomeQuality;
  objects?: Partial<Record<HomeObjectKind, HomeVisualModel | ((object: HomeRoomObject) => HomeVisualModel | undefined)>>;
  fixtures?: Partial<Record<HomeFixture['kind'], HomeVisualModel>>;
  windows?: (window: HomeWindow) => HomeVisualModel | HomeVisualModel[];
  additions?: HomeVisualAddition[] | ((objects: HomeRoomObject[], detail?: HomeQuality['id']) => HomeVisualAddition[]);
}

/** Keep the normal residence/night scheme intact, easing the study profile in at dawn. */
export function homeVisualLightScheme(scheme: HomeLightScheme, profile?: HomeVisualLighting): HomeLightScheme {
  if (!profile || scheme.daylight <= 0) return scheme;
  const weight = Math.min(1, scheme.daylight / .35);
  const scale = (value: number) => 1 + (value - 1) * weight;
  return { ...scheme, bounce: scheme.bounce * scale(profile.bounceScale),
    windowIntensity: scheme.windowIntensity * scale(profile.windowScale),
    keyIntensity: scheme.keyIntensity * scale(profile.keyScale),
    shadowIntensity: Math.min(.8, scheme.shadowIntensity * scale(profile.shadowScale)) };
}

/** Fit a clone without changing the cached template or its authored materials. */
export function prepareHomeVisualModel(template: THREE.Object3D, spec: HomeVisualModel, kind?: HomeObjectKind, clippingPlanes?: THREE.Plane[]) {
  const model = new THREE.Group(), content = template.clone(true);
  model.add(content);
  model.name = `home-visual-${spec.id}`;
  content.rotation.y += spec.rotation ?? 0;
  if (spec.mirrorX) content.scale.x *= -1;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  if (size.toArray().some(value => !Number.isFinite(value) || value < 1e-6)) return undefined;
  const ratios = spec.size.map((value, axis) => value / size.getComponent(axis));
  if (ratios.some(value => !Number.isFinite(value) || value <= 0)) return undefined;
  if (spec.stretch) model.scale.set(...ratios as [number, number, number]);
  else model.scale.setScalar(Math.min(...ratios));
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3()), offset = spec.offset ?? [0, 0, 0];
  model.position.set(offset[0] - center.x, offset[1] - bounds.min.y, offset[2] - center.z);
  const ownedMaterials: THREE.Material[] = [];
  const clipped = new Map<THREE.Material, THREE.Material>();
  model.traverse(object => {
    object.userData.homeSharedModel = true;
    object.userData.kind = kind;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      if (clippingPlanes || spec.materialColors || spec.upholsteryColors || spec.plainCushionMaterials) {
        const source = Array.isArray(object.material) ? object.material : [object.material];
        const materials = source.map(material => {
          const cached = clipped.get(material);
          if (cached) return cached;
          const own: THREE.Material = material.clone();
          own.clippingPlanes = clippingPlanes ?? null;
          const color = spec.materialColors?.[material.name];
          if (color && own instanceof THREE.MeshStandardMaterial) own.color.set(color);
          const upholstery = spec.upholsteryColors?.[material.name];
          const plainCushion = spec.plainCushionMaterials?.includes(material.name);
          if ((upholstery || plainCushion) && own instanceof THREE.MeshStandardMaterial) {
            const tint = upholstery ? new THREE.Color(upholstery) : undefined;
            // Recolor the blue fabric in the atlas while retaining weave,
            // seams, the dark underside and brown feet. The source map stays shared.
            own.onBeforeCompile = shader => {
              let map = THREE.ShaderChunk.map_fragment;
              // Reuse the unprinted linen strip of the same atlas. Only the beige
              // half changes; the blue pattern, shared map and source GLB stay intact.
              if (plainCushion) map = map.replace('texture2D( map, vMapUv )',
                'texture2D( map, vec2(vMapUv.x, vMapUv.y < 0.5 ? vMapUv.y : 0.54 + mod(vMapUv.y - 0.5, 0.045)) )');
              if (tint) map = map.replace('diffuseColor *= sampledDiffuseColor;', `
                float clothMask = smoothstep(0.002, 0.025, sampledDiffuseColor.b - max(sampledDiffuseColor.r, sampledDiffuseColor.g));
                float clothDetail = clamp(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.042, 0.38, 1.3);
                sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(${tint.r}, ${tint.g}, ${tint.b}) * clothDetail, clothMask);
                diffuseColor *= sampledDiffuseColor;`);
              shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', map);
            };
            own.customProgramCacheKey = () => `home-fabric-${upholstery ?? ''}-${plainCushion ? 'plain' : 'original'}`;
          }
          clipped.set(material, own);
          ownedMaterials.push(own);
          return own;
        });
        object.material = Array.isArray(object.material) ? materials : materials[0];
      }
    }
  });
  model.userData.homeVisualModel = spec.id;
  model.updateMatrixWorld(true);
  return { model, ownedMaterials };
}
