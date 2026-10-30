import type { ActionDef, ActionResult, GameState } from "../types";
import { ACTIONS, canPerform, purchasePriceOf } from "./actions";
import { HOME_FURNITURE, HOME_ITEM_IDS, bestHomeItem, homeFurnitureKind, type HomeFurnitureKind } from "./homeFurniture";
import { formalHomeId } from "./homeInterior";
import { addItem, applyItem, getItem } from "./items";
import { canInstallFridge, installFridge, FRIDGE_TIERS } from "./fridge";
import { syncAutoHomeEquipment } from "./equipment";
import { applyEffects, pushLog } from "../engine";
import { advanceHours } from "./time";

const purchases = new Map(ACTIONS.filter(a => a.handler === "buy_item" && a.itemId && HOME_ITEM_IDS.has(a.itemId)).map(a => [a.itemId!, a]));
export function homeOffers(kind: HomeFurnitureKind): ActionDef[] {
  return (HOME_FURNITURE[kind].items as readonly string[]).map(id => purchases.get(id)).filter((a): a is ActionDef => !!a);
}
export function homePurchaseQuote(state: GameState, itemId: string): {ok:boolean;reason?:string;price:number;duration:number} {
  const action=purchases.get(itemId), kind=homeFurnitureKind(itemId);
  if(!action || !kind)return {ok:false,reason:"这件物品不在家居目录中",price:0,duration:0};
  const duration=action.duration??1;
  if(!formalHomeId(state))return {ok:false,reason:"请先回到自己的正式住处",price:0,duration};
  if(state.work?.active || state.fishing?.active || state.districtLeisure?.active)return {ok:false,reason:"请先完成当前活动",price:0,duration};
  const item=getItem(itemId);
  const price=item?.fridgeTier ? Math.max(0,FRIDGE_TIERS[item.fridgeTier].price-(state.fridge?.tier?FRIDGE_TIERS[state.fridge.tier].price:0)) : purchasePriceOf(state,action);
  const owned=bestHomeItem(state,kind), tiers=HOME_FURNITURE[kind].items as readonly string[];
  if(owned && tiers.indexOf(owned)>=tiers.indexOf(itemId))return {ok:false,reason:owned===itemId?"已经拥有，无需重复购买":"家中已有更高档位",price,duration};
  // Delivery uses the original vendor's opening times, unlocks, requirements and
  // difficulty-adjusted quote. The player's real address never changes.
  const admission=canPerform({...state,locationId:action.locationId},action);
  if(item?.fridgeTier){const result=canInstallFridge(state,item.fridgeTier);return {ok:admission.ok&&result.ok,reason:admission.ok?result.reason:admission.reason,price,duration};}
  return {ok:admission.ok,reason:admission.reason,price,duration};
}
export function purchaseHomeFurniture(state: GameState, itemId: string): {ok:boolean;reason?:string;result?:ActionResult} {
  const quote=homePurchaseQuote(state,itemId);
  if(!quote.ok)return {ok:false,reason:quote.reason};
  const action=purchases.get(itemId)!,item=getItem(itemId)!;
  if(item.fridgeTier){
    const result=installFridge(state,item.fridgeTier);if(!result.ok)return {ok:false,reason:result.reason};
    addItem(state,itemId);
  }else{
    applyEffects(state,{...action.effects,money:-quote.price},action.icon);
    addItem(state,itemId);applyItem(state,itemId);
  }
  syncAutoHomeEquipment(state);
  pushLog(state,item.icon,`「${item.name}」已送到家中，支出 ${quote.price} 元`);
  advanceHours(state,quote.duration);
  return {ok:true,result:{actionId:`home_delivery_${itemId}`,icon:item.icon,name:`购置${item.name}`,duration:quote.duration,deltas:[{key:"money",label:"金钱",value:-quote.price}],sound:"coin",verdict:`${item.name}已送达并安置。已有家具与冰箱库存继续保留。`}};
}
