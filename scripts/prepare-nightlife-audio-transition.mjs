import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/nightlife-audio-transition-1497-20261027');mkdirSync(out,{recursive:true});
assert(!existsSync(join(out,'before-sha256.json')),'Baseline already exists; do not replace it');
async function hash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
const previousDir=join(root,'docs/interaction-audio-1497-20261027'),previous=JSON.parse(readFileSync(join(previousDir,'verification.json'),'utf8'));
assert(previous.passed);const oldFiles=JSON.parse(readFileSync(join(previousDir,'source-sha256.json'),'utf8')),drift=[];
for(const file of oldFiles)if(await hash(join(root,file.path))!==file.sha256)drift.push(file.path);assert.deepEqual(drift,[]);
const paths=new Set([...oldFiles.map(f=>f.path),'docs/创业系统_1.497_玩法与数值.md']);
const backup=[];for(const path of paths){const source=join(root,path),target=join(out,'before',path);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);backup.push({path,bytes:statSync(source).size,sha256:await hash(target)});}
writeFileSync(join(out,'before-sha256.json'),JSON.stringify(backup,null,2));writeFileSync(join(out,'baseline-source-drift.json'),'[]');writeFileSync(join(out,'previous-verification.json'),JSON.stringify(previous,null,2));
const archive='待清理文件/便携版历史/1.49.7_场所多套音乐与区域转场修改前_20261027.html';assert(!existsSync(join(root,archive)));copyFileSync(join(root,'1.49.7.html'),join(root,archive));const sha256=await hash(join(root,archive));assert.equal(sha256,previous.portable.sha256);writeFileSync(join(out,'previous-portable.json'),JSON.stringify({archive,bytes:statSync(join(root,archive)).size,sha256},null,2));
const assets=[];async function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else assets.push({path:relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:await hash(p)});}}
await walk(join(root,'src/assets'));writeFileSync(join(out,'asset-baseline.json'),JSON.stringify(assets,null,2));
const full=JSON.parse(readFileSync(join(previousDir,'full-tests.json'),'utf8')),targeted=JSON.parse(readFileSync(join(previousDir,'targeted-final.json'),'utf8'));
full.testResults=full.testResults.map(f=>f.name.endsWith('companyOfficeLighting3D.test.ts')?targeted.testResults.find(r=>r.name===f.name):f);
full.numPassedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(a=>a.status==='passed').length,0);full.numFailedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(a=>a.status==='failed').length,0);full.baselineBasis='Previous full run plus verified renderer-test update; original run retained in interaction-audio evidence';
writeFileSync(join(out,'full-baseline.json'),JSON.stringify(full));console.log(JSON.stringify({backupFiles:backup.length,assets:assets.length,previousSha256:sha256,baselinePassed:full.numPassedTests,baselineFailed:full.numFailedTests},null,2));
