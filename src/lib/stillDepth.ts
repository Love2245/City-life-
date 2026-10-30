/** Offline depth photographs supply 16-bit camera depth; this is software image composition only. */
export interface DepthPart {color:Uint8ClampedArray;depth?:Uint8ClampedArray;width:number;height:number;x:number;y:number;scaleX?:number;scaleY?:number;depthShift?:number;depthScale?:number;hitId?:number;hitMap?:Uint8ClampedArray}
export function compositeStillDepth(width:number,height:number,parts:Iterable<DepthPart>,onDepth?:(depth:Float32Array)=>void,hitOutput?:Uint8Array,photographBackground?:readonly[number,number,number]){
  const color=new Uint8ClampedArray(width*height*4),z=new Float32Array(width*height);z.fill(Infinity);
  for(const part of parts){const sx=part.scaleX??1,sy=part.scaleY??1;
    const left=Math.max(0,Math.round(part.x)),top=Math.max(0,Math.round(part.y)),right=Math.min(width,Math.ceil(part.x+part.width*sx)),bottom=Math.min(height,Math.ceil(part.y+part.height*sy));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const px=Math.min(part.width-1,Math.max(0,Math.floor((x-part.x)/sx))),py=Math.min(part.height-1,Math.max(0,Math.floor((y-part.y)/sy))),source=(py*part.width+px)*4,alpha=part.color[source+3]!/255;if(alpha<=.01)continue;
      const index=y*width+x,depth=part.depth?(part.depth[source]!*256+part.depth[source+1]!)*(part.depthScale??1)+(part.depthShift??0):65535;
      if(depth>z[index]!+.6)continue;
      const dest=index*4,behind=color[dest+3]!/255,out=alpha+behind*(1-alpha);
      for(let c=0;c<3;c++)color[dest+c]=(part.color[source+c]!*alpha+color[dest+c]!*behind*(1-alpha))/out;
      color[dest+3]=out*255;z[index]=depth;if(hitOutput&&alpha>.25)hitOutput[index]=part.hitId??part.hitMap?.[source]??0;
    }
  }
  // 65535 is the baked clear background; all photographed geometry is <=65534.
  // Apply after sprites, so computers, people, windows and walls retain their pixels.
  if(photographBackground)for(let index=0;index<z.length;index++)if(z[index]===65535){const dest=index*4;color[dest]=photographBackground[0];color[dest+1]=photographBackground[1];color[dest+2]=photographBackground[2];}
  onDepth?.(z);return color;
}
