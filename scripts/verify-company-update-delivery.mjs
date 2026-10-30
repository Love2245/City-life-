import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync,createReadStream} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/company-commute-headgear-1497-20261024');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const read=p=>json(join(audit,p)),normal=p=>p.replaceAll('\\','/');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function streamHash(p){const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');}
const previous=json(join(root,'docs/office-remaster-1497-20261024/verification.json'));
const full=read('full-tests.json'),assertions=full.testResults.flatMap(f=>f.assertionResults.map(t=>({...t,file:basename(f.name)})));
const failures=assertions.filter(t=>t.status==='failed').map(t=>({file:t.file,test:t.fullName,message:t.failureMessages[0]?.split('\n')[0]}));
const keys=new Set(previous.tests.existingFailures.map(t=>t.file+':'+t.test));
const newFailures=failures.filter(t=>!keys.has(t.file+':'+t.test));
const collections=full.testResults.filter(f=>f.status==='failed'&&!f.assertionResults.length).map(f=>basename(f.name));
const newCollections=collections.filter(f=>!previous.tests.collectionFailures.includes(f));
assert.equal(newFailures.length,0,JSON.stringify(newFailures));assert.equal(newCollections.length,0,JSON.stringify(newCollections));
assert.equal(assertions.filter(t=>t.status==='pending').length,0);
const company=assertions.filter(t=>t.file.startsWith('company'));assert(company.length>=126);assert(company.every(t=>t.status==='passed'));
const browser=read('browser/verification.json'),journeys=read('journeys/verification.json'),portableJourneys=read('portable-journeys/verification.json'),portable=read('portable/verification.json');
assert(browser.passed&&browser.scenarios.length===11);assert(journeys.passed&&journeys.scenarios.length===4);assert(portableJourneys.passed&&portableJourneys.scenarios.length===4);assert(portable.passed&&portable.scenarios.length===2);
assert(readFileSync(join(audit,'check-final.log'),'utf8').includes('found 0 errors'));
const versionSource=readFileSync(join(root,'src/version.ts'),'utf8');assert(versionSource.includes('export const VERSION = "1.49.7"'));assert(versionSource.includes('2026.10.24 · 公司通勤与头套员工'));assert.equal(json(join(root,'package.json')).version,'1.49.7');
const artifact=join(root,'1.49.7.html'),artifactHash=await streamHash(artifact);assert.equal(artifactHash,portable.sha256);assert.equal(artifactHash,await streamHash(join(root,'dist-portable/index.html')));
writeFileSync(join(root,'1.49.7.sha256'),`${artifactHash}  1.49.7.html\n`);
const before=read('before-sha256.json'),compared=before.map(f=>({path:normal(f.path),before:f.sha256.toLowerCase(),after:existsSync(join(root,f.path))?hash(join(root,f.path)):null}));assert(compared.every(f=>f.after),'An existing source file was removed');
const assetBefore=json(join(root,'docs/office-remaster-1497-20261024/source-sha256.json')).filter(f=>normal(f.path).startsWith('src/assets/'));assert.equal(assetBefore.length,2244);
assert(assetBefore.every(f=>existsSync(join(root,f.path))&&hash(join(root,f.path))===f.sha256.toLowerCase()),'An existing formal asset changed');
const archived=read('previous-portable.json');assert.equal(await streamHash(archived.path),archived.sha256.toLowerCase());assert.equal(archived.sha256.toLowerCase(),previous.portable.sha256);
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const paths=[...files(join(root,'src')),...files(join(root,'scripts')),...files(join(root,'tests')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md'),join(root,'1.49.7.sha256'),join(root,'docs/创业系统_1.497_玩法与数值.md')];
const hashes=paths.map(p=>({path:normal(relative(root,p)),sha256:hash(p),bytes:statSync(p).size}));writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const basePaths=new Set(before.map(f=>normal(f.path))),assetPaths=new Set(assetBefore.map(f=>normal(f.path)));
const summary=r=>({passed:r.passed,scenarios:r.scenarios.length,checks:r.scenarios.flatMap(s=>s.checks??[]).length,screenshots:r.scenarios.flatMap(s=>s.screenshots??[]).length,errors:r.scenarios.flatMap(s=>s.errors??[]).length});
const report={directory:root,generatedAt:new Date().toISOString(),version:'1.49.7',saveVersion:36,revision:'2026.10.24 · 公司通勤与头套员工',passed:true,
  tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,companyPassed:company.length,existingFailures:failures,collectionFailures:collections,newFailures,newCollectionFailures:newCollections,method:'Complete stable-source suite; no individual assertion overrides or skipped tests'},
  staticCheck:'0 errors; 100 existing warnings',browser:summary(browser),journeys:summary(journeys),portableJourneys:summary(portableJourneys),portable:{...summary(portable),path:artifact,bytes:statSync(artifact).size,sha256:artifactHash,buildCopyMatches:true,standaloneFileVerified:true},
  source:{backedUp:before.length,changed:compared.filter(f=>f.before!==f.after).map(f=>f.path),added:hashes.filter(f=>!basePaths.has(f.path)&&!assetPaths.has(f.path)).map(f=>f.path),deleted:[],formalAssetsUnchanged:assetBefore.length},previousPortable:archived};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,tests:{passed:full.numPassedTests,failed:full.numFailedTests,companyPassed:company.length,newFailures:newFailures.length,newCollections:newCollections.length}},null,2));
