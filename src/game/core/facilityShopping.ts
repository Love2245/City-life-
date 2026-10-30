import type {ActionDef,GameState} from '../types';
import {getItem,itemCount} from './items';
import {isCookingItem} from './fridge';
import {HOME_FURNITURE,bestHomeItem,homeFurnitureKind} from './homeFurniture';
import {isClothingItem} from './clothing';

const RETAIL_LOCATIONS=new Set(['convenience_store','boyue_convenience_store','commercial_convenience_store','commercial_street','market','farm','pasture','orchard','clinic','hospital','furniture_store','electronics_store','luxury_store','clothing_store','flower_market','snack_street','dev_food_street','boyue_food_street','boyue_snack_street','boyue_sports_store','camping_base']);
export interface ShoppingLine {actionId:string;quantity:number}

/** Only ordinary retail actions participate; services and special pet purchases keep their own flow. */
export function isFacilityProduct(action:ActionDef):boolean {
  return RETAIL_LOCATIONS.has(action.locationId)&&['buy_item','buy_food','buy_fresh','buy_ingredient'].includes(action.handler??'')&&!!action.itemId&&!!getItem(action.itemId);
}
export function productRepeatable(action:ActionDef):boolean {
  return !!action.itemId&&(isCookingItem(action.itemId)||!!getItem(action.itemId)?.consumable||action.itemId==='fishing_bait');
}
export function productFamily(action:ActionDef|undefined):string|undefined {
  if(!action?.itemId)return;
  if(getItem(action.itemId)?.phoneSkin)return 'phone';
  return homeFurnitureKind(action.itemId);
}
export function productOwnershipReason(state:GameState,action:ActionDef):string|undefined {
  if(!action.itemId||productRepeatable(action))return;
  const kind=homeFurnitureKind(action.itemId),owned=kind?bestHomeItem(state,kind):undefined;
  if(kind&&owned){const tiers=HOME_FURNITURE[kind].items as readonly string[];if(tiers.indexOf(owned)>=tiers.indexOf(action.itemId))return owned===action.itemId?'已拥有这件商品':'已有更高档位';}
  if(itemCount(state,action.itemId)>0)return '已拥有这件商品';
}
export function productCategory(action:ActionDef):string {
  const item=action.itemId?getItem(action.itemId):undefined,id=action.itemId??'',kind=homeFurnitureKind(id);
  if(item?.homeSurface)return item.homeSurface==='wall'?'墙纸':'地垫与地板贴';
  if(item?.phoneSkin)return '手机';
  if(kind==='computer')return '电脑';
  if(kind==='bed')return '床品';
  if(kind==='fridge'||kind==='kitchen')return '厨卫家电';
  if(kind==='gym')return '健身器材';
  if(kind==='sofa')return '起居家具';
  if(kind==='lamp'||kind==='plant')return '灯光与装饰';
  if(id.startsWith('fishing_'))return '钓具';
  if(id==='camera')return '影像设备';
  if(id==='medicine')return '药品';
  if(id.includes('drink'))return '饮品';
  if(item?.cookingCategory==='seasoning')return '调料';
  if(['meat','pork','chicken','beef'].includes(item?.cookingCategory??''))return '肉类';
  if(['egg','milk'].includes(item?.cookingCategory??''))return '蛋奶';
  if(id.includes('fruit'))return '水果';
  if(id==='noodles')return '即食食品';
  if(isCookingItem(id))return item?.cookingCategory==='rice'?'米粮':'蔬菜';
  if(action.handler==='buy_food'||action.handler==='buy_fresh')return '即食食品';
  if(id==='market_flower')return '鲜花';
  if(isClothingItem(item))return '服饰';
  return '生活用品';
}
/** Preserve grocery-trip rules; other retailers share the longest required purchase/installation time. */
export function shoppingDuration(actions:readonly ActionDef[],units:number):number {
  if(!actions.length)return 0;
  if(['market','farm','pasture'].includes(actions[0].locationId))return units>=3?1:.5;
  return Math.max(...actions.map(a=>a.duration??(['buy_food','buy_fresh'].includes(a.handler??'')?0:1)));
}
