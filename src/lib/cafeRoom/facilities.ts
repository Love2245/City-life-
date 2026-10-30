import type {Vector3,Object3D} from 'three';
import {sceneObjectBoundsCenter} from '../sceneObjectBounds';
import type {CafeZone} from './layout';

export const CAFE_FACILITIES={
  counter:{title:'点单与取餐台',zone:'order',description:'在这里点咖啡、可颂和贝果，也可以办理柜台事务。'},
  coffee:{title:'咖啡制作台',zone:'craft',description:'磨豆、萃取与出杯，是店员工作的地方。'},
  lounge:{title:'沙发休息区',zone:'lounge',description:'在沙发上放松一小时，或小睡两小时，恢复少量体力。'},
  community:{title:'共享长桌',zone:'community',description:'长桌边有空位，可以在这里安排接下来的时间。'},
  window:{title:'临窗高座',zone:'window',description:'面朝街道的座位，适合一个人安静地待一会儿。'},
  books:{title:'随手书架',zone:'lounge',description:'挑一本店内书刊，花半小时读几页，放松心情。'},
  notice:{title:'店内布告',zone:'craft',description:'看看店里的岗位和眼前需要办理的事情。'},
  service:{title:'自助台',zone:'details',description:'糖包、纸巾与饮水的位置。饮品仍在点单台购买。'},
  lin:{title:'窗边的客人',zone:'lin',description:'她正坐在窗边，可以走过去打个招呼。'},
  door:{title:'玻璃门',zone:'window',description:'从这里回到街道，也可以推开或合上玻璃门。'},
} satisfies Record<string,{title:string;zone:CafeZone;description:string}>;
export type CafeFacilityId=keyof typeof CAFE_FACILITIES;
const decorativeFacilities=new Set<CafeFacilityId>(["community","window","notice","service"]);
export const isCafeFacilityInteractive=(id:CafeFacilityId)=>!decorativeFacilities.has(id);
export interface CafeFacilitySelection {id:CafeFacilityId;title:string;zone:CafeZone;x:number;y:number;visible:boolean}
export interface CafeWorkOption {id:string;title:string;detail:string;requiresHiring?:boolean;disabled?:boolean;reason?:string}
export interface CafePersonOption {id:string;displayName:string;known:boolean}

/** Register facilities explicitly so books, cups and wall art cannot steal a
 * table click. Picking and the white outline refer to the same object. */
export function createCafeFacilityRegistry(){
  const records=new Map<Object3D,{id:CafeFacilityId;object:Object3D;outline:Object3D[];anchor?:Vector3}>();
  return {
    add(id:CafeFacilityId,object:Object3D,outline:Object3D[]=[object],anchor?:Vector3){
      records.set(object,{id,object,outline,anchor});object.userData.cafeFacility=id;return object;
    },
    roots(){return [...records.keys()];},
    find(id:CafeFacilityId,visible:(object:Object3D)=>boolean){return isCafeFacilityInteractive(id)?[...records.values()].find(record=>record.id===id&&visible(record.object)):undefined;},
    resolve(object:Object3D){
      for(let current:Object3D|null=object;current;current=current.parent){const record=records.get(current);if(record)return isCafeFacilityInteractive(record.id)?record:undefined;}
      return undefined;
    },
    anchor(object:Object3D){const record=records.get(object);return record?.anchor?.clone()??sceneObjectBoundsCenter(object);},
  };
}
