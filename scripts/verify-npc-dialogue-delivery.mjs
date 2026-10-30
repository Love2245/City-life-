import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd();
const index=JSON.parse(fs.readFileSync(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json'),'utf8'));
const shaFile=async file=>{const hash=createHash('sha256');for await(const data of fs.createReadStream(file))hash.update(data);return hash.digest('hex').toUpperCase();};
const expected=new Map();
for(const row of index.records){
  const source=await shaFile(row.source),library=await shaFile(row.libraryPath);
  if(source!==row.sha256||library!==source)throw Error(`Portrait source/library mismatch: ${row.npcId}/${row.weather}`);
  expected.set(source,{kind:'portrait',id:`${row.npcId}/${row.weather}`});
}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
  const file=path.join(root,`src/assets/home/v1.49/models/${name}.glb`);
  const hash=await shaFile(file),library=path.resolve(root,'../../素材库/家居家具物件模型/Kenney家具套件（CC0）',`${name}.glb`);
  if(hash!==await shaFile(library))throw Error(`Model library mismatch: ${name}`);
  expected.set(hash,{kind:'model',id:name});
}
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
const revision='2026.10.15 · NPC立绘与居家电脑更新',revisionBytes=Buffer.from(revision);
let active=null,carry='',byteTail=Buffer.alloc(0),hasRevision=false,encodedModels=0,bytes=0;
// Stream both the complete-file hash and individual data URI payloads. The HTML
// exceeds V8's maximum string size, so it must never be read as one text string.
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
  hash.update(chunk);bytes+=chunk.length;
  const window=Buffer.concat([byteTail,chunk]);hasRevision ||= window.includes(revisionBytes);byteTail=window.subarray(-256);
  const text=carry+chunk.toString('latin1');carry='';let cursor=0;
  while(cursor<text.length){
    if(!active){
      prefix.lastIndex=cursor;const match=prefix.exec(text);
      if(!match){carry=text.slice(-64);break;}
      active={mime:match[1],hash:createHash('sha256'),remainder:''};cursor=prefix.lastIndex;
    }
    delimiter.lastIndex=cursor;const end=delimiter.exec(text);
    const part=active.remainder+text.slice(cursor,end?end.index:undefined);
    if(!end){const complete=part.length-part.length%4;active.hash.update(Buffer.from(part.slice(0,complete),'base64'));active.remainder=part.slice(complete);break;}
    active.hash.update(Buffer.from(part,'base64'));
    const digest=active.hash.digest('hex').toUpperCase();if(expected.has(digest))found.set(digest,expected.get(digest));
    if(active.mime==='model/gltf-binary')encodedModels++;
    active=null;cursor=end.index;
  }
}
if(active)throw Error('Truncated final data URI');
if(!hasRevision)throw Error('Current revision missing from portable artifact');
for(const [digest,asset]of expected)if(!found.has(digest))throw Error(`Portable payload missing or changed: ${asset.id}`);
if(encodedModels!==4)throw Error(`Expected 4 embedded GLB payloads, found ${encodedModels}`);
const releaseHash=hash.digest('hex').toUpperCase();
if(await shaFile(path.join(root,'dist-portable/index.html'))!==releaseHash)throw Error('Published HTML differs from portable build');
const backup=path.join(root,'待清理文件/NPC对话立绘AI重绘前_20261015/1.49.0.html');
const backupHash=await shaFile(backup);
if(backupHash!=='B8087B6336EB10E4A86F69395FAD905ACBB5268C27DC4B166249C4CA0E09FA5E')throw Error('Original portable backup changed');
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision,release,bytes,sha256:releaseHash,
  portableBuildIdentical:true,portraitsVerified:[...found.values()].filter(a=>a.kind==='portrait').length,
  modelsVerified:[...found.values()].filter(a=>a.kind==='model').length,encodedModels,
  staging:index.staging,originalBackup:{path:backup,sha256:backupHash},embeddedAssets:[...found.values()]};
fs.writeFileSync(path.join(root,'docs/npc-dialogue-repair-20261015/verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,bytes,sha256:releaseHash,portraitsVerified:result.portraitsVerified,modelsVerified:result.modelsVerified,portableBuildIdentical:true}));
