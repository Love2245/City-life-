import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/casino-entry-1497-20261028');
const read=p=>readFileSync(join(root,p),'utf8'),json=p=>JSON.parse(read(p).replace(/^\uFEFF/,'')),digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=json('docs/casino-entry-1497-20261028/before.json'),changed=[],protectedFiles=[];
for(const file of before.files){
  assert.equal(digest(join(audit,'before',file.path)),file.sha256);
  if(digest(join(root,file.path))!==file.sha256){assert(['src/game/core/districtLeisure.ts','src/version.ts','tests/casinoPresentation.test.ts','tests/financialRisk.test.ts'].includes(file.path),'Unexpected change: '+file.path);changed.push(file.path);}else protectedFiles.push(file.path);
}
assert.equal(changed.length,4);assert.equal(json('package.json').version,'1.49.7');assert.match(read('src/game/core/migrate.ts'),/SAVE_VERSION\s*=\s*37/);
const revision=/export const REVISION = "([^"]+)"/.exec(read('src/version.ts'))[1];assert.match(revision,/赌场场次进入修复/);
const baseline=json('docs/casino-entry-1497-20261028/baseline/report.json');assert(baseline.scenarios.some(s=>!s.gameMenuVisible&&s.errors.some(e=>e.includes('state_unsafe_mutation'))));
const baselineTests=json('docs/casino-entry-1497-20261028/baseline-tests.json');assert(baselineTests.testResults.some(f=>f.assertionResults.some(t=>t.status==='failed'&&t.failureMessages.some(e=>e.includes('state_unsafe_mutation')))));
const journeys={};let scenarioCount=0,screenshotCount=0;
for(const mode of ['source','portable']){
  const r=json(`docs/casino-entry-1497-20261028/${mode}/report.json`);assert(r.passed);assert.equal(r.scenarios.length,4);
  for(const s of r.scenarios){assert(s.passed);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);if(s.rejected)assert(s.rejectionVisible&&s.noMoneyOrChipMutation);else assert(s.normalEntry&&s.ticketChargedOnce&&s.giftOnce&&s.categoryChangesReadOnly&&s.roundSettled&&s.reloadEntryWorks&&s.casinoCursor>0);}
  const shots=r.scenarios.reduce((n,s)=>n+s.screenshots.length,0);journeys[mode]={scenarios:r.scenarios.length,screenshots:shots,errors:0,externalRequests:0,pcNewbieEntry:true,peAdvancedEntry:true,realRoundAndReload:true,categoryChangesReadOnly:true,insufficientTicketAndWeekdayFeedback:true};scenarioCount+=r.scenarios.length;screenshotCount+=shots;
}
const checks=read('docs/casino-entry-1497-20261028/check.log');assert.match(checks,/svelte-check found 0 errors and 100 warnings in 29 files/);
const tests=json('docs/casino-entry-1497-20261028/targeted-tests.json');assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,95);assert(tests.success);
assert.match(read('docs/casino-entry-1497-20261028/portable-build.log'),/Portable release HTML published/);
async function hash(file,marker){const h=createHash('sha256');let found=!marker,tail=Buffer.alloc(0);for await(const part of createReadStream(join(root,file))){h.update(part);if(!found){const b=Buffer.concat([tail,part]);found=b.includes(Buffer.from(marker));tail=b.subarray(-512);}}return{path:file,bytes:statSync(join(root,file)).size,sha256:h.digest('hex'),revisionEmbedded:found};}
const archive=await hash(before.previous.archive);assert.equal(archive.sha256,before.previous.sha256);assert.equal(archive.bytes,before.previous.bytes);
const artifact=await hash('1.49.7.html',revision),dist=await hash('dist-portable/index.html');assert(artifact.revisionEmbedded);assert.equal(artifact.sha256,dist.sha256);assert.notEqual(artifact.sha256,archive.sha256);
writeFileSync(join(root,'1.49.7.sha256'),artifact.sha256+'  1.49.7.html\n','ascii');
const report={passed:true,completedAt:new Date().toISOString(),version:'1.49.7',saveVersion:37,revision,changedFiles:changed,protectedFiles,rootCause:'canUseDistrictLeisure was evaluated by a Svelte derived value but called financialRiskAccess, which writes reactive state and the durable journal; this raised state_unsafe_mutation and aborted game-menu rendering.',baseline:{browserReproduced:true,regressionTestReproduced:true},fix:'Availability reads cached ban/storage state only. Actual start refreshes and checks durable financial state before validation, balance changes or RNG. Existing entry/reveal/settlement guards remain active.',static:{errors:0,warnings:100},targeted:{passed:tests.numPassedTests,failed:0,files:tests.testResults.length},journeys,scenarioCount,screenshotCount,portable:artifact,dist,previousPortable:archive,limits:['Fresh browser profiles and controlled calendar fixtures only; no personal saves accessed.','Chrome mobile emulation with actual tap events; no physical phone test or APK/EXE rebuild.','No full-project test suite run.']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
writeFileSync(join(audit,'本次修改与验证.md'),[
  '# 1.49.7 赌场场次入口修复',
  '',
  '日期：2026-10-28。项目：'+root+'。玩家/包版本保持 1.49.7，存档版本保持 37。',
  '',
  '## 原因与修复',
  '',
  '已用未被封禁、余额充足、正常周末营业夜的独立测试存档复现：点击新手场后出现 state_unsafe_mutation，场次页面无法切到玩法选择。此前可用性查询 canUseDistrictLeisure 调用了会修改响应式状态、保存风控日志的 financialRiskAccess，被 Svelte 的 derived 规则拦截。',
  '',
  '可用性查询现在只读取当前黑名单和存储故障状态。实际开局时先同步并检查本机独立风控记录，再检查下注条件、生成牌局和扣款。进场、兑换、揭牌、结算的原风控检查保留，反复读档封禁规则不变。',
  '',
  '## 验证',
  '',
  '- 修改前浏览器和组件回归测试都复现相同 Svelte 错误；保留 baseline/report.json、baseline-tests.json 和截图。',
  '- 95 项相关测试通过，覆盖赌场玩法、公平性、组件动画、正常进场、独立风控记录、读档误报边界、封禁、存储失败以及旧状态绕过检查。',
  '- 源码与最终 HTML 各 4 个场景，共 '+scenarioCount+' 个场景、'+screenshotCount+' 张截图：PC 新手场，PE 高级场，门票余额不足，游戏日历的非周末。全部通过，浏览器错误和最终 HTML 外部请求均为 0。',
  '- 正常场景实际操作切换类别、比大小下注、揭牌、结算及重新载入后再次入场；高级场只扣一次 50 元门票，首次赠送 100 筹码，同营业夜再次进入新手场不重复赠送；界面切换不再写入金融风控记录。PE 使用触摸点击。',
  '- 非周末和门票不足时保留场次菜单并显示原因，不改变现金或筹码。',
  '- 静态检查 0 错误、100 条原有警告。没有运行全项目测试，也没有实体手机测试或重打 APK/EXE。',
  '- 原风控实现、场次组件、PE 公告修复、分辨率规则和游戏状态代码的备份哈希保持不变；仅更改赌场核心查询/开局入口、版本说明与两份回归测试。',
  '',
  '## 交付',
  '',
  '- 当前文件：'+join(root,'1.49.7.html')+'；'+artifact.bytes+' 字节。',
  '- SHA-256：'+artifact.sha256,
  '- 与 dist-portable/index.html 一致，1.49.7.sha256 已同步。',
  '- 修改前版本：'+join(root,archive.path)+'；SHA-256：'+archive.sha256,
  '- 源码复验：node scripts/verify-casino-entry-1497.mjs；最终 HTML 复验时设置 QA_PORTABLE=1。',
  '- 汇总复验：node scripts/verify-casino-entry-delivery-1497.mjs。',
  '',
].join('\n'));
console.log(JSON.stringify({passed:true,artifact,scenarioCount,screenshotCount,tests:tests.numPassedTests,static:report.static}));
