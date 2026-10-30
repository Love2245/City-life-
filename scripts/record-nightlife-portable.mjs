import {createReadStream,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const audit='docs/nightlife-audio-transition-1497-20261027';
const source=readFileSync('src/version.ts','utf8'),revision=source.match(/export const REVISION = "([^"]+)"/)[1],version=source.match(/export const VERSION = "([^"]+)"/)[1];
const manifests=['docs/interaction-audio-1497-20261027/sound-manifest.json',audit+'/sfx-manifest.json',audit+'/music-manifest.json'];
const assets=manifests.flatMap(file=>JSON.parse(readFileSync(file,'utf8'))).map(asset=>({key:asset.key??asset.id,signature:Buffer.from(readFileSync(asset.path).toString('base64').slice(4096,4160)),found:false}));
const hash=createHash('sha256'),needle=Buffer.from(revision);let carry=Buffer.alloc(0),found=false;
for await(const chunk of createReadStream(version+'.html')){hash.update(chunk);const combined=Buffer.concat([carry,chunk]);if(!found&&combined.includes(needle))found=true;for(const asset of assets)if(!asset.found&&combined.includes(asset.signature))asset.found=true;carry=combined.subarray(-Math.max(needle.length,80));}
const report={createdAt:new Date().toISOString(),version,revision,bytes:statSync(version+'.html').size,sha256:hash.digest('hex'),embeddedRevisionFound:found,embeddedAudio:assets.map(({key,found})=>({key,found}))};
writeFileSync(audit+'/portable-run-input.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!found||assets.some(a=>!a.found))process.exitCode=1;
