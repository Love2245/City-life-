/** 汇总整轮测试与最后完整文件复测，逐项对照旧失败，记录所有源码修改和正式素材哈希。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/company-1497-20261024');
const read=path=>JSON.parse(readFileSync(join(root,path),'utf8').replace(/^\uFEFF/,''));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const key=result=>result.name.replaceAll('\\','/').split('/tests/').at(-1);
function merged(report,replacements=[]){const files=new Map(report.testResults.map(file=>[key(file),file]));for(const latest of replacements)for(const file of latest.testResults)files.set(key(file),file);return files;}
const baseline=merged(read('docs/fixes-before-1497-20261024/full-tests.json'),[read('docs/fixes-before-1497-20261024/affected-final.json')]);
const current=merged(read('docs/company-1497-20261024/full-final.json'),[read('docs/company-1497-20261024/company-final.json')]);
const failed=files=>[...files].flatMap(([file,result])=>result.assertionResults.filter(a=>a.status==='failed').map(a=>({file,test:a.fullName,message:a.failureMessages?.[0]?.split('\n')[0]})));
const old=failed(baseline),failures=failed(current),oldSet=new Set(old.map(a=>`${a.file}:${a.test}`));
const newFailures=failures.filter(a=>!oldSet.has(`${a.file}:${a.test}`));
const collection=files=>[...files].filter(([,r])=>r.status==='failed'&&!r.assertionResults.length).map(([file])=>file);
const previousCollection=new Set(collection(baseline)),collectionFailures=collection(current),newCollectionFailures=collectionFailures.filter(f=>!previousCollection.has(f));
const assertions=[...current.values()].flatMap(r=>r.assertionResults),companyTests=[...current].filter(([name])=>name==='company.test.ts'||name==='companyUi.test.ts').flatMap(([,r])=>r.assertionResults);
const staticLog=readFileSync(join(out,'check-final.log'),'utf8'),check=/svelte-check found (\d+) errors? and (\d+) warnings?/.exec(staticLog);assert(check);
const browser=read('docs/company-1497-20261024/browser/verification.json');
assert(browser.passed&&browser.scenarios.length===11,'缺少完整11组浏览器验收');
const runtimeErrors=browser.scenarios.flatMap(s=>s.errors);assert.equal(runtimeErrors.length,0);
const before=read('docs/company-1497-20261024/before-sha256.json');const originals=new Map(before.map(f=>[f.path.replaceAll('\\','/'),f]));
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const path=join(dir,name),rel=relative(root,path).replaceAll('\\','/');if(rel==='src/assets')continue;if(statSync(path).isDirectory())walk(path);else if(/\.(ts|svelte|json|js|mjs)$/.test(name))files.push(rel);}}
for(const folder of ['src','tests','scripts'])walk(join(root,folder));files.push('源码副本说明_1.497.md');
const changed=[],added=[],deleted=[];
for(const path of files){const after=sha(join(root,path)),prior=originals.get(path);if(!prior)added.push({path,sha256:after,bytes:statSync(join(root,path)).size});else if(prior.sha256!==after)changed.push({path,before:prior.sha256,after,bytes:statSync(join(root,path)).size});}
for(const path of originals.keys())if(!existsSync(join(root,path)))deleted.push(path);
writeFileSync(join(out,'source-sha256.json'),JSON.stringify({changed,added,deleted},null,2));
const copy=read('docs/source-copy-1497-20261024/copied-files.json');
let assetCount=0,assetBytes=0;const assetMismatches=[];
for(const file of copy){const path=file.path.replaceAll('\\','/');if(!path.startsWith('src/assets/'))continue;assetCount++;assetBytes+=file.bytes;if(!existsSync(join(root,path))||sha(join(root,path))!==file.sha256)assetMismatches.push(path);}
const verification={directory:root,version:'1.49.7',saveVersion:36,revision:'2026.10.24 · 公司创业系统',generatedAt:new Date().toISOString(),
  method:'Complete suite plus latest complete-file rerun of company.test.ts, companyUi.test.ts and districtServicesData.test.ts; no skipped assertions.',
  tests:{total:assertions.length,passed:assertions.filter(a=>a.status==='passed').length,failed:failures.length,pending:assertions.filter(a=>a.status==='pending').length,
    company:{total:companyTests.length,passed:companyTests.filter(a=>a.status==='passed').length,failed:companyTests.filter(a=>a.status==='failed').length},
    existingFailures:failures,newFailures,collectionFailures,newCollectionFailures},
  staticCheck:{errors:Number(check[1]),warnings:Number(check[2])},
  browser:{passed:browser.passed,scenarios:browser.scenarios.length,checks:browser.scenarios.flatMap(s=>s.checks).length,screenshots:browser.scenarios.flatMap(s=>s.screenshots).length,runtimeErrors:runtimeErrors.length,chrome:browser.browser,exitCodeAtCompletion:browser.exitCodeAtCompletion??null},
  source:{changedFiles:changed.length,addedFiles:added.length,deletedFiles:deleted.length,manifest:'source-sha256.json',backupFiles:before.length},
  formalAssets:{files:assetCount,bytes:assetBytes,sha256Mismatches:assetMismatches},
  notRun:['Tauri native cold compilation','EXE/APK/portable HTML builds','native Android device installation and touch verification','TapTap/store upload and acceptance']};
writeFileSync(join(out,'verification.json'),JSON.stringify(verification,null,2));
assert.equal(newFailures.length,0,'有新增测试失败');assert.equal(newCollectionFailures.length,0);assert.equal(verification.tests.company.failed,0);assert.equal(verification.staticCheck.errors,0);assert.equal(assetMismatches.length,0,'正式素材发生意外变化');assert.equal(deleted.length,0,'有源码删除需核实');
process.stdout.write(JSON.stringify({tests:{passed:verification.tests.passed,failed:verification.tests.failed,newFailures:newFailures.length,collectionFailures:collectionFailures.length,company:verification.tests.company},staticCheck:verification.staticCheck,browser:verification.browser,source:verification.source,formalAssets:{files:assetCount,sha256Mismatches:assetMismatches.length}},null,2)+'\n');
