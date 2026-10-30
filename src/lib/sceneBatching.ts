import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge static opaque pieces inside their existing interaction owner. Facility
 * roots, moving subgroups, transparent pieces and per-object clipping stay intact. */
function* fixtureSteps(parent:THREE.Object3D,owners:ReadonlySet<THREE.Object3D>,own:(g:THREE.BufferGeometry)=>void):Generator<void,number,unknown>{
  let removed=0;
  const temporary=new Set<THREE.BufferGeometry>();
  type Batch={material:THREE.Material;source:THREE.Mesh[];geometry:THREE.BufferGeometry[]};
  function* scope(root:THREE.Object3D):Generator<void,void,unknown>{root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),batches=new Map<string,Batch>();
    function* visit(o:THREE.Object3D):Generator<void,void,unknown>{if(o!==root&&owners.has(o)){if(o instanceof THREE.Group)yield* scope(o);return;}if(!o.visible)return;
      if(o instanceof THREE.Mesh&&!(o instanceof THREE.InstancedMesh)&&!(o instanceof THREE.SkinnedMesh)&&!Array.isArray(o.material)&&!o.material.transparent&&!o.material.clippingPlanes?.length&&!o.userData.skipContactAO){
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);if(matrix.determinant()<0)return;
        const attrs=Object.keys(o.geometry.attributes).map(key=>{const a=o.geometry.getAttribute(key);return key+':'+a.itemSize+':'+a.array.constructor.name;}).sort().join(',');
        const signature=[o.material.uuid,o.castShadow,o.receiveShadow,o.renderOrder,attrs].join('|');
        let part=0;while((batches.get(signature+':'+part)?.source.length??0)>=64)part++;
        const key=signature+':'+part,b:Batch=batches.get(key)??{material:o.material,source:[],geometry:[]};
        let g=o.geometry.clone();if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}temporary.add(g);g.applyMatrix4(matrix);b.source.push(o);b.geometry.push(g);batches.set(key,b);
        yield;
      }else for(const child of [...o.children])yield* visit(child);
    }
    for(const child of [...root.children])yield* visit(child);
    for(const b of batches.values()){if(b.source.length<2){b.geometry.forEach(g=>{g.dispose();temporary.delete(g);});continue;}const merged=mergeGeometries(b.geometry,false);b.geometry.forEach(g=>{g.dispose();temporary.delete(g);});if(!merged)continue;
      const first=b.source[0],mesh=new THREE.Mesh(merged,b.material);mesh.name='batched-static-fixture';mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.userData={...first.userData};b.source.forEach(o=>o.removeFromParent());root.add(mesh);own(merged);removed+=b.source.length-1;
      yield;
    }
  }
  try{yield* scope(parent);return removed;}finally{temporary.forEach(g=>g.dispose());}
}

export function batchSceneFixtures(parent:THREE.Object3D,owners:ReadonlySet<THREE.Object3D>,own:(g:THREE.BufferGeometry)=>void){
  const steps=fixtureSteps(parent,owners,own);let step=steps.next();while(!step.done)step=steps.next();return step.value;
}

export async function batchSceneFixturesAsync(parent:THREE.Object3D,owners:ReadonlySet<THREE.Object3D>,own:(g:THREE.BufferGeometry)=>void,checkpoint:()=>Promise<void>){
  const steps=fixtureSteps(parent,owners,own);
  try{let step=steps.next();while(!step.done){await checkpoint();step=steps.next();}return step.value;}
  finally{steps.return(0);}
}
