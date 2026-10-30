import type {Vector3,Object3D} from 'three';
import {sceneObjectBoundsCenter} from '../sceneObjectBounds';
import type {ActionDef} from '../../game/types';
import {isFacilityProduct,productCategory} from '../../game/core/facilityShopping';
import type {ZoneId} from './layout';

export const isConvenienceStore=(id:string)=>['convenience_store','boyue_convenience_store','commercial_convenience_store'].includes(id);
export const STORE_FACILITIES={
  fresh:{title:'冷藏鲜食柜',zone:'cold',description:'左侧冷柜里的盒饭、三明治和沙拉，可以打包，也可以选择店内用餐。',category:'冷藏鲜食'},
  drinks:{title:'饮料冷柜',zone:'cold',description:'右侧冷柜里有普通饮料与能量饮料，带一瓶路上的补给。',category:'饮品'},
  noodles:{title:'速食货架',zone:'shelves',description:'这一排摆着泡面和零食陈列，看看今天可以买到的速食。',category:'速食'},
  seasoning:{title:'调料货架',zone:'shelves',description:'盐、糖、酱油、辣椒粉和沙拉酱，补齐家里厨房的日常调味。',category:'调料'},
  checkout:{title:'收银台',zone:'checkout',description:'在这里核对采购清单，也可以办理上班和柜台事务。',category:'全部'},
  service:{title:'自助用餐台',zone:'services',description:'热水、餐具与微波加热都在这一侧。食品可在购买时选择店内用餐。',category:null},
  seating:{title:'临窗餐桌',zone:'seating',description:'从背包取出已经买好的食品，或坐在窗边等一会儿。',category:null},
  blindbox:{title:'夜间盲盒',zone:'checkout',description:'晚上十点到次日六点供应，给晚归的人留一份小惊喜。',category:null},
  notice:{title:'招聘告示',zone:'entrance',description:'看看店员岗位，或联系店里的工作人员。',category:null},
  baskets:{title:'购物篮',zone:'entrance',description:'带上购物篮，按店内分区挑选需要的东西。',category:'全部'},
  door:{title:'玻璃门',zone:'entrance',description:'从这里回到街道，也可以打开或合上玻璃门。',category:null},
} satisfies Record<string,{title:string;zone:ZoneId;description:string;category:string|null}>;
export type StoreFacilityId=keyof typeof STORE_FACILITIES;
const decorativeFacilities=new Set<StoreFacilityId>(["service","notice","baskets"]);
export const isStoreFacilityInteractive=(id:StoreFacilityId)=>!decorativeFacilities.has(id);
export interface StoreFacilitySelection {id:StoreFacilityId;title:string;zone:ZoneId;x:number;y:number;visible:boolean}

/** Item IDs work for both branches; branch-prefixed action IDs never determine
 * the shelf. Unknown future products retain their ordinary catalog category. */
export function storeProductCategory(action:ActionDef):string {
  if(['bento','sandwich','salad'].includes(action.itemId??''))return '冷藏鲜食';
  if(action.itemId==='noodles')return '速食';
  return productCategory(action);
}
export function storeProductFacility(action:ActionDef):StoreFacilityId|undefined {
  if(!isConvenienceStore(action.locationId)||!isFacilityProduct(action))return;
  const category=storeProductCategory(action);
  return category==='冷藏鲜食'?'fresh':category==='饮品'?'drinks':category==='速食'?'noodles':category==='调料'?'seasoning':'checkout';
}
export function createStoreFacilityRegistry(){
  const records=new Map<Object3D,{id:StoreFacilityId;object:Object3D;outline:Object3D[];anchor?:Vector3}>();
  return {
    add(id:StoreFacilityId,object:Object3D,outline:Object3D[]=[object],anchor?:Vector3){records.set(object,{id,object,outline,anchor});object.userData.storeFacility=id;return object;},
    roots(){return [...records.keys()];},
    find(id:StoreFacilityId,visible:(object:Object3D)=>boolean){return isStoreFacilityInteractive(id)?[...records.values()].find(record=>record.id===id&&visible(record.object)):undefined;},
    resolve(object:Object3D){for(let current:Object3D|null=object;current;current=current.parent){const record=records.get(current);if(record)return isStoreFacilityInteractive(record.id)?record:undefined;}return undefined;},
    anchor(object:Object3D){return records.get(object)?.anchor?.clone()??sceneObjectBoundsCenter(object);},
  };
}
