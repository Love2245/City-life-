import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=path.join(root,'docs/home-objects-20261015');
const shaFile=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex').toUpperCase();};
const index=JSON.parse(fs.readFileSync(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json'),'utf8'));
const expected=new Map();
for(const row of index.records){const h=await shaFile(row.source);if(h!==row.sha256||await shaFile(row.libraryPath)!==h)throw Error(`Portrait/library changed: ${row.npcId}/${row.weather}`);expected.set(h,{kind:'portrait',id:`${row.npcId}/${row.weather}`});}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
  const source=path.join(root,`src/assets/home/v1.49/models/${name}.glb`),h=await shaFile(source),library=path.resolve(root,'../../素材库/家居家具物件模型/Kenney家具套件（CC0）',`${name}.glb`);
  if(await shaFile(library)!==h)throw Error(`Computer model library mismatch: ${name}`);expected.set(h,{kind:'computer-model',id:name});
}
const props=JSON.parse(fs.readFileSync(path.join(root,'src/assets/home/v1.49/models/food-props.json'),'utf8'));
const foodSources=[];
for(const [name,data]of Object.entries(props)){
  const file=path.join(out,`kenney-food-kit/Models/GLB format/${name}.glb`),library=path.resolve(root,'../../素材库/家居家具物件模型/Kenney厨房餐具（CC0）/模型',`${name}.glb`),sha256=await shaFile(file);
  if(sha256!==data.sourceSha256.toUpperCase()||await shaFile(library)!==sha256)throw Error(`Baked prop source mismatch: ${name}`);
  foodSources.push({name,sha256,file,library,triangles:data.parts.reduce((n,p)=>n+p.positions.length/9,0)});
}
const revision='2026.10.15 · 居家物件精修';
const tokens=new Map([revision,'dining-cup','kitchen-sink-bowl','homeFoodModels',...Object.values(props).map(p=>p.sourceSha256)].map(t=>[t,false]));
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),encodedModels=0,bytes=0;
// Single-file HTML is larger than V8's string limit. Verify it as a stream.
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
  hash.update(chunk);bytes+=chunk.length;const window=Buffer.concat([tail,chunk]);
  for(const [token,seen]of tokens)if(!seen&&window.includes(Buffer.from(token)))tokens.set(token,true);tail=window.subarray(-512);
  const text=carry+chunk.toString('latin1');carry='';let cursor=0;
  while(cursor<text.length){
    if(!active){prefix.lastIndex=cursor;const match=prefix.exec(text);if(!match){carry=text.slice(-64);break;}active={mime:match[1],hash:createHash('sha256'),remainder:''};cursor=prefix.lastIndex;}
    delimiter.lastIndex=cursor;const end=delimiter.exec(text),part=active.remainder+text.slice(cursor,end?end.index:undefined);
    if(!end){const complete=part.length-part.length%4;active.hash.update(Buffer.from(part.slice(0,complete),'base64'));active.remainder=part.slice(complete);break;}
    active.hash.update(Buffer.from(part,'base64'));const digest=active.hash.digest('hex').toUpperCase();if(expected.has(digest))found.set(digest,expected.get(digest));if(active.mime==='model/gltf-binary')encodedModels++;active=null;cursor=end.index;
  }
}
if(active)throw Error('Truncated data URI');
for(const [token,seen]of tokens)if(!seen)throw Error(`Portable model/revision token missing: ${token}`);
for(const [digest,asset]of expected)if(!found.has(digest))throw Error(`Portable asset missing or changed: ${asset.id}`);
if(encodedModels!==4)throw Error(`Expected four preserved computer GLBs, got ${encodedModels}`);
const releaseHash=hash.digest('hex').toUpperCase();
if(await shaFile(path.join(root,'dist-portable/index.html'))!==releaseHash)throw Error('Published HTML differs from build');
const backup=path.join(root,'待清理文件/居家物件打磨前_20261015/1.49.0.html'),backupHash=await shaFile(backup);
if(backupHash!=='7A0983C59DCF5EC3C69CFE4089303B8115D1D1EA7DD4C7030642D796278F3672')throw Error('Accepted previous release changed');
const tests=JSON.parse(fs.readFileSync(path.join(out,'tests-final.json'),'utf8'));if(!tests.success)throw Error('Focused tests failed');
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision,release,bytes,sha256:releaseHash,portableBuildIdentical:true,
  originalBackup:{path:backup,sha256:backupHash},preservedAssets:[...found.values()],encodedComputerModels:encodedModels,
  bakedFoodGeometry:{path:'src/assets/home/v1.49/models/food-props.json',bytes:fs.statSync(path.join(root,'src/assets/home/v1.49/models/food-props.json')).size,sha256:await shaFile(path.join(root,'src/assets/home/v1.49/models/food-props.json')),sources:foodSources},
  tests:{passed:tests.numPassedTests,failed:tests.numFailedTests,files:tests.testResults.length}};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,revision,bytes,sha256:releaseHash,preservedAssets:found.size,foodMeshes:foodSources.length,tests:result.tests}));
