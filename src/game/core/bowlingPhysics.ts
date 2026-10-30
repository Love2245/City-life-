export interface Body { x:number; y:number; vx:number; vy:number; radius:number; fallen:boolean; angle:number }
export interface BowlingWorld { ball:Body; pins:Body[]; elapsed:number; gutter:boolean }
export function rack(count=10):Body[] {
 const pins:Body[]=[];
 for(let row=0;pins.length<count;row++) for(let col=0;col<=row&&pins.length<count;col++) pins.push({x:50+(col-row/2)*8,y:43-row*7.2,vx:0,vy:0,radius:2.7,fallen:false,angle:0});
 return pins;
}
export function launch(pins:Body[],aim:number,power:number,spin=0):BowlingWorld {
 const speed=48+Math.max(0,Math.min(1,power))*48;
 return {ball:{x:50,y:91,vx:(Math.max(8,Math.min(92,aim))-50)/48*speed+spin*3,vy:-speed,radius:3.4,fallen:false,angle:0},pins:pins.map(p=>({...p,vx:0,vy:0})),elapsed:0,gutter:false};
}
/** Small steps avoid tunnelling. Scores arise from contact impulses, never random hit quotas. */
export function stepWorld(w:BowlingWorld,dt:number):void {
 const steps=Math.max(1,Math.ceil(dt/(1/180))),h=Math.min(dt,.05)/steps;
 for(let n=0;n<steps;n++) {
  w.elapsed+=h;const b=w.ball;
  b.x+=b.vx*h;b.y+=b.vy*h;b.angle+=Math.hypot(b.vx,b.vy)*h*12;
  b.vx*=Math.exp(-.15*h);b.vy*=Math.exp(-.15*h);
  if(b.x<6||b.x>94){w.gutter=true;b.x=Math.max(3,Math.min(97,b.x));b.vx=0;}
  for(const p of w.pins){p.x+=p.vx*h;p.y+=p.vy*h;p.angle+=p.vx*h*7;p.vx*=Math.exp(-2.4*h);p.vy*=Math.exp(-2.4*h);}
  const bodies=[b,...w.pins];
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   if(i===0&&w.gutter)continue;
   const a=bodies[i],p=bodies[j],dx=p.x-a.x,dy=p.y-a.y,dist=Math.hypot(dx,dy),sum=a.radius+p.radius;
   if(dist>=sum||dist<.0001)continue;
   const nx=dx/dist,ny=dy/dist,closing=(a.vx-p.vx)*nx+(a.vy-p.vy)*ny;
   if(closing<=0)continue;
   const mass=i===0?3:1,impulse=1.65*closing/(1/mass+1);
   a.vx-=impulse*nx/mass;a.vy-=impulse*ny/mass;p.vx+=impulse*nx;p.vy+=impulse*ny;
   const overlap=sum-dist;p.x+=nx*overlap*.6;p.y+=ny*overlap*.6;
   if(impulse>6){p.fallen=true;if(i>0)a.fallen=true;}
  }
 }
}
