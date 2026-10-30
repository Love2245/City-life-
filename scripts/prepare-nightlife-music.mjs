import fs from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const evidence='docs/nightlife-audio-transition-1497-20261027',out='src/assets/music/场所氛围',sources=JSON.parse(fs.readFileSync(join(evidence,'music-sources.json'),'utf8'));
fs.mkdirSync(join(evidence,'music-originals'),{recursive:true});fs.mkdirSync(out,{recursive:true});
function command(name,args){const result=spawnSync(name,args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:120000});if(result.status!==0)throw Error(name+': '+result.stderr);return result;}
const report=[];let next=0;
await Promise.all([0,1,2].map(async()=>{while(next<sources.length){const source=sources[next++],raw=join(evidence,'music-originals',source.id+'.mp3');
  if(!source.verifiedPage||source.license!=='Pixabay Content License'||new URL(source.downloadUrl).hostname!=='cdn.pixabay.com')throw Error('Unverified source '+source.id);
  if(!fs.existsSync(raw)){const response=await fetch(source.downloadUrl,{signal:AbortSignal.timeout(60000)});if(!response.ok||!response.headers.get('content-type')?.includes('audio'))throw Error(source.id+' download '+response.status);fs.writeFileSync(raw,Buffer.from(await response.arrayBuffer()));}
  const original=fs.readFileSync(raw),file=source.label+'_'+source.id+'.mp3',path=join(out,file);
  command('ffmpeg',['-v','error','-y','-i',raw,'-t',String(source.maxSeconds),'-af','silenceremove=start_periods=1:start_duration=0.03:start_threshold=-65dB,loudnorm=I=-22:TP=-3:LRA=8,afade=t=in:st=0:d=0.04','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',path]);
  const probe=JSON.parse(command('ffprobe',['-v','error','-show_entries','format=duration:stream=channels,sample_rate','-of','json',path]).stdout),levels=command('ffmpeg',['-hide_banner','-i',path,'-af','volumedetect','-f','null','-']).stderr;
  const bytes=fs.readFileSync(path),row={...source,originalPath:raw.replaceAll('\\','/'),originalBytes:original.length,originalSha256:createHash('sha256').update(original).digest('hex'),path:path.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),duration:Number(probe.format.duration),channels:probe.streams[0].channels,sampleRate:Number(probe.streams[0].sample_rate),meanDb:Number(levels.match(/mean_volume: ([\d.-]+) dB/)[1]),peakDb:Number(levels.match(/max_volume: ([\d.-]+) dB/)[1])};
  if(row.peakDb>-2||row.duration<30)throw Error('Unexpected rendered music '+source.key);report.push(row);console.log(source.key+' '+row.duration+'s '+row.bytes+' bytes');
}}));
report.sort((a,b)=>sources.findIndex(s=>s.id===a.id)-sources.findIndex(s=>s.id===b.id));fs.writeFileSync(join(evidence,'music-manifest.json'),JSON.stringify(report,null,2));
const imports=report.map((r,i)=>`import track${i} from ${JSON.stringify('../'+r.path.slice(4)+'?url')};`).join('\n');
const catalogue=imports+"\nimport type {MusicFile} from './musicPlayer';\nimport type {NightlifeMusicId} from './nightlifeMusic';\nexport const VENUE_MUSIC={\n"+report.map((r,i)=>`  ${JSON.stringify(r.key)}:{id:${JSON.stringify(r.key)},url:track${i}},`).join('\n')+"\n} satisfies Record<NightlifeMusicId|'church'|'temple',MusicFile>;\n";
fs.writeFileSync('src/lib/venueMusicCatalogue.ts',catalogue);
fs.writeFileSync(join(evidence,'音乐来源与授权.md'),'# 场所音乐来源与授权\n\n本轮新增12首不同作品：夜总会与清吧各五套，教堂与寺庙各一套。素材作品页的Pixabay Content License已逐条核对，音频从官方公开CDN下载，作为游戏的一部分离线使用。发现索引仅用于定位公开下载URL，作品名、作者与许可以官方作品页核验记录为准；原网页文本和许可核验保存在music-primary-pages.txt、music-primary-license-checks.txt。\n\n已作长度整理、响度统一与格式转换；运行时由原播放器淡入淡出及循环。原始音乐和既有音乐文件保留。Content ID状态仅记录索引及作品页标记；如后续制作宣传视频，可据作品URL查询证书或处理平台识别。\n\n| 使用位置 | 作品与作者 | 许可 | 片段长度 |\n| --- | --- | --- | ---: |\n'+report.map(r=>'| '+r.label+' | ['+r.title+' — '+r.author+']('+r.sourceUrl+') | [Pixabay Content License]('+r.licenseUrl+') | '+r.duration.toFixed(1)+'秒 |').join('\n')+'\n\n原始及游戏文件的SHA-256、下载URL与加工结果见music-manifest.json。\n');
