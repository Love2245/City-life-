import { Box3, PerspectiveCamera, Vector3 } from 'three';

/** Fit the complete entry/courtyard in a perspective view, including narrow phones. */
export function homeExteriorDistance(camera: PerspectiveCamera, bounds: Box3, target: [number,number], yaw: number, aspect: number) {
  const test=camera.clone();test.aspect=aspect;test.far=200;test.updateProjectionMatrix();
  const corners:Vector3[]=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new Vector3(x,y,z));
  let distance=4;
  for(let step=0;step<50;step++,distance*=1.07){
    test.position.set(target[0]+Math.sin(yaw)*distance,.62+distance*.91,target[1]+Math.cos(yaw)*distance);
    test.rotation.set(-Math.atan(.91),yaw,0,'YXZ');test.updateMatrixWorld();
    if(corners.every(p=>{const q=p.clone().project(test);return Math.abs(q.x)<.88&&Math.abs(q.y)<.80&&q.z>-1&&q.z<1;}))break;
  }
  return Math.min(100,distance);
}
