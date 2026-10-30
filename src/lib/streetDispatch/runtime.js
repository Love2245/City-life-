
'use strict';
(() => {
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false}),stage=$('stage');
const WORLD=1920,CELL=16,GRID=WORLD/CELL,RIDER_RADIUS=12;
const COLORS=['#ffcc47','#60debb','#aeafff','#ff927b','#86c9ff','#f5a9d1','#c2db7e','#efb783'];
const FOOD=['招牌牛肉饭','番茄意面','脆皮鸡腿饭','双拼便当','鲜虾云吞面','抹茶拿铁'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),random=a=>a[Math.floor(gameplayRandom()*a.length)];
const fmt=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0')};
function seeded(seed){let x=seed;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
const rng=seeded(87216),keys=new Set(),touchKeys=new Set();
let width=900,height=600,dpr=1,mode='start',orders=[],offers=[],selectedId=null,orderSerial=101,nextLabel=1;
let remaining=90,money=0,delivered=0,combo=0,maxCombo=0,expired=0,crashes=0,accepted=0,maxCargo=0;
let player,camera,particles=[],floating=[],route=[],routeDist=0,worldTime=0,previous=0,shake=0;
let routeClock=0,hudClock=0,musicClock=0,offerClock=0,toastTime=0,sound=true,audio=null,musicStep=0,best=0,fastMode=false;
let pointer={active:false,id:null,x:0,y:0};
// Analog direction is transient input, like keyboard state; never restore a held stick from a save.
let joystick={active:false,id:null,x:0,y:0};
// The parent owns the real GameState and wallet; this frame owns only this challenge.
const CHANNEL='urban-life-street-dispatch';
const bridgeId=window.__STREET_DISPATCH_BRIDGE_ID__||'test';
let settings={kind:'food',sceneKey:'job_delivery',title:'街头派送',limit:90,target:6,capacity:6,pay:8,seed:1};
let gameplayState=1,visualRandom=seeded(37194),earnedFare=0,trafficFine=0,progressClock=0,externalPaused=false,initialized=false,endingReason='';
let returningWarehouse=false,parcelBatchOpen=true,pauseWithParent=false;
let audioSettings={musicEnabled:true,musicVolume:0.6,sfxVolume:0.8,muted:false,paused:false};
function applyAudioSettings(value){if(!value||typeof value!=='object')return;const level=v=>Math.max(0,Math.min(1,Number(v)||0));audioSettings={musicEnabled:value.musicEnabled!==false,musicVolume:level(value.musicVolume),sfxVolume:level(value.sfxVolume),muted:value.muted===true,paused:value.paused===true};if(audio){if(audioSettings.muted||audioSettings.paused)audio.suspend().catch(()=>{});else if(sound)audio.resume().catch(()=>{})}}

const warehouse={name:'南风快递仓',x:420,y:540};
function gameplayRandom(){gameplayState=(Math.imul(gameplayState,1664525)+1013904223)>>>0;return gameplayState/4294967296}
function post(type,extra={}){window.parent.postMessage({channel:CHANNEL,bridgeId,type,...extra},'*')}
function snapshot(){return JSON.parse(JSON.stringify({schema:CHANNEL,version:1,sceneKey:settings.sceneKey,kind:settings.kind,
 mode,remaining,money,earnedFare,trafficFine,delivered,combo,maxCombo,expired,crashes,accepted,maxCargo,
 player,camera,orders,offers,orderSerial,nextLabel,manualId,autoAccept,autoLimit,returningWarehouse,parcelBatchOpen,
 plannedLate,worldTime,gameplayState,fastMode,sound,
 clocks:{autoClock,planClock,offerClock,routeClock,hudClock,musicClock},cars:cars.map(c=>({pos:c.pos,dir:c.dir,speed:c.speed})),endingReason}))}
function reportProgress(){if(initialized)post('progress',{progress:snapshot(),completedOrders:delivered,earnedFare})}
function reportFinish(final,reason=''){post('finish',{ratio:Math.min(1,delivered/settings.target),completedOrders:delivered,earnedFare,final,reason})}
function restore(progress){
 if(!progress||progress.schema!==CHANNEL||progress.version!==1||progress.sceneKey!==settings.sceneKey||progress.kind!==settings.kind)return false;
 const finite=v=>typeof v==='number'&&Number.isFinite(v),point=p=>p&&finite(p.x)&&finite(p.y);
 if(!point(progress.player)||!Array.isArray(progress.orders)||!Array.isArray(progress.offers)||!finite(progress.remaining)||!finite(progress.delivered)||!finite(progress.earnedFare))return false;
 if(progress.orders.length>settings.capacity||progress.offers.length>12||progress.orders.some(o=>!point(o.pickup)||!point(o.dropoff)||!['pickup','delivery'].includes(o.status)))return false;
 const p=JSON.parse(JSON.stringify(progress));
 mode=['start','playing','paused','end'].includes(p.mode)?p.mode:'paused';remaining=clamp(p.remaining,0,settings.limit);money=Math.max(0,p.money||0);earnedFare=Math.max(0,p.earnedFare);trafficFine=Math.max(0,p.trafficFine||0);delivered=Math.max(0,Math.floor(p.delivered));
 combo=p.combo||0;maxCombo=p.maxCombo||0;expired=p.expired||0;crashes=p.crashes||0;accepted=p.accepted||0;maxCargo=p.maxCargo||0;
 player={...newPlayer(),...p.player};camera=point(p.camera)?p.camera:{x:player.x,y:player.y};orders=p.orders;offers=p.offers;
 orderSerial=p.orderSerial||101;nextLabel=p.nextLabel||1;manualId=p.manualId??null;autoAccept=p.autoAccept!==false;autoLimit=clamp(p.autoLimit||3,1,settings.capacity);
 fastMode=p.fastMode===true;sound=p.sound!==false;updateFastButton();updateSound();
 returningWarehouse=settings.kind==='parcel'&&p.returningWarehouse===true;parcelBatchOpen=p.parcelBatchOpen!==false;
 worldTime=p.worldTime||0;gameplayState=(p.gameplayState>>>0)||1;
 autoClock=p.clocks?.autoClock||0;planClock=p.clocks?.planClock||0;offerClock=p.clocks?.offerClock||0;routeClock=p.clocks?.routeClock||0;hudClock=p.clocks?.hudClock||0;musicClock=p.clocks?.musicClock||0;endingReason=p.endingReason||'';
 if(Array.isArray(p.cars))p.cars.forEach((c,i)=>{if(cars[i]&&finite(c.pos)){cars[i].pos=clamp(c.pos,0,cars[i].road.length);cars[i].dir=c.dir===-1?-1:1;cars[i].speed=finite(c.speed)?c.speed:cars[i].speed;placeCar(cars[i])}});
 keys.clear();releasePointer();particles=[];floating=[];updatePlan();renderCards();updateHud();hideOverlays();
 if(mode==='start')$('startOverlay').hidden=false;else if(mode==='paused')$('pauseOverlay').hidden=false;else if(mode==='end')$('resultOverlay').hidden=false;
 previous=performance.now();return true;
}
function applyPresentation(){
 const parcel=settings.kind==='parcel',ride=settings.kind==='rideshare';
 document.body.dataset.mode=settings.kind;document.title=settings.title;
 document.querySelector('.brand h1').textContent=settings.title;
 document.querySelector('.header-tag').textContent=ride?'一趟只接一位乘客，平稳送到目的地。':parcel?'同仓装车，逐件交付，返回再接下一批。':'一座小城，一路热乎。';
 document.querySelector('.shift-info strong').textContent=ride?'汽车 · 单人接送':parcel?'三轮车 · 仓库配送':'电动车 · 城市送餐';
 document.querySelector('.stat.money .stat-label').textContent=settings.payTerms?'预计总工资':settings.actualIncome?'本班工资':'预计班次工资';document.querySelector('.stat.money').title=settings.payTerms?'完班底薪与已送达提成合计；提前结束仅结算提成，交通罚款已即时扣除':settings.actualIncome?'显示本班累计工资；交通罚款会单独即时扣除':'基础工资与按达标比例计算的表现奖金';
 document.querySelector('.stat:nth-child(4) .stat-label').textContent=ride?'乘客满意度':'连续准时';document.querySelector('.stat:nth-child(4)').classList.toggle('satisfaction',ride);document.querySelector('.stat:nth-child(4) em').textContent=ride?'%':'连单';
 document.querySelector('.start-rules div:nth-child(1)').innerHTML='<b>'+settings.limit+' 秒</b>'+(settings.limit===120?'加班挑战':'本班挑战');
 document.querySelector('.start-rules div:nth-child(3)').innerHTML=settings.payTerms?'<b>底薪 ¥'+moneyText(settings.payTerms.base)+'</b>另加每单提成':'<b>圆形摇杆</b>全方向转弯';
 document.querySelector('.start-rules div:nth-child(2)').innerHTML='<b>'+(ride?'1 位乘客':parcel?'最多 3 件':'1–6 单')+'</b>'+(ride?'下客后接下一单':parcel?'同仓批量装货':'自动与手动接单');
 document.querySelector('.modal h2').textContent=ride?'平稳，把人送到。':parcel?'每一件，送到手中。':'热饭，准时到。';
 document.querySelector('#startOverlay .modal-copy').textContent=ride?'开车到上车点停稳接客，再实际驶往目的地停稳下客。满意度初始100%，超时与碰撞会降低满意度，并按满意度计酬。':parcel?'到同一仓库批量装货，按路线逐件交付。送完后实际驾驶回仓库，再接下一批。': '驾驶电动车穿过主街、小巷与公园。自动接下顺路餐单，也可关闭自动，手动选择订单。';
 if(settings.payTerms)document.querySelector('#startOverlay .modal-copy').textContent+=' 完班至少送达一单可领底薪；提前结束仅结算提成。';
 $('startBtn').textContent=ride?'开始接送':parcel?'开始派件':'开始接单';$('resumeBtn').textContent=ride?'继续接送':parcel?'继续派件':'继续配送';
 document.querySelector('#pauseOverlay .pause-controls').innerHTML='<div><b>驾驶</b><br>WASD / 方向键<br>圆形摇杆自由转向</div><div><b>加速与停车</b><br>Shift / 加速开关<br>松手或 Space 刹停</div><div><b>接单与导航</b><br>自动或手动接单<br>点击订单优先导航</div><div><b>'+ (ride?'满意度与车费':'货品与路况')+'</b><br>'+(ride?'超时与碰撞扣满意度<br>下客时按满意度计酬':parcel?'撞楼碰车损伤包裹<br>送完要返回仓库':'撞楼碰车损伤餐品<br>停稳后 E 一起取送')+'</div>';
 document.querySelector('.order-tip').textContent=ride?'每次只接1位乘客；下客后才派下一单。':parcel?'同仓装货 → 逐件送达 → 开回仓库。':'自动规划全部取送点；同店合取。点击订单优先导航。';
 document.querySelector('.route-title h3').textContent=ride?'接送顺序':'配送顺序';
 $('touchDeliver').textContent=ride?'上 / 下客':parcel?'装 / 交货':'取 / 送';
 $('touchDeliver').setAttribute('aria-label',ride?'停靠接客或下客':parcel?'停靠装货或交付包裹':'一起取餐或送达');
 document.querySelector('.daily-goal strong').textContent='评级目标 '+settings.target+' 单 · 达标后可继续';
 $('restartBtn').hidden=true;$('againBtn').hidden=true;$('backBtn').hidden=true;document.querySelector('.result-grid div:last-child').hidden=true;
 $('incomeNote').textContent=settings.payTerms?'完班底薪 ¥'+moneyText(settings.payTerms.base)+' + 送达提成；提前结束仅结算提成，每单不递减。':settings.actualIncome?(ride?'按实际送达车费结算；碰撞不扣现金':'按实际配送收入结算8小时班次；交通罚款已当场扣除'):settings.fixedShiftBase!=null?'固定工资 ¥'+moneyText(settings.fixedShiftBase)+' + 达标表现奖金，结束后正式结算':'挑战内预计报酬；正式岗位工资按班次统一结算';
 const select=$('autoLimit');select.replaceChildren();for(let i=1;i<=settings.capacity;i++){const option=document.createElement('option');option.value=i;option.textContent=i+(ride?' 位乘客':' 单');select.appendChild(option)}select.disabled=ride;
 if(!canvas.getAttribute('aria-label').includes('自由驾驶'))canvas.setAttribute('aria-label','俯视自由驾驶地图，WASD或方向键驾驶，Shift加速，Space刹车，E停靠取送，鼠标按住画面或拖动圆形摇杆，全方向驾驶。');
}
function configure(data){
 const cfg=data.cfg||{},kind=['food','parcel','rideshare'].includes(cfg.mode)?cfg.mode:'food';
 settings={kind,payTerms:validDispatchPay(cfg.deliveryPay)?cfg.deliveryPay:undefined,actualIncome:cfg.actualIncome===true,fixedShiftBase:Number.isFinite(Number(cfg.fixedShiftBase))?Math.max(0,Number(cfg.fixedShiftBase)):undefined,shiftBonusRate:clamp(Number(cfg.shiftBonusRate)||0,0,1),sceneKey:String(data.sceneKey||'job_delivery'),title:String(cfg.title||'街头派送'),limit:clamp(Number(cfg.timeLimit)||90,15,1800),target:clamp(Math.floor(Number(cfg.targetOrders)||6),1,100),capacity:kind==='rideshare'?1:kind==='parcel'?clamp(Math.floor(Number(cfg.maxActive)||3),1,3):6,pay:Math.max(1,Number(cfg.payPerOrder)||(kind==='rideshare'?25:kind==='parcel'?6:8)),seed:(Number(data.seed)>>>0)||1};
 applyAudioSettings(data.audioSettings);initialized=false;externalPaused=data.paused===true;pauseWithParent=data.pauseWithParent===true;autoAccept=true;autoLimit=kind==='rideshare'?1:Math.min(3,settings.capacity);applyPresentation();mode='start';reset();
 let restored=restore(data.progress);
 const legacy=data.progress;
 if(!restored&&legacy?.schema===CHANNEL&&legacy.version===0&&legacy.sceneKey===settings.sceneKey&&(settings.kind==='rideshare'||settings.actualIncome)&&legacy.kind===settings.kind&&Number.isInteger(legacy.delivered)&&legacy.delivered>=0&&Number.isFinite(legacy.earnedFare)&&legacy.earnedFare>=0){delivered=legacy.delivered;earnedFare=settings.kind==='rideshare'?Math.min(delivered*settings.pay,legacy.earnedFare):legacy.earnedFare;money=earnedFare;restored=true;updateHud()}
 initialized=true;$('startBtn').disabled=false;$('startBtn').removeAttribute('aria-busy');reportProgress();post('initialized',{restored});if(mode==='end')reportFinish(true,endingReason||'恢复已完成班次');
}
window.addEventListener('message',event=>{const d=event.data;if(event.source!==window.parent||!d||d.channel!==CHANNEL||d.bridgeId!==bridgeId)return;if(d.type==='init'){if(!initialized)configure(d);return}if(d.type==='audio-settings'){applyAudioSettings(d.audioSettings);return}if(!initialized)return;if(d.type==='pause'){const wasPaused=externalPaused;externalPaused=d.paused===true;keys.clear();releasePointer();previous=performance.now();if(wasPaused&&!externalPaused&&mode==='paused')resume();reportProgress()}else if(d.type==='snapshot')reportProgress();else if(d.type==='finish')end('主动结束本班');});


$('bestFooter').textContent='¥'+best;
const roads=[
 ['南风大道','main',100,[[100,540],[420,540],[760,500],[1120,540],[1460,480],[1820,480]]],
 ['梧桐街','main',92,[[320,110],[320,200],[320,360],[420,540],[400,880],[470,1200],[390,1380],[430,1550],[510,1820]]],
 ['晴川路','main',90,[[100,1380],[390,1380],[760,1470],[1110,1430],[1480,1500],[1820,1440]]],
 ['旧城街','street',64,[[140,200],[620,200],[820,320],[1190,260],[1540,300],[1780,200]]],
 ['东桥路','street',72,[[1540,110],[1540,300],[1580,480],[1600,750],[1500,1030],[1480,1500],[1560,1790]]],
 ['书院路','street',70,[[960,150],[950,320],[1120,540],[1110,870],[1190,1120],[1110,1430],[1160,1820]]],
 ['花市街','street',64,[[100,1060],[400,1060],[650,1170],[900,1130],[1190,1120],[1500,1030],[1800,1030]]],
 ['茶馆街','street',62,[[150,780],[400,880],[630,800],[760,500]]],
 ['青禾路','street',58,[[630,800],[790,1060],[900,1130]]],
 ['书院横街','street',50,[[820,320],[950,320]]],
 ['东桥支路','street',46,[[1460,480],[1320,430],[1190,260]]],
 ['食巷','alley',42,[[620,200],[650,360],[760,500]]],
 ['后街巷','alley',44,[[1110,870],[1300,830],[1600,750]]],
 ['橘子巷','alley',42,[[430,1550],[740,1660],[1000,1600],[1140,1664]]],
 ['白石尽头','dead',44,[[1190,260],[1270,120]]],
 ['东桥里','dead',44,[[1500,1030],[1690,1170],[1710,1290]]],
 ['梧桐里','dead',42,[[470,1200],[240,1200],[190,1280]]],
 ['旧城里','dead',42,[[320,360],[145,360]]],
 ['公园北径','parkPath',32,[[760,500],[805,650],[850,805],[970,905],[1110,870]]],
 ['公园南径','parkPath',30,[[850,805],[820,930],[790,1060]]]
].map(([name,kind,width,points])=>({name,kind,width,points:points.map(([x,y])=>({x,y})),segments:[],length:0}));
const parks=[{name:'南风公园',points:[[680,640],[995,665],[1040,940],[790,1030],[650,805]].map(([x,y])=>({x,y}))},{name:'梧桐小园',points:[{x:150,y:1540},{x:325,y:1540},{x:350,y:1720},{x:145,y:1740}]}];
const solids=[],buildings=[],trees=[],cars=[],roadSegments=[];
for(const road of roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],length=dist(a,b);let seg={a,b,length,offset:road.length,road};road.segments.push(seg);roadSegments.push(seg);road.length+=length}
const mapCanvas=document.createElement('canvas');mapCanvas.width=WORLD;mapCanvas.height=WORLD;const map=mapCanvas.getContext('2d');
function rr(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
function line(c,x1,y1,x2,y2,color,lw=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=lw;c.stroke()}
function tree(x,y,size=15){trees.push({x,y,size})}
function drawTree(c,t){c.fillStyle='#173c3b40';c.beginPath();c.ellipse(t.x+7,t.y+8,t.size+3,t.size-1,0,0,Math.PI*2);c.fill();line(c,t.x,t.y,t.x,t.y+9,'#786043',5);c.fillStyle='#235e50';c.beginPath();c.arc(t.x,t.y,t.size,0,Math.PI*2);c.fill();c.fillStyle='#3a8f67';c.beginPath();c.arc(t.x-3,t.y-4,t.size*.78,0,Math.PI*2);c.fill();c.fillStyle='#56aa78';c.beginPath();c.arc(t.x-6,t.y-7,t.size*.39,0,Math.PI*2);c.fill()}
function drawBuilding(b){let {x,y,w,h,color,roof,kind,label}=b;rr(map,x+9,y+12,w,h,8,'#172e3148');rr(map,x,y+7,w,h,7,'#36464b');rr(map,x,y,w,h-9,6,color);rr(map,x+6,y+6,w-12,h-24,4,roof);map.fillStyle='#ffffff13';map.fillRect(x+8,y+7,w-16,3);for(let i=0;i<Math.floor(w/25);i++){rr(map,x+12+i*25,y+h-13,14,7,1,'#304f62');map.fillStyle='#80bbc3';map.fillRect(x+14+i*25,y+h-12,10,3)}
 if(kind==='shop'){const awning=['#e87b66','#e8b84b','#469b94'][Math.floor(rng()*3)];rr(map,x+8,y+h-2,w-16,11,2,awning);for(let xx=x+12;xx<x+w-10;xx+=20){map.fillStyle='#ffffff5c';map.fillRect(xx,y+h-2,8,11)}rr(map,x+w/2-27,y+h-11,54,15,3,'#fff1d0');map.font='bold 10px "Microsoft YaHei",sans-serif';map.textAlign='center';map.fillStyle='#395155';map.fillText(label,x+w/2,y+h)}
 else{rr(map,x+12,y+14,24,19,3,'#ffffff26');rr(map,x+15,y+17,18,11,2,'#485c674f');line(map,x+15,y+30,x+32,y+30,'#263f4840',2);if(w>95){rr(map,x+w-32,y+14,20,29,3,'#293f4140');for(let a=0;a<4;a++)line(map,x+w-30,y+18+a*6,x+w-14,y+18+a*6,'#8bb9b552',2)}if(rng()>.5){rr(map,x+w/2-12,y+h/2-7,24,17,2,'#f2e4c033');line(map,x+w/2-10,y+h/2,x+w/2+10,y+h/2,'#2c494642',2)}}
}

function projection(p,a,b){let t=clamp(((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/((b.x-a.x)**2+(b.y-a.y)**2),0,1);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,t}}
function inPolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
function segmentRect(a,b,r){let t0=0,t1=1,dx=b.x-a.x,dy=b.y-a.y;for(const [p,q]of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]){if(p===0){if(q<0)return false;continue}const t=q/p;if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return false}return true}
function overlap(a,b,pad=0){return a.x-pad<b.x+b.w&&a.x+a.w+pad>b.x&&a.y-pad<b.y+b.h&&a.y+a.h+pad>b.y}
function nearRoadRect(rect,margin=15){return roadSegments.some(s=>{let pad=s.road.width/2+margin;return segmentRect(s.a,s.b,{x:rect.x-pad,y:rect.y-pad,w:rect.w+pad*2,h:rect.h+pad*2})})}
function touchesPark(rect,pad=10){return parks.some(p=>{const points=[{x:rect.x-pad,y:rect.y-pad},{x:rect.x+rect.w+pad,y:rect.y-pad},{x:rect.x+rect.w+pad,y:rect.y+rect.h+pad},{x:rect.x-pad,y:rect.y+rect.h+pad},{x:rect.x+rect.w/2,y:rect.y+rect.h/2}];return points.some(q=>inPolygon(q,p.points))||p.points.some(q=>q.x>=rect.x-pad&&q.x<=rect.x+rect.w+pad&&q.y>=rect.y-pad&&q.y<=rect.y+rect.h+pad)||p.points.some((a,i)=>segmentRect(a,p.points[(i+1)%p.points.length],{x:rect.x-pad,y:rect.y-pad,w:rect.w+pad*2,h:rect.h+pad*2}))})}
function polygonPath(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath()}
function roadPath(c,road){c.beginPath();road.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y))}
function terrainAt(x,y){const p={x,y};let kind='yard',factor=.48;const inPark=parks.some(park=>inPolygon(p,park.points));if(inPark){kind='park';factor=.58}for(const s of roadSegments){if(dist(p,projection(p,s.a,s.b))<=s.road.width/2+7){const k=s.road.kind,f=k==='parkPath'?.76:k==='alley'?.84:1;if(f>factor){factor=f;kind=k}}}return{kind,factor}}
function collideAt(x,y,r=RIDER_RADIUS){if(x<50+r||y<50+r||x>WORLD-50-r||y>WORLD-50-r)return true;for(const b of solids){const nx=clamp(x,b.x,b.x+b.w),ny=clamp(y,b.y,b.y+b.h);if((x-nx)**2+(y-ny)**2<r*r)return true}return false}
function initMap(){
 map.fillStyle='#a8b5a0';map.fillRect(0,0,WORLD,WORLD);for(let x=0;x<WORLD;x+=48)for(let y=0;y<WORLD;y+=48){map.fillStyle=rng()>.5?'#ffffff05':'#193d3305';map.fillRect(x,y,48,48)}
 for(const park of parks){polygonPath(map,park.points);map.fillStyle='#54896b';map.fill();map.lineWidth=6;map.strokeStyle='#729b78';map.stroke()}
 map.lineJoin='round';map.lineCap='round';for(const road of roads){roadPath(map,road);map.lineWidth=road.width+28;map.strokeStyle=road.kind==='parkPath'?'#538469':'#d0ccb5';map.stroke()}
 for(const road of roads){roadPath(map,road);map.lineWidth=road.width;map.strokeStyle=road.kind==='parkPath'?'#c6bd91':road.kind==='alley'?'#8f9a98':'#4d6069';map.stroke();if(road.kind==='main'||road.kind==='street'){map.setLineDash([18,22]);roadPath(map,road);map.lineWidth=2;map.strokeStyle='#d9ded27a';map.stroke();map.setLineDash([])}}
 const palette=[['#559b9b','#73bbac'],['#c87d69','#dfa386'],['#af985d','#d2b675'],['#658eaa','#89b4be'],['#807e9e','#a3a3bb'],['#4f9993','#6fbbab']];
 const zones=[[90,85,575,400],[690,85,525,395],[1240,85,590,350],[85,590,550,440],[1095,570,730,450],[85,1090,520,245],[620,1070,490,340],[1230,1080,595,330],[85,1450,560,375],[680,1510,540,320],[1240,1535,585,295]];
 // Paired shop wings share a visible, open central alley; reserve them before other parcels.
 for(const road of roads.filter(r=>r.kind==='alley'))for(const s of road.segments){for(let at=85;at<s.length-65;at+=75){const t=at/s.length,p={x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t},a=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x),pair=[-1,1].map(sign=>({x:p.x-Math.sin(a)*sign*74-22,y:p.y+Math.cos(a)*sign*74-22,w:44,h:44}));if(pair.some(b=>nearRoadRect(b,7)||touchesPark(b)||solids.some(q=>overlap(b,q,6))))continue;for(const b of pair){const pal=palette[buildings.length%6];Object.assign(b,{color:pal[0],roof:pal[1],kind:'shop',label:'巷里小店',alley:road.name});buildings.push(b);solids.push(b)}}}
 for(const [zx,zy,zw,zh]of zones){for(let attempt=0;attempt<135;attempt++){let w=65+Math.floor(rng()*90),h=58+Math.floor(rng()*75),b={x:zx+rng()*(zw-w),y:zy+rng()*(zh-h),w,h};if(nearRoadRect(b)||touchesPark(b)||solids.some(s=>overlap(b,s,14)))continue;let p=palette[buildings.length%palette.length];Object.assign(b,{color:p[0],roof:p[1],kind:buildings.length%4===0?'shop':'home',label:['小食铺','便利店','鲜花店','烘焙屋'][buildings.length%4]});buildings.push(b);solids.push(b)}}
 // Fill small irregular parcels between larger blocks without changing any street.
 for(let attempt=0;attempt<4500&&buildings.length<96;attempt++){const w=44+Math.floor(rng()*42),hh=46+Math.floor(rng()*34),b={x:85+rng()*(WORLD-170-w),y:85+rng()*(WORLD-170-hh),w,h:hh};if(nearRoadRect(b,10)||touchesPark(b,12)||solids.some(s=>overlap(b,s,10)))continue;const pal=palette[buildings.length%6];Object.assign(b,{color:pal[0],roof:pal[1],kind:w>64&&buildings.length%3===0?'shop':'home',label:'街角小店'});buildings.push(b);solids.push(b)}
 for(const road of roads.filter(r=>r.kind==='dead')){const s=road.segments.at(-1),p=s.b,a=Math.atan2(p.y-s.a.y,p.x-s.a.x),cx=p.x+Math.cos(a)*(road.width/2+13),cy=p.y+Math.sin(a)*(road.width/2+13);for(let side=-34;side<=34;side+=8){const x=cx-Math.sin(a)*side,y=cy+Math.cos(a)*side;solids.push({x:x-5,y:y-5,w:10,h:10,kind:'wall',deadEnd:road.name})}map.save();map.translate(cx,cy);map.rotate(a);line(map,3,-39,3,39,'#223b4140',13);line(map,0,-39,0,39,'#718387',9);line(map,-2,-39,-2,39,'#c5cdc6',3);map.font='bold 10px "Microsoft YaHei"';map.textAlign='center';map.fillStyle='#edf0d1';map.fillText('尽头',-16,-17);map.restore()}

 buildings.sort((a,b)=>a.y-b.y).forEach(drawBuilding);
 for(const road of roads.filter(r=>r.kind==='main'||r.kind==='street'))for(const s of road.segments){for(let at=80;at<s.length-20;at+=115){let p=projection({x:s.a.x+(s.b.x-s.a.x)*(at/s.length),y:s.a.y+(s.b.y-s.a.y)*(at/s.length)},s.a,s.b),angle=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x),side=(rng()>.5?1:-1),x=p.x-Math.sin(angle)*side*(road.width/2+17),y=p.y+Math.cos(angle)*side*(road.width/2+17);if(!collideAt(x,y,17))tree(x,y,10+rng()*4)}}
 for(const park of parks){for(let i=0;i<20;i++){const x=100+rng()*1100,y=630+rng()*1170;if(inPolygon({x,y},park.points)&&terrainAt(x,y).kind==='park')tree(x,y,12+rng()*9)}const p=park.points.reduce((a,b)=>({x:a.x+b.x/park.points.length,y:a.y+b.y/park.points.length}),{x:0,y:0});map.font='bold 16px "Microsoft YaHei"';map.fillStyle='#e5f0d5';map.textAlign='center';map.fillText(park.name,p.x,p.y+35);map.font='11px "Microsoft YaHei"';map.fillText('草地可通行 · 减速',p.x,p.y+54)}
 trees.sort((a,b)=>a.y-b.y).forEach(t=>drawTree(map,t));
 for(const [index,x,y,angle]of [[0,925,518,.11],[1,412,950,1.38],[2,920,1447,-.1],[3,1040,289,-.15],[6,1420,1050,-.18],[12,1360,815,-.26]]){map.save();map.translate(x,y);map.rotate(angle);map.font='bold 13px "Microsoft YaHei"';map.textAlign='center';map.fillStyle=roads[index].kind==='alley'?'#233f46':'#edf0d299';map.fillText(roads[index].name,0,0);map.restore()}
 for(let i=0;i<16;i++){const road=roads[i%9];cars.push({road,pos:rng()*road.length,dir:i%2?1:-1,speed:55+rng()*29,color:['#edb55c','#70bdb0','#d78375','#abc3ce','#768ca4'][i%5],x:0,y:0,angle:0});placeCar(cars.at(-1))}
}
function placeCar(car){const s=car.road.segments.find(s=>car.pos<=s.offset+s.length)||car.road.segments.at(-1),t=clamp((car.pos-s.offset)/s.length,0,1),a=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x);car.x=s.a.x+(s.b.x-s.a.x)*t-Math.sin(a)*car.dir*17;car.y=s.a.y+(s.b.y-s.a.y)*t+Math.cos(a)*car.dir*17;car.angle=a+(car.dir<0?Math.PI:0)}
initMap();
const navBlocked=new Uint8Array(GRID*GRID),navCost=new Float32Array(GRID*GRID);
for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const i=y*GRID+x,px=(x+.5)*CELL,py=(y+.5)*CELL;navBlocked[i]=collideAt(px,py,16)?1:0;navCost[i]=1/terrainAt(px,py).factor}
function clearSegment(a,b,r=15){const n=Math.ceil(dist(a,b)/5);for(let i=0;i<=n;i++){const t=n?i/n:0;if(collideAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,r))return false}return true}
function navAnchor(p){const x=clamp(Math.floor(p.x/CELL),0,GRID-1),y=clamp(Math.floor(p.y/CELL),0,GRID-1);let bestN=-1,bestD=Infinity;for(let radius=0;radius<=8;radius++){for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=GRID||yy>=GRID)continue;const n=yy*GRID+xx;if(navBlocked[n])continue;const q={x:(xx+.5)*CELL,y:(yy+.5)*CELL},d=dist(p,q);if(d<bestD&&clearSegment(p,q,12)){bestN=n;bestD=d}}if(bestN>=0)return bestN}return bestN}
function getRoute(start,end){const a=navAnchor(start),b=navAnchor(end);if(a<0||b<0)return{points:[],distance:Infinity};const scores=new Float64Array(GRID*GRID);scores.fill(Infinity);const previousNode=new Int32Array(GRID*GRID);previousNode.fill(-1);const closed=new Uint8Array(GRID*GRID),heap=[];
 const heuristic=n=>Math.hypot(n%GRID-b%GRID,Math.floor(n/GRID)-Math.floor(b/GRID));
 function push(n,f){let i=heap.length;heap.push({n,f});while(i>0){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p}heap[i]={n,f}}
 function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child}heap[i]=last}return first.n}
 scores[a]=0;push(a,heuristic(a));while(heap.length){const n=pop();if(closed[n])continue;if(n===b)break;closed[n]=1;const x=n%GRID,y=Math.floor(n/GRID);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(dx===0&&dy===0)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=GRID||yy>=GRID)continue;const nn=yy*GRID+xx;if(navBlocked[nn]||closed[nn])continue;if(dx&&dy&&(navBlocked[y*GRID+xx]||navBlocked[yy*GRID+x]))continue;let cost=scores[n]+(dx&&dy?Math.SQRT2:1)*(navCost[n]+navCost[nn])*.5;if(cost<scores[nn]){scores[nn]=cost;previousNode[nn]=n;push(nn,cost+heuristic(nn))}}}
 if(!Number.isFinite(scores[b]))return{points:[],distance:Infinity};let points=[],n=b;while(n>=0){points.unshift({x:(n%GRID+.5)*CELL,y:(Math.floor(n/GRID)+.5)*CELL});n=previousNode[n]}points.unshift({x:start.x,y:start.y});points.push({x:end.x,y:end.y});let clean=[points[0]];for(let i=1;i<points.length-1;i++){const p=clean.at(-1),q=points[i],r=points[i+1];if(Math.abs((q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x))>.01)clean.push(q)}clean.push(points.at(-1));let distance=0;for(let i=1;i<clean.length;i++)distance+=dist(clean[i-1],clean[i]);return{points:clean,distance}}
