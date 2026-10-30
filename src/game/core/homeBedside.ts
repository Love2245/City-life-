import type {HomePlan,HomePoint} from './homeInterior';

function inside(plan:HomePlan,[x,z]:HomePoint){
  let result=false;
  for(let i=0,j=plan.outline.length-1;i<plan.outline.length;j=i++){
    const a=plan.outline[i],b=plan.outline[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}

/** A supplied bedside fitting, never an inventory item or a saved furniture position. */
export function withBedsideTrash(plan:HomePlan):HomePlan {
  const bed=plan.anchors.bed;if(!bed||plan.anchors.trash)return plan;
  const yaw=bed.rotation??0,candidates:{point:HomePoint;score:number}[]=[];
  const walls:[number,number,number,number][]=[...plan.outline.map((a,i)=>[...a,...plan.outline[(i+1)%plan.outline.length]] as [number,number,number,number]),...plan.partitions];
  const obstacles=[...Object.entries(plan.anchors).filter(([kind])=>kind!=='bed').map(([,a])=>({position:a!.position,radius:.6})),...(plan.fixtures??[]).filter(f=>!f.decorative&&f.kind!=='rug').map(f=>({position:f.position,radius:Math.max(...f.size)/2+.24}))];
  const wallDistance=(point:HomePoint,[ax,az,bx,bz]:typeof walls[number])=>{const length=(bx-ax)**2+(bz-az)**2,t=length?Math.max(0,Math.min(1,((point[0]-ax)*(bx-ax)+(point[1]-az)*(bz-az))/length)):0;return Math.hypot(point[0]-ax-t*(bx-ax),point[1]-az-t*(bz-az));};
  for(const [ax,az,bx,bz] of walls){
    const length=Math.hypot(bx-ax,bz-az);if(!length)continue;
    const steps=Math.ceil(length/.15),nx=-(bz-az)/length,nz=(bx-ax)/length;
    for(let i=0;i<=steps;i++)for(const side of [-1,1]){
      // The basket rim sits just clear of the wall/skirting, rather than in the aisle.
      const point:HomePoint=[ax+(bx-ax)*i/steps+nx*.25*side,az+(bz-az)*i/steps+nz*.25*side];
      const dx=point[0]-bed.position[0],dz=point[1]-bed.position[1],distance=Math.hypot(dx,dz);
      if(distance>3.5||![-.2,.2].every(x=>[-.2,.2].every(z=>inside(plan,[point[0]+x,point[1]+z]))))continue;
      const localX=dx*Math.cos(yaw)-dz*Math.sin(yaw),localZ=dx*Math.sin(yaw)+dz*Math.cos(yaw);
      // Keep it beside the bed's widest headboard, never hidden behind the pillows.
      if(Math.abs(localX)<(localZ<-.8*(bed.scale?.[2]??1)?1.65:1.55)*(bed.scale?.[0]??1)/2+.2)continue;
      // Reserve the wall strip behind bedside tables; a basket there is hard to see or reach.
      if(plan.fixtures?.some(f=>{if(f.kind!=='nightstand')return false;const x=point[0]-f.position[0],z=point[1]-f.position[1];return Math.abs(x*Math.cos(yaw)-z*Math.sin(yaw))<f.size[0]/2+.25&&x*Math.sin(yaw)+z*Math.cos(yaw)<f.size[1]/2+.2;}))continue;
      if(walls.some(wall=>wallDistance(point,wall)<.24))continue;
      if(obstacles.some(o=>Math.hypot(point[0]-o.position[0],point[1]-o.position[1])<o.radius))continue;
      if(plan.passages?.some(({rect:[x,z,w,d]})=>point[0]+.2>x&&point[0]-.2<x+w&&point[1]+.2>z&&point[1]-.2<z+d))continue;
      candidates.push({point,score:distance});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  if(!candidates.length)return plan;
  return {...plan,anchors:{...plan.anchors,trash:{position:candidates[0].point,width:.38,height:.5}}};
}
