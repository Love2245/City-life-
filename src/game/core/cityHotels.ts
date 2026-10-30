import type {GameState} from '../types';
import {currentResidence,isResidenceLocation} from './residence';
import {recordMoney} from './weekly';
import {pushLog} from '../engine';

export const CITY_HOTEL_ROOMS=new Set(['hotel','hotel_budget','hotel_mooncourt','hotel_mooncourt_budget']);
const roomCode=(id:string)=>[...CITY_HOTEL_ROOMS].indexOf(id)+1;
export function cityHotelGuest(state:GameState):boolean {
  return CITY_HOTEL_ROOMS.has(currentResidence(state).id)&&isResidenceLocation(state);
}
/** The prepaid night is consumed by the existing idempotent night settlement. */
export function prepayCityHotel(state:GameState,id:string,price:number):boolean {
  if(!CITY_HOTEL_ROOMS.has(id))return true;
  if(currentResidence(state).id===id&&state.flags.hotel_booking_id===roomCode(id))return true;
  if(state.player.money<price)return false;
  state.player.money-=price;recordMoney(state,-price);
  state.flags.hotel_booking_id=roomCode(id);state.flags.hotel_prepaid_credit=true;
  state.flags.city_hotel_prepay_migrated=true;
  pushLog(state,'🏨',`预付一晚房费 ${price} 元，包含住客堂食`);return true;
}
export function consumeHotelPrepayment(state:GameState,id:string):boolean {
  if(!CITY_HOTEL_ROOMS.has(id)||state.flags.hotel_booking_id!==roomCode(id)||state.flags.hotel_prepaid_credit!==true)return false;
  state.flags.hotel_prepaid_credit=false;return true;
}
export function normalizeCityHotelBooking(state:GameState):void {
  if(state.flags.city_hotel_prepay_migrated===true)return;
  const id=currentResidence(state).id;
  if(!CITY_HOTEL_ROOMS.has(id))return;
  state.flags.hotel_booking_id=roomCode(id);state.flags.hotel_prepaid_credit=true;
  state.flags.city_hotel_prepay_migrated=true;
}
