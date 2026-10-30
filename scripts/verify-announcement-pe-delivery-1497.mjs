import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/announcement-pe-1497-20261028');
const read=p=>readFileSync(join(root,p),'utf8'),json=p=>JSON.parse(read(p)),digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const before=json('docs/announcement-pe-1497-20261028/before.json'),changed=[],protectedFiles=[];
for(const file of before.files){assert.equal(digest(join(out,'before',file.path)),file.sha256);const current=digest(join(root,file.path));if(current!==file.sha256){assert(['src/components/AnnouncementModal.svelte','src/version.ts'].includes(file.path),'Unexpected change: '+file.path);changed.push(file.path);}else protectedFiles.push(file.path);}
assert.equal(changed.length,2);assert.equal(json('package.json').version,'1.49.7');assert.match(read('src/game/core/migrate.ts'),/SAVE_VERSION\s*=\s*37/);
const revision=/export const REVISION = "([^"]+)"/.exec(read('src/version.ts'))[1];assert.match(revision,/PE公告关闭与滑动修复/);
const baseline=json('docs/announcement-pe-1497-20261028/baseline/report.json');assert(baseline.scenarios.some(s=>!s.dialogFits));assert(baseline.scenarios.some(s=>s.initial.close.w<44));
const journeys={};let scenarioCount=0,screenshotCount=0;
for(const mode of ['source','portable']){
  const report=json(`docs/announcement-pe-1497-20261028/${mode}/report.json`);assert.equal(report.passed,true);assert.equal(report.scenarios.length,8);
  for(const s of report.scenarios){assert(s.passed&&s.dialogFits&&s.nativeScrollWorks&&s.fixedControls&&s.allContentReachable&&s.closeTapped&&s.confirmTapped&&s.dismissalPersisted,s.id);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);if(!s.pc)assert(Math.min(s.initial.close.w,s.initial.close.h,s.initial.confirm.h)>=43.5);}
  assert(report.scenarios.find(s=>s.id==='pe-landscape-70').rotationDismissed);const shots=report.scenarios.reduce((n,s)=>n+s.screenshots.length,0);journeys[mode]={scenarios:8,screenshots:shots,errors:0,externalRequests:0,touchSwipes:true,closeAndConfirmByPhysicalCoordinates:true,rotation:true};scenarioCount+=8;screenshotCount+=shots;
}
const checks=read('docs/announcement-pe-1497-20261028/check.log');assert.match(checks,/svelte-check found 0 errors and 100 warnings in 29 files/);
const tests=json('docs/announcement-pe-1497-20261028/targeted-tests.json');assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,51);
assert.match(read('docs/announcement-pe-1497-20261028/portable-build.log'),/Portable release HTML published/);
async function hash(file,marker){const h=createHash('sha256');let found=!marker,tail=Buffer.alloc(0);for await(const part of createReadStream(join(root,file))){h.update(part);if(!found){const b=Buffer.concat([tail,part]);found=b.includes(Buffer.from(marker));tail=b.subarray(-512);}}return{path:file,bytes:statSync(join(root,file)).size,sha256:h.digest('hex'),revisionEmbedded:found};}
const archive=await hash(before.previous.archive);assert.equal(archive.sha256,before.previous.sha256);assert.equal(archive.bytes,before.previous.bytes);
const artifact=await hash('1.49.7.html',revision),dist=await hash('dist-portable/index.html');assert(artifact.revisionEmbedded);assert.equal(artifact.sha256,dist.sha256);assert.notEqual(artifact.sha256,archive.sha256);writeFileSync(join(root,'1.49.7.sha256'),artifact.sha256+'  1.49.7.html\n','ascii');
const report={passed:true,completedAt:new Date().toISOString(),version:'1.49.7',saveVersion:37,revision,changedFiles:changed,protectedFiles,baselineFindings:{unsafeInsetPlacement:baseline.scenarios.filter(s=>!s.dialogFits).map(s=>s.id),closeWidths:baseline.scenarios.map(s=>({id:s.id,width:s.initial.close.w})),nativeScrollingWorkedInCurrentChromium:true,completeCloseFailureNotReproducedInCurrentChromium:true},static:{errors:0,warnings:100},targeted:{passed:51,failed:0,files:tests.testResults.length},journeys,scenarioCount,screenshotCount,portable:artifact,dist,previousPortable:archive,limits:['Native browser touch events with controlled inset bridge fixtures; no personal saves accessed.','No physical Android/iOS device test or APK rebuild.','Legacy vh fallback is present in source; no older WebView executable was tested.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));
writeFileSync(join(out,'本次修改与验证.md'),[
  '# 1.49.7 PE 开幕公告关闭与滑动修复',
  '',
  '日期：2026-10-28；项目：'+root+'。版本保持 1.49.7，存档版本保持 37。',
  '',
  '## 修复内容',
  '',
  '- 公告移出界面缩放/过渡容器，按真实视口定位，独立处理刘海、系统栏与底部安全区。其他页面的 UI 缩放不变。',
  '- 弹窗使用明确高度，标题、关闭按钮和底部“开始体验”固定保留，正文单独滚动，支持原生手指滑动与 PC 滚轮。',
  '- 关闭按钮扩大到 44×44 像素，“开始体验”至少 44 像素高，不依赖滚到最后才能关闭。',
  '- 小屏横屏压缩公告内边距，竖屏保留双行底部布局；增加传统 vh 高度兜底，避免旧 WebView 忽略 dvh 后失去高度限制。',
  '- 保留原公告正文、交流群及讨论链接。按钮关闭、重新打开、再次关闭和关闭状态持久化均沿用原逻辑。',
  '',
  '## 验证结果',
  '',
  '- 修改前在当前 Chromium 可触摸滑动并关闭，未复现完全无法关闭；但确认公告越过模拟刘海/底部安全区，关闭按钮宽度只有 36～38 像素。',
  '- 源码与最终 HTML 各 8 个场景，共 '+scenarioCount+' 个场景、'+screenshotCount+' 张截图，全部通过。PE 尺寸为 932×430、844×390、812×375、740×360、640×320、390×844；UI 缩放覆盖 70%、100%、130%。PC 另验证 100% 与 150% 缩放。',
  '- 使用实际 Chromium 触摸事件逐次上划，确认可滑到最后一条公告、滑动时顶部/底部位置不变，并按屏幕物理坐标点击关闭与开始体验；同时测试横竖屏切换后关闭。测试没有直接改写 scrollTop，也没有依赖自动滚动到关闭按钮。',
  '- 51 项显示/主题回归测试通过；静态检查 0 错误、100 条原有警告。',
  '- 仅修改 AnnouncementModal.svelte 和版本更新说明；主菜单关闭逻辑、全局移动端样式、金融风控、分辨率规则和游戏状态代码的备份哈希保持一致。素材未编辑。',
  '- 使用独立浏览器存储，无个人存档读写。没有实体 Android/iOS 手机测试、旧版 WebView 可执行程序测试，也没有重打 APK。',
  '',
  '## 交付',
  '',
  '- HTML：'+join(root,'1.49.7.html')+'；'+artifact.bytes+' 字节。',
  '- SHA-256：'+artifact.sha256,
  '- 发布文件与 dist-portable/index.html 一致，1.49.7.sha256 已同步。',
  '- 修改前 HTML：'+join(root,before.previous.archive)+'；SHA-256：'+archive.sha256,
  '- 复验：node scripts/verify-announcement-pe-1497.mjs；设置 QA_PORTABLE=1 可复验最终 HTML。',
  '- PE 横屏截图：portable/pe-compact-70-opened.png。',
  '',
].join('\n'));
console.log(JSON.stringify({passed:true,artifact,scenarioCount,screenshotCount,tests:51,static:report.static}));
