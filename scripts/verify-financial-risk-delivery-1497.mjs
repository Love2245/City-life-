import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,createReadStream,statSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/financial-risk-1497-20261028');
const read=file=>readFileSync(join(root,file),'utf8'),json=file=>JSON.parse(read(file));
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const baseline=json('docs/financial-risk-1497-20261028/before-sha256.json'),changed=[];
const allowed=new Set([
  'src/components/layout/CafeInterior.svelte','src/components/layout/CityTipModal.svelte','src/components/layout/CommercialServicesPanel.svelte','src/components/layout/CompanyInterior.svelte','src/components/layout/HomeInterior.svelte','src/components/layout/LaptopDesktopView.svelte','src/components/layout/ScenePanel.svelte','src/components/layout/StoreInterior.svelte','src/components/layout/TransitionOverlay.svelte','src/components/SceneDisplayControls.svelte','src/components/ShunshunhuaWorkspace.svelte',
  'src/game/core/actions.ts','src/game/core/districtLeisure.ts','src/game/core/migrate.ts','src/game/core/stockMarket.ts','src/game/data/loadingTips.ts','src/game/types.ts',
  'src/lib/cafeRoom3D.ts','src/lib/cityTips.ts','src/lib/companyOffice3D.ts','src/lib/companyStillView.ts','src/lib/convenienceStore3D.ts','src/lib/homeQuality.ts','src/lib/homeReferenceVisuals.ts','src/lib/homeRoom3D.ts','src/lib/homeRoomState.ts','src/lib/homeVisualModels.ts','src/lib/interactionSoundRouting.ts','src/lib/loadingTips.ts','src/lib/save.ts','src/lib/scenePipeline.ts','src/main.ts','src/stores/gameStore.svelte.ts','src/stores/uiStore.svelte.ts','src/version.ts',
  'tests/finalization.test.ts','tests/interactionAffordances_ui.test.ts','tests/loadingTips.test.ts','tests/sceneDisplayPreferences.test.ts',
]);
let unchangedUiStyleFiles=0;
const styles=text=>[...text.replaceAll('\r\n','\n').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
for(const entry of baseline){
  const backup=join(out,'before',entry.path);assert.equal(digest(backup),entry.sha256,'Backup changed: '+entry.path);assert(existsSync(join(root,entry.path)),'Original deleted: '+entry.path);
  if(digest(join(root,entry.path))!==entry.sha256){assert(allowed.has(entry.path),'Unexpected change: '+entry.path);changed.push(entry.path);}
  if(entry.path.endsWith('.svelte')&&entry.path!=='src/components/ShunshunhuaWorkspace.svelte'){assert.deepEqual(styles(read(entry.path)),styles(readFileSync(backup,'utf8')),'Existing UI styles changed: '+entry.path);unchangedUiStyleFiles++;}
}
const originalNames=new Set(baseline.map(e=>e.path)),newFiles=[];
function walk(dir){for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){const file=dir+'/'+entry.name;if(file==='src/assets')continue;if(entry.isDirectory())walk(file);else if(!originalNames.has(file))newFiles.push(file);}}
for(const dir of ['src','tests','scripts'])walk(dir);
const packageVersion=json('package.json').version,versionSource=read('src/version.ts'),version=/export const VERSION = "([^"]+)"/.exec(versionSource)[1],revision=/export const REVISION = "([^"]+)"/.exec(versionSource)[1];
assert.equal(version,'1.49.7');assert.equal(packageVersion,version);assert.match(read('src/game/core/migrate.ts'),/SAVE_VERSION\s*=\s*37/);
function array(name){const source=read('src/game/data/loadingTips.ts').slice(read('src/game/data/loadingTips.ts').indexOf('export const '+name));const body=/\[([\s\S]*?)\] as const/.exec(source)[1];return[...body.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m=>JSON.parse(m[0]));}
const tips=array('LOADING_TIPS'),alerts=array('FINANCIAL_ALERT_TIPS'),oldTips=json('tests/fixtures/loadingTipsOriginal.json');assert.equal(tips.length,66);assert.deepEqual(tips.slice(0,46),oldTips);assert.equal(alerts.length,5);
const tests=json('docs/financial-risk-1497-20261028/targeted-tests.json');assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,176);assert.equal(tests.numFailedTestSuites,0);
const check=read('docs/financial-risk-1497-20261028/check.log');assert.match(check,/svelte-check found 0 errors and 100 warnings in 29 files/);
const journeys={};let scenarios=0,screenshots=0;
for(const[folder,count]of [['browser-source',4],['browser-portable',5],['display-source',5],['display-portable',3]]){
  const result=json('docs/financial-risk-1497-20261028/'+folder+'/report.json');assert.equal(result.passed,true,folder);assert.equal(result.scenarios.length,count);assert(result.scenarios.every(s=>s.passed&&s.errors.length===0&&s.external.length===0),folder);
  journeys[folder]={scenarios:count,screenshots:result.scenarios.reduce((n,s)=>n+s.screenshots.length,0),errors:0,externalRequests:0,fixtureBoundary:result.fixtureBoundary};scenarios+=count;screenshots+=journeys[folder].screenshots;
}
const office=json('src/assets/mobile-stills/company/manifest.json');let officeAssetReferences=0;
for(let stage=1;stage<=4;stage++)for(let angle=0;angle<4;angle++)for(const period of ['day','night']){const frame=office.frames[`${stage}-${angle}-${period}`];assert(frame);for(const key of ['src','foreground','depthSrc','hitSrc']){assert(existsSync(join(root,'src/assets/mobile-stills/company',frame[key])));officeAssetReferences++;}}
const normalize=text=>text.replaceAll('\r\n','\n');
const beforeOffice=normalize(readFileSync(join(out,'before/src/lib/companyOffice3D.ts'),'utf8')),afterOffice=normalize(read('src/lib/companyOffice3D.ts')).replace("import {displayPixelScale,type RenderResolution} from './renderResolution';\n",'');
assert.equal(afterOffice.split('export function createCompanyOffice(host:')[0],beforeOffice.split('export function createCompanyOffice(host:')[0],'Existing office model changed');
async function hash(file,marker){const h=createHash('sha256');let tail=Buffer.alloc(0),found=!marker;for await(const chunk of createReadStream(file)){h.update(chunk);if(!found){const data=Buffer.concat([tail,chunk]);found=data.includes(Buffer.from(marker));tail=data.subarray(-512);}}return{path:relative(root,file).replaceAll('\\','/'),bytes:statSync(file).size,sha256:h.digest('hex'),revisionEmbedded:found};}
const previous=json('docs/financial-risk-1497-20261028/previous-portable.json'),archive=await hash(join(root,previous.archive));assert.equal(archive.sha256,previous.sha256);assert.equal(archive.bytes,previous.bytes);
assert.match(read('docs/financial-risk-1497-20261028/portable-build.log'),/Portable release HTML published/);
const artifact=await hash(join(root,'1.49.7.html'),revision),dist=await hash(join(root,'dist-portable/index.html'));assert(artifact.revisionEmbedded);assert.equal(artifact.sha256,dist.sha256);assert.equal(artifact.bytes,dist.bytes);assert.notEqual(artifact.sha256,previous.sha256);
writeFileSync(join(root,'1.49.7.sha256'),artifact.sha256+'  1.49.7.html\n','ascii');assert.equal(read('1.49.7.sha256').trim(),artifact.sha256+'  1.49.7.html');
const report={passed:true,completedAt:new Date().toISOString(),version,revision,saveVersion:37,backupFiles:baseline.length,changedFiles:changed,newFiles,unchangedUiStyleFiles,uiStyleException:'Only the stock application adds its risk-message style; existing scene/HUD styles are identical.',officeModelGeometryPreserved:true,officeFrames:32,officeAssetReferences,assetFilesEditedByThisTask:[],tips:{original:46,added:20,total:tips.length,alert:alerts.length},rules:{rollbackWindowGameDays:30,distinctFinancialRewinds:3,casinoDailyNetStrictlyAboveYuan:10000,banGameDays:30,stockProfitThreshold:null,externalLocalJournal:true,ordinaryLatestReloadCounted:false,previewOrExportCounted:false,confiscationPerCase:true},static:{errors:0,warnings:100},targeted:{passed:tests.numPassedTests,failed:0,files:tests.testResults.length},journeys,scenarios,screenshots,previousPortable:archive,portable:artifact,dist,limits:['Controlled outcomes and saved scenarios verify enforcement, not a natural-play profitability run.','Local device/origin journal; no server-side verification or cross-device audit.','No physical GPU performance benchmark, EXE/APK rebuild or device test was performed.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));
const notes=[
  '# 1.49.7 金融风控、分辨率与交互修改记录',
  '',
  '日期：2026-10-28。实际目录：'+root+'。版本保持 1.49.7，存档版本保持 37。',
  '',
  '## 已实现的规则',
  '',
  '- 同一人生在最近 30 个游戏日内，发生 3 次不同金融进度的有效回退，达到复核条件。读最新档、同一旧进度反复读取、存档列表、导出/导入校验与收入/路线预估不增加证据。',
  '- 赌场额外要求单个游戏日净赢超过 10,000 元，按实际派彩减下注、本金与筹码兑换不算收入；普通大额中奖不会单独触发封禁。',
  '- 确认赌场违规后追缴对应案件中当前存档实际保留的赌场净收益，先收筹码，再扣现金；不足时记录负余额。工资与其他收入不计入追缴基数。再读中奖前的旧档不扣不存在的收益，再读旧中奖档仍执行追缴，同案不重复扣款。再次违规独立记账，避免追缴解禁后的正常收益。',
  '- 赌场黑名单持续 30 个游戏日，拒绝进入、兑换筹码及新下注；旧档中的未结算牌局退本金并终止。',
  '- 股票在 3 次有效回退后冻结顺顺花交易与证券资金转移 30 个游戏日，不另设赌场收入门槛。保留现有持仓与债务，允许查看、撤单、设置止损和还款；强平与到期偿债继续。',
  '- 本机独立记录不会随普通存档回退，切换存档槽、导入旧存档、重启同一浏览器或应用仍生效；游戏日期回退不能缩短禁令。新人生使用独立身份。记录写入失败时，在金融操作扣款前暂停该操作。',
  '- 已付费牌局在读取、列出、导入和校验存档时保持原牌序/结果；新下注仍使用原有真随机生成。',
  '',
  '## 小贴士、音效与画面',
  '',
  '- 原 46 条小贴士保留，追加用户提供的 20 条。赌场或证券任一封禁生效期间，加载页和垃圾桶纸条统一使用指定 5 条穿越者提示，到期恢复普通池。所有文案保留原字句。',
  '- 笔记本、网咖桌面、顺顺花和交易所公用电脑的可操作控件加入已有鼠标声；嵌套事件去重，沿用音效音量与静音。',
  '- 普通地图区域与设施导航取消自动的交通/脚步录音；真实车站确认乘车保留发车提示。交通时间、票价与移动规则不变。',
  '- 原有自动档对 PC 场景限制约 200 万像素，导致高 DPI 或 2K/4K 显示时可能被放大。新增原生 75%、100%、125%、150% 档位，读取系统像素密度并跟随窗口尺寸，只改变 3D framebuffer，不改 UI 缩放、位置或字号。',
  '- 设置入口：主菜单/游戏设置中的显示设置，或 3D 场景右下角“画面设置”→“3D 渲染分辨率”。原有自动档和手动比例保留；2D 照片不重绘。原生档有显卡尺寸及总像素上限，高档位更耗性能。',
  '',
  '## 验证与边界',
  '',
  '- 相关测试 '+tests.numPassedTests+' 项通过，0 失败；静态检查 0 错误、100 条原有警告。',
  '- 浏览器共 '+scenarios+' 个场景、'+screenshots+' 张验收截图：真实下注/揭牌/结算与三次存档回退、单日收入门槛、追缴、跨旧档封禁、正常大额中奖、试算与真实提交、5 条警示、PC/PE 纸条、公用电脑鼠标声及音效关闭。',
  '- 四种 3D 场景在源码浏览器核对原生高 DPI 分辨率；最终便携版复验住宅与办公室、原生/75%切换、窗口调整、设置持久化与 UI 几何/字号不变。地图实际点击切区再进入咖啡馆，确认交通和脚步录音启动次数为 0。',
  '- 轮盘结果为受控测试输入，验证风控而非自然游玩中奖概率；浏览器均用独立测试存储，没有读取或修改玩家存档。软件渲染结果不代表实机帧率。',
  '- 旧测试中“读档重新洗已付费牌局”与本次防回档目标相冲突，已改为验证结果不变。原小贴士测试引用了缺失的历史文稿文件，改用本次修改前源码提取的 46 条固定样本，继续逐条检查原文。',
  '- 离线风控属于同一设备/存储来源的本机记录，没有服务器审计或跨设备记录同步。未制作 EXE/APK，未做实体 GPU、手机或商店发布测试。',
  '',
  '## 交付及保留',
  '',
  '- 已备份 '+baseline.length+' 个原有源码/测试/脚本与配置文件，原件无删除；原 UI 样式核对 '+unchangedUiStyleFiles+' 个文件保持一致，股票新增风控提示样式除外。',
  '- 原办公室布局几何、员工桌位与独立办公室家具保留，32 个办公室静态画面的 '+officeAssetReferences+' 个文件引用完整。本次没有编辑素材文件。',
  '- 更新便携文件：'+join(root,'1.49.7.html')+'，'+artifact.bytes+' 字节。',
  '- SHA-256：'+artifact.sha256,
  '- dist-portable/index.html 与发布 HTML 字节数和 SHA-256 一致；1.49.7.sha256 已同步。',
  '- 修改前便携版：'+join(root,previous.archive)+'；SHA-256：'+previous.sha256,
  '- 可复验入口：scripts/verify-financial-risk-browser-1497.mjs、scripts/verify-display-navigation-1497.mjs、scripts/verify-financial-risk-delivery-1497.mjs。设置 QA_PORTABLE=1 可复验最终 HTML；先运行源码测试生成受控旧档与审计记录。',
  '',
];
writeFileSync(join(out,'本次修改与验证.md'),notes.join('\n'));console.log(JSON.stringify({passed:true,version,tests:report.targeted,scenarios,screenshots,artifact,backupFiles:baseline.length}));
