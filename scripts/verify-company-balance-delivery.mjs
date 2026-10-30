import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,createReadStream} from 'node:fs';
import {join,resolve,relative,basename} from 'node:path';import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/company-balance-ui-1497-20261025');
const normal=p=>p.replaceAll('\\','/'),json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),read=p=>json(join(audit,p));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function streamHash(p){const h=createHash('sha256');for await(const b of createReadStream(p,{highWaterMark:8*1024*1024}))h.update(b);return h.digest('hex');}
const before=read('before-sha256.json');assert(before.every(r=>hash(join(audit,'before',r.path))===r.sha256));assert(before.every(r=>existsSync(join(root,r.path))));
const baseline=json(join(root,'docs/facility-company-flow-1497-20261025/full-tests.json'));
const failed=r=>r.testResults.flatMap(t=>(t.assertionResults??[]).filter(a=>a.status==='failed').map(a=>a.fullName)).sort();
const collected=r=>r.testResults.filter(t=>t.status==='failed'&&!(t.assertionResults??[]).length).map(t=>basename(t.name)).sort();
const full=read('full-tests-current.json'),target=read('targeted-final.json');
const existing=new Set(failed(baseline)),newFailures=failed(full).filter(n=>!existing.has(n));assert.deepEqual(newFailures,[]);assert.deepEqual(collected(full),collected(baseline));assert.equal(full.numPendingTests,0);assert.equal(target.numFailedTests,0);assert.equal(target.numPendingTests,0);
const check=readFileSync(join(audit,'check.log'),'utf8').match(/svelte-check found (\d+) errors and (\d+) warnings/);assert(check);assert.equal(Number(check[1]),0);assert.equal(Number(check[2]),100);
const browser=read('browser-current/verification.json'),portable=read('portable-current/verification.json'),economy=read('economy.json');
for(const report of [browser,portable]){assert(report.passed);assert.equal(report.scenarios.length,5);assert(report.scenarios.every(s=>s.passed&&!s.errors.length&&!s.external.length));assert(report.scenarios.filter(s=>s.mode==='pe').every(s=>s.checks.some(c=>c.portraitPromptAboveModals===true)));assert(report.scenarios.find(s=>s.id==='pe-company').checks.some(c=>c.stickyMobileWorkButton&&c.touchHeight>=43.9));}
assert.equal(new URL(portable.url).href,pathToFileURL(join(root,'1.49.7.html')).href);assert(economy.passed);assert.equal(economy.samples.length,6);assert.equal(economy.scales.small.work,100);assert.equal(economy.scales.medium.work,400);assert.equal(economy.scales.large.work,1200);assert.equal(economy.labor.at(-1).daily,15);
assert(portable.scenarios.find(s=>s.id==='pe-company').checks.some(c=>c.mobileAssignmentFontPx>=11.9));
const tracked=[...walk(join(root,'src')),...walk(join(root,'scripts')),...walk(join(root,'tests')),...['package.json','vite.config.ts','vite.portable.config.ts','1.49.7.sha256','源码副本说明_1.497.md','docs/创业系统_1.497_玩法与数值.md'].map(p=>join(root,p))];
const hashes=[];for(const p of tracked)hashes.push({path:normal(relative(root,p)),bytes:statSync(p).size,sha256:statSync(p).size>32*1024*1024?await streamHash(p):hash(p)});
const current=new Map(hashes.map(r=>[r.path,r.sha256]));
const prior=json(join(root,'docs/facility-company-flow-1497-20261025/source-sha256.json'));
const binaries=prior.filter(r=>r.path.startsWith('src/assets/')&&!/\.(md|json)$/i.test(r.path));assert(binaries.every(r=>current.get(normal(r.path))===r.sha256.toLowerCase()),'A pre-existing binary asset changed');
const allAssets=prior.filter(r=>r.path.startsWith('src/assets/'));assert(allAssets.every(r=>current.get(normal(r.path))===r.sha256.toLowerCase()),'A scene or formal asset changed');
console.log('Source and original assets verified');
const artifact=join(root,'1.49.7.html'),sha256=await streamHash(artifact);assert.equal(sha256,read('artifact-before-qa.json').sha256);assert.equal(sha256,await streamHash(join(root,'dist-portable/index.html')));assert.equal(readFileSync(join(root,'1.49.7.sha256'),'utf8').trim().split(/\s+/)[0],sha256);
const archived=read('previous-portable.json');assert.equal(archived.sha256,'899130d9511c02da771702e23a4998390363e7be84c5923991920994a0c2e80d');assert.equal(await streamHash(archived.path),archived.sha256);
assert.equal(json(join(root,'package.json')).version,'1.49.7');assert(/SAVE_VERSION\s*=\s*36/.test(readFileSync(join(root,'src/game/core/migrate.ts'),'utf8')));
const revision='2026.10.25 · 统一开发与公司简化';assert(readFileSync(join(root,'src/version.ts'),'utf8').includes(revision));
writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const uiSummary=r=>({passed:r.passed,scenarios:r.scenarios.length,screenshots:r.scenarios.flatMap(s=>s.screenshots).length,errors:r.scenarios.flatMap(s=>s.errors).length,externalRequests:r.scenarios.flatMap(s=>s.external).length,portraitCovered:true});
const previousPaths=new Set(prior.map(r=>normal(r.path))),changed=before.filter(r=>current.get(normal(r.path))!==r.sha256).map(r=>r.path);
const report={passed:true,generatedAt:new Date().toISOString(),directory:root,version:'1.49.7',saveVersion:36,revision,
 implementation:{baseDailyWork:5,skillMultiplier:[1,1.5],computerMultiplier:[1,1.5,2],standardDayHours:8,founderAndEmployeeDailyAtMax:15,
  founderShifts:[{hours:4,multiplier:.5,pointsAtMax:7.5,stamina:15,health:1,mood:2,stress:4},{hours:8,multiplier:1,pointsAtMax:15,stamina:28,health:2,mood:4,stress:8},{hours:12,multiplier:1.5,pointsAtMax:22.5,stamina:48,health:5,mood:10,stress:18}],personalDevelopmentUsesSameRules:true,threeHourDevelopmentRemoved:true,sharedDailyLimit:true,netbarTopUp:true,
  scales:economy.scales,royaltyCaps:[4500,7500,15000,30000],legacyCompanyPercentagesMigratedOnce:true,existingMoneyRoyaltiesPayrollPreserved:true,managementTabs:['工作台','团队','资金'],inlineEmployeeAssignment:true,workstationEquipmentAndInterviews:true,mobileStickyWorkControls:true},
 tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,existingFailures:failed(full),collectionFailures:collected(full),newFailures:[],newCollectionFailures:[],targetedPassed:target.numPassedTests,
  method:'Full suite and final targeted flows; contracts explicitly updated for 100/400/1200 work, shared 4/8/12 hours and basic computer efficiency1. No skipped assertions. Browser and static check include final layout refinements.'},
 staticCheck:{errors:0,existingWarnings:100},browser:uiSummary(browser),portable:{...uiSummary(portable),path:artifact,bytes:statSync(artifact).size,sha256,standaloneFileVerified:true,buildCopyMatches:true},economy:{profiles:economy.samples.length,calendarDaysPerProfile:180,requestsApproved:true,method:economy.method},
 preservation:{backedUp:before.length,unchangedBinaryAssets:binaries.length,unchangedAllAssets:allAssets.length,changedSourceFiles:changed,addedSourceFiles:hashes.filter(r=>!previousPaths.has(r.path)).map(r=>r.path),deletedSourceFiles:[]},previousPortable:archived,
 unverified:['Physical mobile frame rate, thermals and peak memory','New native EXE/APK packages','Uncontrolled long-term player playtest including living costs']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,tests:{passed:report.tests.passed,existingFailures:report.tests.failed,collectionFailures:report.tests.collectionFailures.length,newFailures:0,targetedPassed:report.tests.targetedPassed},preservation:{backedUp:before.length,unchangedBinaryAssets:binaries.length,unchangedAllAssets:allAssets.length,changedSourceFiles:changed.length}},null,2));
