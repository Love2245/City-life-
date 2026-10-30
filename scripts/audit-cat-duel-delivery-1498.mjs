import {readFileSync,writeFileSync,existsSync,readdirSync,createReadStream} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-1498-20261029');
const json=p=>JSON.parse(readFileSync(join(out,p),'utf8').replace(/^\uFEFF/,''));
const baseline=json('baseline-tests.json'),current=json('full-tests-final.json');
function failed(report){return report.testResults.flatMap(s=>s.assertionResults.filter(a=>a.status==='failed').map(a=>({file:s.name.split('/tests/')[1]??s.name.split('\\tests\\')[1],name:a.fullName,message:a.failureMessages?.[0]?.split('\n').slice(0,4).join('\n')})));}
const old=failed(baseline),now=failed(current),key=a=>a.file+'::'+a.name;
const prior=new Set(old.map(key)),latest=new Set(now.map(key));
const emptySuites=r=>r.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>({file:s.name.split('/tests/')[1]??s.name.split('\\tests\\')[1],message:s.message?.slice(0,500)}));
const regression={baseline:{total:baseline.numTotalTests,passed:baseline.numPassedTests,failed:baseline.numFailedTests,collectionFailures:emptySuites(baseline)},current:{total:current.numTotalTests,passed:current.numPassedTests,failed:current.numFailedTests,collectionFailures:emptySuites(current)},newFailures:now.filter(a=>!prior.has(key(a))),resolved:old.filter(a=>!latest.has(key(a))),retainedFailures:now.filter(a=>prior.has(key(a)))};
writeFileSync(join(out,'regression-comparison.json'),JSON.stringify(regression,null,2));console.log('TESTS',JSON.stringify({baseline:regression.baseline.total,current:regression.current.total,failed:regression.current.failed,newFailures:regression.newFailures,resolved:regression.resolved.length}));
const ssr=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});let cards;
try{cards=await ssr.ssrLoadModule('/src/game/core/catDuelCards.ts');const catalogue=cards.DUEL_CARDS.map(c=>({id:c.id,name:c.name,family:c.family,normal:c,plus:cards.getDuelCard(c.id+'_plus')}));writeFileSync(join(out,'cards-36.json'),JSON.stringify(catalogue,null,2));const lines=['# 1.498 喵喵对决卡池','', '36种基础牌，每种有普通版及一次永久强化的＋版。费用与实际效果均来自游戏定义。卡面统一为低多边形猫咪插画。','', '| 卡牌 | 打法 | 普通费用 | 普通效果 | ＋费用 | ＋效果 |','| --- | --- | ---: | --- | ---: | --- |',...catalogue.map(c=>`| ${c.name} | ${c.family} | ${c.normal.cost} | ${c.normal.desc} | ${c.plus.cost} | ${c.plus.desc} |`)];writeFileSync(join(out,'卡牌一览.md'),lines.join('\n')+'\n');}finally{await ssr.close();}
const hash=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
const original=JSON.parse(readFileSync(join(root,'docs/source-copy-1498-20261029/copied-files.json'),'utf8').replace(/^\uFEFF/,''));const assets=original.filter(f=>f.path.replaceAll('\\','/').startsWith('src/assets/'));let bytes=0;const differences=[];
let cursor=0;await Promise.all(Array.from({length:6},async()=>{while(cursor<assets.length){const f=assets[cursor++],p=join(root,f.path);bytes+=f.bytes;const sha=existsSync(p)?await hash(p):null;if(sha?.toLowerCase()!==f.sha256.toLowerCase())differences.push({path:f.path,expected:f.sha256,actual:sha});}}));
const before=json('before-manifest.json'),changes=[];const basePaths=new Set(before.map(f=>f.path.replaceAll('\\','/')));
for(const f of before){const p=join(root,f.path),sha=existsSync(p)?await hash(p):null;if(sha!==f.sha256)changes.push({path:f.path,kind:sha?'changed':'missing',before:f.sha256,after:sha});}
for(const dir of ['src','tests','scripts'])for(const entry of readdirSync(join(root,dir),{recursive:true,withFileTypes:true})){if(!entry.isFile())continue;const path=join(entry.parentPath??entry.path,entry.name),rel=relative(root,path).replaceAll('\\','/');if(!rel.startsWith('src/assets/')&&!basePaths.has(rel))changes.push({path:rel,kind:'new',after:await hash(path)});}
const preservation={at:new Date().toISOString(),assets:{checked:assets.length,bytes,differences},changes};writeFileSync(join(out,'preservation-audit.json'),JSON.stringify(preservation,null,2));console.log('PRESERVATION',JSON.stringify({assets:assets.length,bytes,differences:differences.length,sourceChanges:changes.length}));
