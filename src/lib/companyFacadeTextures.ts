import * as THREE from 'three';

/** Four bays by four storeys: opaque, deterministic facade detail with selective night windows. */
export function createCompanyFacadeTextures(campus:boolean){
  const n=512,color=new Uint8Array(n*n*4),emission=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=x%128,v=y%128,col=Math.floor(x/128),row=Math.floor(y/128),noise=((x*17+y*31+x*y)%13-6)*.35;
    const left=campus?22:15,right=campus?106:113,bottom=campus?32:24,top=108,inside=u>=left&&u<=right&&v>=bottom&&v<=top;
    let rgb=(campus?[220,215,194]:[205,215,211]).map(c=>c+noise),lit=false;
    if(v<7)rgb=campus?[178,181,165]:[153,172,173];
    else if(v<11)rgb=campus?[233,229,210]:[222,230,223];
    else if(u<2||v>123)rgb=campus?[192,190,173]:[176,193,191];
    if(inside){
      const frame=u<left+3||u>right-3||v<bottom+3||v>top-3||Math.abs(u-64)<1.5||(!campus&&Math.abs(v-79)<1.2);
      const shade=(v-bottom)/(top-bottom)*20+((col*7+row*3)%9)-4,sheen=Math.abs(u-(32+v*.24))<7?10:0;
      rgb=frame?(campus?[183,196,188]:[190,207,206]):(campus?[94,126,132]:[104,139,151]).map(c=>c+shade+sheen+noise*.3);
      const blind=!frame&&(col+row*3)%5===1&&v>85;if(blind)rgb=[165,174,157].map(c=>c+(v%6===0?-6:0));
      lit=!frame&&!blind&&(col*3+row*7)%5<2;
    }
    // Recess shadow, sill lip and a shallow lintel make each window read as part of a wall.
    if(u>left-3&&u<right+3&&v>=bottom-5&&v<bottom)rgb=v<bottom-3?[126,149,147]:[218,228,216];
    if(u>left-2&&u<right+2&&v>top&&v<top+3)rgb=[154,175,173];
    const i=(y*n+x)*4;for(let c=0;c<3;c++){color[i+c]=rgb[c]!;emission[i+c]=lit?[242,205,142][c]!:0;}color[i+3]=emission[i+3]=255;
  }
  function map(data:Uint8Array){const texture=new THREE.DataTexture(data,n,n);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;}
  return{color:map(color),emission:map(emission),repeatWidth:campus?9.6:10.8,repeatHeight:12.8};
}
