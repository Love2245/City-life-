import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=path.join(root,'docs/npc-proportions-20261016');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function sha(file){const hash=createHash('sha256');for await(const b of fs.createReadStream(file))hash.update(b);return hash.digest('hex').toUpperCase();}
const baseline=read(path.join(out,'before-manifest.json'));
const oldRelease=baseline.find(r=>r.path==='1.49.0.html');
assert.equal(await sha(path.join(out,'before/1.49.0.html')),oldRelease.sha256);
const changes=[];
for(const row of baseline){
 if(row.path==='1.49.0.html')continue;
 const file=path.join(root,row.path);assert.ok(fs.existsSync(file),'Missing preserved file '+row.path);
 const after=await sha(file);if(after!==row.sha256)changes.push({path:row.path,before:row.sha256,after});
}
assert.deepEqual(changes.map(r=>r.path).sort(),[
 'src/game/core/npcDialogueStaging.ts','src/game/data/npcDialogueStaging.json','src/version.ts','tests/npcDialogueStaging.test.ts',
].sort());

const definitions=read(path.join(root,'src/game/data/npcDialogueArt.json'));
const stage=read(path.join(root,'src/game/data/npcDialogueStaging.json'));
const oldStage=read(path.join(out,'before/src/game/data/npcDialogueStaging.json'));
assert.deepEqual(stage.player,oldStage.player);
for(const [id,actor]of Object.entries(stage))assert.equal(actor.heightCm,oldStage[id].heightCm,id+' preserved height');
for(const id of ['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'])assert.deepEqual(stage[id],oldStage[id]);
const measurements=read(path.join(out,'calibration-measurements.json'));
assert.equal(measurements.added.length,28);
for(const r of measurements.added){assert.equal(stage[r.npcId].faceSpan.art[r.outfit],r.chinY-r.eyeY);assert.deepEqual(stage[r.npcId].art[r.outfit],r.head);}

const expected=new Map(),variants=[];
const libraries=['docs/npc-followup-20261016/library-sync.json','docs/npc-dialogue-repair-20261015/library-sync.json'].flatMap(p=>read(path.join(root,p)).records);
for(const [id,sheets]of Object.entries(definitions))for(const [outfit,sheet]of Object.entries(sheets)){
 assert.ok(Object.hasOwn(stage[id].art,outfit));assert.ok(Object.hasOwn(stage[id].faceSpan.art,outfit));assert.equal(sheet.frames.length,9);
 assert.ok(stage[id].faceSpan.art[outfit]>0);
 const source=path.join(root,'src/assets/portraits/npc_dialogue',id,sheet.file),digest=await sha(source);
 assert.equal(digest,sheet.sha256);
 const imported=read(path.join(root,sheet.importReport??`docs/npc-dialogue-repair-20261015/ai-art/${id}/${outfit}-import.json`));
 assert.equal(await sha(imported.source),digest);
 const record=libraries.find(r=>r.npcId===id&&(r.variant??r.weather)===outfit);assert.ok(record);assert.equal(await sha(record.libraryPath),digest);
 variants.push({npcId:id,outfit,file:sheet.file,sha256:digest,faceSpan:stage[id].faceSpan.art[outfit]});
 expected.set(digest,{kind:'portrait',id:`${id}/${outfit}`,source});
}
assert.equal(variants.length,43);assert.equal(Object.keys(definitions).length,12);
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
 const source=path.join(root,`src/assets/home/v1.49/models/${name}.glb`);expected.set(await sha(source),{kind:'model',id:name,source});
}

