import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const audit=join(root,'docs/pixabay-asset-integration-1497-20261027');
const library='G:/都市生活/素材库/音乐音效/OpenGameArt授权音乐_20261027';
const modelLibrary='G:/都市生活/素材库/家居家具物件模型/Pixabay咖啡馆物件_20261027';
const plantLibrary='G:/都市生活/素材库/家居家具物件模型/PolyHaven咖啡馆物件_20261027';
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const describe=file=>{const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=channels,sample_rate','-of','json',file],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout);};
const specs=[
  {id:'nightclub-late-night',title:'Still',author:'sdacfn',page:'https://opengameart.org/content/still',source:'https://opengameart.org/sites/default/files/still.mp3',original:'夜总会_Still_sdacfn_原始.mp3',runtime:'src/assets/music/场所氛围/夜总会_深夜律动_Still.mp3',usage:'夜总会 00:00 至 05:59'},
  {id:'lounge-late-night',title:'Chills',author:'Holizna',page:'https://opengameart.org/content/chills',source:'https://opengameart.org/sites/default/files/01_holiznacc0_-_chills_0.mp3',original:'清吧_Chills_Holizna_原始.mp3',runtime:'src/assets/music/场所氛围/清吧_深夜慢拍_Chills.mp3',usage:'清吧 00:00 至 05:59'},
  {id:'cafe',title:'Coffee House Bump',author:'OatCog',page:'https://opengameart.org/content/coffee-house-bump',source:'https://opengameart.org/sites/default/files/little_cafe_0.wav',original:'咖啡馆_CoffeeHouseBump_OatCog_原始.wav',runtime:'src/assets/music/场所氛围/咖啡馆_暖灯轻爵士_CoffeeHouseBump.mp3',usage:'咖啡馆营业期间'},
  {id:'cat_play',title:'Cat Purr & Meow: cat_softmew',author:'Kerzoven',page:'https://opengameart.org/content/cat-purr-meow',source:'https://opengameart.org/sites/default/files/cat_softmew.wav',original:'猫咪_轻叫_Kerzoven_原始.wav',runtime:'src/assets/sfx/场景细化/猫咪玩耍_轻叫_Kerzoven.mp3',usage:'成功与猫咪玩耍时'},
];
const audio=specs.map(spec=>{const original=join(library,spec.original),runtime=join(root,spec.runtime);return {...spec,license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',originalPath:original,originalBytes:statSync(original).size,originalSha256:sha(original),originalProbe:describe(original),runtimeBytes:statSync(runtime).size,runtimeSha256:sha(runtime),runtimeProbe:describe(runtime),processing:spec.id==='cat_play'?'从 0.25 秒起截取 1.85 秒，首尾淡化、响度整理，单声道 MP3':'前 150 秒，响度整理，44100 Hz 立体声 MP3，播放时淡入淡出'};});
const modelFile=join(root,'src/assets/scenes/cafe/pixabay-cezve-4797.glb');
const model={id:'pixabay-cezve-4797',title:'Cezve Turkish Coffee Pot',author:'Gal-B',page:'https://pixabay.com/3d-models/cezve-turkish-coffee-pot-coffee-pot-4797/',license:'Pixabay Content License',licenseUrl:'https://pixabay.com/service/license-summary/',originalPath:join(modelLibrary,'咖啡壶_Gal-B_4797_原始.glb'),runtime:'src/assets/scenes/cafe/pixabay-cezve-4797.glb',bytes:statSync(modelFile).size,sha256:sha(modelFile),usage:'咖啡馆 3D 后吧台',sourceUnchanged:true};
if(sha(model.originalPath)!==model.sha256)throw Error('3D library and runtime hashes differ');
const plantFile=join(root,'src/assets/scenes/cafe/polyhaven-potted-plant-04.glb');
const originalPlant=['potted_plant_04_1k.gltf','potted_plant_04.bin','textures/potted_plant_04_nor_gl_1k.jpg','textures/potted_plant_04_arm_1k.jpg','textures/potted_plant_04_diff_1k.jpg'];
const plant={id:'polyhaven-potted-plant-04',title:'Potted Plant 04',author:'James Ray Cock',page:'https://polyhaven.com/a/potted_plant_04',license:'CC0 1.0',licenseUrl:'https://polyhaven.com/license',originalPath:join(plantLibrary,'原始'),originalFiles:originalPlant.map(name=>({file:name,sha256:sha(join(plantLibrary,'原始',name))})),libraryGlb:join(plantLibrary,'多肉盆栽_PolyHaven_1k_游戏版.glb'),runtime:'src/assets/scenes/cafe/polyhaven-potted-plant-04.glb',bytes:statSync(plantFile).size,sha256:sha(plantFile),usage:'咖啡馆 3D 共享桌',processing:'将原版 glTF、几何数据和 1K 纹理组合为内嵌 GLB；不改几何和图像'};
if(sha(plant.libraryGlb)!==plant.sha256)throw Error('Plant library and runtime hashes differ');
const manifest={recorded:'2026-10-27',audio,models:[model,plant]};
writeFileSync(join(audit,'素材索引与校验.json'),JSON.stringify(manifest,null,2)+'\n');
const cafeManifestPath=join(root,'src/assets/scenes/cafe/asset-manifest.json');const cafe=JSON.parse(readFileSync(cafeManifestPath,'utf8'));
if(!cafe.assets.some(asset=>asset.file==='pixabay-cezve-4797.glb'))cafe.assets.push({file:'pixabay-cezve-4797.glb',bytes:model.bytes,sha256:model.sha256,sourceUrl:model.page,author:model.author,license:model.license,licenseUrl:model.licenseUrl,sourceFile:model.originalPath,sourceUnchanged:true});
if(!cafe.assets.some(asset=>asset.file==='polyhaven-potted-plant-04.glb'))cafe.assets.push({file:'polyhaven-potted-plant-04.glb',bytes:plant.bytes,sha256:plant.sha256,sourceUrl:plant.page,author:plant.author,license:plant.license,licenseUrl:plant.licenseUrl,sourceFile:plant.originalPath,processing:plant.processing});
cafe.models=cafe.assets.filter(asset=>asset.file?.endsWith('.glb')).length;writeFileSync(cafeManifestPath,JSON.stringify(cafe,null,2)+'\n');
const audioMd='# 游戏音频素材：OpenGameArt，2026-10-27\n\n原始文件保存在本目录；游戏内文件、时长、处理、SHA-256 及使用位置详见 [素材索引与校验](../../../都市生活1.49x/都市生活1.497/docs/pixabay-asset-integration-1497-20261027/素材索引与校验.json)。作品页均标明 CC0；记录作者与来源供追溯。\n\n'+audio.map(a=>`- ${a.usage}：[${a.title} — ${a.author}](${a.page})；原始文件：${a.original}；SHA-256：${a.originalSha256}`).join('\n')+'\n';
writeFileSync(join(library,'素材来源与使用说明.md'),audioMd);
const modelMd=`# Pixabay 咖啡馆 3D 模型\n\n- 作品：[${model.title} — ${model.author}](${model.page})\n- 许可：[${model.license}](${model.licenseUrl})\n- 原始文件：咖啡壶_Gal-B_4797_原始.glb\n- SHA-256：${model.sha256}\n- 游戏用途：1.497 咖啡馆 3D 后吧台；游戏文件与原件一致。\n`;
writeFileSync(join(modelLibrary,'素材来源与使用说明.md'),modelMd);
writeFileSync(join(plantLibrary,'素材来源与使用说明.md'),`# Poly Haven 多肉盆栽\n\n- 作品：[${plant.title} — ${plant.author}](${plant.page})\n- 许可：[CC0](${plant.licenseUrl})\n- 原始目录：原始（glTF、几何数据及 1K 纹理）。\n- 游戏版：多肉盆栽_PolyHaven_1k_游戏版.glb；SHA-256：${plant.sha256}\n- 处理：${plant.processing}。用于 1.497 咖啡馆 3D 共享桌。\n`);
writeFileSync(join(audit,'素材来源与使用说明.md'),'# 1.497 新素材来源\n\n3 首音乐和 1 段音效来自 OpenGameArt，3D 咖啡壶来自 Pixabay，盆栽来自 Poly Haven。原始文件均保存在 G 盘素材库。完整来源、作者、许可、处理、哈希及实际用途见 [素材索引与校验](素材索引与校验.json)。\n\n'+audio.map(a=>`- ${a.usage}：[${a.title} — ${a.author}](${a.page})（CC0）。`).join('\n')+`\n- ${model.usage}：[${model.title} — ${model.author}](${model.page})（[Pixabay Content License](${model.licenseUrl})）。\n- ${plant.usage}：[${plant.title} — ${plant.author}](${plant.page})（[CC0](${plant.licenseUrl})）。\n`);
console.log(JSON.stringify({audio:audio.length,models:2,modelSha256:model.sha256,plantSha256:plant.sha256},null,2));
