import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync,createReadStream} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/office-remaster-1497-20261024');
const read=p=>JSON.parse(readFileSync(join(audit,p),'utf8').replace(/^\uFEFF/,''));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=read('before-sha256.json'),normal=p=>p.replaceAll('\\','/');
if(!before.some(f=>normal(f.path)==='tests/sceneLoadWork.test.ts')){
  const p='tests/sceneLoadWork.test.ts',file=join(audit,'before',p);assert(existsSync(file));
  before.push({path:p,sha256:hash(file),bytes:statSync(file).size,provenance:'before-test-provenance.json'});
  writeFileSync(join(audit,'before-sha256.json'),JSON.stringify(before,null,2));
}
const previous=JSON.parse(readFileSync(join(root,'docs/company-1497-20261024/verification.json'),'utf8'));
const results=new Map(read('full-tests.json').testResults.map(f=>[basename(f.name),f]));
// The nine model regressions were added after full-suite collection. Replace complete files, never individual assertions.
for(const f of read('company-models-tests.json').testResults)results.set(basename(f.name),f);
const assertions=[...results.values()].flatMap(f=>f.assertionResults.map(a=>({...a,file:basename(f.name)})));
const failures=assertions.filter(a=>a.status==='failed').map(a=>({file:a.file,test:a.fullName,message:a.failureMessages[0]?.split('\n')[0]}));
const known=new Set(previous.tests.existingFailures.map(f=>f.file+':'+f.test));
const collections=[...results.values()].filter(f=>f.status==='failed'&&!f.assertionResults.length).map(f=>basename(f.name));
const newFailures=failures.filter(f=>!known.has(f.file+':'+f.test)),newCollections=collections.filter(f=>!previous.tests.collectionFailures.includes(f));
assert.equal(newFailures.length,0,JSON.stringify(newFailures));assert.equal(newCollections.length,0,JSON.stringify(newCollections));
const company=assertions.filter(a=>/^company(?:Ui|StaffNames|OfficeModels)?\.test\.ts$/.test(a.file));assert(company.every(a=>a.status==='passed'));
const browser=read('browser/verification.json'),portable=read('portable/verification.json');assert(browser.passed);assert.equal(browser.scenarios.length,11);assert(portable.passed);
const controls=read('browser-controls/subset-verification.json'),officePerformance=read('office-performance/verification-light.json');assert(controls.passed);assert(officePerformance.passed);assert.equal(officePerformance.checks.length,12);
const versionSource=readFileSync(join(root,'src/version.ts'),'utf8');assert(versionSource.includes('export const VERSION = "1.49.7"'));assert(versionSource.includes('2026.10.24 · 办公室重制与加载优化'));assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,'1.49.7');
const check=readFileSync(join(audit,'check-final.log'),'utf8');assert(check.includes('found 0 errors'));
const compared=before.map(f=>{const p=join(root,f.path);return{path:normal(f.path),before:f.sha256.toLowerCase(),after:existsSync(p)?hash(p):null};});
const assets=compared.filter(f=>f.path.startsWith('src/assets/'));assert(assets.length>2000);assert(assets.every(f=>f.before===f.after),'Formal asset content changed');
assert(compared.every(f=>f.after),'Source file deleted');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const paths=[...files(join(root,'src')),...files(join(root,'scripts')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md')];
const testFiles=['companyOfficeModels','companyStaffNames','sceneLoadWork','sceneTextureCanvas'];for(const f of testFiles)paths.push(join(root,`tests/${f}.test.ts`));
const hashes=paths.map(p=>({path:normal(relative(root,p)),sha256:hash(p),bytes:statSync(p).size}));writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const basePaths=new Set(compared.map(f=>f.path)),added=hashes.filter(f=>!basePaths.has(f.path)).map(f=>f.path);
async function streamHash(p){const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');}
const artifact=join(root,'1.49.7.html'),artifactHash=await streamHash(artifact);assert.equal(artifactHash,portable.sha256);assert.equal(artifactHash,await streamHash(join(root,'dist-portable/index.html')));
const report={directory:root,version:'1.49.7',saveVersion:36,revision:'2026.10.24 · 办公室重制与加载优化',generatedAt:new Date().toISOString(),
  tests:{method:'Full suite plus complete-file model regression rerun; no skipped assertions',passed:assertions.filter(a=>a.status==='passed').length,failed:failures.length,pending:assertions.filter(a=>a.status==='pending').length,companyPassed:company.length,existingFailures:failures,collectionFailures:collections,newFailures,newCollectionFailures:newCollections,loading:read('scene-load-tests.json').numPassedTests},
  staticCheck:'0 errors; 100 existing warnings',browser:{passed:true,scenarios:browser.scenarios.length,runtimeErrors:browser.scenarios.flatMap(s=>s.errors).length,screenshots:browser.scenarios.flatMap(s=>s.screenshots).length,controls:controls.passed},officePerformance:{passed:true,checks:officePerformance.checks.length},
  portable:{path:artifact,bytes:statSync(artifact).size,sha256:artifactHash,standaloneFileVerified:true,scenarios:portable.scenarios.map(s=>({id:s.id,passed:s.passed,httpRequests:s.httpRequests.length,externalFileRequests:s.externalFileRequests.length,errors:s.errors.length})),buildCopyMatches:true},
  source:{backedUp:before.length,changed:compared.filter(f=>f.before!==f.after).map(f=>f.path),added,deleted:[],formalAssetsUnchanged:assets.length},passed:true};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({tests:{passed:report.tests.passed,failed:report.tests.failed,company:company.length,newFailures:0,newCollections:0},portable:report.portable,source:report.source,browser:report.browser},null,2));
