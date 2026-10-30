import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync,createReadStream} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/two-scene-modes-1497-20261024');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),read=p=>json(join(audit,p));
const normal=p=>p.replaceAll('\\','/'),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function streamHash(p){const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const previous=json(join(root,'docs/mobile-stills-company-return-1497-20261024/verification.json'));
const full=read('full-tests.json'),assertions=full.testResults.flatMap(s=>s.assertionResults.map(t=>({...t,file:basename(s.name)})));
const failures=assertions.filter(t=>t.status==='failed').map(t=>({file:t.file,test:t.fullName,message:t.failureMessages[0]?.split('\n')[0]}));
const old=new Set(previous.tests.existingFailures.map(t=>t.file+'|'+t.test));
const newFailures=failures.filter(t=>!old.has(t.file+'|'+t.test));
const collections=full.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>basename(s.name));
assert.deepEqual(newFailures,[]);assert(collections.every(file=>previous.tests.collectionFailures.includes(file)));assert.equal(full.numPendingTests,0);
const browser=read('browser-final/verification.json'),portable=read('portable-final/verification.json');assert(browser.passed&&portable.passed);assert(browser.scenarios.length>=6);assert(portable.scenarios.length>=3);
assert(['home','company','store'].every(scene=>['pc','pe'].every(mode=>browser.scenarios.some(s=>s.scene===scene&&s.mode===mode))));
assert(['home','company','store'].every(scene=>portable.scenarios.some(s=>s.scene===scene)));assert(portable.scenarios.some(s=>s.mode==='pc')&&portable.scenarios.some(s=>s.mode==='pe'));
assert(readFileSync(join(audit,'check.log'),'utf8').includes('found 0 errors'));
const artifact=join(root,'1.49.7.html'),artifactHash=await streamHash(artifact);assert.equal(artifactHash,await streamHash(join(root,'dist-portable/index.html')));assert.equal(artifactHash,read('artifact-before-qa.json').sha256);
writeFileSync(join(root,'1.49.7.sha256'),`${artifactHash}  1.49.7.html\n`);
const before=read('before-sha256.json'),compared=before.map(f=>({path:normal(f.path),before:f.sha256.toLowerCase(),after:existsSync(join(root,f.path))?hash(join(root,f.path)):null}));assert(compared.every(f=>f.after));
const oldHashes=json(join(root,'docs/mobile-stills-company-return-1497-20261024/source-sha256.json'));
const oldAssets=oldHashes.filter(f=>normal(f.path).startsWith('src/assets/')&&!normal(f.path).match(/^src\/assets\/mobile-stills\/(?:home|company|venues)\/README\.md$/));
assert(oldAssets.every(f=>existsSync(join(root,f.path))&&hash(join(root,f.path))===f.sha256.toLowerCase()),'Existing scene image/model/texture changed');
const prior=read('previous-portable.json');assert.equal(await streamHash(prior.path),prior.sha256.toLowerCase());assert.equal(prior.sha256.toLowerCase(),previous.portable.sha256);
const tracked=[...files(join(root,'src')),...files(join(root,'scripts')),...files(join(root,'tests')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md'),join(root,'1.49.7.sha256'),join(root,'docs/创业系统_1.497_玩法与数值.md')];
const hashes=tracked.map(p=>({path:normal(relative(root,p)),sha256:hash(p),bytes:statSync(p).size}));writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const oldPaths=new Set(oldHashes.map(f=>normal(f.path)));
const revision='2026.10.24 · 3D与2D双场景';assert(readFileSync(join(root,'src/version.ts'),'utf8').includes(revision));
const summary=r=>({passed:r.passed,scenarios:r.scenarios.length,checks:r.scenarios.flatMap(s=>s.checks??[]).length,screenshots:r.scenarios.flatMap(s=>s.screenshots??[]).length,errors:r.scenarios.flatMap(s=>s.errors??[]).length});
const report={directory:root,version:'1.49.7',saveVersion:36,revision,generatedAt:new Date().toISOString(),passed:true,
  modes:{choices:['3d','2d'],pcDefault:'3d',mobileDefault:'2d',legacyFlat:'2d',legacyPhonePseudo3d:'2d',explicit3dPersists:true,removedPureFlat:true},
  tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,existingFailures:failures,collectionFailures:collections,newFailures:[],newCollectionFailures:[],method:'Complete stable-source run; old pure-flat contracts replaced with actual 2D screenshot renderer assertions while gameplay and PC 3D assertions remain.'},
  staticCheck:'0 errors; 100 existing warnings',browser:summary(browser),portable:{...summary(portable),path:artifact,bytes:statSync(artifact).size,sha256:artifactHash,buildCopyMatches:true,standaloneFileVerified:true},
  source:{backedUp:before.length,changed:compared.filter(f=>f.before!==f.after).map(f=>f.path),added:hashes.filter(f=>!oldPaths.has(f.path)).map(f=>f.path),deleted:[],unchangedAssets:oldAssets.length,assetDocumentationChanges:['src/assets/mobile-stills/home/README.md','src/assets/mobile-stills/company/README.md','src/assets/mobile-stills/venues/README.md']},previousPortable:prior,
  unverified:['Physical mobile-device frame rate, thermals and peak memory','New native EXE/APK packaging'],};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,tests:{passed:full.numPassedTests,failed:full.numFailedTests,newFailures:0,collectionFailures:collections.length},browser:summary(browser),portable:report.portable,changed:report.source.changed.length,added:report.source.added.length,unchangedAssets:oldAssets.length},null,2));
