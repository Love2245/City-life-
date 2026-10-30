import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import assert from 'node:assert/strict';

const out=path.resolve(process.env.LOADING_PORTABLE_EVIDENCE??'docs/loading-tips-author-20261021');
process.env.LOADING_PORTABLE_EVIDENCE=out;
await import('./verify-interior-portable.mjs');
const file=path.join(out,'portable-verification.json');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
const copy=JSON.parse(fs.readFileSync(path.join(out,'文案对照.json'),'utf8'));
let shell='';
for await(const line of readline.createInterface({input:fs.createReadStream(report.artifact),crlfDelay:Infinity})){
  if(!line.startsWith('<script>globalThis.__urbanPortableAssets['))shell+=line+'\n';
}
assert.equal(copy.length,46);
for(const row of copy)assert(shell.includes(row.text),`Author tip missing: ${row.number}`);
assert(!shell.includes('都市小知识占位'),'Placeholder tips are still in the portable');
report.authorTips=46;report.authorMinorCorrections=copy.filter(row=>row.changed).length;
report.placeholderTipsRemoved=true;
fs.writeFileSync(file,JSON.stringify(report,null,2));
console.log(JSON.stringify({authorTips:46,placeholderTipsRemoved:true,sha256:report.sha256},null,2));