const stores=[['阿婆小灶',760,500],['南风面馆',630,800],['街角咖啡',620,200],['好味便当',1190,1120],['胖达汉堡',1500,1030],['一口寿司',430,1550],['旧城小食',950,320],['桥边餐厅',1580,480]].map(([name,x,y])=>({name,x,y}));
const homes=[['梧桐公寓',1120,540],['云杉工作室',320,200],['星光书店',1190,260],['青禾社区',900,1130],['晴川写字楼',1480,1500],['向日葵小屋',510,1820],['橘子花店',1000,1600],['南风广场',420,540],['白石小院',1240,172],['东桥居民楼',1690,1170],['茶馆后院',400,880],['梧桐里居民',240,1200],['旧城里住户',180,360],['公园工作室',1110,870],['东桥工作室',1600,750],['晴川小院',760,1470]].map(([name,x,y])=>({name,x,y}));
for(const p of [...stores,...homes]){if(collideAt(p.x,p.y,18)||navAnchor(p)<0)throw Error('Delivery point blocked: '+p.name)}
const routeCache=new Map();
const samePlace=(a,b)=>a.x===b.x&&a.y===b.y;
const placeKey=p=>p.x+','+p.y;
const moneyText=v=>Number(v.toFixed(2)).toString();
let autoAccept=true,autoLimit=3,manualId=null,tripPlan=[],tripLegs=[],planClock=0,autoClock=0,lastPlanOrigin={x:420,y:540};
let plannedLate=0;

