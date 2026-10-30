import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,openSync,readSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),dir=join(root,'src/assets/mobile-stills/company');
const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
function dimensions(file){const b=Buffer.alloc(64),fd=openSync(join(dir,file),'r');try{readSync(fd,b,0,b.length,0);}finally{closeSync(fd);}
  if(b.toString('ascii',1,4)==='PNG')return[b.readUInt32BE(16),b.readUInt32BE(20)];
  assert.equal(b.toString('ascii',8,12),'WEBP');const type=b.toString('ascii',12,16);
  if(type==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(type==='VP8 ')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  assert.equal(type,'VP8L');const bits=b.readUInt32LE(21);return[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
const types=['paper-bag','cat','fox','bear','drink-can','parcel-bag','grocery-bag','lightbulb','rabbit','panda','apple','orange','planet'];
let checked=0;
for(const stage of [1,2,3,4])for(const angle of [0,1,2,3])for(const period of ['day','night']){
  const frame=manifest.frames[`${stage}-${angle}-${period}`];assert(frame);assert.equal(frame.labels.length,[3,6,10,16][stage-1]+1);
  for(const key of ['src','foreground','depthSrc','hitSrc']){assert(frame[key]);assert(existsSync(join(dir,frame[key])));assert.deepEqual(dimensions(frame[key]),[4096,2560]);checked++;}
  assert.equal(frame.hitIds.length,[3,6,10,16][stage-1]+1);
}
for(const type of types)for(let look=0;look<6;look++)for(let angle=0;angle<4;angle++){
  const sprite=manifest.sprites[`worker-${look}-${type}-${angle}`];assert(sprite,`${look}/${type}/${angle}`);
  for(const key of ['src','depthSrc']){assert(sprite[key]);assert(existsSync(join(dir,sprite[key])));assert.deepEqual(dimensions(sprite[key]),[sprite.width,sprite.height]);checked++;}
}
const report={passed:true,frames:32,headgearTypes:types.length,workerSprites:312,checkedFiles:checked,revision:manifest.layoutRevision};
writeFileSync(join(root,'docs/office-layout-mobile-audio-1497-20261027/office-assets-checked.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
