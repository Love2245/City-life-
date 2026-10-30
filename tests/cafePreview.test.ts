import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import actions from '../src/game/data/actions.json';
import jobs from '../src/game/data/jobs.json';
import locations from '../src/game/data/locations.json';
import npcs from '../src/game/data/npcs.json';
import { CAFE, BAR, BACK_BAR, CAFE_OBSTACLES, CAFE_GAMEPLAY, LIN_SEAT, COMMUNAL, COMMUNAL_SEATS, BANQUETTE_CHAIRS, BANQUETTE_TABLES, LOUNGE_SEATS, WINDOW_STOOLS } from '../previews/cafe/layout';

const root=fileURLToPath(new URL('../previews/cafe/',import.meta.url));
const runtimeAssets=fileURLToPath(new URL('../src/assets/scenes/cafe/',import.meta.url));
type Model={id:string;file:string;bytes:number;sha256:string;sourceScene:string;sourceSceneSHA256:string};
const manifest=JSON.parse(readFileSync(root+'asset-manifest.json','utf8')) as {models:Model[];totalBytes:number};
const details=JSON.parse(readFileSync(new URL('../docs/gameplay-scene-outfits-20261019/reference-detail-manifest.json',import.meta.url),'utf8')).filter((m:Model & {venue:string})=>m.venue==='cafe') as Model[];
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

describe('cafe scene preparation',()=>{
  it('keeps a 60 cm footprint connected from the entrance to ordering, pickup, seating approaches and the staff aisle',()=>{
    const step=.05,r=.30,columns=Math.round(CAFE.width/step)+1,rows=Math.round(CAFE.depth/step)+1;
    const usable=new Uint8Array(columns*rows),visited=new Uint8Array(usable.length);
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const x=col*step,z=row*step;if(x<r||z<r||x>CAFE.width-r||z>CAFE.depth-r)continue;
      const hit=CAFE_OBSTACLES.some(o=>{const dx=x-Math.max(o.x-o.width/2,Math.min(o.x+o.width/2,x)),dz=z-Math.max(o.z-o.depth/2,Math.min(o.z+o.depth/2,z));return dx*dx+dz*dz<r*r-1e-8;});
      if(!hit)usable[row*columns+col]=1;
    }
    const index=(x:number,z:number)=>Math.round(z/step)*columns+Math.round(x/step),seed=index(CAFE.doorX,10.55);
    expect(usable[seed]).toBe(1);const queue=[seed];visited[seed]=1;
    for(let head=0;head<queue.length;head++){const k=queue[head],col=k%columns;for(const next of [col>0?k-1:-1,col<columns-1?k+1:-1,k-columns,k+columns])if(next>=0&&next<usable.length&&usable[next]&&!visited[next]){visited[next]=1;queue.push(next);}}
    for(const [name,x,z]of [['order',9.85,3.35],['pickup',5.45,3.35],['shared table',7.65,6.25],['window seats',6.2,8.85],['banquette one',3.8,4.85],['banquette two',3.8,7.15],['soft seats',2.1,3.55],['staff aisle',7.65,1.35]] as const)expect(visited[index(x,z)],`${name} remains accessible`).toBe(1);
    expect(BAR.z-BAR.depth/2-(BACK_BAR.z+BACK_BAR.depth/2)).toBeGreaterThanOrEqual(1.2);
  });

  it('packages only the selected GLBs with exact bytes and original provenance',()=>{
    expect(readdirSync(root+'assets').filter(f=>f.endsWith('.glb')).sort()).toEqual(manifest.models.map(m=>m.file).sort());
    expect(new Set(manifest.models.map(m=>m.id)).size).toBe(manifest.models.length);
    expect(readdirSync(runtimeAssets).filter(f=>f.endsWith('.glb')).sort()).toEqual([...manifest.models,...details].map(m=>m.file).sort());
    for(const m of details){const data=readFileSync(runtimeAssets+m.file);expect(data.length).toBe(m.bytes);expect(hash(data)).toBe(m.sha256);expect(hash(readFileSync(m.sourceScene))).toBe(m.sourceSceneSHA256);}
    let bytes=0;for(const m of manifest.models){const data=readFileSync(root+'assets/'+m.file);expect(data.readUInt32LE(0)).toBe(0x46546c67);expect(data.length).toBe(m.bytes);expect(hash(data)).toBe(m.sha256);expect(hash(readFileSync(runtimeAssets+m.file))).toBe(m.sha256);expect(hash(readFileSync(m.sourceScene))).toBe(m.sourceSceneSHA256);bytes+=data.length;}
    expect(bytes).toBe(manifest.totalBytes);
  });

  it('keeps the visual Lin preview consistent with the real character and cafe while leaving game state untouched',()=>{
    const drink=actions.find(a=>a.id===CAFE_GAMEPLAY.drink.actionId)!,job=jobs.find(j=>j.id===CAFE_GAMEPLAY.job.id)!;
    expect(locations.find(l=>l.id==='cafe')?.openHours).toEqual(CAFE_GAMEPLAY.openHours);
    expect(drink.locationId).toBe('cafe');expect(drink.effects.money).toBe(-CAFE_GAMEPLAY.drink.price);expect(drink.duration).toBe(CAFE_GAMEPLAY.drink.duration);expect(drink.requirements.dailyLimit?.limit).toBe(CAFE_GAMEPLAY.drink.dailyLimit);
    expect(job.locationId).toBe('cafe');expect(job.startHour).toBe(CAFE_GAMEPLAY.job.startHour);expect(job.endHour).toBe(CAFE_GAMEPLAY.job.endHour);
    expect(CAFE_GAMEPLAY.npcVisualPreview).toBe(true);expect(CAFE_GAMEPLAY.liveNpcIntegration).toBe(false);expect(CAFE_GAMEPLAY.stateWrites).toBe(false);
    expect(npcs.find(n=>n.id===LIN_SEAT.npcId)?.name).toBe(LIN_SEAT.name);
    expect(WINDOW_STOOLS).toContain(LIN_SEAT.x);expect(WINDOW_STOOLS.filter(x=>x!==LIN_SEAT.x)).toHaveLength(2);
    const source=readFileSync(root+'main.ts','utf8');expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|dispatchGameAction|gameState|npcPresence/);
  });

  it('turns the front of every movable chair toward its actual table',()=>{
    const facingTable=(seat:{x:number;z:number;yaw:number},x:number,z:number)=>{
      const dx=x-seat.x,dz=z-seat.z,length=Math.hypot(dx,dz);
      // Local +Z is the open front; the backrest is at local -Z.
      expect((Math.sin(seat.yaw)*dx+Math.cos(seat.yaw)*dz)/length).toBeCloseTo(1,6);
    };
    for(const s of COMMUNAL_SEATS)facingTable(s,s.x,COMMUNAL.z);
    BANQUETTE_CHAIRS.forEach((s,i)=>facingTable(s,BANQUETTE_TABLES[i].x,BANQUETTE_TABLES[i].z));
    for(const s of LOUNGE_SEATS)facingTable(s,2.1,2.65);
  });
});
