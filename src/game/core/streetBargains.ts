import type {GameState} from '../types';
import {chance,randomInt} from '../rng';
import {gameDay} from './calendar';
import {getItem,addItem} from './items';
import {recordMoney} from './weekly';
import {pushLog} from '../engine';
import actionsData from '../data/actions.json';
import {priceMultiplier} from './difficulty';
const pool=['drink','noodles','sandwich'].map(item=>({item,original:Math.abs(actionsData.find(a=>a.locationId==='convenience_store'&&a.itemId===item&&a.handler==='buy_food')?.effects?.money??5)}));
const now=(s:GameState)=>gameDay(s.time)*1440+s.time.hour*60+s.time.minute;
export function streetBargain(s:GameState){const index=Number(s.flags.street_bargain_item)-1;
 if(s.locationId!=='commercial_street'||!pool[index]||s.flags.street_bargain_bought||Number(s.flags.street_bargain_until)<=now(s))return;
 const offer=pool[index],item=getItem(offer.item);if(!item)return;
 return {...offer,original:Number(s.flags.street_bargain_original)/100,name:item.name,icon:item.icon,price:Number(s.flags.street_bargain_price)/100};
}
export function rollStreetBargain(s:GameState):void {
 if(streetBargain(s)||!chance(s.rng,.3))return;
 const index=randomInt(s.rng,0,pool.length-1);
 const original=Math.round(pool[index].original*priceMultiplier(s)*100);
 s.flags.street_bargain_item=index+1;s.flags.street_bargain_original=original;s.flags.street_bargain_price=Math.max(1,Math.round(original*randomInt(s.rng,45,70)/100));
 s.flags.street_bargain_until=now(s)+120;s.flags.street_bargain_bought=false;
 pushLog(s,'🛍️','逛街时遇到一家正在清货的小摊，可以看看这次的特价商品');
}
export function buyStreetBargain(s:GameState):{ok:boolean;reason:string}{
 const offer=streetBargain(s);if(!offer)return{ok:false,reason:'这次特价已经结束了'};
 if(s.work?.active||s.districtLeisure?.active||s.fishing?.active)return{ok:false,reason:'请先完成当前活动'};
 if(s.player.money<offer.price)return{ok:false,reason:'现金不足'};
 s.flags.street_bargain_bought=true;s.player.money=Math.round((s.player.money-offer.price)*100)/100;recordMoney(s,-offer.price);addItem(s,offer.item);
 pushLog(s,offer.icon,`逛街特价：${offer.name} ${offer.price.toFixed(2)} 元，已放入背包`);return{ok:true,reason:offer.name+'已放入背包'};
}
