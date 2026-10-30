/** Reuse immutable procedural pixels between visits, while every scene owns its
 * own GPU texture and may dispose it independently. Keep CPU memory bounded. */
const canvases=new Map<string,HTMLCanvasElement>();
const MAX_CANVASES=24;
const MAX_CACHED_PIXELS=8_388_608;

/** Draw in logical artwork coordinates while bounding the upload dimensions. */
export function createSceneCanvas(width:number,height:number,draw:(context:CanvasRenderingContext2D)=>void,maxEdge=Infinity):HTMLCanvasElement {
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Cannot prepare scene surface texture');
  context.scale(canvas.width/width,canvas.height/height);draw(context);return canvas;
}

export function sceneTextureCanvas(key:string,width:number,height:number,draw:(context:CanvasRenderingContext2D)=>void):HTMLCanvasElement {
  const cacheKey=`${width}x${height}:${key}`,cached=canvases.get(cacheKey);
  if(cached){canvases.delete(cacheKey);canvases.set(cacheKey,cached);return cached;}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Cannot prepare scene surface texture');
  draw(context);canvases.set(cacheKey,canvas);
  let pixels=[...canvases.values()].reduce((total,value)=>total+value.width*value.height,0);
  while(canvases.size&&(canvases.size>MAX_CANVASES||pixels>MAX_CACHED_PIXELS)){
    const oldest=canvases.keys().next().value!,value=canvases.get(oldest)!;pixels-=value.width*value.height;canvases.delete(oldest);
  }
  return canvas;
}
