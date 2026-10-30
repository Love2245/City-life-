import type { HomePlan, HomePoint } from '../game/core/homeInterior';
export interface HomeObstacle { min: number[]; max: number[] }
function inside(plan:HomePlan,x:number,z:number){let result=false;for(let i=0,j=plan.outline.length-1;i<plan.outline.length;j=i++){const a=plan.outline[i],b=plan.outline[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
function lineDistance(x:number,z:number,s:number[]){const [a,b,c,d]=s,t=Math.max(0,Math.min(1,((x-a)*(c-a)+(z-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),z-b-t*(d-b));}
/** Actual rendered bounds, not catalogue footprints, keep pets and supplies clear. */
export function homePetSpotSafe(plan:HomePlan,p:HomePoint,radius:number,blocked:HomeObstacle[]):boolean{
  const [x,z]=p;
  for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])if(!inside(plan,x+dx,z+dz))return false;
  if(plan.partitions.some(s=>lineDistance(x,z,s)<radius+.1))return false;
  if((plan.passages??[]).some(({rect:[rx,rz,w,h]})=>x+radius>rx&&x-radius<rx+w&&z+radius>rz&&z-radius<rz+h))return false;
  return !blocked.some(b=>x+radius>b.min[0]-.07&&x-radius<b.max[0]+.07&&z+radius>b.min[2]-.07&&z-radius<b.max[2]+.07);
}
export function homePetSpots(plan:HomePlan,radius:number,blocked:HomeObstacle[],bath=false):HomePoint[]{
  const points:HomePoint[]=[];
  for(const room of plan.rooms){
    if(room.type==='entry'||room.type==='kitchen'||!bath&&room.type==='bath')continue;
    const [x,z,w,h]=room.rect,step=.35;
    for(let px=x+radius+.14;px<x+w-radius;px+=step)for(let pz=z+radius+.14;pz<z+h-radius;pz+=step){
      const p:HomePoint=[Number(px.toFixed(3)),Number(pz.toFixed(3))];
      if(!bath&&plan.rooms.some(r=>r.type==='bath'&&p[0]>r.rect[0]-radius&&p[0]<r.rect[0]+r.rect[2]+radius&&p[1]>r.rect[1]-radius&&p[1]<r.rect[1]+r.rect[3]+radius))continue;
      if(homePetSpotSafe(plan,p,radius,blocked)&&!points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<.2))points.push(p);
    }
  }
  // Prefer sheltered edges over the middle of circulation areas.
  return points.sort((a,b)=>Math.min(...plan.rooms.map(r=>Math.min(Math.abs(a[0]-r.rect[0]),Math.abs(a[0]-r.rect[0]-r.rect[2]),Math.abs(a[1]-r.rect[1]),Math.abs(a[1]-r.rect[1]-r.rect[3]))))-Math.min(...plan.rooms.map(r=>Math.min(Math.abs(b[0]-r.rect[0]),Math.abs(b[0]-r.rect[0]-r.rect[2]),Math.abs(b[1]-r.rect[1]),Math.abs(b[1]-r.rect[1]-r.rect[3])))));
}
/** Fixed shelter with a clear approach to its doorway; no game-clock or RNG input. */
export function homeCatNestPlacement(plan:HomePlan,radius:number,blocked:HomeObstacle[]):{position:HomePoint;rotation:number}|undefined{
  for(const position of homePetSpots(plan,radius,blocked)){
    const area=plan.rooms.find(r=>r.type!=='bath'&&position[0]>=r.rect[0]&&position[0]<=r.rect[0]+r.rect[2]&&position[1]>=r.rect[1]&&position[1]<=r.rect[1]+r.rect[3]);
    const center:HomePoint=area?[area.rect[0]+area.rect[2]/2,area.rect[1]+area.rect[3]/2]:[plan.size[0]/2,plan.size[1]/2];
    const facing=Math.atan2(position[0]-center[0],position[1]-center[1]);
    for(const offset of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2,Math.PI]){
      const rotation=facing+offset;
      const approach:HomePoint=[position[0]-Math.sin(rotation)*(radius+.38),position[1]-Math.cos(rotation)*(radius+.38)];
      if(homePetSpotSafe(plan,approach,.22,blocked))return{position,rotation};
    }
  }
}
