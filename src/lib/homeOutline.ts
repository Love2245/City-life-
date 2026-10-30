import * as THREE from 'three';
import type {HomeQuality} from './homeQuality';
import {createScenePipeline,type SceneQuality} from './scenePipeline';

export function createHomeOutline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,shadowOnly:THREE.Object3D[],contactShadows=false,quality?:HomeQuality){
  const q:SceneQuality={id:quality?.id??'light',pixelRatio:quality?.pixelRatio??1,samples:quality?.samples??0,shadowSize:quality?.windowShadowSize??512,anisotropy:quality?.anisotropy??2,aoScale:.6,maxPixels:quality?.maxPixels??1_000_000};
  return createScenePipeline(renderer,scene,camera,shadowOnly,q,contactShadows);
}
