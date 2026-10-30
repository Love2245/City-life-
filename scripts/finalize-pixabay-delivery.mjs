import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/pixabay-asset-integration-1497-20261027');
const json=file=>JSON.parse(readFileSync(join(out,file),'utf8'));
async function sha(file){const hash=createHash('sha256');for await(const data of createReadStream(file))hash.update(data);return hash.digest('hex');}
const preservation=json('preservation.json'),source=json('browser-source/verification.json'),model=json('browser-model-final/verification.json'),cat=json('browser-cat-final/verification.json'),portable=json('browser-portable-final/verification.json'),previous=json('previous-portable.json');
for(const [name,report] of Object.entries({preservation,source,model,cat,portable}))assert(report.passed,`${name} verification did not pass`);
assert.equal(portable.cases.length,4);for(const entry of portable.cases){assert(entry.passed);assert.deepEqual(entry.errors,[]);assert.deepEqual(entry.external,[]);}
const html=join(root,'1.49.7.html'),dist=join(root,'dist-portable/index.html'),digest=await sha(html),distDigest=await sha(dist);
assert.equal(digest,distDigest);assert.equal(digest,portable.artifact.sha256);assert.notEqual(digest,previous.sha256.toLowerCase());
const check=readFileSync(join(out,'check-final.log'),'utf8'),tests=readFileSync(join(out,'targeted-tests.log'),'utf8');
assert(/svelte-check found 0 errors and 100 warnings/.test(check));assert(/87 passed/.test(tests));
writeFileSync(join(root,'1.49.7.sha256'),`${digest}  1.49.7.html\n`);
const delivery={version:'1.49.7',revision:'2026.10.27 · 场所新配乐与咖啡馆细节',portable:{path:html,bytes:statSync(html).size,sha256:digest,distIdentical:true},previous,checks:{svelteErrors:0,svelteWarnings:100,targetedTestsPassed:87,sourceBrowserCases:source.cases.length,updatedModelBrowserCases:model.cases.length,updatedCatBrowserCases:cat.cases.length,portableBrowserCases:portable.cases.length,portableNetworkRequests:0,preservedAssets:preservation.assets.checked,preservedPreviousAudio:preservation.previousAudio.checked,unexpectedChanges:0}};
writeFileSync(join(out,'verification.json'),JSON.stringify(delivery,null,2)+'\n');
const note=`# 1.49.7 场所新配乐、猫咪音效与咖啡馆 3D 细节\n\n已更新独立单文件：\`${html}\`。游戏版本 1.49.7，修订标记“${delivery.revision}”。\n\n- 夜总会 00:00—05:59 播放 [Still — sdacfn](https://opengameart.org/content/still)；清吧同一时段播放 [Chills — Holizna](https://opengameart.org/content/chills)。其余时段继续使用既有天气／周末曲目。\n- 咖啡馆入场后播放 [Coffee House Bump — OatCog](https://opengameart.org/content/coffee-house-bump)，等待开门仍走地图配乐。\n- 猫咪成功玩耍时播放 [Cat Purr & Meow — Kerzoven](https://opengameart.org/content/cat-purr-meow) 的短录音；失败不播放。\n- 咖啡馆 3D 后吧台加入 [Pixabay 铜制咖啡壶](https://pixabay.com/3d-models/cezve-turkish-coffee-pot-coffee-pot-4797/)，共享桌加入 [Poly Haven 多肉盆栽](https://polyhaven.com/a/potted_plant_04)。2D 场景仍使用原有烘焙图片。\n- 音频和模型的作者、许可、原件、处理方式与 SHA-256 见 [素材来源与使用说明](素材来源与使用说明.md)及[素材索引](素材索引与校验.json)。\n\n## 验证\n\n- 静态检查 0 错误、100 条既有警告；专项 7 个测试文件、87 项通过。全量测试本轮未重复运行。\n- 构造存档与独立浏览器实际启动 3 首音乐、猫咪音效，并加载两个 3D 模型、点击咖啡设施。最终单文件 4 个场景通过，0 运行错误、0 外部网络或文件请求。\n- 对照既有 8145 个素材和 40 个此前音频，没有意外改动；相关修改前源码已备份。\n- 上述验证覆盖音频解码和播放启动，不等同于人工试听或实体设备测试；未生成新的 EXE 或 APK。\n\n## 单文件与备份\n\n- 字节数：${delivery.portable.bytes}\n- SHA-256：\`${digest}\`；与 \`dist-portable/index.html\` 一致。\n- 旧版归档：\`${previous.archive}\`；SHA-256：\`${previous.sha256.toLowerCase()}\`。\n- [最终单文件验证](browser-portable-final/verification.json)、[素材保全检查](preservation.json)和[完整交付记录](verification.json)。\n`;
writeFileSync(join(out,'交付说明.md'),note);
console.log(JSON.stringify(delivery,null,2));
