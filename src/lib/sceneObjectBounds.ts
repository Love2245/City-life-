import type {Object3D,Vector3} from 'three';

/** PC registries use the owner's existing vectors; reading facility definitions
 * on a phone must not import the Three runtime just to build a label. */
export function sceneObjectBoundsCenter(root:Object3D):Vector3 {
  root.updateWorldMatrix(true,true);
  const minimum=root.position.clone().set(Infinity,Infinity,Infinity),maximum=root.position.clone().set(-Infinity,-Infinity,-Infinity),point=root.position.clone();
  let found=false;
  root.traverse(object=>{
    const mesh=object as Object3D&{geometry?:{boundingBox?:{min:Vector3;max:Vector3}|null;computeBoundingBox?:()=>void};boundingBox?:{min:Vector3;max:Vector3}|null;isInstancedMesh?:boolean;computeBoundingBox?:()=>void};
    if(!mesh.geometry)return;
    if(mesh.isInstancedMesh&&!mesh.boundingBox)mesh.computeBoundingBox?.();
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox?.();
    const bounds=mesh.boundingBox??mesh.geometry.boundingBox;if(!bounds)return;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      point.set(x,y,z).applyMatrix4(object.matrixWorld);minimum.min(point);maximum.max(point);found=true;
    }
  });
  return found?minimum.add(maximum).multiplyScalar(.5):root.getWorldPosition(point);
}
