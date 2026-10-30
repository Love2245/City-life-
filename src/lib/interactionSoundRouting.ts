import type {SoundId} from '../game/types';
import type {MusicScene} from './musicRouting';
import type {TransitMode} from '../game/core/transit';

export type InteractionSoundId='door_open'|'door_close'|'fridge_open'|'fridge_close'|'drawer'|'keyboard'|'mouse'|'page'|'switch'|'elevator'|'tap'|'pour'|'cook'|'chop'|'cutlery'|'coins'|'steps'|'cloth'|'shower'|'sip'|'bottle_open'|'glass'|'car'|'bike'|'bus'|'train'|'cat_food'|'cat_play'|'match';

const legacy:Partial<Record<SoundId,InteractionSoundId>>={cashier:'coins',coin:'coins',eat:'cutlery',shower:'tap',study:'page',read:'page',walk:'steps',computer:'keyboard',sleep:'cloth',nap:'cloth'};
export function recordedSoundForLegacy(id:SoundId):InteractionSoundId|undefined{return legacy[id];}
/** Result IDs describe the completed action; a purchase alone retains the transaction sound. */
export function recordedSoundForAction(actionId:string,fallback:SoundId):InteractionSoundId|undefined{
  if(/^(?:boyue_)?cook_/.test(actionId))return actionId.includes('salad')?'chop':'cook';
  if(/^(?:boyue_)?drink_cafe$|^drink_water$|^home_drink_water$/.test(actionId))return 'sip';
  if(/^(?:boyue_)?shower_(?:home|quick)$/.test(actionId)||actionId==='cat_clean')return 'shower';
  if(actionId==='cat_feed')return 'cat_food';
  if(actionId==='cat_play')return 'cat_play';
  if(actionId==='church_gospel_box')return 'drawer';
  if(actionId==='temple_worship')return 'match';
  if(actionId==='temple_vegetarian'||actionId==='church_meal')return 'cutlery';
  if(/^boyue_(?:nightclub|lounge)_alcohol_/.test(actionId)||actionId==='boyue_lounge_coupon_drink'||actionId==='boyue_nightclub_free_drink')return 'glass';
  return recordedSoundForLegacy(fallback);
}
export function itemUseSound(itemId:string):InteractionSoundId{
  if(itemId==='drink'||itemId==='energy_drink')return 'bottle_open';
  if(itemId==='milk')return 'sip';
  return 'cutlery';
}
/** Only explicit station boarding/purchase actions play a vehicle cue. Map navigation stays quiet. */
export function journeySound(mode:TransitMode):InteractionSoundId{
  if(mode==='car'||mode==='bike')return mode;
  if(mode==='bus'||mode==='suburb_bus')return 'bus';
  if(mode==='train'||mode==='subway'||mode==='development_subway')return 'train';
  return 'steps';
}
export function homeObjectSound(kind:string):InteractionSoundId{
  if(kind==='fridge')return 'fridge_open';
  if(kind==='wardrobe'||kind==='bed')return 'cloth';
  if(kind==='bookshelf')return 'page';
  if(kind==='storage')return 'drawer';
  if(kind==='kitchen')return 'cutlery';
  return 'mouse';
}
const interiors=new Set(['old_apartment','suburb_room','rental_apartment','boyue_talent_apartment','own_old_unit','own_apartment','own_villa','lease_old_unit','lease_premium_apartment','lease_villa','own_rental_studio','own_rental_apartment','own_suburb_room','minsu','hotel','hotel_budget','hotel_boyu_nightmarket','hotel_mooncourt','hotel_mooncourt_budget','cafe','convenience_store','supermarket','mall','library','bookstore','internet_cafe','municipal_hall','hospital','bath_center','nightclub','lounge_bar','texas_shop','arcade','church','temple']);
function indoors(id:string){return interiors.has(id)||id.startsWith('boyue_')&&interiors.has(id.slice(6))||id.startsWith('company_');}
export function sceneInteractionSound(previous:MusicScene|null,next:MusicScene):InteractionSoundId|undefined{
  if(!previous?.inGame||!next.inGame||previous.sessionKey!==next.sessionKey||!previous.locationId||!next.locationId)return;
  const before=indoors(previous.locationId)&&previous.admitted!==false,after=indoors(next.locationId)&&next.admitted!==false;
  if(previous.locationId===next.locationId&&before===after)return;
  if(before&&previous.locationId==='company_office_floor'||after&&next.locationId==='company_office_floor')return 'elevator';
  if(after)return 'door_open';
  if(before)return 'door_close';
}
