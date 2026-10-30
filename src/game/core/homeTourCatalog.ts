import {HOME_TOUR_RESIDENCES} from './homeInterior';
import {HOME_ALIASES} from './homeAliases';

export type HomeTourLevel='basic'|'comfortable'|'premium';
const comfortable=new Set(['rental_apartment','own_rental_apartment','boyue_talent_apartment','hotel','hotel_mooncourt']);
const premium=new Set(['lease_premium_apartment','own_apartment','lease_villa','own_villa']);
export function homeTourLevel(id:string):HomeTourLevel{return premium.has(id)?'premium':comfortable.has(id)?'comfortable':'basic';}
const unique=new Map<string,(typeof HOME_TOUR_RESIDENCES)[number]>();
for(const home of HOME_TOUR_RESIDENCES)if(!unique.has(home.name)||!HOME_ALIASES[home.id])unique.set(home.name,home);
export const HOME_TOUR_GROUPS=[
  {id:'basic',name:'一级住所',description:'普通出租屋、城市边缘小屋、民宿与其他简朴住处'},
  {id:'comfortable',name:'二级住所',description:'出租公寓、人才公寓和酒店豪华间'},
  {id:'premium',name:'三级住所',description:'精装公寓与城市住宅'},
].map(group=>({...group,homes:[...unique.values()].filter(home=>homeTourLevel(home.id)===group.id)}));
