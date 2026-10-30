import assert from 'node:assert/strict';
import {createReadStream,readdirSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/company-simplification-1497-20261027');
const read=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const baseline=read('before-sha256.json'),changes=[];console.log('Verifying '+baseline.length+' backup files');
for(const file of baseline){
  const backup=join(out,'before',file.path);assert.equal(await hash(backup),file.sha256,'Changed backup '+file.path);
  const current=join(root,file.path);assert(existsSync(current),'Missing original file '+file.path);
  const sha256=await hash(current);if(sha256!==file.sha256)changes.push({path:file.path,before:file.sha256,after:sha256});
}
console.log('Backups verified; checking original formal assets');
const historical=JSON.parse(readFileSync(join(root,'docs/company-calibration-1497-20261026/source-sha256.json'),'utf8')).filter(f=>f.path.startsWith('src/assets/'));
const expectedAsset=path=>path==='src/assets/mobile-stills/company/manifest.json'||path.startsWith('src/assets/mobile-stills/company/office-');
let retainedAssets=0;const updatedAssets=[],unexpectedAssets=[];
for(const asset of historical){const path=join(root,asset.path);assert(existsSync(path),'Missing formal asset '+asset.path);const sha256=await hash(path);retainedAssets++;if(sha256!==asset.sha256)(expectedAsset(asset.path)?updatedAssets:unexpectedAssets).push(asset.path);}
assert.deepEqual(unexpectedAssets,[],'Unrelated formal assets changed');
const source=[];function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory()){if(item.name!=='assets')walk(path);}else if(/\.(ts|svelte|js|mjs|cjs|css|json)$/.test(item.name))source.push(path);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));for(const item of readdirSync(root,{withFileTypes:true}))if(item.isFile()&&/\.(ts|js|mjs|json|css)$/.test(item.name))source.push(join(root,item.name));
const fingerprints=[];for(const path of source)fingerprints.push({path:relative(root,path).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await hash(path)});
writeFileSync(join(out,'source-sha256.json'),JSON.stringify(fingerprints,null,2));
const baseTests=read('baseline-tests.json'),tests=read('full-final.json'),targeted=read('targeted-final.json');
const failures=r=>r.testResults.flatMap(t=>(t.assertionResults??[]).filter(a=>a.status==='failed').map(a=>({key:t.name+'|'+a.fullName,file:t.name,name:a.fullName,durationMs:a.duration})));
const oldFailures=new Set(failures(baseTests).map(f=>f.key)),rawNewFailures=failures(tests).filter(f=>!oldFailures.has(f.key));
const npcRecheck=read('npc-recheck.json');assert.equal(npcRecheck.numFailedTests,0);assert.equal(npcRecheck.numPassedTests,3);
const rerunPass=new Map(npcRecheck.testResults.flatMap(t=>(t.assertionResults??[]).filter(a=>a.status==='passed').map(a=>[t.name+'|'+a.fullName,a.duration])));
const recheckedFailures=rawNewFailures.filter(f=>f.file.endsWith('/npcAuthoredPerformance.test.ts')&&f.name==='正式稿逐段表现的覆盖与隔离 当前本人发言都有唯一标注，旁白和玩家发言不进入NPC表现判定'&&f.durationMs>=5000&&rerunPass.has(f.key)).map(f=>({...f,recheckDurationMs:rerunPass.get(f.key),reason:'Exceeded the default 5000 ms limit during concurrent scene work; unchanged NPC code passed in an isolated test-file rerun.'}));
for(const path of ['tests/npcAuthoredPerformance.test.ts','src/game/data/npcDialoguePerformance.json','src/game/core/npcs.ts','src/game/core/npcDialoguePlayback.ts','src/game/core/npcDialogueEmotion.ts','src/game/data/npcGreetings.ts','src/game/data/npcSharedIntroductions.ts'])assert.equal(await hash(join(root,path)),baseline.find(f=>f.path===path).sha256,'NPC recheck input changed: '+path);
const recheckedKeys=new Set(recheckedFailures.map(f=>f.key)),newFailures=rawNewFailures.filter(f=>!recheckedKeys.has(f.key));assert.deepEqual(newFailures,[]);
const collection=r=>r.testResults.filter(t=>t.status==='failed'&&!t.assertionResults?.length).map(t=>t.name).sort();assert.deepEqual(collection(tests),collection(baseTests));
assert.equal(targeted.numFailedTests,0);
const targetFiles=new Set(targeted.testResults.map(t=>t.name));
const targetInFull=tests.testResults.filter(t=>targetFiles.has(t.name)).flatMap(t=>t.assertionResults??[]);
assert.equal(targetInFull.length,targeted.numTotalTests);assert(targetInFull.every(a=>a.status==='passed'),'Targeted regression failed in the final full suite');
const browser=read('browser-current/verification.json'),portable=read('portable-current/verification.json'),stills=read('stills-bake.json');