function legBetween(a,b,dynamic=false){
 const key=placeKey(a)+'>'+placeKey(b);if(!dynamic&&routeCache.has(key))return routeCache.get(key);
 const leg=getRoute(a,b);leg.travelCost=0;
 for(let i=1;i<leg.points.length;i++){const p=leg.points[i-1],q=leg.points[i],length=dist(p,q);leg.travelCost+=length/terrainAt((p.x+q.x)/2,(p.y+q.y)/2).factor}
 if(!Number.isFinite(leg.distance))leg.travelCost=Infinity;
 if(!dynamic)routeCache.set(key,leg);return leg;
}
function placeDistance(a,b){return legBetween(a,b).distance}
function currentOrder(){return orders.find(o=>o.id===selectedId)||(returningWarehouse?{id:-1,label:'仓',status:'warehouse',color:'#60debb',pickup:warehouse,dropoff:warehouse}:null)}
function targetOf(o){return o.status==='pickup'?o.pickup:o.dropoff}
function payout(raw){return Math.round(Math.max(0,raw)*100)/100}
function makeOffer(first=false,group=null){
 const nearby=[...stores].sort((a,b)=>dist(player,a)-dist(player,b)).slice(0,4),pickup=settings.kind==='parcel'?warehouse:first?stores[0]:group||random(nearby);
 const options=homes.filter(p=>dist(p,pickup)>240&&dist(p,pickup)<1020),dropoff=first?homes[0]:random(options.length?options:homes),distance=placeDistance(pickup,dropoff);
 if(!Number.isFinite(distance))throw Error('Disconnected dispatch route');
 const id=orderSerial++;return{id,pickup,dropoff,restaurant:pickup.name,home:dropoff.name,food:settings.kind==='rideshare'?'预约乘客':settings.kind==='parcel'?'快递包裹':first?FOOD[0]:random(FOOD),reward:settings.kind==='rideshare'?settings.pay:settings.payTerms?dispatchQuote(settings.payTerms,distance):Math.round((settings.kind==='parcel'?6:7)+distance/145),limit:clamp(distance/90+65,75,130),time:0,status:'offer',quality:100,late:false,color:COLORS[(id-101)%COLORS.length],label:0};
}
function replenishOffers(){while(offers.length<5){const group=offers.length%3===1?offers[0]?.pickup:null;offers.push(makeOffer(false,group))}}
function acceptOffer(id,quiet=false,batch=false){
 if(externalPaused||(mode!=='playing'&&mode!=='start')||remaining<=0)return false;
 if(orders.length>=settings.capacity){if(!quiet)toast(settings.kind==='rideshare'?'先送完当前乘客，再接下一单':'已到本车接单上限');return false}
 if(settings.kind==='parcel'&&(!parcelBatchOpen||returningWarehouse||dist(player,warehouse)>56)){if(!quiet)toast('先开回仓库，再接下一批包裹');return false}
 const i=offers.findIndex(o=>o.id===id);if(i<0)return false;const o=offers.splice(i,1)[0];o.status='pickup';o.time=o.limit;o.label=nextLabel++;orders.push(o);accepted++;replenishOffers();
 if(!batch){updatePlan();renderCards();updateHud();reportProgress()}
 if(!quiet){tone(440,.09,.04);toast('已接 #'+o.id+' · 手上 '+orders.length+' / '+settings.capacity+' 单');canvas.focus({preventScroll:true})}return true;
}
function chooseAutoOffer(){
 const anchors=orders.length?orders.flatMap(o=>[targetOf(o),o.dropoff]):[player];
 let bestOffer=null,bestScore=Infinity;
 for(const o of offers){const pickupDistance=Math.min(...anchors.map(p=>placeDistance(p,o.pickup))),existing=orders.some(q=>q.status==='pickup'&&samePlace(q.pickup,o.pickup));
 const score=pickupDistance+placeDistance(o.pickup,o.dropoff)*.24-(existing?170:0);
 if(score<bestScore){bestScore=score;bestOffer=o}}
 return bestOffer;
}
function fillAutoOrders(){
 if(!autoAccept||externalPaused||mode!=='playing'||remaining<=0)return false;
 if(settings.kind==='parcel'&&(!parcelBatchOpen||returningWarehouse||dist(player,warehouse)>56))return false;
 let changed=false;while(orders.length<autoLimit&&orders.length<settings.capacity){const o=chooseAutoOffer();if(!o||!acceptOffer(o.id,true,true))break;changed=true}return changed;
}
function setupOrders(){orders=[];offers=[makeOffer(true)];replenishOffers();selectedId=null;manualId=null;tripPlan=[];if(autoAccept)acceptOffer(offers[0].id,true,true);updatePlan();renderCards()}
function dispatchChanged(){autoLimit=clamp(Math.round(autoLimit),1,settings.capacity);if(fillAutoOrders())updatePlan();syncDispatch();renderCards();updateHud();reportProgress()}
function syncDispatch(){
 $('autoAcceptBtn').setAttribute('aria-pressed',String(autoAccept));$('autoAcceptBtn').textContent=autoAccept?'自动接单 开':'自动接单 关';$('autoLimit').value=String(autoLimit);
 $('autoStatus').textContent=returningWarehouse?'先回南风快递仓，再装下一批':settings.kind==='rideshare'?(orders.length?'本趟仅1位乘客 · 下客后接下一单':autoAccept?'等待下一位乘客':'手动选择1位乘客'):autoAccept?(orders.length>autoLimit?'送完后降至 '+autoLimit+' 单':'保持 '+autoLimit+' 单 · '+(settings.kind==='parcel'?'回仓后补下一批':'送完自动补单')):'手动接单 · 最多 '+settings.capacity+' 单';
 document.querySelector('.shell').classList.toggle('auto-dispatch',autoAccept);
}
function selectOrder(id){if(!orders.some(o=>o.id===id))return;manualId=id;selectedId=id;updatePlan();renderCards();updateHud();tone(400,.045,.035);canvas.focus({preventScroll:true})}
function planStops(){
 if(!orders.length){plannedLate=0;return[]}
 const n=orders.length,powers=Array.from({length:n},(_,i)=>3**i),totalStates=3**n,complete=totalStates-1;
 const locations=[];for(const o of orders)for(const p of [o.pickup,o.dropoff])if(!locations.some(q=>samePlace(p,q)))locations.push(p);
 const count=locations.length,stride=count+1,start=orders.reduce((s,o,i)=>s+(o.status==='delivery'?1:0)*powers[i],0);
 const matrix=locations.map(a=>locations.map(b=>legBetween(a,b).travelCost/105+1.5)),first=locations.map(p=>legBetween(player,p,true).travelCost/105+1.5);
 const locked=orders.find(o=>o.id===manualId),lockIndex=locked?locations.findIndex(p=>samePlace(p,targetOf(locked))):-1;
 function solve(respectDeadlines){
  const times=new Float64Array(totalStates*stride);times.fill(Infinity);const prior=new Int32Array(times.length);prior.fill(-1);
  times[start*stride+count]=0;
  for(let state=start;state<complete;state++){
   const phases=powers.map(power=>Math.floor(state/power)%3),transitions=[];
   for(let at=0;at<count;at++){let next=state,picks=[],drops=[];
    for(let i=0;i<n;i++){const phase=phases[i],o=orders[i];if(phase===0&&samePlace(o.pickup,locations[at])){next+=powers[i];picks.push(i)}else if(phase===1&&samePlace(o.dropoff,locations[at])){next+=powers[i];drops.push(i)}}
    if(next!==state)transitions.push({at,next,picks,drops});
   }
   for(let last=0;last<=count;last++){const from=state*stride+last,elapsed=times[from];if(!Number.isFinite(elapsed))continue;
    for(const t of transitions){if(state===start&&last===count&&lockIndex>=0&&t.at!==lockIndex)continue;const arrival=elapsed+(last===count?first[t.at]:matrix[last][t.at]);
     if(respectDeadlines&&t.drops.some(i=>arrival>orders[i].time))continue;const to=t.next*stride+t.at;
     if(arrival<times[to]){times[to]=arrival;prior[to]=from}
    }
   }
  }
  let end=-1,bestTime=Infinity;for(let at=0;at<count;at++){const i=complete*stride+at;if(times[i]<bestTime){bestTime=times[i];end=i}}
  if(end<0)return null;const stops=[];
  while(prior[end]>=0){const before=prior[end],state=Math.floor(before/stride),at=end%stride,p=locations[at],picks=[],drops=[];
   orders.forEach((o,i)=>{const phase=Math.floor(state/powers[i])%3;if(phase===0&&samePlace(o.pickup,p))picks.push(o.id);if(phase===1&&samePlace(o.dropoff,p))drops.push(o.id)});
   stops.unshift({point:p,picks,drops,eta:times[end]});end=before;
  }return stops;
 }
 const stops=solve(true)||solve(false)||[];plannedLate=stops.reduce((sum,s)=>sum+s.drops.filter(id=>s.eta>(orders.find(o=>o.id===id)?.time||0)).length,0);return stops;
}
function updatePlan(){
 if(!orders.some(o=>o.id===manualId))manualId=null;
 tripPlan=returningWarehouse?[{point:warehouse,picks:[],drops:[],returning:true,eta:legBetween(player,warehouse,true).travelCost/105}]:planStops();tripLegs=[];let from=player;
 for(let i=0;i<tripPlan.length;i++){const s=tripPlan[i],leg=legBetween(from,s.point,i===0);tripLegs.push({...leg,stop:s});from=s.point}
 const first=tripPlan[0];selectedId=first?(first.drops[0]||first.picks[0]):null;planClock=0;lastPlanOrigin={x:player.x,y:player.y};updateRoute();renderRouteList();
}
function updateRoute(){
 const first=tripPlan[0];if(!first){route=[];routeDist=0;return}
 const leg=legBetween(player,first.point,true);route=leg.points;routeDist=leg.distance;if(tripLegs.length)tripLegs[0]={...leg,stop:first};
}
function renderRouteList(){
 const list=$('routeList');list.replaceChildren();$('routeAutoBtn').setAttribute('aria-pressed',String(manualId===null));$('routeAutoBtn').textContent=manualId===null?'自动路线':'恢复自动';
 $('routeSummary').textContent=tripPlan.length?tripPlan.length+' 站 · '+(plannedLate?'预计 '+plannedLate+' 单吃紧':'预计 '+Math.ceil(tripPlan.at(-1).eta)+' 秒'):'等待接单';
 if(!tripPlan.length){list.innerHTML='<li class="empty-route">接单后自动规划取送顺序</li>';return}
 tripPlan.forEach((s,i)=>{const li=document.createElement('li');li.className='route-stop'+(i===0?' next':'');const o=orders.find(o=>o.id===(s.drops[0]||s.picks[0]));li.style.setProperty('--stop-color',o?.color||COLORS[0]);const action=s.returning?'返回仓库 · 接下一批':(s.picks.length?(settings.kind==='rideshare'?'接'+s.picks.length+'人':settings.kind==='parcel'?'装'+s.picks.length+'件':'取'+s.picks.length+'份'):'')+(s.picks.length&&s.drops.length?' / ':'')+(s.drops.length?'送'+s.drops.length+(settings.kind==='rideshare'?'人':settings.kind==='parcel'?'件':'单'):'');li.innerHTML='<span class="stop-index">'+(i+1)+'</span><span><b>'+s.point.name+'</b><small>'+action+(i===0?' · 下一站':'')+'</small></span>';list.appendChild(li)});
}
function minimapModel(){
 const groups=new Map();function add(o,p,kind){const key=placeKey(p)+'/'+kind;if(!groups.has(key))groups.set(key,{point:p,kind,ids:[],color:o.color});groups.get(key).ids.push(o.id)}
 for(const o of orders){if(o.status==='pickup')add(o,o.pickup,'pickup');add(o,o.dropoff,'delivery')}
 if(settings.kind==='parcel')add({id:-1,color:'#60debb'},warehouse,'pickup');return[...groups.values()];
}

