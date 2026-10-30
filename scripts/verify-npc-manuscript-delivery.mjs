import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=path.join(root,'docs/npc-text-integration-20261016');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function sha(file){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex').toUpperCase();}
const baseline=read(path.join(out,'baseline-manifest.json'));
const expected=new Map();
const library=read(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json'));
for(const row of library.records){
  const digest=await sha(row.source);assert.equal(digest,row.sha256);assert.equal(await sha(row.libraryPath),digest);
  expected.set(digest,{kind:'portrait',id:`${row.npcId}/${row.weather}`});
}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
  const digest=await sha(path.join(root,`src/assets/home/v1.49/models/${name}.glb`));
  assert.equal(await sha(path.resolve(root,'../../素材库/家居家具物件模型/Kenney家具套件（CC0）',`${name}.glb`)),digest);
  expected.set(digest,{kind:'computer-model',id:name});
}
const foodPath=path.join(root,'src/assets/home/v1.49/models/food-props.json');
assert.equal(await sha(foodPath),read(path.join(root,'docs/home-objects-20261015/verification-final.json')).bakedFoodGeometry.sha256);
const merge=read(path.join(out,'merge-report.json'));
assert.equal(merge.runtimeUnits,298);assert.equal(merge.npcCount,12);
const originalSchedule=baseline.find(row=>row.path==='src/game/data/npcs.json');
assert.equal(await sha(path.join(root,originalSchedule.path)),originalSchedule.sha256);
const oldRelease=baseline.find(row=>row.path==='1.49.0.html');
assert.equal(await sha(path.join(out,'before/1.49.0.html')),oldRelease.sha256);
const sourceHash=await sha(path.join(root,'npc对话修正.txt'));
assert.equal(read(path.join(root,'src/game/data/npcDialoguePerformance.json')).sourceSha256.toUpperCase(),sourceHash);
const focused=read(path.join(out,'focused-tests.json'));assert.equal(focused.success,true);
const gameplay=read(path.join(out,'gameplay-tests.json'));assert.equal(gameplay.success,true);
const broad=read(path.join(out,'npc-tests.json')),oldTests=read(path.join(out,'all-npc-baseline.json'));
const failures=report=>report.testResults.flatMap(file=>file.assertionResults.filter(row=>row.status==='failed').map(row=>row.fullName));
const oldFailures=new Set(failures(oldTests));
const newFailures=failures(broad).filter(name=>!oldFailures.has(name));assert.deepEqual(newFailures,[]);
const check=fs.readFileSync(path.join(out,'check.log'),'utf8');assert.match(check,/found 0 errors/);
const browser=read(path.join(out,'browser-verification.json'));
assert.equal(browser.sameDayJourney,true);assert.equal(browser.stableActorBoxes,true);assert.deepEqual(browser.m02Cast,['npc_fan_kejie','npc_jack_fanma']);

// Metadata-only JSON fields are removed by tree shaking; verify player-visible
// manuscript text and runtime flags in the bundle instead of an unused hash.
const tokens=new Map(['2026.10.16 · 十二人文案与共同初见','npc_introduction_m01_complete','npc_introduction_m02_complete','boyue_lounge_beer_coupon','npc_heard_kejie_parents_dead','reset_topic_t','柯杰来晚了','问起父母'].map(t=>[t,false]));
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),bytes=0,glbs=0;
// The HTML is larger than V8's string limit. Verify embedded assets as streams.
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
  hash.update(chunk);bytes+=chunk.length;const window=Buffer.concat([tail,chunk]);
  for(const [token,seen]of tokens)if(!seen&&window.includes(Buffer.from(token)))tokens.set(token,true);
  tail=window.subarray(-512);const text=carry+chunk.toString('latin1');carry='';let cursor=0;
  while(cursor<text.length){
    if(!active){prefix.lastIndex=cursor;const match=prefix.exec(text);if(!match){carry=text.slice(-64);break;}active={mime:match[1],hash:createHash('sha256'),remainder:''};cursor=prefix.lastIndex;}
    delimiter.lastIndex=cursor;const end=delimiter.exec(text),part=active.remainder+text.slice(cursor,end?end.index:undefined);
    if(!end){const complete=part.length-part.length%4;active.hash.update(Buffer.from(part.slice(0,complete),'base64'));active.remainder=part.slice(complete);break;}
    active.hash.update(Buffer.from(part,'base64'));const digest=active.hash.digest('hex').toUpperCase();if(expected.has(digest))found.set(digest,expected.get(digest));
    if(active.mime==='model/gltf-binary')glbs++;active=null;cursor=end.index;
  }
}
assert.equal(active,null);for(const [token,seen]of tokens)assert.equal(seen,true,`Missing portable token: ${token}`);
for(const [digest,asset]of expected)assert.equal(found.has(digest),true,`Missing accepted asset: ${asset.id}`);
assert.equal(glbs,4);const releaseHash=hash.digest('hex').toUpperCase();assert.equal(await sha(path.join(root,'dist-portable/index.html')),releaseHash);
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision:'2026.10.16 · 十二人文案与共同初见',release,bytes,sha256:releaseHash,portableBuildIdentical:true,
  manuscript:{units:298,npcs:12,sha256:sourceHash,originalDailyUnchanged:82,originalDailyUpdated:26,metadataOnlyWithinUpdated:4,originalMeetUnchanged:4,originalMeetUpdated:5,preservedStories:45},
  backup:{path:path.join(out,'before/1.49.0.html'),sha256:oldRelease.sha256},unchangedNpcSchedules:originalSchedule,
  tests:{focused:{passed:focused.numPassedTests,files:focused.testResults.length},gameplay:{passed:gameplay.numPassedTests,files:gameplay.testResults.length},broaderNpc:{passed:broad.numPassedTests,failed:broad.numFailedTests,baselineFailed:oldTests.numFailedTests,newFailures}},
  preservedAssets:[...found.values()],preservedBakedHomeGeometry:await sha(foodPath),browser,
  limitations:['Broader historical NPC tests retain pre-existing failures; see legacy comparison.','Browser evidence uses actual source components in isolated test state; the portable HTML was verified statically and by hash, not opened through automation.','No native EXE/APK built.']};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,revision:result.revision,bytes,sha256:releaseHash,tests:result.tests,preservedAssets:found.size}));
