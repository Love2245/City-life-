import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/interaction-audio-1497-20261027');
const read=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const previous=read('previous-verification.json'),baseline=read('before-sha256.json'),changes=[];
for(const file of baseline){assert.equal(await hash(join(out,'before',file.path)),file.sha256,'Backup changed: '+file.path);assert(existsSync(join(root,file.path)),'Original removed: '+file.path);const after=await hash(join(root,file.path));if(after!==file.sha256)changes.push({path:file.path,before:file.sha256,after});}
assert.deepEqual(read('baseline-source-drift.json'),[]);
const allowed=new Set(['src/components/layout/CafeInterior.svelte','src/components/layout/CompanyFinance.svelte','src/components/layout/CompanyInterior.svelte','src/components/layout/CompanyShiftControls.svelte','src/components/layout/CookingWorkbench.svelte','src/components/layout/FridgeContents.svelte','src/components/layout/FridgePanel.svelte','src/components/layout/HomeInterior.svelte','src/components/layout/ScenePanel.svelte','src/components/layout/StoreInterior.svelte','src/components/ReaderModal.svelte','src/components/ResultModal.svelte','src/game/data/interiorActivities.ts','src/lib/audio.ts','src/lib/companyOffice3D.ts','src/version.ts','tests/bugfix20261003_ui.test.ts','tests/checkoutCounter.test.ts','tests/deliveryResetUi.test.ts','tests/factoryResetUi.test.ts','tests/homePolishUi.test.ts','tests/homeTodoPetUi.test.ts','tests/homeUiConsistency.test.ts','tests/industrialFactoryUi.test.ts','scripts/verify-company-simplification-ui.mjs','docs/创业系统_1.497_玩法与数值.md']);
allowed.add('tests/companyOfficeLighting3D.test.ts');
for(const change of changes)assert(allowed.has(change.path),'Unexpected source change '+change.path);
const interiorPath='src/game/data/interiorActivities.ts';assert.equal(readFileSync(join(root,interiorPath),'utf8').replace(",sound:'read' as const",''),readFileSync(join(out,'before',interiorPath),'utf8'),'Interior action gameplay changed');
const oldAudio=readFileSync(join(out,'before/src/lib/audio.ts'),'utf8'),newAudio=readFileSync(join(root,'src/lib/audio.ts'),'utf8');
for(const declaration of ['SOUND_DEFS','BGM_TRACKS']){const pattern=new RegExp('export const '+declaration+'[\\s\\S]*?\\n};');assert.equal(newAudio.match(pattern)?.[0],oldAudio.match(pattern)?.[0],declaration+' changed');}
const originals=JSON.parse(readFileSync(join(root,'docs/company-calibration-1497-20261026/source-sha256.json'),'utf8')).filter(f=>f.path.startsWith('src/assets/'));
const priorAssetBackup=JSON.parse(readFileSync(join(root,'docs/company-office-finish-1497-20261027/before-sha256.json'),'utf8')).filter(f=>f.path.startsWith('src/assets/'));
const overrides=new Map([...priorAssetBackup.map(f=>[f.path,f.sha256]),...previous.updatedContextAssets.map(f=>[f.path,f.after])]);
for(const[index,file]of originals.entries()){assert(existsSync(join(root,file.path)),'Missing formal asset '+file.path);assert.equal(await hash(join(root,file.path)),overrides.get(file.path)??file.sha256,'Existing formal asset changed '+file.path);if((index+1)%1500===0)console.log('Formal assets verified '+(index+1)+'/'+originals.length);}
const sounds=read('sound-manifest.json'),sources=read('source-audio.json');assert.equal(sounds.length,18);assert.equal(new Set(sounds.map(s=>s.key)).size,18);
for(const sound of sounds){assert.equal(await hash(join(root,sound.path)),sound.sha256);assert(sound.duration>0&&sound.duration<2&&sound.channels===1&&sound.sampleRate===44100);assert(sound.peakDb<=-2&&sound.meanDb>-60);assert(sound.license.endsWith('/publicdomain/zero/1.0/'));const source=sources.find(s=>s.key===sound.key);assert(source);assert.equal(await hash(join(root,source.path)),source.sha256);const page=readFileSync(join(out,'source-pages',source.id+'.html'),'utf8');assert(page.includes('creativecommons.org/publicdomain/zero/1.0/'));assert(page.includes(source.preview));}
const assetReport={checkedAt:new Date().toISOString(),passed:true,backupFiles:baseline.length,changedOriginalFiles:changes,gameplayRulesPreserved:true,gameplayAudioMetadataOnly:interiorPath,originalFormalAssetsUnchanged:originals.length,oldMusicAndSynthDefinitionsPreserved:true,newSounds:{clips:sounds.length,bytes:sounds.reduce((n,s)=>n+s.bytes,0),maxDuration:Math.max(...sounds.map(s=>s.duration)),maxPeakDb:Math.max(...sounds.map(s=>s.peakDb)),allCC0:true,publicHQPreviews:true}};
writeFileSync(join(out,'asset-verification.json'),JSON.stringify(assetReport,null,2));
if(process.argv.includes('--assets-only')){console.log(JSON.stringify({...assetReport,changedOriginalFiles:changes.length},null,2));process.exit(0);}

