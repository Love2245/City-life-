import { describe, expect, it } from 'vitest';
import { atlasFrames, spriteSector } from '../previews/cafe/spriteDirections';
const radians=(degrees:number)=>degrees*Math.PI/180;

describe('seated character view selection',()=>{
  it('grounds the left view on stool feet rather than an extended shoe, leaving the other seven anchors unchanged',()=>{
    const width=400,height=200,pixels=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<8;i++){
      const x=i%4*100,y=Math.floor(i/4)*100;
      for(let dy=10;dy<91;dy++)for(let dx=20;dx<41;dx++)pixels[((y+dy)*width+x+dx)*4+3]=255;
      for(let dx=41;dx<71;dx++)pixels[((y+83)*width+x+dx)*4+3]=255;
    }
    const frames=atlasFrames(pixels,width,height);
    for(let i=0;i<8;i++)expect(frames[i].anchorX).toBe(i%4*100+(i===6?30.5:45.5));
  });
  it('chooses each of the eight painted views and wraps across the full turn without mirroring',()=>{
    for(let i=0;i<8;i++)for(const turns of [-2,-1,0,1,2])expect(spriteSector(radians(i*45+turns*360))).toBe(i);
    expect(spriteSector(radians(-45))).toBe(7);
    expect(spriteSector(radians(359))).toBe(0);
  });
  it('holds the current view around a boundary, then changes when the camera passes the deadband',()=>{
    expect(spriteSector(radians(24),0)).toBe(0);
    expect(spriteSector(radians(30),0)).toBe(1);
    expect(spriteSector(radians(21),1)).toBe(1);
    expect(spriteSector(radians(15),1)).toBe(0);
    expect(spriteSector(radians(-179),4)).toBe(4);
  });
  it('finds each silhouette in an atlas whose cell size is not an integer and keeps UVs inside its cell',()=>{
    const width=178,height=89,pixels=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<8;i++){
      const x=Math.round((i%4)*width/4)+10,y=Math.round(Math.floor(i/4)*height/2)+7;
      for(let dy=0;dy<30;dy++)for(let dx=0;dx<20;dx++)pixels[((y+dy)*width+x+dx)*4+3]=255;
      pixels[(Math.round(Math.floor(i/4)*height/2)*width+Math.round((i%4)*width/4))*4+3]=10;
    }
    const frames=atlasFrames(pixels,width,height);
    expect(frames).toHaveLength(8);
    frames.forEach((f,i)=>{
      expect(f.width).toBe(22);expect(f.height).toBe(32);
      expect(f.x).toBeGreaterThan(Math.round((i%4)*width/4));
      expect(f.anchorX).toBe(Math.round((i%4)*width/4)+20);
      expect(f.x+f.width).toBeLessThan(Math.round((i%4+1)*width/4));
      expect(f.y+f.height).toBeLessThan(Math.round((Math.floor(i/4)+1)*height/2));
    });
    pixels.fill(0);expect(()=>atlasFrames(pixels,width,height)).toThrow(/no visible silhouette/);
  });
  it('keeps visible stool feet intact when a painted silhouette reaches a cell border',()=>{
    const width=178,height=89,pixels=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<8;i++){
      const left=Math.round(i%4*width/4),right=Math.round((i%4+1)*width/4);
      const top=Math.round(Math.floor(i/4)*height/2),bottom=Math.round((Math.floor(i/4)+1)*height/2);
      for(const [x,y] of [[left,top],[right-1,top],[left,bottom-1],[right-1,bottom-1]])pixels[(y*width+x)*4+3]=255;
    }
    atlasFrames(pixels,width,height).forEach((f,i)=>{
      const left=Math.round(i%4*width/4),right=Math.round((i%4+1)*width/4);
      const top=Math.round(Math.floor(i/4)*height/2),bottom=Math.round((Math.floor(i/4)+1)*height/2);
      expect(f.x).toBe(left);expect(f.y).toBe(top);
      expect(f.x+f.width).toBe(right);expect(f.y+f.height).toBe(bottom);
    });
  });
});