function renderCards(){
 const ride=settings.kind==='rideshare',parcel=settings.kind==='parcel',pickupWord=ride?'接客':parcel?'装货':'取餐',dropWord=ride?'下客':'送达',qualityWord=ride?'满意度':parcel?'完好度':'餐品';
 const list=$('orderList');list.replaceChildren();if(!orders.length){list.innerHTML='<p class="empty-orders">'+(returningWarehouse?'本批已送完，请按路线返回仓库。':'当前没有订单。自动接单会补单，也可以手动选择。')+'</p>'}
 orders.forEach(o=>{const btn=document.createElement('button');btn.className='order-card'+(selectedId===o.id?' selected':'');btn.style.setProperty('--order-color',o.color);btn.setAttribute('aria-label','导航订单'+o.label+'，'+(o.status==='pickup'?pickupWord+' '+o.restaurant:dropWord+' '+o.home));btn.setAttribute('aria-pressed',String(selectedId===o.id));btn.innerHTML='<div class="order-top"><span class="order-id"><span class="order-index">'+o.label+'</span>#'+o.id+'</span><span class="order-price"><small>'+(ride?'基础车费':settings.payTerms?'本单提成':'配送基价')+'</small>¥'+o.reward+'</span></div><div class="order-place">'+(o.status==='pickup'?o.restaurant:o.home)+'</div><div class="order-detail">'+(o.status==='pickup'?'送往 '+o.home:o.food+' · '+qualityWord+' '+Math.round(o.quality)+'%')+'</div><div class="order-bottom"><span class="order-state">'+(o.status==='pickup'?'待'+pickupWord:ride?'已上车 · 待下客':'已装车 · 待送达')+'</span><span class="order-time" data-time="'+o.id+'">'+(o.late?'已超时':fmt(o.time))+'</span></div><div class="order-track"><i data-track="'+o.id+'" style="width:'+Math.max(0,o.time/o.limit*100)+'%"></i></div>';btn.addEventListener('click',()=>selectOrder(o.id));list.appendChild(btn)});
 const pool=$('offerList');pool.replaceChildren();offers.forEach(o=>{const button=document.createElement('button');button.className='offer-card';button.disabled=externalPaused||orders.length>=settings.capacity||(parcel&&(!parcelBatchOpen||returningWarehouse||dist(player,warehouse)>56));button.setAttribute('aria-label','接单'+o.id+'，'+o.restaurant+'送往'+o.home);button.innerHTML='<span class="offer-route"><b>'+o.restaurant+'</b><small>送至 '+o.home+' · '+Math.ceil(o.limit)+'秒</small></span><span class="offer-price">¥'+o.reward+'<em>接单</em></span>';button.addEventListener('click',()=>acceptOffer(o.id));pool.appendChild(button)});
 $('orderCount').textContent=orders.length+' / '+settings.capacity+' 单';$('cargoCount').textContent=orders.filter(o=>o.status==='delivery').length+(ride?' 位乘客':' 件在车');
}
function nearbyOrders(){if(returningWarehouse&&dist(player,warehouse)<=56)return[{id:-1,status:'warehouse'}];return orders.filter(o=>dist(player,targetOf(o))<=56)}
function actualShiftWage(){return settings.kind==='rideshare'?Math.min(delivered*settings.pay,earnedFare):earnedFare}
function displayedIncome(){
 if(settings.payTerms)return dispatchWage(settings.payTerms,delivered,earnedFare).total;
 if(settings.actualIncome)return Math.max(0,Math.round(actualShiftWage()*100)/100)
 if(settings.fixedShiftBase!=null)return settings.fixedShiftBase+Math.round(settings.fixedShiftBase*settings.shiftBonusRate*Math.min(1,delivered/settings.target));
 return money;
}
function updateHud(){
 const ride=settings.kind==='rideshare',parcel=settings.kind==='parcel',cargo=orders.filter(o=>o.status==='delivery'),terrain=terrainAt(player.x,player.y);
 $('timeValue').textContent=fmt(remaining);$('timeStat').classList.toggle('urgent',remaining<30);$('moneyValue').textContent=moneyText(displayedIncome());$('deliveredValue').textContent=delivered;$('comboValue').textContent=ride?Math.round(orders[0]?.quality??100):combo;$('speedValue').textContent=Math.round(player.speed*.18);
 $('driveState').textContent=terrain.kind==='park'?'草地减速':terrain.kind==='parkPath'?'园路减速':player.braking?'刹车减速':fastMode||keys.has('Shift')?'持续加速':'巡航模式';
 $('cargoCount').textContent=cargo.length+(ride?' 位乘客':' 件在车');$('loadInfo').textContent='手上 '+orders.length+' / '+settings.capacity+' 单 · '+(ride?'车上 '+cargo.length+' 人':'装载 '+cargo.length+' 件');$('orderCount').textContent=orders.length+' / '+settings.capacity+' 单';$('goalCount').textContent=Math.min(settings.target,delivered)+' / '+settings.target;[...$('goalTrack').children].forEach((el,i)=>el.classList.toggle('done',i<delivered));
 orders.forEach(o=>{const label=document.querySelector('[data-time="'+o.id+'"]'),bar=document.querySelector('[data-track="'+o.id+'"]');if(label){label.textContent=o.late?(ride?'超时 · 满意度 '+Math.round(o.quality)+'%':'已超时'):fmt(o.time);label.classList.toggle('late',o.time<15)}if(bar)bar.style.width=clamp(o.time/o.limit*100,0,100)+'%'});
 const s=tripPlan[0];$('missionHint').innerHTML=s?'<strong>'+(s.returning?'回仓':s.drops.length?ride?'下客':'送货':ride?'接客':parcel?'装货':'取餐')+'</strong> · '+s.point.name+'<span>'+(s.returning?'实际驾驶回仓库':manualId!==null?'手动优先':'第 1 / '+tripPlan.length+' 站')+' · 路线 '+Math.round(routeDist/10)*10+' m</span>':'等待接单<span>开启自动接单，或手动选择订单</span>';
 const near=nearbyOrders();$('actionPrompt').hidden=mode!=='playing'||externalPaused||!near.length;
 if(near.length){const pickups=near.filter(o=>o.status==='pickup').length,drops=near.filter(o=>o.status==='delivery').length;$('actionPrompt').querySelector('span').textContent=player.speed>42?'先刹停，再取送':returningWarehouse?'已回仓 · 接下一批':ride?pickups?'停稳接客上车':'停稳下客完成本单':(pickups?(parcel?'装 ':'取 ')+pickups+' 件':'')+(pickups&&drops?' · ':'')+(drops?'交付 '+drops+' 件':'');$('actionPrompt').style.background=player.speed>42?'#d8e2e6':'#ffcc47'}
 $('footerStatus').textContent=externalPaused||mode==='paused'?'已暂停':mode==='start'?'准备出发':mode==='end'?'本班挑战结束':returningWarehouse?'本批已送完 · 返回仓库':cargo.length?(ride?'乘客满意度 ':'货品质量 ')+Math.round(Math.min(...cargo.map(o=>o.quality)))+'%':autoAccept?'自动接单 '+autoLimit+' 单':'手动接单';syncDispatch();
}

