import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import assert from 'node:assert/strict';

const out=path.resolve(process.env.LOADING_PORTABLE_EVIDENCE??'docs/bedside-tips-20261021');
process.env.LOADING_PORTABLE_EVIDENCE=out;
await import('./verify-author-tips-portable.mjs');
const file=path.join(out,'portable-verification.json'),report=JSON.parse(fs.readFileSync(file,'utf8'));
let shell='';
for await(const line of readline.createInterface({input:fs.createReadStream(report.artifact),crlfDelay:Infinity})){
  if(!line.startsWith('<script>globalThis.__urbanPortableAssets['))shell+=line+'\n';
}
const markers=['data-city-tip','data-city-tip-text','data-home-trash-flat','垃圾桶里的一张纸条','再翻一条','收起来','预计加载时间可能较长','long-wait'];
for(const marker of markers)assert(shell.includes(marker),'Missing bedside/loading update: '+marker);
report.bedsideTipMarkers=markers;
fs.writeFileSync(file,JSON.stringify(report,null,2));
console.log(JSON.stringify({bedsideTipMarkers:markers,sha256:report.sha256},null,2));
