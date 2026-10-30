import {displayPixelScale} from './renderResolution';
import {createSceneTapGuard} from './sceneTapGuard';
import {compositeStillDepth,type DepthPart} from './stillDepth';
import {photographContactShadows,type StillContactShadows} from './stillContactShadows';
/** Canvas2D scene: photographed geometry, with a movable viewport and no model dependency. */
export interface StillFrame { src:string; width:number; height:number; foreground?:string; background?:string;photographBackground?:readonly[number,number,number];depthSrc?:string;hitSrc?:string;hitIds?:string[];contactShadows?:StillContactShadows;fit?:'cover'|'contain';camera?:{key:string;center:[number,number];viewHeight:number} }
export interface StillLayer {
  src:string; x:number; y:number; width:number; height:number;
  depth?:number; flipX?:boolean; opacity?:number;
  sourceRect?:{x:number;y:number;width:number;height:number};
  depthSrc?:string;depthShift?:number;depthScale?:number;hitId?:string;
}
export interface StillPoint { x:number; y:number; visible:boolean; depth?:number }
export interface StillSceneOptions { onLayout?:()=>void; onClick?:(x:number,y:number)=>void;onRotate?:(direction:-1|1)=>void; onError?:(error:unknown)=>void }

/** Column-major projection-view matrix, shared with offline camera metadata. Coordinates are image pixels. */
export function projectStillWorld(point:readonly number[],matrix:readonly number[],width:number,height:number):StillPoint {
  const[x,y,z]=point, w=matrix[3]!*x!+matrix[7]!*y!+matrix[11]!*z!+matrix[15]!;
  if(!Number.isFinite(w)||Math.abs(w)<1e-9)return{x:0,y:0,visible:false,depth:1};
  const px=(matrix[0]!*x!+matrix[4]!*y!+matrix[8]!*z!+matrix[12]!)/w;
  const py=(matrix[1]!*x!+matrix[5]!*y!+matrix[9]!*z!+matrix[13]!)/w;
  const depth=(matrix[2]!*x!+matrix[6]!*y!+matrix[10]!*z!+matrix[14]!)/w;
  return{x:(px+1)*width/2,y:(1-py)*height/2,depth,visible:w>0&&depth>=-1&&depth<=1&&Math.abs(px)<=1&&Math.abs(py)<=1};
}
export const projectWorld=projectStillWorld;

export function containStillFrame(hostWidth:number,hostHeight:number,imageWidth:number,imageHeight:number){
  const scale=Math.min(hostWidth/Math.max(1,imageWidth),hostHeight/Math.max(1,imageHeight));
  return{scale,x:(hostWidth-imageWidth*scale)/2,y:(hostHeight-imageHeight*scale)/2,width:imageWidth*scale,height:imageHeight*scale};
}

const decoded=new Map<string,Promise<HTMLImageElement>>();
const sizes=new Map<string,number>();let pixels=0;
function loadImage(src:string):Promise<HTMLImageElement>{
  const cached=decoded.get(src);if(cached){decoded.delete(src);decoded.set(src,cached);return cached;}
  const task=new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();img.decoding='async';
    img.onload=()=>{if(decoded.get(src)!==task){resolve(img);return;}const size=img.naturalWidth*img.naturalHeight;sizes.set(src,size);pixels+=size;
      while(decoded.size>128||pixels>8_000_000){const oldest=decoded.keys().next().value;if(!oldest||oldest===src)break;decoded.delete(oldest);pixels-=sizes.get(oldest)??0;sizes.delete(oldest);}resolve(img);};
    img.onerror=()=>{if(decoded.get(src)===task){decoded.delete(src);pixels-=sizes.get(src)??0;sizes.delete(src);}reject(new Error('无法载入场景图片'));};img.src=src;
  });decoded.set(src,task);return task;
}

