import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/company-office-finish-1497-20261027');
const read=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const previous=read('previous-verification.json'),backup=read('before-sha256.json'),changes=[];
console.log('Verifying '+backup.length+' source and context backups');
for(const file of backup){assert.equal(await hash(join(out,'before',file.path)),file.sha256,'Backup changed: '+file.path);assert(existsSync(join(root,file.path)),'Original removed: '+file.path);const sha256=await hash(join(root,file.path));if(sha256!==file.sha256)changes.push({path:file.path,before:file.sha256,after:sha256});}
assert.deepEqual(read('baseline-source-drift.json'),[]);
const sourceBefore=JSON.parse(readFileSync(join(root,'docs/company-corridor-art-1497-20261027/source-sha256.json'),'utf8'));
const allowedChanges=new Set(['src/lib/companyOfficeSurroundings.ts','src/lib/companyCorridorArt.ts','src/lib/companyDistrict.ts','src/version.ts','scripts/bake-company-context.mjs','scripts/verify-company-simplification-ui.mjs','tests/companyBuildingContext.test.ts','tests/companyOfficeTaxTour.test.ts']);
const sourceChanges=[];
for(const file of sourceBefore){assert(existsSync(join(root,file.path)));if(await hash(join(root,file.path))!==file.sha256){assert(allowedChanges.has(file.path),'Unrelated source changed: '+file.path);sourceChanges.push(file.path);}}
console.log('Gameplay source unchanged; checking original formal assets');
const assetsBefore=JSON.parse(readFileSync(join(root,'docs/company-calibration-1497-20261026/source-sha256.json'),'utf8')).filter(file=>file.path.startsWith('src/assets/'));
const expectedAsset=path=>path==='src/assets/mobile-stills/company/manifest.json'||path.startsWith('src/assets/mobile-stills/company/office-');
for(const[index,file]of assetsBefore.entries()){
  assert(existsSync(join(root,file.path)),'Formal asset removed: '+file.path);
  if(!expectedAsset(file.path))assert.equal(await hash(join(root,file.path)),file.sha256,'Unrelated asset changed: '+file.path);
  if((index+1)%1500===0)console.log('Formal assets checked '+(index+1)+'/'+assetsBefore.length);
}
const manifestPath='src/assets/mobile-stills/company/manifest.json',manifest=JSON.parse(readFileSync(join(root,manifestPath),'utf8')),oldManifest=JSON.parse(readFileSync(join(out,'before',manifestPath),'utf8'));
assert.equal(manifest.contextRevision,'2026-10-27-office-finish');
for(const key of Object.keys(oldManifest).filter(key=>!['frames','contextRevision','contextFrames'].includes(key)))assert.deepEqual(manifest[key],oldManifest[key],'Equipment/employee metadata changed: '+key);
for(const key of Object.keys(oldManifest.frames)){
  assert.deepEqual(manifest.frames[key],oldManifest.frames[key],'Photo camera, workstation or hit mapping changed: '+key);
}
const targeted=read('targeted.json'),stills=read('stills-bake.json'),browser=read('portable-browser/verification.json');
assert.equal(targeted.numFailedTests,0);assert.equal(targeted.numFailedTestSuites,0);assert.equal(targeted.numPassedTests,54);
assert(stills.passed);assert.deepEqual(stills.errors,[]);assert.equal(stills.frames.length,32);
assert(browser.passed);assert.equal(browser.scenarios.length,10);
const expectedCases=['pc-tour','pe-tour',...[1,2,3,4].flatMap(stage=>['pc-stage-'+stage+'-3d','pe-stage-'+stage+'-2d'])];
assert.deepEqual(browser.scenarios.map(s=>s.id).sort(),expectedCases.sort());
for(const scenario of browser.scenarios){assert(scenario.passed);assert.deepEqual(scenario.errors,[]);assert.deepEqual(scenario.external,[]);if(scenario.id.startsWith('pc-stage-')){const controls=scenario.checks.find(c=>c.wallModeControls);assert.deepEqual(controls?.wallModeControls,['low','full','cutaway']);assert(controls.sceneImagesDiffer);}}
const check=readFileSync(join(out,'check.log'),'utf8');assert.match(check,/found 0 errors and 100 warnings/);
console.log('Models, photographs and all portable scenes verified; comparing portable files');
const oldPortable=read('previous-portable.json');assert.equal(await hash(join(root,oldPortable.archive)),oldPortable.sha256);assert.equal(oldPortable.sha256,previous.portable.sha256);
const portablePath=join(root,'1.49.7.html'),sha256=await hash(portablePath),input=read('portable-run-input.json');
assert.equal(await hash(join(root,'dist-portable/index.html')),sha256);assert.equal(input.sha256,sha256);assert(input.embeddedRevisionFound);assert.notEqual(sha256,previous.portable.sha256);
const versionSource=readFileSync(join(root,'src/version.ts'),'utf8'),version=versionSource.match(/export const VERSION = "([^"]+)"/)[1],revision=versionSource.match(/export const REVISION = "([^"]+)"/)[1];
assert.equal(input.revision,revision);assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,version);
const files=[];function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='assets')walk(path);}else if(/\.(ts|svelte|js|mjs|cjs|css|json)$/.test(entry.name))files.push(path);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.(ts|js|mjs|json|css)$/.test(entry.name))files.push(join(root,entry.name));
const fingerprints=[];for(const path of files)fingerprints.push({path:relative(root,path).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await hash(path)});
writeFileSync(join(out,'source-sha256.json'),JSON.stringify(fingerprints,null,2));writeFileSync(join(root,'1.49.7.sha256'),sha256+'  1.49.7.html\n');
const report={completedAt:new Date().toISOString(),passed:true,version,saveVersion:previous.saveVersion,
  portable:{path:portablePath,bytes:statSync(portablePath).size,sha256,revision,embeddedRevisionFound:true},previousPortable:oldPortable,
  backupFiles:backup.length,sourceChanges,gameplaySourceUnchanged:true,originalFormalAssetsRetained:assetsBefore.length,unrelatedAssetChanges:[],
  updatedContextAssets:changes.filter(file=>file.path.startsWith('src/assets/')),employeeAndComputerSpritesPreserved:true,photoCameraAndInteractionMetadataPreserved:true,
  static:{errors:0,existingWarnings:100},targeted:{passed:targeted.numPassedTests,failed:0,files:targeted.testResults.length},stills:{frames:stills.frames.length,errors:0},
  portableBrowser:{scenarios:browser.scenarios.length,screenshots:browser.scenarios.reduce((n,s)=>n+s.screenshots.length,0),errors:0,externalRequests:0},
  fullSuiteRerun:false,previousFullSuite:previous.previousFullSuite,
  changedOriginalFiles:changes,
  limits:['Visual scope: renderer/lighting/lifecycle regression and actual portable desktop/mobile-viewport journeys; full repository suite was not rerun.','No new EXE/APK, physical mobile performance/thermal validation or natural-play economy claim.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,updatedContextAssets:report.updatedContextAssets.length,changedOriginalFiles:report.changedOriginalFiles.length},null,2));
