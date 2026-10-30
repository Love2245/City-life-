import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.join(root,'docs/npc-followup-20261016');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function sha(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex').toUpperCase();}
const baseline=read(path.join(out,'before-manifest.json'));
const oldRelease=baseline.find(row=>row.path==='1.49.0.html');assert.ok(oldRelease);
assert.equal(await sha(path.join(out,'before/1.49.0.html')),oldRelease.sha256);
const oldNpcs=read(path.join(out,'before/src/game/data/npcs.json')),npcs=read(path.join(root,'src/game/data/npcs.json'));
const normalize=npc=>({...npc,weeklySchedule:npc.weeklySchedule?.map(row=>{const copy={...row};delete copy.outfitContext;return copy;})});
for(const npc of npcs){const old=oldNpcs.find(n=>n.id===npc.id);assert.deepEqual(normalize(npc),normalize(old));if(npc.id!=='npc_fan_kejie')assert.deepEqual(npc,old);}
assert.equal(npcs.find(n=>n.id==='npc_fan_kejie').weeklySchedule.find(row=>row.locationId==='boyue_nightclub').outfitContext,'casual');
assert.equal(await sha(path.join(root,'npc对话修正.txt')),await sha(path.join(out,'before/npc对话修正.txt')));
const definitions=read(path.join(root,'src/game/data/npcDialogueArt.json')),oldDefinitions=read(path.join(out,'before/src/game/data/npcDialogueArt.json'));
for(const [id,sheets]of Object.entries(oldDefinitions))for(const [variant,sheet]of Object.entries(sheets))assert.deepEqual(definitions[id][variant],sheet);
assert.equal(Object.values(definitions).reduce((sum,sheets)=>sum+Object.keys(sheets).length,0),43);
assert.ok(!definitions.npc_fan_kejie.service);
const library=read(path.join(out,'library-sync.json'));assert.equal(library.records.length,12);
const expected=new Map();
for(const [id,sheets]of Object.entries(definitions))for(const [variant,sheet]of Object.entries(sheets)){
 const source=path.join(root,'src/assets/portraits/npc_dialogue',id,sheet.file),digest=await sha(source);assert.equal(digest,sheet.sha256);
 const imported=read(path.join(root,sheet.importReport??`docs/npc-dialogue-repair-20261015/ai-art/${id}/${variant}-import.json`));
 assert.equal(await sha(imported.source),digest);assert.equal(sheet.frames.length,9);
 const record=library.records.find(row=>row.npcId===id&&row.variant===variant)??read(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json')).records.find(row=>row.npcId===id&&row.weather===variant);
 assert.ok(record);assert.equal(await sha(record.libraryPath),digest);
 expected.set(digest,{kind:'portrait',id:`${id}/${variant}`,source});
}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
 const source=path.join(root,`src/assets/home/v1.49/models/${name}.glb`),digest=await sha(source);expected.set(digest,{kind:'model',id:name,source});
}
const tests=read(path.join(out,'focused-tests.json'));assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);
const stale=read(path.join(out,'baseline-npcTalk.json'));assert.equal(stale.numFailedTests,6);
const check=fs.readFileSync(path.join(out,'check.log'),'utf8');assert.match(check,/found 0 errors/);
assert.match(fs.readFileSync(path.join(out,'portable-build.log'),'utf8'),/Portable release HTML published/);
const browser=read(path.join(out,'browser-verification.json'));assert.equal(browser.sourceHarness,true);assert.ok(browser.evidence.length>=6);
for(const file of ['dual-desktop.png','dual-phone-portrait.png','dual-phone-landscape.png','kejie-autumn-no-hat.png','jack-layered-winter.png','kexi-fifth-upset.png'])assert.ok(fs.statSync(path.join(out,file)).size>5000,file);
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const tokens=new Map(['2026.10.16 · 闲聊轮换与季节穿搭','npc_remaster_daily_day_','你不会是等着我们家小妹来吧','比闲聊更重要','拿我打趣','npc_introduction_m02_complete'].map(t=>[t,false]));
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),bytes=0,glbs=0;
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
 hash.update(chunk);bytes+=chunk.length;const window=Buffer.concat([tail,chunk]);for(const [token,seen]of tokens)if(!seen&&window.includes(Buffer.from(token)))tokens.set(token,true);tail=window.subarray(-512);
 const text=carry+chunk.toString('latin1');carry='';let cursor=0;
 while(cursor<text.length){
  if(!active){prefix.lastIndex=cursor;const m=prefix.exec(text);if(!m){carry=text.slice(-64);break;}active={mime:m[1],hash:createHash('sha256'),remainder:''};cursor=prefix.lastIndex;}
  delimiter.lastIndex=cursor;const end=delimiter.exec(text),part=active.remainder+text.slice(cursor,end?end.index:undefined);
  if(!end){const complete=part.length-part.length%4;active.hash.update(Buffer.from(part.slice(0,complete),'base64'));active.remainder=part.slice(complete);break;}
  active.hash.update(Buffer.from(part,'base64'));const digest=active.hash.digest('hex').toUpperCase();if(expected.has(digest))found.set(digest,expected.get(digest));if(active.mime==='model/gltf-binary')glbs++;active=null;cursor=end.index;
 }
}
assert.equal(active,null);assert.equal(glbs,4);for(const [t,seen]of tokens)assert.ok(seen,t);for(const [digest,asset]of expected)assert.ok(found.has(digest),asset.id);
const releaseHash=hash.digest('hex').toUpperCase();assert.equal(await sha(path.join(root,'dist-portable/index.html')),releaseHash);
const changes=[];for(const row of baseline){if(row.path==='1.49.0.html')continue;const file=path.join(root,row.path);if(fs.existsSync(file)){const digest=await sha(file);if(digest!==row.sha256)changes.push({path:row.path,before:row.sha256,after:digest});}}
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision:'2026.10.16 · 闲聊轮换与季节穿搭',release,bytes,sha256:releaseHash,portableBuildIdentical:true,
 backup:{path:path.join(out,'before/1.49.0.html'),sha256:oldRelease.sha256},normalSchedulesPreserved:true,kejieNightclubOutfit:'casual',manuscriptPreserved:true,
 artwork:{totalSheets:43,addedOutfitSheets:12,completeExpressions:387,preservedExistingSheets:31,librarySync:path.join(out,'library-sync.json')},
 tests:{passed:tests.numPassedTests,failed:tests.numFailedTests,files:tests.testResults.length,check:'0 errors / 100 existing warnings',legacyBaselineFailures:stale.testResults.flatMap(t=>t.assertionResults.filter(r=>r.status==='failed').map(r=>r.fullName))},
 browser,preservedAssets:[...found.values()],changes,
 limitations:['UI checks use real source components and isolated test state over HTTP; portable HTML checked by streamed embedded hashes and file identity.','No EXE/APK or physical-device build/test.','The legacy npcTalk.test.ts retains six failures reproduced against the before snapshot; current acceptance suites pass.']};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({bytes,sha256:releaseHash,tests:result.tests,artwork:result.artwork,assets:found.size,changes:changes.length}));