/** Draws only after an image/configuration/viewport change; there is no continuous render loop. */
export function createStillScene(host:HTMLElement,options:StillSceneOptions={}){
  const canvas=document.createElement('canvas');canvas.dataset.stillScene='true';canvas.setAttribute('aria-label','固定视角场景');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',touchAction:'none',cursor:'grab'});host.appendChild(canvas);
  const context=canvas.getContext('2d',{alpha:false});if(!context){canvas.remove();throw new Error('无法准备场景画面');}
  const tapGuard=createSceneTapGuard(canvas);
  let frame:StillFrame|undefined,layers:StillLayer[]=[],images=new Map<string,HTMLImageElement>(),disposed=false,generation=0,signature='',width=0,height=0,pending:Promise<boolean>|undefined;
  let candidate:{frame:StillFrame;layers:StillLayer[];images:Map<string,HTMLImageElement>}|undefined;
  let completePending:((drawn:boolean)=>void)|undefined,failPending:((error:unknown)=>void)|undefined;
  let settled=false,resolveReady!:()=>void,rejectReady!:(error:unknown)=>void;
  const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});void ready.catch(()=>{});
  let zoomLevel=1,panX=0,panY=0,viewKey='',flattened:HTMLCanvasElement|undefined,pickBuffer:Uint8Array|undefined,pickWidth=0,pickHeight=0,pickNames:string[]=[];
  function objectAt(x:number,y:number){if(!frame||!pickBuffer||x<0||y<0||x>=frame.width||y>=frame.height)return;const px=Math.min(pickWidth-1,Math.floor(x/frame.width*pickWidth)),py=Math.min(pickHeight-1,Math.floor(y/frame.height*pickHeight)),direct=pickBuffer[py*pickWidth+px]??0;if(direct)return pickNames[direct-1];
    for(let radius=1;radius<=2;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=px+dx,yy=py+dy;if(xx<0||yy<0||xx>=pickWidth||yy>=pickHeight)continue;const id=pickBuffer[yy*pickWidth+xx];if(id)return pickNames[id-1];}
  }
  function publishPickTargets(){const samples=pickNames.map(id=>({id,seen:0,points:[] as [number,number][]}));if(frame&&pickBuffer)for(let y=0;y<pickHeight;y+=4)for(let x=0;x<pickWidth;x+=4){const code=pickBuffer[y*pickWidth+x]!,sample=samples[code-1];if(!sample)continue;const n=++sample.seen,slot=n<=9?n-1:Math.imul(n,2654435761)>>>0,point:[number,number]=[x/pickWidth*frame.width,y/pickHeight*frame.height];if(n<=9)sample.points.push(point);else if(slot%n<9)sample.points[slot%n]=point;}host.dataset.stillPickTargets=JSON.stringify(samples.filter(s=>s.points.length).map(({id,points})=>({id,points})));}
  const fit=()=>{const fw=frame?.width??1,fh=frame?.height??1,base=frame?.camera?Math.max(height/frame.camera.viewHeight,width/fw,height/fh):frame?.fit==='cover'?Math.max(width/fw,height/fh):Math.min(width/fw,height/fh),scale=base*zoomLevel,center=frame?.camera?.center??[fw/2,fh/2];return{scale,x:width/2-center[0]!*scale+panX,y:height/2-center[1]!*scale+panY,width:fw*scale,height:fh*scale};};
  function clampPan(){if(!frame)return;const rect=fit();if(rect.width>=width)panX+=Math.max(0,width-rect.x-rect.width)-Math.max(0,rect.x);else panX+=width/2-rect.x-rect.width/2;if(rect.height>=height)panY+=Math.max(0,height-rect.y-rect.height)-Math.max(0,rect.y);else panY+=height/2-rect.y-rect.height/2;}
  function preparePhoto(){composePhoto(frame,layers);}
  function composePhoto(sourceFrame:StillFrame|undefined,sourceLayers:StillLayer[]){
    flattened=undefined;pickBuffer=undefined;pickNames=[...sourceFrame?.hitIds??[]];if(!sourceFrame)return;
    const scale=Math.min(1,1280/Math.max(sourceFrame.width,sourceFrame.height));
    pickWidth=Math.max(1,Math.round(sourceFrame.width*scale));pickHeight=Math.max(1,Math.round(sourceFrame.height*scale));
    const sx=pickWidth/sourceFrame.width,sy=pickHeight/sourceFrame.height;
    const frame:StillFrame={...sourceFrame,width:pickWidth,height:pickHeight,contactShadows:sourceFrame.contactShadows?{...sourceFrame.contactShadows,pixelsPerMeter:sourceFrame.contactShadows.pixelsPerMeter*sx}:undefined};
    const layers=sourceLayers.map(l=>({...l,x:l.x*sx,y:l.y*sy,width:l.width*sx,height:l.height*sy}));
    host.dataset.stillComposition=JSON.stringify({width:pickWidth,height:pickHeight,pickBytes:pickWidth*pickHeight,logical:[sourceFrame.width,sourceFrame.height]});
    const hitIndex=(id:string)=>{let index=pickNames.indexOf(id);if(index<0){index=pickNames.length;pickNames.push(id);}return index+1;};
    for(const layer of layers)if(layer.hitId)hitIndex(layer.hitId);
    const picking=!!frame.hitSrc||layers.some(l=>l.hitId);if(picking)pickBuffer=new Uint8Array(frame.width*frame.height);
    if(!frame.depthSrc){if(picking){const tile=document.createElement('canvas');tile.width=frame.width;tile.height=frame.height;const pen=tile.getContext('2d',{willReadFrequently:true})!;if(frame.hitSrc){pen.imageSmoothingEnabled=false;pen.drawImage(images.get(frame.hitSrc)!,0,0,frame.width,frame.height);const mask=pen.getImageData(0,0,frame.width,frame.height).data;for(let i=0;i<pickBuffer!.length;i++)pickBuffer![i]=mask[i*4]!;}for(const layer of layers)if(layer.hitId){pen.clearRect(0,0,frame.width,frame.height);pen.drawImage(images.get(layer.src)!,layer.x,layer.y,layer.width,layer.height);const alpha=pen.getImageData(0,0,frame.width,frame.height).data,id=hitIndex(layer.hitId);for(let i=0;i<pickBuffer!.length;i++)if(alpha[i*4+3]!>64)pickBuffer![i]=id;}}publishPickTargets();return;}
    if(!layers.length&&!frame.contactShadows&&!picking&&!frame.photographBackground){publishPickTargets();return;}
    const shadowSettings=frame.contactShadows,step=3,sw=Math.ceil(frame.width/step),sh=Math.ceil(frame.height/step),depth=shadowSettings?new Float32Array(sw*sh):undefined;
    const target=document.createElement('canvas');target.width=frame.width;target.height=frame.height;const ctx=target.getContext('2d')!;
    const sourceParts:StillLayer[]=[{src:frame.src,depthSrc:frame.depthSrc,x:0,y:0,width:frame.width,height:frame.height},...[...layers].sort((a,b)=>(b.depth??0)-(a.depth??0))];
    // Compose in strips: keep original 4K detail without holding a full set of RGBA/depth buffers.
    const strip=document.createElement('canvas');strip.width=frame.width;const paint=strip.getContext('2d',{willReadFrequently:true})!;
    for(let top=0;top<frame.height;top+=192){const height=Math.min(192,frame.height-top);strip.height=height;
      const read=(src:string,part:StillLayer,depth=false)=>{paint.clearRect(0,0,strip.width,height);paint.imageSmoothingEnabled=!depth;paint.drawImage(images.get(src)!,part.x,part.y-top,part.width,part.height);return paint.getImageData(0,0,strip.width,height).data;};
      function* parts():Generator<DepthPart>{for(const part of sourceParts){if(part.y+part.height<=top||part.y>=top+height)continue;yield{color:read(part.src,part),depth:part.depthSrc?read(part.depthSrc,part,true):undefined,width:strip.width,height,x:0,y:0,depthShift:part.depthShift,depthScale:part.depthScale,hitId:part.hitId?hitIndex(part.hitId):undefined,hitMap:part===sourceParts[0]&&frame!.hitSrc?read(frame!.hitSrc,part,true):undefined};}}
      const hitStrip=picking?new Uint8Array(frame.width*height):undefined;
      const pixels=compositeStillDepth(frame.width,height,parts(),depth?values=>{for(let y=0;y<height;y+=step)for(let x=0;x<frame!.width;x+=step)depth[Math.floor((top+y)/step)*sw+Math.floor(x/step)]=values[y*frame!.width+x]!;}:undefined,hitStrip,frame.photographBackground);if(hitStrip)pickBuffer!.set(hitStrip,top*frame.width);ctx.putImageData(new ImageData(pixels,frame.width,height),0,top);
    }
    if(depth&&shadowSettings){const start=performance.now(),shade=document.createElement('canvas');shade.width=sw;shade.height=sh;shade.getContext('2d')!.putImageData(new ImageData(photographContactShadows(depth,sw,sh,{...shadowSettings,pixelsPerMeter:shadowSettings.pixelsPerMeter/step}),sw,sh),0,0);ctx.save();ctx.globalCompositeOperation='multiply';ctx.filter='blur(2px)';ctx.imageSmoothingEnabled=true;ctx.drawImage(shade,0,0,frame.width,frame.height);ctx.restore();host.dataset.stillContactShadows='cached';host.dataset.stillShadowBuilds=String(Number(host.dataset.stillShadowBuilds??0)+1);host.dataset.stillShadowMs=String(Math.round(performance.now()-start));}else delete host.dataset.stillContactShadows;
    flattened=target;publishPickTargets();
    // The cached photo and one-byte pick buffer are sufficient while panning.
    // Release decoded depth/sprite inputs instead of retaining another whole room in memory.
    for(const src of images.keys())if(src!==frame.src&&src!==frame.foreground)images.delete(src);
  }
  function draw(){if(disposed||!frame||!images.has(frame.src)||width<2||height<2)return;
    const ratio=Math.min(1.5,globalThis.devicePixelRatio||1)*displayPixelScale(host);
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    context!.setTransform(ratio,0,0,ratio,0,0);context!.globalAlpha=1;context!.fillStyle=frame.background??'#c3ccc5';context!.fillRect(0,0,width,height);
    const rect=fit();context!.save();context!.translate(rect.x,rect.y);context!.scale(rect.scale,rect.scale);
    context!.drawImage(flattened??images.get(frame.src)!,0,0,frame.width,frame.height);
    if(!flattened)for(const layer of [...layers].sort((a,b)=>(b.depth??0)-(a.depth??0))){const image=images.get(layer.src);if(!image)continue;
      context!.save();context!.globalAlpha=layer.opacity??1;context!.translate(layer.x+(layer.flipX?layer.width:0),layer.y);if(layer.flipX)context!.scale(-1,1);
      const crop=layer.sourceRect;if(crop)context!.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,layer.width,layer.height);else context!.drawImage(image,0,0,layer.width,layer.height);context!.restore();
    }
    if(frame.foreground&&images.has(frame.foreground))context!.drawImage(images.get(frame.foreground)!,0,0,frame.width,frame.height);
    context!.restore();host.dataset.sceneRender='still';host.dataset.stillLayers=String(layers.length);host.dataset.stillViewport=JSON.stringify({...rect,source:[frame.width,frame.height],viewport:[width,height],zoom:zoomLevel});
    if(!settled){settled=true;resolveReady();}options.onLayout?.();
  }
  function settlePending(drawn:boolean){const complete=completePending;completePending=undefined;failPending=undefined;candidate=undefined;complete?.(drawn);}
  function fail(error:unknown){const reject=failPending;completePending=undefined;failPending=undefined;candidate=undefined;signature='';if(!settled){settled=true;rejectReady(error);}options.onError?.(error);reject?.(error);}
  function resize(){if(disposed)return;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);
    // A hidden route can decode its next photograph before becoming visible.
    // Keep the committed photograph/coordinates together until it can be drawn.
    if(candidate&&width>=2&&height>=2){const next=candidate,run=generation;candidate=undefined;frame=next.frame;layers=next.layers;images=next.images;if(viewKey!==(frame.camera?.key??'')){viewKey=frame.camera?.key??'';panX=panY=0;}try{preparePhoto();clampPan();draw();if(run===generation)settlePending(true);}catch(error){if(run===generation)fail(error);}return;}clampPan();draw();}
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);observer?.observe(host);resize();
  const local=(x:number,y:number)=>{const r=canvas.getBoundingClientRect();return{x:(x-r.left)*width/Math.max(1,r.width),y:(y-r.top)*height/Math.max(1,r.height)};};
  const pointers=new Map<number,{x:number;y:number}>();let down:[number,number]=[0,0],moved=false,pinch=0,mouseButton=0;
  function zoom(factor:number,x=width/2,y=height/2){if(!frame)return;const old=fit(),point={x:(x-old.x)/old.scale,y:(y-old.y)/old.scale},minimum=frame.camera||frame.fit==='cover'?Math.min(1,Math.max(width/frame.width,height/frame.height)/(old.scale/zoomLevel)):.55;zoomLevel=Math.max(minimum,Math.min(5,zoomLevel*factor));const next=fit();panX+=x-(next.x+point.x*next.scale);panY+=y-(next.y+point.y*next.scale);clampPan();draw();}
  const press=(event:PointerEvent)=>{if(event.button!==0&&event.button!==2)return;mouseButton=event.button;if(mouseButton===2||event.pointerType==='touch')event.preventDefault();down=[event.clientX,event.clientY];if(!pointers.size)moved=false;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture?.(event.pointerId);canvas.style.cursor='grabbing';if(pointers.size===2){const[a,b]=[...pointers.values()];pinch=Math.hypot(a!.x-b!.x,a!.y-b!.y);moved=true;}};
  const move=(event:PointerEvent)=>{const old=pointers.get(event.pointerId);if(!old){const p=local(event.clientX,event.clientY),r=fit();canvas.style.cursor=objectAt((p.x-r.x)/r.scale,(p.y-r.y)/r.scale)?'pointer':'grab';return;}const dx=event.clientX-old.x,dy=event.clientY-old.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(Math.hypot(event.clientX-down[0],event.clientY-down[1])>6)moved=true;
    if(mouseButton===2)return;
    if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a!.x-b!.x,a!.y-b!.y);const center=local((a!.x+b!.x)/2,(a!.y+b!.y)/2);if(pinch>0)zoom(distance/pinch,center.x,center.y);pinch=distance;}else{const r=canvas.getBoundingClientRect();panX+=dx*width/Math.max(1,r.width);panY+=dy*height/Math.max(1,r.height);clampPan();draw();}};
  const click=(event:PointerEvent)=>{pointers.delete(event.pointerId);if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);canvas.style.cursor=pointers.size?'grabbing':'grab';if(mouseButton===2){if(event.type!=='pointercancel'&&Math.abs(event.clientX-down[0])>35)options.onRotate?.(event.clientX<down[0]?1:-1);return;}if(event.type==='pointercancel'||!frame||!options.onClick||moved||Math.hypot(event.clientX-down[0],event.clientY-down[1])>8)return;const point=local(event.clientX,event.clientY),image=fit();const x=(point.x-image.x)/image.scale,y=(point.y-image.y)/image.scale;if(x>=0&&y>=0&&x<=frame.width&&y<=frame.height){tapGuard.arm(event);options.onClick(x,y);}};
  const wheelSurface=host.closest('section')??host;
  const wheel=(event:WheelEvent)=>{const target=event.target;if(!(target instanceof Element)||!host.contains(target)&&!target.closest('[data-home-object],[data-tour-object],[data-office-seat],[data-office-door],[data-store-facility],[data-cafe-facility]'))return;event.preventDefault();const point=local(event.clientX,event.clientY);zoom(Math.exp(-event.deltaY*.0015),point.x,point.y);};
  // Keep the canvas a native click target so touch adjustment cannot redirect a facility tap to a nearby label.
  const directClick=(event:MouseEvent)=>event.preventDefault();canvas.addEventListener('click',directClick);
  const contextMenu=(event:Event)=>event.preventDefault();canvas.addEventListener('contextmenu',contextMenu);
  canvas.addEventListener('pointerdown',press);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',click);canvas.addEventListener('pointercancel',click);wheelSurface.addEventListener('wheel',wheel as EventListener,{passive:false});
  return{ready,canvas,
    update(nextFrame:StillFrame,nextLayers:StillLayer[]=[]):Promise<boolean>{
      if(disposed)return Promise.resolve(false);const key=JSON.stringify([nextFrame,nextLayers]);if(key===signature)return pending??Promise.resolve(true);settlePending(false);signature=key;const run=++generation;
      const urls=[...new Set([nextFrame.src,...(nextFrame.hitSrc?[nextFrame.hitSrc]:[]),...nextLayers.map(layer=>layer.src),...[nextFrame.depthSrc,...nextLayers.map(layer=>layer.depthSrc),nextFrame.foreground].filter((src):src is string=>!!src)])];
      pending=new Promise<boolean>((resolve,reject)=>{completePending=resolve;failPending=reject;});
      void Promise.all(urls.map(async src=>[src,await loadImage(src)] as const)).then(loaded=>{if(disposed||run!==generation)return;candidate={frame:nextFrame,layers:nextLayers,images:new Map(loaded)};resize();},error=>{if(!disposed&&run===generation)fail(error);});return pending;
    },
    objectAt,
    imageToHost(x:number,y:number):StillPoint{const rect=fit(),hx=(rect.x+x*rect.scale)/Math.max(1,width)*100,hy=(rect.y+y*rect.scale)/Math.max(1,height)*100;return{x:hx,y:hy,visible:hx>=0&&hx<=100&&hy>=0&&hy<=100};},
    hostToImage(x:number,y:number){const rect=fit();return{x:(x-rect.x)/rect.scale,y:(y-rect.y)/rect.scale};},
    refresh(){resize();},zoom,resetView(){zoomLevel=1;panX=panY=0;draw();},centerOn(x:number,y:number){const rect=fit();panX+=width/2-(rect.x+x*rect.scale);panY+=height/2-(rect.y+y*rect.scale);clampPan();draw();},
    dispose(){if(disposed)return;disposed=true;generation++;settlePending(false);tapGuard.dispose();observer?.disconnect();canvas.removeEventListener('click',directClick);canvas.removeEventListener('contextmenu',contextMenu);canvas.removeEventListener('pointerdown',press);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',click);canvas.removeEventListener('pointercancel',click);wheelSurface.removeEventListener('wheel',wheel as EventListener);canvas.remove();images.clear();flattened=undefined;pickBuffer=undefined;if(!settled){settled=true;const error=new Error('Scene loading was cancelled');error.name='AbortError';rejectReady(error);}},
  };
}