assert(browser.passed&&portable.passed&&stills.passed);assert.equal(browser.scenarios.length,14);assert.equal(portable.scenarios.length,14);assert.equal(stills.frames.length,32);
for(const r of [browser,portable])for(const s of r.scenarios){assert(s.passed);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);}
const check=readFileSync(join(out,'check-final.log'),'utf8');assert.match(check,/found 0 errors and 100 warnings/);
console.log('Tests, source scenes and portable scenes verified; checking portable hashes');
const previous=read('previous-portable.json');assert.equal(await hash(join(root,previous.archive)),previous.sha256);
const intermediate=read('phase1-previous-portable.json');assert.equal(await hash(join(root,intermediate.archive)),intermediate.sha256);
const portablePath=join(root,'1.49.7.html'),sha256=await hash(portablePath);assert.equal(await hash(join(root,'dist-portable/index.html')),sha256);
const runInput=read('portable-run-input.json');assert(runInput.embeddedRevisionFound);assert.equal(runInput.sha256,sha256,'Portable changed during browser QA');
writeFileSync(join(root,'1.49.7.sha256'),sha256+'  1.49.7.html\n');
const resolved=failures(baseTests).filter(f=>!new Set(failures(tests).map(x=>x.key)).has(f.key));
const report={completedAt:new Date().toISOString(),version:JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,saveVersion:37,passed:true,
  portable:{path:portablePath,bytes:statSync(portablePath).size,sha256,revision:runInput.revision,embeddedRevisionFound:true},previousPortable:previous,intermediatePortable:intermediate,
  backupFiles:baseline.length,originalFormalAssetsRetained:retainedAssets,updatedCompanyContextAssets:updatedAssets,unrelatedAssetChanges:unexpectedAssets,
  static:{errors:0,existingWarnings:100},targeted:{passed:targeted.numPassedTests,failed:targeted.numFailedTests,alsoPassedInFinalFullSuite:true},
  baselineTests:{passed:baseTests.numPassedTests,failed:baseTests.numFailedTests,collectionFailures:collection(baseTests).length},
  fullTests:{passed:tests.numPassedTests,failed:tests.numFailedTests,collectionFailures:collection(tests).length,rawNewFailures,recheckedFailures,newFailures,resolvedFailures:resolved},
  npcRecheck:{passed:npcRecheck.numPassedTests,failed:npcRecheck.numFailedTests},
  browser:{scenarios:browser.scenarios.length,screenshots:browser.scenarios.reduce((n,s)=>n+s.screenshots.length,0)},
  portableBrowser:{scenarios:portable.scenarios.length,screenshots:portable.scenarios.reduce((n,s)=>n+s.screenshots.length,0),externalRequests:0},
  stillFrames:stills.frames.length,changedOriginalFiles:changes,
  limits:['Controlled saved-state UI journeys and core regression tests; not a full natural-play economy run from a new game.','No new EXE/APK or physical mobile performance/thermal verification.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,portable:report.portable,targeted:report.targeted,fullTests:{passed:tests.numPassedTests,failed:tests.numFailedTests,collectionFailures:collection(tests).length,recheckedFailures:recheckedFailures.length,newUnresolvedFailures:0},formalAssets:retainedAssets,updatedAssets:updatedAssets.length,browser:report.browser,portableBrowser:report.portableBrowser},null,2));
