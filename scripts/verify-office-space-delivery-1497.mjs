import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,statSync,writeFileSync,openSync,readSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import {Matrix4,Vector3} from 'three';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/office-space-1497-20261027');
const assetDir=join(root,'src/assets/mobile-stills/company');
const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const saved=name=>json(join(out,name));
const hash=async path=>{const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);return h.digest('hex');};
const manifest=json(join(assetDir,'manifest.json')),old=json(join(out,'before/src/assets/mobile-stills/company/manifest.json'));
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let plans;
try{plans=(await server.ssrLoadModule('/src/game/core/companyOffice.ts')).COMPANY_OFFICES;}finally{await server.close();}

function dimensions(file){
  const b=Buffer.alloc(64),fd=openSync(join(assetDir,file),'r');try{readSync(fd,b,0,b.length,0);}finally{closeSync(fd);}
  if(b.toString('ascii',1,4)==='PNG')return[b.readUInt32BE(16),b.readUInt32BE(20)];
  assert.equal(b.toString('ascii',8,12),'WEBP');const type=b.toString('ascii',12,16);
  if(type==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(type==='VP8 ')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  assert.equal(type,'VP8L');const bits=b.readUInt32LE(21);return[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
}
assert.equal(manifest.layoutRevision,'2026-10-27-wall-aligned-teams-and-executive-offices');
assert.deepEqual(manifest.sprites,old.sprites,'Employee and computer sprite metadata changed');
let frames=0,files=0,labels=0;
for(const plan of plans)for(const angle of [0,1,2,3])for(const period of ['day','night']){
  const key=`${plan.stage}-${angle}-${period}`,f=manifest.frames[key];assert(f);
  assert.notDeepEqual(f.labels,old.frames[key].labels,'Office uses old workstation coordinates');
  assert.deepEqual(f.hitIds,[...plan.desks.map((_,i)=>String(i)),'-1']);
  assert.equal(f.labels.length,plan.desks.length+1);
  const matrix=new Matrix4().fromArray(f.matrix);
  for(const [index,[x,z]]of plan.desks.entries()){
    const p=new Vector3(x,1.42,z).applyMatrix4(matrix),label=f.labels.find(l=>l.index===index);assert(label);
    assert(Math.abs(label.x-(p.x+1)*f.width/2)<1e-6&&Math.abs(label.y-(1-p.y)*f.height/2)<1e-6,`${key} seat ${index} uses stale coordinates`);labels++;
  }
  for(const name of ['src','foreground','depthSrc','hitSrc']){assert(existsSync(join(assetDir,f[name])));assert.deepEqual(dimensions(f[name]),[4096,2560]);files++;}
  frames++;
}
for(const sprite of Object.values(manifest.sprites))for(const name of ['src','depthSrc']){
  assert(existsSync(join(assetDir,sprite[name])));assert.deepEqual(dimensions(sprite[name]),[sprite.width,sprite.height]);files++;
}
const assets={passed:true,frames,regeneratedFrames:32,checkedFileReferences:files,checkedSeatAnchors:labels,spriteMetadataUnchanged:true,wallAlignedOffices:4};
writeFileSync(join(out,'assets-verification.json'),JSON.stringify(assets,null,2));
if(process.argv.includes('--assets-only')){console.log(JSON.stringify(assets));process.exit(0);}

const baseline=saved('before-sha256.json'),changes=[];
for(const file of baseline){assert.equal(await hash(join(out,'before',file.path)),file.sha256,'Backup changed: '+file.path);assert(existsSync(join(root,file.path)),'Original removed: '+file.path);if(await hash(join(root,file.path))!==file.sha256)changes.push(file.path);}
const previous=saved('previous-portable.json');assert.equal(await hash(join(root,previous.archive)),previous.sha256,'Previous HTML changed');
const attendance=source=>source.slice(source.indexOf('export interface OfficeSeat'));
assert.equal(attendance(readFileSync(join(root,'src/game/core/companyOffice.ts'),'utf8')),attendance(readFileSync(join(out,'before/src/game/core/companyOffice.ts'),'utf8')),'Employee state/attendance behavior changed');
const tests=saved('targeted-tests.json');assert.equal(tests.numFailedTests,0);assert.equal(tests.numFailedTestSuites,0);assert.equal(tests.numPassedTests,44);
assert.match(readFileSync(join(out,'check.log'),'utf8'),/found 0 errors and 100 warnings/);
const bake=saved('office-stills-bake.json');assert(bake.passed);assert.equal(bake.frames.length,32);assert.deepEqual(bake.errors,[]);
const previews=saved('founder-previews.json');assert(previews.passed);assert.equal(previews.views.length,2);
for(const view of previews.views){assert.equal(view.visitorChairs,view.stage===4?2:1);for(const b of view.bounds){assert(b.min[0]>=0&&b.min[2]>=0&&b.max[0]<=(view.stage===4?6.2:5)&&b.max[2]<=(view.stage===4?5.7:4.8),'Founder furniture crosses private-room walls');}}
const journeys=[];
for(const folder of ['source-3d','source-2d','portable']){
  const report=saved(folder+'/verification.json');assert(report.passed);
  assert.equal(report.scenarios.length,folder==='portable'?8:4);
  for(const scenario of report.scenarios){assert(scenario.passed);assert.deepEqual(scenario.errors,[]);assert.deepEqual(scenario.external,[]);journeys.push({build:folder,id:scenario.id,screenshots:scenario.screenshots.length,checks:scenario.checks});}
}
const artifact=join(root,'1.49.7.html'),sha256=await hash(artifact);assert.notEqual(sha256,previous.sha256);assert.equal(await hash(join(root,'dist-portable/index.html')),sha256);
assert(readFileSync(join(root,'1.49.7.sha256'),'utf8').toLowerCase().includes(sha256));
assert.equal(json(join(root,'package.json')).version,'1.49.7');
const report={passed:true,completedAt:new Date().toISOString(),version:'1.49.7',revision:'2026.10.27 · 办公分区与独立办公室',changedFiles:changes,addedScripts:['scripts/preview-office-space-1497.mjs','scripts/verify-office-space-delivery-1497.mjs'],assets,static:{errors:0,existingWarnings:100},targeted:{passed:tests.numPassedTests,failed:0},journeys,founderPreviews:previews.views.map(v=>({stage:v.stage,file:v.file,visitorChairs:v.visitorChairs})),previousPortable:previous,portable:{path:artifact,bytes:statSync(artifact).size,sha256},limits:['Controlled saved-company fixtures in isolated Chromium contexts.','Mobile uses touch emulation; 3D uses software rendering.','Full repository suite, physical phones and EXE/APK were not tested or built.']};
writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,portable:report.portable,journeys:journeys.length,assets}));
const portablePath=artifact.replaceAll('\\','/'),archivePath=join(root,previous.archive).replaceAll('\\','/');
writeFileSync(join(out,'本次修改与验证.md'),[
  '# 1.49.7 办公分区与独立办公室',
  '',
  '修订标识：2026.10.27 · 办公分区与独立办公室。',
  '',
  '## 本次修改',
  '',
  '- 大办公室改为临窗双人区、四人项目岛和侧向三人区，九名员工分散使用办公室纵深。',
  '- 整层办公室改为三个错落的四人工作岛和一个侧向三人区，主通道连接电梯入口、团队和协作区。',
  '- 四类办公室的接待沙发靠墙，临窗桌向窗台收拢；大办公室打印柜靠侧墙，整层打印储物区靠外墙，补充茶几、低隔板与绿植。',
  '- 玩家独立办公室采用带侧柜、文件抽屉、桌垫、台灯和文具的L形木质桌，座椅背靠采光侧、面向来客；加入靠墙书柜、沙发和茶几，整层版本使用更宽的桌面和双访客座位。',
  '- 工位编号、员工与电脑归属、出勤和经营入口沿用原逻辑；不修改存档格式。',
  '- 同步重做四类办公室四方向、昼夜共32张4K照片，以及深度、前景和点击图；员工及电脑分层元数据保持一致。',
  '',
  '分区思路参考 [Steelcase 的团队与共享空间布局](https://www.steelcase.com/spaces/community-based-design/)，再按游戏中的门、窗与办公室面积调整。',
  '',
  '## 当前验证',
  '',
  '- 静态检查：0错误、100条现有警告。',
  '- 办公室家具边界、桌椅碰撞、主通道净空、玩家会客区、工位点击、设备增量更新与昼夜等相关测试44项通过。',
  '- 开发版检查四类办公室的电脑3D和手机2D共8个场景；最终离线HTML再次检查对应8个场景，合计'+journeys.length+'个场景、'+journeys.reduce((n,j)=>n+j.screenshots,0)+'张截图。',
  '- 场景均检查末尾员工工位、转向、主角工作、团队、等待至夜间及出门；相机边界在3D检查，手机2D检查竖屏拦截。',
  '- 32个场景帧、776处图片文件引用、280个工位投影定位一致；页面和控制台无错误，离线场景无外部请求。',
  '- 原始备份'+baseline.length+'个文件的校验通过，修改前HTML归档校验通过，当前发布文件与dist-portable/index.html及SHA-256文件一致。',
  '',
  '测试使用隔离的公司存档和浏览器触摸模拟；3D使用软件渲染。未重跑完整仓库测试，未进行真实手机或所有显卡驱动验证。',
  '',
  '## 交付',
  '',
  '- 发布文件：['+portablePath+']('+portablePath+')',
  '- 文件大小：'+report.portable.bytes+'字节。',
  '- SHA-256：`'+sha256+'`。',
  '- 修改前HTML：['+archivePath+']('+archivePath+')',
  '- 修改前HTML SHA-256：`'+previous.sha256+'`。',
  '- 原始源文件与场景素材保存在本目录before，完整检查结果见verification.json。',
  '',
].join('\n'));
