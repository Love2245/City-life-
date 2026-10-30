import type {HomeAnchor,HomeObjectKind,HomePlan,HomePoint} from './homeInterior';
import {HOME_FLOOR_PLANS} from './homeFloorPlans';

/** These belong to the host. Item IDs choose existing models; they never grant inventory. */
const common={bed:'bed_basic',shower:'shower_basic',lamp:'lamp'};
export const FIXED_STAY_ITEMS:Readonly<Record<string,Readonly<Partial<Record<HomeObjectKind,string>>>>>={
  minsu:{...common},
  hotel_budget:{...common},
  hotel:{...common,bed:'bed_premium',shower:'shower_premium',sofa:'sofa',plant:'plant'},
  hotel_mooncourt:{...common,bed:'bed_premium',shower:'shower_premium',sofa:'sofa',plant:'plant'},
  hotel_mooncourt_budget:{...common},
  hotel_boyu_nightmarket:{...common,bed:'bed_standard',sofa:'sofa'},
  npc_guest_room:{...common,bed:'bed_standard',plant:'plant'},
};

function anchor(x:number,z:number,width:number,height:number,rotation=0):HomeAnchor{return {position:[x,z],width,height,rotation};}
interface StaySpec {id:string;title:string;size:HomePoint;bath:HomePoint;windowWidth:number;books?:boolean;sofa?:boolean;plant?:boolean;luxury?:boolean}

/** Hotel bathrooms occupy the rear corner; the entry and central aisle remain clear. */
function stayPlan(s:StaySpec):HomePlan {
  const [w,d]=s.size,[bw,bd]=s.bath,bx=w-bw;
  const anchors:HomePlan['anchors']={
    bed:anchor(1.55,1.55,1.85,1.95),computer:anchor(.52,d-1.55,1.15,1.1,Math.PI/2),
    shower:anchor(w-.56,.65,.78,1.3),wardrobe:anchor(w-.43,bd+.85,.65,1.5,-Math.PI/2),
    door:anchor(w*.47,d-.07,.95,.52,Math.PI),storage:anchor(w-1.1,d-.3,.7,.7,Math.PI),
    lamp:anchor(2.85,.48,.38,1.25),
  };
  if(s.books)anchors.bookshelf=anchor(bx-.54,.34,.55,1.35);
  if(s.sofa)anchors.sofa=anchor(w-1.35,d-2.0,1.65,1.0,Math.PI);
  if(s.plant)anchors.plant=anchor(w-.48,d-1.0,.45,.8);
  if(s.luxury){anchors.bed=anchor(2.0,1.65,2.2,2.1);anchors.computer=anchor(.52,d-2,1.3,1.1,Math.PI/2);anchors.lamp=anchor(3.35,.5,.42,1.35);}
  const fixtures:NonNullable<HomePlan['fixtures']>=[
    {kind:'nightstand',position:[s.luxury?3.4:2.9,1.0],size:[.42,.42],owner:'bed'},
    {kind:'rug',position:[w*.47,d-.55],size:[1.0,.55],decorative:true},
    {kind:'bathVanity',position:[bx+.39,bd-1.03],size:[.9,.48],rotation:Math.PI/2,owner:'shower'},
  ];
  if(s.sofa)fixtures.push({kind:'coffeeTable',position:[w-1.35,d-3.05],size:[1.0,.52],requires:'sofa'});
  return {id:`stay_${s.id}`,title:s.title,size:s.size,outline:[[0,0],[w,0],[w,d],[0,d]],
    rooms:[{name:s.luxury?'睡眠与起居区':'客房',rect:[0,0,w,d],type:'bedroom'},
      {name:'独立卫浴',rect:[bx,0,bw,bd],type:'bath'},{name:'入户过道',rect:[w*.47-.6,d-1.25,1.2,1.25],type:'entry'}],
    partitions:[[bx,0,bx,bd],[bx,bd,bx+.25,bd],[w-.75,bd,w,bd]],
    windows:[{x:s.luxury?2.5:1.8,z:0,width:s.windowWidth,wall:'back',room:s.luxury?'睡眠与起居区':'客房'}],
    passages:[{name:'入户过道',rect:[w*.47-.55,d-1.25,1.1,1.15]},
      {name:'床尾通道',rect:[1.1,2.85,2.25,.8]},{name:'卫浴入口',rect:[bx+.28,bd-.45,bw-1.08,1.0]}],
    anchors,fixtures};
}

function suite(id:string,title:string):HomePlan {
  const base=HOME_FLOOR_PLANS.premium;
  const {kitchen,fridge,gym,...anchors}=base.anchors;
  return {...base,id:'stay_'+id,title,openKitchen:false,anchors,
    rooms:base.rooms.map(room=>room.type==='kitchen'?{...room,name:'临窗休闲区',type:'living'}:room),
    windows:base.windows.map(win=>({...win,room:win.room==='开放式厨房'?'临窗休闲区':win.room})),
    fixtures:base.fixtures?.filter(f=>!['counter','island'].includes(f.kind))};
}
export const FIXED_HOME_PLANS:Record<string,HomePlan>={
  minsu:stayPlan({id:'minsu',title:'老小区民宿 · 窗边床与旧木书架',size:[6.4,5.8],bath:[2.2,2.4],windowWidth:1.65,books:true}),
  hotel_budget:stayPlan({id:'hotel_budget',title:'酒店特惠间 · 独卫单间',size:[6.4,5.3],bath:[2.05,2.35],windowWidth:1.4}),
  hotel_mooncourt_budget:stayPlan({id:'hotel_mooncourt_budget',title:'月庭特惠间 · 独卫单间',size:[6.4,5.3],bath:[2.05,2.35],windowWidth:1.6}),
  hotel:suite('hotel','市中心豪华套房 · 独立卧室与宽景起居区'),
  hotel_mooncourt:suite('hotel_mooncourt','月庭豪华套房 · 独立卧室与临窗书房'),
  hotel_boyu_nightmarket:stayPlan({id:'hotel_boyu_nightmarket',title:'夜市快捷客房 · 靠窗休息角',size:[7.4,6.9],bath:[2.2,2.5],windowWidth:2.4,sofa:true}),
  npc_guest_room:stayPlan({id:'npc_guest_room',title:'朋友家客房 · 家用书架与绿植',size:[6.6,6.2],bath:[2.2,2.5],windowWidth:1.8,books:true,plant:true}),
};