const tests=read(path.join(out,'focused-tests.json'));
assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,761);assert.equal(tests.testResults.length,61);
assert.match(fs.readFileSync(path.join(out,'check.log'),'utf8'),/found 0 errors and 99 warnings/);
assert.match(fs.readFileSync(path.join(out,'portable-build.log'),'utf8'),/Portable release HTML published/);
const boards=read(path.join(out,'board-geometry-existing.json'));
for(const file of fs.readdirSync(out).filter(f=>f.endsWith('.board.json')))boards.push(...read(path.join(out,file)));
assert.equal(boards.length,43);assert.equal(new Set(boards.map(r=>r.npcId+'/'+r.outfit)).size,43);
const scenes=fs.readdirSync(out).filter(f=>f.endsWith('.scene.json')).map(f=>read(path.join(out,f)));
assert.ok(scenes.length>=4);
function faceSize(actor,outfit){return actor.art.height/(actor.id==='player'?1536:512)*(actor.id==='player'?90:stage[actor.id].faceSpan.art[outfit]);}
let maxFaceDifference=0;
for(const board of boards){
 const sizes=board.actors.map(a=>faceSize(a,board.outfit)),difference=Math.max(...sizes)-Math.min(...sizes);
 maxFaceDifference=Math.max(maxFaceDifference,difference);assert.ok(difference<.1,board.npcId+'/'+board.outfit+' face ruler');
 for(const a of board.actors)assert.ok(Math.abs(a.art.width/a.art.height-2/3)<.001,'uniform canvas scale');
}
for(const scene of scenes){
 assert.ok(scene.actors.length>=2);
 const sizes=scene.actors.map(a=>{const variant=a.id==='player'?undefined:variants.find(v=>v.npcId===a.id&&v.file===a.source)?.outfit;assert.ok(a.id==='player'||variant);return faceSize(a,variant);});
 assert.ok(Math.max(...sizes)-Math.min(...sizes)<.1,scene.name+' rendered face ruler');
 for(const a of scene.actors)assert.ok(a.art.y+a.art.height>=a.slot.y+a.slot.height-1,scene.name+' canvas reaches dialogue edge');
}
const jackScene=scenes.find(s=>s.name==='bar-jack-speaking-desktop'),kejieScene=scenes.find(s=>s.name==='bar-kejie-speaking-desktop');
for(const id of ['player','npc_fan_kejie','npc_jack_fanma']){
 assert.deepEqual(jackScene.actors.find(a=>a.id===id).art,kejieScene.actors.find(a=>a.id===id).art,id+' speaker switch geometry');
}
assert.equal(jackScene.actors.find(a=>a.id==='npc_jack_fanma').zIndex,'4');assert.equal(jackScene.actors.find(a=>a.id==='npc_fan_kejie').opacity,'0.76');
assert.equal(kejieScene.actors.find(a=>a.id==='npc_fan_kejie').zIndex,'4');assert.equal(kejieScene.actors.find(a=>a.id==='npc_jack_fanma').opacity,'0.76');
const visualScreenshots=fs.readdirSync(out).filter(f=>f.endsWith('.png'));
for(const id of Object.keys(definitions))assert.ok(visualScreenshots.includes(id+'.png'),id+' all-outfit screenshot');
for(const file of ['wang-game-desktop.png','siblings-game-desktop.png','wang-game-landscape-70.png','bar-jack-speaking-landscape.png','bar-kejie-speaking-landscape.png','siblings-narrow-browser.png','phone-portrait-rotation-gate.png'])assert.ok(visualScreenshots.includes(file));
const environment=read(path.join(out,'browser-environment.json'));
assert.equal(environment.viewportReset,true);assert.equal(environment.logs.length,0);
const browser={...environment,boards,geometryScenes:scenes,visualScreenshots,maxBoardFaceDifferencePx:maxFaceDifference};
fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify(browser,null,2)+'\n');

// Stream the 1 GiB portable page rather than allocating the full HTML/base64 data.
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const revision='2026.10.16 · 全员立绘比例复核';
const tokens=new Map([revision,'全员比例·10月16日','phone-game-full','dispatchWage','dialogueBenefitId','npc_introduction_m02_complete','getRandomValues','activePropertyId'].map(t=>[t,false]));
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
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision,release,bytes,sha256:digest,portableBuildIdentical:true,
 backup:{path:path.join(out,'before/1.49.0.html'),sha256:oldRelease.sha256},changes,
 preservedOtherSnapshotFiles:baseline.length-1-changes.length,allDialogueSchedulesGameplayPreserved:true,
 portraitCalibration:{characters:12,outfits:43,frames:387,newOutfitRulers:28,preservedTrioOutfitRulers:15,uniformWholeImageScaling:true,sourceImagesAndLibraryPreserved:true,variants},
 tests:{files:61,passed:761,failed:0,checkErrors:0,existingWarnings:99,scope:'Focused regression; historical six obsolete manuscript assertions in npcTalk.test.ts remain outside this selection.'},
 browser:{boardOutfits:43,geometryScenes:scenes.length,visualScreenshots:visualScreenshots.length,maxBoardFaceDifferencePx:maxFaceDifference,viewportReset:true,pePortraitShowsRotationGate:true},
 embeddedVerified:[...found.values()],validationBoundary:'Browser checks use the actual source components in isolated fixtures. Portable data and code are verified by build, hashes and embedded assets; no native EXE/APK or player-save playthrough.'};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({release,bytes,sha256:digest,outfits:43,newRulers:28,tests:result.tests,browser:result.browser,changedFiles:changes.map(r=>r.path)},null,2));