function toast(message,color='#ffcc47'){$('toast').textContent=message;$('toast').style.color=color;$('toast').classList.add('show');toastTime=3}
function tone(f,d=.1,v=.06,type='sine',delay=0,music=false){if(!sound||!audio||audioSettings.muted||audioSettings.paused||(music&&!audioSettings.musicEnabled))return;v*=music?audioSettings.musicVolume:audioSettings.sfxVolume;if(v<=0)return;try{const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.value=f;gain.gain.setValueAtTime(v,audio.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+delay+d);osc.connect(gain);gain.connect(audio.destination);osc.start(audio.currentTime+delay);osc.stop(audio.currentTime+delay+d)}catch(e){}}
function initAudio(){if(!sound||audioSettings.muted||audioSettings.paused)return;try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{})}catch(e){}}
function melody(){const notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23,261.63,329.63,392,523.25,440,392,329.63,293.66];tone(notes[musicStep%16],.18,.015,'triangle',0,true);if(musicStep%4===0)tone(musicStep%8===0?130.81:146.83,.25,.023,'sine',0,true);musicStep++}
function successSound(){[523,659,784,1046].forEach((f,i)=>tone(f,.15,.06,'triangle',i*.08))}

function releaseJoystick(){joystick={active:false,id:null,x:0,y:0};$('joystick').classList.remove('active');$('joystickKnob').style.transform='translate(-50%,-50%)'}
function releasePointer(){pointer.active=false;pointer.id=null;releaseJoystick();touchKeys.clear();document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'))}
function newPlayer(){return{x:420,y:540,speed:0,vx:0,vy:0,angle:0,invuln:0,braking:false,collisionLatch:false}}
function reset(){
 remaining=settings.limit;money=0;earnedFare=0;trafficFine=0;endingReason='';progressClock=0;gameplayState=settings.seed;autoClock=0;planClock=0;delivered=0;combo=0;maxCombo=0;expired=0;crashes=0;accepted=0;maxCargo=0;orderSerial=101;nextLabel=1;fastMode=false;routeClock=0;hudClock=0;musicClock=0;offerClock=0;worldTime=0;toastTime=0;shake=0;returningWarehouse=false;parcelBatchOpen=true;player=newPlayer();
 // Stable traffic reset is independent from rendering and the mission random stream.
 const carRandom=seeded(settings.seed^87216);for(const car of cars){for(let attempt=0;attempt<40;attempt++){car.pos=carRandom()*car.road.length;placeCar(car);if(dist(player,car)>220)break}}
 camera={x:player.x,y:player.y};particles=[];floating=[];keys.clear();releasePointer();$('toast').classList.remove('show');$('actionPrompt').hidden=true;updateFastButton();setupOrders();updateHud();
}
function start(){if(!initialized||externalPaused||mode!=='start')return;mode='playing';if(fillAutoOrders()){updatePlan();renderCards()}previous=performance.now();hideOverlays();initAudio();canvas.focus({preventScroll:true});toast(settings.kind==='parcel'?'仓库装好本批，再按路线逐件送达':settings.kind==='rideshare'?'每次1位乘客 · 实际停靠上下车':'按规划自由驾驶 · 停稳后取送');updateHud();reportProgress()}
function hideOverlays(){['startOverlay','pauseOverlay','resultOverlay'].forEach(id=>$(id).hidden=true)}
function pause(help=false){if(mode==='end')return;if(mode==='start'){if(pauseWithParent&&!help){reportProgress();post('pause-request');return}hideOverlays();$('pauseOverlay').hidden=false;$('pauseTitle').textContent='出发前，熟悉一下路线。';$('resumeBtn').textContent='开始本班';return}if(mode==='playing'){mode='paused';keys.clear();releasePointer();$('actionPrompt').hidden=true;hideOverlays();$('pauseOverlay').hidden=false;$('pauseTitle').textContent=help?'驾驶与派单手册':'歇一会儿，再出发。';$('resumeBtn').textContent='继续本班';updateHud();reportProgress();if(pauseWithParent&&!help)post('pause-request');else $('resumeBtn').focus({preventScroll:true})}}
function resume(){if(externalPaused)return;if(mode==='start'){start();return}if(mode==='paused'){mode='playing';if(fillAutoOrders()){updatePlan();renderCards()}previous=performance.now();hideOverlays();canvas.focus({preventScroll:true});updateHud();reportProgress()}}
function end(reason='本班时间已到'){if(mode==='end')return;endingReason=reason;mode='end';keys.clear();releasePointer();$('actionPrompt').hidden=true;hideOverlays();$('resultOverlay').hidden=false;const ratio=Math.min(1,delivered/settings.target),rank=ratio>=1?'S':ratio>=.75?'A':ratio>=.4?'B':'C';$('resultBadge').textContent=rank;$('resultTitle').textContent=settings.title+' · 本班完成';$('resultMoney').textContent='¥'+moneyText(displayedIncome());$('resultMoneyLabel').textContent=settings.actualIncome?'本班工资':settings.fixedShiftBase!=null?'预计工资':'累计报酬';$('resultDelivered').textContent=delivered+' 单';$('resultCombo').textContent=maxCombo+' 连单';const pay=settings.payTerms?dispatchWage(settings.payTerms,delivered,earnedFare):null,gross=pay?pay.total:actualShiftWage(),netAfterFine=Math.max(0,Math.round((gross-trafficFine)*100)/100);const actualSummary=(pay?'底薪 ¥'+moneyText(pay.base)+' + 订单提成 ¥'+moneyText(pay.commission)+' = ':'')+'本班工资 ¥'+moneyText(gross)+' · 交通罚款 ¥'+moneyText(trafficFine)+' 已即时扣除 · 工资扣罚后 ¥'+moneyText(netAfterFine);$('resultComment').textContent='已完成 '+delivered+' 单 · '+(settings.actualIncome?actualSummary:settings.fixedShiftBase!=null?'预计班次工资 ¥'+moneyText(displayedIncome())+'（基础 ¥'+moneyText(settings.fixedShiftBase)+' + 达标奖金）':'挑战预计报酬 ¥'+moneyText(earnedFare))+' · 超时 '+expired+' 单 · 碰撞 '+crashes+' 次。'+(settings.payTerms?'以上按本班底薪与订单提成结算；正式岗位工资按原周期发放。':settings.actualIncome?(settings.kind==='rideshare'?'车费按10小时班次结算。':'配送工资按8小时兼职班次结算。'):'正式工资以班次结算为准。');successSound();updateHud();reportProgress();reportFinish(true,reason)}
function emit(x,y,color,n=12){for(let i=0;i<n;i++){const angle=visualRandom()*Math.PI*2,speed=25+visualRandom()*95;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.6+visualRandom()*.5,max:1,color,size:2+visualRandom()*4})}}
function interact(){
 if(externalPaused||mode!=='playing'||remaining<=0)return;const near=nearbyOrders();if(!near.length){toast('先实际开到当前取送点附近');return}if(player.speed>42){toast('先松手或刹车停稳，再取送');return}
 if(returningWarehouse){returningWarehouse=false;parcelBatchOpen=true;replenishOffers();fillAutoOrders();updatePlan();renderCards();updateHud();toast('已回仓 · 装载下一批包裹');reportProgress();return}
 let pickups=0,drops=0,totalFen=0;for(const o of near){
  if(o.status==='pickup'){o.status='delivery';pickups++;emit(player.x,player.y,o.color,8)}
  else if(o.status==='delivery'){combo++;maxCombo=Math.max(maxCombo,combo);const tip=settings.kind==='rideshare'||settings.payTerms?0:Math.max(0,Math.ceil(o.time/o.limit*3)),bonus=settings.kind==='rideshare'||settings.payTerms?0:Math.min(3,(combo-1)*.5),paid=payout((o.reward+tip+bonus)*o.quality/100);earnedFare=Math.round((earnedFare+paid)*100)/100;money=Math.max(0,Math.round((earnedFare-trafficFine)*100)/100);totalFen+=Math.round(paid*100);delivered++;drops++;o.status='done';emit(player.x,player.y,o.color,18)}
 }
 if(settings.kind==='parcel'&&pickups)parcelBatchOpen=false;
 if(near.some(o=>o.id===manualId))manualId=null;orders=orders.filter(o=>o.status!=='done');maxCargo=Math.max(maxCargo,orders.filter(o=>o.status==='delivery').length);
 if(settings.kind==='parcel'&&!orders.length){returningWarehouse=true;parcelBatchOpen=false;offers=[]}
 if(drops){toast((settings.kind==='rideshare'?'已下客，完成 ':'已交付 ')+drops+' 单 · 预计 +¥'+moneyText(totalFen/100),'#60debb');floating.push({x:player.x,y:player.y-20,text:'+¥'+moneyText(totalFen/100),life:1.8,color:'#60debb'});successSound()}
 else toast(settings.kind==='rideshare'?'乘客已上车，请平稳送到目的地':'已装车 '+pickups+' 件，请按路线送达');
 fillAutoOrders();updatePlan();renderCards();updateHud();reportProgress();if(drops)reportFinish(false,'');
}

