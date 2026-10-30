import {homePlanFor} from '../src/game/core/homeInterior';
import {homePreviewRoom} from '../src/lib/homeRoomState';
import {homeReferencePlan,homeReferenceState} from '../src/lib/homeReferencePlan';
import {composeHomeStill} from '../src/lib/homeStillView';
import {createStillScene} from '../src/lib/stillScene';
const host=document.querySelector<HTMLElement>('#photo')!,view=createStillScene(host),plan=homeReferencePlan(homePlanFor(new URLSearchParams(location.search).get('id')??'own_apartment'));
const state=homeReferenceState(homePreviewRoom(plan,true,12,'auto','sunny','basic'),plan);
let baseline:Uint8ClampedArray|undefined;
(window as any).showShadow=async(enabled:boolean,angle=0)=>{const c=composeHomeStill(plan,state,angle);if(!enabled){delete c.frame.contactShadows;if(!c.layers.length)c.layers.push({src:c.frame.src,x:0,y:0,width:0,height:0});}const start=performance.now();await view.update(c.frame,c.layers);const elapsed=performance.now()-start,pixels=view.canvas.getContext('2d')!.getImageData(0,0,view.canvas.width,view.canvas.height).data;let comparison;
  if(!enabled)baseline=pixels;else if(baseline){let drop=0,changed=0,brightened=0,maxBrightening=0;for(let i=0;i<pixels.length;i+=4){const difference=(baseline[i]!-pixels[i]!+baseline[i+1]!-pixels[i+1]!+baseline[i+2]!-pixels[i+2]!)/3;drop+=difference;if(difference>2)changed++;if(difference<-.5)brightened++;maxBrightening=Math.max(maxBrightening,-difference);}comparison={meanChannelDrop:drop/(pixels.length/4),shadedPixelFraction:changed/(pixels.length/4),brightenedPixels:brightened,maxBrightening};baseline=undefined;}
  return{milliseconds:elapsed,shadowMilliseconds:enabled?Number(host.dataset.stillShadowMs):undefined,comparison,viewport:JSON.parse(host.dataset.stillViewport!)};};
(window as any).scene=view;(window as any).ready=true;
