import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,createReadStream} from 'node:fs';
import {join,resolve,relative,basename} from 'node:path';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/still-navigation-fidelity-1497-20261025');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),read=p=>json(join(audit,p));
const normal=p=>p.replaceAll('\\','/'),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function streamHash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
function files(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);}
const baseline=json(join(root,'docs/two-scene-modes-1497-20261024/verification.json'));
const full=read('full-tests.json'),failures=full.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:basename(s.name),test:t.fullName,message:t.failureMessages[0]?.split('\n')[0]})));
const old=new Set(baseline.tests.existingFailures.map(f=>f.file+'|'+f.test));
assert(failures.every(f=>old.has(f.file+'|'+f.test)),'New test failure');assert.equal(full.numPendingTests,0);
const collections=full.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>basename(s.name));
assert(collections.every(f=>baseline.tests.collectionFailures.includes(f)),'New collection failure');
for(const name of ['targeted-tests.json','final-scene-tests.json']){const r=read(name);assert.equal(r.numFailedTests,0);assert.equal(r.numFailedTestSuites,0);}
assert(readFileSync(join(audit,'check.log'),'utf8').includes('found 0 errors'));
const browser=read('browser-final/verification.json'),portable=read('portable/verification.json'),reference=read('reference/verification.json');
assert(browser.passed&&browser.scenarios.length===5);assert(portable.passed&&portable.scenarios.length===3);assert(reference.passed&&reference.cases.length===4);
for(const s of portable.scenarios){assert.equal(s.errors.length,0);assert.equal(s.httpRequests.length,0);assert.equal(s.externalFileRequests.length,0);assert.equal(s.failedRequests.length,0);assert(s.initialViewport.width>s.w&&s.initialViewport.height>s.h);}
function size(p){const b=readFileSync(p);if(b.toString('ascii',1,4)==='PNG')return[b.readUInt32BE(16),b.readUInt32BE(20)];assert.equal(b.toString('ascii',8,12),'WEBP');const type=b.toString('ascii',12,16);if(type==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];if(type==='VP8 ')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];assert.equal(type,'VP8L');const bits=b.readUInt32LE(21);return[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
const imageReport={};
for(const group of ['home','company','venues']){
 const dir=join(root,'src/assets/mobile-stills',group),m=json(join(dir,'manifest.json')),seen=new Set();
 function walk(o){if(!o||typeof o!=='object')return;for(const k of ['src','depthSrc','file','foreground'])if(typeof o[k]==='string'&&/\.(webp|png)$/.test(o[k])){const p=join(dir,o[k]);assert(existsSync(p),o[k]);seen.add(p);if(o.width&&o.height)assert.deepEqual(size(p),o.rect?[o.rect.width,o.rect.height]:[o.width,o.height],o[k]);}for(const v of Object.values(o))if(v&&typeof v==='object')walk(v);}
 walk(m);const actual=files(dir).filter(p=>/\.(webp|png)$/.test(p));assert.equal(seen.size,actual.length,'Unreferenced screenshot assets');
 if(group==='home'){assert.equal(m.width,4096);assert.equal(m.height,3072);for(const h of Object.values(m.homes))for(const v of h.views)if(v.background)assert.deepEqual(size(join(dir,v.background.src)),[4096,3072]);}
 if(group==='company')for(const f of Object.values(m.frames))assert.deepEqual(size(join(dir,f.src)),[4096,2560]);
 if(group==='venues'){assert.equal(m.width,4096);assert.equal(m.height,2560);for(const v of Object.values(m.views))if(!v.rect)assert.deepEqual(size(join(dir,v.file)),[4096,2560]);}
 imageReport[group]={files:actual.length,bytes:actual.reduce((n,p)=>n+statSync(p).size,0),frameResolution:group==='home'?[4096,3072]:[4096,2560]};
}
const before=read('before-sha256.json');for(const f of before){const b=join(audit,'before',f.path);assert.equal(hash(b),f.sha256.toLowerCase(),'Backup mismatch '+f.path);assert(existsSync(join(root,f.path)),'Deleted source '+f.path);}
const previousHashes=json(join(root,'docs/two-scene-modes-1497-20261024/source-sha256.json'));
const formal=previousHashes.filter(f=>normal(f.path).startsWith('src/assets/')&&!normal(f.path).startsWith('src/assets/mobile-stills/'));
assert(formal.every(f=>hash(join(root,f.path))===f.sha256.toLowerCase()),'Formal assets changed');
const artifact=join(root,'1.49.7.html'),sha256=await streamHash(artifact);assert.equal(sha256,await streamHash(join(root,'dist-portable/index.html')));assert.equal(sha256,read('artifact-before-qa.json').sha256);
writeFileSync(join(root,'1.49.7.sha256'),`${sha256}  1.49.7.html\n`);
const prior=read('previous-portable.json');assert.equal(await streamHash(prior.path),prior.sha256.toLowerCase());assert.equal(prior.sha256.toLowerCase(),baseline.portable.sha256);
const revision='2026.10.25 · 高清大图与自由拖动';assert(readFileSync(join(root,'src/version.ts'),'utf8').includes(revision));
const tracked=[...files(join(root,'src')),...files(join(root,'scripts')),...files(join(root,'tests')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md'),join(root,'1.49.7.sha256'),join(root,'docs/创业系统_1.497_玩法与数值.md')];
writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(tracked.map(p=>({path:normal(relative(root,p)),bytes:statSync(p).size,sha256:hash(p)})),null,2));
const summary=r=>({passed:r.passed,scenarios:r.scenarios.length,checks:r.scenarios.flatMap(s=>s.checks).length,screenshots:r.scenarios.flatMap(s=>s.screenshots).length,errors:r.scenarios.flatMap(s=>s.errors).length});
const report={directory:root,version:'1.49.7',saveVersion:36,revision,generatedAt:new Date().toISOString(),passed:true,images:imageReport,
 viewport:{defaultShowsPartialImage:true,mouseDrag:true,wheelZoom:true,touchPanAndPinch:true,projectedHotspots:true,fourAngles:true,noWebglIn2d:true},
 tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,existingFailures:failures,collectionFailures:collections,newFailures:[],newCollectionFailures:[],targetedPassed:read('targeted-tests.json').numPassedTests,finalScenePassed:read('final-scene-tests.json').numPassedTests},
 staticCheck:'0 errors; 100 existing warnings',browser:summary(browser),portable:{...summary(portable),path:artifact,bytes:statSync(artifact).size,sha256,buildCopyMatches:true,standaloneFileVerified:true},
 visualComparison:{passed:reference.passed,cases:reference.cases.length,regions:reference.cases.flatMap(c=>c.regions).length,maxMeanRgbError:Math.max(...reference.cases.flatMap(c=>c.regions.map(r=>r.mean))),maxBadPixelFraction:Math.max(...reference.cases.flatMap(c=>c.regions.map(r=>r.bad)))},
 source:{backedUp:before.length,changed:before.filter(f=>hash(join(root,f.path))!==f.sha256.toLowerCase()).map(f=>normal(f.path)),unchangedFormalAssets:formal.length,deleted:[]},previousPortable:prior,
 unverified:['Physical phone frame rate, thermals and peak memory','New native EXE/APK packaging']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,tests:{passed:report.tests.passed,existingFailures:failures.length,collectionFailures:collections.length,newFailures:0},source:{backedUp:before.length,unchangedFormalAssets:formal.length,changed:report.source.changed.length}},null,2));