const targeted=read('targeted-final.json');assert.equal(targeted.numFailedTests,0);assert.equal(targeted.numFailedTestSuites,0);
const full=read('full-tests.json'),oldFull=JSON.parse(readFileSync(join(root,'docs/company-simplification-1497-20261027/full-final.json'),'utf8'));
const rawCounts={total:full.numTotalTests,passed:full.numPassedTests,failed:full.numFailedTests};
const rendererTest='tests/companyOfficeLighting3D.test.ts',rerun=targeted.testResults.find(f=>f.name.replaceAll('\\','/').endsWith('/'+rendererTest));assert(rerun&&rerun.status==='passed');
full.testResults=full.testResults.map(f=>f.name.replaceAll('\\','/').endsWith('/'+rendererTest)?rerun:f);
full.numPassedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(a=>a.status==='passed').length,0);full.numFailedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(a=>a.status==='failed').length,0);
function failures(run){return run.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>relative(root,f.name).replaceAll('\\','/')+' :: '+a.fullName));}
function collection(run){return run.testResults.filter(f=>f.status==='failed'&&!f.assertionResults.length).map(f=>relative(root,f.name).replaceAll('\\','/')).sort();}
const oldFailures=new Set(failures(oldFull)),currentFailures=failures(full),newFailures=currentFailures.filter(f=>!oldFailures.has(f)),resolvedFailures=[...oldFailures].filter(f=>!currentFailures.includes(f));assert.deepEqual(newFailures,[]);assert.deepEqual(collection(full),collection(oldFull));
const check=readFileSync(join(out,'check-final.log'),'utf8');assert.match(check,/found 0 errors and 100 warnings/);
let browser=read('portable-browser/verification.json');
if(process.argv.includes('--wait-browser')){console.log('Source/assets checked; waiting for portable browser completion');for(let attempt=0;attempt<60&&!browser.passed;attempt++){await new Promise(resolve=>setTimeout(resolve,2000));browser=read('portable-browser/verification.json');}}
assert(browser.passed);assert.equal(browser.scenarios.length,8);
for(const s of browser.scenarios){assert(s.passed);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);assert(s.checks.some(c=>c.all18OfflineClipsDecoded));if(s.wallTrace){assert(s.wallTrace.reducedMotion?s.wallTrace.intermediateFrames===0:s.wallTrace.intermediateFrames>0);}}
const oldPortable=read('previous-portable.json');assert.equal(await hash(join(root,oldPortable.archive)),oldPortable.sha256);assert.equal(oldPortable.sha256,previous.portable.sha256);
const portablePath=join(root,'1.49.7.html'),sha256=await hash(portablePath),input=read('portable-run-input.json');assert.equal(await hash(join(root,'dist-portable/index.html')),sha256);assert.equal(input.sha256,sha256);assert(input.embeddedRevisionFound);assert.notEqual(sha256,oldPortable.sha256);
const versionSource=readFileSync(join(root,'src/version.ts'),'utf8'),version=versionSource.match(/export const VERSION = "([^"]+)"/)[1],revision=versionSource.match(/export const REVISION = "([^"]+)"/)[1];assert.equal(input.revision,revision);assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,version);
const files=[];function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='assets')walk(path);}else if(/\.(ts|svelte|js|mjs|cjs|css|json)$/.test(entry.name))files.push(path);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.(ts|js|mjs|json|css)$/.test(entry.name))files.push(join(root,entry.name));for(const sound of sounds)files.push(join(root,sound.path));
const fingerprints=[];for(const path of files)fingerprints.push({path:relative(root,path).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await hash(path)});writeFileSync(join(out,'source-sha256.json'),JSON.stringify(fingerprints,null,2));writeFileSync(join(root,'1.49.7.sha256'),sha256+'  1.49.7.html\n');
const report={completedAt:new Date().toISOString(),passed:true,version,saveVersion:37,portable:{path:portablePath,bytes:statSync(portablePath).size,sha256,revision,embeddedRevisionFound:true},previousPortable:oldPortable,...assetReport,changedOriginalFiles:changes,
  static:{errors:0,existingWarnings:100},targeted:{passed:targeted.numPassedTests,failed:0,files:targeted.testResults.length},
  fullSuite:{total:full.numTotalTests,passed:full.numPassedTests,failed:full.numFailedTests,rawRun:rawCounts,updatedRendererTestRerun:rendererTest,collectionFailures:collection(full),newFailures,resolvedFailures},
  portableBrowser:{scenarios:browser.scenarios.length,screenshots:browser.scenarios.reduce((n,s)=>n+s.screenshots.length,0),errors:0,externalRequests:0,wallAnimationCases:browser.scenarios.filter(s=>s.wallTrace).length},
  limits:['Constructed saved states and independent browser UI journeys; not a complete natural-play economy run.','Audio decode, native source start/stop, waveform energy and peak levels verified; subjective listening still depends on the playback device.','Headless installed Chrome desktop/mobile viewports; no physical mobile audio/performance validation or new EXE/APK.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,changedOriginalFiles:changes.length},null,2));
