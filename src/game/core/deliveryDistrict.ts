import type {DeliveryPoint} from './minigame';
export function deliveryDistrict(key:string,mode:string) {
 const variant=key.includes('fulltime')?4:key.includes('taxi')?3:mode==='parcel'?1:mode==='rideshare'?2:0;
 const defs=[
  {name:'梧桐里 · 午间外卖',xs:[120,365,650,910],ys:[145,330,500],land:'#bbcaa0',road:'#59645b',water:false,capacity:3},
  {name:'城东物流园 · 集中派件',xs:[155,430,715,935],ys:[120,290,515],land:'#c9bfa4',road:'#686c72',water:false,capacity:4},
  {name:'滨江商务区 · 预约接送',xs:[110,330,660,950],ys:[135,345,515],land:'#91b7b4',road:'#3c5662',water:true,capacity:1},
  {name:'老城环线 · 街边扬招',xs:[130,410,690,920],ys:[110,310,490],land:'#cfb997',road:'#675e52',water:false,capacity:1},
  {name:'双桥片区 · 多单接力',xs:[100,350,680,940],ys:[125,310,510],land:'#a7bea1',road:'#485c58',water:true,capacity:3},
 ][variant];
 const nodes=defs.xs.flatMap(x=>defs.ys.map(y=>({x,y})));
 const edges:{a:{x:number;y:number};b:{x:number;y:number}}[]=[];
 for(let c=0;c<4;c++)for(let r=0;r<3;r++){
  if(c<3 && !(variant===1&&c===1&&r===1) && !(variant===3&&c===1&&r===0))edges.push({a:nodes[c*3+r],b:nodes[(c+1)*3+r]});
  if(r<2 && !(variant===2&&c===1&&r===0) && !(variant===4&&c===2&&r===1) && !(variant===0&&c===2&&r===0))edges.push({a:nodes[c*3+r],b:nodes[c*3+r+1]});
 }
 const pointOn=(p:{x:number;y:number},e:typeof edges[number])=>Math.abs((e.b.x-e.a.x)*(p.y-e.a.y)-(e.b.y-e.a.y)*(p.x-e.a.x))<.5&&p.x>=Math.min(e.a.x,e.b.x)-.1&&p.x<=Math.max(e.a.x,e.b.x)+.1&&p.y>=Math.min(e.a.y,e.b.y)-.1&&p.y<=Math.max(e.a.y,e.b.y)+.1;
 const linked=(a:{x:number;y:number},b:{x:number;y:number})=>edges.some(e=>pointOn(a,e)&&pointOn(b,e));
 const relocate=(points:DeliveryPoint[],pickup:boolean)=>points.map((p,i)=>{
  const index=pickup?[0,4,10][i%3]:[3,8,2,11][i%4];const door=nodes[index];
  const minY=variant===2?78:48;
  return {...p,door:{...door},x:Math.max(65,Math.min(978,door.x+(pickup?-68:68))),y:Math.max(minY,Math.min(568,door.y+(i%2?68:-68)))};
 });
 return {...defs,variant,nodes,edges,linked,relocate};
}
