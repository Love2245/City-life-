import fs from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Reproducible edit of the checked public HQ previews. No network requests or source music changes.
const evidence='docs/interaction-audio-1497-20261027',out='src/assets/sfx/日常交互';
const sources=JSON.parse(fs.readFileSync(join(evidence,'source-audio.json'),'utf8'));
const edits={door_open:['开门',1.22],door_close:['关门',1.1],fridge_open:['冰箱开门',1.35],fridge_close:['冰箱关门',1.1],drawer:['抽屉',1],keyboard:['键盘',1.4],mouse:['鼠标',.18],page:['翻页',.58],switch:['开关',.21],elevator:['电梯提示',.66],tap:['用水',1.6],pour:['倒水',1.4],cook:['烹饪',1.5],chop:['切菜',.44],cutlery:['餐具',.9],coins:['零钱',.67],steps:['脚步',1.35],cloth:['衣料',1]};
fs.mkdirSync(out,{recursive:true});const report=[];
function run(command,args,encoding){const result=spawnSync(command,args,{encoding,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});if(result.status!==0)throw Error(String(result.stderr));return result;}
for(const source of sources){
  if(source.error)throw Error(source.key+': '+source.error);
  if(!source.license.includes('/publicdomain/zero/1.0/'))throw Error('Unverified license');
  const[label,wanted]=edits[source.key],raw=run('ffmpeg',['-v','error','-i',source.path,'-ac','1','-ar','22050','-f','f32le','pipe:1']).stdout;
  const samples=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),duration=Math.min(wanted,samples.length/22050-.005),span=Math.floor(duration*22050);
  let start=0,best=-Infinity;const prefix=new Float64Array(samples.length+1);for(let i=0;i<samples.length;i++)prefix[i+1]=prefix[i]+samples[i]*samples[i];
  let from=0,to=samples.length-span;
  if(source.key==='cook'){from=Math.min(to,22050*2);to=Math.min(to,22050*6);}
  if(source.key==='fridge_close')from=Math.floor(to*.45);
  for(let i=from;i<=to;i+=Math.max(1,Math.floor(22050*.025))){const energy=prefix[i+span]-prefix[i];if(energy>best){best=energy;start=i;}}
  const base='aformat=sample_rates=44100:channel_layouts=mono,highpass=f=65,lowpass=f=14000';
  const originalStats=run('ffmpeg',['-hide_banner','-ss',(start/22050).toFixed(5),'-i',source.path,'-t',duration.toFixed(5),'-af',base+',volumedetect','-f','null','-'],'utf8').stderr;
  const originalMean=Number(originalStats.match(/mean_volume: ([\d.-]+) dB/)[1]),originalPeak=Number(originalStats.match(/max_volume: ([\d.-]+) dB/)[1]);
  let gainDb=Math.min(32,-23-originalMean,-4-originalPeak);
  const file=label+'_'+source.id+'.mp3',path=join(out,file),fade=Math.min(.035,duration/5);
  for(let attempt=0;attempt<2;attempt++){
    const filter=base+',volume='+gainDb.toFixed(4)+'dB,afade=t=in:st=0:d=0.004,afade=t=out:st='+(duration-fade).toFixed(4)+':d='+fade.toFixed(4);
    run('ffmpeg',['-v','error','-y','-ss',(start/22050).toFixed(5),'-i',source.path,'-t',duration.toFixed(5),'-af',filter,'-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','96k','-map_metadata','-1',path]);
    const check=run('ffmpeg',['-hide_banner','-i',path,'-af','volumedetect','-f','null','-'],'utf8').stderr,max=Number(check.match(/max_volume: ([\d.-]+) dB/)[1]);if(max<=-2)break;gainDb+=-3-max;
  }
  const bytes=fs.readFileSync(path),probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',path],'utf8').stdout);
  const stats=run('ffmpeg',['-hide_banner','-i',path,'-af','volumedetect','-f','null','-'],'utf8').stderr;
  const item={...source,file,path:path.replaceAll('\\','/'),label,trimStart:start/22050,trimDuration:duration,gainDb,duration:Number(probe.format.duration),channels:probe.streams[0].channels,sampleRate:Number(probe.streams[0].sample_rate),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meanDb:Number(stats.match(/mean_volume: ([\d.-]+) dB/)[1]),peakDb:Number(stats.match(/max_volume: ([\d.-]+) dB/)[1])};
  report.push(item);console.log(source.key+' '+duration.toFixed(2)+'s '+item.peakDb+'dB peak');
}
fs.writeFileSync(join(evidence,'sound-manifest.json'),JSON.stringify(report,null,2));
fs.writeFileSync(join(evidence,'音效来源与授权.md'),'# 交互音效来源与授权\n\n以下素材来自Freesound各作者公开页面标注的CC0 1.0声音。使用公开HQ预览制作游戏短音效，已裁剪、单声道转换、调整响度和淡入淡出；原始预览、许可页面快照及SHA-256保留在本目录。背景音乐未修改。\n\n| 用途 | 作者与原作品 | 许可 | 游戏片段 |\n| --- | --- | --- | --- |\n'+report.map(r=>'| '+r.label+' | ['+r.title+']('+r.url+') | [CC0 1.0]('+r.license+') | '+r.trimDuration.toFixed(2)+'秒 |').join('\n')+'\n');
