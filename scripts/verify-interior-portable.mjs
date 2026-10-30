import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import assert from 'node:assert/strict';

const out=path.resolve(process.env.LOADING_PORTABLE_EVIDENCE??'docs/facility-activities-20261021');
process.env.LOADING_PORTABLE_EVIDENCE=out;
// Reuse the existing streaming asset, GLB, syntax, version and publication checks.
await import('./verify-loading-portable.mjs');
const reportFile=path.join(out,'portable-verification.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
let shell='';
for await(const line of readline.createInterface({input:fs.createReadStream(report.artifact),crlfDelay:Infinity})){
  if(!line.startsWith('<script>globalThis.__urbanPortableAssets['))shell+=line+'\n';
}
const facilityMarkers=['cafe_croissant','cafe_bagel','home_sofa_relax','home_sofa_nap','_read_magazine','data-cafe-activity'];
for(const marker of facilityMarkers)assert(shell.includes(marker),`Missing facility update: ${marker}`);
report.facilityMarkers=facilityMarkers;
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({facilityMarkers,sha256:report.sha256,artifact:report.artifact},null,2));
