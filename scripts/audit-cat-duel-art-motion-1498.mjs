import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync,createReadStream,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-art-motion-1498-20261029');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=async p=>{const h=createHash('sha256');for await(const c of createReadStream(p))h.update(c);return h.digest('hex');};
const baseline=json(join(root,'docs/cat-duel-1498-20261029/baseline-tests.json')),previous=json(join(root,'docs/cat-duel-refine-1498-20261029/full-tests.json')),current=json(join(out,'full-tests.json'));
const file=s=>s.name.replaceAll('\\','/').split('/tests/')[1];
const failures=r=>r.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:file(s),name:t.fullName})));
const empty=r=>r.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>({file:file(s),message:s.message?.slice(0,400)}));
const summarize=r=>({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,collectionFailures:empty(r)});
const key=t=>t.file+'::'+t.name,baselineKeys=new Set(failures(baseline).map(key)),previousKeys=new Set(failures(previous).map(key));
const regression={baseline1497:summarize(baseline),previous1498:summarize(previous),current:summarize(current),newFailuresAgainst1497:failures(current).filter(t=>!baselineKeys.has(key(t))),newFailuresAgainstPrevious1498:failures(current).filter(t=>!previousKeys.has(key(t))),newCollectionFailures:empty(current).filter(t=>!empty(baseline).some(e=>e.file===t.file))};
writeFileSync(join(out,'regression-comparison.json'),JSON.stringify(regression,null,2));
const targets=['accessorySmoke.test.ts','cardPack.test.ts','catBattle.test.ts','catCare.test.ts','catDuel1498.test.ts','catDuelMotion1498.test.ts','gameplayAuditRegression.test.ts','gameplayAuditUi.test.ts','tournament.test.ts','v134_battle_flow.test.ts','v134_battle_ui.test.ts'];
const suites=current.testResults.filter(s=>targets.includes(file(s))),tests=suites.flatMap(s=>s.assertionResults);
const focused={derivedFrom:'full-tests.json',fileCount:suites.length,numTotalTests:tests.length,numPassedTests:tests.filter(t=>t.status==='passed').length,numFailedTests:tests.filter(t=>t.status==='failed').length,testResults:suites};
writeFileSync(join(out,'focused-final.json'),JSON.stringify(focused,null,2));assert.equal(suites.length,11);assert.equal(focused.numFailedTests,0);
const ssr=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
try{const cards=await ssr.ssrLoadModule('/src/game/core/catDuelCards.ts');const catalogue=cards.DUEL_CARDS.map(c=>({id:c.id,name:c.name,family:c.family,normal:c,plus:cards.getDuelCard(c.id+'_plus')}));assert.deepEqual(JSON.parse(JSON.stringify(catalogue)),json(join(root,'docs/cat-duel-refine-1498-20261029/cards-36.json')));writeFileSync(join(out,'cards-36.json'),JSON.stringify(catalogue,null,2));}finally{await ssr.close();}
const art=json(join(out,'card-effect-art.json'));
for(const card of art.cards){const path=join(root,card.path),source=readFileSync(path,'utf8');assert(!/<image\b|<text\b/.test(source));card.sha256=await hash(path);card.bytes=statSync(path).size;}
assert.equal(new Set(art.cards.map(c=>c.sha256)).size,36);writeFileSync(join(out,'card-effect-art.json'),JSON.stringify(art,null,2));
const frames=json(join(root,'src/lib/catActionFrames.json')),alpha=json(join(out,'action-alpha-audit.json'));
const actions=[];
for(const name of readdirSync(join(out,'generated/actions'))){const entry=json(join(out,'generated/actions',name)),frame=frames[entry.group+'/'+entry.key];assert(frame);assert(frame.attack[0]<frame.hurt[0]);for(const pose of ['attack','hurt']){const r=frame[pose];assert(r[0]>=0&&r[1]>=0&&r[2]>0&&r[3]>0&&r[0]+r[2]<=frame.width&&r[1]+r[3]<=frame.height);}actions.push({...entry,sha256:await hash(join(root,entry.destination)),sourceSha256:await hash(entry.source),bytes:statSync(join(root,entry.destination)).size,frames:frame});}
assert.equal(actions.length,28);assert.equal(alpha.edgeReview.length,0);
writeFileSync(join(out,'generated-assets.json'),JSON.stringify({tool:'Built-in image_gen',count:28,poses:56,format:'28 unmodified RGBA paired sheets, displayed through read-only SVG viewports; no programmatic bitmap modification',visualReview:'All28 groups reviewed against current idle art on dark and light backgrounds; fur, accessories, facing, complete limbs, tails and natural transparent gaps preserved.',assets:actions},null,2));
const originals=json(join(root,'docs/source-copy-1498-20261029/copied-files.json')).filter(e=>e.path.replaceAll('\\','/').startsWith('src/assets/'));
const differences=[];let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<originals.length){const e=originals[cursor++],p=join(root,e.path),actual=existsSync(p)?await hash(p):null;if(actual?.toLowerCase()!==e.sha256.toLowerCase())differences.push({path:e.path,expected:e.sha256,actual});}}));
const idleDifferences=[];for(const e of json(join(root,'docs/cat-duel-refine-1498-20261029/generated-assets.json')).assets){const actual=await hash(join(root,e.destination));if(actual!==e.sha256)idleDifferences.push({path:e.destination,expected:e.sha256,actual});}
const changed=[];for(const e of json(join(out,'before-manifest.json'))){const actual=await hash(join(root,e.path));if(actual!==e.sha256)changed.push({path:e.path,before:e.sha256,after:actual});}
const archive='待清理文件/1.49.8-立绘修复与简化卡牌-20261029/1.49.8.html',archivedSha=await hash(join(root,archive));assert.equal(archivedSha,'22ba7e74678007f04e85f0b75354704e90f02a2fd19d6d55b01c32d9ff835b87');
const preservation={createdAt:new Date().toISOString(),originalAssets:{checked:originals.length,differences},previousCleanIdleSprites:{checked:28,differences:idleDifferences},sourceChanges:changed,cardValuesUnchanged:true,cardArtCount:36,actionSheetCount:28,actionPoseCount:56,archivedPreviousPortable:{path:archive,bytes:statSync(join(root,archive)).size,sha256:archivedSha}};
writeFileSync(join(out,'preservation-audit.json'),JSON.stringify(preservation,null,2));
assert.equal(differences.length,0);assert.equal(idleDifferences.length,0);assert.equal(regression.newFailuresAgainst1497.length,0);assert.equal(regression.newCollectionFailures.length,0);
console.log(JSON.stringify({focused:{files:suites.length,passed:focused.numPassedTests},full:regression.current,newFailures:regression.newFailuresAgainst1497.length,originalAssets:originals.length,assetDifferences:differences.length,idleDifferences:idleDifferences.length,cardArt:36,actionSheets:28,actionPoses:56,cardValuesUnchanged:true},null,2));
