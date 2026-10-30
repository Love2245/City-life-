import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync,createReadStream} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/mobile-stills-company-return-1497-20261024');
const json=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')),read=file=>json(join(audit,file));
const normal=file=>file.replaceAll('\\','/'),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
async function streamHash(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);}

const previous=json(join(root,'docs/company-commute-headgear-1497-20261024/verification.json'));
const full=read('final-full-tests.json');
const assertions=full.testResults.flatMap(suite=>suite.assertionResults.map(test=>({...test,file:basename(suite.name)})));
const failures=assertions.filter(test=>test.status==='failed').map(test=>({file:test.file,test:test.fullName,message:test.failureMessages[0]?.split('\n')[0]}));
const oldFailures=new Set(previous.tests.existingFailures.map(test=>test.file+'|'+test.test));
const newFailures=failures.filter(test=>!oldFailures.has(test.file+'|'+test.test));
const collections=full.testResults.filter(suite=>suite.status==='failed'&&!suite.assertionResults.length).map(suite=>basename(suite.name));
const newCollections=collections.filter(file=>!previous.tests.collectionFailures.includes(file));
assert.deepEqual(newFailures,[]);assert.deepEqual(newCollections,[]);assert.equal(full.numPendingTests,0);
assert(assertions.filter(test=>test.file.startsWith('company')).every(test=>test.status==='passed'));
assert(readFileSync(join(audit,'static-check.log'),'utf8').includes('found 0 errors and 100 warnings'));
const version=readFileSync(join(root,'src/version.ts'),'utf8');
assert(version.includes('export const VERSION = "1.49.7"'));assert(version.includes('2026.10.24 · 手机固定场景与公司返家'));

const required={
  companyAngles:read('company-angles/subset-verification.json'),companyDesktop:read('company-pc/subset-verification.json'),
  commuteRemaining:read('commute-journeys-remaining/verification.json'),home:read('home-browser/verification.json'),
  venues:read('venues/verification.json'),cafePurchase:read('venue-lin-final/verification.json'),
  portableDesktop:read('portable-desktop/verification.json'),portablePhone:read('portable-phone-journey/verification.json'),
  portableVenues:read('portable-venues/verification.json'),
};
for(const[key,report]of Object.entries(required))assert(report.passed,`${key} did not pass`);
const initialCommute=read('commute-journeys/verification.json');
assert(initialCommute.scenarios.slice(0,2).every(scenario=>scenario.passed));
const artifact=join(root,'1.49.7.html'),artifactHash=await streamHash(artifact);
assert.equal(artifactHash,required.portableDesktop.sha256);assert.equal(artifactHash,await streamHash(join(root,'dist-portable/index.html')));
writeFileSync(join(root,'1.49.7.sha256'),`${artifactHash}  1.49.7.html\n`);

const before=read('before-sha256.json');
const compared=before.map(file=>({path:normal(file.path),before:file.sha256.toLowerCase(),after:existsSync(join(root,file.path))?hash(join(root,file.path)):null}));
assert(compared.every(file=>file.after),'Existing source was removed');
const assetBefore=json(join(root,'docs/company-commute-headgear-1497-20261024/source-sha256.json')).filter(file=>normal(file.path).startsWith('src/assets/'));
assert.equal(assetBefore.length,2244);assert(assetBefore.every(file=>existsSync(join(root,file.path))&&hash(join(root,file.path))===file.sha256.toLowerCase()),'Existing formal assets changed');
const archived=read('previous-portable.json');assert.equal(await streamHash(archived.archive),archived.sha256.toLowerCase());assert.equal(archived.sha256.toLowerCase(),previous.portable.sha256);
const paths=[...files(join(root,'src')),...files(join(root,'scripts')),...files(join(root,'tests')),join(root,'package.json'),join(root,'vite.portable.config.ts'),join(root,'源码副本说明_1.497.md'),join(root,'1.49.7.sha256'),join(root,'docs/创业系统_1.497_玩法与数值.md')];
const hashes=paths.map(file=>({path:normal(relative(root,file)),sha256:hash(file),bytes:statSync(file).size}));writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const originalPaths=new Set([...before,...assetBefore].map(file=>normal(file.path)));
const assetStats=Object.fromEntries(['home','company','venues'].map(kind=>{const images=files(join(root,'src/assets/mobile-stills',kind)).filter(file=>file.endsWith('.webp'));return[kind,{images:images.length,bytes:images.reduce((sum,file)=>sum+statSync(file).size,0)}];}));
const summary=report=>({passed:report.passed,scenarios:report.scenarios?.length??report.journeys?.length,checks:report.scenarios?.flatMap(s=>s.checks??[]).length,errors:report.errors??report.scenarios?.flatMap(s=>s.errors??[])??[]});
const report={directory:root,generatedAt:new Date().toISOString(),version:'1.49.7',saveVersion:36,revision:'2026.10.24 · 手机固定场景与公司返家',passed:true,
  tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,companyPassed:assertions.filter(test=>test.file.startsWith('company')).length,existingFailures:failures,collectionFailures:collections,newFailures,newCollectionFailures:newCollections,method:'Complete final-source suite. The former mobile-expects-3D UI contract was updated to test separate PC 3D and phone still factories; no skipped or forced assertions.'},
  staticCheck:'0 errors; 100 existing warnings',browser:Object.fromEntries(Object.entries(required).map(([key,value])=>[key,summary(value)])),
  portable:{path:artifact,bytes:statSync(artifact).size,sha256:artifactHash,buildCopyMatches:true,standaloneFileVerified:true,desktopFree3d:true,phoneHomeAndCompanyNoWebgl:true},
  stillAssets:assetStats,
  source:{backedUp:before.length,changed:compared.filter(file=>file.before!==file.after).map(file=>file.path),added:hashes.filter(file=>!originalPaths.has(file.path)).map(file=>file.path),deleted:[],formalAssetsUnchanged:assetBefore.length},previousPortable:archived,
  diagnosticAttempts:{fullTests:'full-tests.json records an earlier run against the old mobile UI test contract; final-full-tests.json is the final stable run.',commute:'commute-journeys first two scenarios passed; its flat QA expected a 3D-only selector. The remaining flat and phone routes passed in commute-journeys-remaining.',cafe:'venue-lin-journey retains diagnostic screenshots from a QA event-confirmation omission; venue-lin-final verifies the full real purchase and event journey.'},
  unverified:['Physical Android device FPS, thermals and peak memory','New native EXE/APK packaging'],
};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,tests:{passed:full.numPassedTests,failed:full.numFailedTests,newFailures:newFailures.length,newCollections:newCollections.length},portable:report.portable,assets:assetStats,source:{backedUp:before.length,changed:report.source.changed.length,added:report.source.added.length,formalAssetsUnchanged:assetBefore.length}},null,2));
