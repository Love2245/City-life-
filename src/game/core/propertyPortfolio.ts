import type {GameState,HousingData,OwnedProperty} from '../types';
import housingData from '../data/housing.json';
import {gameDay} from './calendar';
import {pushLog} from '../engine';
import {recordMoney} from './weekly';

export const PROPERTY_RENT_PERIOD_DAYS=30;
const tiers=(housingData as HousingData).buy;
const tierMap=new Map(tiers.map(t=>[t.id,t]));
export function propertyMonthlyRent(housingId:string):number{return tierMap.get(housingId)?.monthlyRent??0;}

/** 只读兼容旧档，打开界面不会持续改写状态或提前发租金。 */
export function ownedProperties(state:GameState):readonly OwnedProperty[]{
 if(Array.isArray(state.living.properties)&&state.living.properties.length){
  const properties=state.living.properties.filter(p=>p&&typeof p==='object'&&tierMap.has(p.housingId));
  if(properties.length)return properties.length===state.living.properties.length?state.living.properties:properties;
 }
 if(state.living.ownedId&&tierMap.has(state.living.ownedId)){
  const today=gameDay(state.time);return[{id:'property_1',housingId:state.living.ownedId,acquiredDay:today,rentalDays:0,lastAccountedDay:today}];
 }
 return[];
}
export function bestOwnedProperty(properties:readonly OwnedProperty[],preferred?:string):OwnedProperty|undefined{
 return [...properties].sort((a,b)=>(tierMap.get(b.housingId)?.buyPrice??0)-(tierMap.get(a.housingId)?.buyPrice??0)||Number(b.id===preferred)-Number(a.id===preferred))[0];
}
export function activeOwnedProperty(state:GameState):OwnedProperty|undefined{
 const properties=ownedProperties(state);
 return properties.find(p=>p.id===state.living.activePropertyId)??properties.find(p=>p.housingId===state.living.ownedId)??bestOwnedProperty(properties);
}
export function propertyIsRented(state:GameState,property:OwnedProperty):boolean{
 return state.living.mode!=='own'||activeOwnedProperty(state)?.id!==property.id;
}
export function normalizeOwnedProperties(state:GameState):void{
 const today=gameDay(state.time),seen=new Set<string>(),valid:OwnedProperty[]=[];
 for(const entry of ownedProperties(state)){
  if(!entry||!tierMap.has(entry.housingId))continue;
  let id=typeof entry.id==='string'&&entry.id.length<=64?entry.id:'';
  if(!id||seen.has(id)){let n=valid.length+1;while(seen.has(`property_${n}`))n++;id=`property_${n}`;}
  seen.add(id);
  const acquiredDay=Number.isSafeInteger(entry.acquiredDay)&&entry.acquiredDay>=0&&entry.acquiredDay<=today?entry.acquiredDay:today;
  const lastAccountedDay=Number.isSafeInteger(entry.lastAccountedDay)&&entry.lastAccountedDay>=acquiredDay&&entry.lastAccountedDay<=today?entry.lastAccountedDay:today;
  const rentalDays=Number.isSafeInteger(entry.rentalDays)&&entry.rentalDays>=0&&entry.rentalDays<PROPERTY_RENT_PERIOD_DAYS?entry.rentalDays:0;
  valid.push({id,housingId:entry.housingId,acquiredDay,lastAccountedDay,rentalDays});
 }
 if(!valid.length)return;
 if(JSON.stringify(state.living.properties)!==JSON.stringify(valid))state.living.properties=valid;
 const active=activeOwnedProperty(state)!;
 state.flags??={};state.living.activePropertyId=active.id;state.living.ownedId=active.housingId;state.flags.owned_property=true;
 if((state.living.mode as string)==='owned')state.living.mode='own';
 const sequence=state.living.propertySequence;
 if(!Number.isSafeInteger(sequence)||sequence!<valid.length||sequence!>1000000000)state.living.propertySequence=valid.length;
}
export function addOwnedProperty(state:GameState,housingId:string):OwnedProperty{
 normalizeOwnedProperties(state);state.living.properties??=[];
 let sequence=(state.living.propertySequence??0)+1;
 while(state.living.properties.some(p=>p.id===`property_${sequence}`))sequence++;
 const today=gameDay(state.time),property={id:`property_${sequence}`,housingId,acquiredDay:today,rentalDays:0,lastAccountedDay:today};
 state.living.properties.push(property);state.living.propertySequence=sequence;
 return property;
}
export function monthlyPropertyIncome(state:GameState):number{
 return ownedProperties(state).filter(p=>propertyIsRented(state,p)).reduce((sum,p)=>sum+propertyMonthlyRent(p.housingId),0);
}
/** 按实际出租日数计月；跨日、跳过多日和同日重复结算共用一个持久游标。 */
export function settlePropertyRent(state:GameState):number{
 if(!ownedProperties(state).length)return 0;
 normalizeOwnedProperties(state);
 const today=gameDay(state.time),active=state.living.mode==='own'?activeOwnedProperty(state)?.id:undefined;
 let income=0;const details=new Map<string,number>();
 for(const property of state.living.properties??[]){
  const days=Math.max(0,today-property.lastAccountedDay);if(days===0)continue;
  property.lastAccountedDay=today;
  if(property.id===active)continue;
  const total=property.rentalDays+days,periods=Math.floor(total/PROPERTY_RENT_PERIOD_DAYS);property.rentalDays=total%PROPERTY_RENT_PERIOD_DAYS;
  const amount=periods*propertyMonthlyRent(property.housingId);income+=amount;
  if(amount)details.set(property.housingId,(details.get(property.housingId)??0)+amount);
 }
 if(income){state.player.money+=income;recordMoney(state,income);pushLog(state,'🏘️',`房屋出租租金到账 +${income} 元（${[...details].map(([id,amount])=>`${tierMap.get(id)?.name} ${amount}元`).join('、')}）`);}
 return income;
}
