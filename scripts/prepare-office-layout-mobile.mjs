import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/office-layout-mobile-audio-1497-20261027'),before=join(audit,'before');
const record=join(audit,'before-sha256.json');if(existsSync(record))throw Error('Baseline already exists; do not overwrite it');
const files=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name),rel=relative(root,path).replaceAll('\\','/');if(e.isDirectory()){if(rel==='src/assets'||e.name==='node_modules')continue;walk(path);}else if(e.isFile())files.push(path);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));
for(const name of ['package.json','index.html','vite.config.ts','vite.portable.config.ts'])files.push(join(root,name));
function assets(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())assets(p);else if(e.isFile())files.push(p);}}
assets(join(root,'src/assets/mobile-stills/company'));
for(const f of ['src/assets/music/场所氛围/夜总会_深夜律动_Still.mp3','src/assets/music/场所氛围/清吧_深夜慢拍_Chills.mp3'])files.push(join(root,f));
const unique=[...new Set(files)];const entries=[];
for(const path of unique){const rel=relative(root,path).replaceAll('\\','/'),target=join(before,rel);mkdirSync(dirname(target),{recursive:true});copyFileSync(path,target);const sha256=createHash('sha256').update(readFileSync(path)).digest('hex');entries.push({path:rel,bytes:statSync(path).size,sha256});}
writeFileSync(record,JSON.stringify(entries,null,2));console.log(JSON.stringify({files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0)}));