function impact(kind,hitSpeed){
 if(externalPaused||mode!=='playing'||player.invuln>0||hitSpeed<28)return;player.invuln=1.5;crashes++;combo=0;shake=5;const ride=settings.kind==='rideshare',fine=ride?0:3;
 trafficFine+=fine;money=Math.max(0,Math.round((earnedFare-trafficFine)*100)/100);const damage=Math.round(15+clamp(hitSpeed/310,0,1)*20),cargo=ride?orders:orders.filter(o=>o.status==='delivery');cargo.forEach(o=>o.quality=Math.max(0,o.quality-damage));emit(player.x,player.y,'#ff927b',14);tone(110,.17,.1,'sawtooth');const message=(kind==='building'?'撞到楼房':'碰到汽车')+(ride?' · 满意度 -'+damage+'%':' · 罚款 ¥'+fine+(cargo.length?' · 货品质量 -'+damage+'%':''));toast(message,'#ff927b');renderCards();updateHud();reportProgress();post('incident',{incident:{kind:'collision',fine,message}});
}
function view(){const zoom=width<580?.72:.86;return{zoom,ox:width/2-camera.x*zoom,oy:height/2-camera.y*zoom}}
function pointerWorld(){const rect=canvas.getBoundingClientRect(),v=view();return{x:((pointer.x-rect.left)*width/rect.width-v.ox)/v.zoom,y:((pointer.y-rect.top)*height/rect.height-v.oy)/v.zoom}}
function updateDriving(dt){const held=k=>keys.has(k)||touchKeys.has(k);let ix=(held('ArrowRight')||held('d')?1:0)-(held('ArrowLeft')||held('a')?1:0),iy=(held('ArrowDown')||held('s')?1:0)-(held('ArrowUp')||held('w')?1:0),moving=!!(ix||iy),throttle=1;
 if(joystick.active&&!moving){ix=joystick.x;iy=joystick.y;const amount=Math.hypot(ix,iy);moving=amount>.12;throttle=clamp((amount-.12)/.88,0,1)}
 else if(pointer.active&&!moving){const p=pointerWorld(),length=dist(p,player);ix=p.x-player.x;iy=p.y-player.y;moving=length>28;throttle=clamp((length-28)/120,.2,1)}
 const brake=held(' ')||held('Brake'),fast=held('Shift')||fastMode,terrain=terrainAt(player.x,player.y),terrainLimit=(settings.kind==='rideshare'?340:settings.kind==='parcel'?270:310)*terrain.factor;let targetSpeed=moving&&!brake?(fast?(settings.kind==='rideshare'?340:settings.kind==='parcel'?270:310):(settings.kind==='parcel'?165:185))*throttle:0;
 if(moving){const desired=Math.atan2(iy,ix),difference=Math.atan2(Math.sin(desired-player.angle),Math.cos(desired-player.angle)),yaw=4.4/(1+(player.speed/185)**2);player.angle+=clamp(difference,-yaw*dt,yaw*dt);if(!fast&&Math.abs(difference)>.8)targetSpeed=Math.min(targetSpeed,95)}
 targetSpeed=Math.min(targetSpeed,terrainLimit);if(terrain.kind==='park')targetSpeed=Math.min(targetSpeed,108);if(terrain.kind==='parkPath')targetSpeed=Math.min(targetSpeed,140);if(terrain.kind==='yard')targetSpeed=Math.min(targetSpeed,85);player.braking=targetSpeed<player.speed-5;const acceleration=targetSpeed>player.speed?(fast&&player.speed>175?66:125):brake?235:195;player.speed+=clamp(targetSpeed-player.speed,-acceleration*dt,acceleration*dt);player.vx=Math.cos(player.angle)*player.speed;player.vy=Math.sin(player.angle)*player.speed;
 const old={x:player.x,y:player.y},nx=player.x+player.vx*dt,ny=player.y+player.vy*dt;if(collideAt(nx,ny)){const hitSpeed=player.speed;if(!player.collisionLatch)impact('building',hitSpeed);player.collisionLatch=true;player.speed=Math.min(player.speed*.08,8);player.vx=0;player.vy=0}else{player.x=nx;player.y=ny;if(dist(old,player)>.03)player.collisionLatch=false}
}
function update(dt){if(!initialized||externalPaused||mode!=='playing')return;remaining=Math.max(0,remaining-dt);worldTime+=dt;musicClock+=dt;if(musicClock>.25){musicClock-=.25;melody()}player.invuln=Math.max(0,player.invuln-dt);shake=Math.max(0,shake-dt*12);updateDriving(dt);
 for(const car of cars){car.pos+=car.speed*car.dir*dt;if(car.pos>car.road.length){car.pos=car.road.length;car.dir=-1}else if(car.pos<0){car.pos=0;car.dir=1}placeCar(car);const dx=player.x-car.x,dy=player.y-car.y,cos=Math.cos(car.angle),sin=Math.sin(car.angle),long=dx*cos+dy*sin,wide=-dx*sin+dy*cos;if(Math.abs(long)<35&&Math.abs(wide)<25&&player.invuln===0){impact('car',Math.max(player.speed,car.speed));player.speed*=.12;player.vx=Math.cos(player.angle)*player.speed;player.vy=Math.sin(player.angle)*player.speed}}
 let changed=false;for(const o of orders){const before=o.time;o.time-=dt;if(o.time<=0&&!o.late){o.late=true;expired++;combo=0;changed=true;if(settings.kind==='food'){o.status='expired';toast('#'+o.id+' 超时，订单已取消','#ff927b')}else toast('#'+o.id+' 超时 · '+(settings.kind==='rideshare'?'满意度随等待时间下降':'请继续完成包裹交付'),'#ff927b')}if(o.time<0&&settings.kind==='rideshare')o.quality=Math.max(0,o.quality-(Math.max(0,-o.time)-Math.max(0,-before))*.8)}if(changed){orders=orders.filter(o=>o.status!=='expired');fillAutoOrders();updatePlan();renderCards();reportProgress()}
 autoClock+=dt;if(autoClock>.75){autoClock=0;if(fillAutoOrders()){updatePlan();renderCards()}}planClock+=dt;if(planClock>4&&dist(player,lastPlanOrigin)>180){updatePlan()}
 offerClock+=dt;if(offerClock>18){offerClock=0;if(offers.length){offers.shift();replenishOffers();renderCards()}}
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.98;p.vy*=.98}particles=particles.filter(p=>p.life>0);for(const f of floating){f.y-=23*dt;f.life-=dt}floating=floating.filter(p=>p.life>0);routeClock+=dt;if(routeClock>.65){routeClock=0;updateRoute()}hudClock+=dt;if(hudClock>.12){hudClock=0;updateHud()}if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('show')}
 const zoom=view().zoom,vw=width/zoom,vh=height/zoom,cx=clamp(player.x,vw/2,WORLD-vw/2),cy=clamp(player.y,vh/2,WORLD-vh/2);camera.x+=(cx-camera.x)*(1-Math.exp(-dt*5));camera.y+=(cy-camera.y)*(1-Math.exp(-dt*5));progressClock+=dt;if(progressClock>=.5){progressClock=0;reportProgress()}if(remaining<=0)end();}
