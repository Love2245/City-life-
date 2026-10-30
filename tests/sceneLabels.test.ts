import {describe,expect,it,vi} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,OrthographicCamera,Vector3} from 'three';
import {placeSceneLabels} from '../src/lib/sceneLabels';
import {createFacilityLabelProjection} from '../src/lib/facilityLabelProjection';

describe('facility name positions',()=>{
  for(const [width,height]of [[320,568],[896,414],[1392,896],[2048,1028]])it(`${width}x${height}: bounds labels and separates a cluster`,()=>{
    const labels=Array.from({length:6},(_,id)=>({id:String(id),title:'饮料冷柜',x:50,y:50,visible:true}));
    const placed=placeSceneLabels(labels,width,height,true),tagWidth=4*12+20;
    expect(placed).toHaveLength(6);
    for(const tag of placed){expect(tag.x*width/100-tagWidth/2).toBeGreaterThanOrEqual(9);expect(tag.x*width/100+tagWidth/2).toBeLessThanOrEqual(width-9);expect(tag.y*height/100+17).toBeLessThanOrEqual(height-69);}
    for(let a=0;a<placed.length;a++)for(let b=a+1;b<placed.length;b++)expect(Math.abs(placed[a].x-placed[b].x)*width/100>=tagWidth+5||Math.abs(placed[a].y-placed[b].y)*height/100>=39).toBe(true);
    expect(placeSceneLabels([{...labels[0],visible:false},{...labels[0],id:'bad',x:NaN}],width,height)).toEqual([]);
  });
  it('projects fixture anchors, caches static geometry and stops publishing unchanged frames',()=>{
    const fixture=new Group(),mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());fixture.add(mesh);fixture.position.set(1,0,0);fixture.updateMatrixWorld(true);
    const camera=new OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const publish=vi.fn(),anchor=vi.fn(()=>fixture.getWorldPosition(new Vector3()));let shown=true;
    const project=createFacilityLabelProjection({shelf:{title:'货架'}},()=>shown?{object:fixture}:undefined,anchor,publish);
    project(camera);project(camera);expect(publish).toHaveBeenCalledTimes(1);expect(anchor).toHaveBeenCalledTimes(1);expect(publish.mock.calls[0][0][0]).toMatchObject({id:'shelf',x:60,y:50});
    camera.position.x=2;camera.updateMatrixWorld();project(camera);expect(publish).toHaveBeenCalledTimes(2);expect(anchor).toHaveBeenCalledTimes(1);
    shown=false;project(camera);expect(publish).toHaveBeenLastCalledWith([]);mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();
  });
});
