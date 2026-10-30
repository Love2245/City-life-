import {readFileSync,writeFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {dispatchPayTerms,dispatchQuote,dispatchMoney,dispatchWage} from '../src/lib/streetDispatch/pay.js';
const root='docs/minigames-pay-20261016',shell=readFileSync('src/lib/streetDispatch/shell.html','utf8'),code=readFileSync(root+'/before/src/lib/streetDispatch/runtime.js','utf8');
const data=JSON.parse(readFileSync('src/game/data/minigames.json','utf8')),cfgs=data.games??data;
function simulate(key,seed,wait){
 const dom=new JSDOM(shell,{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 const ctx=new Proxy({},{get:(_,name)=>name==='measureText'?()=>({width:50}):()=>{}});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>1;w.__STREET_DISPATCH_TEST__=true;w.__STREET_DISPATCH_BRIDGE_ID__='calibration';w.postMessage=()=>{};
 Object.defineProperties(w.HTMLElement.prototype,{clientWidth:{get(){return 960}},clientHeight:{get(){return 540}}});w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:960,height:540});
 w.eval(code.replace('return{id,pickup,dropoff,restaurant:', 'return{id,pickup,dropoff,quotedDistance:distance,restaurant:'));const e=w.__streetDispatchTest;e.configure({cfg:{...cfgs[key],actualIncome:true,timeLimit:90},sceneKey:key,seed});e.withoutTraffic();e.start();let idle=0,stops=0,newCommission=0;const terms=dispatchPayTerms(180,key==='job_express'?6:10);
 function interact(){const before=e.snapshot();e.interact();const ids=new Set(e.snapshot().orders.map(o=>o.id));for(const o of before.orders)if(o.status==='delivery'&&!ids.has(o.id))newCommission=dispatchMoney(newCommission+dispatchMoney(dispatchQuote(terms,o.quotedDistance)*o.quality/100));}
 for(let t=0;t<90;t+=.1){
  const p=e.snapshot().player,target=e.plan()[0]?.point;
  if(target&&Math.hypot(p.x-target.x,p.y-target.y)<45){e.release();e.controls(['Space']);if(p.speed<35){if(idle>=wait){interact();idle=0;stops++}else idle+=.1;}}
  else if(target){idle=0;const path=e.route();let best=Infinity,segment=0,along=0;
   for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,u=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0,d=Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy);if(d<best){best=d;segment=i;along=u;}}
   let point=target,look=140;
   for(let i=segment;i<path.length-1;i++){const a=path[i],b=path[i+1],start=i===segment?along:0,len=Math.hypot(b.x-a.x,b.y-a.y)*(1-start);if(len>=look){const u=start+look/Math.hypot(b.x-a.x,b.y-a.y);point={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};break;}look-=len;}
   e.controls([]);e.pointerTo(point);
  }
  for(let i=0;i<3;i++)e.step(1/30);
 }
 const p=e.snapshot(),result={key,mode:p.kind,seed,reactionDelay:wait,delivered:p.delivered,oldIncome:p.earnedFare,newReferenceIncome:dispatchWage(terms,p.delivered,newCommission).total,newCommission,expired:p.expired,crashes:p.crashes,stops};dom.window.close();return result;
}
const rows=[];for(const key of ['job_delivery','job_express'])for(const seed of [901,515,937])for(const wait of [.3,1])rows.push(simulate(key,seed,wait));
const summary=['job_delivery','job_express'].map(key=>{const a=rows.filter(r=>r.key===key);return{key,meanOrders:a.reduce((n,r)=>n+r.delivered,0)/a.length,meanOldIncome:a.reduce((n,r)=>n+r.oldIncome,0)/a.length,meanNewReferenceIncome:a.reduce((n,r)=>n+r.newReferenceIncome,0)/a.length,range:[Math.min(...a.map(r=>r.delivered)),Math.max(...a.map(r=>r.delivered))]};});
writeFileSync(root+'/delivery-calibration.json',JSON.stringify({method:'Unobstructed continuous pointer steering on actual navigation routes, 90 seconds, no teleport; stop reaction delay 0.3 or 1 seconds. New contract reprices the same delivered routes and quality with the shared pay kernel (reference income 180). Old income is raw delivery fare, not the old fixed salary for parcel or formal jobs. This is an engine benchmark, not player telemetry.',rows,summary},null,2));console.log(JSON.stringify(summary));
