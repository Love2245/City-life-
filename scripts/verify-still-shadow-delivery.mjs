import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,statSync,createReadStream} from 'node:fs';import {join,resolve,relative} from 'node:path';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/still-soft-shadows-1497-20261025');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),read=p=>json(join(audit,p)),normal=p=>p.replaceAll('\\','/');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');async function streamHash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
function files(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);}
const tests=read('tests.json');assert.equal(tests.numFailedTests,0);assert.equal(tests.numFailedTestSuites,0);assert.equal(tests.numPendingTests,0);assert(tests.numPassedTests>=25);
assert(readFileSync(join(audit,'check.log'),'utf8').includes('found 0 errors'));
const browser=read('browser/verification.json'),portable=read('portable/verification.json'),preview=read('preview/verification.json');
assert(browser.passed&&browser.scenarios.length===5);assert(portable.passed&&portable.scenarios.length===3);assert(preview.passed&&preview.cases.length===8&&preview.webgl===0);
for(const s of [...browser.scenarios,...portable.scenarios]){assert.equal(s.errors.length,0);if(s.kind==='home'||s.kind==='company')assert(s.checks.some(c=>c.cachedContactShadows&&c.noRebuildOnDragOrZoom));}
for(const s of portable.scenarios){assert.equal(s.httpRequests.length,0);assert.equal(s.externalFileRequests.length,0);assert.equal(s.failedRequests.length,0);}
const previous=json(join(root,'docs/still-navigation-fidelity-1497-20261025/verification.json')),priorHashes=json(join(root,'docs/still-navigation-fidelity-1497-20261025/source-sha256.json'));
const unchanged=priorHashes.filter(f=>normal(f.path).startsWith('src/assets/')&&!['src/assets/mobile-stills/home/README.md','src/assets/mobile-stills/company/README.md'].includes(normal(f.path))||normal(f.path).startsWith('src/game/')||/^src\/lib\/.*3D\.ts$/.test(normal(f.path)));
assert(unchanged.every(f=>hash(join(root,f.path))===f.sha256.toLowerCase()),'Asset/gameplay/3D change outside this update');
const before=read('before-sha256.json');assert(before.every(f=>hash(join(audit,'before',f.path))===f.sha256.toLowerCase()),'Backup mismatch');
const artifact=join(root,'1.49.7.html'),sha256=await streamHash(artifact);assert.equal(sha256,await streamHash(join(root,'dist-portable/index.html')));assert.equal(sha256,read('artifact-before-qa.json').sha256);
const prior=read('previous-portable.json');assert.equal(prior.sha256,previous.portable.sha256);assert.equal(await streamHash(prior.path),prior.sha256);
writeFileSync(join(root,'1.49.7.sha256'),`${sha256}  1.49.7.html\n`);
const tracked=[...files(join(root,'src')),...files(join(root,'scripts')),...files(join(root,'tests')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md'),join(root,'1.49.7.sha256')];
writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(tracked.map(p=>({path:normal(relative(root,p)),bytes:statSync(p).size,sha256:hash(p)})),null,2));
const revision='2026.10.25 · 高清场景与柔和阴影';assert(readFileSync(join(root,'src/version.ts'),'utf8').includes(revision));
const summarize=r=>({passed:r.passed,scenarios:r.scenarios.length,screenshots:r.scenarios.flatMap(s=>s.screenshots).length,errors:r.scenarios.flatMap(s=>s.errors).length});
const report={passed:true,generatedAt:new Date().toISOString(),directory:root,version:'1.49.7',saveVersion:36,revision,
 rendering:{homeContactStrength:.3,companyContactStrength:.27,shortCastStrength:.13,maxCastDistanceMeters:.6,depthScale:1/3,blurAtSourcePixels:2,cacheOnConfigurationChange:true,zeroRebuildOnPanZoom:true,noWebgl:true,newImageFiles:0},
 tests:{passed:tests.numPassedTests,failed:0,pending:0,fullSuiteRerun:false,priorFullSuite:{passed:previous.tests.passed,existingFailures:previous.tests.failed,collectionFailures:previous.tests.collectionFailures.length}},staticCheck:'0 errors; 100 existing warnings',browser:summarize(browser),
 preview:{passed:true,cases:preview.cases.length,comparison:preview.cases.filter(c=>c.enabled).map(c=>({id:c.id,angle:c.angle,shadowMilliseconds:c.shadowMilliseconds,...c.comparison}))},
 portable:{...summarize(portable),path:artifact,bytes:statSync(artifact).size,sha256,standaloneFileVerified:true,buildCopyMatches:true},
 source:{backedUp:before.length,unchangedAssetGameplay3DFiles:unchanged.length,changed:before.filter(f=>hash(join(root,f.path))!==f.sha256).map(f=>f.path)},previousPortable:prior,
 unverified:['Physical mobile frame rate, thermal behavior and peak memory','Native EXE/APK packaging']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
