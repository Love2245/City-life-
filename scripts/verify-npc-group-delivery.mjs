import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd(),overlap=process.argv.includes('--overlap');
const groupOut=path.join(root,'docs/npc-group-dialogue-20261015');
const out=overlap?path.join(root,'docs/npc-group-overlap-20261015'):groupOut;
const homeOut=path.join(root,'docs/home-objects-20261015');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const shaFile=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex').toUpperCase();};
const expected=new Map();
const index=readJson(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json'));
for(const row of index.records){const h=await shaFile(row.source);if(h!==row.sha256||await shaFile(row.libraryPath)!==h)throw Error(`Portrait/library changed: ${row.npcId}/${row.weather}`);expected.set(h,{kind:'portrait',id:`${row.npcId}/${row.weather}`});}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
  const source=path.join(root,`src/assets/home/v1.49/models/${name}.glb`),h=await shaFile(source),library=path.resolve(root,'../../素材库/家居家具物件模型/Kenney家具套件（CC0）',`${name}.glb`);
  if(await shaFile(library)!==h)throw Error(`Computer model library mismatch: ${name}`);expected.set(h,{kind:'computer-model',id:name});
}
const foodPath=path.join(root,'src/assets/home/v1.49/models/food-props.json'),props=readJson(foodPath);
const previous=readJson(path.join(homeOut,'verification-final.json'));
if(await shaFile(foodPath)!==previous.bakedFoodGeometry.sha256)throw Error('Accepted home food geometry changed');
const foodSources=[];
for(const [name,data]of Object.entries(props)){
  const file=path.join(homeOut,`kenney-food-kit/Models/GLB format/${name}.glb`),library=path.resolve(root,'../../素材库/家居家具物件模型/Kenney厨房餐具（CC0）/模型',`${name}.glb`),sha256=await shaFile(file);
  if(sha256!==data.sourceSha256.toUpperCase()||await shaFile(library)!==sha256)throw Error(`Baked prop source mismatch: ${name}`);
  foodSources.push({name,sha256,file,library,triangles:data.parts.reduce((n,p)=>n+p.positions.length/9,0)});
}
const revision=overlap?'2026.10.15 · 三人对话站位收拢':'2026.10.15 · 三人同场对话';
const tokens=new Map([revision,'fan_siblings_supper','group-conversation','三人一起聊聊','dining-cup','kitchen-sink-bowl',...Object.values(props).map(p=>p.sourceSha256)].map(t=>[t,false]));
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),encodedModels=0,bytes=0;
// The portable file exceeds V8's maximum string size. Scan/decode as a stream.
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
for(const [token,seen]of tokens)if(!seen)throw Error(`Portable token missing: ${token}`);
for(const [digest,asset]of expected)if(!found.has(digest))throw Error(`Portable asset missing or changed: ${asset.id}`);
if(encodedModels!==4)throw Error(`Expected four preserved computer GLBs, got ${encodedModels}`);
const releaseHash=hash.digest('hex').toUpperCase();
if(await shaFile(path.join(root,'dist-portable/index.html'))!==releaseHash)throw Error('Published HTML differs from build');
const backup=path.join(root,overlap?'待清理文件/三人站位收拢前_20261015/1.49.0.html':'待清理文件/多人对话前_20261015/1.49.0.html'),backupHash=await shaFile(backup);
const expectedBackup=overlap?'C45A650D56D41C171519834A97B30E371E920FB1688991763325771FD3741082':'80321BF9F6886426F4CB644CC8EC4AC88E1B4808DC9C3851EF81702CE2DF8101';
if(backupHash!==expectedBackup)throw Error('Accepted previous release changed');
const tests=readJson(path.join(out,overlap?'tests.json':'tests-final.json'));if(!tests.success)throw Error('Focused tests failed');
const baseline=readJson(path.join(groupOut,'legacy-comparison.json'));if(!baseline.sameFailures)throw Error('Legacy failures differ from baseline');
const browser=readJson(path.join(out,'browser-desktop.json'));
for(const [index,actors]of [browser.a,browser.b].entries())for(const [slot,actor]of actors.entries()){
  const speaking=slot===index;
  if(actor.speaking!==String(speaking)||actor.front!==String(speaking)||actor.opacity!==(speaking?'1':'0.76')||actor.z!==(speaking?'4':'2'))throw Error('Browser speaker layer/opacity differs from specification');
  if(JSON.stringify(actor.rect)!==JSON.stringify(browser.a[slot].rect)||actor.style!==browser.a[slot].style)throw Error('Browser speaker switch changes actor size or position');
}
if(overlap){
  const oldBrowser=readJson(path.join(groupOut,'browser-desktop.json'));
  const gap=actors=>actors[1].rect.left-actors[0].rect.left;
  const ratio=gap(browser.a)/gap(oldBrowser.a);
  if(!(ratio>.6&&ratio<.7))throw Error('Expected about one third less distance between NPCs');
  const oldSource=readJson(path.join(groupOut,'verification-final.json')).sourceFiles;
  for(const row of oldSource)if(!['src/components/layout/NpcTalkModal.svelte','src/version.ts'].includes(row.file)&&await shaFile(path.join(root,row.file))!==row.sha256)throw Error(`Conversation behavior changed: ${row.file}`);
}
const masks=readJson(path.join(groupOut,'browser-mixed-masks.json'));
if(masks[0]?.mask!=='mosaic'||masks[1]?.mask!=='none')throw Error('Independent face reveal not verified');
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision,release,bytes,sha256:releaseHash,portableBuildIdentical:true,
  originalBackup:{path:backup,sha256:backupHash},preservedAssets:[...found.values()],encodedComputerModels:encodedModels,
  preservedHomeGeometry:{path:foodPath,sha256:await shaFile(foodPath),sources:foodSources},
  tests:{passed:tests.numPassedTests,failed:tests.numFailedTests,files:tests.testResults.length},legacyBaseline:{passed:baseline.currentPassed,failed:baseline.currentFailed,sameFailures:baseline.sameFailures},
  browser:{scope:'real dialogue component via isolated source HTTP harness; no player save accessed',viewports:[[1280,720],[393,852],[852,393]],stableActorBoxes:true,speakerOpacity:1,listenerOpacity:.76,independentFaceReveal:true,...(overlap?{closerNpcSpacing:true,headVisibilityVisuallyChecked:true}:{} )},
  sourceFiles:['src/components/layout/NpcTalkModal.svelte','src/game/core/npcTalk.ts','src/game/core/npcDialoguePlayback.ts','src/game/core/npcDialogueStaging.ts','src/game/data/npcDialogueStaging.json','src/game/data/npcGroupScenes.ts','src/version.ts'].map(file=>({file,sha256:null}))};
for(const file of result.sourceFiles)file.sha256=await shaFile(path.join(root,file.file));
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,revision,bytes,sha256:releaseHash,preservedAssets:found.size,foodMeshes:foodSources.length,tests:result.tests,legacyBaseline:result.legacyBaseline}));
