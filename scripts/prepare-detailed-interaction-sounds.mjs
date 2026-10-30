import fs from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const evidence='docs/nightlife-audio-transition-1497-20261027',out='src/assets/sfx/场景细化';
const sources=[
  ['shower','淋浴','jrssandoval',67162,1.8],
  ['sip','饮水','OwlStorm',320139,1.1],
  ['bottle_open','开瓶','GregoryC',334020,1.5],
  ['glass','酒杯','AardsReal',842180,1.2],
  ['car','汽车启动','snakebarney',138099,1.8],
  ['bike','自行车铃','13gkopeckak',378911,1.4],
  ['bus','公交发车','PostProdDog',607820,1.8],
  ['train','列车','Mihacappy',828151,1.8],
  ['cat_food','倒猫粮','16FPanskaRollerova_Adriena',498839,1.5],
  ['match','点香','HunteR4708',256803,.4],
].map(([key,label,author,id,wanted])=>({key,label,author,id,wanted,url:`https://freesound.org/people/${author}/sounds/${id}/`}));
fs.mkdirSync(join(evidence,'sfx-originals'),{recursive:true});fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
async function acquire(source){
  const htmlPath=join(evidence,'sfx-originals',source.id+'.html'),rawPath=join(evidence,'sfx-originals',source.id+'.mp3');
  let html;if(fs.existsSync(htmlPath))html=fs.readFileSync(htmlPath,'utf8');else{const response=await fetch(source.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(source.key+' page '+response.status);html=await response.text();fs.writeFileSync(htmlPath,html);}
  const license=html.match(/https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\//)?.[0];
  const preview=html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"<>\s]+-hq\.mp3/)?.[0];
  if(!license||!preview)throw Error('Missing checked CC0 license or HQ preview for '+source.key);
  const title=(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]??source.key).trim();
  if(!fs.existsSync(rawPath)){const response=await fetch(preview,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(source.key+' preview '+response.status);fs.writeFileSync(rawPath,Buffer.from(await response.arrayBuffer()));}
  return {...source,title,license,preview,rawPath,originalSha256:hash(fs.readFileSync(rawPath))};
}
const acquired=[];for(let i=0;i<sources.length;i+=2)acquired.push(...await Promise.all(sources.slice(i,i+2).map(acquire)));
fs.writeFileSync(join(evidence,'sfx-sources.json'),JSON.stringify(acquired,null,2));
function run(command,args,encoding){const r=spawnSync(command,args,{encoding,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});if(r.status!==0)throw Error(String(r.stderr));return r;}
const report=[];
for(const source of acquired){
  const raw=run('ffmpeg',['-v','error','-i',source.rawPath,'-ac','1','-ar','22050','-f','f32le','pipe:1']).stdout;
  const samples=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),duration=Math.min(source.wanted,samples.length/22050-.005),span=Math.floor(duration*22050);
  const prefix=new Float64Array(samples.length+1);for(let i=0;i<samples.length;i++)prefix[i+1]=prefix[i]+samples[i]*samples[i];
  let start=0,best=-Infinity;
  for(let i=0;i<=samples.length-span;i+=Math.floor(22050*.01)){const energy=prefix[i+span]-prefix[i];if(energy>best){best=energy;start=i;}}
  const base='aformat=sample_rates=44100:channel_layouts=mono,highpass=f=65,lowpass=f=14000';
  const stats=run('ffmpeg',['-hide_banner','-ss',(start/22050).toFixed(5),'-i',source.rawPath,'-t',duration.toFixed(5),'-af',base+',volumedetect','-f','null','-'],'utf8').stderr;
  let gainDb=Math.min(26,-23-Number(stats.match(/mean_volume: ([\d.-]+) dB/)[1]),-4-Number(stats.match(/max_volume: ([\d.-]+) dB/)[1]));
  const file=source.label+'_'+source.id+'.mp3',path=join(out,file),fade=Math.min(.035,duration/5);let finalStats;
  for(let attempt=0;attempt<3;attempt++){
    const filter=base+',volume='+gainDb.toFixed(4)+'dB,afade=t=in:st=0:d=0.004,afade=t=out:st='+(duration-fade).toFixed(4)+':d='+fade.toFixed(4);
    run('ffmpeg',['-v','error','-y','-ss',(start/22050).toFixed(5),'-i',source.rawPath,'-t',duration.toFixed(5),'-af',filter,'-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','96k','-map_metadata','-1',path]);
    finalStats=run('ffmpeg',['-hide_banner','-i',path,'-af','volumedetect','-f','null','-'],'utf8').stderr;
    const peak=Number(finalStats.match(/max_volume: ([\d.-]+) dB/)[1]);if(peak<=-2)break;gainDb+=-3-peak;
  }
  const bytes=fs.readFileSync(path),probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',path],'utf8').stdout);
  const item={...source,file,path:path.replaceAll('\\','/'),trimStart:start/22050,trimDuration:duration,gainDb,duration:Number(probe.format.duration),channels:probe.streams[0].channels,sampleRate:Number(probe.streams[0].sample_rate),bytes:bytes.length,sha256:hash(bytes),meanDb:Number(finalStats.match(/mean_volume: ([\d.-]+) dB/)[1]),peakDb:Number(finalStats.match(/max_volume: ([\d.-]+) dB/)[1])};
  if(item.peakDb>-2||!Number.isFinite(item.meanDb))throw Error('Invalid rendered audio '+source.key);report.push(item);console.log(source.key+' '+duration.toFixed(2)+'s '+item.peakDb+'dB peak');
}
fs.writeFileSync(join(evidence,'sfx-manifest.json'),JSON.stringify(report,null,2));
fs.writeFileSync('src/lib/detailedSoundCatalogue.ts',"import type {RecordedEffect} from './recordedEffects';\n"+report.map(r=>`import ${r.key} from ${JSON.stringify('../'+r.path.slice(4)+'?url')};`).join('\n')+'\n/** Checked CC0 HQ previews; source records: docs/nightlife-audio-transition-1497-20261027/sfx-manifest.json. */\nexport const DETAILED_SOUNDS={\n'+report.map(r=>`  ${r.key}:{url:${r.key},gain:${['car','bus','train','shower'].includes(r.key)?.65:.8},channel:'action',cooldownMs:180},`).join('\n')+'\n} satisfies Record<string,RecordedEffect>;\n');
fs.writeFileSync(join(evidence,'音效来源与授权.md'),'# 细分交互音效来源\n\n新增10段Freesound公开HQ预览，逐项核对源页面CC0 1.0许可；裁剪、单声道转换、响度校准及淡入淡出后内置游戏。原预览与许可页面保留于sfx-originals，SHA-256及处理参数见sfx-manifest.json。\n\n| 用途 | 原作品 | 许可 | 游戏片段 |\n| --- | --- | --- | --- |\n'+report.map(r=>`| ${r.label} | [${r.author} · ${r.id}](${r.url}) | [CC0 1.0](${r.license}) | ${r.trimDuration.toFixed(2)}秒 |`).join('\n')+'\n');
