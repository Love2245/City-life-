import * as THREE from 'three';
import type {OfficePlan} from '../game/core/companyOffice';

/** The camera explores one office and its threshold, never the surrounding district. */
export function officeCameraLimits(plan:OfficePlan,center:THREE.Vector3,defaultDistance:number){
  const radius=Math.min(1.2,Math.max(...plan.size)*.12);
  return {minTarget:[center.x-radius,.3,center.z-radius*.65],maxTarget:[center.x+radius,.3,center.z+radius*.65],
    minDistance:defaultDistance*.64,maxDistance:defaultDistance*1.2,minPolarAngle:Math.PI*.17,maxPolarAngle:Math.PI*.29};
}
export function constrainOfficeCamera(camera:THREE.PerspectiveCamera,target:THREE.Vector3,limits:ReturnType<typeof officeCameraLimits>){
  const old=target.clone();target.set(THREE.MathUtils.clamp(target.x,limits.minTarget[0]!,limits.maxTarget[0]!),.3,THREE.MathUtils.clamp(target.z,limits.minTarget[2]!,limits.maxTarget[2]!));
  camera.position.add(target.clone().sub(old));
  const offset=camera.position.clone().sub(target),spherical=new THREE.Spherical().setFromVector3(offset);
  spherical.radius=THREE.MathUtils.clamp(spherical.radius,limits.minDistance,limits.maxDistance);
  spherical.phi=THREE.MathUtils.clamp(spherical.phi,limits.minPolarAngle,limits.maxPolarAngle);
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));camera.lookAt(target);
}
