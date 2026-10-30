import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/gameplay-audit-1497-20261028');
const read=p=>readFileSync(join(root,p),'utf8'),json=p=>JSON.parse(read(p).replace(/^\uFEFF/,'')),digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=json('docs/gameplay-audit-1497-20261028/before.json'),changed=[],protectedFiles=[];
const allowed=['src/game/core/cardPack.ts','src/components/CatPanel.svelte','src/components/layout/HospitalTrainModal.svelte','src/version.ts','tests/cardPack.test.ts'];
for(const file of before.files){
  assert.equal(digest(join(audit,'before',file.path)),file.sha256);
  if(digest(join(root,file.path))!==file.sha256){assert(allowed.includes(file.path),'Unexpected change: '+file.path);changed.push(file.path);}else protectedFiles.push(file.path);
}
assert.equal(changed.length,allowed.length);assert.equal(json('package.json').version,'1.49.7');assert.match(read('src/game/core/migrate.ts'),/SAVE_VERSION\s*=\s*37/);
const revision=/export const REVISION = "([^"]+)"/.exec(read('src/version.ts'))[1];assert.equal(revision,'2026.10.29 · 游戏性巡检与宠物训练修复');
const reproduced=json('docs/gameplay-audit-1497-20261028/reproduced-tests.json');assert.equal(reproduced.numFailedTests,8);assert(reproduced.testResults.some(f=>f.assertionResults.some(t=>t.failureMessages.some(e=>e.includes('state_unsafe_mutation')))));
const targeted=json('docs/gameplay-audit-1497-20261028/pet-tests.json');assert.equal(targeted.numPassedTests,144);assert.equal(targeted.numFailedTests,0);
const baseline=json('docs/gameplay-audit-1497-20261028/baseline-tests.json'),final=json('docs/gameplay-audit-1497-20261028/final-tests.json');
const failures=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==='failed').map(t=>({file:f.name.split('/').pop(),name:t.fullName,message:t.failureMessages[0]})));
const collections=r=>r.testResults.filter(f=>f.message).map(f=>({file:f.name.split('/').pop(),message:f.message}));
const key=t=>t.file+'::'+t.name,oldFailures=failures(baseline),newFailures=failures(final),oldSet=new Set(oldFailures.map(key)),newSet=new Set(newFailures.map(key));
assert.deepEqual(newFailures.filter(t=>!oldSet.has(key(t))),[]);assert.deepEqual(oldFailures.filter(t=>!newSet.has(key(t))),[]);
assert.deepEqual(collections(final).map(t=>t.file).sort(),collections(baseline).map(t=>t.file).sort());
assert.equal(baseline.numPassedTests,3852);assert.equal(final.numPassedTests,3860);assert.equal(final.numFailedTests,53);assert.equal(collections(final).length,7);
const newRegressionNames=final.testResults.filter(f=>/gameplayAudit(?:Ui|Regression)\.test\.ts$/.test(f.name)).flatMap(f=>f.assertionResults);assert.equal(newRegressionNames.length,8);assert(newRegressionNames.every(t=>t.status==='passed'));
const retained={fullSuiteGreen:false,baselinePassed:baseline.numPassedTests,finalPassed:final.numPassedTests,assertionFailures:newFailures,collectionFailures:collections(final),newFailureCount:0,note:'All 53 assertion failures and 7 collection failures existed before this audit and remain unresolved. Examples include missing preview/QA modules, old version/dialogue/asset expectations, outdated audio spy argument expectations and an incomplete renderer mock. This is not a full all-pass result.'};
writeFileSync(join(audit,'remaining-test-failures.json'),JSON.stringify(retained,null,2));
const journeys={};let scenarioCount=0,screenshotCount=0;
for(const mode of ['source','portable']){
  const r=json(`docs/gameplay-audit-1497-20261028/${mode}/report.json`);assert(r.passed);assert.equal(r.scenarios.length,4);
  for(const s of r.scenarios){assert(s.passed,s.id);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);}
  assert(r.scenarios.find(s=>s.kind==='cards').readOnlyLegacyPack);const special=r.scenarios.find(s=>s.kind==='special');assert(special.legacyTrainingWorks&&special.chargedExactly200&&special.closingBlocksAllButtons);const focus=r.scenarios.find(s=>s.kind==='focus');assert(focus.deletedCardSurvivesReload&&focus.savedCardCount===15);const stock=r.scenarios.find(s=>s.kind==='stock');assert(stock.transferRoundtripConservesMoney&&stock.buySellOnlyCostsFees&&stock.latestReloadDoesNotBan);
  const shots=r.scenarios.reduce((n,s)=>n+s.screenshots.length,0);journeys[mode]={scenarios:4,screenshots:shots,errors:0,externalRequests:0,legacyCardsReadOnly:true,hospitalClosingAndFee:true,deletedCardSurvivesReload:true,stockCashAndBuySellRoundtrip:true,latestSaveNoBan:true};scenarioCount+=4;screenshotCount+=shots;
}
assert.match(read('docs/gameplay-audit-1497-20261028/check.log'),/svelte-check found 0 errors and 100 warnings in 29 files/);assert.match(read('docs/gameplay-audit-1497-20261028/portable-build.log'),/Portable release HTML published/);
async function hash(file,marker){const h=createHash('sha256');let found=!marker,tail=Buffer.alloc(0);for await(const part of createReadStream(join(root,file))){h.update(part);if(!found){const b=Buffer.concat([tail,part]);found=b.includes(Buffer.from(marker));tail=b.subarray(-512);}}return{path:file,bytes:statSync(join(root,file)).size,sha256:h.digest('hex'),revisionEmbedded:found};}
const archive=await hash(before.previous.archive);assert.equal(archive.sha256,before.previous.sha256);assert.equal(archive.bytes,before.previous.bytes);
const artifact=await hash('1.49.7.html',revision),dist=await hash('dist-portable/index.html');assert(artifact.revisionEmbedded);assert.equal(artifact.sha256,dist.sha256);assert.notEqual(artifact.sha256,archive.sha256);writeFileSync(join(root,'1.49.7.sha256'),artifact.sha256+'  1.49.7.html\n','ascii');
const newFiles=['tests/gameplayAuditUi.test.ts','tests/gameplayAuditRegression.test.ts','scripts/verify-gameplay-audit-1497.mjs','scripts/verify-gameplay-audit-delivery-1497.mjs'].map(path=>({path,sha256:digest(join(root,path))}));
const report={deliveryChecksPassed:true,completedAt:new Date().toISOString(),version:'1.49.7',saveVersion:37,revision,changedFiles:changed,newFiles,backupFileCount:before.files.length,protectedFileCount:protectedFiles.length,issuesFixed:[{id:'legacy-pet-ui',cause:'CatPanel template and HospitalTrainModal derived values initialized missing cardPack on reactive pets while rendering.',fix:'Read-only cardPackOf provides stable entry IDs for legacy display; actual training/battle/offer commands still initialize and persist the pack.'},{id:'hospital-training-admission',cause:'Hospital modal checked admission only on opening; subsequent commands charged money and modified cards after closing or a state/location change.',fix:'Every training command rechecks current action admission, ending, hospitalization and work state before changing card packs, cash, time or weekly counts. Buttons disable and display the reason when no longer eligible. Nested flower-market hospital remains supported.'}],reproducedFailures:8,targeted:{passed:144,failed:0,files:targeted.testResults.length},fullSuite:{green:false,baselinePassed:3852,finalPassed:3860,unchangedAssertionFailures:53,unchangedCollectionFailures:7,newFailures:0,files:final.testResults.length},static:{errors:0,warnings:100},journeys,scenarioCount,screenshotCount,portable:artifact,dist,previousPortable:archive,limits:['No personal saves accessed. Browser tests use isolated controlled legacy saves and actual click/touch events.','No physical Android/iOS phone test or APK/EXE rebuild.','Full project suite is not green; retained failures are listed in remaining-test-failures.json.']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
writeFileSync(join(audit,'本次修改与验证.md'),[
  '# 1.49.7 游戏性巡检与修复',
  '',
  '开始：2026-10-28；完成：2026-10-29。项目：'+root+'。版本保持 1.49.7，存档版本保持 37。',
  '',
  '## 已确认并修复',
  '',
  '1. 旧宠物存档没有 cardPack 字段时，打开猫咪卡包页或医院训练页会触发 state_unsafe_mutation，界面无法完成渲染。界面现在只读兼容初始卡包；训练等真实操作仍持久保存卡组，查看本身不改存档。',
  '2. 医院训练窗口打开后，后续训练没有重新检查营业时间、地点和当前状态；19点训练到20点打烊后仍能从旧窗口继续扣款。两种训练现在每次扣款前重新校验，打烊、离开、结局、住院、工作中均阻止操作，界面禁用按钮并显示原因。花鸟市场内的医院正常支持。',
  '',
  '保留原每周3次限制、200/400/600元价格、1小时耗时、强化值和至少一攻一防的删卡规则。本次没有改动办公室、赌场/证券风控、公告、分辨率、公司税率、音频或正式素材。',
  '',
  '## 验证结果与边界',
  '',
  '- 修复前新增的8个回归用例全部复现问题，修复后全部通过。宠物卡组、照护、战斗和相关服务共144项测试通过。',
  '- 全量首轮：3852通过、53项断言失败，393个测试文件，其中7个测试依赖缺失。修复后：3860通过、相同53项断言失败，395个测试文件，仍是相同7个依赖缺失。新增失败为0。',
  '- 全量测试不是全绿。既有失败包括缺失的咖啡厅/便利店预览和NPC QA依赖、旧版本/剧情/素材预期、音频spy参数预期与缺少capabilities的renderer mock。逐项保留在 remaining-test-failures.json，没有为了通过测试改写剧情、经济或素材规则；这些遗留项未在本轮全部解决。',
  '- 源码和最终HTML各4个浏览器场景，共'+scenarioCount+'个场景、'+screenshotCount+'张截图，全部通过，浏览器错误及最终HTML外部网络请求均为0。',
  '- 真实操作验证：旧猫卡包显示16张且查看不写回；PE花鸟市场医院19点训练一次只扣200元、20点禁用所有后续训练按钮；专注训练删掉一张卡后重新载入仍为15张；证券转入/转出100元总额守恒，买入卖出一股仅收两次手续费，读取最新存档不触发封禁。',
  '- 静态检查0错误、100条原有警告。使用独立浏览器存储；未读取个人存档，未进行实体手机测试，未打包APK/EXE。',
  '- 备份了'+before.files.length+'份源码/测试/配置文件；原文件仅改动'+changed.length+'份，其余'+protectedFiles.length+'份哈希一致，另新增两份回归测试和两份复验脚本。',
  '',
  '## 交付',
  '',
  '- HTML：'+join(root,'1.49.7.html')+'；'+artifact.bytes+'字节。',
  '- 修订：'+revision,
  '- SHA-256：'+artifact.sha256,
  '- 与dist-portable/index.html一致，1.49.7.sha256已同步。',
  '- 修改前HTML：'+join(root,archive.path)+'；SHA-256：'+archive.sha256,
  '- 浏览器复验：node scripts/verify-gameplay-audit-1497.mjs；设置QA_PORTABLE=1验证最终HTML。',
  '- 交付复验：node scripts/verify-gameplay-audit-delivery-1497.mjs。',
  '',
].join('\n'));
console.log(JSON.stringify({deliveryChecksPassed:true,artifact,scenarioCount,screenshotCount,targeted:report.targeted,fullSuite:report.fullSuite,static:report.static}));
