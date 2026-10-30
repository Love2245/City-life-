import {readdirSync,readFileSync,copyFileSync,mkdirSync,statSync,writeFileSync,existsSync,createReadStream} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/company-calibration-1497-20261026');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const normal=p=>p.replaceAll('\\','/');mkdirSync(join(audit,'before'),{recursive:true});
const manifest=join(audit,'before-sha256.json');assert(!existsSync(manifest),'Do not overwrite the prior baseline');
const paths=[...walk(join(root,'src')).filter(p=>!normal(relative(root,p)).startsWith('src/assets/')),...walk(join(root,'scripts')),...walk(join(root,'tests')),
 ...['package.json','vite.config.ts','vite.portable.config.ts','vite.npcPortraitLibrary.ts','tsconfig.json','index.html','npc对话修正.txt','1.49.7.sha256','源码副本说明_1.497.md','docs/创业系统_1.497_玩法与数值.md'].map(p=>join(root,p))];
const rows=paths.map(p=>{const path=normal(relative(root,p)),dest=join(audit,'before',path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(p,dest);return{path,bytes:statSync(p).size,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')};});
writeFileSync(manifest,JSON.stringify(rows,null,2));
const portable=join(root,'1.49.7.html'),archive=join(root,'待清理文件/便携版历史/1.49.7_经营功能候选_20261025.html');mkdirSync(dirname(archive),{recursive:true});assert(!existsSync(archive));copyFileSync(portable,archive);
const digest=createHash('sha256');for await(const bytes of createReadStream(archive,{highWaterMark:8*1024*1024}))digest.update(bytes);const sha256=digest.digest('hex');assert.equal(sha256,'9d5c6e15dcc37525768e6e8814d285658a047aa2434b3c3831e7674012d42722');
writeFileSync(join(audit,'previous-portable.json'),JSON.stringify({path:archive,bytes:statSync(archive).size,sha256},null,2));console.log(JSON.stringify({backedUp:rows.length,audit,sha256}));
