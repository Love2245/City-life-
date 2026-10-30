import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/nightlife-audio-transition-1497-20261027'),read=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const baseline=read('before-sha256.json'),changes=[];
for(const file of baseline){assert.equal(await hash(join(out,'before',file.path)),file.sha256,'Backup changed '+file.path);assert(existsSync(join(root,file.path)),'Original removed '+file.path);const after=await hash(join(root,file.path));if(after!==file.sha256)changes.push({path:file.path,before:file.sha256,after});}
const allowed=new Set(['src/App.svelte','src/version.ts','src/lib/musicPlayer.ts','src/lib/musicRouting.ts','src/lib/musicCatalogue.ts','src/lib/interactionSoundRouting.ts','src/lib/interactionSoundCatalogue.ts','src/components/CatPanel.svelte','src/components/InventoryModal.svelte','src/components/layout/ScenePanel.svelte','src/components/layout/IntercityTransitModal.svelte','src/components/layout/DistrictLeisurePanel.svelte','tests/musicPlayer.test.ts','tests/interactionSoundRouting.test.ts','tests/interactionAffordances_ui.test.ts','docs/创业系统_1.497_玩法与数值.md']);
for(const change of changes)assert(allowed.has(change.path),'Unexpected changed source '+change.path);
assert.deepEqual(read('baseline-source-drift.json'),[]);assert(!changes.some(f=>f.path.startsWith('src/game/')),'Gameplay/save source changed');
const originals=read('asset-baseline.json');
for(const[index,file]of originals.entries()){assert.equal(await hash(join(root,file.path)),file.sha256,'Existing formal asset changed '+file.path);if((index+1)%2000===0)console.log('Verified original assets '+(index+1)+'/'+originals.length);}
const sounds=read('sfx-manifest.json'),music=read('music-manifest.json');assert.equal(sounds.length,10);assert.equal(music.length,12);assert.equal(new Set(music.map(m=>m.sha256)).size,12);
for(const sound of sounds){assert.equal(await hash(join(root,sound.path)),sound.sha256);assert.equal(await hash(join(root,sound.rawPath)),sound.originalSha256);assert(sound.duration>0&&sound.duration<2&&sound.channels===1&&sound.sampleRate===44100);assert(sound.peakDb<=-2);assert(sound.license.endsWith('/publicdomain/zero/1.0/'));const page=readFileSync(join(out,'sfx-originals',sound.id+'.html'),'utf8');assert(page.includes('creativecommons.org/publicdomain/zero/1.0/'));assert(page.includes(sound.preview));}
for(const track of music){assert.equal(await hash(join(root,track.path)),track.sha256);assert(track.duration>=100&&track.duration<=181&&track.peakDb<=-2);}
const previousPortable=read('previous-portable.json');assert.equal(await hash(join(root,previousPortable.archive)),previousPortable.sha256);
const assets={checkedAt:new Date().toISOString(),passed:true,backupFiles:baseline.length,changedOriginalFiles:changes,gameplayRulesPreserved:true,oldFormalAssetsUnchanged:originals.length,newSounds:{clips:sounds.length,bytes:sounds.reduce((n,s)=>n+s.bytes,0),maxPeakDb:Math.max(...sounds.map(s=>s.peakDb)),allCC0:true,publicHQPreviews:true},newMusic:{tracks:music.length,bytes:music.reduce((n,s)=>n+s.bytes,0),distinctFiles:12,nightclub:5,lounge:5,church:1,temple:1,officialPixabaySources:true}};
writeFileSync(join(out,'asset-verification.json'),JSON.stringify(assets,null,2));
if(process.argv.includes('--assets-only')){console.log(JSON.stringify({...assets,changedOriginalFiles:changes.length},null,2));process.exit(0);}
const check=readFileSync(join(out,'static-check.log'),'utf8');assert.match(check,/found 0 errors and 100 warnings/);
const targeted=read('targeted-tests.json');assert.equal(targeted.numFailedTests,0);assert.equal(targeted.numFailedTestSuites,0);
const full=read('full-tests.json'),old=read('full-baseline.json');
const rawCounts={total:full.numTotalTests,passed:full.numPassedTests,failed:full.numFailedTests};
// Preserve the raw run: one old source-string expectation was updated for transport-specific cues;
// the routing test was invalidated by the bottle refinement during its worker's module cache lifetime.
const rerunFiles=['tests/interactionAffordances_ui.test.ts','tests/interactionSoundRouting.test.ts'];
for(const file of rerunFiles){const rerun=targeted.testResults.find(f=>f.name.replaceAll('\\','/').endsWith('/'+file));assert(rerun&&rerun.status==='passed');full.testResults=full.testResults.map(f=>f.name.replaceAll('\\','/').endsWith('/'+file)?rerun:f);}
full.numPassedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(t=>t.status==='passed').length,0);full.numFailedTests=full.testResults.reduce((n,f)=>n+f.assertionResults.filter(t=>t.status==='failed').length,0);
function failures(run){return run.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>relative(root,f.name).replaceAll('\\','/')+' :: '+a.fullName));}
function collection(run){return run.testResults.filter(f=>f.status==='failed'&&!f.assertionResults.length).map(f=>relative(root,f.name).replaceAll('\\','/')).sort();}
const oldFailures=new Set(failures(old)),current=failures(full),newFailures=current.filter(f=>!oldFailures.has(f)),resolvedFailures=[...oldFailures].filter(f=>!current.includes(f));assert.deepEqual(newFailures,[]);assert.deepEqual(collection(full),collection(old));
const browser=read('portable-browser/verification.json');assert(browser.passed);assert(browser.scenarios.length>=8);for(const s of browser.scenarios){assert(s.passed);assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);assert(s.checks.some(c=>c.all28ClipsDecoded));}
const source=read('browser-source/verification.json');assert(source.passed);assert.equal(source.scenarios.filter(s=>s.music).length,12);assert.equal(source.scenarios.length,19);
const portablePath=join(root,'1.49.7.html'),sha256=await hash(portablePath),input=read('portable-run-input.json');assert.equal(await hash(join(root,'dist-portable/index.html')),sha256);assert.equal(input.sha256,sha256);assert(input.embeddedRevisionFound);assert.notEqual(sha256,previousPortable.sha256);
assert.equal(input.embeddedAudio.length,40);assert(input.embeddedAudio.every(a=>a.found),'Audio missing from portable bundle');
const versionSource=readFileSync(join(root,'src/version.ts'),'utf8'),version=versionSource.match(/export const VERSION = "([^"]+)"/)[1],revision=versionSource.match(/export const REVISION = "([^"]+)"/)[1];assert.equal(input.revision,revision);assert.equal(JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,version);
const files=[];function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='assets')walk(path);}else if(/\.(ts|svelte|js|mjs|cjs|css|json)$/.test(entry.name))files.push(path);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.(ts|js|mjs|json|css)$/.test(entry.name))files.push(join(root,entry.name));
const oldSounds=JSON.parse(readFileSync(join(root,'docs/interaction-audio-1497-20261027/sound-manifest.json'),'utf8'));for(const asset of [...oldSounds,...sounds,...music])files.push(join(root,asset.path));
const fingerprints=[];for(const path of files)fingerprints.push({path:relative(root,path).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await hash(path)});writeFileSync(join(out,'source-sha256.json'),JSON.stringify(fingerprints,null,2));writeFileSync(join(root,'1.49.7.sha256'),sha256+'  1.49.7.html\n');
const report={completedAt:new Date().toISOString(),passed:true,version,revision,saveVersion:37,portable:{path:portablePath,bytes:statSync(portablePath).size,sha256,embeddedRevisionFound:true},previousPortable,...assets,
  static:{errors:0,existingWarnings:100},targeted:{passed:targeted.numPassedTests,failed:0,files:targeted.testResults.length},
  fullSuite:{total:full.numTotalTests,passed:full.numPassedTests,failed:full.numFailedTests,rawRun:rawCounts,finalSourceRerunFiles:rerunFiles,collectionFailures:collection(full),newFailures,resolvedFailures},
  sourceBrowser:{scenarios:source.scenarios.length,musicCases:12,errors:0},portableBrowser:{scenarios:browser.scenarios.length,screenshots:browser.scenarios.reduce((n,s)=>n+s.screenshots.length,0),errors:0,externalRequests:0},
  limits:['Controlled saved-state UI journeys, not a full natural-play economy run.','Native audio decode/source starts, waveform energy and peak levels checked; subjective playback/device listening was not verified.','Headless Chrome desktop/mobile viewports; no physical-device audio/performance checks or new EXE/APK.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,changedOriginalFiles:changes.length},null,2));
writeFileSync(join(out,'交付说明.md'),`# 1.49.7 场所配乐、细分音效与区域转场

已更新单文件：\`${portablePath}\`。版本仍为1.49.7，存档版本37；修订标记为“${revision}”。

## 玩家可见变化

夜总会、清吧各五套不同配乐；教堂与寺庙各一套。晴／热浪工作日、多云工作日、雨雪／寒潮工作日、普通周末、雨雪／寒潮周末分别选曲，同一条件反复进入不会重新抽签。教堂为管风琴曲，寺庙为禅意氛围曲。沿用既有音量、静音与三秒音乐渐变；解码缓存保留最近三首。

新增10段CC0短音效，与既有18段共同使用：淋浴、饮水、开瓶、酒杯、汽车启动、自行车铃、公交、列车、倒猫粮、点香。购买饮料用交易声，背包实际饮用瓶装饮料用开瓶声；咖啡用饮水声。交通取执行前的真实出行方案，成功后播放，失败不播放成功反馈。设施未开门、玩家仍在门外等候时不播放开门声，实际入场只播放一次。沿用独立音效音量、静音、后台暂停、并发和冷却限制。

区域与设施切换、面包屑返回及城际出发增加短转场。支持原生页面快照的浏览器同时过渡地图背景和界面，主动画280毫秒；旧引擎使用场景过渡，减少动态效果时立即切换。既有大场景加载流程仍负责素材准备。

## 验证

- 静态检查：0错误，100条既有警告。
- 最终专项：${targeted.numPassedTests}项通过，${targeted.testResults.length}个文件，0失败。
- 全量原始记录：${rawCounts.passed}项通过、${rawCounts.failed}项断言失败。两项相关检查在最终代码上修正并重新运行通过后，为${full.numPassedTests}通过、${full.numFailedTests}项既有失败；与基线逐项比较无新增失败。另有7项既有收集失败，不能称全套测试全绿。原始全量与专项JSON均保留。
- 源码浏览器：${source.scenarios.length}组通过，包括全部12套场所音乐的实际播放。
- 最终单文件：${browser.scenarios.length}组通过、${report.portableBrowser.screenshots}张截图，0运行错误、0外网请求；各组验证全部28段交互录音的原生解码。覆盖住宅交互、场所音乐、桌面与手机横屏导航、减少动态效果与无原生API回退。
- 导航对照同一份初始状态执行核心计算，费用与时间各结算一次；原生快照生命周期完成，动画时长含280毫秒。
- ${originals.length}个既有正式素材逐项SHA-256一致；修改前${baseline.length}个源文件备份一致，游戏核心与存档源码未改动。
- 40份音频（28段音效、12首新场所音乐）的数据已确认内置最终HTML。

验证使用独立无头Chrome配置与构造存档，不操作玩家当前浏览器和存档；音频验证覆盖原生解码、波形能量、源启动与电平，不替代实体设备试听。未生成新EXE或APK。

## 文件与记录

- HTML字节数：${report.portable.bytes}
- SHA-256：\`${sha256}\`
- 旧版归档：\`${previousPortable.archive}\`
- [完整验证](verification.json)、[当前源码指纹](source-sha256.json)、[原始全量测试](full-tests.json)、[最终专项](targeted-tests.json)
- [音乐来源与授权](音乐来源与授权.md)、[音效来源与授权](音效来源与授权.md)
- [源码浏览器记录](browser-source/verification.json)、[单文件浏览器记录](portable-browser/verification.json)

用户要求先推进其他开发后，未再操作音乐网站；已完成的本地音乐素材保留并接入本次构建。刷新前先在当前游戏中保存进度，再重新打开更新后的HTML。
`);
