import {BoxGeometry,Group,Mesh,MeshStandardMaterial,OrthographicCamera,Vector3} from 'three';
import {describe,expect,it} from 'vitest';
import {cafeCameraEye,cafeWallOpacity,createCafeWallFade} from '../src/lib/cafeRoom/wallVisibility';

describe('cafe walls and camera clearance',()=>{
  it('keeps the entire room in front of the near plane at every NPC orbit angle without changing framing',()=>{
    const target=new Vector3(2.4,.8,9.9);
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8)for(const elevation of [20,30,40,89.8]){
      const eye=new Vector3(Math.sin(angle)*Math.cos(elevation*Math.PI/180),Math.sin(elevation*Math.PI/180),Math.cos(angle)*Math.cos(elevation*Math.PI/180)).multiplyScalar(6).add(target);
      const camera=new OrthographicCamera(-10,10,8,-8,.1,100);camera.position.copy(eye);camera.lookAt(target);camera.updateMatrixWorld();
      const before=target.clone().add(new Vector3(.4,.7,-.3)).project(camera);
      camera.position.copy(cafeCameraEye(eye,target));camera.updateMatrixWorld();
      const after=target.clone().add(new Vector3(.4,.7,-.3)).project(camera);
      expect(after.x).toBeCloseTo(before.x,10);expect(after.y).toBeCloseTo(before.y,10);
      for(const x of [-.3,12.3])for(const y of [-.4,3.3])for(const z of [-.3,13]){
        const depth=new Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse).z;
        expect(depth).toBeLessThan(-camera.near);expect(depth).toBeGreaterThan(-camera.far);
      }
    }
  });
  it('fades only foreground walls and interpolates continuously around the side boundary',()=>{
    const target=new Vector3(6,1,5.5);
    expect(cafeWallOpacity('left',new Vector3(-10,8,20),target,false)).toBeCloseTo(.065);
    expect(cafeWallOpacity('right',new Vector3(-10,8,20),target,false)).toBe(1);
    expect(cafeWallOpacity('back',new Vector3(-10,8,20),target,false)).toBe(1);
    expect(cafeWallOpacity('back',new Vector3(6,8,-10),target,false)).toBeCloseTo(.065);
    expect(cafeWallOpacity('front',new Vector3(6,8,20),target,false)).toBeCloseTo(.065);
    expect(cafeWallOpacity('front',new Vector3(6,8,-10),target,false)).toBe(1);
    const values=[.02,.08,.14,.2,.26].map(x=>cafeWallOpacity('right',target.clone().add(new Vector3(x,1,Math.sqrt(1-x*x))),target,false));
    expect(values[0]).toBe(1);expect(values[4]).toBeCloseTo(.065);
    for(let i=1;i<values.length;i++)expect(values[i]).toBeLessThan(values[i-1]);
  });
  it('retains full-height geometry and keeps shared furniture opaque while fading attached decor',()=>{
    const source=new MeshStandardMaterial({color:'#294b38'}),wall=new Mesh(new BoxGeometry(12,3.2,.16),source),cap=new Mesh(new BoxGeometry(12,.03,.16),source),frame=new Mesh(new BoxGeometry(2,1,.1),source),furniture=new Mesh(new BoxGeometry(1,1,1),source),group=new Group();group.add(frame);
    wall.position.set(6,1.6,-.08);const original=wall.matrix.clone(),position=wall.position.clone();
    const fade=createCafeWallFade(()=>{});fade.add('back',wall,cap,group);
    let status;for(let i=0;i<100;i++)status=fade.update(new Vector3(6,8,-10),new Vector3(6,1,5),false,.016);
    expect(status?.moving).toBe(false);expect(wall.scale.y).toBe(1);expect(wall.position.equals(position)).toBe(true);expect(wall.matrix.equals(original)).toBe(true);
    expect((wall.material as MeshStandardMaterial).opacity).toBeCloseTo(.065);expect((frame.material as MeshStandardMaterial).opacity).toBeCloseTo(.065);
    expect(source.opacity).toBe(1);expect(furniture.material).toBe(source);expect(fade.pickable(frame)).toBe(false);
    for(let i=0;i<100;i++)status=fade.update(new Vector3(6,8,20),new Vector3(6,1,5),false,.016);
    expect(status?.moving).toBe(false);expect((wall.material as MeshStandardMaterial).opacity).toBe(1);expect((wall.material as MeshStandardMaterial).depthWrite).toBe(true);expect(fade.pickable(frame)).toBe(true);
  });
  it('fades exterior cladding and the entrance header with foreground walls, then restores them after turning',()=>{
    const inside=new MeshStandardMaterial({color:'#294b38'}),brick=new MeshStandardMaterial({color:'#ad836c'});
    const right=new Mesh(new BoxGeometry(.16,3.2,11),[inside,brick]),back=new Mesh(new BoxGeometry(12,3.2,.16),inside),header=new Mesh(new BoxGeometry(12,.35,.16),inside),equipment=new Mesh(new BoxGeometry(.3,.5,.7),brick);
    const fade=createCafeWallFade(()=>{});fade.add('right',right,equipment);fade.add('back',back);fade.add('front',header);
    const target=new Vector3(6,1,5.5);
    for(let i=0;i<100;i++)fade.update(new Vector3(19,15,28),target,false,.016);
    expect(right.material.every(m=>Math.abs(m.opacity-.065)<.001)).toBe(true);
    expect((equipment.material as MeshStandardMaterial).opacity).toBeCloseTo(.065);
    expect((header.material as MeshStandardMaterial).opacity).toBeCloseTo(.065);
    expect((back.material as MeshStandardMaterial).opacity).toBe(1);
    expect(right.scale.y).toBe(1);expect(brick.opacity).toBe(1);expect(inside.opacity).toBe(1);
    for(let i=0;i<100;i++)fade.update(new Vector3(-12,15,-18),target,false,.016);
    expect(right.material.every(m=>m.opacity===1)).toBe(true);
    expect((header.material as MeshStandardMaterial).opacity).toBe(1);
    expect((back.material as MeshStandardMaterial).opacity).toBeCloseTo(.065);
  });
});
