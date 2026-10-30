export interface GiftCodeDef {
  id:string;
  normalizedCode:string;
  amount:number;
  saveFlag:string;
  itemId?:string;
}

/** Shared by redemption and durable installation reconciliation. */
export const GIFT_CODES:readonly GiftCodeDef[]=[
  {id:'city_life',normalizedCode:'city life!',amount:1500,saveFlag:'gift_code_city_life_redeemed'},
  {id:'love2245',normalizedCode:'love2245',amount:1500,saveFlag:'gift_code_love2245_redeemed'},
  {id:'good_game',normalizedCode:'good game',amount:200,saveFlag:'gift_code_good_game_redeemed'},
  {id:'soda',normalizedCode:'soda',amount:200,saveFlag:'gift_code_soda_redeemed'},
  {id:'bonus_6767',normalizedCode:'6767',amount:676.7,saveFlag:'gift_code_6767_redeemed'},
  {id:'ebike',normalizedCode:'ebike',amount:0,saveFlag:'gift_code_ebike_redeemed',itemId:'e_bike'},
];
