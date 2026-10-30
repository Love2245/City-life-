import {readFileSync,writeFileSync,existsSync,createReadStream,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-refine-1498-20261029');
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const baseline=read(join(root,'docs/cat-duel-1498-20261029/baseline-tests.json'));
const previous=read(join(root,'docs/cat-duel-1498-20261029/full-tests-final.json'));
const current=read(join(out,'full-tests.json'));
const file=s=>s.name.replaceAll('\\','/').split('/tests/')[1];
const failures=r=>r.testResults.flatMap(s=>s.assertionResults.filter(a=>a.status==='failed').map(a=>({file:file(s),name:a.fullName})));
const empty=r=>r.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>({file:file(s),message:s.message?.slice(0,500)}));
const key=a=>a.file+'::'+a.name,oldSet=new Set(failures(baseline).map(key)),previousSet=new Set(failures(previous).map(key));
const summarize=r=>({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,collectionFailures:empty(r)});
const regression={baseline1497:summarize(baseline),previous1498:summarize(previous),current:summarize(current),newFailuresAgainst1497:failures(current).filter(a=>!oldSet.has(key(a))),newFailuresAgainstPrevious1498:failures(current).filter(a=>!previousSet.has(key(a))),newCollectionFailures:empty(current).filter(a=>!empty(baseline).some(b=>a.file===b.file))};
writeFileSync(join(out,'regression-comparison.json'),JSON.stringify(regression,null,2));

const ssr=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
let facing;
try{
  const cards=await ssr.ssrLoadModule('/src/game/core/catDuelCards.ts');
  facing=(await ssr.ssrLoadModule('/src/lib/catArt.ts')).CAT_NATIVE_FACING;
  const catalogue=cards.DUEL_CARDS.map(c=>({id:c.id,name:c.name,family:c.family,normal:c,plus:cards.getDuelCard(c.id+'_plus')}));
  writeFileSync(join(out,'cards-36.json'),JSON.stringify(catalogue,null,2));
  writeFileSync(join(out,'卡牌一览.md'),['# 1.498 简化后的喵喵对决卡池','','36种基础牌及各自的＋版。数值、费用和说明直接读取当前游戏定义；历史卡牌ID保留，旧收藏和单张强化关系不变。','', '| 卡牌 | 打法 | 普通费用 | 普通效果 | ＋费用 | ＋效果 |','| --- | --- | ---: | --- | ---: | --- |',...catalogue.map(c=>`| ${c.name} | ${c.family} | ${c.normal.cost} | ${c.normal.desc} | ${c.plus.cost} | ${c.plus.desc} |`),''].join('\n'));
}finally{await ssr.close();}

const hash=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
const entries=readFileSync(join(out,'generated-assets.jsonl'),'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l.replace(/^\uFEFF/,'')));
const finalEntries=[...new Map(entries.map(e=>[e.group+'/'+e.key,e])).values()];
const cutoutAudit=read(join(out,'portrait-alpha-audit.json'));
const generated=[];
for(const e of finalEntries){const source=join(root,'src/assets/cats',e.group,e.key+'_idle.png'),destination=join(root,e.destination);generated.push({...e,source:'src/assets/cats/'+e.group+'/'+e.key+'_idle.png',nativeFacing:facing[e.key],sourceSha256:await hash(source),sha256:await hash(destination),bytes:statSync(destination).size,pixelAudit:cutoutAudit.rows.find(r=>r.path.replaceAll('\\','/')===e.destination.replaceAll('\\','/'))});}
writeFileSync(join(out,'generated-assets.json'),JSON.stringify({tool:'Built-in image_gen; edited original opaque PNGs; original PNG and WebP files preserved.',promptBrief:'Remove white backdrop and floor shadow. Preserve the exact pixel-art cat, all body parts, whiskers, accessories, white fur and native direction. Actual RGBA transparency; no white matte halo, accidental body holes, clipped limbs or checkerboard texture.',visualReview:{sheets:['portraits-players.png','portraits-opponents-a.png','portraits-opponents-b.png'],result:'All28 final idle sprites reviewed on dark and light backgrounds. No residual white backplate, detached floor shadow or unintended body holes visible at game display size. Natural spaces between bones, limbs and tail remain transparent. Spider was regenerated with safe padding after the first candidate clipped legs.'},count:generated.length,assets:generated},null,2));

const original=read(join(root,'docs/source-copy-1498-20261029/copied-files.json')).filter(f=>f.path.replaceAll('\\','/').startsWith('src/assets/'));
const differences=[];let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<original.length){const f=original[cursor++],path=join(root,f.path),sha=existsSync(path)?await hash(path):null;if(sha?.toLowerCase()!==f.sha256.toLowerCase())differences.push({path:f.path,expected:f.sha256,actual:sha});}}));
const before=read(join(out,'before-manifest.json')),changes=[];
for(const f of before){const path=join(root,f.path),sha=existsSync(path)?await hash(path):null;if(sha!==f.sha256)changes.push({path:f.path,before:f.sha256,after:sha});}
const archive=join(root,'待清理文件/1.49.8-喵喵对决初版-20261029/1.49.8.html');
const archivedRelease={path:'待清理文件/1.49.8-喵喵对决初版-20261029/1.49.8.html',bytes:statSync(archive).size,sha256:await hash(archive),expectedSha256:'298b520fc7db29977af5eb52c7470a3b1e12d27c63d8f7aa12e154a5dc07c08f'};
const preservation={createdAt:new Date().toISOString(),originalAssets:{checked:original.length,bytes:original.reduce((n,f)=>n+f.bytes,0),differences},newIdleSprites:generated.length,sourceChanges:changes,archivedRelease};
writeFileSync(join(out,'preservation-audit.json'),JSON.stringify(preservation,null,2));
console.log(JSON.stringify({tests:regression.current,newFailures:regression.newFailuresAgainst1497.length,newCollectionFailures:regression.newCollectionFailures.length,portraits:generated.length,originalAssets:original.length,assetDifferences:differences.length,archiveMatches:archivedRelease.sha256===archivedRelease.expectedSha256},null,2));
if(regression.newFailuresAgainst1497.length||regression.newCollectionFailures.length||differences.length||archivedRelease.sha256!==archivedRelease.expectedSha256)process.exitCode=1;
