import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=path.join(root,'docs/npc-polish-20261016');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function sha(file){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex').toUpperCase();}
const baseline=read(path.join(out,'before-manifest.json'));
const oldNpcs=read(path.join(out,'before/src/game/data/npcs.json')),npcs=read(path.join(root,'src/game/data/npcs.json'));
for(const npc of npcs){
  const old=oldNpcs.find(row=>row.id===npc.id);assert.ok(old);assert.deepEqual(npc.weeklySchedule,old.weeklySchedule);
  const {desc,...rest}=npc,{desc:oldDesc,...oldRest}=old;assert.deepEqual(rest,oldRest);
  if(!['npc_fan_kejie','npc_fan_kexi'].includes(npc.id))assert.equal(desc,oldDesc);
}
const oldRelease=baseline.find(row=>row.path==='1.49.0.html');
assert.equal(await sha(path.join(out,'before/1.49.0.html')),oldRelease.sha256);
const sourceHash=await sha(path.join(root,'npc对话修正.txt')),performance=read(path.join(root,'src/game/data/npcDialoguePerformance.json'));
assert.equal(performance.sourceSha256.toUpperCase(),sourceHash);
const oldPerformance=read(path.join(out,'before/src/game/data/npcDialoguePerformance.json'));
const oldRows=new Map(oldPerformance.rows.map(row=>[row.npcId+'\0'+row.text,row]));
const emotionDiff=performance.rows.flatMap(row=>{const previous=oldRows.get(row.npcId+'\0'+row.text);return previous&&previous.category!==row.category?[{npcId:row.npcId,text:row.text,previous:previous.category,category:row.category}]:[];});
fs.writeFileSync(path.join(out,'emotion-diff.json'),JSON.stringify(emotionDiff,null,2)+'\n');
const perNpc=npcs.filter(npc=>['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'].includes(npc.id)).map(npc=>({id:npc.id,name:npc.name,
  schedule:npc.weeklySchedule,performanceParagraphs:performance.rows.filter(row=>row.npcId===npc.id).length,
  categories:Object.fromEntries([...new Set(performance.rows.filter(row=>row.npcId===npc.id).map(row=>row.category))].map(category=>[category,performance.rows.filter(row=>row.npcId===npc.id&&row.category===category).length]))}));
const changes=[];for(const row of baseline){if(row.path==='1.49.0.html')continue;const file=path.join(root,row.path);if(fs.existsSync(file)){const hash=await sha(file);if(hash!==row.sha256)changes.push({path:row.path,before:row.sha256,after:hash});}}
fs.writeFileSync(path.join(out,'changed-files.json'),JSON.stringify(changes,null,2)+'\n');
const focused=read(path.join(out,'focused-tests.json'));assert.equal(focused.success,true);assert.equal(focused.numFailedTests,0);
const work=read(path.join(out,'work-regression.json'));assert.equal(work.success,true);assert.equal(work.numFailedTests,0);
const check=fs.readFileSync(path.join(out,'check.log'),'utf8');assert.match(check,/found 0 errors/);
assert.match(fs.readFileSync(path.join(out,'build.log'),'utf8'),/built in/);
assert.match(fs.readFileSync(path.join(out,'portable-build.log'),'utf8'),/Portable release HTML published/);
const browser=read(path.join(out,'browser-verification.json'));assert.equal(browser.sourceHarness,true);
for(const [npcId,category] of [['npc_fan_kejie','happy'],['npc_jack_fanma','angry']]){
  const row=browser.evidence.find(row=>row.case===npcId+' D01 own speech');assert.ok(row);
  assert.equal(row.data.actors[0].category,category);assert.equal(row.data.actors[0].mask,'none');
}
const sister=browser.evidence.find(row=>row.case==='Kexi D01 actual dialogue');assert.equal(sister.data.actors[0].category,'sad');
const advanced=browser.evidence.find(row=>row.case==='Advanced room UI');assert.deepEqual(advanced.data,{min:'1000',max:'50000',value:'50000'});
assert.ok(browser.evidence.find(row=>row.case==='50000 chip poker completed through real UI').data.includes('返还200000筹码'));
const relation=browser.evidence.find(row=>row.case==='Relationship detail actions removed');for(const label of ['打电话','送礼','蹭住','借钱'])assert.ok(!relation.data.buttons.some(button=>button.includes(label)));

// 验证已认可的31套整身表情图、家具模型及素材库原件，没有重新生成或修改美术。
const expected=new Map(),library=read(path.join(root,'docs/npc-dialogue-repair-20261015/library-sync.json'));
for(const row of library.records){const digest=await sha(row.source);assert.equal(digest,row.sha256);assert.equal(await sha(row.libraryPath),digest);expected.set(digest,{kind:'portrait',id:`${row.npcId}/${row.weather}`});}
for(const name of ['computerScreen','computerKeyboard','computerMouse','chairDesk']){
  const digest=await sha(path.join(root,`src/assets/home/v1.49/models/${name}.glb`));
  assert.equal(await sha(path.resolve(root,'../../素材库/家居家具物件模型/Kenney家具套件（CC0）',`${name}.glb`)),digest);expected.set(digest,{kind:'computer-model',id:name});
}
const foodPath=path.join(root,'src/assets/home/v1.49/models/food-props.json');
assert.equal(await sha(foodPath),read(path.join(root,'docs/home-objects-20261015/verification-final.json')).bakedFoodGeometry.sha256);
// HTML 约1GB，逐块扫描、解码和计算摘要，不能整体读入V8字符串。
const tokens=new Map(['2026.10.16 · 清晰表情与公平牌桌','npc_introduction_m01_complete','npc_introduction_m02_complete','boyue_lounge_beer_coupon','npc_heard_kejie_parents_dead','新手场','高级场','平局分池','我是他妹妹'].map(token=>[token,false]));
const release=path.join(root,'1.49.0.html'),hash=createHash('sha256'),found=new Map();
const prefix=/data:(image\/png|model\/gltf-binary);base64,/g,delimiter=/[^A-Za-z0-9+/=]/g;
let active=null,carry='',tail=Buffer.alloc(0),bytes=0,glbs=0;
for await(const chunk of fs.createReadStream(release,{highWaterMark:1024*1024})){
  hash.update(chunk);bytes+=chunk.length;const window=Buffer.concat([tail,chunk]);for(const [token,seen]of tokens)if(!seen&&window.includes(Buffer.from(token)))tokens.set(token,true);
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
for(const [digest,asset]of expected)assert.equal(found.has(digest),true,`Missing accepted art: ${asset.id}`);
assert.equal(glbs,4);const releaseHash=hash.digest('hex').toUpperCase();assert.equal(await sha(path.join(root,'dist-portable/index.html')),releaseHash);
const result={verifiedAt:new Date().toISOString(),version:'1.49.0',revision:'2026.10.16 · 清晰表情与公平牌桌',release,bytes,sha256:releaseHash,portableBuildIdentical:true,
  backup:{path:path.join(out,'before/1.49.0.html'),sha256:oldRelease.sha256},allNpcSchedulesUnchanged:true,perNpc,
  performance:{paragraphs:perNpc.reduce((sum,npc)=>sum+npc.performanceParagraphs,0),changedExistingCategories:emotionDiff.length,sourceSha256:sourceHash},
  tests:{passed:focused.numPassedTests,failed:focused.numFailedTests,files:focused.testResults.length,check:'0 errors / 100 existing warnings',additionalWorkRegression:{passed:work.numPassedTests,failed:work.numFailedTests,countedSeparately:false}},
  preservedAssets:[...found.values()],preservedBakedHomeGeometry:await sha(foodPath),changes,browser,
  rulesReferences:['https://bicyclecards.com/how-to-play/blackjack/','https://www.pokerstars.com/poker/games/texas-holdem/'],
  limitations:['Browser checks used real source components and isolated test state over HTTP. Portable HTML verified by streamed embedded-asset hashes and file identity; not opened by automation.','No native EXE/APK or physical-device test performed.']};
fs.writeFileSync(path.join(out,'verification-final.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,revision:result.revision,bytes,sha256:releaseHash,tests:result.tests,performance:result.performance,preservedAssets:found.size,changedFiles:changes.length}));
