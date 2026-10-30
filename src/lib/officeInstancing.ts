import * as THREE from 'three';

/** Share repeated desk/computer surfaces across seats without losing which
 * workstation a raycast hit belongs to. Dynamic seat updates can rebuild it. */
export function createOfficeInstances(root:THREE.Group,workstations:THREE.Group[]){
  const removed:{mesh:THREE.Mesh;parent:THREE.Object3D}[]=[],batches:THREE.InstancedMesh[]=[];
  function restore(){
    for(const batch of batches){batch.removeFromParent();batch.dispose();}
    batches.length=0;
    for(const {mesh,parent}of removed)parent.add(mesh);
    removed.length=0;
  }
  function rebuild(){
    restore();root.updateWorldMatrix(true,true);
    const inverse=root.matrixWorld.clone().invert();
    const groups=new Map<string,{mesh:THREE.Mesh;seat:number}[]>();
    workstations.forEach((station,seat)=>station.traverseVisible(object=>{
      if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||object instanceof THREE.SkinnedMesh||Array.isArray(object.material)||object.material.transparent||object.material.clippingPlanes?.length)return;
      const key=[object.geometry.uuid,object.material.uuid,object.castShadow,object.receiveShadow,object.renderOrder].join(':');
      const group=groups.get(key)??[];group.push({mesh:object,seat});groups.set(key,group);
    }));
    for(const entries of groups.values()){
      if(entries.length<3)continue;
      const first=entries[0].mesh,batch=new THREE.InstancedMesh(first.geometry,first.material,entries.length);
      batch.name='instanced-office-surfaces';batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.renderOrder=first.renderOrder;
      batch.userData.officeSeats=entries.map(entry=>entry.seat);
      entries.forEach(({mesh},index)=>{
        batch.setMatrixAt(index,new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
        removed.push({mesh,parent:mesh.parent!});mesh.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();root.add(batch);batches.push(batch);
    }
    return removed.length-batches.length;
  }
  return {restore,rebuild,pickables:()=>batches,dispose:restore};
}
