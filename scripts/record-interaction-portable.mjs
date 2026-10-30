import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..'),file=join(root,'1.49.7.html'),source=readFileSync(join(root,'src/version.ts'),'utf8');
const revision=source.match(/export const REVISION = "([^"]+)"/)[1],needle=Buffer.from(revision),hash=createHash('sha256');
let tail=Buffer.alloc(0),found=false;for await(const chunk of createReadStream(file)){hash.update(chunk);const bytes=Buffer.concat([tail,chunk]);if(bytes.includes(needle))found=true;tail=bytes.subarray(Math.max(0,bytes.length-needle.length));}
assert(found,'Current revision missing from portable');const result={recordedAt:new Date().toISOString(),path:file,bytes:statSync(file).size,sha256:hash.digest('hex'),revision,embeddedRevisionFound:found};
writeFileSync(join(root,'docs/interaction-audio-1497-20261027/portable-run-input.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
