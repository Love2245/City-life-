import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,createReadStream} from 'node:fs';
import {join,resolve,relative,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';

// Run only after final source tests, browser checks, build and portable checks exist.
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/company-calibration-1497-20261026');
const normal=p=>p.replaceAll('\\','/');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const read=p=>json(join(audit,p));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function streamHash(p){const h=createHash('sha256');for await(const b of createReadStream(p,{highWaterMark:8*1024*1024}))h.update(b);return h.digest('hex');}
const before=read('before-sha256.json');
assert(before.length>=1063);
assert(before.every(r=>hash(join(audit,'before',r.path))===r.sha256),'Source backup changed');
assert(before.every(r=>existsSync(join(root,r.path))),'Backed-up source was deleted');

const baseline=json(join(root,'docs/company-management-v2-1497-20261025/full-tests-current.json'));
const failed=r=>r.testResults.flatMap(t=>(t.assertionResults??[]).filter(a=>a.status==='failed').map(a=>a.fullName)).sort();
const collected=r=>r.testResults.filter(t=>t.status==='failed'&&!(t.assertionResults??[]).length).map(t=>basename(t.name)).sort();
const full=read('full-tests-current.json'),target=read('targeted-final.json');
const officeTests=read('office-time-tests.json'),contractTests=read('contract-regression.json');
for(const r of [officeTests,contractTests]){assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert(r.success);}
assert.equal(officeTests.numPassedTests,53);assert.equal(contractTests.numPassedTests,16);
const existing=new Set(failed(baseline)),newFailures=failed(full).filter(n=>!existing.has(n));
assert.deepEqual(newFailures,[],'A new test assertion failed');
assert.deepEqual(collected(full),collected(baseline),'Collection failures changed');
assert.equal(full.numPendingTests,0);assert.equal(target.numFailedTests,0);assert.equal(target.numPendingTests,0);
const check=readFileSync(join(audit,'check.log'),'utf8').match(/svelte-check found (\d+) errors and (\d+) warnings/);
assert(check);assert.equal(Number(check[1]),0);assert.equal(Number(check[2]),100);

const browser=read('browser-current/verification.json'),portable=read('portable-current/verification.json');
for(const r of [browser,portable]){
  assert(r.passed);assert.equal(r.scenarios.length,5);
  assert(r.scenarios.every(s=>s.passed&&!s.errors.length&&!s.external.length));
  assert(r.scenarios.filter(s=>s.mode==='pe').every(s=>s.checks.some(c=>c.portraitPromptAboveModals===true)));
  assert(r.scenarios.find(s=>s.id==='pe-company').checks.some(c=>c.stickyMobileWorkButton&&c.touchHeight>=43.9));
  assert(r.scenarios.every(s=>s.checks.some(c=>c.webgl===0)));
}
assert.equal(new URL(portable.url).href,pathToFileURL(join(root,'1.49.7.html')).href);
assert(portable.scenarios.find(s=>s.id==='pe-company').checks.some(c=>c.mobileAssignmentFontPx>=11.9));
assert(portable.scenarios.find(s=>s.id==='pe-company').checks.some(c=>c.mobileMutedFontPx>=11.9));
// The office report is also required: general management scenarios alone do not prove daylight/waiting.
const officeBrowser=read('office-time-browser-current/verification.json');
const officePortable=read('office-time-portable-current/verification.json');
for(const r of [officeBrowser,officePortable]){
  assert(r.passed,'Office time QA failed');
  assert.equal(r.scenarios.length,5,'Office time QA must cover PC3D/PC2D/mobile2D and winter3D/2D');
  assert(r.scenarios.every(s=>s.passed&&!s.errors?.length&&!s.external?.length));
  for(const s of r.scenarios){
    const render=s.checks.find(c=>'webglContexts' in c);assert(render);
    if(s.sceneMode==='2d')assert.equal(render.webglContexts,0);else assert(render.webglContexts>0);
    if(s.winter){
      const lighting=s.checks.find(c=>c.lighting)?.lighting;assert(lighting);
      assert.equal(lighting.month,12);assert.equal(lighting.weather,'snow');assert.equal(lighting.frame,'night');assert.equal(lighting.lamps,true);
    }else{
      assert(s.checks.some(c=>c.minuteProgression&&c.employee9to17&&c.actualWaitDevelopedPoints===15&&c.crossMidnight&&c.cameraPreserved));
      assert(s.checks.some(c=>c.lighting?.phase==='清晨'));
      assert(s.checks.some(c=>c.lighting?.frame==='night'&&c.lighting?.lamps===true));
    }
  }
}
assert.equal(new URL(officePortable.url).href,pathToFileURL(join(root,'1.49.7.html')).href);

const economy=read('final-economy.json');
assert.equal(economy.parameters.salaryBase,2500);assert.equal(economy.parameters.salaryPerSkill,125);
assert.deepEqual(economy.parameters.cashPrices,[850,2200,9200,30000]);
assert.deepEqual(economy.parameters.newRoyaltyCaps,[600,1000,2000,4000]);
assert.equal(economy.parameters.maintenanceDivisor,100);
const ssr=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let config;try{config=await ssr.ssrLoadModule('/src/game/core/companyConfig.ts');}finally{await ssr.close();}
assert.equal(config.COMPANY_RULES.salaryBase,economy.parameters.salaryBase);
assert.equal(config.COMPANY_RULES.salaryPerSkill,economy.parameters.salaryPerSkill);
assert.equal(config.COMPANY_RULES.maintenanceDivisor,economy.parameters.maintenanceDivisor);
assert.deepEqual(['short','small','medium','large'].map(k=>config.COMPANY_SCALES[k].work),economy.parameters.workloads);
assert.deepEqual(['short','small','medium','large'].map(k=>config.COMPANY_SCALES[k].design),economy.parameters.cashPrices);
assert.deepEqual(['small','medium','large'].map(k=>config.COMPANY_SCALES[k].royalty),economy.parameters.productRoyalties);
assert.deepEqual(config.COMPANY_STAGES.map(s=>s.cap),economy.parameters.newRoyaltyCaps);
assert.equal(config.PERSONAL_DEVELOPMENT_RULES.passiveCap,economy.parameters.proposedPersonalNewRoyaltyCap);
assert.deepEqual(config.PERSONAL_DEVELOPMENT_RULES.royalties,economy.parameters.proposedPersonalNewRoyaltyBase);
const ordinary=economy.matureSamples.filter(s=>s.tier==='mid'&&s.factor===1);
assert.equal(ordinary.length,8);assert.equal(economy.extraSeedSamples.length,6);
for(const s of [...ordinary,...economy.extraSeedSamples]){
  assert.equal(s.days,90);assert.equal(s.founderWorks,false);
  assert.equal(s.endingDebt,0);assert(s.ratio>=1.3&&s.ratio<=1.5);
  assert(Math.abs(s.income/s.cost-s.ratio)<1e-9);
}
assert(economy.summary.ordinaryMidReferenceAllMet&&economy.summary.extraSeedsAllInReference);
const high=economy.matureSamples.filter(s=>s.tier==='high'&&s.factor===1);
assert.equal(high.length,8);assert(high.every(s=>s.ratio>1.5&&s.ratio<=2.2));
assert.equal(economy.firstEmployee.withRealFounder.length,3);
for(const s of economy.firstEmployee.withRealFounder){assert.equal(s.workHours,520);assert.deepEqual(s.failures,[]);assert.equal(s.showerFailures,0);assert.equal(s.endingDebt,0);assert.equal(s.employeesAtEnd,1);}
assert(economy.firstEmployee.withoutFounder.every(s=>s.profit<0));
assert(economy.firstEmployee.oldLeaseFridayBillRisk.endingDebt>0);

const tracked=[...walk(join(root,'src')),...walk(join(root,'scripts')),...walk(join(root,'tests')),...['package.json','vite.config.ts','vite.portable.config.ts','1.49.7.sha256','源码副本说明_1.497.md','docs/创业系统_1.497_玩法与数值.md'].map(p=>join(root,p))];
const hashes=[];
for(const p of tracked)hashes.push({path:normal(relative(root,p)),bytes:statSync(p).size,sha256:statSync(p).size>32*1024*1024?await streamHash(p):hash(p)});
const current=new Map(hashes.map(r=>[r.path,r.sha256]));
const prior=json(join(root,'docs/company-balance-ui-1497-20261025/source-sha256.json'));
const allAssets=prior.filter(r=>r.path.startsWith('src/assets/'));
assert.equal(allAssets.length,8127);
assert(allAssets.every(r=>current.get(normal(r.path))===r.sha256.toLowerCase()),'A formal asset changed');
const artifact=join(root,'1.49.7.html'),sha256=await streamHash(artifact);
assert.equal(sha256,read('artifact-before-qa.json').sha256);
assert.equal(sha256,await streamHash(join(root,'dist-portable/index.html')));
assert.equal(readFileSync(join(root,'1.49.7.sha256'),'utf8').trim().split(/\s+/)[0],sha256);
const archived=read('previous-portable.json');
assert.equal(archived.sha256,'9d5c6e15dcc37525768e6e8814d285658a047aa2434b3c3831e7674012d42722');
assert.equal(await streamHash(archived.path),archived.sha256);
const previousStable=json(join(root,'docs/company-management-v2-1497-20261025/previous-portable-restoration.json'));
assert.equal(previousStable.sha256,'5784fc1a21fd6e2e034efb3e583dc468ec800044df2190e68c8b238094c3f911');
assert.equal(await streamHash(previousStable.path),previousStable.sha256);
assert.equal(json(join(root,'package.json')).version,'1.49.7');
assert(/SAVE_VERSION\s*=\s*37/.test(readFileSync(join(root,'src/game/core/migrate.ts'),'utf8')));
const revision='2026.10.26 · 经营平衡与办公室昼夜';
assert(readFileSync(join(root,'src/version.ts'),'utf8').includes(revision));
writeFileSync(join(audit,'source-sha256.json'),JSON.stringify(hashes,null,2));
const ui=r=>({passed:r.passed,scenarios:r.scenarios.length,screenshots:r.scenarios.flatMap(s=>s.screenshots??[]).length,errors:r.scenarios.flatMap(s=>s.errors??[]).length,externalRequests:r.scenarios.flatMap(s=>s.external??[]).length});
const previousPaths=new Set(prior.map(r=>normal(r.path))),changed=before.filter(r=>current.get(normal(r.path))!==r.sha256).map(r=>r.path);
const report={passed:true,scope:'Company workflow, calibrated new-contract economy and office time verified against the final portable artifact.',generatedAt:new Date().toISOString(),directory:root,version:'1.49.7',saveVersion:37,revision,
  tests:{passed:full.numPassedTests,failed:full.numFailedTests,pending:full.numPendingTests,existingFailures:failed(full),collectionFailures:collected(full),newFailures:[],targetedPassed:target.numPassedTests,officeTimePassed:officeTests.numPassedTests,contractRegressionPassed:contractTests.numPassedTests},
  staticCheck:{errors:0,existingWarnings:100},browser:ui(browser),portable:{...ui(portable),path:artifact,bytes:statSync(artifact).size,sha256,standaloneFileVerified:true,buildCopyMatches:true},
  officeTime:{browser:ui(officeBrowser),portable:ui(officePortable)},
  economy:{days:90,reference:[1.3,1.5],referenceConfiguration:'Normal salary quote and office mid computers, full mature team; no founder labor',ordinaryProfiles:ordinary.length,additionalSeedProfiles:economy.extraSeedSamples.length,referencePassed:true,ordinaryRange:economy.summary.ordinaryMidRange,extraSeedRange:economy.summary.extraSeedsRange,advancedComputerRange:economy.summary.highFairQuoteRange,bargainHireRange:economy.summary.cheapHighRange,realFounderProfiles:3,report:'final-economy.json'},
  preservation:{backedUp:before.length,unchangedAssets:allAssets.length,changedSourceFiles:changed,addedSourceFiles:hashes.filter(r=>!previousPaths.has(r.path)).map(r=>r.path),deletedSourceFiles:[]},previousPortable:archived,previousStablePortable:{path:previousStable.path,bytes:statSync(previousStable.path).size,sha256:previousStable.sha256},
  cleanup:{status:'Temporary restoration cache retained after automatic approval review rejected removing its directory links; no further deletion attempted'},
  unverified:['Physical mobile performance and thermals','New EXE/APK packages','Full new-game natural-play journey through qualification, registration and financing','All possible calendar windows, recruitment discounts and old-save portfolios meeting the same margin target']};
writeFileSync(join(audit,'verification.json'),JSON.stringify(report,null,2));
const range=values=>values.map(v=>v.toFixed(3)).join('—');
const lines=[
  '# 1.497 验证与交付记录',
  '',
  `游戏版本 **${report.version}**，存档版本 **${report.saveVersion}**，内容修订 **${revision}**。本记录在源码、浏览器、便携版、经济报告和保存校验全部通过后生成。`,
  '',
  `生成时间：${report.generatedAt}。修改目录：${root}。`,
  '',
  `便携版：[1.49.7.html](${normal(artifact)})，${report.portable.bytes.toLocaleString('zh-CN')} 字节。根目录与 dist-portable/index.html 的 SHA-256 相同，便携浏览器验收前后指纹相同。`,
  '',
  `SHA-256：\`${sha256}\`。完整机器记录见 [verification.json](verification.json)，源码与正式素材指纹见 [source-sha256.json](source-sha256.json)。`,
  '',
  `专项测试 ${target.numPassedTests} 项通过，无失败或跳过；全量 ${full.numPassedTests} 项通过，仍有 ${full.numFailedTests} 项原有断言失败、${collected(full).length} 个原有测试文件收集失败，新失败 **0**。已与上一轮原有失败名称逐项比较，不通过跳过断言制造通过。静态检查 **0 errors / 100 existing warnings**。`,
  '',
  `办公室与共享2D专项另有 ${officeTests.numPassedTests} 项通过，契约调整回归 ${contractTests.numPassedTests} 项通过；专项存在覆盖重叠，不累加为独立总数。调整缘由与首轮失败记录见 [测试契约调整说明.md](测试契约调整说明.md)。`,
  '',
  `源码浏览器：常规 ${browser.scenarios.length} 场景 / ${ui(browser).screenshots} 张截图，办公室时间 ${officeBrowser.scenarios.length} 场景 / ${ui(officeBrowser).screenshots} 张截图。最终便携：常规 ${portable.scenarios.length} 场景 / ${ui(portable).screenshots} 张截图，办公室时间 ${officePortable.scenarios.length} 场景 / ${ui(officePortable).screenshots} 张截图。四份报告均无页面错误、控制台错误；最终便携通过单文件打开，未请求外部资源。2D未申请WebGL，3D办公室正常申请渲染上下文。`,
  '',
  '常规场景覆盖桌面与手机横屏、个人及公司4/8/12小时开发、工位与员工实体点击、购机面试录用、任务分配、资金预留提现、旧合同和版税保留、竖屏提示。手机分配与名额说明物理字体均至少12px，关键触控按钮至少44px。办公室场景验证分钟推进、清晨/白天/黄昏/夜晚、员工9—17点、实际8小时产出15点、跨午夜、镜头保留，以及冬季18点雪天2D/3D。',
  '',
  `90日成熟公司参考：正常个人报价、办公电脑、已有稳定版权、满员工工位，不使用主角劳动力。8组办公室/技能组合收入÷发生制成本 **${range(economy.summary.ordinaryMidRange)}**；整层额外3随机种子×2技能的6组为 **${range(economy.summary.extraSeedsRange)}**，14组均在1.3—1.5参考区间。高级电脑正常报价 **${range(economy.summary.highFairQuoteRange)}**，0.8报价高手 **${range(economy.summary.cheapHighRange)}**，保留设备升级与招聘选择的回报。`,
  '',
  '模拟包含真实假期、工资及租金发生制成本和阶段到账时间。首名员工独自经营、无版权时仍小幅亏损；实际主角参与的3组包含520小时劳动和个人生活预算。旧租期即将到期、首笔回款之前缺钱的风险样本会停工并保留债务。这些结果不代表从新游戏开始的完整自然旅程，也不保证全部旧档、设备、报价及任意日历窗口都有同一利润率。详见 [summary.md](summary.md) 与 [final-economy.json](final-economy.json)。',
  '',
  `修改前已备份 ${before.length} 个文件并核对全部备份 SHA-256；原有正式素材 **${allAssets.length} 件全部保留且指纹不变**。没有删除备份清单中的源码。`,
  '',
  `上一轮经营功能候选归档：${archived.path}；SHA-256 \`${archived.sha256}\`。`,
  '',
  `更早统一开发与公司简化归档：${previousStable.path}；SHA-256 \`${previousStable.sha256}\`。两份历史便携HTML已重新读取核对指纹。`,
  '',
  '尚未验证实体手机性能、温度与原生触控，也没有生成或验收新的EXE/APK。浏览器模拟横屏与竖屏不能替代这些验证。',
  '',
  '自动审批检查拒绝了删除临时复原目录中目录链接的清理操作，未提供更具体的原因；临时复原缓存因此保留，没有继续尝试删除。正式源码、素材与历史便携版均保留。',
  '',
];
writeFileSync(join(audit,'验证与交付记录.md'),lines.join('\n'));
console.log(JSON.stringify({...report,tests:{passed:full.numPassedTests,existingFailed:full.numFailedTests,collectionFailures:collected(full).length,newFailures:0,targetedPassed:target.numPassedTests},preservation:{backedUp:before.length,unchangedAssets:allAssets.length,changedSourceFiles:changed.length}},null,2));
