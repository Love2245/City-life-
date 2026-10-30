import {type Camera,type Object3D,type Vector3} from 'three';
import type {SceneNameLabel} from './sceneLabels';

/** Cache static fixture anchors; publish only when camera projection changes. */
export function createFacilityLabelProjection<Id extends string>(definitions:Record<Id,{title:string}>,find:(id:Id)=>{object:Object3D}|undefined,anchor:(object:Object3D)=>Vector3,publish:(labels:SceneNameLabel[])=>void){
  const anchors=new WeakMap<Object3D,Vector3>();let stamp='';
  return (camera:Camera)=>{
    const labels:SceneNameLabel[]=[];
    for(const id of Object.keys(definitions) as Id[]){const record=find(id);if(!record)continue;
      let center=anchors.get(record.object);if(!center||id==='door'){center=anchor(record.object);anchors.set(record.object,center);}
      const point=center.clone().project(camera);if(Math.abs(point.x)>1||Math.abs(point.y)>1||Math.abs(point.z)>1)continue;
      labels.push({id,title:definitions[id].title,x:Math.round((point.x+1)*5000)/100,y:Math.round((1-point.y)*5000)/100,visible:true});
    }
    const next=JSON.stringify(labels);if(next!==stamp){stamp=next;publish(labels);}
  };
}
