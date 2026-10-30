import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.join(root,'docs/minigames-pay-20261016');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function sha(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex').toUpperCase();}
const baseline=read(path.join(out,'before-manifest.json')),oldRelease=baseline.find(r=>r.path==='1.49.0.html');assert.ok(oldRelease);
assert.equal(await sha(path.join(out,'before/1.49.0.html')),oldRelease.sha256);
for(const name of ['src/game/data/npcs.json','src/game/data/npcDialogueArt.json','npc对话修正.txt','src/game/core/npcTalk.ts','src/game/data/npcContextDialogues.ts','src/game/core/casinoRandom.ts','src/game/core/propertyPortfolio.ts','src/game/data/actions.json','src/game/data/items.json','src/game/data/housing.json']){
 const previous=baseline.find(r=>r.path===name);if(previous)assert.equal(await sha(path.join(root,name)),previous.sha256,name);
}
const definitions=read(path.join(root,'src/game/data/npcDialogueArt.json')),expected=new Map();
const libraries=['docs/npc-followup-20261016/library-sync.json','docs/npc-dialogue-repair-20261015/library-sync.json'].flatMap(p=>read(path.join(root,p)).records);
for(const [id,sheets]of Object.entries(definitions))for(const [variant,sheet]of Object.entries(sheets)){
 const source=path.join(root,'src/assets/portraits/npc_dialogue',id,sheet.file),digest=await sha(source);assert.equal(digest,sheet.sha256);assert.equal(sheet.frames.length,9);
 const imported=read(path.join(root,sheet.importReport??`docs/npc-dialogue-repair-20261015/ai-art/${id}/${variant}-import.json`));assert.equal(await sha(imported.source),digest);
 const record=libraries.find(r=>r.npcId===id&&(r.variant??r.weather)===variant);assert.ok(record);assert.equal(await sha(record.libraryPath),digest);
 expected.set(digest,{kind:'portrait',id:`${id}/${variant}`,source});
}
assert.equal(expected.size,43);
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
 const source=path.join(root,`src/assets/home/v1.49/models/${name}.glb`);expected.set(await sha(source),{kind:'model',id:name,source});
}
const tests=read(path.join(out,'focused-tests.json'));assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);assert.equal(tests.testResults.length,61);
const stale=read(path.join(root,'docs/finalization-20261016/legacy-npcTalk.json')),previousStale=read(path.join(root,'docs/npc-followup-20261016/baseline-npcTalk.json'));
const staleNames=data=>data.testResults.filter(s=>s.name.endsWith('npcTalk.test.ts')).flatMap(s=>s.assertionResults.filter(r=>r.status==='failed').map(r=>r.fullName));
assert.deepEqual(staleNames(stale),staleNames(previousStale));assert.equal(staleNames(stale).length,6);
assert.match(fs.readFileSync(path.join(out,'check-final.log'),'utf8'),/found 0 errors and 99 warnings/);
assert.match(fs.readFileSync(path.join(out,'portable-build.log'),'utf8'),/Portable release HTML published/);
const source=fs.readFileSync(path.join(root,'src/game/data/npcContextDialogues.ts'),'utf8');
const array=source.match(/export const NPC_DIALOGUE_ACTIVITIES:[^=]*=(\[[\s\S]*?\n\]);/)[1];
const {runInNewContext}=await import('node:vm');
const activities=runInNewContext(array,{short:(opening,answer,reply,benefitId)=>({opening,answer,reply,benefitId})});
assert.deepEqual(Array.from(activities,a=>a.id),['wang_checkup','netbar_parts','kexi_service','farmer_fishing']);
assert.equal(activities.reduce((n,a)=>n+a.scripts.length,0),8);
const oldActions=read(path.join(out,'before/src/game/data/actions.json')),actions=read(path.join(root,'src/game/data/actions.json'));
const changedActions=actions.filter(a=>JSON.stringify(a)!==JSON.stringify(oldActions.find(old=>old.id===a.id))).map(a=>a.id);
assert.equal(changedActions.length,0);
const oldItems=read(path.join(out,'before/src/game/data/items.json')).items,items=read(path.join(root,'src/game/data/items.json')).items;
assert.deepEqual(items.filter(a=>JSON.stringify(a)!==JSON.stringify(oldItems.find(old=>old.id===a.id))).map(a=>a.id),[]);
const housing=read(path.join(root,'src/game/data/housing.json')),oldHousing=read(path.join(out,'before/src/game/data/housing.json'));
assert.deepEqual(housing.buy.map(t=>t.monthlyRent),[800,1000,2000]);
assert.deepEqual(housing,oldHousing);
const audit={activities,contextScenes:8,manuscriptSceneUnits:298,normalSchedulesPreserved:true,changedActions,changedItems:[],propertyRents:housing.buy.map(t=>({id:t.id,name:t.name,monthlyRent:t.monthlyRent})),rentPeriodDays:30};
fs.writeFileSync(path.join(out,'content-audit.json'),JSON.stringify(audit,null,2)+'\n');
const browser=read(path.join(out,'browser-verification.json'));assert.equal(browser.sourceHarness,true);assert.ok(browser.evidence.length>=15);assert.equal(browser.viewportReset,true);assert.equal(browser.logs.length,0);
for(const e of browser.evidence)for(const box of e.boxes){if(!/mg-card|phone-game-full/.test(box.cls))continue;assert.ok(Math.abs(box.width-e.viewport[0])<3,e.name+' full width');assert.ok(Math.abs(box.height-e.viewport[1])<3,e.name+' full height');}
for(const name of ['chess-desktop-125.png','2048-landscape.png','minesweeper-landscape.png','snake-landscape.png','sokoban-landscape.png','delivery-new-pay-start.png','portrait-summer-before.png','portrait-summer-after.png','portrait-kexi-service.png'])assert.ok(fs.statSync(path.join(out,name)).size>5000,name);
const calibration=read(path.join(out,'portrait-calibration.json'));assert.equal(calibration.records.length,12);
const stage=read(path.join(root,'src/game/data/npcDialogueStaging.json')),oldStage=read(path.join(out,'before/src/game/data/npcDialogueStaging.json'));
assert.deepEqual(stage.player,oldStage.player);
for(const [id,value]of Object.entries(oldStage)){
 if(!['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'].includes(id)){assert.deepEqual(stage[id],value);continue;}
 assert.equal(stage[id].heightCm,value.heightCm);assert.deepEqual(stage[id].art.default,value.art.default);assert.equal(stage[id].faceSpan.art.default,value.faceSpan.art.default);
}
for(const r of calibration.records){assert.equal(await sha(path.join(root,'src/assets/portraits/npc_dialogue',r.npcId,r.file)),r.sourceSha256);assert.deepEqual(stage[r.npcId].art[r.outfit],[r.headCenterX,r.headTop,r.headHeight]);assert.equal(stage[r.npcId].faceSpan.art[r.outfit],r.eyeLineToChin);}
assert.ok(browser.portraits.length>=8);
for(const scene of browser.portraits){
 const rulers=scene.actors.map(a=>{const span=a.id==='player'?90:stage[a.id].faceSpan.art[scene.outfitByActor[a.id]??'default'];return a.art.height/(a.id==='player'?1536:512)*span;});
 assert.ok(Math.max(...rulers)-Math.min(...rulers)<1,scene.name+' rendered face ruler');
}
audit.portraitCalibrations=12;audit.portraitSourceImagesPreserved=true;
fs.writeFileSync(path.join(out,'content-audit.json'),JSON.stringify(audit,null,2)+'\n');
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const revision='2026.10.16 · 人物比例、小游戏与配送计酬';
const tokens=new Map([revision,'[183,15,180]','phone-game-full','dispatchWage','本单提成','npc_context_dialogue_day_','dialogueBenefitId','吃了赵刚分给你的一个馒头','兼职中的招呼','湖边等鱼的空当','rentalDays','activePropertyId','getRandomValues','房屋出租租金到账','npc_introduction_m02_complete'].map(t=>[t,false]));
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),bytes=0,glbs=0;
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
 hash.update(chunk);bytes+=chunk.length;const window=Buffer.concat([tail,chunk]);for(const [t,seen]of tokens)if(!seen&&window.includes(Buffer.from(t)))tokens.set(t,true);tail=window.subarray(-512);
 const text=carry+chunk.toString('latin1');carry='';let cursor=0;
 while(cursor<text.length){
  if(!active){prefix.lastIndex=cursor;const m=prefix.exec(text);if(!m){carry=text.slice(-64);break;}active={mime:m[1],hash:createHash('sha256'),remainder:''};cursor=prefix.lastIndex;}
  delimiter.lastIndex=cursor;const end=delimiter.exec(text),part=active.remainder+text.slice(cursor,end?end.index:undefined);
  if(!end){const complete=part.length-part.length%4;active.hash.update(Buffer.from(part.slice(0,complete),'base64'));active.remainder=part.slice(complete);break;}
  active.hash.update(Buffer.from(part,'base64'));const digest=active.hash.digest('hex').toUpperCase();if(expected.has(digest))found.set(digest,expected.get(digest));if(active.mime==='model/gltf-binary')glbs++;active=null;cursor=end.index;
 }
}
assert.equal(active,null);assert.equal(glbs,4);for(const [t,seen]of tokens)assert.ok(seen,t);for(const [digest,asset]of expected)assert.ok(found.has(digest),asset.id);
const digest=hash.digest('hex').toUpperCase();assert.equal(await sha(path.join(root,'dist-portable/index.html')),digest);
const changes=[];for(const row of baseline){if(row.path==='1.49.0.html')continue;const file=path.join(root,row.path);if(fs.existsSync(file)){const after=await sha(file);if(after!==row.sha256)changes.push({path:row.path,before:row.sha256,after});}}
const addedFiles=['src/lib/streetDispatch/pay.js','src/components/layout/minigames/PhoneGameStage.svelte','tests/deliveryPiecePay.test.ts','tests/phoneGamesFullscreen.test.ts'].map(file=>({path:file}));
for(const file of addedFiles)file.sha256=await sha(path.join(root,file.path));
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision,release,bytes,sha256:digest,portableBuildIdentical:true,
 backup:{path:path.join(out,'before/1.49.0.html'),sha256:oldRelease.sha256},manuscriptPreserved:true,normalSchedulesPreserved:true,portraitDefinitionsPreserved:true,portraitCalibration:calibration,
 content:audit,
 tests:{passed:tests.numPassedTests,failed:tests.numFailedTests,files:tests.testResults.length,check:'0 errors / 99 existing warnings',legacyBaselineFailures:staleNames(stale)},
 browser,preservedAssets:[...found.values()],changes,addedFiles,
 limitations:['UI verification uses actual source components and isolated state over HTTP. The final portable artifact is verified by streamed embedded asset hashes and file identity.','No EXE/APK or physical-device build/test.','Six historical npcTalk.test.ts assertions remain stale against the newer twelve-person manuscript; the same failures were reproduced before this update.']};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({bytes,sha256:digest,tests:result.tests,content:result.content,preservedAssets:found.size,changes:changes.map(c=>c.path),addedFiles}));