function drawCar(car){ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle);rr(ctx,-21,-8,50,26,7,'#16283150');rr(ctx,-22,-17,13,6,2,'#22333c');rr(ctx,9,-17,13,6,2,'#22333c');rr(ctx,-22,11,13,6,2,'#22333c');rr(ctx,9,11,13,6,2,'#22333c');rr(ctx,-27,-14,54,28,6,car.color);rr(ctx,-9,-11,27,22,4,'#526f7d');rr(ctx,-5,-10,16,20,3,car.color);line(ctx,13,-8,17,-8,'#c2e1df',2);line(ctx,13,8,17,8,'#c2e1df',2);ctx.fillStyle='#fff2b5';ctx.fillRect(23,-10,3,5);ctx.fillRect(23,5,3,5);ctx.fillStyle='#db615d';ctx.fillRect(-27,-10,3,4);ctx.fillRect(-27,6,3,4);ctx.restore()}
function drawPlayer(){
 if(settings.kind==='food'){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);if(player.invuln>0&&Math.floor(worldTime*12)%2===0)ctx.globalAlpha=.45;ctx.fillStyle='#152f3560';ctx.beginPath();ctx.ellipse(4,6,29,14,0,0,Math.PI*2);ctx.fill();rr(ctx,-26,-7,13,14,3,'#192a34');rr(ctx,19,-6,13,12,3,'#192a34');rr(ctx,-14,-8,35,16,5,'#e6ad32');rr(ctx,8,-8,15,16,4,'#ffce45');rr(ctx,-25,-13,23,26,4,'#bb892a','#172936');rr(ctx,-23,-12,21,21,3,'#ffce45');rr(ctx,-19,-8,12,12,2,'#fbe894');ctx.strokeStyle='#735d31';ctx.lineWidth=2;ctx.strokeRect(-16,-5,6,6);line(ctx,20,-13,20,13,'#182933',4);line(ctx,14,-9,19,-12,'#e9b573',4);line(ctx,14,9,19,12,'#e9b573',4);rr(ctx,-2,-10,17,20,7,'#f5bd37');ctx.fillStyle='#172933';ctx.beginPath();ctx.arc(8,0,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffdb64';ctx.beginPath();ctx.arc(9,-1,8,0,Math.PI*2);ctx.fill();line(ctx,13,-5,15,3,'#608798',4);ctx.fillStyle='#fffbd6';ctx.fillRect(27,-4,3,8);ctx.restore();return}
 if(settings.kind==='rideshare'){drawCar({...player,color:settings.sceneKey==='job_taxi'?'#ffcc47':'#719bb5'});ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);rr(ctx,-4,-6,16,12,3,settings.sceneKey==='job_taxi'?'#fff5b3':'#a5dacf','#17303d');ctx.fillStyle='#17303d';ctx.font='bold 6px Segoe UI';ctx.textAlign='center';ctx.fillText(settings.sceneKey==='job_taxi'?'TAXI':'RIDE',4,2);ctx.restore();return}
 ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle='#152f3560';ctx.beginPath();ctx.ellipse(0,6,35,20,0,0,Math.PI*2);ctx.fill();rr(ctx,-31,-23,17,7,2,'#172934');rr(ctx,-31,16,17,7,2,'#172934');rr(ctx,20,-5,15,10,3,'#172934');rr(ctx,-32,-19,42,38,5,'#638d94','#22343e');rr(ctx,-28,-15,34,30,3,'#a9c4bb');line(ctx,-11,-15,-11,15,'#587985',2);rr(ctx,-20,-9,16,18,3,'#d6b27a','#6c674f');rr(ctx,7,-8,19,16,5,'#638d94');line(ctx,24,-12,24,12,'#1a2a35',4);ctx.fillStyle='#fff0af';ctx.fillRect(32,-3,3,6);ctx.fillStyle='#1b303d';ctx.beginPath();ctx.arc(15,0,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dcebe2';ctx.beginPath();ctx.arc(16,-1,7,0,Math.PI*2);ctx.fill();ctx.restore();
}

function drawPins(){const groups=new Map();for(const o of orders){const p=targetOf(o),key=p.x+','+p.y;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o)}if(settings.kind==='parcel'&&(returningWarehouse||!groups.has(placeKey(warehouse))))groups.set(placeKey(warehouse),[{id:-1,label:'仓',status:'warehouse',pickup:warehouse,dropoff:warehouse,color:'#60debb'}]);for(const group of groups.values()){const o=group.find(o=>o.id===selectedId)||group[0],isSelected=group.some(o=>o.id===selectedId),p=targetOf(o),color=o.color;ctx.save();ctx.translate(p.x,p.y);const pulse=1+Math.sin(worldTime*4)*.05;ctx.fillStyle=color+'25';ctx.beginPath();ctx.arc(0,0,34*pulse,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color+'9c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,30*pulse,0,Math.PI*2);ctx.stroke();ctx.translate(0,-35+(isSelected?Math.sin(worldTime*3)*2:0));ctx.beginPath();ctx.moveTo(-8,18);ctx.lineTo(0,27);ctx.lineTo(8,18);ctx.closePath();ctx.fillStyle=color;ctx.fill();rr(ctx,-21,-19,42,40,11,color,'#183039');ctx.fillStyle='#182b35';ctx.font='bold 15px "Segoe UI"';ctx.textAlign='center';ctx.fillText(o.label,0,6);if(group.length>1){rr(ctx,12,-28,30,18,6,'#152c36');ctx.fillStyle='white';ctx.font='bold 10px "Segoe UI"';ctx.fillText('×'+group.length,27,-15)}if(isSelected){rr(ctx,-27,-43,54,20,5,'#112534ed');ctx.font='bold 11px "Microsoft YaHei"';ctx.fillStyle=color;ctx.fillText(o.status==='pickup'?settings.kind==='rideshare'?'接客':settings.kind==='parcel'?'装货':'取餐':settings.kind==='rideshare'?'下客':'送达',0,-29)}ctx.restore()}}
function drawMinimap(){
 const size=Math.min(height<310?94:width<580?108:132,Math.max(64,width*.25),Math.max(64,height*.36)),xx=width-size-8,yy=8,pad=7,scale=(size-pad*2)/WORLD;
 ctx.save();rr(ctx,xx,yy,size,size+23,11,'#142333f2','#92aaab88');ctx.beginPath();ctx.roundRect(xx+pad,yy+pad,size-pad*2,size-pad*2,4);ctx.clip();ctx.translate(xx+pad,yy+pad);ctx.scale(scale,scale);
 ctx.fillStyle='#708878';ctx.fillRect(0,0,WORLD,WORLD);for(const park of parks){polygonPath(ctx,park.points);ctx.fillStyle='#3b805d';ctx.fill()}
 ctx.lineCap='round';ctx.lineJoin='round';for(const road of roads){roadPath(ctx,road);ctx.strokeStyle=road.kind==='alley'?'#bec59f':'#a8b7ad';ctx.lineWidth=road.width;ctx.stroke()}
 // Building silhouettes make the narrow alleys and blocked parcels legible.
 for(const b of buildings){ctx.fillStyle='#355361';ctx.fillRect(b.x,b.y,b.w,b.h)}
 tripLegs.forEach((leg,i)=>{if(!leg.points.length)return;ctx.beginPath();leg.points.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=i===0?'#ffda59':'#f2edbf90';ctx.lineWidth=i===0?30:20;ctx.stroke()});
 for(const marker of minimapModel()){
  const p=marker.point,r=marker.kind==='pickup'?40:34;ctx.fillStyle=marker.kind==='pickup'?'#ffcc47':'#60debb';ctx.strokeStyle='#17313d';ctx.lineWidth=16;
  if(marker.kind==='pickup'){ctx.beginPath();ctx.rect(p.x-r,p.y-r,r*2,r*2);ctx.fill();ctx.stroke()}else{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke()}
 }
 tripPlan.forEach((s,i)=>{const p=s.point;ctx.beginPath();if(s.picks.length)ctx.rect(p.x-77,p.y-77,154,154);else ctx.arc(p.x,p.y,82,0,Math.PI*2);ctx.fillStyle=i===0?'#fff0a2':s.picks.length?'#ffcc47':'#60debb';ctx.fill();ctx.strokeStyle='#17313d';ctx.lineWidth=18;ctx.stroke();ctx.font='bold 140px "Segoe UI"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#17313d';ctx.fillText(i+1,p.x,p.y)});
 ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.beginPath();ctx.moveTo(84,0);ctx.lineTo(-58,-48);ctx.lineTo(-35,0);ctx.lineTo(-58,48);ctx.closePath();ctx.fillStyle='#ffffff';ctx.strokeStyle='#17313d';ctx.lineWidth=14;ctx.fill();ctx.stroke();ctx.restore();ctx.restore();
 ctx.save();ctx.font='10px "Microsoft YaHei"';ctx.textAlign='left';ctx.fillStyle='#ffcc47';ctx.fillRect(xx+11,yy+size+7,6,6);ctx.fillText(settings.kind==='rideshare'?'接客':settings.kind==='parcel'?'装货':'取餐',xx+21,yy+size+13);ctx.fillStyle='#60debb';ctx.beginPath();ctx.arc(xx+59,yy+size+10,3.5,0,Math.PI*2);ctx.fill();ctx.fillText(settings.kind==='rideshare'?'下客':'送货',xx+67,yy+size+13);ctx.fillStyle='#e3e9d8';ctx.fillText('路线',xx+size-30,yy+size+13);ctx.restore();
}

function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#a8b5a0';ctx.fillRect(0,0,width,height);const v=view(),vw=width/v.zoom,vh=height/v.zoom;camera.x=clamp(camera.x,Math.min(WORLD/2,vw/2),Math.max(WORLD/2,WORLD-vw/2));camera.y=clamp(camera.y,Math.min(WORLD/2,vh/2),Math.max(WORLD/2,WORLD-vh/2));ctx.save();ctx.translate(width/2+(shake?(visualRandom()-.5)*shake:0),height/2+(shake?(visualRandom()-.5)*shake:0));ctx.scale(v.zoom,v.zoom);ctx.translate(-camera.x,-camera.y);ctx.drawImage(mapCanvas,0,0);
 const o=currentOrder();if(route.length&&mode!=='end'){ctx.save();ctx.beginPath();route.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#152d3840';ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.setLineDash([12,13]);ctx.lineDashOffset=-worldTime*27;ctx.strokeStyle=o?.color||COLORS[0];ctx.lineWidth=4;ctx.stroke();ctx.restore()}cars.forEach(drawCar);drawPins();for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);rr(ctx,p.x-p.size/2,p.y-p.size/2,p.size,p.size,1,p.color)}ctx.globalAlpha=1;drawPlayer();for(const f of floating){ctx.globalAlpha=Math.min(1,f.life);ctx.font='bold 24px "Segoe UI"';ctx.textAlign='center';ctx.strokeStyle='#17313b';ctx.lineWidth=4;ctx.strokeText(f.text,f.x,f.y);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y)}ctx.globalAlpha=1;
 if(pointer.active){const p=pointerWorld();ctx.setLineDash([5,6]);line(ctx,player.x,player.y,p.x,p.y,'#fff4be70',2);ctx.setLineDash([]);ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.strokeStyle='#fff3be';ctx.lineWidth=2;ctx.stroke()}ctx.restore();drawMinimap();if(mode==='playing'&&o){const p=targetOf(o),sx=(p.x-camera.x)*v.zoom+width/2,sy=(p.y-camera.y)*v.zoom+height/2;if(sx<22||sx>width-22||sy<22||sy>height-25){const dx=sx-width/2,dy=sy-height/2,ratio=Math.min((width/2-28)/Math.abs(dx),(height/2-38)/Math.abs(dy));ctx.save();ctx.translate(width/2+dx*ratio,height/2+dy*ratio);ctx.rotate(Math.atan2(dy,dx));ctx.fillStyle=o.color;ctx.strokeStyle='#152b36';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-7,-10);ctx.lineTo(-4,0);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}}}
function resize(){width=stage.clientWidth;height=stage.clientHeight;dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(player)draw()}
if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(stage);
else{window.addEventListener('resize',resize);resize()}
function frame(now){let elapsed=previous?Math.min(.1,Math.max(0,(now-previous)/1000)):0;previous=now;while(elapsed>0&&mode==='playing'&&!externalPaused){const dt=Math.min(1/60,elapsed);update(dt);elapsed-=dt}if(player)draw();requestAnimationFrame(frame)}
function updateFastButton(){$('fastBtn').setAttribute('aria-pressed',String(fastMode));$('fastBtn').classList.toggle('enabled',fastMode);$('fastBtn').textContent=fastMode?'加速 开':'加速 关'}
$('autoAcceptBtn').addEventListener('click',()=>{autoAccept=!autoAccept;dispatchChanged();toast(autoAccept?'自动接单开启 · 保持 '+autoLimit+' 单':'自动接单关闭 · 已接订单保留')});
$('autoLimit').addEventListener('change',()=>{autoLimit=Number($('autoLimit').value);dispatchChanged();toast(orders.length>autoLimit?'已接订单保留 · 送完后降至 '+autoLimit+' 单':'自动接单量设为 '+autoLimit+' 单')});
$('routeAutoBtn').addEventListener('click',()=>{manualId=null;updatePlan();renderCards();updateHud();toast('已恢复自动配送顺序');canvas.focus({preventScroll:true})});

const gameKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','Shift',' '];
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;const key=e.key.length===1?e.key.toLowerCase():e.key;if(gameKeys.includes(key)&&mode==='playing'){e.preventDefault();keys.add(key)}if(e.repeat)return;if(key==='e'&&mode==='playing'){e.preventDefault();interact()}if((key==='p'||key==='Escape')&&mode!=='end'){e.preventDefault();if(mode==='playing')pause();else if(mode==='paused')resume();else if(!$('pauseOverlay').hidden){hideOverlays();$('startOverlay').hidden=false}}if(/^[1-9]$/.test(key)&&mode==='playing'){const o=orders[Number(key)-1];if(o)selectOrder(o.id)}});
document.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
// Chromium can misplace its compatibility click in a CSS-zoomed iframe even
// when the touch pointer events hit the correct button. Activate that button
// from the completed touch, then discard only the resulting compatibility click.
let buttonTouch=null,suppressTouchClickUntil=0;
document.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='touch')return;
 const button=e.target.closest?.('button');
 buttonTouch=button&&!button.disabled&&!button.matches('#joystickKnob,[data-key]')?{button,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}:null;
},true);
document.addEventListener('pointermove',e=>{if(buttonTouch?.id===e.pointerId&&Math.hypot(e.clientX-buttonTouch.x,e.clientY-buttonTouch.y)>10)buttonTouch.moved=true},true);
document.addEventListener('pointercancel',()=>{buttonTouch=null},true);
document.addEventListener('pointerup',e=>{
 const touch=buttonTouch;if(!touch||touch.id!==e.pointerId)return;buttonTouch=null;
 const button=touch.button,rect=button.getBoundingClientRect();
 if(touch.moved||button.disabled||!button.isConnected||e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
 suppressTouchClickUntil=performance.now()+750;e.preventDefault();button.click();
},true);
document.addEventListener('click',e=>{
 if(e.detail>0&&e.pointerType!=='mouse'&&performance.now()<suppressTouchClickUntil){e.preventDefault();e.stopImmediatePropagation()}
},true);
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing'||e.button!==0)return;e.preventDefault();pointer={active:true,id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true})});canvas.addEventListener('pointermove',e=>{if(pointer.active&&pointer.id===e.pointerId){pointer.x=e.clientX;pointer.y=e.clientY;e.preventDefault()}});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(pointer.id===e.pointerId){pointer.active=false;pointer.id=null}});canvas.addEventListener('contextmenu',e=>e.preventDefault());
function moveJoystick(e){const rect=$('joystick').getBoundingClientRect(),radius=rect.width*.32;if(radius<=0)return;let x=(e.clientX-rect.left-rect.width/2)/radius,y=(e.clientY-rect.top-rect.height/2)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length}joystick.x=x;joystick.y=y;const visualRadius=$('joystick').clientWidth*.32;$('joystickKnob').style.transform='translate(-50%,-50%) translate('+x*visualRadius+'px,'+y*visualRadius+'px)';}
$('joystick').addEventListener('pointerdown',e=>{if(mode!=='playing'||externalPaused||e.button!==0)return;e.preventDefault();joystick.active=true;joystick.id=e.pointerId;$('joystick').classList.add('active');$('joystick').setPointerCapture?.(e.pointerId);moveJoystick(e)});
$('joystick').addEventListener('pointermove',e=>{if(joystick.active&&joystick.id===e.pointerId){e.preventDefault();moveJoystick(e)}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,e=>{if(joystick.id===e.pointerId)releaseJoystick()});
document.querySelectorAll('[data-key]').forEach(btn=>{const key=btn.dataset.key,release=()=>{touchKeys.delete(key);btn.classList.remove('pressed')};btn.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;touchKeys.add(key);btn.classList.add('pressed');btn.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(event=>btn.addEventListener(event,release))});
$('fastBtn').addEventListener('click',()=>{fastMode=!fastMode;updateFastButton();canvas.focus({preventScroll:true})});$('touchDeliver').addEventListener('click',interact);$('actionPrompt').addEventListener('click',interact);$('startBtn').addEventListener('click',start);$('againBtn').addEventListener('click',start);$('restartBtn').addEventListener('click',start);$('resumeBtn').addEventListener('click',resume);$('backBtn').addEventListener('click',()=>{mode='start';reset();hideOverlays();$('startOverlay').hidden=false});$('pauseBtn').addEventListener('click',()=>mode==='paused'?resume():pause());$('helpBtn').addEventListener('click',()=>pause(true));
function updateSound(){$('soundBtn').setAttribute('aria-label',sound?'关闭声音':'开启声音');$('soundBtn').style.color=sound?'#f3f6fa':'#7d8ca0';$('soundBtn').innerHTML=sound?'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4M17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4M17 9l5 6M22 9l-5 6"/></svg>'}
$('soundBtn').addEventListener('click',()=>{sound=!sound;try{localStorage.setItem('street-dispatch-sound',sound?'on':'off')}catch(e){}if(sound)initAudio();updateSound()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause()});window.addEventListener('orientationchange',releasePointer);
window.addEventListener('blur',()=>{keys.clear();releasePointer();if(mode==='playing')pause()});
if(window.__STREET_DISPATCH_TEST__)window.__streetDispatchTest={configure,snapshot,restore,start,pause,resume,interact,impact,step:update,route:()=>route.map(p=>({...p})),plan:()=>tripPlan.map(s=>({...s})),controls:(values)=>{keys.clear();for(const key of values)keys.add(key)},pointerTo:(point)=>{const v=view(),rect=canvas.getBoundingClientRect();pointer={active:true,id:1,x:rect.left+(point.x*v.zoom+v.ox)*rect.width/width,y:rect.top+(point.y*v.zoom+v.oy)*rect.height/height}},release:()=>{keys.clear();releasePointer()},withoutTraffic:()=>cars.splice(0),canAccept:acceptOffer,displayedIncome};
updateSound();post('ready');requestAnimationFrame(frame);
})();


