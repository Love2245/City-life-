interface FaceMatte {source:string;crop:number[];features:number[][];mode:'body'|'expression';onReady:(ready:boolean)=>void}
/** Rendering mask, derived from the current bitmap rather than a new painting.
 * Hair/grey highlights stay original; authored facial ink remains expressive. */
export function faceMattePixels(pixels:Uint8ClampedArray,width:number,height:number,left:number,top:number,features:number[][],mode:FaceMatte['mode']){
 const size=width*height,warm=new Uint8Array(size),face=new Uint8Array(size),queue=new Int32Array(size);
 const mouth=features[2],mx=mouth[0]+mouth[2]/2-left,my=mouth[1]+mouth[3]/2-top-(mode==='body'?6:12);
 let seed=-1,best=Infinity;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  if(pixels[i+3]>200&&r>155&&g>90&&r-g>18&&g-b>8){warm[y*width+x]=1;const distance=(x-mx)**2+(y-my)**2;if(distance<best){best=distance;seed=y*width+x;}}
 }
 if(seed<0)return new Uint8ClampedArray(pixels.length);
 let head=0,tail=1;queue[0]=seed;face[seed]=1;
 while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(const next of[x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(next>=0&&warm[next]&&!face[next]){face[next]=1;queue[tail++]=next;}}
 // Close small dark eye/brow/lip holes, including a thin connection to a
 // fringe; broad hair/hat/beard regions remain outside the face component.
 const radius=mode==='body'?4:7;
 const pass=(input:Uint8Array,horizontal:boolean,dilate:boolean)=>{
  const output=new Uint8Array(size),length=horizontal?width:height,lines=horizontal?height:width;
  const index=(line:number,p:number)=>horizontal?line*width+p:p*width+line;
  for(let line=0;line<lines;line++){
   let sum=0;for(let p=0;p<=radius&&p<length;p++)sum+=input[index(line,p)];
   for(let p=0;p<length;p++){
    output[index(line,p)]=Number(dilate?sum>0:sum===radius*2+1);
    const remove=p-radius,add=p+radius+1;if(remove>=0)sum-=input[index(line,remove)];if(add<length)sum+=input[index(line,add)];
   }
  }return output;
 };
 const closed=pass(pass(pass(pass(face,true,true),false,true),true,false),false,false);
 const output=new Uint8ClampedArray(pixels.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)sum+=closed[(y+dy)*width+x+dx];
  const i=(y*width+x)*4;output[i]=output[i+1]=output[i+2]=255;output[i+3]=pixels[i+3]>200?Math.round(sum/9*255):0;
 }
 return output;
}
const cache=new Map<string,Promise<string>>();
function matte(options:FaceMatte){
 const key=options.source+'|'+options.mode+'|'+options.crop.join(',')+'|'+JSON.stringify(options.features);
 let result=cache.get(key);if(result)return result;
 result=new Promise<string>((resolve,reject)=>{
  const image=new Image();image.onerror=()=>{cache.delete(key);reject(Error('Portrait matte unavailable'));};image.onload=()=>{try{
   const[x,y,width,height]=options.crop,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,x,y,width,height,0,0,width,height);
   const pixels=context.getImageData(0,0,width,height);pixels.data.set(faceMattePixels(pixels.data,width,height,x,y,options.features,options.mode));
   context.putImageData(pixels,0,0);resolve(canvas.toDataURL('image/png'));
  }catch(error){cache.delete(key);reject(error);}};image.src=options.source;
 });cache.set(key,result);if(cache.size>48)cache.delete(cache.keys().next().value!);return result;
}
export function portraitFaceMatte(node:SVGImageElement,initial:FaceMatte){
 let sequence=0,previous='';
 async function update(options:FaceMatte){
  const key=options.source+'|'+options.mode+'|'+JSON.stringify(options.crop)+'|'+JSON.stringify(options.features);
  if(key===previous&&node.dataset.matteReady==='true'){options.onReady(true);return;}
  previous=key;const current=++sequence;node.dataset.matteReady='false';options.onReady(false);
  try{const href=await matte(options);if(current===sequence){node.setAttribute('href',href);node.dataset.matteReady='true';options.onReady(true);}}
  catch{if(current===sequence)options.onReady(false);}
 }
 void update(initial);return{update:(options:FaceMatte)=>{void update(options);},destroy:()=>{sequence++;}};
}
