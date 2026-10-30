import * as THREE from 'three';
import type {HomeSurfaceStyle} from '../game/core/homeDecor';

/** Small repeating materials, generated locally so portable builds stay offline. */
export function homeSurfaceTexture(style:HomeSurfaceStyle):THREE.CanvasTexture|undefined{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  let seed=[...style.id].reduce((sum,c)=>(sum*31+c.charCodeAt(0))>>>0,7);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle=style.color;ctx.fillRect(0,0,512,512);
  if(style.pattern==='oak'||style.pattern==='walnut'){
    for(let row=0;row<8;row++){
      const y=row*64;ctx.fillStyle=`rgba(${random()>.5?'255,255,255':'0,0,0'},${.025+random()*.035})`;ctx.fillRect(0,y,512,64);
      ctx.strokeStyle=style.detail;ctx.globalAlpha=.2;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(512,y+.5);ctx.stroke();
      const seam=(row%3)*170+68;ctx.beginPath();ctx.moveTo(seam,y);ctx.lineTo(seam,y+64);ctx.stroke();
      for(let line=0;line<18;line++){ctx.strokeStyle=style.detail;ctx.globalAlpha=.06+random()*.04;ctx.beginPath();const sy=y+random()*64;ctx.moveTo(-10,sy);for(let x=0;x<=532;x+=32)ctx.lineTo(x,sy+Math.sin(x*.025+line)*1.6);ctx.stroke();}
    }
  }else if(style.pattern==='stone'||style.pattern==='vinyl'){
    const size=style.pattern==='stone'?256:128;
    for(let y=0;y<512;y+=size)for(let x=0;x<512;x+=size){ctx.globalAlpha=.04;ctx.fillStyle=(x/size+y/size)%2?'#ffffff':'#000000';ctx.fillRect(x,y,size,size);ctx.globalAlpha=.24;ctx.strokeStyle=style.detail;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,size-1,size-1);}
  }else if(style.pattern==='linen'||style.pattern==='woven'){
    const step=style.pattern==='linen'?3:6;
    ctx.strokeStyle=style.detail;ctx.globalAlpha=style.pattern==='linen'?.09:.18;ctx.lineWidth=1;
    for(let n=0;n<512;n+=step){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,512);ctx.moveTo(0,n);ctx.lineTo(512,n);ctx.stroke();}
    ctx.strokeStyle='#fff';ctx.globalAlpha=.08;
    for(let n=1;n<512;n+=step){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,512);ctx.stroke();}
  }else if(style.pattern==='stripe'){
    ctx.fillStyle=style.detail;ctx.globalAlpha=.12;for(let x=0;x<512;x+=32)ctx.fillRect(x,0,6,512);
  }
  ctx.globalAlpha=style.surface==='wall'?.035:.018;
  for(let i=0;i<3400;i++){ctx.fillStyle=random()>.5?'#fff':'#000';ctx.fillRect(random()*512,random()*512,1,1);}
  ctx.globalAlpha=1;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  return texture;
}
