/** Restrained image-space contact shade. Run once per composed photograph, never per drag/frame. */
export interface StillContactShadows {pixelsPerMeter:number;depthRange:number;strength?:number;radius?:number;light?:readonly [number,number,number]}
const directions=Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)] as const);
export function photographLight(matrix:readonly number[],width:number,height:number,ppm:number,depthRange:number):readonly [number,number,number]{
  const [x,y,z]=[-.18,1,-.12];return[(matrix[0]!*x+matrix[4]!*y+matrix[8]!*z)*width/2/ppm,-(matrix[1]!*x+matrix[5]!*y+matrix[9]!*z)*height/2/ppm,(matrix[2]!*x+matrix[6]!*y+matrix[10]!*z)*depthRange/2];
}
export function photographContactShadows(depth:Float32Array,width:number,height:number,settings:StillContactShadows){
  const result=new Uint8ClampedArray(width*height*4),unit=settings.depthRange/65534,ppm=settings.pixelsPerMeter,radius=settings.radius??.32,strength=settings.strength??.3;
  const samples=directions.flatMap(([dx,dy])=>[.45,1].map(reach=>{const x=Math.round(dx*radius*ppm*reach),y=Math.round(dy*radius*ppm*reach);return{x,y,denominator:Math.hypot(x,y)/ppm*.8+.025};}));
  const light=settings.light??[.2,-.7,-.68],rays=[-.018,.018].map(soften=>Array.from({length:12},(_,i)=>{const distance=(i+1)*.05;return{x:Math.round((light[0]+soften)*distance*ppm),y:Math.round(light[1]*distance*ppm),z:light[2]*distance};}));
  const at=(x:number,y:number)=>x<0||y<0||x>=width||y>=height?Infinity:depth[y*width+x]!*unit;
  function slope(a:number,b:number,c:number){const before=c-a,after=b-c;if(!Number.isFinite(before))return Number.isFinite(after)?after:0;if(!Number.isFinite(after))return before;return Math.abs(before)<Math.abs(after)?before:after;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x,center=at(x,y);let occlusion=0,cast=0;
    if(Number.isFinite(center)&&center<settings.depthRange-.02){
      const gx=slope(at(x-1,y),at(x+1,y),center),gy=slope(at(x,y-1),at(x,y+1),center);
      for(const samplePoint of samples){
        const {x:ox,y:oy}=samplePoint,sample=at(x+ox,y+oy);
        // Compare against the local receiving plane: a sloping floor must remain evenly lit.
        const raised=center+gx*ox+gy*oy-sample;
        if(raised>.018&&raised<.8)occlusion+=Math.min(1,(raised-.018)/samplePoint.denominator)*(1-raised/.8);
      }
      // Short soft light rays add a small cast footprint, using the same photographed geometry.
      // Never shade a plane with a light ray which lies below that plane.
      if(light[2]<(gx*light[0]+gy*light[1])*ppm-.02)for(const ray of rays)for(const point of ray){const raised=center+point.z-at(x+point.x,y+point.y);if(raised>.025&&raised<.42){cast+=.5;break;}}
    }
    const shade=Math.round(255*(1-strength*occlusion/24)*(1-.13*cast)),i=index*4;result[i]=result[i+1]=result[i+2]=shade;result[i+3]=255;
  }return result;
}
