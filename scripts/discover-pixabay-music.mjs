import {writeFileSync} from 'node:fs';
const lookup='https://huggingface.co/datasets/Tefa0228/songs/resolve/main/dta.csv';
const response=await fetch(lookup);if(!response.ok)throw Error('Public catalogue lookup '+response.status);const source=await response.text();
function csv(line){const cells=[];let cell='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(cell);cell='';}else cell+=c;}cells.push(cell);return cells;}
const selected=[];const desired=new Set([354596,9867,12327,242100,253184,348267,242713,216043,164472,244539,347173,335077,310599,155926]);
const lines=source.split(/\r?\n/),header=csv(lines.shift()),groups={house:[],jazz:[],lounge:[],church:[],temple:[]};console.log(JSON.stringify({header,rows:lines.length}));
for(const line of lines){const cells=csv(line);if(cells.length!==header.length)continue;const row=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));if(desired.has(Number(row.Link?.match(/(\d+)\/$/)?.[1])))selected.push(row);const text=JSON.stringify(row).toLowerCase();for(const[key,pattern]of Object.entries({house:/deep.house|soft.house|house.music|techno|electro.house|dance.club/,jazz:/jazz|bossa/,lounge:/lounge|chill.piano|lofi/,church:/church|cathedral|organ|hymn|sacred/,temple:/zen|buddhist|temple|asian|chinese/})){if(pattern.test(text)&&groups[key].length<30&&!groups[key].some(x=>x.Autor===row.Autor))groups[key].push(row);}}
writeFileSync('docs/nightlife-audio-transition-1497-20261027/music-index-candidates.json',JSON.stringify({lookup,checkedAt:new Date().toISOString(),notice:'Discovery metadata only. Verify each selected title and licence against its official Pixabay page before importing the official CDN file.',groups},null,2));
for(const[key,rows]of Object.entries(groups))console.log(key+' '+JSON.stringify(rows.map(r=>({title:r.Titulo,author:r.Autor,id:r.Link.match(/(\d+)\/$/)?.[1],ai:r.IA,cid:r.ContentID}))));

writeFileSync('docs/nightlife-audio-transition-1497-20261027/selected-music-index.json',JSON.stringify(selected,null,2));console.log('Selected '+selected.length);
