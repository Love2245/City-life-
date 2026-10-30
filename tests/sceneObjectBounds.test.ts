import {describe,expect,it} from 'vitest';
import {Box3,BoxGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {sceneObjectBoundsCenter} from '../src/lib/sceneObjectBounds';

describe('facility anchor bounds without a runtime Three import',()=>{
  it('matches desktop Box3 anchors through rotated and scaled model hierarchies',()=>{
    const root=new Group(),nested=new Group(),geometry=new BoxGeometry(2,1,3),material=new MeshBasicMaterial();
    root.position.set(6,.4,-3);root.rotation.y=.8;root.scale.set(1.2,.9,.7);nested.position.set(-2,1,4);nested.rotation.z=.3;
    const first=new Mesh(geometry,material),second=new Mesh(geometry,material);first.position.set(1,0,2);second.position.set(-3,.8,-1);nested.add(first,second);root.add(nested);
    const center=sceneObjectBoundsCenter(root),expected=new Box3().setFromObject(root).getCenter(new Vector3());
    expect(center.distanceTo(expected)).toBeLessThan(1e-9);geometry.dispose();material.dispose();
  });
  it('keeps instanced-model and empty-group anchors compatible with desktop picking',()=>{
    const root=new Group(),geometry=new BoxGeometry(1,2,1),material=new MeshBasicMaterial(),instances=new InstancedMesh(geometry,material,2);
    instances.setMatrixAt(0,new Matrix4().makeTranslation(4,1,0));instances.setMatrixAt(1,new Matrix4().makeTranslation(-2,2,-3));instances.rotation.y=.35;root.position.set(2,0,7);root.add(instances);
    expect(sceneObjectBoundsCenter(root).distanceTo(new Box3().setFromObject(root).getCenter(new Vector3()))).toBeLessThan(1e-9);
    const empty=new Group();empty.position.set(1,2,3);root.add(empty);expect(sceneObjectBoundsCenter(empty).distanceTo(empty.getWorldPosition(new Vector3()))).toBeLessThan(1e-9);
    instances.dispose();geometry.dispose();material.dispose();
  });
});
